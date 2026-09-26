/**
 * The match lifecycle, and the trust boundary.
 *
 * TRD §7.2: "Nothing a client sends over the socket affects the outcome of a
 * match." These call the service directly, which is the same thing the socket
 * does — so a test that gets a win it did not earn here is a real hole.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { arenaRepo, type ArenaRepo } from "../src/db/repo.ts";
import { freshDb } from "./db.ts";
import {
  createArena, poolFor, COPY_FLOOR_MS, GOLF_CAP_MS, MIN_PLAUSIBLE_SOLVE_MS, HEARTBEAT_TIMEOUT_MS,
  type Arena, type ArenaChallenge,
} from "../src/arena/service.ts";
import { irHashSync } from "../../web/lib/ir/hash";
import { TARGETS } from "../../web/lib/grade/fidelity";
import { emptyCircuit, nextGateId, type Circuit, type GateType } from "../../web/lib/ir/types";

const T0 = 1_700_000_000_000;

const BELL: ArenaChallenge = {
  id: "c.bell", title: "Two that agree", brief: "Build a Bell pair.",
  kind: "reach", qubits: 2, target: TARGETS.bellPhiPlus(), allowedGates: ["h", "cx", "z"], par: 2,
};

function circuit(qubits: number, gates: Array<{ type: GateType; targets: number[]; controls?: number[]; column: number }>): Circuit {
  const c = emptyCircuit(qubits);
  c.gates = gates.map((g) => ({
    id: nextGateId(), type: g.type, targets: g.targets,
    controls: g.controls ?? [], params: [], column: g.column,
  }));
  return c;
}

const bellSolution = () => circuit(2, [
  { type: "h", targets: [0], column: 0 },
  { type: "cx", targets: [1], controls: [0], column: 1 },
]);

const wrongCircuit = () => circuit(2, [{ type: "h", targets: [0], column: 0 }]);

let repo: ArenaRepo;
let arena: Arena;
let sent: Array<{ to: string; type: string; payload: any }>;

function events() {
  return {
    matchFound: (to: string, payload: any) => sent.push({ to, type: "match.found", payload }),
    opponentProgress: (to: string, payload: any) => sent.push({ to, type: "match.opponent_progress", payload }),
    matchResult: (to: string, payload: any) => sent.push({ to, type: "match.result", payload }),
    matchAbandoned: (to: string, payload: any) => sent.push({ to, type: "match.abandoned", payload }),
    queueTimedOut: (to: string) => sent.push({ to, type: "queue.timeout", payload: {} }),
  };
}

function ofType(type: string) {
  return sent.filter((s) => s.type === type);
}

beforeEach(async () => {
  repo = arenaRepo(await freshDb());
  sent = [];
  arena = createArena(repo, { events: events(), challenges: [BELL], pick: () => BELL });
});

async function pairUp(now = T0) {
  await arena.queue("ada", "Ada", "blitz", now);
  await arena.queue("bo", "Bo", "blitz", now);
  await arena.tick(now);
}

const player = async (id: string) => (await repo.getPlayer(id))!;

describe("finding a match", () => {
  it("gives both players the identical challenge, simultaneously", async () => {
    await pairUp();
    const found = ofType("match.found");
    expect(found).toHaveLength(2);
    expect(found[0].payload.matchId).toBe(found[1].payload.matchId);
    expect(found[0].payload.challenge.id).toBe(found[1].payload.challenge.id);
    expect(found[0].payload.challenge.qubits).toBe(2);
  });

  it("tells each player about the other, never about themselves", async () => {
    await pairUp();
    const toAda = ofType("match.found").find((s) => s.to === "ada")!;
    expect(toAda.payload.opponent.name).toBe("Bo");
    expect(toAda.payload.opponent.rating).toBe(1200);
  });

  it("does not queue a player who is already in a match", async () => {
    await pairUp();
    await arena.queue("ada", "Ada", "blitz", T0 + 100);
    expect(arena.inQueue("ada")).toBe(false);
  });
});

describe("deciding the winner", () => {
  it("gives it to the first passing submission", async () => {
    await pairUp();
    const r = await arena.submit("ada", bellSolution(), T0 + 5_000);
    expect(r).toMatchObject({ status: "graded", passed: true, won: true });

    const results = ofType("match.result");
    expect(results).toHaveLength(2);
    expect(results[0].payload.winnerId).toBe("ada");
    expect(results[1].payload.winnerId).toBe("ada");
  });

  it("tells both clients the same thing, from one computation", async () => {
    await pairUp();
    await arena.submit("ada", bellSolution(), T0 + 5_000);
    const [toA, toB] = ofType("match.result");
    expect(toA.payload.winnerId).toBe(toB.payload.winnerId);
    expect(toA.payload.matchId).toBe(toB.payload.matchId);
    // Each is told their own rating and the opponent's, mirrored.
    expect(toA.payload.yourRating).toBe(toB.payload.opponentRating);
    expect(toB.payload.yourRating).toBe(toA.payload.opponentRating);
    expect(toA.payload.delta).toBe(16);
    expect(toB.payload.delta).toBe(-16);
  });

  it("does not end the match on a failing submission", async () => {
    await pairUp();
    const r = await arena.submit("ada", wrongCircuit(), T0 + 5_000);
    expect(r).toMatchObject({ status: "graded", passed: false, won: false });
    expect(ofType("match.result")).toHaveLength(0);
    expect(arena.matchFor("ada")).not.toBeNull();
  });

  it("lets the slower player still win if the faster one was wrong", async () => {
    await pairUp();
    await arena.submit("ada", wrongCircuit(), T0 + 3_000);
    await arena.submit("bo", bellSolution(), T0 + 9_000);
    expect(ofType("match.result")[0].payload.winnerId).toBe("bo");
  });

  it("ignores a second submission once the match is settled", async () => {
    await pairUp();
    await arena.submit("ada", bellSolution(), T0 + 5_000);
    const after = await arena.submit("bo", bellSolution(), T0 + 6_000);
    expect(after).toEqual({ status: "no_match" });
    expect(ofType("match.result")).toHaveLength(2);
    expect((await player("ada")).rating).toBe(1216);
  });

  it("gives two passes that land together exactly one winner", async () => {
    await pairUp();
    // Fired together, not awaited in turn: the async repository must not let
    // both through while the first settle is still being written.
    const [a, b] = await Promise.all([
      arena.submit("ada", bellSolution(), T0 + 5_000),
      arena.submit("bo", bellSolution(), T0 + 5_000),
    ]);
    const wins = [a, b].filter((r) => r.status === "graded" && r.won);
    expect(wins).toHaveLength(1);
    const results = ofType("match.result");
    expect(results).toHaveLength(2);
    expect(results[0].payload.winnerId).toBe(results[1].payload.winnerId);
    expect((await player("ada")).gamesPlayed).toBe(1);
  });

  it("keeps every submission, so the result can be re-derived", async () => {
    await pairUp();
    const id = arena.matchFor("ada")!.id;
    await arena.submit("ada", wrongCircuit(), T0 + 2_000);
    await arena.submit("bo", bellSolution(), T0 + 4_000);
    const rows = await repo.submissionsFor(id);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.passed)).toHaveLength(1);
  });
});

describe("the trust boundary", () => {
  it("refuses a submission from someone with no match", async () => {
    expect(await arena.submit("ghost", bellSolution(), T0)).toEqual({ status: "no_match" });
  });

  it("rejects malformed input rather than trusting its shape", async () => {
    await pairUp();
    for (const junk of [null, "circuit", 42, {}, { gates: "no" }]) {
      const r = await arena.submit("ada", junk, T0 + 1);
      expect(r.status).toBe("invalid");
    }
    expect(ofType("match.result")).toHaveLength(0);
  });

  it("re-validates the IR against the platform's own invariants", async () => {
    await pairUp();
    // Two gates on one wire in the same column — invariant violation.
    const bad = circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "x", targets: [0], column: 0 },
    ]);
    expect((await arena.submit("ada", bad, T0 + 1)).status).toBe("invalid");
  });

  it("rejects a circuit of the wrong width", async () => {
    await pairUp();
    const r = await arena.submit("ada", circuit(3, [{ type: "h", targets: [0], column: 0 }]), T0 + 1);
    expect(r).toMatchObject({ status: "rejected" });
  });

  it("never lets reported progress decide anything", async () => {
    await pairUp();
    arena.progress("ada", { gateCount: 999, runCount: 999 });
    expect(ofType("match.result")).toHaveLength(0);
    // It reaches the opponent, and only the opponent.
    const p = ofType("match.opponent_progress");
    expect(p).toHaveLength(1);
    expect(p[0].to).toBe("bo");
  });

  it("forwards progress as counts only, never the circuit", async () => {
    await pairUp();
    arena.progress("ada", { gateCount: 2, runCount: 1 });
    const payload = ofType("match.opponent_progress")[0].payload;
    expect(Object.keys(payload).sort()).toEqual(["gateCount", "runCount"]);
  });
});

describe("anti-cheat", () => {
  it("flags an impossibly fast solve and withholds the rating", async () => {
    await pairUp();
    // Passing within the floor time: not physically placeable.
    await arena.submit("ada", bellSolution(), T0 + 10);
    const result = ofType("match.result").find((s) => s.to === "ada")!.payload;
    expect(result.flagged).toBe(true);
    expect(result.delta).toBe(0);
    // Recorded, not reversed.
    expect((await player("ada")).rating).toBe(1200);
    expect((await player("ada")).gamesPlayed).toBe(0);
  });

  it("does not flag a solve above the floor", async () => {
    await pairUp();
    await arena.submit("ada", bellSolution(), T0 + MIN_PLAUSIBLE_SOLVE_MS + 1);
    expect(ofType("match.result")[0].payload.flagged).toBe(false);
  });
});

describe("disconnects", () => {
  it("abandons to the opponent after the grace period", async () => {
    await pairUp();
    arena.heartbeat("ada", T0 + 1_000);
    arena.heartbeat("bo", T0 + 1_000);
    await arena.tick(T0 + 1_000 + HEARTBEAT_TIMEOUT_MS - 1);
    expect(ofType("match.abandoned")).toHaveLength(0);

    // Ada keeps talking; Bo went quiet at T0+1s. Tick at a moment where only
    // Bo has exceeded the grace — if both had, the loop would abandon whoever
    // it reached first and the test would be asserting insertion order.
    arena.heartbeat("ada", T0 + 20_000);
    await arena.tick(T0 + 49_000);
    const ab = ofType("match.abandoned");
    expect(ab).toHaveLength(1);
    expect(ab[0].to).toBe("ada");
    expect(ofType("match.result")).toHaveLength(2);
  });

  it("does not forfeit a match the instant a socket drops", async () => {
    await pairUp();
    arena.disconnect("bo");
    await arena.tick(T0 + 1_000);
    expect(ofType("match.abandoned")).toHaveLength(0);
    expect(arena.matchFor("ada")).not.toBeNull();
  });
});

/* -- Modes (PRD E9-S6) and the copy check (E9-S8) ------------------------------ */

