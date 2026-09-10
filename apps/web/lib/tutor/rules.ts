/**
 * The deterministic rule engine — TRD §4.3, lint rules L01–L13.
 *
 * This is the tutor's first and most important layer. Nine of the fourteen
 * catalogued misconceptions are detectable by a rule over the IR and the
 * simulator result, with no model call at all. That is what keeps the tutor
 * fast, free, and incapable of hallucinating physics on the paths learners
 * actually fail on.
 *
 * Two hard requirements from the docs, both of which this file exists to meet:
 *   - A diagnosis names the gate type, the wire index and the column, and says
 *     what to do. "Check your circuit" is a defect, not a fallback.
 *   - With TUTOR_ENABLED=false the product still teaches. Everything here runs
 *     locally in well under the 200ms budget.
 */

import { GATES, SELF_INVERSE } from "../ir/gates";
import { inExecutionOrder } from "../ir/validate";
import { gateQubits, operativeGates, type Circuit, type Gate, type GateType } from "../ir/types";
import { qubitState, separability } from "../sim/analysis";
import { simulate, bitstring, type SimResult } from "../sim/statevector";
import { grade as gradeAgainst, type GradeResult, type Target } from "../grade/fidelity";

export type MisconceptionId =
  | "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7"
  | "M8" | "M9" | "M10" | "M11" | "M12" | "M13" | "M14";

export type SuggestedFix =
  | { kind: "add_gate"; type: GateType; targets: number[]; controls: number[]; params: number[]; column: number; label: string }
  | { kind: "remove_gate"; gateId: string; label: string }
  | { kind: "swap_control_target"; gateId: string; label: string }
  | { kind: "replace_gate"; gateId: string; type: GateType; label: string };

export interface Finding {
  ruleId: string;
  misconception: MisconceptionId | null;
  /** Blocking findings explain a failure. Advisory ones are offered after a pass. */
  severity: "blocking" | "advisory";
  /** Gate ids the canvas should highlight. This is what "show me" points at. */
  gateIds: string[];
  qubits: number[];
  columns: number[];
  /** The diagnosis. Sentence case, specific, ≤60 words, never apologetic. */
  message: string;
  fix?: SuggestedFix;
}

export interface DiagnosisContext {
  circuit: Circuit;
  result: SimResult;
  target?: Target;
  grade?: GradeResult;
  /** How many times this node has been attempted. Gates solution disclosure. */
  attempts?: number;
  /** Noise level in play, 0–1. Enables L13. */
  noiseLevel?: number;
}

/* -- Entry point ------------------------------------------------------------ */

/**
 * Runs every rule and returns findings ranked so the most useful correction is
 * first. The tutor shows ONE correction at a time — a learner handed a list of
 * five problems fixes none of them.
 */
export function diagnose(ctx: DiagnosisContext): Finding[] {
  const rules = [
    L01_no_entangler,
    L04_global_phase_only,
    L12_relative_phase_ignored,
    L07_control_target_swapped,
    L03_order_inverted,
    L05_measure_then_coherent,
    L10_h_without_purpose,
    L02_redundant_pair,
    L09_unmeasured_result,
    L08_idle_qubit,
    L11_reduced_state_mixed,
    L13_depth_vs_noise,
    L06_grover_iterations,
  ];

  const findings: Finding[] = [];
  for (const rule of rules) {
    try {
      const f = rule(ctx);
      if (f) findings.push(...(Array.isArray(f) ? f : [f]));
    } catch {
      // A rule that throws must never take the tutor down with it. The next
      // rule, or the generic fallback, still gives the learner something.
    }
  }

  // Blocking findings first; among those, the order the rules were listed in,
  // which is roughly "most likely to be the actual problem".
  return findings.sort((a, b) => rank(a) - rank(b));
}

function rank(f: Finding): number {
  return f.severity === "blocking" ? 0 : 1;
}

/**
 * The single best thing to say right now. Falls back to a partial-credit
 * reading of the histogram, which is still specific — it names the bar that is
 * wrong — rather than to "something is off".
 */
