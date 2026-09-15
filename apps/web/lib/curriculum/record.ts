/**
 * Completion records — PRD E8-S5, job J7 ("prove to my manager that I did it").
 *
 * "Record includes track, date, node list, and a verification URL." The
 * verification URL is the record: its contents are encoded into the link with
 * a checksum over them, and the record page recomputes the checksum and says
 * whether the two agree.
 *
 * What that proves, stated plainly on the page itself: that the record has not
 * been edited since it was issued. It does not prove who earned it, because
 * nothing in a browser can — there is no account and no signing key. When the
 * server exists it signs the same payload and this module swaps its checksum
 * for a signature; the link shape and the page stay the same.
 */

import { TRACKS_BY_ID, trackNodes, type Track } from "./tracks";
import type { NodeProgress } from "@/stores/sessionStore";

export interface CompletionRecord {
  v: 1;
  track: string;
  /** As the learner chose to put it on the record. */
  name: string;
  /** ISO date, day precision. */
  issued: string;
  nodes: string[];
  capstones: string[];
  /** First-attempt accuracy across the track's nodes, 0–100. */
  firstTry: number;
}

/** Changing this invalidates every record, which is the point of having it. */
const DOMAIN = "quriosity.record.v1";

function fnv(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

function canonical(r: CompletionRecord): string {
  return JSON.stringify([r.v, r.track, r.name, r.issued, r.nodes, r.capstones, r.firstTry]);
}

function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(text: string): string {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function buildRecord(
  track: Track,
  name: string,
  progress: Record<string, NodeProgress>,
  now = new Date(),
): CompletionRecord {
  const nodes = trackNodes(track);
  const firstTry = nodes.length === 0
    ? 0
    : Math.round((nodes.filter((n) => progress[n.id]?.firstAttemptCorrect).length / nodes.length) * 100);
  return {
    v: 1,
    track: track.id,
    name: name.trim().slice(0, 60) || "Anonymous learner",
    issued: now.toISOString().slice(0, 10),
    nodes: nodes.map((n) => n.id),
    capstones: [...track.capstones],
    firstTry,
  };
}

export function encodeRecord(r: CompletionRecord): string {
  const body = canonical(r);
  return `${b64url(body)}.${fnv(DOMAIN + body)}`;
}

export type RecordReading =
  | { status: "intact"; record: CompletionRecord; track: Track }
  | { status: "altered"; record: CompletionRecord; track: Track | null }
  | { status: "unreadable" };

export function readRecord(code: string): RecordReading {
  const [body, sum] = code.split(".");
  if (!body || !sum || code.length > 4000) return { status: "unreadable" };

  let parsed: unknown;
  let text: string;
  try {
    text = unb64url(body);
    parsed = JSON.parse(text);
  } catch {
    return { status: "unreadable" };
  }
  if (!Array.isArray(parsed) || parsed.length !== 7) return { status: "unreadable" };
  const [v, track, name, issued, nodes, capstones, firstTry] = parsed as unknown[];
  const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");
  if (v !== 1 || typeof track !== "string" || typeof name !== "string" || typeof issued !== "string"
    || !strings(nodes) || !strings(capstones) || typeof firstTry !== "number") {
    return { status: "unreadable" };
  }

  const record: CompletionRecord = { v: 1, track, name, issued, nodes, capstones, firstTry };
  const t = TRACKS_BY_ID.get(track) ?? null;
  const intact = fnv(DOMAIN + text) === sum && canonical(record) === text && t !== null;
  return intact ? { status: "intact", record, track: t! } : { status: "altered", record, track: t };
}
