/**
 * State-vector simulator.
 *
 * TRD §6.2 fixes the platform convention: LITTLE-ENDIAN, matching Qiskit.
 * Basis index `k` has bit `j` — that is `(k >> j) & 1` — equal to the state of
 * qubit `j`. Bitstrings print as q_{n-1} … q_1 q_0 and every axis says so.
 * Endianness is handled here and nowhere else.
 *
 * Amplitudes live in a flat Float64Array of length 2·2ⁿ, interleaved re/im, so
 * a gate application is a tight loop with no allocation.
 *
 * Mid-circuit measurement is exact rather than approximated. A measurement that
 * is followed by coherent work splits the state into a weighted ensemble of
 * pure branches; unitaries then apply to each branch. For the overwhelmingly
 * common case — no mid-circuit measurement — there is exactly one branch and
 * this is an ordinary pure-state simulation. Misconception M7 depends on this
 * being right, so it is not faked.
 */

import { GATES, type Mat2 } from "../ir/gates";
import { inExecutionOrder } from "../ir/validate";
import { circuitDepth, gateQubits, type Circuit, type Gate } from "../ir/types";

/** One pure state in the ensemble, carrying its classical probability. */
export interface Branch {
  weight: number;
  amps: Float64Array;
}

export interface StepSnapshot {
  /** Column index this snapshot is the state *after*. -1 is the initial state. */
  column: number;
  branches: Branch[];
}

export interface SimResult {
  qubits: number;
  clbits: number;
  /** Ensemble after the whole circuit. */
  branches: Branch[];
  /** State after each column, for the scrubber. Index 0 is before any gate. */
  steps: StepSnapshot[];
  /** Exact outcome probabilities over 2ⁿ basis states. Always valid. */
  probabilities: Float64Array;
  /** True when mid-circuit measurement or reset left the state mixed. */
  mixed: boolean;
  /** The single pure state, when there is one. Null if `mixed`. */
  statevector: Float64Array | null;
  /** Wires carrying a measurement, in classical-bit order. */
  measuredQubits: number[];
  durationMs: number;
}

/** Ceiling for in-browser simulation. Above this the UI blocks before running. */
export const MAX_SIM_QUBITS = 16;
/** Beyond this many branches the ensemble is pruned by weight. */
const MAX_BRANCHES = 64;
const WEIGHT_FLOOR = 1e-12;

/* -- Core kernels ----------------------------------------------------------- */

function zeroState(n: number): Float64Array {
  const amps = new Float64Array(2 ** n * 2);
  amps[0] = 1; // |00…0⟩
  return amps;
}

/**
 * Applies a 2x2 unitary to `target`, conditional on every wire in `controls`
 * being 1. Iterates only over indices whose target bit is 0 and reads its
 * partner, so each amplitude pair is touched exactly once.
 */
function applyControlled(amps: Float64Array, n: number, m: Mat2, target: number, controls: number[]): void {
  const size = 2 ** n;
  const tBit = 1 << target;
  let controlMask = 0;
  for (const c of controls) controlMask |= 1 << c;

  const [m00r, m00i, m01r, m01i, m10r, m10i, m11r, m11i] = m;

  for (let k = 0; k < size; k++) {
    if (k & tBit) continue;                          // visit each pair once
    if ((k & controlMask) !== controlMask) continue; // controls not all set
    const j = k | tBit;

    const ar = amps[2 * k], ai = amps[2 * k + 1];
    const br = amps[2 * j], bi = amps[2 * j + 1];

    amps[2 * k]     = m00r * ar - m00i * ai + m01r * br - m01i * bi;
    amps[2 * k + 1] = m00r * ai + m00i * ar + m01r * bi + m01i * br;
    amps[2 * j]     = m10r * ar - m10i * ai + m11r * br - m11i * bi;
    amps[2 * j + 1] = m10r * ai + m10i * ar + m11r * bi + m11i * br;
  }
}

function applySwap(amps: Float64Array, n: number, a: number, b: number): void {
  const size = 2 ** n;
  const aBit = 1 << a;
  const bBit = 1 << b;
  for (let k = 0; k < size; k++) {
    // Only exchange when the two bits differ, and only from one side.
    if ((k & aBit) !== 0 || (k & bBit) === 0) continue;
    const j = (k | aBit) & ~bBit;
    const tr = amps[2 * k], ti = amps[2 * k + 1];
    amps[2 * k] = amps[2 * j];
    amps[2 * k + 1] = amps[2 * j + 1];
    amps[2 * j] = tr;
    amps[2 * j + 1] = ti;
  }
}

