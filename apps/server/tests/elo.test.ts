/**
 * Elo — TRD §12.2.
 *
 * Checked against numbers worked by hand rather than against the
 * implementation's own output, because a rating system that is merely
 * self-consistent can be self-consistently wrong.
 */

import { describe, expect, it } from "vitest";
import {
  RATING_FLOOR, STARTING_RATING, applyResult, expectedScore, kFactor,
} from "../src/arena/elo.ts";

describe("expected score", () => {
  it("is even between equal ratings", () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 12);
  });

  it("is 0.76 at a 200-point advantage", () => {
    // 1 / (1 + 10^(-200/400)) = 1 / (1 + 10^-0.5) = 0.7597…
    expect(expectedScore(1400, 1200)).toBeCloseTo(0.759746, 5);
  });

  it("is symmetric — the two expectations sum to one", () => {
    for (const [a, b] of [[1200, 1200], [1400, 1200], [900, 1730], [100, 2400]]) {
      expect(expectedScore(a, b) + expectedScore(b, a)).toBeCloseTo(1, 12);
    }
  });
});

describe("K factor", () => {
  it("is 32 while provisional and 16 after thirty games", () => {
    expect(kFactor(0)).toBe(32);
    expect(kFactor(29)).toBe(32);
    expect(kFactor(30)).toBe(16);
    expect(kFactor(500)).toBe(16);
  });
});

describe("applying a result", () => {
  it("moves equal provisional players by half of K", () => {
    // Expected 0.5, K 32 → 32 * (1 - 0.5) = +16 for the winner.
    const r = applyResult(
      { rating: 1200, gamesPlayed: 0 },
      { rating: 1200, gamesPlayed: 0 },
      "a",
    );
    expect(r.ratingA).toBe(1216);
    expect(r.ratingB).toBe(1184);
    expect(r.deltaA).toBe(16);
    expect(r.deltaB).toBe(-16);
  });

  it("gives the underdog more for the same win", () => {
    const upset = applyResult(
      { rating: 1000, gamesPlayed: 0 },
      { rating: 1400, gamesPlayed: 0 },
      "a",
    );
    const expected = applyResult(
      { rating: 1400, gamesPlayed: 0 },
      { rating: 1000, gamesPlayed: 0 },
      "a",
    );
    expect(upset.deltaA).toBeGreaterThan(expected.deltaA);
    expect(upset.deltaA).toBe(29); // 32 * (1 - 0.0909…) = 29.09 → 29
    expect(expected.deltaA).toBe(3);
  });

  it("scores each player on their own K", () => {
    // A is provisional (32), B is settled (16). A wins; the moves differ.
    const r = applyResult(
      { rating: 1200, gamesPlayed: 0 },
      { rating: 1200, gamesPlayed: 100 },
      "a",
    );
    expect(r.deltaA).toBe(16);
    expect(r.deltaB).toBe(-8);
  });

  it("splits a draw toward the stronger player's loss", () => {
    const r = applyResult(
      { rating: 1400, gamesPlayed: 0 },
      { rating: 1000, gamesPlayed: 0 },
      "draw",
    );
    expect(r.deltaA).toBeLessThan(0);
    expect(r.deltaB).toBeGreaterThan(0);
    expect(r.deltaA + r.deltaB).toBe(0);
  });

  it("clamps a loss that would fall through the floor", () => {
    // 32 * (0 - 0.5) = -16, which from 110 would land at 94.
    const r = applyResult(
      { rating: RATING_FLOOR + 10, gamesPlayed: 0 },
      { rating: RATING_FLOOR + 10, gamesPlayed: 0 },
      "b",
    );
    expect(r.ratingA).toBe(RATING_FLOOR);
  });

  it("cannot be ground to the floor by losing to much stronger players", () => {
    // Not the clamp — the arithmetic. Expected score against someone 2000
    // points above you is ~0, so the loss rounds to nothing and the rating
    // stops falling on its own. Worth knowing: the floor almost never binds,
    // and a beginner who queues into the top of the ladder is not punished.
    let rating = RATING_FLOOR + 5;
    for (let i = 0; i < 200; i++) {
      rating = applyResult(
        { rating, gamesPlayed: 0 },
        { rating: 2400, gamesPlayed: 0 },
        "b",
      ).ratingA;
    }
    expect(rating).toBeGreaterThanOrEqual(RATING_FLOOR);
    expect(rating).toBe(RATING_FLOOR + 5);
  });

  it("is zero-sum when both players share a K", () => {
    for (const [ra, rb] of [[1200, 1200], [1500, 1100], [800, 2000]]) {
      const r = applyResult({ rating: ra, gamesPlayed: 0 }, { rating: rb, gamesPlayed: 0 }, "a");
      // Rounding can move the pair by a point; it must not leak more.
      expect(Math.abs(r.deltaA + r.deltaB)).toBeLessThanOrEqual(1);
    }
  });

  it("starts everyone at 1200", () => {
    expect(STARTING_RATING).toBe(1200);
  });
});