export function primaryDiagnosis(ctx: DiagnosisContext): Finding | null {
  const blocking = diagnose(ctx).filter((f) => f.severity === "blocking");
  if (blocking.length > 0) return blocking[0];
  if (ctx.grade && !ctx.grade.passed) return distributionGap(ctx);
  return null;
}

/* -- Shared helpers --------------------------------------------------------- */

/** Wires touched by a gate acting on more than one wire. */
function multiQubitGates(c: Circuit): Gate[] {
  return operativeGates(c).filter((g) => gateQubits(g).length > 1);
}

/** Marginal P(qubit = 1) for a distribution over 2ⁿ basis states. */
function marginals(p: Float64Array, n: number): number[] {
  const out = new Array(n).fill(0);
  for (let k = 0; k < p.length; k++) {
    for (let q = 0; q < n; q++) if ((k >> q) & 1) out[q] += p[k];
  }
  return out;
}

/**
 * Does this distribution factorise into independent wires? A target that does
 * not factorise cannot be reached without a gate that links wires — which is
 * the whole basis of L01, and it is a test the learner runs by hand in the
 * lesson before the tutor ever runs it for them.
 */
function targetIsCorrelated(target: Target): { correlated: boolean; qubits: number } {
  const n = target.qubits;
  if (n < 2) return { correlated: false, qubits: n };

  const p =
    target.kind === "distribution"
      ? target.probabilities
      : probsFromAmplitudes(target.amplitudes);

  const m = marginals(p, n);
  let maxDev = 0;
  for (let k = 0; k < p.length; k++) {
    let prod = 1;
    for (let q = 0; q < n; q++) prod *= ((k >> q) & 1) ? m[q] : 1 - m[q];
    maxDev = Math.max(maxDev, Math.abs(prod - p[k]));
  }
  return { correlated: maxDev > 1e-6, qubits: n };
}

function probsFromAmplitudes(a: Float64Array): Float64Array {
  const p = new Float64Array(a.length / 2);
  for (let k = 0; k < p.length; k++) p[k] = a[2 * k] ** 2 + a[2 * k + 1] ** 2;
  return p;
}

/** Wires that are in a genuine superposition — pure, but not a definite 0 or 1. */
function superposedWires(result: SimResult): number[] {
  const out: number[] = [];
  for (let q = 0; q < result.qubits; q++) {
    const s = qubitState(result.branches, result.qubits, q);
    if (!s.entangled && Math.abs(s.z) < 1 - 1e-6) out.push(q);
  }
  return out;
}

function lastColumn(c: Circuit): number {
  return c.gates.reduce((m, g) => Math.max(m, g.column), -1);
}

function wire(q: number): string {
  return `q${q}`;
}

/* ===========================================================================
   L01 — no entangler
   The target is correlated, and the circuit contains nothing that could
   correlate anything. This is the demo's money shot.
   Misconception M8: "CNOT copies a qubit."
   ======================================================================== */

function L01_no_entangler(ctx: DiagnosisContext): Finding | null {
  const { circuit, result, target, grade } = ctx;
  if (!target || grade?.passed) return null;
  if (circuit.qubits < 2) return null;

  const { correlated } = targetIsCorrelated(target);
  if (!correlated) return null;
  if (multiQubitGates(circuit).length > 0) return null;

  const superposed = superposedWires(result);
  const control = superposed[0] ?? 0;
  const targetWire = [...Array(circuit.qubits).keys()].find((q) => q !== control) ?? 1;

  const message =
    superposed.length > 0
      ? `${wire(control)} is in superposition, but ${wire(control)} and ${wire(targetWire)} are still separable — every outcome is independent. Add a CNOT with ${wire(control)} as control and ${wire(targetWire)} as target.`
      : `Nothing in this circuit links the wires, so ${wire(control)} and ${wire(targetWire)} cannot end up correlated. Put ${wire(control)} in superposition with H, then add a CNOT controlled by ${wire(control)}.`;

  return {
    ruleId: "L01_no_entangler",
    misconception: "M8",
    severity: "blocking",
    gateIds: [],
    qubits: [control, targetWire],
    columns: [lastColumn(circuit) + 1],
    message,
    fix: {
      kind: "add_gate",
      type: "cx",
      targets: [targetWire],
      controls: [control],
      params: [],
      column: lastColumn(circuit) + 1,
      label: `Add CNOT · ${wire(control)} → ${wire(targetWire)}`,
    },
  };
}

