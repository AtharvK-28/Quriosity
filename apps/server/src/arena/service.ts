/**
 * The arena, without a transport.
 *
 * Everything the match lifecycle does lives here and emits through `ArenaEvents`
 * — so the whole thing, including the part TRD §7.2 calls "the arena's trust
 * boundary", can be tested by calling methods rather than by opening sockets.
 * `src/ws/` is a thin adapter over this and holds no rules.
 *
 * ORDERING. The repository is async (Postgres), but every decision that
 * orders events — who is paired, who submitted first, who won — is taken
 * synchronously in memory before anything is awaited. A match is claimed as
 * settled in the same tick its winning submission is graded, so two passes
 * arriving together cannot both win while a database write is in flight.
 *
 * MODES (PRD E9-S6). Three, sharing one trust boundary:
 *
 *   blitz    the first correct circuit wins.
 *   bughunt  both start from the same broken circuit; the first correct fix
 *            wins — blitz from a different starting point.
 *   golf     a time cap, and the fewest gates wins. Players may keep
 *            submitting to improve until the cap; a tie on gates goes to
 *            whoever reached that count first. It ends early once both have
 *            reached par, since neither can then be beaten on count.
 *
 * WHAT MAKES IT A GAME, not just a race (after how chess sites do it):
 *
 *   countdown  both players see the target for a few seconds before the clock
 *              starts; nothing submitted before then counts.
 *   bots       nobody near your rating? After a short wait you play a bot —
 *              unrated, clearly labelled, and still worth your daily quests.
 *   emotes     a fixed set ("good luck", "well played"…). No free text, so
 *              nothing to moderate.
 *   rematch    both press it within 30 seconds and the same pair plays again.
 *   review     once it is over, each player sees the other's winning circuit.
 *              Never during: TRD §7.2 still holds for a live match.
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
import { isBot, pickBot, planBot, type BotPlan } from "./bots.ts";
import type { ArenaRepo } from "../db/repo.ts";

export type ArenaMode = "blitz" | "golf" | "bughunt";
export const ARENA_MODES: ArenaMode[] = ["blitz", "golf", "bughunt"];

/** What both players are handed. E9-S2: identical, simultaneous. */
export interface ArenaChallenge {
  id: string;
  title: string;
  brief: string;
  kind: "reach" | "golf" | "bughunt";
  qubits: number;
  target: Target;
  allowedGates: string[];
  par: number;
  starter?: unknown;
  /**
   * Canonical hash of the challenge's own reference answer — what TRD §12.4's
   * copy check compares against. Server-side only; never sent to a player.
   */
  referenceHash?: string;
  /** The reference answer itself — what a bot "played", shown after a match. Server-side only. */
  reference?: Circuit;
}

/** Which challenges each mode draws from. */
export function poolFor(mode: string, challenges: ArenaChallenge[]): ArenaChallenge[] {
  const pool =
    mode === "golf" ? challenges.filter((c) => c.kind === "golf")
      : mode === "bughunt" ? challenges.filter((c) => c.kind === "bughunt")
        : challenges.filter((c) => c.kind !== "bughunt");
  return pool.length > 0 ? pool : challenges;
}

/** The one set of emotes. Anything else is dropped. */
export const EMOTES = ["gl", "gg", "nice", "wow", "oops", "hurry"] as const;
export type Emote = (typeof EMOTES)[number];

export interface Opponent {
  name: string;
  rating: number;
  bot: boolean;
  gamesPlayed?: number;
}

/** After a match: the answers, so both sides can see how the other did it. */
export interface MatchReview {
  yours: { gates: number; ms: number } | null;
  theirs: { gates: number; ms: number; circuit: Circuit } | null;
}