/** Probability that `qubit` reads 1 in this branch. */
function probOne(amps: Float64Array, n: number, qubit: number): number {
  const size = 2 ** n;
  const bit = 1 << qubit;
  let p = 0;
  for (let k = 0; k < size; k++) {
    if (!(k & bit)) continue;
    p += amps[2 * k] ** 2 + amps[2 * k + 1] ** 2;
  }
  return p;
}

/** Projects onto `outcome` on `qubit` and renormalises. Caller supplies the norm. */
function project(amps: Float64Array, n: number, qubit: number, outcome: 0 | 1, norm: number): Float64Array {
  const size = 2 ** n;
  const bit = 1 << qubit;
  const out = new Float64Array(size * 2);
  const scale = 1 / Math.sqrt(norm);
  for (let k = 0; k < size; k++) {
    const isOne = (k & bit) !== 0 ? 1 : 0;
    if (isOne !== outcome) continue;
    out[2 * k] = amps[2 * k] * scale;
    out[2 * k + 1] = amps[2 * k + 1] * scale;
  }
  return out;
}

/** Moves all amplitude on `qubit` to |0⟩, which is what a reset does. */
function collapseToZero(amps: Float64Array, n: number, qubit: number): Float64Array {
  const size = 2 ** n;
  const bit = 1 << qubit;
  const out = new Float64Array(size * 2);
  for (let k = 0; k < size; k++) {
    const dest = k & ~bit;
    out[2 * dest] += amps[2 * k];
    out[2 * dest + 1] += amps[2 * k + 1];
  }
  return out;
}

/* -- Ensemble helpers ------------------------------------------------------- */

function cloneBranches(branches: Branch[]): Branch[] {
  return branches.map((b) => ({ weight: b.weight, amps: new Float64Array(b.amps) }));
}

function prune(branches: Branch[]): Branch[] {
  const alive = branches.filter((b) => b.weight > WEIGHT_FLOOR);
  if (alive.length <= MAX_BRANCHES) return alive;
  alive.sort((a, b) => b.weight - a.weight);
  const kept = alive.slice(0, MAX_BRANCHES);
  const total = kept.reduce((s, b) => s + b.weight, 0);
  for (const b of kept) b.weight /= total;
  return kept;
}

/** Ensemble-averaged outcome probabilities. */
function ensembleProbabilities(branches: Branch[], n: number): Float64Array {
  const size = 2 ** n;
  const p = new Float64Array(size);
  for (const b of branches) {
    for (let k = 0; k < size; k++) {
      p[k] += b.weight * (b.amps[2 * k] ** 2 + b.amps[2 * k + 1] ** 2);
    }
  }
  return p;
}

/* -- The simulation --------------------------------------------------------- */

/**
 * Runs the circuit and captures the state after every column so the scrubber
 * can move through time without re-enqueueing anything.
 */
export function simulate(circuit: Circuit): SimResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const n = circuit.qubits;

  if (n > MAX_SIM_QUBITS) {
    throw new SimulationError(
      `This build simulates up to ${MAX_SIM_QUBITS} qubits in the browser. This circuit has ${n}.`,
      "qubit_cap",
    );
  }

  const ordered = inExecutionOrder(circuit.gates);
  const depth = circuitDepth(circuit);

  // Which measurements are mid-circuit? A measurement is terminal when nothing
  // coherent follows it on the same wire — in that case it does not disturb the
  // state and we only need it to know which wires get read.
  const midCircuit = new Set<string>();
  for (const g of ordered) {
    if (g.type !== "measure" && g.type !== "reset") continue;
    const wire = g.targets[0];
    const later = ordered.some(
      (o) =>
        o.column > g.column &&
        o.type !== "barrier" &&
        o.type !== "measure" &&
        gateQubits(o).includes(wire),
    );
    if (later || g.type === "reset") midCircuit.add(g.id);
  }

  let branches: Branch[] = [{ weight: 1, amps: zeroState(n) }];
  const steps: StepSnapshot[] = [{ column: -1, branches: cloneBranches(branches) }];

  for (let col = 0; col <= depth; col++) {
    const inColumn = ordered.filter((g) => g.column === col);
    for (const g of inColumn) {
      branches = applyGate(branches, n, g, midCircuit.has(g.id));
    }
    branches = prune(branches);
    steps.push({ column: col, branches: cloneBranches(branches) });
  }

  const mixed = branches.length > 1;
  const measuredQubits = ordered
    .filter((g) => g.type === "measure")
    .sort((a, b) => (a.clbit ?? 0) - (b.clbit ?? 0))
    .map((g) => g.targets[0]);

  const probabilities = ensembleProbabilities(branches, n);
  const statevector = mixed ? null : normaliseGlobalPhase(branches[0].amps);

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    qubits: n,
    clbits: circuit.clbits,
    branches,
    steps,
    probabilities,
    mixed,
    statevector,
    measuredQubits,
    durationMs: Math.max(0, t1 - t0),
  };
}

