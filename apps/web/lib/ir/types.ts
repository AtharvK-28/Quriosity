/**
 * The circuit IR.
 *
 * This schema is FROZEN. It is TRD §4.1, transcribed. Every other module in
 * this app is a function over this object — the canvas emits it, the renderers
 * consume it, the simulator runs it, the linter reads it, the grader compares
 * states produced from it. If something here needs to change, that is a
 * conversation, not an edit.
 *
 * The Python source of truth lives at packages/ir/schema.py (TRD §2). This file
 * is the TypeScript mirror the client works against so that rendering code and
 * validating a circuit never require a network round trip.
 */

export const SCHEMA_VERSION = "1.0" as const;

/** Gate identifiers, lowercase, from the registry in TRD §4.2. */
export type GateType =
  | "i" | "x" | "y" | "z" | "h"
  | "s" | "sdg" | "t" | "tdg"
  | "rx" | "ry" | "rz" | "p"
  | "cx" | "cz" | "swap"
  | "crx" | "cry" | "crz"
  | "ccx"
  | "measure" | "reset" | "barrier";

export interface Gate {
  /** Stable across edits. The tutor points at gates by this id. */
  id: string;
  type: GateType;
  /** Qubit indices, ordered. */
  targets: number[];
  /** Qubit indices. Empty for single-qubit gates. */
  controls: number[];
  /** Floats in radians. Length is fixed per gate type by the registry. */
  params: number[];
  /**
   * Integer time slot. Several gates may share a column iff their qubit sets
   * are disjoint. Gaps are permitted and render as identity.
   */
  column: number;
  /** Classical target. Present on `measure` only. */
  clbit?: number;
}

export type SdkOrigin = "canvas" | "qiskit" | "cirq" | "pennylane" | "qasm";

export interface CircuitMetadata {
  name?: string;
  created_by?: string;
  sdk_origin?: SdkOrigin;
}

export interface Circuit {
  schema_version: typeof SCHEMA_VERSION;
  /** Assigned on save. Absent for unsaved work. */
  id?: string;
  qubits: number;
  /** Defaults to `qubits`. */
  clbits: number;
  gates: Gate[];
  metadata: CircuitMetadata;
}

/** Hard ceiling from TRD §4.1 invariant 1. Tier caps are applied above this. */
export const MAX_QUBITS = 24;
/** Per PRD §9 — a circuit longer than this is blocked with the count shown. */
export const MAX_GATES = 500;

export function emptyCircuit(qubits = 2, name?: string): Circuit {
  return {
    schema_version: SCHEMA_VERSION,
    qubits,
    clbits: qubits,
    gates: [],
    metadata: { name, sdk_origin: "canvas" },
  };
}

/** Monotonic within a session; ids only need to be unique inside one circuit. */
let gateSeq = 0;
export function nextGateId(): string {
  gateSeq += 1;
  return `g_${gateSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Every qubit a gate touches, controls included. */
export function gateQubits(g: Gate): number[] {
  return [...g.controls, ...g.targets];
}

/** Highest occupied column, or -1 for an empty circuit. */
export function circuitDepth(c: Circuit): number {
  return c.gates.reduce((d, g) => Math.max(d, g.column), -1);
}

/** Gates that occupy a given column, in wire order. */
export function gatesInColumn(c: Circuit, column: number): Gate[] {
  return c.gates
    .filter((g) => g.column === column)
    .sort((a, b) => Math.min(...gateQubits(a)) - Math.min(...gateQubits(b)));
}

/** The gate occupying a specific slot, if any. Controls count as occupancy. */
export function gateAt(c: Circuit, qubit: number, column: number): Gate | undefined {
  return c.gates.find((g) => g.column === column && gateQubits(g).includes(qubit));
}

/** Gates that actually act on the state — excludes barriers, which are hints. */
export function operativeGates(c: Circuit): Gate[] {
  return c.gates.filter((g) => g.type !== "barrier");
}

/** The count shown in the UI and used for golf scoring. Barriers are free. */
export function gateCount(c: Circuit): number {
  return operativeGates(c).length;
}

export function cloneCircuit(c: Circuit): Circuit {
  return {
    ...c,
    gates: c.gates.map((g) => ({
      ...g,
      targets: [...g.targets],
      controls: [...g.controls],
      params: [...g.params],
    })),
    metadata: { ...c.metadata },
  };
}