/* ===========================================================================
   L04 — global phase only
   The state is right, and differs from the reference by a phase nobody could
   measure. This PASSES, and the finding is the explanation for why.
   Misconception M5: "Global phase matters."
   ======================================================================== */

function L04_global_phase_only(ctx: DiagnosisContext): Finding | null {
  const { circuit, result } = ctx;
  const ops = operativeGates(circuit);
  if (ops.length === 0 || ops.length > 30) return null;
  if (!result.statevector) return null;

  // The honest test is a counterfactual: remove one gate and see whether the
  // observable state moves at all. Because the simulator already normalises
  // global phase (TRD §6.2), a gate whose removal leaves the normalised state
  // identical contributed nothing any measurement could ever detect.
  //
  // This covers both halves of misconception M5 in one rule — the Z added to
  // |0⟩ that does literally nothing, and the gate that only rotates the overall
  // phase — and unlike comparing amplitudes it can name the gate.
  for (const g of ops) {
    if (g.type === "measure" || g.type === "reset") continue;

    const without: Circuit = { ...circuit, gates: circuit.gates.filter((x) => x.id !== g.id) };
    let reduced;
    try {
      reduced = simulate(without);
    } catch {
      continue;
    }
    if (!reduced.statevector) continue;
    if (!sameState(reduced.statevector, result.statevector)) continue;

    const s = GATES[g.type];
    const w = g.targets[0];
    return {
      ruleId: "L04_global_phase_only",
      misconception: "M5",
      severity: "advisory",
      gateIds: [g.id],
      qubits: [w],
      columns: [g.column],
      message: `The ${s.name} on ${wire(w)} in column ${g.column} leaves the state physically unchanged — removing it gives the same measurement statistics in every basis. A phase applied to the whole state is undetectable; only a phase applied to part of it does anything.`,
      fix: { kind: "remove_gate", gateId: g.id, label: `Remove the ${s.glyph} on ${wire(w)}` },
    };
  }

  // The other half: the learner's state matches a target that was itself
  // written with an overall phase. Fidelity ignores it, so this passes — and
  // the finding is the explanation for why it passed rather than failing.
  if (ctx.grade?.passed && ctx.grade.globalPhaseOnly) {
    return {
      ruleId: "L04_global_phase_only",
      misconception: "M5",
      severity: "advisory",
      gateIds: [],
      qubits: [],
      columns: [],
      message:
        "Your state differs from the reference by an overall phase. No measurement can detect that difference, so the two are the same physical state. It passes — and that is exactly why grading uses fidelity rather than comparing amplitudes.",
    };
  }
  return null;
}

/** Two normalised state vectors equal to within simulator tolerance. */
function sameState(a: Float64Array, b: Float64Array, tol = 1e-9): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > tol) return false;
  }
  return true;
}

/* ===========================================================================
   L12 — relative phase ignored
   |−⟩ submitted where |+⟩ was wanted, or the reverse. Both read 50/50 in Z, so
   the learner sees a correct histogram and a failing grade.
   Misconception M6: "Relative phase does not matter."
   ======================================================================== */

function L12_relative_phase_ignored(ctx: DiagnosisContext): Finding | null {
  const { result, target, grade } = ctx;
  if (!target || grade?.passed || target.kind !== "statevector") return null;
  if (!result.statevector) return null;

  const targetP = probsFromAmplitudes(target.amplitudes);
  let distributionMatches = true;
  for (let k = 0; k < targetP.length; k++) {
    if (Math.abs(targetP[k] - result.probabilities[k]) > 1e-6) {
      distributionMatches = false;
      break;
    }
  }
  // Same outcomes, wrong state: the only thing left that can differ is phase.
  if (!distributionMatches) return null;

  const wires: number[] = [];
  for (let q = 0; q < result.qubits; q++) {
    const s = qubitState(result.branches, result.qubits, q);
    if (!s.entangled && Math.abs(s.z) < 1 - 1e-6) wires.push(q);
  }
  const q = wires[0] ?? 0;

  return {
    ruleId: "L12_relative_phase_ignored",
    misconception: "M6",
    severity: "blocking",
    gateIds: [],
    qubits: wires,
    columns: [],
    message: `The odds are right — every outcome has the probability the target asks for. What differs is the relative phase on ${wire(q)}. Both states read 50/50 here, but apply H to each and they give opposite certainties. Add a Z on ${wire(q)} to flip the sign.`,
    fix: {
      kind: "add_gate",
      type: "z",
      targets: [q],
      controls: [],
      params: [],
      column: lastColumn(ctx.circuit) + 1,
      label: `Add Z on ${wire(q)}`,
    },
  };
}