/** H, Z, Z, CNOT: the Bell state again, in four gates instead of two. */
const longBell = () => circuit(2, [
  { type: "h", targets: [0], column: 0 },
  { type: "z", targets: [0], column: 1 },
  { type: "z", targets: [0], column: 2 },
  { type: "cx", targets: [1], controls: [0], column: 3 },
]);

describe("golf", () => {
  const GOLF: ArenaChallenge = { ...BELL, id: "g.bell", kind: "golf", par: 2 };

  async function golfMatch() {
    arena = createArena(repo, { events: events(), challenges: [GOLF], pick: () => GOLF });
    await arena.queue("ada", "Ada", "golf", T0);
    await arena.queue("bo", "Bo", "golf", T0);
    await arena.tick(T0);
  }

  it("tells both players the cap", async () => {
    await golfMatch();
    const found = ofType("match.found");
    expect(found.map((f) => f.payload.capMs)).toEqual([GOLF_CAP_MS, GOLF_CAP_MS]);
  });

  it("does not end on the first correct circuit", async () => {
    await golfMatch();
    const r = await arena.submit("ada", longBell(), T0 + 20_000);
    expect(r).toMatchObject({ status: "graded", passed: true, best: 4 });
    expect(ofType("match.result")).toHaveLength(0);
    expect(arena.matchFor("bo")).not.toBeNull();
  });

  it("gives it to the fewer gates when the cap falls, even if they were slower", async () => {
    await golfMatch();
    await arena.submit("ada", longBell(), T0 + 20_000);
    await arena.submit("bo", circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "z", targets: [1], column: 0 },
      { type: "cx", targets: [1], controls: [0], column: 1 },
    ]), T0 + 90_000);
    await arena.tick(T0 + GOLF_CAP_MS);
    const results = ofType("match.result");
    expect(results).toHaveLength(2);
    expect(results[0].payload.winnerId).toBe("bo");
    expect(results[0].payload.reason).toBe("fewest gates");
  });

  it("lets a player improve, and keeps their best", async () => {
    await golfMatch();
    await arena.submit("ada", longBell(), T0 + 20_000);
    const r = await arena.submit("ada", bellSolution(), T0 + 40_000);
    expect(r).toMatchObject({ passed: true, best: 2 });
    // A worse later attempt does not replace a better one.
    const worse = await arena.submit("ada", longBell(), T0 + 50_000);
    expect(worse).toMatchObject({ best: 2 });
  });

  it("breaks a tie on gates by who got there first", async () => {
    await golfMatch();
    await arena.submit("bo", longBell(), T0 + 30_000);
    await arena.submit("ada", longBell(), T0 + 45_000);
    await arena.tick(T0 + GOLF_CAP_MS);
    expect(ofType("match.result")[0].payload.winnerId).toBe("bo");
  });

  it("is a draw when nobody reaches the target", async () => {
    await golfMatch();
    await arena.submit("ada", wrongCircuit(), T0 + 30_000);
    await arena.tick(T0 + GOLF_CAP_MS);
    const [res] = ofType("match.result");
    expect(res.payload.winnerId).toBeNull();
    expect(res.payload.reason).toBe("nobody reached the target");
  });

  it("ends early once both are at par — neither can then be beaten", async () => {
    await golfMatch();
    await arena.submit("ada", bellSolution(), T0 + 20_000);
    expect(ofType("match.result")).toHaveLength(0);
    await arena.submit("bo", bellSolution(), T0 + 25_000);
    const results = ofType("match.result");
    expect(results).toHaveLength(2);
    expect(results[0].payload.winnerId).toBe("ada");
  });
});

