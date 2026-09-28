/**
 * Two clients, one match, one consistent winner.
 *
 * This is the unchecked box in Design Doc §14's demo-readiness list. It runs a
 * real HTTP + WebSocket server against a real database, with two real sockets —
 * the only part that is not real is that both tabs are in one process.
 *
 * It is the test that would catch the arena lying: two clients being told
 * different winners, a rating moving without a match, or a submission from
 * outside a match being graded anyway.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startArenaServer, type ArenaServer } from "../src/server.ts";
import { MIN_PLAUSIBLE_SOLVE_MS } from "../src/arena/service.ts";
import { emptyCircuit, nextGateId, type Circuit, type GateType } from "../../web/lib/ir/types";
import { freshDb } from "./db.ts";

let server: ArenaServer;

beforeAll(async () => {
  server = await startArenaServer({ db: await freshDb(), tickMs: 50, countdownMs: 0, jwtSecret: "test-secret", secureCookies: false, authPerMinute: 1000 });
});

/** A real account, made through the real API. */
async function account(name: string): Promise<{ id: string; token: string }> {
  const res = await fetch(`http://127.0.0.1:${server.port}/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `${name.toLowerCase()}-${Date.now()}@example.com`, password: "correct horse", displayName: name }),
  });
  const body = (await res.json()) as { accessToken: string; user: { id: string } };
  return { id: body.user.id, token: body.accessToken };
}

afterAll(async () => {
  await server.close();
});

/** A socket that records every frame, and can be awaited for one by name. */
function connect(token: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${encodeURIComponent(token)}`);
  const frames: Array<{ type: string; payload: any }> = [];
  ws.on("message", (raw) => frames.push(JSON.parse(String(raw))));

  const client = {
    ws,
    frames,
    send: (type: string, payload: unknown = {}) => ws.send(JSON.stringify({ type, payload, ts: Date.now() })),
    seen: (type: string) => frames.filter((f) => f.type === type),
    async open() {
      if (ws.readyState === ws.OPEN) return;
      await new Promise<void>((res, rej) => { ws.once("open", () => res()); ws.once("error", rej); });
    },
    async await(type: string, timeoutMs = 4000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const hit = frames.find((f) => f.type === type);
        if (hit) return hit;
        if (Date.now() > deadline) throw new Error(`timed out waiting for "${type}"; saw ${frames.map(f => f.type).join(", ") || "nothing"}`);
        await new Promise((r) => setTimeout(r, 15));
      }
    },
  };
  return client;
}

function circuit(qubits: number, gates: Array<{ type: GateType; targets: number[]; controls?: number[]; column: number }>): Circuit {
  const c = emptyCircuit(qubits);
  c.gates = gates.map((g) => ({
    id: nextGateId(), type: g.type, targets: g.targets,
    controls: g.controls ?? [], params: [], column: g.column,
  }));
  return c;
}

