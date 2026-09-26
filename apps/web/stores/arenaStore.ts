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
 * The arena is the only surface that needs a server. Everything else in this
 * app keeps working with it stopped, so a failure here degrades to "ranked play
 * is unavailable" and never to a broken page.
 */

import { create } from "zustand";
import type { Circuit } from "@/lib/ir/types";
import { freshToken, useAuth } from "@/stores/authStore";
import { arenaSocketBase, isLocalPage } from "@/lib/arena/server";

/** "signed-out": ranked play needs an account (PRD §6.4); the page says so. */
export type ArenaPhase = "signed-out" | "offline" | "connecting" | "idle" | "queued" | "matched" | "finished";

export type ArenaMode = "blitz" | "golf" | "bughunt";

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

export interface MatchResult {
  matchId: string;
  winnerId: string | null;
  yourRating: number;
  delta: number;
  opponentRating: number;
  flagged: boolean;
  reason: string;
}

interface ArenaState {
  phase: ArenaPhase;
  /** Why the socket is not up, when it is not. */
  problem: string | null;

  playerId: string;
  rating: number;
  gamesPlayed: number;

  /** The mode last queued for, and the mode of the match in progress. */
  mode: ArenaMode;
  /** Golf: how long the match runs, from the server. */
  capMs: number | null;
  /** Golf: your fewest gates in a correct circuit so far. */
  best: number | null;

  matchId: string | null;
  challenge: ArenaChallenge | null;
  opponent: { name: string; rating: number } | null;
  opponentProgress: { gateCount: number; runCount: number };
  startedAt: number | null;

  /** Last grade for your own submission, so the screen can say "not yet". */
  lastGrade: { passed: boolean; fidelity: number } | null;
  result: MatchResult | null;

  /** Opens the socket as the signed-in account. */
  connect(): Promise<void>;
  disconnect(): void;
  queue(mode?: ArenaMode): void;
  leaveQueue(): void;
  submit(circuit: Circuit): void;
  reportProgress(gateCount: number, runCount: number): void;
  reset(): void;
}

const HEARTBEAT_MS = 5_000;

let socket: WebSocket | null = null;
/**
 * Bumped by every connect and disconnect. A socket (or a connect still waiting
 * on its token) from an older generation has been superseded, and its late
 * events must not touch the live one — a stale `onclose` used to null the
 * current socket, leaving the Queue button sending into nothing.
 */
let generation = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;

export const useArena = create<ArenaState>((set, get) => ({
  phase: "offline",
  problem: null,
  playerId: "",
  mode: "blitz",
  capMs: null,
  best: null,
  rating: 1200,
  gamesPlayed: 0,
  matchId: null,
  challenge: null,
  opponent: null,
  opponentProgress: { gateCount: 0, runCount: 0 },
  startedAt: null,
  lastGrade: null,
  result: null,

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
          return;

        case "queue.joined":
          set({ phase: "queued", problem: null });
          return;

        case "queue.left":
          set({ phase: "idle" });
          return;

        case "queue.timeout":
          set({ phase: "idle", problem: "No opponent turned up. Try again, or practise on a challenge." });
          return;

        case "match.found":
          set({
            phase: "matched",
            problem: null,
            matchId: String(f.payload.matchId),
            challenge: f.payload.challenge as ArenaChallenge,
            opponent: f.payload.opponent as { name: string; rating: number },
            opponentProgress: { gateCount: 0, runCount: 0 },
            startedAt: Date.now(),
            lastGrade: null,
            result: null,
            mode: (f.payload.mode as ArenaMode) ?? get().mode,
            capMs: f.payload.capMs == null ? null : Number(f.payload.capMs),
            best: null,
          });
          return;

        case "match.opponent_progress":
          set({
            opponentProgress: {
              gateCount: Number(f.payload.gateCount) || 0,
              runCount: Number(f.payload.runCount) || 0,
            },
          });
          return;

        case "match.graded":
          set({
            lastGrade: { passed: Boolean(f.payload.passed), fidelity: Number(f.payload.fidelity) || 0 },
            best: f.payload.best == null ? get().best : Number(f.payload.best),
          });
          return;

        case "match.result": {
          const result = f.payload as unknown as MatchResult;
          set({ phase: "finished", result, rating: result.yourRating, gamesPlayed: get().gamesPlayed + (result.flagged ? 0 : 1) });
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

  queue(mode = get().mode) {
    set({ mode });
    socket?.send(JSON.stringify({ type: "queue.join", payload: { mode }, ts: Date.now() }));
  },

  leaveQueue() {
    socket?.send(JSON.stringify({ type: "queue.leave", payload: {}, ts: Date.now() }));
  },

  submit(circuit) {
    set({ lastGrade: null });
    socket?.send(JSON.stringify({ type: "match.submit", payload: { ir: circuit }, ts: Date.now() }));
  },

  reportProgress(gateCount, runCount) {
    socket?.send(JSON.stringify({ type: "match.progress", payload: { gateCount, runCount }, ts: Date.now() }));
  },

  reset() {
    set({
      phase: socket ? "idle" : "offline",
      matchId: null, challenge: null, opponent: null,
      opponentProgress: { gateCount: 0, runCount: 0 },
      startedAt: null, lastGrade: null, result: null, problem: null,
    });
  },
}));