/* ===========================================================================
   L07 — control and target swapped
   The circuit would pass if one two-qubit gate had its control and target
   exchanged. Extremely common, and invisible unless you say it out loud.
   ======================================================================== */

function L07_control_target_swapped(ctx: DiagnosisContext): Finding | null {
  const { circuit, target, grade } = ctx;
  if (!target || grade?.passed) return null;

  const candidates = operativeGates(circuit).filter(
    (g) => g.controls.length === 1 && g.targets.length === 1,
  );

  for (const g of candidates) {
    const swapped: Circuit = {
      ...circuit,
      gates: circuit.gates.map((x) =>
        x.id === g.id ? { ...x, controls: [...x.targets], targets: [...x.controls] } : x,
      ),
    };
    if (wouldPass(swapped, target)) {
      const s = GATES[g.type];
      return {
        ruleId: "L07_control_target_swapped",
        misconception: null,
        severity: "blocking",
        gateIds: [g.id],
        qubits: [g.controls[0], g.targets[0]],
        columns: [g.column],
        message: `The ${s.name} in column ${g.column} has its control on ${wire(g.controls[0])} and its target on ${wire(g.targets[0])}. Exchange them — control on ${wire(g.targets[0])}, target on ${wire(g.controls[0])} — and this circuit reaches the target.`,
        fix: { kind: "swap_control_target", gateId: g.id, label: "Exchange control and target" },
      };
    }
  }
  return null;
}

/* ===========================================================================
   L03 — order inverted
   The circuit passes under a transposition of two adjacent columns. Gate order
   is not decoration, and this is the cohort-level error the instructor heatmap
   is built to surface.
   ======================================================================== */

function L03_order_inverted(ctx: DiagnosisContext): Finding | null {
  const { circuit, target, grade } = ctx;
  if (!target || grade?.passed) return null;

  const ordered = inExecutionOrder(operativeGates(circuit));
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    if (a.column === b.column) continue;
    // Only worth reporting when the two gates actually share a wire; otherwise
    // their order never mattered in the first place.
    const shared = gateQubits(a).filter((q) => gateQubits(b).includes(q));
    if (shared.length === 0) continue;

    const swapped: Circuit = {
      ...circuit,
      gates: circuit.gates.map((x) => {
        if (x.id === a.id) return { ...x, column: b.column };
        if (x.id === b.id) return { ...x, column: a.column };
        return x;
      }),
    };
    if (wouldPass(swapped, target)) {
      return {
        ruleId: "L03_order_inverted",
        misconception: null,
        severity: "blocking",
        gateIds: [a.id, b.id],
        qubits: shared,
        columns: [a.column, b.column],
        message: `Both gates are the right ones — they run in the wrong order. ${GATES[b.type].name} on ${wire(gateQubits(b)[0])} has to come before ${GATES[a.type].name}, because ${wire(shared[0])} must already be in superposition when the second gate reads it.`,
      };
    }
  }
  return null;
}

/* ===========================================================================
   L05 — coherent gate after a measurement on the same wire
   Misconception M7: "Measurement is just reading the value."
   ======================================================================== */

