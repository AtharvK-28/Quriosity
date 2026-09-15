/**
 * Shorter equivalents — PRD E7-S6.
 *
 * "Given a passing circuit, suggests a lower-gate-count equivalent and states
 * the saving." Every rewrite here is an exact identity (up to a global phase,
 * which is unmeasurable when the gates involved are uncontrolled), applied only
 * to gates that are adjacent on every wire they touch:
 *
 *   cancel     X·X, Y·Y, Z·Z, H·H, S·S†, T·T†, CX·CX, CZ·CZ, SWAP·SWAP, CCX·CCX
 *   merge      a run of phase gates (Z S S† T T† P RZ) into the one gate that
 *              makes the same total turn, or none when it is a full turn
 *   merge      RX·RX and RY·RY into one rotation
 *   drop       identity, and rotations by a multiple of 2π
 *   conjugate  H·X·H → Z, H·Z·H → X
 *
 * The result is then simulated beside the original and discarded unless the
 * two states agree. The identities do not need that check; a bug in applying
 * them would, and a tutor that suggests a "shorter equivalent" that is not
 * equivalent is worse than one that suggests nothing.
 */

import { GATES } from "../ir/gates";
import { inExecutionOrder } from "../ir/validate";
import { cloneCircuit, gateCount, gateQubits, nextGateId, type Circuit, type Gate, type GateType } from "../ir/types";
import { simulate } from "../sim/statevector";
import type { Finding } from "./rules";

const TAU = 2 * Math.PI;
const EPS = 1e-9;

export interface Optimisation {
  circuit: Circuit;
  before: number;
  after: number;
  /** One clause per rewrite, in the order applied. */
  steps: string[];
  /** Gate ids in the original circuit that a rewrite touched. */
  touched: string[];
}

/** Phase turn on |1⟩ for each diagonal single-qubit gate. RZ differs from P by a global phase only. */
const PHASE_TURN: Partial<Record<GateType, (g: Gate) => number>> = {
  z: () => Math.PI,
  s: () => Math.PI / 2,
  sdg: () => -Math.PI / 2,
  t: () => Math.PI / 4,
  tdg: () => -Math.PI / 4,
  p: (g) => g.params[0],
  rz: (g) => g.params[0],
};

const INVERSE_PAIRS: Array<[GateType, GateType]> = [
  ["s", "sdg"], ["t", "tdg"],
];

const SELF_CANCELLING: ReadonlySet<GateType> = new Set(["x", "y", "z", "h", "cx", "swap", "ccx"]);

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < EPS;
}

/** θ reduced into [0, period). */
function mod(theta: number, period: number): number {
  const r = ((theta % period) + period) % period;
  return near(r, period) ? 0 : r;
}

function where(g: Gate): string {
  const wires = gateQubits(g).map((q) => `q${q}`).join("–");
  return wires;
}

function glyph(t: GateType): string {
  return GATES[t].glyph.replace("×", "SWAP");
}

function sameWires(a: Gate, b: Gate): boolean {
  if (a.type === "cz" && b.type === "cz") {
    // CZ is symmetric: control and target are interchangeable.
    const wa = gateQubits(a).sort();
    const wb = gateQubits(b).sort();
    return wa[0] === wb[0] && wa[1] === wb[1];
  }
  if (a.type === "swap" && b.type === "swap") {
    const wa = [...a.targets].sort();
    const wb = [...b.targets].sort();
    return wa[0] === wb[0] && wa[1] === wb[1];
  }
  return (
    a.targets.length === b.targets.length &&
    a.controls.length === b.controls.length &&
    a.targets.every((q, i) => q === b.targets[i]) &&
    [...a.controls].sort().every((q, i) => q === [...b.controls].sort()[i])
  );
}

/** The phase gate with the fewest parameters that turns |1⟩ by θ. */
function cheapestPhase(theta: number, column: number, wire: number, preferRz: boolean): Gate | null {
  const t = mod(theta, TAU);
  if (near(t, 0)) return null;
  const named: Array<[GateType, number]> = [
    ["z", Math.PI], ["s", Math.PI / 2], ["sdg", 1.5 * Math.PI], ["t", Math.PI / 4], ["tdg", 1.75 * Math.PI],
  ];
  const hit = named.find(([, v]) => near(t, v));
  const base = { id: nextGateId(), targets: [wire], controls: [], column };
  if (hit) return { ...base, type: hit[0], params: [] };
  const value = t > Math.PI ? t - TAU : t;
  return { ...base, type: preferRz ? "rz" : "p", params: [value] };
}

