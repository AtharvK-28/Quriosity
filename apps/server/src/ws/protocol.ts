/**
 * The wire format — TRD §7.2.
 *
 * "All frames `{type, payload, ts}`." Server→client frame names are exactly the
 * ones the TRD lists. Client→server adds three the TRD puts on REST instead
 * (§7.1) — queueing and submitting — because a match already holds a socket
 * open and a second transport for two verbs would be a worse contract, not a
 * more faithful one. They are named in the same style so the table still reads
 * as one protocol.
 *
 * The typing is here rather than inline so both ends can be checked against one
 * definition, and so a frame the server does not understand is rejected by name
 * instead of by exception.
 */

import type { ArenaChallenge } from "../arena/service.ts";

export interface Frame<T = unknown> {
  type: string;
  payload: T;
  ts: number;
}

/* -- Server → client ---------------------------------------------------------- */

export type ServerFrame =
  | Frame<{ playerId: string; displayName: string; rating: number; gamesPlayed: number }> & { type: "session.ready" }
  | Frame<{ mode: string; waiting: number }> & { type: "queue.joined" }
  | Frame<Record<string, never>> & { type: "queue.left" }
  | Frame<{ reason: string }> & { type: "queue.timeout" }
  | Frame<{
      matchId: string; mode: string; challenge: ArenaChallenge;
      opponent: { name: string; rating: number };
    }> & { type: "match.found" }
  | Frame<{ gateCount: number; runCount: number }> & { type: "match.opponent_progress" }
  | Frame<{ passed: boolean; fidelity: number }> & { type: "match.graded" }
  | Frame<{
      matchId: string; winnerId: string | null; yourRating: number;
      delta: number; opponentRating: number; flagged: boolean; reason: string;
    }> & { type: "match.result" }
  | Frame<{ matchId: string; reason: string }> & { type: "match.abandoned" }
  | Frame<{ code: string; message: string }> & { type: "error" };

/* -- Client → server ---------------------------------------------------------- */

export const CLIENT_FRAMES = [
  "queue.join",
  "queue.leave",
  "match.progress",
  "match.heartbeat",
  "match.submit",
] as const;

export type ClientFrameType = (typeof CLIENT_FRAMES)[number];

export function frame<T>(type: string, payload: T): string {
  return JSON.stringify({ type, payload, ts: Date.now() });
}

export interface ParsedFrame {
  type: ClientFrameType;
  payload: Record<string, unknown>;
}

/**
 * Parse a client frame, or say why not.
 *
 * Everything arriving here is untrusted, so this never throws and never returns
 * a type the server does not already know how to handle.
 */
export function parseClientFrame(raw: string): { ok: true; frame: ParsedFrame } | { ok: false; reason: string } {
  if (raw.length > 256_000) return { ok: false, reason: "frame too large" };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "not JSON" };
  }

  if (!data || typeof data !== "object") return { ok: false, reason: "not an object" };
  const { type, payload } = data as { type?: unknown; payload?: unknown };

  if (typeof type !== "string") return { ok: false, reason: "missing type" };
  if (!(CLIENT_FRAMES as readonly string[]).includes(type)) {
    return { ok: false, reason: `unknown frame "${type.slice(0, 40)}"` };
  }

  return {
    ok: true,
    frame: {
      type: type as ClientFrameType,
      payload: (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>,
    },
  };
}