function L05_measure_then_coherent(ctx: DiagnosisContext): Finding | null {
  const ordered = inExecutionOrder(ctx.circuit.gates);
  for (const m of ordered) {
    if (m.type !== "measure") continue;
    const w = m.targets[0];
    const after = ordered.find(
      (g) =>
        g.column > m.column &&
        g.type !== "barrier" &&
        g.type !== "measure" &&
        g.type !== "reset" &&
        gateQubits(g).includes(w),
    );
    if (!after) continue;

    return {
      ruleId: "L05_measure_then_coherent",
      misconception: "M7",
      severity: "blocking",
      gateIds: [m.id, after.id],
      qubits: [w],
      columns: [m.column, after.column],
      message: `The measurement on ${wire(w)} in column ${m.column} runs before the ${GATES[after.type].name} in column ${after.column}. Measuring is not reading — it destroys the superposition it observes, so nothing after it on ${wire(w)} can interfere. Move the measurement to the end.`,
      fix: { kind: "remove_gate", gateId: m.id, label: `Remove the early measurement on ${wire(w)}` },
    };
  }
  return null;
}

/* ===========================================================================
   L10 — H applied then immediately undone
   Misconception M1: "A qubit is a coin that is secretly heads or tails."
   ======================================================================== */

function L10_h_without_purpose(ctx: DiagnosisContext): Finding | null {
  const pair = adjacentIdenticalPair(ctx.circuit, "h");
  if (!pair) return null;
  const [a, b] = pair;
  return {
    ruleId: "L10_h_without_purpose",
    misconception: "M1",
    severity: "advisory",
    gateIds: [a.id, b.id],
    qubits: [a.targets[0]],
    columns: [a.column, b.column],
    message: `Two Hadamards in a row on ${wire(a.targets[0])} — columns ${a.column} and ${b.column} — return the qubit exactly where it started. A coin flipped twice is still random; a qubit is not, and that is the difference the two of them together demonstrate. Remove both, or put something between them.`,
    fix: { kind: "remove_gate", gateId: b.id, label: "Remove the second H" },
  };
}

/* ===========================================================================
   L02 — redundant adjacent self-inverse pair
   ======================================================================== */

function L02_redundant_pair(ctx: DiagnosisContext): Finding | null {
  for (const type of SELF_INVERSE) {
    if (type === "h") continue; // L10 owns the H case and says more about it
    const pair = adjacentIdenticalPair(ctx.circuit, type);
    if (!pair) continue;
    const [a, b] = pair;
    return {
      ruleId: "L02_redundant_pair",
      misconception: null,
      severity: "advisory",
      gateIds: [a.id, b.id],
      qubits: [a.targets[0]],
      columns: [a.column, b.column],
      message: `Two ${GATES[type].name} gates in a row on ${wire(a.targets[0])} cancel each other out. Removing both leaves the state unchanged and the circuit two gates shorter.`,
      fix: { kind: "remove_gate", gateId: b.id, label: `Remove the second ${GATES[type].glyph}` },
    };
  }
  return null;
}

/** Two identical self-inverse gates on one wire with nothing between them. */
function adjacentIdenticalPair(c: Circuit, type: GateType): [Gate, Gate] | null {
  const byWire = new Map<number, Gate[]>();
  for (const g of inExecutionOrder(operativeGates(c))) {
    if (g.targets.length !== 1 || g.controls.length > 0) continue;
    const w = g.targets[0];
    if (!byWire.has(w)) byWire.set(w, []);
    byWire.get(w)!.push(g);
  }
  for (const gates of byWire.values()) {
    for (let i = 0; i < gates.length - 1; i++) {
      if (gates[i].type === type && gates[i + 1].type === type) {
        return [gates[i], gates[i + 1]];
      }
    }
  }
  return null;
}

/* ===========================================================================
   L09 — a wire carrying the answer is never measured
   ======================================================================== */