export interface ArenaEvents {
  matchFound(playerId: string, payload: {
    matchId: string; mode: string; challenge: ArenaChallenge;
    opponent: Opponent;
    /** Golf only: how long the match runs, in ms. */
    capMs: number | null;
    /** When the clock starts, on the server's clock, and the server's clock now. */
    startsAt: number;
    serverNow: number;
    rated: boolean;
  }): void;
  opponentProgress(playerId: string, payload: { gateCount: number; runCount: number }): void;
  matchResult(playerId: string, payload: {
    matchId: string; winnerId: string | null; yourRating: number;
    delta: number; opponentRating: number; flagged: boolean; reason: string;
    rated: boolean; review: MatchReview;
  }): void;
  matchAbandoned(playerId: string, payload: { matchId: string; reason: string }): void;
  queueTimedOut(playerId: string): void;
  emote?(playerId: string, payload: { emote: Emote; from: "opponent" }): void;
  /**
   * The play-by-play: the other side submitted and missed, or (golf) scored.
   * A fidelity rounded to two places and a gate count — never the circuit.
   */
  opponentEvent?(playerId: string, payload: { kind: "miss" | "scored"; fidelity: number; gates?: number }): void;
  rematchOffered?(playerId: string, payload: { from: string }): void;
}

/**
 * Below this, a pass is not physically plausible — the gates could not have
 * been placed. TRD §12.4's "impossible solve time" check. Flagged, not
 * rejected: the match is recorded and the rating is withheld.
 */
export const MIN_PLAUSIBLE_SOLVE_MS = 1_500;
/**
 * TRD §12.4's copy check: the challenge's own reference answer, submitted
 * exactly, on a first attempt, faster than this. Each part alone is innocent —
 * H then CNOT IS the natural Bell circuit — so only all three together flag.
 */
export const COPY_FLOOR_MS = 8_000;
/** How long a golf match runs before the best counts are compared. */
export const GOLF_CAP_MS = 180_000;
/** 30s without a heartbeat starts the abandon clock (TRD §7.2). */
export const HEARTBEAT_TIMEOUT_MS = 30_000;
/** How long a waiting player is offered a human before a bot steps in. */
export const BOT_AFTER_MS = 15_000;
/** How long after a match both players can ask for a rematch. */
export const REMATCH_WINDOW_MS = 30_000;
const EMOTE_GAP_MS = 1_500;

export type BotPreference = "auto" | "now" | "never";

interface LiveMatch {
  id: string;
  /** The match row's insert. Submissions wait on it — they reference it. */
  created: Promise<void>;
  mode: string;
  challenge: ArenaChallenge;
  a: string;
  b: string;
  /** The moment play begins — after the countdown. */
  startedAt: number;
  settled: boolean;
  rated: boolean;
  lastSeen: Map<string, number>;
  /** Golf: the moment the cap falls. Null in the other modes. */
  deadline: number | null;
  /** Submissions so far, per player — the copy check wants the first. */
  attempts: Map<string, number>;
  /** Golf: each player's best passing circuit so far. */
  best: Map<string, { gates: number; at: number; flagged: boolean }>;
  /** Each player's latest passing circuit, for the review. */
  passing: Map<string, { circuit: Circuit; gates: number; at: number }>;
  /** The bot's side of it, if b is a bot. */
  bot: BotPlan | null;
  botStep: number;
}

interface Recent {
  matchId: string;
  mode: string;
  a: string;
  b: string;
  until: number;
  offers: Set<string>;
}

export interface Arena {
  queue(playerId: string, displayName: string, mode: string, now?: number, bots?: BotPreference): Promise<void>;
  dequeue(playerId: string): void;
  /**
   * Pair and expire. Call on an interval; the clock is an argument. The
   * pairing itself is synchronous; the promise settles once it is persisted.
   */
  tick(now?: number): Promise<void>;
  submit(playerId: string, ir: unknown, now?: number): Promise<SubmitOutcome>;
  progress(playerId: string, p: { gateCount: number; runCount: number }): void;
  emote(playerId: string, emote: string, now?: number): boolean;
  /** Give the match up — the other side wins, as in chess. */
  resign(playerId: string, now?: number): Promise<boolean>;
  /** Ask for a rematch. Resolves true if one started. */
  rematch(playerId: string, now?: number): Promise<boolean>;
  heartbeat(playerId: string, now?: number): void;
  disconnect(playerId: string, now?: number): void;
  matchFor(playerId: string): LiveMatch | null;
  inQueue(playerId: string): boolean;
  /** For the lobby: how many are waiting, and how many matches are on. */
  stats(): { queued: number; live: number };
}

export type SubmitOutcome =
  | { status: "no_match" }
  | { status: "invalid"; errors: string[] }
  | { status: "rejected"; reason: string }
  | { status: "graded"; passed: boolean; fidelity: number; won: boolean; best: number | null };

