/**
 * What makes the arena a game: the countdown, bots for an empty queue, emotes,
 * rematches and the post-match review — and the records a profile is built
 * from. The trust boundary is pinned in arena.test.ts; these pin that the new
 * parts did not open a way round it (bots never move a rating, a submission
 * before the clock starts does not count, emotes are a closed set).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { arenaRepo, type ArenaRepo } from "../src/db/repo.ts";
import { freshDb } from "./db.ts";
import { createArena, type Arena, type ArenaChallenge } from "../src/arena/service.ts";
import { planBot, pickBot, solveSeconds } from "../src/arena/bots.ts";
import { weekStart } from "../src/server.ts";
import { TARGETS } from "../../web/lib/grade/fidelity";
import { emptyCircuit, nextGateId, type Circuit, type GateType } from "../../web/lib/ir/types";

const T0 = 1_700_000_000_000;

function circuit(qubits: number, gates: Array<{ type: GateType; targets: number[]; controls?: number[]; column: number }>): Circuit {
  const c = emptyCircuit(qubits);
  c.gates = gates.map((g) => ({ id: nextGateId(), type: g.type, targets: g.targets, controls: g.controls ?? [], params: [], column: g.column }));
  return c;
}
const bell = () => circuit(2, [
  { type: "h", targets: [0], column: 0 },
  { type: "cx", targets: [1], controls: [0], column: 1 },
]);

const BELL: ArenaChallenge = {
  id: "c.bell", title: "Two that agree", brief: "Build a Bell pair.",
  kind: "reach", qubits: 2, target: TARGETS.bellPhiPlus(), allowedGates: ["h", "cx"], par: 2,
  reference: bell(),
};

let repo: ArenaRepo;
let arena: Arena;
let sent: Array<{ to: string; type: string; payload: any }>;

/** A fixed sequence, so a bot's plan is the same every run. */
function seeded(values = [0.5]) {
  let i = 0;
  return () => values[i++ % values.length];
}

function build(opts: { countdownMs?: number; botAfterMs?: number; random?: () => number } = {}) {
  arena = createArena(repo, {
    challenges: [BELL],
    pick: () => BELL,
    events: {
      matchFound: (to, payload) => sent.push({ to, type: "match.found", payload }),
      opponentProgress: (to, payload) => sent.push({ to, type: "progress", payload }),
      matchResult: (to, payload) => sent.push({ to, type: "match.result", payload }),
      matchAbandoned: (to, payload) => sent.push({ to, type: "abandoned", payload }),
      queueTimedOut: (to) => sent.push({ to, type: "timeout", payload: {} }),
      emote: (to, payload) => sent.push({ to, type: "emote", payload }),
      rematchOffered: (to, payload) => sent.push({ to, type: "rematch", payload }),
      opponentEvent: (to, payload) => sent.push({ to, type: "opponent_event", payload }),
    },
    ...opts,
  });
}

const ofType = (type: string, to?: string) => sent.filter((s) => s.type === type && (!to || s.to === to));

beforeEach(async () => {
  repo = arenaRepo(await freshDb());
  sent = [];
  build();
});

describe("the countdown", () => {
  it("tells both players when the clock starts, and refuses anything sent before", async () => {
    build({ countdownMs: 3000 });
    await arena.queue("ada", "Ada", "blitz", T0);
    await arena.queue("bo", "Bo", "blitz", T0);
    await arena.tick(T0);
    const found = ofType("match.found", "ada")[0].payload;
    expect(found.startsAt - found.serverNow).toBe(3000);
    expect(found.rated).toBe(true);

    expect(await arena.submit("ada", bell(), T0 + 2000)).toEqual({ status: "rejected", reason: "the match hasn't started yet" });
    const ok = await arena.submit("ada", bell(), T0 + 3000 + 5000);
    expect(ok).toMatchObject({ status: "graded", passed: true, won: true });
  });
});

describe("bots for an empty queue", () => {
  it("steps in after the wait when bots are allowed, and never when they aren't", async () => {
    build({ botAfterMs: 10_000, random: seeded([0.9]) });
    await arena.queue("ada", "Ada", "blitz", T0, "auto");
    await arena.queue("cy", "Cy", "golf", T0, "never");
    await arena.tick(T0 + 5_000);
    expect(ofType("match.found")).toHaveLength(0);
    await arena.tick(T0 + 10_000);
    const found = ofType("match.found");
    expect(found).toHaveLength(1);
    expect(found[0].to).toBe("ada");
    expect(found[0].payload.opponent.bot).toBe(true);
    expect(found[0].payload.rated).toBe(false);
    expect(arena.inQueue("cy")).toBe(true);
  });

  it("plays at once when asked", async () => {
    await arena.queue("ada", "Ada", "blitz", T0, "now");
    await arena.tick(T0);
    expect(ofType("match.found", "ada")[0].payload.opponent.bot).toBe(true);
  });

  it("shows its progress, and wins if the human is slower — without moving a rating", async () => {
    build({ random: seeded([0.9]) });
    await arena.queue("ada", "Ada", "blitz", T0, "now");
    await arena.tick(T0);
    for (let t = T0; t <= T0 + 120_000; t += 1000) {
      arena.heartbeat("ada", t);
      await arena.tick(t);
    }
    expect(ofType("progress", "ada").length).toBeGreaterThan(0);
    const result = ofType("match.result", "ada")[0].payload;
    expect(result.winnerId).toMatch(/^bot:/);
    expect(result.reason).toBe("solved first");
    expect(result.delta).toBe(0);
    expect(result.rated).toBe(false);
    // The review shows what the bot "played": the challenge's own answer.
    expect(result.review.theirs.circuit.gates).toHaveLength(2);
    const ada = (await repo.getPlayer("ada"))!;
    expect(ada.rating).toBe(1200);
    expect(ada.gamesPlayed).toBe(0);
  });

  it("loses to a human who gets there first", async () => {
    build({ random: seeded([0.9]) });
    await arena.queue("ada", "Ada", "blitz", T0, "now");
    await arena.tick(T0);
    await arena.submit("ada", bell(), T0 + 4000);
    const result = ofType("match.result", "ada")[0].payload;
    expect(result.winnerId).toBe("ada");
    expect(result.review.yours).toEqual({ gates: 2, ms: 4000 });
  });

  it("plans slower solves for weaker bots, and never beyond the golf cap", () => {
    const r = () => 0.5;
    expect(solveSeconds(900, 2, r)).toBeGreaterThan(solveSeconds(1500, 2, r));
    const plan = planBot(pickBot(1200, r), "golf", 3, T0, 20_000, () => 0.99);
    if (plan.solveAt !== null) expect(plan.solveAt).toBeLessThanOrEqual(T0 + 20_000);
    expect(plan.progress.every((p, i, all) => i === 0 || p.at >= all[i - 1].at)).toBe(true);
  });
});