/**
 * The gates acting on a wire, in time order. A gate "follows" another on a set
 * of wires when it is the very next gate on every one of them.
 */
function nextOnWires(ordered: Gate[], index: number, wires: number[]): number | null {
  let found: number | null = null;
  for (const w of wires) {
    let next = -1;
    for (let j = index + 1; j < ordered.length; j++) {
      if (gateQubits(ordered[j]).includes(w) || (ordered[j].type === "barrier" && spans(ordered[j], w))) {
        next = j;
        break;
      }
    }
    if (next < 0) return null;
    if (found === null) found = next;
    else if (found !== next) return null;
  }
  return found;
}

function spans(barrier: Gate, wire: number): boolean {
  return wire >= Math.min(...barrier.targets) && wire <= Math.max(...barrier.targets);
}

/** One rewrite, or null when nothing applies. Returns the new gate list. */
function rewriteOnce(ordered: Gate[]): { gates: Gate[]; step: string; touched: string[] } | null {
  for (let i = 0; i < ordered.length; i++) {
    const g = ordered[i];
    if (g.type === "barrier" || g.type === "measure" || g.type === "reset") continue;
    const spec = GATES[g.type];
    const wires = gateQubits(g);

    // Drop: identity, and rotations by a whole turn.
    if (g.type === "i") {
      return { gates: ordered.filter((_, k) => k !== i), step: `the identity on ${where(g)} does nothing`, touched: [g.id] };
    }
    if (spec.paramArity === 1 && ["rx", "ry", "rz", "p", "crx", "cry", "crz"].includes(g.type)) {
      // A controlled rotation by 2π is −I on the target, which is a relative
      // phase on the control and not removable. Only 4π is a true identity.
      const period = spec.controlArity > 0 ? 2 * TAU : TAU;
      if (near(mod(g.params[0], period), 0)) {
        return { gates: ordered.filter((_, k) => k !== i), step: `${glyph(g.type)} by ${g.params[0] === 0 ? "0" : "a full turn"} on ${where(g)} does nothing`, touched: [g.id] };
      }
    }

    const j = nextOnWires(ordered, i, wires);
    if (j === null) continue;
    const h = ordered[j];
    if (h.type === "barrier" || h.type === "measure" || h.type === "reset") continue;

    // Cancel identical self-inverse gates.
    if (h.type === g.type && (SELF_CANCELLING.has(g.type) || g.type === "cz") && sameWires(g, h)) {
      return {
        gates: ordered.filter((_, k) => k !== i && k !== j),
        step: `${glyph(g.type)} then ${glyph(g.type)} on ${where(g)} cancel`,
        touched: [g.id, h.id],
      };
    }

    // Cancel a gate against its inverse.
    if (wires.length === 1 && INVERSE_PAIRS.some(([a, b]) => (g.type === a && h.type === b) || (g.type === b && h.type === a))) {
      return {
        gates: ordered.filter((_, k) => k !== i && k !== j),
        step: `${glyph(g.type)} then ${glyph(h.type)} on ${where(g)} cancel`,
        touched: [g.id, h.id],
      };
    }

    // Merge a run of phase gates on one wire.
    if (wires.length === 1 && PHASE_TURN[g.type] && PHASE_TURN[h.type]) {
      const run = [i, j];
      let k = j;
      for (;;) {
        const n = nextOnWires(ordered, k, wires);
        if (n === null || !PHASE_TURN[ordered[n].type] || gateQubits(ordered[n]).length !== 1) break;
        run.push(n);
        k = n;
      }
      const gates = run.map((r) => ordered[r]);
      const total = gates.reduce((s, x) => s + PHASE_TURN[x.type]!(x), 0);
      const allRz = gates.every((x) => x.type === "rz");
      const merged = cheapestPhase(total, g.column, wires[0], allRz);
      const after = merged ? 1 : 0;
      if (after < run.length) {
        const label = gates.map((x) => glyph(x.type)).join("·");
        const out = ordered.filter((_, idx) => !run.includes(idx));
        if (merged) out.splice(i, 0, merged);
        return {
          gates: out,
          step: merged
            ? `${label} on ${where(g)} is one ${glyph(merged.type)}${merged.params.length ? `(${merged.params[0].toFixed(3)})` : ""}`
            : `${label} on ${where(g)} is a full turn, which does nothing`,
          touched: gates.map((x) => x.id),
        };
      }
    }

    // Merge same-axis rotations.
    if (wires.length === 1 && (g.type === "rx" || g.type === "ry") && h.type === g.type) {
      const total = g.params[0] + h.params[0];
      const out = ordered.filter((_, k) => k !== i && k !== j);
      if (!near(mod(total, TAU), 0)) {
        out.splice(i, 0, { ...g, id: nextGateId(), params: [total] });
      }
      return {
        gates: out,
        step: `two ${glyph(g.type)} rotations on ${where(g)} add into one`,
        touched: [g.id, h.id],
      };
    }

    // H·X·H → Z and H·Z·H → X.
    if (wires.length === 1 && g.type === "h" && (h.type === "x" || h.type === "z")) {
      const k = nextOnWires(ordered, j, wires);
      if (k !== null && ordered[k].type === "h") {
        const swapped: GateType = h.type === "x" ? "z" : "x";
        const out = ordered.filter((_, idx) => idx !== i && idx !== j && idx !== k);
        out.splice(i, 0, { ...h, id: nextGateId(), type: swapped, column: g.column });
        return {
          gates: out,
          step: `H·${glyph(h.type)}·H on ${where(g)} is just ${glyph(swapped)}`,
          touched: [g.id, h.id, ordered[k].id],
        };
      }
    }
  }
  return null;
}