export function createArena(
  repo: ArenaRepo,
  opts: {
    events: ArenaEvents;
    challenges: ArenaChallenge[];
    /** Injected so a test gets the same match every time. */
    pick?: (mode: string) => ArenaChallenge;
    matchmaker?: Matchmaker;
    /** Seconds of look-before-you-leap. 0 in tests that time submissions. */
    countdownMs?: number;
    /** Wait before a bot steps in. */
    botAfterMs?: number;
    random?: () => number;
  },
): Arena {
  const mm = opts.matchmaker ?? createMatchmaker();
  const live = new Map<string, LiveMatch>();
  const byPlayer = new Map<string, string>();
  const names = new Map<string, string>();
  const botPrefs = new Map<string, BotPreference>();
  const recent = new Map<string, Recent>();
  const emoteAt = new Map<string, number>();
  const countdown = opts.countdownMs ?? 0;
  const botAfter = opts.botAfterMs ?? BOT_AFTER_MS;
  const random = opts.random ?? Math.random;
  /** Bot "gg"s and rematch answers, due at a time. */
  const later: Array<{ at: number; run: () => void | Promise<unknown> }> = [];

  const pick = opts.pick ?? ((mode: string) => {
    const pool = poolFor(mode, opts.challenges);
    return pool[Math.floor(random() * pool.length)];
  });

  const shown = (c: ArenaChallenge) => {
    // The reference and its hash stay here: they are how copying is caught.
    const { referenceHash: _h, reference: _r, ...rest } = c;
    return rest;
  };

  function startMatch(
    ea: { playerId: string; rating: number; gamesPlayed?: number },
    eb: { playerId: string; rating: number; gamesPlayed?: number; name?: string },
    mode: string,
    now: number,
    plan: BotPlan | null,
    /** Already chosen — a bot's plan depends on the par. */
    chosen?: ArenaChallenge,
  ): Promise<void> {
    const challenge = chosen ?? pick(mode);
    const id = randomUUID();
    const rated = plan === null;
    const startedAt = now + countdown;
    const golf = mode === "golf";
    const created = repo.createMatch({
      id, mode, challenge: { id: challenge.id, title: challenge.title },
      playerA: ea.playerId, playerB: eb.playerId,
      ratingABefore: ea.rating, ratingBBefore: eb.rating, startedAt, rated,
    });
    const m: LiveMatch = {
      id, created, mode, challenge,
      a: ea.playerId, b: eb.playerId,
      startedAt, settled: false, rated,
      lastSeen: new Map([[ea.playerId, now], [eb.playerId, now]]),
      deadline: golf ? startedAt + GOLF_CAP_MS : null,
      attempts: new Map(),
      best: new Map(),
      passing: new Map(),
      bot: plan,
      botStep: 0,
    };
    live.set(id, m);
    byPlayer.set(ea.playerId, id);
    if (!plan) byPlayer.set(eb.playerId, id);

    const seat = (to: string, other: { playerId: string; rating: number; gamesPlayed?: number; name?: string }) =>
      opts.events.matchFound(to, {
        matchId: id, mode, challenge: shown(challenge) as ArenaChallenge,
        opponent: {
          name: other.name ?? names.get(other.playerId) ?? "Opponent",
          rating: other.rating,
          bot: isBot(other.playerId),
          gamesPlayed: other.gamesPlayed,
        },
        capMs: golf ? GOLF_CAP_MS : null,
        startsAt: startedAt,
        serverNow: now,
        rated,
      });
    seat(ea.playerId, eb);
    if (!plan) seat(eb.playerId, ea);
    if (plan?.greets) later.push({ at: startedAt - Math.min(countdown, 1500) + 800, run: () => opts.events.emote?.(ea.playerId, { emote: "gl", from: "opponent" }) });
    return created;
  }

  async function botMatch(e: QueueEntry, now: number): Promise<void> {
    const bot = pickBot(e.rating, random);
    names.set(bot.id, bot.name);
    await repo.touchPlayer(bot.id, bot.name);
    const challenge = pick(e.mode);
    const plan = planBot(bot, e.mode, challenge.par, now + countdown, e.mode === "golf" ? GOLF_CAP_MS : null, random);
    await startMatch(
      { playerId: e.playerId, rating: e.rating },
      { playerId: bot.id, rating: bot.rating, name: bot.name },
      e.mode, now, plan, challenge,
    );
  }

  /**
   * Golf's result: the fewer gates wins; equal counts go to whoever got there
   * first; nobody correct is a draw. Flagged if the winning circuit was.
   */
  function settleGolf(m: LiveMatch, reason: string, now: number) {
    const a = m.best.get(m.a);
    const b = m.best.get(m.b);
    let outcome: "a" | "b" | "draw" = "draw";
    if (a && b) outcome = a.gates !== b.gates ? (a.gates < b.gates ? "a" : "b") : a.at !== b.at ? (a.at < b.at ? "a" : "b") : "draw";
    else if (a) outcome = "a";
    else if (b) outcome = "b";
    const flagged = outcome === "a" ? a!.flagged : outcome === "b" ? b!.flagged : false;
    const why = outcome === "draw" ? (a || b ? "same gates, same moment" : "nobody reached the target") : reason;
    return finish(m, outcome, flagged, flagged ? "flagged for review" : why, now);
  }

  function reviewFor(m: LiveMatch, player: string): MatchReview {
    const other = player === m.a ? m.b : m.a;
    const mine = m.passing.get(player);
    const theirs = m.passing.get(other);
    return {
      yours: mine ? { gates: mine.gates, ms: Math.max(0, mine.at - m.startedAt) } : null,
      theirs: theirs ? { gates: theirs.gates, ms: Math.max(0, theirs.at - m.startedAt), circuit: theirs.circuit } : null,
    };
  }

  /** Claims the match synchronously, then persists and announces the result. */
  async function finish(m: LiveMatch, outcome: "a" | "b" | "draw", flagged: boolean, reason: string, now: number) {
    if (m.settled) return;
    m.settled = true;
    live.delete(m.id);
    byPlayer.delete(m.a);
    byPlayer.delete(m.b);

    await m.created;
    const change = await repo.settleMatch(m.id, outcome, flagged, now);
    const winnerId = outcome === "a" ? m.a : outcome === "b" ? m.b : null;

    // One computation, both players told the same thing (TRD §12.3 item 4).
    if (change) {
      opts.events.matchResult(m.a, {
        matchId: m.id, winnerId, yourRating: change.ratingA, delta: change.deltaA,
        opponentRating: change.ratingB, flagged, reason, rated: m.rated, review: reviewFor(m, m.a),
      });
      if (!m.bot) {
        opts.events.matchResult(m.b, {
          matchId: m.id, winnerId, yourRating: change.ratingB, delta: change.deltaB,
          opponentRating: change.ratingA, flagged, reason, rated: m.rated, review: reviewFor(m, m.b),
        });
      }
    }

    const r: Recent = { matchId: m.id, mode: m.mode, a: m.a, b: m.b, until: now + REMATCH_WINDOW_MS, offers: new Set() };
    recent.set(m.a, r);
    recent.set(m.b, r);
    if (m.bot && random() < 0.6) {
      later.push({ at: now + 900, run: () => opts.events.emote?.(m.a, { emote: "gg", from: "opponent" }) });
    }
  }

  async function botSolves(m: LiveMatch, now: number) {
    const plan = m.bot!;
    const circuit = m.challenge.reference;
    if (circuit) m.passing.set(m.b, { circuit, gates: plan.gates, at: now });
    if (m.mode === "golf") {
      const prev = m.best.get(m.b);
      if (!prev || plan.gates < prev.gates) m.best.set(m.b, { gates: plan.gates, at: now, flagged: false });
      const a = m.best.get(m.a);
      const b = m.best.get(m.b);
      if (a && b && a.gates <= m.challenge.par && b.gates <= m.challenge.par) await settleGolf(m, "fewest gates", now);
      return;
    }
    await finish(m, "b", false, "solved first", now);
  }

  return {
    async queue(playerId, displayName, mode, now = Date.now(), bots = "never") {
      names.set(playerId, displayName);
      botPrefs.set(playerId, bots);
      recent.delete(playerId);
      // Already mid-match: queueing again must not create a second one.
      if (byPlayer.has(playerId)) return;
      const player = await repo.touchPlayer(playerId, displayName);
      if (byPlayer.has(playerId)) return;
      mm.join({ playerId, rating: player.rating, mode, joinedAt: now });
    },

    dequeue(playerId) {
      mm.leave(playerId);
    },

    async tick(now = Date.now()) {
      const pending: Promise<unknown>[] = [];

      for (const [ea, eb] of mm.pair(now)) {
        pending.push(startMatch(ea, eb, ea.mode, now, null));
      }

      // Nobody near your rating: a bot, if you said bots were fine.
      for (const e of mm.waiting()) {
        const pref = botPrefs.get(e.playerId) ?? "never";
        if (pref === "now" || (pref === "auto" && now - e.joinedAt >= botAfter)) {
          mm.leave(e.playerId);
          pending.push(botMatch(e, now));
        }
      }

      for (const e of mm.expire(now)) opts.events.queueTimedOut(e.playerId);

      for (const m of [...live.values()]) {
        // The bot plays its plan out on the clock.
        if (m.bot && !m.settled) {
          while (m.botStep < m.bot.progress.length && m.bot.progress[m.botStep].at <= now) {
            const prev = m.bot.progress[m.botStep - 1];
            const p = m.bot.progress[m.botStep++];
            opts.events.opponentProgress(m.a, { gateCount: p.gateCount, runCount: p.runCount });
            // A bot that runs sometimes submits too early, like anyone.
            if (prev && p.runCount > prev.runCount && random() < 0.4) {
              opts.events.opponentEvent?.(m.a, { kind: "miss", fidelity: Math.round((0.35 + random() * 0.55) * 100) / 100 });
            }
          }
          if (m.bot.solveAt !== null && now >= m.bot.solveAt && !m.passing.has(m.b)) pending.push(botSolves(m, now));
        }
        // Golf: the cap has fallen, so the best counts are final.
        if (m.deadline !== null && now >= m.deadline && !m.settled) pending.push(settleGolf(m, "fewest gates", now));
      }

      // Abandon a match whose player has gone quiet for too long.
      for (const m of [...live.values()]) {
        if (m.settled) continue;
        for (const p of [m.a, m.b]) {
          if (isBot(p)) continue;
          if (now - (m.lastSeen.get(p) ?? m.startedAt) >= HEARTBEAT_TIMEOUT_MS) {
            const other = p === m.a ? m.b : m.a;
            opts.events.matchAbandoned(other, { matchId: m.id, reason: "opponent disconnected" });
            pending.push(finish(m, p === m.a ? "b" : "a", false, "opponent disconnected", now));
            break;
          }
        }
      }

      // Anything due: a bot's "gg", its answer to a rematch.
      for (let i = later.length - 1; i >= 0; i--) {
        if (later[i].at <= now) {
          const [job] = later.splice(i, 1);
          const out = job.run();
          if (out) pending.push(out);
        }
      }

      for (const [id, r] of recent) if (now > r.until) recent.delete(id);

      await Promise.all(pending);
    },

    async submit(playerId, ir, now = Date.now()) {
      const matchId = byPlayer.get(playerId);
      const m = matchId ? live.get(matchId) : undefined;
      if (!m || m.settled) return { status: "no_match" };
      if (now < m.startedAt) return { status: "rejected", reason: "the match hasn't started yet" };

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

      const attempt = (m.attempts.get(playerId) ?? 0) + 1;
      m.attempts.set(playerId, attempt);
      const irHash = irHashSync(circuit);
      const copied = attempt === 1 && irHash === m.challenge.referenceHash && durationMs < COPY_FLOOR_MS;
      const suspicious = copied || durationMs < MIN_PLAUSIBLE_SOLVE_MS;
      const gates = gateCount(circuit);
      if (g.passed) {
        const prev = m.passing.get(playerId);
        if (!prev || m.mode !== "golf" || gates < prev.gates) m.passing.set(playerId, { circuit, gates, at: now });
      }

      // Decided here, before any await, so a submission graded a moment later
      // finds the match already settled.
      let wins = false;
      let settling: Promise<void> | null = null;
      if (m.mode === "golf") {
        if (g.passed) {
          const prev = m.best.get(playerId);
          if (!prev || gates < prev.gates) m.best.set(playerId, { gates, at: now, flagged: suspicious });
        }
        const a = m.best.get(m.a);
        const b = m.best.get(m.b);
        if (a && b && a.gates <= m.challenge.par && b.gates <= m.challenge.par) {
          settling = settleGolf(m, "fewest gates", now);
        }
      } else if (g.passed && !m.settled) {
        // First passing submission takes it.
        wins = true;
        settling = finish(m, playerId === m.a ? "a" : "b", suspicious, suspicious ? "flagged for review" : "solved first", now);
      }

      // The play-by-play for the other side (never the circuit).
      const other = playerId === m.a ? m.b : m.a;
      if (!isBot(other) && !m.settled) {
        if (!g.passed) opts.events.opponentEvent?.(other, { kind: "miss", fidelity: Math.round(g.fidelity * 100) / 100 });
        else if (m.mode === "golf") opts.events.opponentEvent?.(other, { kind: "scored", fidelity: 1, gates });
      }

      await m.created;
      await repo.recordSubmission({
        matchId: m.id, playerId, ir: circuit, irHash,
        passed: g.passed, fidelity: g.fidelity, gateCount: gates,
        submittedAt, durationMs,
      });
      await settling;

      return { status: "graded", passed: g.passed, fidelity: g.fidelity, won: wins, best: m.best.get(playerId)?.gates ?? null };
    },

    progress(playerId, p) {
      // Advisory display only. Never read when deciding anything.
      const matchId = byPlayer.get(playerId);
      const m = matchId ? live.get(matchId) : undefined;
      if (!m) return;
      const other = playerId === m.a ? m.b : m.a;
      if (isBot(other)) return;
      opts.events.opponentProgress(other, {
        gateCount: Math.max(0, Math.floor(p.gateCount) || 0),
        runCount: Math.max(0, Math.floor(p.runCount) || 0),
      });
    },

    emote(playerId, emote, now = Date.now()) {
      if (!(EMOTES as readonly string[]).includes(emote)) return false;
      const matchId = byPlayer.get(playerId);
      const m = matchId ? live.get(matchId) : undefined;
      // In a match, or just after one — "gg" is sent once it is over.
      const r = recent.get(playerId);
      const pair = m ? { a: m.a, b: m.b } : r && now <= r.until ? { a: r.a, b: r.b } : null;
      if (!pair) return false;
      if (now - (emoteAt.get(playerId) ?? 0) < EMOTE_GAP_MS) return false;
      emoteAt.set(playerId, now);
      const other = playerId === pair.a ? pair.b : pair.a;
      if (isBot(other)) {
        // Bots are polite.
        if (emote === "gl" || emote === "gg") later.push({ at: now + 700, run: () => opts.events.emote?.(playerId, { emote, from: "opponent" }) });
        return true;
      }
      opts.events.emote?.(other, { emote: emote as Emote, from: "opponent" });
      return true;
    },

    async resign(playerId, now = Date.now()) {
      const matchId = byPlayer.get(playerId);
      const m = matchId ? live.get(matchId) : undefined;
      if (!m || m.settled) return false;
      await finish(m, playerId === m.a ? "b" : "a", false, "resigned", now);
      return true;
    },

    async rematch(playerId, now = Date.now()) {
      const r = recent.get(playerId);
      if (!r || now > r.until || byPlayer.has(playerId)) return false;
      r.offers.add(playerId);
      const other = playerId === r.a ? r.b : r.a;
      if (isBot(other)) r.offers.add(other);
      else opts.events.rematchOffered?.(other, { from: names.get(playerId) ?? "Your opponent" });
      if (!r.offers.has(r.a) || !r.offers.has(r.b)) return false;

      recent.delete(r.a);
      recent.delete(r.b);
      const pa = await repo.getPlayer(r.a);
      const pb = await repo.getPlayer(r.b);
      if (!pa || !pb) return false;
      if (isBot(r.b)) {
        const bot = { id: r.b, name: names.get(r.b) ?? pb.displayName, rating: pb.rating };
        const challenge = pick(r.mode);
        const plan = planBot(bot, r.mode, challenge.par, now + countdown, r.mode === "golf" ? GOLF_CAP_MS : null, random);
        await startMatch({ playerId: r.a, rating: pa.rating }, { playerId: r.b, rating: pb.rating, name: bot.name }, r.mode, now, plan, challenge);
      } else {
        await startMatch({ playerId: r.a, rating: pa.rating, gamesPlayed: pa.gamesPlayed }, { playerId: r.b, rating: pb.rating, gamesPlayed: pb.gamesPlayed }, r.mode, now, null);
      }
      return true;
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

    stats() {
      return { queued: mm.size(), live: live.size };
    },
  };
}
