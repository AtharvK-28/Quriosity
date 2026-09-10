/**
 * Canonical circuit hash — TRD §4.1.
 *
 * Two circuits that are physically identical must hash identically, or the
 * execution cache is useless. Canonical JSON therefore drops `id`, `metadata`
 * and every gate `id`, sorts gates by (column, lowest wire), and rounds params
 * to 9dp.
 *
 * The digest uses SubtleCrypto where it exists (browser and modern Node) and
 * falls back to a synchronous FNV-1a for the non-async call sites — the cache
 * key only has to be stable and collision-resistant enough for a keyspace of a
 * few thousand circuits per cohort, and the sync form keeps the store simple.
 */

import { inExecutionOrder } from "./validate";
import { gateQubits, type Circuit } from "./types";

/** The canonical form: everything that affects the physics, nothing that doesn't. */
export function canonicalJson(c: Circuit): string {
  const gates = inExecutionOrder(c.gates).map((g) => ({
    c: g.column,
    t: g.type,
    tg: [...g.targets],
    ct: [...g.controls],
    p: g.params.map((v) => Number(v.toFixed(9))),
    ...(g.clbit !== undefined ? { cb: g.clbit } : {}),
  }));
  return JSON.stringify({
    v: c.schema_version,
    q: c.qubits,
    cl: c.clbits,
    g: gates,
  });
}

/** Async SHA-256, matching the server's `ir_hash`. */
export async function irHash(c: Circuit): Promise<string> {
  const json = canonicalJson(c);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const bytes = new TextEncoder().encode(json);
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return fnv1a(json);
}

/** Synchronous fallback, used as an in-memory cache key. */
export function irHashSync(c: Circuit): string {
  return fnv1a(canonicalJson(c));
}

/**
 * A structural fingerprint that ignores parameter values and wire identity —
 * the tutor's phrasing cache is keyed on this so that "missing CNOT on a
 * two-wire circuit" reuses one cached explanation across every learner who
 * builds it (TRD §13.1, key = (misconception_id, ir_shape_hash)).
 */
export function irShapeHash(c: Circuit): string {
  const shape = inExecutionOrder(c.gates)
    .map((g) => `${g.type}:${gateQubits(g).length}`)
    .join(",");
  return fnv1a(`${c.qubits}|${shape}`);
}

/** 64-bit FNV-1a as two 32-bit halves, hex encoded. */
function fnv1a(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
