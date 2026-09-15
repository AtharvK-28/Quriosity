/**
 * Column layout.
 *
 * The IR permits gaps between columns (they render as identity), which is how
 * a circuit drawn on the canvas usually looks. Text formats have no columns at
 * all — only statement order. So anything that turns text into IR has to choose
 * a column for each gate, and the only choice that preserves the physics is
 * "as soon as possible": each gate lands one column after the last gate on any
 * wire it touches. Per-wire order is kept exactly, and gates on disjoint wires
 * commute, so the state is unchanged.
 *
 * The same pass is what "compact" means for a canvas circuit, which is what
 * makes a QASM round trip compare equal.
 */

import { inExecutionOrder } from "./validate";
import { gateQubits, type Circuit, type Gate } from "./types";

/** Wires a gate occupies for layout. A barrier holds its whole span. */
function span(g: Gate): number[] {
  const wires = gateQubits(g);
  if (g.type !== "barrier" || wires.length < 2) return wires;
  const lo = Math.min(...wires);
  const hi = Math.max(...wires);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/**
 * Assigns columns to gates in the order given, earliest slot first. The input
 * order is treated as time order; the gates are copied, never mutated.
 */
export function layoutInOrder(gates: Gate[]): Gate[] {
  const last = new Map<number, number>();
  return gates.map((g) => {
    const wires = span(g);
    const column = wires.reduce((c, w) => Math.max(c, (last.get(w) ?? -1) + 1), 0);
    for (const w of wires) last.set(w, column);
    return { ...g, targets: [...g.targets], controls: [...g.controls], params: [...g.params], column };
  });
}

/** The same circuit with every gap closed. */
export function compactColumns(c: Circuit): Circuit {
  return { ...c, gates: layoutInOrder(inExecutionOrder(c.gates)), metadata: { ...c.metadata } };
}