/** States agree up to global phase, or, for mixed results, in every probability. */
function equivalent(a: Circuit, b: Circuit): boolean {
  const ra = simulate(a);
  const rb = simulate(b);
  if (ra.statevector && rb.statevector) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < ra.statevector.length / 2; k++) {
      const ar = ra.statevector[2 * k], ai = ra.statevector[2 * k + 1];
      const br = rb.statevector[2 * k], bi = rb.statevector[2 * k + 1];
      re += ar * br + ai * bi;
      im += ar * bi - ai * br;
    }
    return re * re + im * im > 1 - 1e-9;
  }
  if (ra.mixed !== rb.mixed) return false;
  return ra.probabilities.every((p, k) => Math.abs(p - rb.probabilities[k]) < 1e-9);
}

export function optimise(circuit: Circuit): Optimisation | null {
  if (circuit.gates.length > 200) return null;

  let ordered = inExecutionOrder(circuit.gates);
  const steps: string[] = [];
  const touched = new Set<string>();

  for (let guard = 0; guard < 100; guard++) {
    const r = rewriteOnce(ordered);
    if (!r) break;
    ordered = r.gates;
    steps.push(r.step);
    for (const id of r.touched) if (circuit.gates.some((g) => g.id === id)) touched.add(id);
  }

  if (steps.length === 0) return null;

  const shorter = cloneCircuit(circuit);
  shorter.gates = ordered.map((g) => ({ ...g, targets: [...g.targets], controls: [...g.controls], params: [...g.params] }));
  const before = gateCount(circuit);
  const after = gateCount(shorter);
  if (after >= before) return null;
  if (!equivalent(circuit, shorter)) return null;

  return { circuit: shorter, before, after, steps, touched: [...touched] };
}

/** The advisory finding the tutor offers after a pass. Never blocking. */
export function optimisationFinding(circuit: Circuit): Finding | null {
  const o = optimise(circuit);
  if (!o) return null;
  const saving = o.before - o.after;
  const reasons = o.steps.slice(0, 2).join("; ") + (o.steps.length > 2 ? `; and ${o.steps.length - 2} more` : "");
  const touchedGates = circuit.gates.filter((g) => o.touched.includes(g.id));

  return {
    ruleId: "O01_shorter_equivalent",
    misconception: null,
    severity: "advisory",
    gateIds: o.touched,
    qubits: [...new Set(touchedGates.flatMap(gateQubits))].sort((a, b) => a - b),
    columns: [...new Set(touchedGates.map((g) => g.column))].sort((a, b) => a - b),
    message: `This works in ${o.before} gates; the same state takes ${o.after}. ${capitalise(reasons)}. Saving: ${saving} gate${saving === 1 ? "" : "s"}.`,
    fix: {
      kind: "replace_circuit",
      circuit: o.circuit,
      label: `Use the ${o.after}-gate version`,
    },
  };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
