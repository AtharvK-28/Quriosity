/**
 * Matchmaking — TRD §12.1.
 *
 * The clock is an argument, so these assert the widening schedule at exact
 * instants rather than by waiting for them.
 */

import { describe, expect, it } from "vitest";
import {
  BAND_MAX, BAND_START, QUEUE_TIMEOUT_MS, bandFor, createMatchmaker,
} from "../src/arena/queue.ts";

const T0 = 1_700_000_000_000;
const entry = (playerId: string, rating: number, joinedAt = T0, mode = "blitz") =>
  ({ playerId, rating, mode, joinedAt });

describe("the band", () => {
  it("starts at 50 and widens by 50 every two seconds", () => {
    expect(bandFor(0)).toBe(BAND_START);
    expect(bandFor(1_999)).toBe(50);
    expect(bandFor(2_000)).toBe(100);
    expect(bandFor(4_000)).toBe(150);
  });

  it("stops at 400", () => {
    expect(bandFor(60_000)).toBe(BAND_MAX);
    expect(bandFor(10 * 60_000)).toBe(BAND_MAX);
  });
});

describe("pairing", () => {
  it("does not pair a lone player", () => {
    const mm = createMatchmaker();
    mm.join(entry("a", 1200));
    expect(mm.pair(T0)).toEqual([]);
    expect(mm.has("a")).toBe(true);
  });

  it("pairs two players inside the opening band", () => {
    const mm = createMatchmaker();
    mm.join(entry("a", 1200));
    mm.join(entry("b", 1230));
    const pairs = mm.pair(T0);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].map((e) => e.playerId).sort()).toEqual(["a", "b"]);
    expect(mm.size()).toBe(0);
  });

  it("refuses a gap wider than the band, then accepts it once both have waited", () => {
    const mm = createMatchmaker();
    mm.join(entry("a", 1000));
    mm.join(entry("b", 1180)); // 180 apart
    expect(mm.pair(T0)).toEqual([]);
    expect(mm.pair(T0 + 4_000)).toEqual([]);   // band 150, still too far
    expect(mm.pair(T0 + 6_000)).toHaveLength(1); // band 200, accepted
  });

  it("takes the closest opponent, not the first one", () => {
    const mm = createMatchmaker();
    mm.join(entry("a", 1200));
    mm.join(entry("far", 1245, T0 + 1));
    mm.join(entry("near", 1205, T0 + 2));
    const [pair] = mm.pair(T0 + 10);
    expect(pair.map((e) => e.playerId).sort()).toEqual(["a", "near"]);
    expect(mm.has("far")).toBe(true);
  });

  it("serves the longest wait first", () => {
    const mm = createMatchmaker();
    mm.join(entry("old", 1200, T0));
    mm.join(entry("new", 1200, T0 + 5_000));
    mm.join(entry("other", 1200, T0 + 6_000));
    const [pair] = mm.pair(T0 + 7_000);
    expect(pair[0].playerId).toBe("old");
  });

  it("never pairs a player with themselves", () => {
    const mm = createMatchmaker();
    mm.join(entry("a", 1200));
    mm.join(entry("a", 1200)); // same id joining twice
    expect(mm.size()).toBe(1);
    expect(mm.pair(T0)).toEqual([]);
  });

  it("keeps the original join time when a player re-queues", () => {
    // A reconnecting player should not lose the band they already waited for.
    const mm = createMatchmaker();
    mm.join(entry("a", 1000, T0));
    mm.join(entry("a", 1000, T0 + 8_000));
    mm.join(entry("b", 1180, T0 + 8_000));
    // 'a' has waited 8s (band 250) and 'b' 0s (band 50) — b's band refuses.
    expect(mm.pair(T0 + 8_000)).toEqual([]);
    // Once b has waited too, they meet.
    expect(mm.pair(T0 + 16_000)).toHaveLength(1);
  });

  it("does not cross modes", () => {
    const mm = createMatchmaker();
    mm.join(entry("a", 1200, T0, "blitz"));
    mm.join(entry("b", 1200, T0, "golf"));
    expect(mm.pair(T0)).toEqual([]);
    expect(mm.size("blitz")).toBe(1);
    expect(mm.size("golf")).toBe(1);
  });

  it("forms several pairs in one pass", () => {
    const mm = createMatchmaker();
    for (const [id, r] of [["a", 1200], ["b", 1210], ["c", 1600], ["d", 1610]] as const) {
      mm.join(entry(id, r));
    }
    const pairs = mm.pair(T0);
    expect(pairs).toHaveLength(2);
    expect(mm.size()).toBe(0);
    const ids = pairs.map((p) => p.map((e) => e.playerId).sort().join("+")).sort();
    expect(ids).toEqual(["a+b", "c+d"]);
  });
});

describe("leaving and timing out", () => {
  it("removes a player who leaves", () => {
    const mm = createMatchmaker();
    mm.join(entry("a", 1200));
    mm.leave("a");
    expect(mm.has("a")).toBe(false);
  });

  it("expires only past the timeout, and hands the entry back", () => {
    const mm = createMatchmaker();
    mm.join(entry("a", 1200));
    expect(mm.expire(T0 + QUEUE_TIMEOUT_MS - 1)).toEqual([]);
    const out = mm.expire(T0 + QUEUE_TIMEOUT_MS);
    expect(out.map((e) => e.playerId)).toEqual(["a"]);
    expect(mm.has("a")).toBe(false);
  });
});