function L09_unmeasured_result(ctx: DiagnosisContext): Finding | null {
  const { circuit } = ctx;
  const measured = new Set(
    circuit.gates.filter((g) => g.type === "measure").map((g) => g.targets[0]),
  );
  if (measured.size === 0) return null; // no measurements at all is a valid circuit

  const touched = new Set<number>();
  for (const g of operativeGates(circuit)) {
    if (g.type === "measure") continue;
    for (const q of gateQubits(g)) touched.add(q);
  }

  const missing = [...touched].filter((q) => !measured.has(q)).sort((a, b) => a - b);
  if (missing.length === 0) return null;

  return {
    ruleId: "L09_unmeasured_result",
    misconception: null,
    severity: "advisory",
    gateIds: [],
    qubits: missing,
    columns: [],
    message: `${missing.map(wire).join(" and ")} ${missing.length === 1 ? "has" : "have"} gates but no measurement, so ${missing.length === 1 ? "it" : "they"} won't appear in the histogram. Add a measurement if you want to read ${missing.length === 1 ? "it" : "them"}.`,
    fix: {
      kind: "add_gate",
      type: "measure",
      targets: [missing[0]],
      controls: [],
      params: [],
      column: lastColumn(circuit) + 1,
      label: `Measure ${wire(missing[0])}`,
    },
  };
}

/* ===========================================================================
   L08 — a declared qubit does nothing at all
   ======================================================================== */

function L08_idle_qubit(ctx: DiagnosisContext): Finding | null {
  const { circuit } = ctx;
  if (circuit.qubits < 2) return null;
  const used = new Set<number>();
  for (const g of circuit.gates) for (const q of gateQubits(g)) used.add(q);

  const idle = [...Array(circuit.qubits).keys()].filter((q) => !used.has(q));
  if (idle.length === 0) return null;

  return {
    ruleId: "L08_idle_qubit",
    misconception: null,
    severity: "advisory",
    gateIds: [],
    qubits: idle,
    columns: [],
    message: `${idle.map(wire).join(", ")} ${idle.length === 1 ? "has" : "have"} no gates and ${idle.length === 1 ? "stays" : "stay"} at |0⟩ throughout. That doubles the number of outcomes in the histogram without adding anything. Remove the wire if you don't need it.`,
  };
}

/* ===========================================================================
   L11 — Bloch view opened on a wire with no individual state
   Misconception M4: "The Bloch sphere works for two qubits."
   ======================================================================== */

function L11_reduced_state_mixed(ctx: DiagnosisContext): Finding | null {
  const { result } = ctx;
  const sep = separability(result);
  if (sep.entangledQubits.length === 0) return null;

  const [a, b] = sep.entangledQubits;
  return {
    ruleId: "L11_reduced_state_mixed",
    misconception: "M4",
    severity: "advisory",
    gateIds: [],
    qubits: sep.entangledQubits,
    columns: [],
    message: `${wire(a)}'s Bloch vector sits at the centre of the sphere, and that is not a bug. ${b !== undefined ? `${wire(a)} and ${wire(b)} have` : `${wire(a)} has`} no individual state to draw — only the pair does. The state-vector table is the view that still works here.`,
  };
}

/* ===========================================================================
   L13 — depth is what noise costs you
   Misconception M13: "Noise is a bit flip added at the end."
   ======================================================================== */

function L13_depth_vs_noise(ctx: DiagnosisContext): Finding | null {
  const { circuit, grade, noiseLevel } = ctx;
  if (!noiseLevel || noiseLevel <= 0) return null;
  if (!grade || grade.fidelity >= 0.9) return null;

  const depth = lastColumn(circuit) + 1;
  const twoQubit = multiQubitGates(circuit).length;
  if (depth < 3) return null;

  return {
    ruleId: "L13_depth_vs_noise",
    misconception: "M13",
    severity: "advisory",
    gateIds: [],
    qubits: [],
    columns: [],
    message: `Fidelity is ${grade.fidelity.toFixed(3)} at this noise level, across a depth of ${depth} with ${twoQubit} two-qubit gate${twoQubit === 1 ? "" : "s"}. Error accumulates with depth rather than arriving at the end — a shorter circuit reaching the same state reads better. Try the ideal setting to see the gap.`,
  };
}

/* ===========================================================================
   L06 — Grover iteration count
   Misconception M11: "More iterations means a better answer."
   ======================================================================== */

