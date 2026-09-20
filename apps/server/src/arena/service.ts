/**
 * The arena, without a transport.
 *
 * Everything the match lifecycle does lives here and emits through `ArenaEvents`
 * — so the whole thing, including the part TRD §7.2 calls "the arena's trust
 * boundary", can be tested by calling methods rather than by opening sockets.
 * `src/ws/` is a thin adapter over this and holds no rules.
 *
 * THE TRUST BOUNDARY (TRD §7.2, §12.3). Nothing a client sends decides a match:
 *
 *   - the submitted IR is re-validated here before it is touched
 *   - it is simulated and graded HERE, with the same engine the client uses
 *   - `submitted_at` is this process's clock, never a client timestamp
 *   - `match.progress` is forwarded to the opponent for display and is never
 *     read when deciding anything
 *   - the result is computed once and sent to both players, so the two clients
 *     agree by construction rather than by negotiation
 */

import { randomUUID } from "node:crypto";
import { validate } from "../../../web/lib/ir/validate";
import { irHashSync } from "../../../web/lib/ir/hash";
import { gateCount, type Circuit } from "../../../web/lib/ir/types";
import { simulate } from "../../../web/lib/sim/statevector";
import { grade } from "../../../web/lib/grade/fidelity";
import type { Target } from "../../../web/lib/grade/fidelity";
import { createMatchmaker, type Matchmaker, type QueueEntry } from "./queue.ts";
import type { ArenaRepo } from "../db/repo.ts";

/** What both players are handed. E9-S2: identical, simultaneous. */
export interface ArenaChallenge {
  id: string;
  title: string;
  brief: string;
  qubits: number;
  target: Target;
  allowedGates: string[];
  par: number;
  starter?: unknown;
}

export interface ArenaEvents {
  matchFound(playerId: string, payload: {
    matchId: string; mode: string; challenge: ArenaChallenge;
    opponent: { name: string; rating: number };
  }): void;
  opponentProgress(playerId: string, payload: { gateCount: number; runCount: number }): void;
  matchResult(playerId: string, payload: {
    matchId: string; winnerId: string | null; yourRating: number;
    delta: number; opponentRating: number; flagged: boolean; reason: string;
  }): void;
  matchAbandoned(playerId: string, payload: { matchId: string; reason: string }): void;
  queueTimedOut(playerId: string): void;
}

/**
 * Below this, a pass is not physically plausible — the gates could not have
 * been placed. TRD §12.4's "impossible solve time" check. Flagged, not
 * rejected: the match is recorded and the rating is withheld.
 */
export const MIN_PLAUSIBLE_SOLVE_MS = 1_500;
/** 30s without a heartbeat starts the abandon clock (TRD §7.2). */
export const HEARTBEAT_TIMEOUT_MS = 30_000;

interface LiveMatch {
  id: string;
  mode: string;
  challenge: ArenaChallenge;
  a: string;
  b: string;
  startedAt: number;
  settled: boolean;
  lastSeen: Map<string, number>;
}

export interface Arena {
  queue(playerId: string, displayName: string, mode: string, now?: number): void;
  dequeue(playerId: string): void;
  /** Pair and expire. Call on an interval; the clock is an argument. */
  tick(now?: number): void;
  submit(playerId: string, ir: unknown, now?: number): SubmitOutcome;
  progress(playerId: string, p: { gateCount: number; runCount: number }): void;
  heartbeat(playerId: string, now?: number): void;
  disconnect(playerId: string, now?: number): void;
  matchFor(playerId: string): LiveMatch | null;
  inQueue(playerId: string): boolean;
}

export type SubmitOutcome =
  | { status: "no_match" }
  | { status: "invalid"; errors: string[] }
  | { status: "rejected"; reason: string }
  | { status: "graded"; passed: boolean; fidelity: number; won: boolean };

