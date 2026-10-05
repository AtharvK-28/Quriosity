/**
 * Completion records — PRD E8-S5, job J7 ("prove to my manager that I did it").
 *
 * "Record includes track, date, node list, and a verification URL." The
 * verification URL is the record: its contents are encoded into the link with
 * a checksum over them, and the record page recomputes the checksum and says
 * whether the two agree.
 *
 * What the checksum proves, stated plainly on the page itself: that the record
 * has not been edited since it was issued. It does not prove who earned it,
 * because nothing in a browser can. A signed-in learner can have the server
 * issue it instead (apps/server/src/records): the server rebuilds the record
 * from the account's synced progress and appends an Ed25519 signature, so the
 * link gains a third part and the page can say whose work it is.
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

/**
 * A record code is `body.checksum`, or `body.checksum.signature` once the
 * server has signed it. The signature covers `body`, which is the record
 * itself, so a signed record is also a checksummed one.
 */
export function splitRecordCode(code: string): { body: string; sum: string; signature: string | null } {
  const [body = "", sum = "", signature] = code.split(".");
  return { body, sum, signature: signature || null };
}

export type RecordReading =
  | { status: "intact"; record: CompletionRecord; track: Track; signature: string | null }
  | { status: "altered"; record: CompletionRecord; track: Track | null; signature: string | null }
  | { status: "unreadable" };

export function readRecord(code: string): RecordReading {
  const { body, sum, signature } = splitRecordCode(code);
  if (!body || !sum || code.length > 4000 || code.split(".").length > 3) return { status: "unreadable" };

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
  return intact
    ? { status: "intact", record, track: t!, signature }
    : { status: "altered", record, track: t, signature };
}
