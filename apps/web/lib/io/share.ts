/**
 * Circuits as links — PRD E11-S2, without a server.
 *
 * The permalink carries the circuit itself: a compact JSON form, base64url
 * encoded into the path. Nothing is uploaded and nothing is stored, so the link
 * works for anyone who has it, opens exactly this circuit, and cannot be edited
 * by whoever made it — which is what "opens the exact circuit read-only" asks
 * for. When circuits get server-side ids this is replaced by an id lookup and
 * the route keeps its shape.
 *
 * A link is untrusted input. Decoding rebuilds the IR field by field, gives
 * every gate a fresh id and runs full validation; anything that fails is
 * rejected whole rather than half-loaded.
 */

import { isGateType } from "../ir/gates";
import { validate } from "../ir/validate";
import {
  MAX_GATES, MAX_QUBITS, SCHEMA_VERSION, nextGateId, type Circuit, type Gate, type GateType,
} from "../ir/types";

const FORMAT = 1;
/** Links longer than this are refused before parsing. Roughly 500 gates. */
const MAX_ENCODED = 60_000;

type Packed = [type: GateType, targets: number[], controls: number[], params: number[], column: number, clbit?: number];

interface Envelope {
  f: number;
  q: number;
  c: number;
  n?: string;
  g: Packed[];
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

export function encodeCircuit(c: Circuit): string {
  const envelope: Envelope = {
    f: FORMAT,
    q: c.qubits,
    c: c.clbits,
    ...(c.metadata.name ? { n: c.metadata.name.slice(0, 80) } : {}),
    g: c.gates.map((g) => {
      const packed: Packed = [g.type, g.targets, g.controls, g.params.map((p) => Number(p.toFixed(12))), g.column];
      if (g.type === "measure") packed.push(g.clbit ?? 0);
      return packed;
    }),
  };
  return toBase64Url(new TextEncoder().encode(JSON.stringify(envelope)));
}

const ints = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length <= MAX_QUBITS && v.every((n) => Number.isInteger(n));
const nums = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length <= 4 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/** The circuit in a link, or null when the link is damaged or not a circuit. */
export function decodeCircuit(code: string): Circuit | null {
  if (!code || code.length > MAX_ENCODED || !/^[A-Za-z0-9_-]+$/.test(code)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(code)));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<Envelope>;
  if (e.f !== FORMAT || !Number.isInteger(e.q) || !Number.isInteger(e.c) || !Array.isArray(e.g)) return null;
  if (e.g.length > MAX_GATES) return null;

  const gates: Gate[] = [];
  for (const item of e.g) {
    if (!Array.isArray(item) || item.length < 5) return null;
    const [type, targets, controls, params, column, clbit] = item as unknown[];
    if (typeof type !== "string" || !isGateType(type)) return null;
    if (!ints(targets) || !ints(controls) || !nums(params) || !Number.isInteger(column)) return null;
    gates.push({
      id: nextGateId(),
      type,
      targets: [...targets],
      controls: [...controls],
      params: [...params],
      column: column as number,
      ...(type === "measure" ? { clbit: Number.isInteger(clbit) ? (clbit as number) : -1 } : {}),
    });
  }

  const circuit: Circuit = {
    schema_version: SCHEMA_VERSION,
    qubits: e.q as number,
    clbits: e.c as number,
    gates,
    metadata: {
      ...(typeof e.n === "string" && e.n.trim() ? { name: e.n.slice(0, 80) } : {}),
      sdk_origin: "canvas",
    },
  };
  return validate(circuit).valid ? circuit : null;
}

/** Set in session storage when a shared circuit is forked into the bench. */
export const FORK_FLAG = "quriosity.bench.forked";

/** The path a circuit is shared at. */
export function sharePath(c: Circuit): string {
  return `/build/${encodeCircuit(c)}`;
}
