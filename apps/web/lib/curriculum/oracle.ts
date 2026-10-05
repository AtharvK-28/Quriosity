/**
 * The oracle box: a function hidden inside a circuit.
 *
 * An algorithm is not a circuit that works for one function. It is a circuit
 * that works for every function the box might hide. So an oracle node carries
 * several variants (f₁, f₂, …), the learner builds around the box, and the
 * node passes only when the one circuit gives the right answer for all of
 * them: the honest test of Deutsch, Deutsch–Jozsa and Bernstein–Vazirani.
 *
 * No IR change. The box's contents are ordinary gates with ids that mark them
 * as locked, placed in columns the store reserves; grading swaps each variant
 * in and runs the unchanged simulator and grader.
 */

import { grade, type Target } from "@/lib/grade/fidelity";
import type { Circuit, Gate, GateType } from "@/lib/ir/types";
import { simulate } from "@/lib/sim/statevector";

/** A gate placed by the node rather than the learner. */
export interface PlacedGate {
  type: GateType;
  targets: number[];
  controls?: number[];
  params?: number[];
  column: number;
}

export interface OracleVariant {
  /** Shown before a pass: "f₁". */
  name: string;
  /** Shown after a pass: what the function was. */
  reveal: string;
  /** The box's contents; columns count from the box's first column. */
  gates: PlacedGate[];
  /** The state a correct algorithm leaves when the box hides this function. */
  target: Target;
}

export interface OracleSpec {
  /** The box's label, e.g. "f". */
  label: string;
  /** What a correct circuit does, in one line: the "aiming at" for the node. */
  rule: string;
  /** First column the box occupies, and how many it spans. */
  column: number;
  width: number;
  variants: OracleVariant[];
}

/** Gates the node placed and the learner may not edit: ids carry one of these. */
export const LOCKED_PREFIX = "fixed:";
export const ORACLE_PREFIX = "oracle:";

export function isLocked(id: string): boolean {
  return id.startsWith(LOCKED_PREFIX) || id.startsWith(ORACLE_PREFIX);
}

/** Columns the box reserves; the learner builds before and after it. */
export function reservedColumns(spec: OracleSpec): { from: number; to: number } {
  return { from: spec.column, to: spec.column + spec.width - 1 };
}

function toGate(g: PlacedGate, id: string, columnOffset = 0): Gate {
  return {
    id,
    type: g.type,
    targets: g.targets,
    controls: g.controls ?? [],
    params: g.params ?? [],
    column: g.column + columnOffset,
    ...(g.type === "measure" ? { clbit: g.targets[0] } : {}),
  };
}

/** The node's own gates outside the box, locked. */
export function lockedGates(starter: PlacedGate[]): Gate[] {
  return starter.map((g, i) => toGate(g, `${LOCKED_PREFIX}${i}`));
}

/** The box's contents for one variant, placed at the box's columns. */
export function oracleGates(spec: OracleSpec, index: number): Gate[] {
  const v = spec.variants[index];
  return v.gates.map((g, i) => toGate(g, `${ORACLE_PREFIX}${index}:${i}`, spec.column));
}

/** The same circuit with a different function in the box. */
export function withVariant(circuit: Circuit, spec: OracleSpec, index: number): Circuit {
  return {
    ...circuit,
    gates: [...circuit.gates.filter((g) => !g.id.startsWith(ORACLE_PREFIX)), ...oracleGates(spec, index)],
  };
}

/** How the circuit does against each function the box can hide. */
export function oracleResults(circuit: Circuit, spec: OracleSpec): Array<{ name: string; passed: boolean; fidelity: number }> {
  return spec.variants.map((v, i) => {
    try {
      const g = grade(simulate(withVariant(circuit, spec, i)), v.target);
      return { name: v.name, passed: g.passed, fidelity: g.fidelity };
    } catch {
      return { name: v.name, passed: false, fidelity: 0 };
    }
  });
}

/**
 * When the circuit is right for the function on show but not for all of them,
 * the sentence that says so. Null when it is right for every one.
 */
export function oracleMiss(circuit: Circuit, spec: OracleSpec): string | null {
  const results = oracleResults(circuit, spec);
  const failed = results.filter((r) => !r.passed).map((r) => r.name);
  if (failed.length === 0) return null;
  const list = failed.length === 1 ? failed[0] : `${failed.slice(0, -1).join(", ")} and ${failed[failed.length - 1]}`;
  return `Right for this function, but not for ${list}. An algorithm has to work for every function the box could hide — switch to ${failed[0]} and run it.`;
}

/**
 * A state for the oracle algorithms: the input wires in one basis state and
 * the helper wire in |−⟩ = (|0⟩ − |1⟩)/√2, which is where phase kickback
 * leaves it. `inputs` is the integer the input wires read, q0 its lowest bit.
 */
export function kickbackTarget(qubits: number, helper: number, inputs: number, label?: string): Target {
  const amps = new Float64Array(2 ** qubits * 2);
  const base = inputs & ~(1 << helper);
  amps[2 * base] = Math.SQRT1_2;
  amps[2 * (base | (1 << helper))] = -Math.SQRT1_2;
  return { kind: "statevector", qubits, amplitudes: amps, label };
}
