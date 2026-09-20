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
import { arenaPlayerId } from "@/lib/arena/identity";

export type ArenaPhase = "offline" | "connecting" | "idle" | "queued" | "matched" | "finished";

export interface ArenaChallenge {
  id: string;
  title: string;
  brief: string;
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

  matchId: string | null;
  challenge: ArenaChallenge | null;
  opponent: { name: string; rating: number } | null;
  opponentProgress: { gateCount: number; runCount: number };
  startedAt: number | null;

  /** Last grade for your own submission, so the screen can say "not yet". */
  lastGrade: { passed: boolean; fidelity: number } | null;
  result: MatchResult | null;

  connect(displayName: string): void;
  disconnect(): void;
  queue(mode?: string): void;
  leaveQueue(): void;
  submit(circuit: Circuit): void;
  reportProgress(gateCount: number, runCount: number): void;
  reset(): void;
}

const SERVER = process.env.NEXT_PUBLIC_ARENA_URL ?? "ws://localhost:4000";
const HEARTBEAT_MS = 5_000;

let socket: WebSocket | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;

export const useArena = create<ArenaState>((set, get) => ({
  phase: "offline",
  problem: null,
  playerId: "",
  rating: 1200,
  gamesPlayed: 0,
  matchId: null,
  challenge: null,
  opponent: null,
  opponentProgress: { gateCount: 0, runCount: 0 },
  startedAt: null,
  lastGrade: null,
  result: null,

  connect(displayName) {
    if (socket && socket.readyState <= WebSocket.OPEN) return;

    const playerId = arenaPlayerId();
    set({ phase: "connecting", problem: null, playerId });

    const url = `${SERVER}/ws?playerId=${encodeURIComponent(playerId)}&name=${encodeURIComponent(displayName || "Anonymous")}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      set({ phase: "offline", problem: "Could not reach the arena server." });
      return;
    }
    socket = ws;

    ws.onopen = () => {
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "match.heartbeat", payload: {}, ts: Date.now() }));
      }, HEARTBEAT_MS);
    };

    ws.onclose = () => {
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
      set({ problem: "The arena server is not reachable. Start it with npm run dev:server." });
    };

    ws.onmessage = (event) => {
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
          set({ lastGrade: { passed: Boolean(f.payload.passed), fidelity: Number(f.payload.fidelity) || 0 } });
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
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    socket?.close();
    socket = null;
    set({ phase: "offline" });
  },

  queue(mode = "blitz") {
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
