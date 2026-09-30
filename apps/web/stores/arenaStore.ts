"use client";

/**
 * The arena client.
 *
 * One socket, one state machine. The phases are what the screen actually shows:
 *
 *   offline → connecting → idle → queued → matched → finished
 *
 * WHAT THIS STORE IS NOT ALLOWED TO DO. It never decides anything about a
 * match. The winner, the ratings and the grade all arrive from the server;
 * nothing here computes them, and there is deliberately no local grading path
 * that could disagree with the server's. The client's own simulator is still
 * used while building — pressing Run during a match is the same local loop as
 * anywhere else — but Submit sends the circuit and waits to be told.
 *
 * What it does add is everything around a match that makes it a game: the
 * countdown, emotes, the rematch handshake, the post-match review, and the
 * player's record (rank, history, streak) — and it tells the session store
 * when a match ends, so arena play counts toward XP, quests and the streak.
 *
 * The arena is the only surface that needs a server. Everything else in this
 * app keeps working with it stopped, so a failure here degrades to "ranked play
 * is unavailable" and never to a broken page.
 */

import { create } from "zustand";
import type { Circuit } from "@/lib/ir/types";
import { api, freshToken, useAuth } from "@/stores/authStore";
import { useSession } from "@/stores/sessionStore";
import { arenaHttpBase, arenaSocketBase, isLocalPage } from "@/lib/arena/server";
import { play } from "@/lib/arena/sfx";
import { badgesFor } from "@/lib/arena/badges";
import { rankChange } from "@/lib/arena/tiers";
import { announce } from "@/lib/rewards";

/** "signed-out": ranked play needs an account (PRD §6.4); the page says so. */
export type ArenaPhase = "signed-out" | "offline" | "connecting" | "idle" | "queued" | "matched" | "finished";

export type ArenaMode = "blitz" | "golf" | "bughunt";

export type Emote = "gl" | "gg" | "nice" | "wow" | "oops" | "hurry";

export const EMOTE_TEXT: Record<Emote, string> = {
  gl: "Good luck!",
  gg: "Good game",
  nice: "Nice one",
  wow: "Wow",
  oops: "Oops",
  hurry: "Clock's ticking",
};

export interface ArenaChallenge {
  id: string;
  title: string;
  brief: string;
  starter?: Array<{ type: string; targets: number[]; controls?: number[]; params?: number[]; column: number }>;
  qubits: number;
  target: unknown;
  allowedGates: string[];
  par: number;
}

export interface Opponent {
  name: string;
  rating: number;
  bot: boolean;
  gamesPlayed?: number;
}

export interface MatchReview {
  yours: { gates: number; ms: number } | null;
  theirs: { gates: number; ms: number; circuit: Circuit } | null;
}

export interface MatchResult {
  matchId: string;
  winnerId: string | null;
  yourRating: number;
  delta: number;
  opponentRating: number;
  flagged: boolean;
  reason: string;
  rated: boolean;
  review: MatchReview | null;
  /** Filled in here: what the match earned, for the result screen. */
  xp: number;
  ratingBefore: number;
}

export interface ProfileMatch {
  id: string;
  mode: string;
  rated: boolean;
  opponent: string;
  bot: boolean;
  result: "win" | "loss" | "draw";
  delta: number;
  ratingAfter: number;
  at: number;
}

export interface ArenaProfile {
  matches: ProfileMatch[];
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  bestRating: number;
}

interface ArenaState {
  phase: ArenaPhase;
  /** Why the socket is not up, when it is not. */
  problem: string | null;

  playerId: string;
  rating: number;
  gamesPlayed: number;
  profile: ArenaProfile | null;

  /** The mode last queued for, and the mode of the match in progress. */
  mode: ArenaMode;
  queuedAt: number | null;
  /** Golf: how long the match runs, from the server. */
  capMs: number | null;
  /** Golf: your fewest gates in a correct circuit so far. */
  best: number | null;

  matchId: string | null;
  challenge: ArenaChallenge | null;
  opponent: Opponent | null;
  opponentProgress: { gateCount: number; runCount: number };
  /** When the clock starts, on this device's clock (the server's, offset). */
  startedAt: number | null;
  rated: boolean;

  /** The last emote each way, for a speech bubble. */
  emotes: { mine: { emote: Emote; at: number } | null; theirs: { emote: Emote; at: number } | null };
  rematch: { mine: boolean; theirs: boolean };

