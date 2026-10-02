/**
 * The gate registry — TRD §4.2.
 *
 * Single definition of arity, unitary matrix and per-SDK spelling for every
 * gate. Adding a gate is one entry here plus one line per renderer; nothing
 * else in the system needs to know.
 *
 * Matrices are 2x2 complex, flattened row-major as
 *   [re00, im00, re01, im01, re10, im10, re11, im11]
 * because that is the layout the simulator consumes without allocating.
 */

import type { GateType } from "./types";

/** A 2x2 complex unitary, flattened row-major, interleaved re/im. */
export type Mat2 = readonly number[];

const SQRT1_2 = Math.SQRT1_2;

export interface GateSpec {
  type: GateType;
  /** Display name, used in tutor copy and the gate reference. */
  name: string;
  /** Single-character or short glyph label drawn inside the gate square. */
  glyph: string;
  /** How many target wires the gate occupies. */
  targetArity: number;
  /** How many control wires. */
  controlArity: number;
  /** Length of `params`, enforced by invariant 4. */
  paramArity: number;
  /**
   * The 2x2 unitary applied to the target wire. Controlled gates carry their
   * base unitary here and the simulator applies it conditionally, which is why
   * `cx` and `x` share a matrix. Null for gates that are not unitary
   * (measure, reset) or that act on two targets at once (swap).
   */
  base: ((params: number[]) => Mat2) | null;
  /** Human-readable one-liner for tooltips and the gate reference. */
  blurb: string;
  /** Names in each rendering target. Used by lib/render/*. */
  sdk: {
    qiskit: string;
    cirq: string;
    pennylane: string;
    qsharp: string;
    qasm: string;
  };
  /** Which curriculum unit introduces this gate. Drives the locked-gate state. */
  unlocksIn: string;
}

/* -- Fixed matrices --------------------------------------------------------- */

const M_I: Mat2 = [1, 0, 0, 0, 0, 0, 1, 0];
const M_X: Mat2 = [0, 0, 1, 0, 1, 0, 0, 0];
const M_Y: Mat2 = [0, 0, 0, -1, 0, 1, 0, 0];
const M_Z: Mat2 = [1, 0, 0, 0, 0, 0, -1, 0];
const M_H: Mat2 = [SQRT1_2, 0, SQRT1_2, 0, SQRT1_2, 0, -SQRT1_2, 0];
const M_S: Mat2 = [1, 0, 0, 0, 0, 0, 0, 1];
const M_SDG: Mat2 = [1, 0, 0, 0, 0, 0, 0, -1];
const M_T: Mat2 = [1, 0, 0, 0, 0, 0, SQRT1_2, SQRT1_2];
const M_TDG: Mat2 = [1, 0, 0, 0, 0, 0, SQRT1_2, -SQRT1_2];

/* -- Parameterised matrices ------------------------------------------------- */

const M_RX = ([t]: number[]): Mat2 => {
  const c = Math.cos(t / 2);
  const s = Math.sin(t / 2);
  return [c, 0, 0, -s, 0, -s, c, 0];
};

const M_RY = ([t]: number[]): Mat2 => {
  const c = Math.cos(t / 2);
  const s = Math.sin(t / 2);
  return [c, 0, -s, 0, s, 0, c, 0];
};

const M_RZ = ([t]: number[]): Mat2 => [
  Math.cos(t / 2), -Math.sin(t / 2), 0, 0,
  0, 0, Math.cos(t / 2), Math.sin(t / 2),
];

const M_P = ([p]: number[]): Mat2 => [
  1, 0, 0, 0,
  0, 0, Math.cos(p), Math.sin(p),
];

/* -- The registry ----------------------------------------------------------- */