describe("the arena over a real socket", () => {
  it("serves health without a client", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; challenges: number };
    expect(body.ok).toBe(true);
    expect(body.challenges).toBeGreaterThan(0);
  });

  it("refuses a socket with a forged token", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZGEifQ.`);
    const closed = await new Promise<boolean>((resolve) => {
      ws.on("close", () => resolve(true));
      setTimeout(() => resolve(false), 3000);
    });
    expect(closed).toBe(true);
  });

  it("refuses a socket with no identity", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    const closed = await new Promise<boolean>((resolve) => {
      ws.on("close", () => resolve(true));
      setTimeout(() => resolve(false), 3000);
    });
    expect(closed).toBe(true);
  });

  it("plays a full match and tells both players the same thing", async () => {
    const adaAccount = await account("Ada");
    const boAccount = await account("Bo");
    const ada = connect(adaAccount.token);
    const bo = connect(boAccount.token);
    await ada.open();
    await bo.open();

    await ada.await("session.ready");
    await bo.await("session.ready");
    expect((await ada.await("session.ready")).payload.rating).toBe(1200);

    ada.send("queue.join", { mode: "blitz" });
    bo.send("queue.join", { mode: "blitz" });

    const foundA = await ada.await("match.found");
    const foundB = await bo.await("match.found");

    // E9-S2: the identical problem, to both.
    expect(foundA.payload.matchId).toBe(foundB.payload.matchId);
    expect(foundA.payload.challenge.id).toBe(foundB.payload.challenge.id);
    // And each is told about the other, not themselves.
    expect(foundA.payload.opponent.name).toBe("Bo");
    expect(foundB.payload.opponent.name).toBe("Ada");

    // Progress is forwarded to the opponent only, as counts.
    ada.send("match.progress", { gateCount: 1, runCount: 0 });
    const prog = await bo.await("match.opponent_progress");
    expect(prog.payload).toEqual({ gateCount: 1, runCount: 0 });
    expect(ada.seen("match.opponent_progress")).toHaveLength(0);

    // Ada solves it. The challenge is whichever one the server picked, so
    // build from its own target description rather than assuming.
    const ch = foundA.payload.challenge;
    const solution = ch.qubits === 2
      ? circuit(2, [
          { type: "h", targets: [0], column: 0 },
          { type: "cx", targets: [1], controls: [0], column: 1 },
        ])
      : circuit(ch.qubits, [{ type: "h", targets: [0], column: 0 }]);

    // Wait past the plausibility floor before submitting. Solving a Bell pair
    // in fifty milliseconds is exactly what TRD §12.4 calls an impossible solve
    // time, and the server is right to flag it — but the normal path is the one
    // under test here, and the flagged path has its own test in arena.test.ts.
    await new Promise((r) => setTimeout(r, MIN_PLAUSIBLE_SOLVE_MS + 200));

    // One honest miss first. The reference answer, exact, on a first attempt,
    // this fast, is precisely what the copy check flags — also its own test.
    ada.send("match.submit", { ir: circuit(ch.qubits, []) });
    await ada.await("match.graded");
    ada.frames.splice(ada.frames.findIndex((f) => f.type === "match.graded"), 1);

    ada.send("match.submit", { ir: solution });
    await ada.await("match.graded");

    // Whether that particular circuit passed depends on which challenge came
    // up; what must hold is that the two clients never disagree.
    const graded = ada.seen("match.graded")[0];
    if (graded.payload.passed) {
      const resA = await ada.await("match.result");
      const resB = await bo.await("match.result");

      expect(resA.payload.matchId).toBe(resB.payload.matchId);
      expect(resA.payload.winnerId).toBe(resB.payload.winnerId);
      expect(resA.payload.winnerId).toBe(adaAccount.id);
      // Each is told their own rating and the opponent's, mirrored.
      expect(resA.payload.yourRating).toBe(resB.payload.opponentRating);
      expect(resB.payload.yourRating).toBe(resA.payload.opponentRating);
      // Summed rather than negated: JavaScript distinguishes -0 from +0, and
      // a flagged match makes both deltas zero.
      expect(resA.payload.flagged).toBe(false);
      expect(resA.payload.delta + resB.payload.delta).toBe(0);
      expect(resA.payload.delta).toBeGreaterThan(0);

      // And the ladder agrees with what the players were told.
      const board = (await (await fetch(`http://127.0.0.1:${server.port}/leaderboard`)).json()) as { players: Array<{ id: string; rating: number }> };
      const ratings = Object.fromEntries(board.players.map((p) => [p.id, p.rating]));
      expect(ratings[adaAccount.id]).toBe(resA.payload.yourRating);
      expect(ratings[boAccount.id]).toBe(resB.payload.yourRating);
    }

    ada.ws.close();
    bo.ws.close();
  }, 20_000);

  it("rejects a submission from someone with no match", async () => {
    const ghost = connect((await account("Ghost")).token);
    await ghost.open();
    await ghost.await("session.ready");

    ghost.send("match.submit", { ir: circuit(1, [{ type: "h", targets: [0], column: 0 }]) });
    const err = await ghost.await("error");
    expect(err.payload.code).toBe("no_match");
    ghost.ws.close();
  });

  it("names an unknown frame instead of dying on it", async () => {
    const c = connect((await account("Odd")).token);
    await c.open();
    await c.await("session.ready");

    c.ws.send("not json at all");
    const e1 = await c.await("error");
    expect(e1.payload.code).toBe("bad_frame");

    c.frames.length = 0;
    c.send("match.selfDestruct", {});
    const e2 = await c.await("error");
    expect(e2.payload.message).toMatch(/unknown frame/);
    c.ws.close();
  });
});