  /** Last grade for your own submission, so the screen can say "not yet". */
  lastGrade: { passed: boolean; fidelity: number } | null;
  result: MatchResult | null;

  /** The play-by-play, newest first: what the other side just did. */
  feed: FeedItem[];
  /** Submits this match — "one shot" is a badge. */
  submits: number;
  /** When your last submission missed, for the shake. */
  missAt: number | null;
  /** This match followed a rematch — "run it back" is a badge. */
  wasRematch: boolean;
  /** Badges this match earned, for the result screen. */
  earned: string[];
  /** The lobby's live counters. */
  stats: ArenaStats | null;
  loadStats(): Promise<void>;

  /** Opens the socket as the signed-in account. */
  connect(): Promise<void>;
  disconnect(): void;
  /** `bots`: "auto" lets a bot step in after a wait, "now" plays one at once. */
  queue(mode?: ArenaMode, bots?: "auto" | "now"): void;
  leaveQueue(): void;
  submit(circuit: Circuit): void;
  reportProgress(gateCount: number, runCount: number): void;
  sendEmote(e: Emote): void;
  requestRematch(): void;
  /** Give the match up; the other side wins. */
  resign(): void;
  loadProfile(): Promise<void>;
  reset(): void;
}

export interface FeedItem {
  id: number;
  kind: "run" | "miss" | "scored" | "emote" | "gates";
  text: string;
  at: number;
}

export interface ArenaStats {
  online: number;
  queued: number;
  live: number;
  today: number;
  weekEndsAt: number;
}

let feedSeq = 0;
function pushFeed(feed: FeedItem[], kind: FeedItem["kind"], text: string): FeedItem[] {
  return [{ id: ++feedSeq, kind, text, at: Date.now() }, ...feed].slice(0, 6);
}

const HEARTBEAT_MS = 5_000;
/** Mirrors the server's BOT_AFTER_MS, so the queue screen can count down. */
export const BOT_AFTER_MS = 15_000;

let socket: WebSocket | null = null;
/**
 * Bumped by every connect and disconnect. A socket (or a connect still waiting
 * on its token) from an older generation has been superseded, and its late
 * events must not touch the live one — a stale `onclose` used to null the
 * current socket, leaving the Queue button sending into nothing.
 */
let generation = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;

function sendFrame(type: string, payload: unknown) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, payload, ts: Date.now() }));
}