export const GATES: Record<GateType, GateSpec> = {
  i: {
    type: "i", name: "Identity", glyph: "I",
    targetArity: 1, controlArity: 0, paramArity: 0, base: () => M_I,
    blurb: "Does nothing, on purpose. Occupies time, which is how idle noise gets in.",
    sdk: { qiskit: "id", cirq: "I", pennylane: "Identity", qsharp: "I", qasm: "id" },
    unlocksIn: "u1",
  },
  x: {
    type: "x", name: "Pauli-X", glyph: "X",
    targetArity: 1, controlArity: 0, paramArity: 0, base: () => M_X,
    blurb: "Flips |0⟩ and |1⟩. The quantum NOT.",
    sdk: { qiskit: "x", cirq: "X", pennylane: "PauliX", qsharp: "X", qasm: "x" },
    unlocksIn: "u1",
  },
  y: {
    type: "y", name: "Pauli-Y", glyph: "Y",
    targetArity: 1, controlArity: 0, paramArity: 0, base: () => M_Y,
    blurb: "A flip and a half-turn of phase at once.",
    sdk: { qiskit: "y", cirq: "Y", pennylane: "PauliY", qsharp: "Y", qasm: "y" },
    unlocksIn: "u2",
  },
  z: {
    type: "z", name: "Pauli-Z", glyph: "Z",
    targetArity: 1, controlArity: 0, paramArity: 0, base: () => M_Z,
    blurb: "Turns the phase of |1⟩ by π. Invisible on |0⟩ — that is the lesson.",
    sdk: { qiskit: "z", cirq: "Z", pennylane: "PauliZ", qsharp: "Z", qasm: "z" },
    unlocksIn: "u2",
  },
  h: {
    type: "h", name: "Hadamard", glyph: "H",
    targetArity: 1, controlArity: 0, paramArity: 0, base: () => M_H,
    blurb: "Puts a definite qubit on the fence — and takes it back off again.",
    sdk: { qiskit: "h", cirq: "H", pennylane: "Hadamard", qsharp: "H", qasm: "h" },
    unlocksIn: "u1",
  },
  s: {
    type: "s", name: "Phase S", glyph: "S",
    targetArity: 1, controlArity: 0, paramArity: 0, base: () => M_S,
    blurb: "A quarter turn of phase on |1⟩.",
    sdk: { qiskit: "s", cirq: "S", pennylane: "S", qsharp: "S", qasm: "s" },
    unlocksIn: "u2",
  },
  sdg: {
    type: "sdg", name: "S dagger", glyph: "S†",
    targetArity: 1, controlArity: 0, paramArity: 0, base: () => M_SDG,
    blurb: "Undoes S.",
    sdk: { qiskit: "sdg", cirq: "S**-1", pennylane: "adjoint(S)", qsharp: "Adjoint S", qasm: "sdg" },
    unlocksIn: "u2",
  },
  t: {
    type: "t", name: "Phase T", glyph: "T",
    targetArity: 1, controlArity: 0, paramArity: 0, base: () => M_T,
    blurb: "An eighth turn of phase on |1⟩.",
    sdk: { qiskit: "t", cirq: "T", pennylane: "T", qsharp: "T", qasm: "t" },
    unlocksIn: "u2",
  },
  tdg: {
    type: "tdg", name: "T dagger", glyph: "T†",
    targetArity: 1, controlArity: 0, paramArity: 0, base: () => M_TDG,
    blurb: "Undoes T.",
    sdk: { qiskit: "tdg", cirq: "T**-1", pennylane: "adjoint(T)", qsharp: "Adjoint T", qasm: "tdg" },
    unlocksIn: "u2",
  },
  rx: {
    type: "rx", name: "X rotation", glyph: "RX",
    targetArity: 1, controlArity: 0, paramArity: 1, base: M_RX,
    blurb: "Rotates the state by θ about the X axis.",
    sdk: { qiskit: "rx", cirq: "rx", pennylane: "RX", qsharp: "Rx", qasm: "rx" },
    unlocksIn: "u2",
  },
  ry: {
    type: "ry", name: "Y rotation", glyph: "RY",
    targetArity: 1, controlArity: 0, paramArity: 1, base: M_RY,
    blurb: "Rotates by θ about Y. This is the dial that sets the odds.",
    sdk: { qiskit: "ry", cirq: "ry", pennylane: "RY", qsharp: "Ry", qasm: "ry" },
    unlocksIn: "u2",
  },
  rz: {
    type: "rz", name: "Z rotation", glyph: "RZ",
    targetArity: 1, controlArity: 0, paramArity: 1, base: M_RZ,
    blurb: "Rotates by θ about Z. Changes phase, never the odds in this basis.",
    sdk: { qiskit: "rz", cirq: "rz", pennylane: "RZ", qsharp: "Rz", qasm: "rz" },
    unlocksIn: "u2",
  },
  p: {
    type: "p", name: "Phase", glyph: "P",
    targetArity: 1, controlArity: 0, paramArity: 1, base: M_P,
    blurb: "Adds φ to the phase of |1⟩.",
    sdk: { qiskit: "p", cirq: "Z**", pennylane: "PhaseShift", qsharp: "R1", qasm: "p" },
    unlocksIn: "u2",
  },
  cx: {
    type: "cx", name: "CNOT", glyph: "X",
    targetArity: 1, controlArity: 1, paramArity: 0, base: () => M_X,
    blurb: "Flips the target when the control is 1. Feed it a superposition and it entangles instead of copying.",
    sdk: { qiskit: "cx", cirq: "CNOT", pennylane: "CNOT", qsharp: "CNOT", qasm: "cx" },
    unlocksIn: "u3",
  },
  cz: {
    type: "cz", name: "Controlled-Z", glyph: "Z",
    targetArity: 1, controlArity: 1, paramArity: 0, base: () => M_Z,
    blurb: "Phase flip on |11⟩. Symmetric — control and target are interchangeable.",
    sdk: { qiskit: "cz", cirq: "CZ", pennylane: "CZ", qsharp: "CZ", qasm: "cz" },
    unlocksIn: "u3",
  },
  swap: {
    type: "swap", name: "SWAP", glyph: "×",
    targetArity: 2, controlArity: 0, paramArity: 0, base: null,
    blurb: "Exchanges two qubits. Costs three CNOTs on real hardware.",
    sdk: { qiskit: "swap", cirq: "SWAP", pennylane: "SWAP", qsharp: "SWAP", qasm: "swap" },
    unlocksIn: "u3",
  },
  crx: {
    type: "crx", name: "Controlled RX", glyph: "RX",
    targetArity: 1, controlArity: 1, paramArity: 1, base: M_RX,
    blurb: "RX on the target, conditional on the control.",
    sdk: { qiskit: "crx", cirq: "rx", pennylane: "CRX", qsharp: "Rx", qasm: "crx" },
    unlocksIn: "u7",
  },
  cry: {
    type: "cry", name: "Controlled RY", glyph: "RY",
    targetArity: 1, controlArity: 1, paramArity: 1, base: M_RY,
    blurb: "RY on the target, conditional on the control.",
    sdk: { qiskit: "cry", cirq: "ry", pennylane: "CRY", qsharp: "Ry", qasm: "cry" },
    unlocksIn: "u7",
  },
  crz: {
    type: "crz", name: "Controlled RZ", glyph: "RZ",
    targetArity: 1, controlArity: 1, paramArity: 1, base: M_RZ,
    blurb: "RZ on the target, conditional on the control.",
    sdk: { qiskit: "crz", cirq: "rz", pennylane: "CRZ", qsharp: "Rz", qasm: "crz" },
    unlocksIn: "u7",
  },
  ccx: {
    type: "ccx", name: "Toffoli", glyph: "X",
    targetArity: 1, controlArity: 2, paramArity: 0, base: () => M_X,
    blurb: "Flips the target only when both controls are 1.",
    sdk: { qiskit: "ccx", cirq: "TOFFOLI", pennylane: "Toffoli", qsharp: "CCNOT", qasm: "ccx" },
    unlocksIn: "u6",
  },
  measure: {
    type: "measure", name: "Measurement", glyph: "M",
    targetArity: 1, controlArity: 0, paramArity: 0, base: null,
    blurb: "Reads the qubit. Not a peek — it decides the value and destroys the lean.",
    sdk: { qiskit: "measure", cirq: "measure", pennylane: "sample", qsharp: "M", qasm: "measure" },
    unlocksIn: "u1",
  },
  reset: {
    type: "reset", name: "Reset", glyph: "R",
    targetArity: 1, controlArity: 0, paramArity: 0, base: null,
    blurb: "Returns the qubit to |0⟩, whatever it was doing.",
    sdk: { qiskit: "reset", cirq: "reset", pennylane: "Reset", qsharp: "Reset", qasm: "reset" },
    unlocksIn: "u3",
  },
  barrier: {
    type: "barrier", name: "Barrier", glyph: "‖",
    targetArity: 1, controlArity: 0, paramArity: 0, base: null,
    blurb: "A visual and transpilation hint. No physical effect.",
    sdk: { qiskit: "barrier", cirq: "", pennylane: "Barrier", qsharp: "", qasm: "barrier" },
    unlocksIn: "u1",
  },
};