function applyGate(branches: Branch[], n: number, g: Gate, isMidCircuit: boolean): Branch[] {
  const s = GATES[g.type];

  if (g.type === "barrier") return branches;

  if (g.type === "measure") {
    if (!isMidCircuit) return branches; // terminal read; the state is untouched
    return branches.flatMap((b) => {
      const q = g.targets[0];
      const p1 = probOne(b.amps, n, q);
      const p0 = 1 - p1;
      const out: Branch[] = [];
      if (p0 > WEIGHT_FLOOR) out.push({ weight: b.weight * p0, amps: project(b.amps, n, q, 0, p0) });
      if (p1 > WEIGHT_FLOOR) out.push({ weight: b.weight * p1, amps: project(b.amps, n, q, 1, p1) });
      return out;
    });
  }

  if (g.type === "reset") {
    // Measure, then flip if the answer was 1 — which is exactly moving all
    // amplitude onto |0⟩ for that wire, branch by branch.
    return branches.map((b) => ({ weight: b.weight, amps: collapseToZero(b.amps, n, g.targets[0]) }));
  }

  if (g.type === "swap") {
    for (const b of branches) applySwap(b.amps, n, g.targets[0], g.targets[1]);
    return branches;
  }

  if (!s.base) return branches;
  const m = s.base(g.params);
  for (const b of branches) applyControlled(b.amps, n, m, g.targets[0], g.controls);
  return branches;
}

/**
 * Global-phase convention from TRD §6.2: the first amplitude with magnitude
 * above 1e-9 is made real and positive. This changes no physics — it makes
 * cross-backend comparison exact and the amplitude table stable between runs.
 * When a learner asks why their Z gate did nothing visible, this is where the
 * answer lives (misconception M5).
 */
export function normaliseGlobalPhase(amps: Float64Array): Float64Array {
  const out = new Float64Array(amps);
  const size = out.length / 2;
  for (let k = 0; k < size; k++) {
    const re = out[2 * k];
    const im = out[2 * k + 1];
    const mag = Math.hypot(re, im);
    if (mag < 1e-9) continue;
    // Multiply the whole vector by conj(phase) of this amplitude.
    const cr = re / mag;
    const ci = -im / mag;
    for (let j = 0; j < size; j++) {
      const ar = out[2 * j];
      const ai = out[2 * j + 1];
      out[2 * j] = ar * cr - ai * ci;
      out[2 * j + 1] = ar * ci + ai * cr;
    }
    break;
  }
  return out;
}

export class SimulationError extends Error {
  constructor(
    message: string,
    readonly code: "qubit_cap" | "invalid" | "timeout",
  ) {
    super(message);
    this.name = "SimulationError";
  }
}

/* -- Basis-state formatting ------------------------------------------------- */

/**
 * Bitstring for basis index k, printed q_{n-1} … q_0. The axis label always
 * states the convention alongside it — misconception M10 lives here and is
 * addressed by saying so, not by hiding it.
 */
export function bitstring(k: number, n: number): string {
  let s = "";
  for (let j = n - 1; j >= 0; j--) s += (k >> j) & 1;
  return s;
}

/** Ket notation for a basis index, e.g. |011⟩. */
export function ket(k: number, n: number): string {
  return `|${bitstring(k, n)}⟩`;
}

/** Index for a bitstring written q_{n-1} … q_0. Inverse of `bitstring`. */
export function indexOfBitstring(bits: string): number {
  return parseInt(bits, 2);
}