describe("after the match", () => {
  async function played() {
    await arena.queue("ada", "Ada", "blitz", T0);
    await arena.queue("bo", "Bo", "blitz", T0);
    await arena.tick(T0);
    await arena.submit("ada", bell(), T0 + 9000);
  }

  it("shows each player the other's winning circuit, and nothing before", async () => {
    await played();
    const toBo = ofType("match.result", "bo")[0].payload;
    expect(toBo.review.theirs.gates).toBe(2);
    expect(toBo.review.theirs.circuit.gates.map((g: any) => g.type)).toEqual(["h", "cx"]);
    expect(toBo.review.yours).toBeNull();
  });

  it("passes on emotes from the fixed set only, and not too often", async () => {
    await arena.queue("ada", "Ada", "blitz", T0);
    await arena.queue("bo", "Bo", "blitz", T0);
    await arena.tick(T0);
    expect(arena.emote("ada", "gl", T0 + 100)).toBe(true);
    expect(arena.emote("ada", "nice", T0 + 200)).toBe(false); // too soon
    expect(arena.emote("ada", "<script>", T0 + 5000)).toBe(false);
    expect(ofType("emote", "bo")).toEqual([{ to: "bo", type: "emote", payload: { emote: "gl", from: "opponent" } }]);
  });

  it("starts a rematch when both ask, and not when only one does", async () => {
    await played();
    expect(await arena.rematch("ada", T0 + 10_000)).toBe(false);
    expect(ofType("rematch", "bo")).toHaveLength(1);
    expect(await arena.rematch("bo", T0 + 11_000)).toBe(true);
    expect(ofType("match.found")).toHaveLength(4);
    expect(arena.matchFor("ada")).not.toBeNull();
  });

  it("lets a player resign, which hands the other the win", async () => {
    await arena.queue("ada", "Ada", "blitz", T0);
    await arena.queue("bo", "Bo", "blitz", T0);
    await arena.tick(T0);
    expect(await arena.resign("bo", T0 + 5000)).toBe(true);
    const result = ofType("match.result", "ada")[0].payload;
    expect(result).toMatchObject({ winnerId: "ada", reason: "resigned" });
    expect(await arena.resign("bo", T0 + 6000)).toBe(false);
  });

  it("never leaves a race with a bot unfinished", () => {
    for (let i = 0; i < 50; i++) {
      const r = seeded([i / 50, 0.3, 0.7]);
      const plan = planBot(pickBot(900, r), "blitz", 3, T0, null, r);
      expect(plan.solveAt).not.toBeNull();
    }
  });

  it("tells the other side about a miss — the fidelity, never the circuit", async () => {
    await arena.queue("ada", "Ada", "blitz", T0);
    await arena.queue("bo", "Bo", "blitz", T0);
    await arena.tick(T0);
    const wrong = circuit(2, [{ type: "h", targets: [0], column: 0 }]);
    await arena.submit("ada", wrong, T0 + 5000);
    const ev = ofType("opponent_event", "bo");
    expect(ev).toHaveLength(1);
    expect(ev[0].payload.kind).toBe("miss");
    expect(ev[0].payload.fidelity).toBeGreaterThan(0);
    expect(JSON.stringify(ev[0].payload)).not.toMatch(/gates"|targets/);
    expect(arena.stats()).toEqual({ queued: 0, live: 1 });
  });

  it("lets the rematch window close", async () => {
    await played();
    await arena.tick(T0 + 60_000);
    expect(await arena.rematch("ada", T0 + 60_000)).toBe(false);
  });

  it("builds a profile: record, streak, and a weekly ladder that ignores bots", async () => {
    await played();
    const profile = (await repo.profile("ada"))!;
    expect(profile).toMatchObject({ wins: 1, losses: 0, winStreak: 1 });
    expect(profile.matches[0]).toMatchObject({ opponent: "Bo", result: "win", bot: false, rated: true });
    expect(profile.matches[0].delta).toBeGreaterThan(0);

    await arena.queue("ada", "Ada", "blitz", T0 + 20_000, "now");
    await arena.tick(T0 + 20_000);
    await arena.submit("ada", bell(), T0 + 30_000);
    const week = await repo.weekly(0, 10);
    expect(week.find((p) => p.id === "ada")).toMatchObject({ points: 3, wins: 1, played: 1 });
    expect(week.some((p) => p.id.startsWith("bot:"))).toBe(false);
  });

  it("resets the week on Monday, UTC", () => {
    // Wednesday 2026-09-23 12:00 UTC → Monday 2026-09-21 00:00 UTC.
    expect(new Date(weekStart(Date.UTC(2026, 8, 23, 12))).toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });
});