export const GATE_TYPES = Object.keys(GATES) as GateType[];

export function isGateType(t: string): t is GateType {
  return Object.prototype.hasOwnProperty.call(GATES, t);
}

export function spec(t: GateType): GateSpec {
  return GATES[t];
}

/** True for gates the simulator advances the state with. */
export function isUnitary(t: GateType): boolean {
  return t !== "measure" && t !== "reset" && t !== "barrier";
}

/** True for gates drawn with a control dot and a vertical connector. */
export function isControlled(t: GateType): boolean {
  return GATES[t].controlArity > 0;
}

/** Gates whose square is drawn as a ring-and-crosshair rather than a letter. */
export function isXTarget(t: GateType): boolean {
  return t === "cx" || t === "ccx";
}

/**
 * Self-inverse single-qubit gates. Used by lint rule L02 (redundant adjacent
 * pair) and L10 (H undone by H).
 */
export const SELF_INVERSE: ReadonlySet<GateType> = new Set(["x", "y", "z", "h", "i"]);

/* -- Parameter formatting --------------------------------------------------- */

/**
 * Renders θ as a clean multiple of π where one exists, and a 4dp decimal
 * otherwise. Design Doc §6: a parameter reads `π/4`, never `0.7853981`.
 */
export function formatParam(theta: number): string {
  if (theta === 0) return "0";
  const ratio = theta / Math.PI;
  const denominators = [1, 2, 3, 4, 6, 8, 12, 16];
  for (const d of denominators) {
    const n = ratio * d;
    const rounded = Math.round(n);
    if (Math.abs(n - rounded) < 1e-9 && rounded !== 0) {
      const sign = rounded < 0 ? "-" : "";
      const mag = Math.abs(rounded);
      const num = mag === 1 ? "π" : `${mag}π`;
      return d === 1 ? `${sign}${num}` : `${sign}${num}/${d}`;
    }
  }
  return theta.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * Accepts radians, degrees (`90deg`), or a π-expression (`pi/4`, `-3π/2`).
 * Returns null on anything it cannot read, so the caller can reject inline
 * without clearing the field (PRD E2-S6).
 */
export function parseParam(input: string): number | null {
  const raw = input.trim().toLowerCase().replace(/π/g, "pi");
  if (!raw) return null;

  const deg = raw.match(/^(-?\d+(?:\.\d+)?)\s*(?:deg|°)$/);
  if (deg) return (parseFloat(deg[1]) * Math.PI) / 180;

  // [coefficient] pi [/ divisor]
  const piExpr = raw.match(/^(-?\d*(?:\.\d+)?)\s*\*?\s*pi\s*(?:\/\s*(\d+(?:\.\d+)?))?$/);
  if (piExpr) {
    const coefRaw = piExpr[1];
    const coef = coefRaw === "" || coefRaw === "-" ? (coefRaw === "-" ? -1 : 1) : parseFloat(coefRaw);
    const div = piExpr[2] ? parseFloat(piExpr[2]) : 1;
    if (div === 0) return null;
    return (coef * Math.PI) / div;
  }

  const plain = raw.match(/^-?\d*\.?\d+$/);
  if (plain) {
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}
