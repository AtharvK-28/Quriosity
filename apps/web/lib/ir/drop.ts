/**
 * Where a gate dropped on one wire lands, all of it.
 *
 * Clicking a two-wire gate into place asks for each wire in turn. A drag has
 * one release point, so the gate takes the wire it was dropped on for its
 * first role (the control) and the next wires down for the rest, going up
 * instead when there is no room below. A CNOT dropped on the bottom wire of
 * two is controlled from the bottom: dropped where the learner put it, even
 * when that is upside down. That is a mistake the tutor names, and one the
 * learner fixes by dragging the control dot across.
 */

import { GATES } from "./gates";
import type { Circuit, GateType } from "./types";
import { slotIsFree } from "./validate";

export interface DropWires {
  controls: number[];
  targets: number[];
}

/**
 * The wires a gate of `type` takes when dropped on `qubit` of a `qubits`-wire
 * register, or null when the register is too small to hold it.
 */
export function dropWires(type: GateType, qubit: number, qubits: number): DropWires | null {
  if (qubit < 0 || qubit >= qubits) return null;
  const spec = GATES[type];

  // A dropped barrier covers the whole register, as Qiskit's barrier() does.
  if (type === "barrier") {
    return { controls: [], targets: Array.from({ length: qubits }, (_, i) => i) };
  }

  const need = spec.controlArity + spec.targetArity;
  if (need > qubits) return null;

  const wires: number[] = [];
  for (let w = qubit; w < qubits && wires.length < need; w++) wires.push(w);
  for (let w = qubit - 1; w >= 0 && wires.length < need; w--) wires.push(w);

  return { controls: wires.slice(0, spec.controlArity), targets: wires.slice(spec.controlArity) };
}

/** Columns no learner gate may occupy: an oracle box, while a lesson shows one. */
export interface Reserved {
  from: number;
  to: number;
}

/** slotIsFree, plus the reserved columns. */
export function slotOpen(c: Circuit, column: number, wires: number[], reserved: Reserved | null, ignoreGateId?: string): boolean {
  if (reserved && column >= reserved.from && column <= reserved.to) return false;
  return slotIsFree(c, column, wires, ignoreGateId);
}

/** The first column at or after `from` where every one of `wires` is open. */
export function nextOpenColumn(c: Circuit, wires: number[], from: number, reserved: Reserved | null): number {
  let col = from;
  while (!slotOpen(c, col, wires, reserved)) col += 1;
  return col;
}