describe("bug hunt", () => {
  it("draws from bug hunts only, and hands both players the broken circuit", async () => {
    const BUG: ArenaChallenge = {
      ...BELL, id: "b.bell", kind: "bughunt",
      starter: [{ type: "cx", targets: [1], controls: [0], column: 0 }, { type: "h", targets: [0], column: 1 }],
    };
    expect(poolFor("bughunt", [BELL, BUG]).map((c) => c.id)).toEqual(["b.bell"]);
    expect(poolFor("blitz", [BELL, BUG]).map((c) => c.id)).toEqual(["c.bell"]);

    arena = createArena(repo, { events: events(), challenges: [BELL, BUG] });
    await arena.queue("ada", "Ada", "bughunt", T0);
    await arena.queue("bo", "Bo", "bughunt", T0);
    await arena.tick(T0);
    const [found] = ofType("match.found");
    expect(found.payload.mode).toBe("bughunt");
    expect(found.payload.challenge.starter).toHaveLength(2);
  });
});

describe("the copy check (TRD §12.4)", () => {
  const WITH_REF: ArenaChallenge = { ...BELL, referenceHash: irHashSync(bellSolution()) };

  beforeEach(async () => {
    arena = createArena(repo, { events: events(), challenges: [WITH_REF], pick: () => WITH_REF });
    await pairUp();
  });

  it("never sends the reference hash to a player", () => {
    for (const f of ofType("match.found")) expect(f.payload.challenge.referenceHash).toBeUndefined();
  });

  it("flags the reference answer, exactly, first try, under the floor", async () => {
    await arena.submit("ada", bellSolution(), T0 + COPY_FLOOR_MS - 1_000);
    const [res] = ofType("match.result");
    expect(res.payload.flagged).toBe(true);
    expect(res.payload.delta).toBe(0);
  });

  it("does not flag the same circuit found honestly — slower than the floor", async () => {
    await arena.submit("ada", bellSolution(), T0 + COPY_FLOOR_MS + 1_000);
    expect(ofType("match.result")[0].payload.flagged).toBe(false);
  });

  it("does not flag it after a first attempt that missed", async () => {
    await arena.submit("ada", wrongCircuit(), T0 + 2_000);
    await arena.submit("ada", bellSolution(), T0 + 4_000);
    expect(ofType("match.result")[0].payload.flagged).toBe(false);
  });

  it("does not flag a different correct circuit, however fast", async () => {
    await arena.submit("ada", longBell(), T0 + 3_000);
    expect(ofType("match.result")[0].payload.flagged).toBe(false);
  });
});