export function createArena(
  repo: ArenaRepo,
  opts: {
    events: ArenaEvents;
    challenges: ArenaChallenge[];
    /** Injected so a test gets the same match every time. */
    pick?: (mode: string) => ArenaChallenge;
    matchmaker?: Matchmaker;
  },
): Arena {
  const mm = opts.matchmaker ?? createMatchmaker();
  const live = new Map<string, LiveMatch>();
  const byPlayer = new Map<string, string>();
  const names = new Map<string, string>();

  const pick = opts.pick ?? (() => opts.challenges[Math.floor(Math.random() * opts.challenges.length)]);

  function finish(m: LiveMatch, outcome: "a" | "b" | "draw", flagged: boolean, reason: string, now: number) {
    if (m.settled) return;
    m.settled = true;

    const change = repo.settleMatch(m.id, outcome, flagged, now);
    const winnerId = outcome === "a" ? m.a : outcome === "b" ? m.b : null;

    // One computation, both players told the same thing (TRD §12.3 item 4).
    if (change) {
      opts.events.matchResult(m.a, {
        matchId: m.id, winnerId, yourRating: change.ratingA, delta: change.deltaA,
        opponentRating: change.ratingB, flagged, reason,
      });
      opts.events.matchResult(m.b, {
        matchId: m.id, winnerId, yourRating: change.ratingB, delta: change.deltaB,
        opponentRating: change.ratingA, flagged, reason,
      });
    }

    live.delete(m.id);
    byPlayer.delete(m.a);
    byPlayer.delete(m.b);
  }

  return {
    queue(playerId, displayName, mode, now = Date.now()) {
      names.set(playerId, displayName);
      const player = repo.touchPlayer(playerId, displayName);
      // Already mid-match: queueing again must not create a second one.
      if (byPlayer.has(playerId)) return;
      mm.join({ playerId, rating: player.rating, mode, joinedAt: now });
    },

    dequeue(playerId) {
      mm.leave(playerId);
    },

    tick(now = Date.now()) {
      for (const [ea, eb] of mm.pair(now)) {
        const challenge = pick(ea.mode);
        const id = randomUUID();
        const m: LiveMatch = {
          id, mode: ea.mode, challenge,
          a: ea.playerId, b: eb.playerId,
          startedAt: now, settled: false,
          lastSeen: new Map([[ea.playerId, now], [eb.playerId, now]]),
        };

        repo.createMatch({
          id, mode: ea.mode, challenge: { id: challenge.id, title: challenge.title },
          playerA: ea.playerId, playerB: eb.playerId,
          ratingABefore: ea.rating, ratingBBefore: eb.rating, startedAt: now,
        });

        live.set(id, m);
        byPlayer.set(ea.playerId, id);
        byPlayer.set(eb.playerId, id);

        const seat = (e: QueueEntry, other: QueueEntry) =>
          opts.events.matchFound(e.playerId, {
            matchId: id, mode: e.mode, challenge,
            opponent: { name: names.get(other.playerId) ?? "Opponent", rating: other.rating },
          });
        seat(ea, eb);
        seat(eb, ea);
      }

      for (const e of mm.expire(now)) opts.events.queueTimedOut(e.playerId);

      // Abandon a match whose player has gone quiet for too long.
      for (const m of [...live.values()]) {
        for (const p of [m.a, m.b]) {
          if (now - (m.lastSeen.get(p) ?? m.startedAt) >= HEARTBEAT_TIMEOUT_MS) {
            const other = p === m.a ? m.b : m.a;
            opts.events.matchAbandoned(other, { matchId: m.id, reason: "opponent disconnected" });
            finish(m, p === m.a ? "b" : "a", false, "opponent disconnected", now);
            break;
          }
        }
      }
    },

    submit(playerId, ir, now = Date.now()) {
      const matchId = byPlayer.get(playerId);
      const m = matchId ? live.get(matchId) : undefined;
      if (!m || m.settled) return { status: "no_match" };

      // Untrusted. Shape first, then the platform's own ten invariants.
      const circuit = ir as Circuit;
      if (!circuit || typeof circuit !== "object" || !Array.isArray(circuit.gates)) {
        return { status: "invalid", errors: ["not a circuit"] };
      }
      const v = validate(circuit);
      if (!v.valid) return { status: "invalid", errors: v.errors.map((e) => e.message) };
      if (circuit.qubits !== m.challenge.qubits) {
        return { status: "rejected", reason: `this match is ${m.challenge.qubits} qubits` };
      }

      const result = simulate(circuit);
      const g = grade(result, m.challenge.target);

      // The server clock, at the moment grading completed (TRD §12.3 item 2).
      // `now` defaults to Date.now(), so production reads the wall clock — but
      // it must be the SAME clock that stamped `startedAt`, or the duration is
      // a difference between two unrelated timelines.
      const submittedAt = now;
      const durationMs = submittedAt - m.startedAt;

      repo.recordSubmission({
        matchId: m.id, playerId, ir: circuit, irHash: irHashSync(circuit),
        passed: g.passed, fidelity: g.fidelity, gateCount: gateCount(circuit),
        submittedAt, durationMs,
      });

      if (!g.passed) return { status: "graded", passed: false, fidelity: g.fidelity, won: false };

      // First passing submission takes it. Ties on the same millisecond break
      // on submission id, which `submissionsFor` already orders by.
      const flagged = durationMs < MIN_PLAUSIBLE_SOLVE_MS;
      finish(m, playerId === m.a ? "a" : "b", flagged, flagged ? "flagged for review" : "solved first", now);
      return { status: "graded", passed: true, fidelity: g.fidelity, won: true };
    },

    progress(playerId, p) {
      // Advisory display only. Never read when deciding anything.
      const matchId = byPlayer.get(playerId);
      const m = matchId ? live.get(matchId) : undefined;
      if (!m) return;
      const other = playerId === m.a ? m.b : m.a;
      opts.events.opponentProgress(other, {
        gateCount: Math.max(0, Math.floor(p.gateCount) || 0),
        runCount: Math.max(0, Math.floor(p.runCount) || 0),
      });
    },

    heartbeat(playerId, now = Date.now()) {
      const matchId = byPlayer.get(playerId);
      const m = matchId ? live.get(matchId) : undefined;
      if (m) m.lastSeen.set(playerId, now);
    },

    disconnect(playerId) {
      // Leaving the queue is immediate. A match is NOT: TRD §9 (E9-S9) gives
      // 30 seconds to reconnect, and that clock is already running off the last
      // heartbeat — so dropping the socket does nothing here on purpose, and
      // `tick` abandons the match only once the grace has actually elapsed.
      mm.leave(playerId);
    },

    matchFor(playerId) {
      const id = byPlayer.get(playerId);
      return id ? live.get(id) ?? null : null;
    },

    inQueue(playerId) {
      return mm.has(playerId);
    },
  };
}
