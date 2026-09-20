/**
 * Arena persistence.
 *
 * The interesting cases are all about `settleMatch`, because TRD §12.2 puts a
 * hard constraint on it — "the rating update and the match record commit in one
 * transaction" — and because settling the same match twice would hand out a
 * rating change nobody played for.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { openSqliteRepo, type ArenaRepo } from "../src/db/repo.ts";
import { STARTING_RATING } from "../src/arena/elo.ts";

let repo: ArenaRepo & { close(): void };

function seedMatch(id = "m1") {
  const a = repo.touchPlayer("pa", "Ada");
  const b = repo.touchPlayer("pb", "Bo");
  repo.createMatch({
    id, mode: "blitz", challenge: { target: "bell" },
    playerA: a.id, playerB: b.id,
    ratingABefore: a.rating, ratingBBefore: b.rating,
    startedAt: Date.now(),
  });
  return { a, b };
}

beforeEach(() => {
  repo = openSqliteRepo(":memory:");
});

describe("players", () => {
  it("creates on first sight at the starting rating", () => {
    const p = repo.touchPlayer("p1", "Ada");
    expect(p.rating).toBe(STARTING_RATING);
    expect(p.gamesPlayed).toBe(0);
  });

  it("does not reset a rating when the same player returns", () => {
    repo.touchPlayer("p1", "Ada");
    seedMatch();
    repo.settleMatch("m1", "a", false, Date.now());
    const before = repo.getPlayer("pa")!.rating;
    const again = repo.touchPlayer("pa", "Ada Renamed");
    expect(again.rating).toBe(before);
    expect(again.displayName).toBe("Ada Renamed");
  });

  it("is null for someone who has never played", () => {
    expect(repo.getPlayer("nobody")).toBeNull();
  });
});

describe("settling a match", () => {
  it("moves both ratings and records the winner", () => {
    seedMatch();
    const change = repo.settleMatch("m1", "a", false, Date.now())!;
    expect(change.deltaA).toBe(16);
    expect(change.deltaB).toBe(-16);

    expect(repo.getPlayer("pa")!.rating).toBe(1216);
    expect(repo.getPlayer("pb")!.rating).toBe(1184);

    const m = repo.getMatch("m1")!;
    expect(m.winnerId).toBe("pa");
    expect(m.ratingAAfter).toBe(1216);
    expect(m.endedAt).not.toBeNull();
  });

  it("counts the game for both players", () => {
    seedMatch();
    repo.settleMatch("m1", "a", false, Date.now());
    expect(repo.getPlayer("pa")!.gamesPlayed).toBe(1);
    expect(repo.getPlayer("pb")!.gamesPlayed).toBe(1);
  });

  it("refuses to settle the same match twice", () => {
    seedMatch();
    expect(repo.settleMatch("m1", "a", false, Date.now())).not.toBeNull();
    const ratingAfterFirst = repo.getPlayer("pa")!.rating;

    expect(repo.settleMatch("m1", "a", false, Date.now())).toBeNull();
    expect(repo.getPlayer("pa")!.rating).toBe(ratingAfterFirst);
    expect(repo.getPlayer("pa")!.gamesPlayed).toBe(1);
  });

  it("records a flagged match but withholds the rating", () => {
    // TRD §12.4: "Flagged matches are recorded, not silently reversed."
    seedMatch();
    const change = repo.settleMatch("m1", "a", true, Date.now())!;
    expect(change.deltaA).toBe(0);
    expect(change.deltaB).toBe(0);

    expect(repo.getPlayer("pa")!.rating).toBe(STARTING_RATING);
    expect(repo.getPlayer("pa")!.gamesPlayed).toBe(0);

    const m = repo.getMatch("m1")!;
    expect(m.flagged).toBe(true);
    expect(m.winnerId).toBe("pa");
    expect(m.endedAt).not.toBeNull();
  });

  it("leaves a draw with no winner", () => {
    seedMatch();
    repo.settleMatch("m1", "draw", false, Date.now());
    expect(repo.getMatch("m1")!.winnerId).toBeNull();
  });

  it("returns null for a match that does not exist", () => {
    expect(repo.settleMatch("nope", "a", false, Date.now())).toBeNull();
  });
});

describe("submissions", () => {
  it("come back in submitted order, earliest first", () => {
    seedMatch();
    const base = Date.now();
    repo.recordSubmission({
      matchId: "m1", playerId: "pb", ir: {}, irHash: "h-b",
      passed: true, fidelity: 1, gateCount: 3, submittedAt: base + 50, durationMs: 50,
    });
    repo.recordSubmission({
      matchId: "m1", playerId: "pa", ir: {}, irHash: "h-a",
      passed: true, fidelity: 1, gateCount: 2, submittedAt: base + 10, durationMs: 10,
    });

    const rows = repo.submissionsFor("m1");
    expect(rows.map((r) => r.playerId)).toEqual(["pa", "pb"]);
    expect(rows[0].submittedAt).toBeLessThan(rows[1].submittedAt);
  });

  it("keeps failed attempts, so a result stays explainable", () => {
    seedMatch();
    repo.recordSubmission({
      matchId: "m1", playerId: "pa", ir: {}, irHash: "h",
      passed: false, fidelity: 0.5, gateCount: 1, submittedAt: Date.now(), durationMs: 5,
    });
    const rows = repo.submissionsFor("m1");
    expect(rows).toHaveLength(1);
    expect(rows[0].passed).toBe(false);
  });
});

describe("leaderboard and history", () => {
  it("lists only players who have finished a match, best first", () => {
    seedMatch();
    repo.touchPlayer("pc", "Cy");
    repo.settleMatch("m1", "a", false, Date.now());

    const board = repo.leaderboard(10);
    expect(board.map((p) => p.id)).toEqual(["pa", "pb"]);
    expect(board[0].rating).toBeGreaterThan(board[1].rating);
  });

  it("shows a settled match to both players and hides an open one", () => {
    seedMatch();
    expect(repo.matchHistory("pa", 10)).toHaveLength(0);
    repo.settleMatch("m1", "a", false, Date.now());
    expect(repo.matchHistory("pa", 10)).toHaveLength(1);
    expect(repo.matchHistory("pb", 10)).toHaveLength(1);
  });
});
