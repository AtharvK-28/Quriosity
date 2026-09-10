/**
 * IR validation — the ten invariants of TRD §4.1.
 *
 * Every error names the gate and the reason. "Invalid circuit" is not an
 * acceptable output of this module; a learner who hits a validation error must
 * be told which gate, on which wire, and what to do about it.
 */

import { GATES, isGateType } from "./gates";
import { MAX_GATES, MAX_QUBITS, gateQubits, type Circuit, type Gate } from "./types";

export interface ValidationError {
  /** Machine-readable, so the UI can switch on it. */
  code:
    | "qubits_out_of_range"
    | "index_out_of_range"
    | "target_control_overlap"
    | "param_arity"
    | "param_not_finite"
    | "unknown_gate"
    | "column_collision"
    | "negative_column"
    | "duplicate_id"
    | "clbit_out_of_range"
    | "arity_mismatch"
    | "too_many_gates";
  message: string;
  gateId?: string;
  qubits?: number[];
  column?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validate(c: Circuit): ValidationResult {
  const errors: ValidationError[] = [];
  const err = (e: ValidationError) => errors.push(e);

  // 1 — qubit count in range.
  if (!Number.isInteger(c.qubits) || c.qubits < 1 || c.qubits > MAX_QUBITS) {
    err({
      code: "qubits_out_of_range",
      message: `A circuit needs between 1 and ${MAX_QUBITS} qubits. This one declares ${c.qubits}.`,
    });
    // Every remaining check depends on a sane qubit count.
    return { valid: false, errors };
  }

  if (c.gates.length > MAX_GATES) {
    err({
      code: "too_many_gates",
      message: `This circuit has ${c.gates.length} gates. The limit is ${MAX_GATES}.`,
    });
  }

  const seenIds = new Set<string>();
  // column -> qubits already occupied in that column
  const occupancy = new Map<number, Set<number>>();

  for (const g of c.gates) {
    // 6 — gate type exists in the registry.
    if (!isGateType(g.type)) {
      err({
        code: "unknown_gate",
        message: `"${g.type}" isn't in the supported gate set. See the gate reference.`,
        gateId: g.id,
      });
      continue;
    }
    const s = GATES[g.type];

    // 9 — id unique within the circuit.
    if (seenIds.has(g.id)) {
      err({ code: "duplicate_id", message: `Two gates share the id ${g.id}.`, gateId: g.id });
    }
    seenIds.add(g.id);

    // Arity of the wire lists. Barrier is the one gate with a variable span.
    if (g.type !== "barrier") {
      if (g.targets.length !== s.targetArity) {
        err({
          code: "arity_mismatch",
          message: `${s.name} takes ${s.targetArity} target${s.targetArity === 1 ? "" : "s"}, got ${g.targets.length}.`,
          gateId: g.id,
        });
      }
      if (g.controls.length !== s.controlArity) {
        err({
          code: "arity_mismatch",
          message: `${s.name} takes ${s.controlArity} control${s.controlArity === 1 ? "" : "s"}, got ${g.controls.length}.`,
          gateId: g.id,
        });
      }
    }

    // 2 — every index in range.
    const wires = gateQubits(g);
    for (const q of wires) {
      if (!Number.isInteger(q) || q < 0 || q >= c.qubits) {
        err({
          code: "index_out_of_range",
          message: `${s.name} refers to q${q}, but this circuit has qubits q0 to q${c.qubits - 1}.`,
          gateId: g.id,
          qubits: [q],
        });
      }
    }

    // 3 — targets and controls disjoint within one gate.
    const overlap = g.targets.filter((t) => g.controls.includes(t));
    if (overlap.length > 0) {
      err({
        code: "target_control_overlap",
        message: `${s.name} uses q${overlap[0]} as both control and target.`,
        gateId: g.id,
        qubits: overlap,
      });
    }

    // 4 — parameter count matches the registry.
    if (g.params.length !== s.paramArity) {
      err({
        code: "param_arity",
        message: `${s.name} takes ${s.paramArity} parameter${s.paramArity === 1 ? "" : "s"}, got ${g.params.length}.`,
        gateId: g.id,
      });
    }

    // 5 — all parameters finite.
    for (const p of g.params) {
      if (!Number.isFinite(p)) {
        err({
          code: "param_not_finite",
          message: `${s.name} has a parameter that isn't a finite number.`,
          gateId: g.id,
        });
      }
    }

    // 8 — column non-negative. Gaps are fine and render as identity.
    if (!Number.isInteger(g.column) || g.column < 0) {
      err({
        code: "negative_column",
        message: `${s.name} sits at column ${g.column}. Columns start at 0.`,
        gateId: g.id,
      });
    }

    // 10 — measure carries a clbit in range.
    if (g.type === "measure") {
      if (g.clbit === undefined || !Number.isInteger(g.clbit) || g.clbit < 0 || g.clbit >= c.clbits) {
        err({
          code: "clbit_out_of_range",
          message: `Measurement on q${g.targets[0]} writes to classical bit ${g.clbit}, which doesn't exist.`,
          gateId: g.id,
        });
      }
    }

    // 7 — within one column, no two gates share a qubit.
    let col = occupancy.get(g.column);
    if (!col) {
      col = new Set<number>();
      occupancy.set(g.column, col);
    }
    for (const q of wires) {
      if (col.has(q)) {
        err({
          code: "column_collision",
          message: `Two gates occupy q${q} at the same time step.`,
          gateId: g.id,
          qubits: [q],
          column: g.column,
        });
      }
      col.add(q);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Convenience for call sites that only need a yes/no. */
export function isValid(c: Circuit): boolean {
  return validate(c).valid;
}

/**
 * Can this gate be placed here without breaking invariant 7? Used by the canvas
 * to decide whether a drop target lights up, before any IR mutation happens.
 */
export function slotIsFree(c: Circuit, column: number, wires: number[], ignoreGateId?: string): boolean {
  return !c.gates.some(
    (g) =>
      g.column === column &&
      g.id !== ignoreGateId &&
      gateQubits(g).some((q) => wires.includes(q)),
  );
}

/** The first column at or after `from` where every one of `wires` is free. */
export function firstFreeColumn(c: Circuit, wires: number[], from = 0): number {
  let col = from;
  while (!slotIsFree(c, col, wires)) col += 1;
  return col;
}

/** Gates sorted into execution order: by column, then by lowest wire. */
export function inExecutionOrder(gates: Gate[]): Gate[] {
  return [...gates].sort((a, b) => {
    if (a.column !== b.column) return a.column - b.column;
    return Math.min(...gateQubits(a)) - Math.min(...gateQubits(b));
  });
}
