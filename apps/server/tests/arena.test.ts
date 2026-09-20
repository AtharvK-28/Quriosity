/**
 * The match lifecycle, and the trust boundary.
 *
 * TRD §7.2: "Nothing a client sends over the socket affects the outcome of a
 * match." These call the service directly, which is the same thing the socket
 * does — so a test that gets a win it did not earn here is a real hole.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { openSqliteRepo, type ArenaRepo } from "../src/db/repo.ts";
import { createArena, MIN_PLAUSIBLE_SOLVE_MS, HEARTBEAT_TIMEOUT_MS, type Arena, type ArenaChallenge } from "../src/arena/service.ts";
import { TARGETS } from "../../web/lib/grade/fidelity";
import { emptyCircuit, nextGateId, type Circuit, type GateType } from "../../web/lib/ir/types";

const T0 = 1_700_000_000_000;

const BELL: ArenaChallenge = {
  id: "c.bell", title: "Two that agree", brief: "Build a Bell pair.",
  qubits: 2, target: TARGETS.bellPhiPlus(), allowedGates: ["h", "cx"], par: 2,
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

let repo: ArenaRepo & { close(): void };
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

beforeEach(() => {
  repo = openSqliteRepo(":memory:");
  sent = [];
  arena = createArena(repo, { events: events(), challenges: [BELL], pick: () => BELL });
});

function pairUp(now = T0) {
  arena.queue("ada", "Ada", "blitz", now);
  arena.queue("bo", "Bo", "blitz", now);
  arena.tick(now);
}

describe("finding a match", () => {
  it("gives both players the identical challenge, simultaneously", () => {
    pairUp();
    const found = ofType("match.found");
    expect(found).toHaveLength(2);
    expect(found[0].payload.matchId).toBe(found[1].payload.matchId);
    expect(found[0].payload.challenge.id).toBe(found[1].payload.challenge.id);
    expect(found[0].payload.challenge.qubits).toBe(2);
  });

  it("tells each player about the other, never about themselves", () => {
    pairUp();
    const toAda = ofType("match.found").find((s) => s.to === "ada")!;
    expect(toAda.payload.opponent.name).toBe("Bo");
    expect(toAda.payload.opponent.rating).toBe(1200);
  });

  it("does not queue a player who is already in a match", () => {
    pairUp();
    arena.queue("ada", "Ada", "blitz", T0 + 100);
    expect(arena.inQueue("ada")).toBe(false);
  });
});

describe("deciding the winner", () => {
  it("gives it to the first passing submission", () => {
    pairUp();
    const r = arena.submit("ada", bellSolution(), T0 + 5_000);
    expect(r).toMatchObject({ status: "graded", passed: true, won: true });

    const results = ofType("match.result");
    expect(results).toHaveLength(2);
    expect(results[0].payload.winnerId).toBe("ada");
    expect(results[1].payload.winnerId).toBe("ada");
  });

  it("tells both clients the same thing, from one computation", () => {
    pairUp();
    arena.submit("ada", bellSolution(), T0 + 5_000);
    const [toA, toB] = ofType("match.result");
    expect(toA.payload.winnerId).toBe(toB.payload.winnerId);
    expect(toA.payload.matchId).toBe(toB.payload.matchId);
    // Each is told their own rating and the opponent's, mirrored.
    expect(toA.payload.yourRating).toBe(toB.payload.opponentRating);
    expect(toB.payload.yourRating).toBe(toA.payload.opponentRating);
    expect(toA.payload.delta).toBe(16);
    expect(toB.payload.delta).toBe(-16);
  });

  it("does not end the match on a failing submission", () => {
    pairUp();
    const r = arena.submit("ada", wrongCircuit(), T0 + 5_000);
    expect(r).toMatchObject({ status: "graded", passed: false, won: false });
    expect(ofType("match.result")).toHaveLength(0);
    expect(arena.matchFor("ada")).not.toBeNull();
  });

  it("lets the slower player still win if the faster one was wrong", () => {
    pairUp();
    arena.submit("ada", wrongCircuit(), T0 + 3_000);
    arena.submit("bo", bellSolution(), T0 + 9_000);
    expect(ofType("match.result")[0].payload.winnerId).toBe("bo");
  });

  it("ignores a second submission once the match is settled", () => {
    pairUp();
    arena.submit("ada", bellSolution(), T0 + 5_000);
    const after = arena.submit("bo", bellSolution(), T0 + 6_000);
    expect(after).toEqual({ status: "no_match" });
    expect(ofType("match.result")).toHaveLength(2);
    expect(repo.getPlayer("ada")!.rating).toBe(1216);
  });

  it("keeps every submission, so the result can be re-derived", () => {
    pairUp();
    const id = arena.matchFor("ada")!.id;
    arena.submit("ada", wrongCircuit(), T0 + 2_000);
    arena.submit("bo", bellSolution(), T0 + 4_000);
    const rows = repo.submissionsFor(id);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.passed)).toHaveLength(1);
  });
});

describe("the trust boundary", () => {
  it("refuses a submission from someone with no match", () => {
    expect(arena.submit("ghost", bellSolution(), T0)).toEqual({ status: "no_match" });
  });

  it("rejects malformed input rather than trusting its shape", () => {
    pairUp();
    for (const junk of [null, "circuit", 42, {}, { gates: "no" }]) {
      const r = arena.submit("ada", junk, T0 + 1);
      expect(r.status).toBe("invalid");
    }
    expect(ofType("match.result")).toHaveLength(0);
  });

  it("re-validates the IR against the platform's own invariants", () => {
    pairUp();
    // Two gates on one wire in the same column — invariant violation.
    const bad = circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "x", targets: [0], column: 0 },
    ]);
    expect(arena.submit("ada", bad, T0 + 1).status).toBe("invalid");
  });

  it("rejects a circuit of the wrong width", () => {
    pairUp();
    const r = arena.submit("ada", circuit(3, [{ type: "h", targets: [0], column: 0 }]), T0 + 1);
    expect(r).toMatchObject({ status: "rejected" });
  });

  it("never lets reported progress decide anything", () => {
    pairUp();
    arena.progress("ada", { gateCount: 999, runCount: 999 });
    expect(ofType("match.result")).toHaveLength(0);
    // It reaches the opponent, and only the opponent.
    const p = ofType("match.opponent_progress");
    expect(p).toHaveLength(1);
    expect(p[0].to).toBe("bo");
  });

  it("forwards progress as counts only, never the circuit", () => {
    pairUp();
    arena.progress("ada", { gateCount: 2, runCount: 1 });
    const payload = ofType("match.opponent_progress")[0].payload;
    expect(Object.keys(payload).sort()).toEqual(["gateCount", "runCount"]);
  });
});

describe("anti-cheat", () => {
  it("flags an impossibly fast solve and withholds the rating", () => {
    pairUp();
    // Passing within the floor time: not physically placeable.
    arena.submit("ada", bellSolution(), T0 + 10);
    const result = ofType("match.result").find((s) => s.to === "ada")!.payload;
    expect(result.flagged).toBe(true);
    expect(result.delta).toBe(0);
    // Recorded, not reversed.
    expect(repo.getPlayer("ada")!.rating).toBe(1200);
    expect(repo.getPlayer("ada")!.gamesPlayed).toBe(0);
  });

  it("does not flag a solve above the floor", () => {
    pairUp();
    arena.submit("ada", bellSolution(), T0 + MIN_PLAUSIBLE_SOLVE_MS + 1);
    expect(ofType("match.result")[0].payload.flagged).toBe(false);
  });
});

describe("disconnects", () => {
  it("abandons to the opponent after the grace period", () => {
    pairUp();
    arena.heartbeat("ada", T0 + 1_000);
    arena.heartbeat("bo", T0 + 1_000);
    arena.tick(T0 + 1_000 + HEARTBEAT_TIMEOUT_MS - 1);
    expect(ofType("match.abandoned")).toHaveLength(0);

    // Ada keeps talking; Bo went quiet at T0+1s. Tick at a moment where only
    // Bo has exceeded the grace — if both had, the loop would abandon whoever
    // it reached first and the test would be asserting insertion order.
    arena.heartbeat("ada", T0 + 20_000);
    arena.tick(T0 + 49_000);
    const ab = ofType("match.abandoned");
    expect(ab).toHaveLength(1);
    expect(ab[0].to).toBe("ada");
    expect(ofType("match.result")).toHaveLength(2);
  });

  it("does not forfeit a match the instant a socket drops", () => {
    pairUp();
    arena.disconnect("bo");
    arena.tick(T0 + 1_000);
    expect(ofType("match.abandoned")).toHaveLength(0);
    expect(arena.matchFor("ada")).not.toBeNull();
  });
});