export const useArena = create<ArenaState>((set, get) => ({
  phase: "offline",
  problem: null,
  playerId: "",
  mode: "blitz",
  queuedAt: null,
  capMs: null,
  best: null,
  rating: 1200,
  gamesPlayed: 0,
  profile: null,
  matchId: null,
  challenge: null,
  opponent: null,
  opponentProgress: { gateCount: 0, runCount: 0 },
  startedAt: null,
  rated: true,
  emotes: { mine: null, theirs: null },
  rematch: { mine: false, theirs: false },
  lastGrade: null,
  result: null,
  feed: [],
  submits: 0,
  missAt: null,
  wasRematch: false,
  earned: [],
  stats: null,

  async connect() {
    if (socket && socket.readyState <= WebSocket.OPEN) return;
    const gen = ++generation;

    // The socket carries the same access token as the API. The server takes
    // the player's identity and name from it — never from the client.
    set({ phase: "connecting", problem: null });
    const token = await freshToken();
    if (gen !== generation) return;
    if (!token) {
      set({ phase: "signed-out", problem: null });
      return;
    }
    set({ playerId: useAuth.getState().user?.id ?? "" });

    const url = `${arenaSocketBase()}/ws?token=${encodeURIComponent(token)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      set({ phase: "offline", problem: "Could not reach the arena server." });
      return;
    }
    socket = ws;

    const live = () => socket === ws && gen === generation;

    ws.onopen = () => {
      if (!live()) return;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "match.heartbeat", payload: {}, ts: Date.now() }));
      }, HEARTBEAT_MS);
    };

    ws.onclose = () => {
      if (!live()) return;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      socket = null;
      // A finished match keeps its result on screen; anything else drops to
      // offline so the page can say what is wrong rather than hanging.
      set((s) => (s.phase === "finished" ? { problem: "Disconnected." } : {
        phase: "offline",
        problem: "Lost the connection to the arena server.",
      }));
    };

    ws.onerror = () => {
      if (!live()) return;
      set({
        problem: isLocalPage()
          ? "The arena server is not reachable. Start it with npm run dev:server."
          : "The arena server is not answering. It sleeps when idle and can take a minute to wake — try again shortly.",
      });
    };

    ws.onmessage = (event) => {
      if (!live()) return;
      let f: { type: string; payload: Record<string, unknown> };
      try {
        f = JSON.parse(String(event.data));
      } catch {
        return;
      }

      switch (f.type) {
        case "session.ready":
          set({
            phase: "idle",
            playerId: String(f.payload.id ?? get().playerId),
            problem: null,
            rating: Number(f.payload.rating) || 1200,
            gamesPlayed: Number(f.payload.gamesPlayed) || 0,
          });
          void get().loadProfile();
          return;

        case "queue.joined":
          set({ phase: "queued", problem: null, queuedAt: Date.now() });
          return;

        case "queue.left":
          set({ phase: "idle", queuedAt: null });
          return;

        case "queue.timeout":
          set({ phase: "idle", queuedAt: null, problem: "Nobody turned up. Play a bot, or try again in a minute." });
          return;

        case "match.found": {
          const serverNow = Number(f.payload.serverNow) || Date.now();
          const startsAt = Number(f.payload.startsAt) || serverNow;
          play("match");
          set({
            phase: "matched",
            problem: null,
            queuedAt: null,
            feed: [],
            submits: 0,
            missAt: null,
            earned: [],
            wasRematch: get().rematch.mine,
            matchId: String(f.payload.matchId),
            challenge: f.payload.challenge as ArenaChallenge,
            opponent: f.payload.opponent as Opponent,
            opponentProgress: { gateCount: 0, runCount: 0 },
            // The server's start, moved onto this device's clock.
            startedAt: Date.now() + (startsAt - serverNow),
            rated: f.payload.rated !== false,
            lastGrade: null,
            result: null,
            emotes: { mine: null, theirs: null },
            rematch: { mine: false, theirs: false },
            mode: (f.payload.mode as ArenaMode) ?? get().mode,
            capMs: f.payload.capMs == null ? null : Number(f.payload.capMs),
            best: null,
          });
          return;
        }

        case "match.opponent_progress": {
          const next = { gateCount: Number(f.payload.gateCount) || 0, runCount: Number(f.payload.runCount) || 0 };
          const prev = get().opponentProgress;
          const name = get().opponent?.name ?? "They";
          let feed = get().feed;
          if (next.runCount > prev.runCount) {
            feed = pushFeed(feed, "run", `${name} ran their circuit`);
            play("oppRun");
          } else if (next.gateCount > prev.gateCount && next.gateCount % 2 === 0) {
            feed = pushFeed(feed, "gates", `${name} is at ${next.gateCount} gates`);
          }
          set({ opponentProgress: next, feed });
          return;
        }

        case "match.opponent_event": {
          const name = get().opponent?.name ?? "They";
          const fid = Math.round(Number(f.payload.fidelity) * 100);
          if (f.payload.kind === "miss") {
            play("oppMiss");
            set({ feed: pushFeed(get().feed, "miss", `${name} submitted — missed (${fid}%)`) });
          } else {
            set({ feed: pushFeed(get().feed, "scored", `${name} scored in ${Number(f.payload.gates)} gates`) });
          }
          return;
        }

        case "match.graded": {
          const passed = Boolean(f.payload.passed);
          if (!passed) play("miss");
          set({
            lastGrade: { passed, fidelity: Number(f.payload.fidelity) || 0 },
            best: f.payload.best == null ? get().best : Number(f.payload.best),
            missAt: passed ? get().missAt : Date.now(),
          });
          return;
        }

        case "match.emote":
          play("emote");
          set((s) => ({
            emotes: { ...s.emotes, theirs: { emote: f.payload.emote as Emote, at: Date.now() } },
            feed: pushFeed(s.feed, "emote", `${s.opponent?.name ?? "They"}: “${EMOTE_TEXT[f.payload.emote as Emote] ?? "…"}”`),
          }));
          return;

        case "match.rematch_offered":
          set((s) => ({ rematch: { ...s.rematch, theirs: true } }));
          return;

        case "match.result": {
          const raw = f.payload as unknown as Omit<MatchResult, "xp" | "ratingBefore">;
          const before = get().rating;
          const won = raw.winnerId === get().playerId;
          const rated = raw.rated !== false;
          // Arena play counts toward XP, quests and the streak (the session
          // store announces what it earned).
          const xpBefore = useSession.getState().xp;
          if (!raw.flagged) useSession.getState().recordArena(won, rated);
          const xp = useSession.getState().xp - xpBefore;
          const result: MatchResult = { ...raw, rated, review: raw.review ?? null, xp, ratingBefore: before };
          const drew = raw.winnerId === null;
          play(won ? "win" : drew ? "draw" : "lose");
          // Badges, from what the server confirmed and what this player did.
          const s0 = get();
          const streak = won ? (s0.profile?.winStreak ?? 0) + 1 : 0;
          const earned = useSession.getState().awardBadges(badgesFor({
            won, mode: s0.mode, rated,
            opponentBot: Boolean(s0.opponent?.bot),
            opponentRating: s0.opponent?.rating ?? raw.opponentRating,
            ratingBefore: before, ratingAfter: raw.yourRating,
            yoursMs: raw.review?.yours?.ms ?? null,
            yoursGates: raw.review?.yours?.gates ?? null,
            par: s0.challenge?.par ?? 0,
            submits: s0.submits,
            streak,
            wasRematch: s0.wasRematch,
            flagged: raw.flagged,
          }));
          if (earned.length > 0) setTimeout(() => play("badge"), 900);
          set({
            phase: "finished",
            result,
            earned,
            rating: result.yourRating,
            gamesPlayed: get().gamesPlayed + (rated && !raw.flagged ? 1 : 0),
          });
          if (rated) {
            const change = rankChange(before, result.yourRating);
            if (change) {
              announce({ kind: "rank", tier: change.label, up: change.up });
              if (change.up) setTimeout(() => play("rankUp"), 600);
            }
          }
          void get().loadProfile();
          return;
        }

        case "match.abandoned":
          set({ problem: String(f.payload.reason ?? "The match was abandoned.") });
          return;

        case "error":
          set({ problem: String(f.payload.message ?? "Something went wrong.") });
          return;
      }
    };
  },

  disconnect() {
    generation++;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    socket?.close();
    socket = null;
    set({ phase: "offline" });
  },

  queue(mode = get().mode, bots = "auto") {
    set({ mode, problem: null });
    sendFrame("queue.join", { mode, bots });
  },

  leaveQueue() {
    sendFrame("queue.leave", {});
  },

  submit(circuit) {
    play("submit");
    set({ lastGrade: null, submits: get().submits + 1 });
    sendFrame("match.submit", { ir: circuit });
  },

  reportProgress(gateCount, runCount) {
    sendFrame("match.progress", { gateCount, runCount });
  },

  sendEmote(emote) {
    const mine = get().emotes.mine;
    if (mine && Date.now() - mine.at < 1_500) return;
    sendFrame("match.emote", { emote });
    play("emote");
    set((s) => ({ emotes: { ...s.emotes, mine: { emote, at: Date.now() } } }));
    // A "good game" after a loss is its own small badge.
    const r = get().result;
    if (emote === "gg" && r && r.winnerId !== null && r.winnerId !== get().playerId) {
      const earned = useSession.getState().awardBadges(["good-sport"]);
      if (earned.length) set({ earned: [...get().earned, ...earned] });
    }
  },

  resign() {
    sendFrame("match.resign", {});
  },

  requestRematch() {
    if (get().rematch.mine) return;
    sendFrame("match.rematch", {});
    set((s) => ({ rematch: { ...s.rematch, mine: true } }));
  },

  async loadStats() {
    try {
      const r = await fetch(`${arenaHttpBase()}/arena/stats`);
      if (r.ok) set({ stats: (await r.json()) as ArenaStats });
    } catch {
      /* the counters are a nicety */
    }
  },

  async loadProfile() {
    try {
      const p = await api<ArenaProfile & { player: { rating: number; gamesPlayed: number } | null }>("/arena/profile");
      set({ profile: p, ...(p.player ? { rating: p.player.rating, gamesPlayed: p.player.gamesPlayed } : {}) });
    } catch {
      // The record is a nicety; the arena works without it.
    }
  },

  reset() {
    set({
      phase: socket ? "idle" : "offline",
      matchId: null, challenge: null, opponent: null,
      opponentProgress: { gateCount: 0, runCount: 0 },
      startedAt: null, lastGrade: null, result: null, problem: null,
      emotes: { mine: null, theirs: null },
      rematch: { mine: false, theirs: false },
      feed: [], submits: 0, missAt: null, earned: [], wasRematch: false,
    });
  },
}));
