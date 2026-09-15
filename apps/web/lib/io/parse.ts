/**
 * What every text → IR reader shares.
 *
 * PRD E3-S3 and §9: a construct outside the supported set produces a NAMED,
 * LOCATED error — never a silent drop, never a half-built circuit. So a reader
 * either returns a circuit that has passed `validate`, or it returns one error
 * with a line and a column and a sentence that says what to do.
 *
 * Columns come from statement order via `layoutInOrder`, which is the only
 * layout that preserves the physics of a text format with no notion of time
 * slots.
 */

import { layoutInOrder } from "../ir/layout";
import { validate } from "../ir/validate";
import {
  SCHEMA_VERSION, nextGateId, type Circuit, type GateType, type SdkOrigin,
} from "../ir/types";

export interface ParseError {
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  message: string;
}

export type ParseResult =
  | { ok: true; circuit: Circuit; notes: string[] }
  | { ok: false; error: ParseError };

/** A gate as read from text, before it has a column or an id. */
export interface DraftGate {
  type: GateType;
  targets: number[];
  controls: number[];
  params: number[];
  clbit?: number;
  line: number;
  column: number;
}

/** Thrown inside a reader and caught at its boundary. */
export class LocatedError extends Error {
  constructor(message: string, readonly line: number, readonly column: number) {
    super(message);
    this.name = "LocatedError";
  }
}

export function fail(e: unknown): ParseResult {
  if (e instanceof LocatedError) {
    return { ok: false, error: { line: e.line, column: e.column, message: e.message } };
  }
  const message = e instanceof Error ? e.message : "This couldn't be read.";
  return { ok: false, error: { line: 1, column: 1, message } };
}

/**
 * Lays the drafts out, validates the result, and maps any validation error
 * back to the line the offending gate came from.
 */
export function finish(
  drafts: DraftGate[],
  qubits: number,
  clbits: number,
  origin: SdkOrigin,
  notes: string[] = [],
): ParseResult {
  const lines = new Map<string, { line: number; column: number }>();
  const gates = layoutInOrder(
    drafts.map((d) => {
      const id = nextGateId();
      lines.set(id, { line: d.line, column: d.column });
      return {
        id,
        type: d.type,
        targets: d.targets,
        controls: d.controls,
        params: d.params,
        column: 0,
        ...(d.type === "measure" ? { clbit: d.clbit } : {}),
      };
    }),
  );

  const circuit: Circuit = {
    schema_version: SCHEMA_VERSION,
    qubits,
    clbits,
    gates,
    metadata: { sdk_origin: origin },
  };

  const { valid, errors } = validate(circuit);
  if (!valid) {
    const first = errors[0];
    const at = (first.gateId && lines.get(first.gateId)) || { line: 1, column: 1 };
    return { ok: false, error: { ...at, message: first.message } };
  }
  return { ok: true, circuit, notes };
}

/** "`sx` isn't in the supported gate set" — Design Doc §14, verbatim. */
export function unsupportedGate(name: string): string {
  return `\`${name}\` isn't in the supported gate set. See the gate reference.`;
}

/** Line and column of `offset` within text that starts at (line, column). */
export function positionIn(text: string, offset: number, line: number, column: number) {
  let l = line;
  let c = column;
  for (let i = 0; i < Math.min(offset, text.length); i++) {
    if (text[i] === "\n") { l += 1; c = 1; } else { c += 1; }
  }
  return { line: l, column: c };
}