function L06_grover_iterations(ctx: DiagnosisContext): Finding | null {
  const { circuit } = ctx;
  const n = circuit.qubits;
  if (n < 2) return null;

  // A Grover structure shows up as repeated diffusion blocks: H on every wire,
  // then a multi-controlled phase, then H again. Counting the repeats is enough
  // to compare against the optimum without needing to identify the oracle.
  const diffusions = countDiffusionBlocks(circuit);
  if (diffusions < 2) return null;

  const optimal = Math.floor((Math.PI / 4) * Math.sqrt(2 ** n));
  if (diffusions <= optimal) return null;

  return {
    ruleId: "L06_grover_iterations",
    misconception: "M11",
    severity: "blocking",
    gateIds: [],
    qubits: [],
    columns: [],
    message: `This runs ${diffusions} amplitude-amplification rounds where ${optimal} is the optimum for ${2 ** n} items. Amplification is a rotation, not an accumulation — past ⌊(π/4)√N⌋ it turns past the answer and the success probability falls again.`,
  };
}

function countDiffusionBlocks(c: Circuit): number {
  const byColumn = new Map<number, Gate[]>();
  for (const g of operativeGates(c)) {
    if (!byColumn.has(g.column)) byColumn.set(g.column, []);
    byColumn.get(g.column)!.push(g);
  }
  let blocks = 0;
  for (const [, gates] of [...byColumn.entries()].sort((a, b) => a[0] - b[0])) {
    const allH = gates.length === c.qubits && gates.every((g) => g.type === "h");
    if (allH) blocks += 1;
  }
  return Math.floor(blocks / 2);
}

/* -- Partial-credit fallback ------------------------------------------------- */

/**
 * When no rule fires but the circuit still failed, say which outcome is wrong
 * and by how much. This is the floor of the tutor's quality: never generic,
 * always a specific bar on the histogram the learner is looking at.
 */
function distributionGap(ctx: DiagnosisContext): Finding {
  const { grade, result } = ctx;
  const worst = grade?.worstBasis;
  const fidelity = grade?.fidelity ?? 0;

  if (!worst) {
    return {
      ruleId: "F00_fidelity_gap",
      misconception: null,
      severity: "blocking",
      gateIds: [],
      qubits: [],
      columns: [],
      message: `Fidelity ${fidelity.toFixed(3)}. The state this circuit produces isn't the target one yet.`,
    };
  }

  const tPct = Math.round(worst.target * 100);
  const aPct = Math.round(worst.actual * 100);
  const direction = worst.actual > worst.target ? "too much" : "not enough";

  return {
    ruleId: "F00_fidelity_gap",
    misconception: null,
    severity: "blocking",
    gateIds: [],
    qubits: [],
    columns: [],
    message: `Fidelity ${fidelity.toFixed(3)}. The gap is on |${worst.bits}⟩ — the target wants ${tPct}% there and this circuit gives ${aPct}%, so there is ${direction} amplitude on that outcome.`,
  };
}

/* -- Counterfactual evaluation ---------------------------------------------- */

/**
 * Would this modified circuit pass? Rules L03 and L07 are counterfactual by
 * nature: they claim a specific single edit fixes the circuit, and the only
 * honest way to make that claim is to run the edit and check.
 */
function wouldPass(circuit: Circuit, target: Target): boolean {
  try {
    return gradeAgainst(simulate(circuit), target).passed;
  } catch {
    // An edit that produces an invalid circuit simply is not the fix.
    return false;
  }
}

/* -- Presentation ----------------------------------------------------------- */

/** Human-readable name for a misconception, for the instructor heatmap. */
export const MISCONCEPTIONS: Record<MisconceptionId, string> = {
  M1: "A qubit is a coin that is secretly heads or tails",
  M2: "Superposition tries every answer in parallel",
  M3: "Entanglement transmits information",
  M4: "The Bloch sphere works for an entangled qubit",
  M5: "Global phase is observable",
  M6: "Relative phase does not matter",
  M7: "Measurement is just reading the value",
  M8: "CNOT copies a qubit",
  M9: "A controlled gate does nothing to the control",
  M10: "Bitstring order is obvious",
  M11: "More Grover iterations means a better answer",
  M12: "Grover is an exponential speedup",
  M13: "Noise is a bit flip added at the end",
  M14: "Quantum computers replace classical computers",
};

export function bitsToKet(bits: string): string {
  return `|${bits}⟩`;
}

export { bitstring };
