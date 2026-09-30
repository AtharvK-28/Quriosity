/**
 * The arena's game layer: which badges a match earns, the win odds on the
 * versus screen, and badges surviving a merge across devices.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { BADGES, badgesFor, type MatchFacts } from "@/lib/arena/badges";
import { winChance } from "@/components/arena/Game";
import { useSession } from "@/stores/sessionStore";
import { mergeSession, type SessionDoc } from "@/lib/sync/merge";
import { onReward, type Reward } from "@/lib/rewards";

const base: MatchFacts = {
  won: true, mode: "blitz", rated: true, opponentBot: false,
  opponentRating: 1200, ratingBefore: 1200, ratingAfter: 1216,
  yoursMs: 45_000, yoursGates: 2, par: 2, submits: 2, streak: 1,
  wasRematch: false, flagged: false,
};

describe("badges", () => {
  it("a plain win earns First blood and nothing flashy", () => {
    expect(badgesFor(base)).toEqual(["first-win"]);
  });

  it("fast, first-shot, giant-slaying wins earn their badges", () => {
    const got = badgesFor({ ...base, yoursMs: 12_000, submits: 1, opponentRating: 1350, streak: 3 });
    expect(got).toEqual(expect.arrayContaining(["lightspeed", "one-shot", "giant-slayer", "hat-trick"]));
  });

  it("mode badges: par in golf, a bug hunt, a bot", () => {
    expect(badgesFor({ ...base, mode: "golf", yoursGates: 2, par: 2 })).toContain("par-golfer");
    expect(badgesFor({ ...base, mode: "golf", yoursGates: 3, par: 2 })).not.toContain("par-golfer");
    expect(badgesFor({ ...base, mode: "bughunt" })).toContain("exterminator");
    expect(badgesFor({ ...base, opponentBot: true, rated: false })).toContain("machine");
  });

  it("does not call a resignation win a one-shot solve", () => {
    expect(badgesFor({ ...base, submits: 1, yoursMs: null, yoursGates: null })).not.toContain("one-shot");
  });

  it("a loss earns only what does not need a win, and a flagged match earns nothing", () => {
    expect(badgesFor({ ...base, won: false, wasRematch: true })).toEqual(["run-it-back"]);
    expect(badgesFor({ ...base, flagged: true, yoursMs: 1000 })).toEqual([]);
  });

  it("league badges follow the rating, on rated matches only", () => {
    expect(badgesFor({ ...base, won: false, ratingAfter: 1460 })).toEqual(expect.arrayContaining(["silver", "gold"]));
    expect(badgesFor({ ...base, won: false, rated: false, ratingAfter: 1460 })).toEqual([]);
  });

  it("every badge has a name, a way to earn it and a glyph", () => {
    for (const b of BADGES) expect(b.name && b.how && b.glyph).toBeTruthy();
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });
});

describe("win odds", () => {
  it("are even for equal ratings and favour the higher one", () => {
    expect(winChance(1200, 1200)).toBeCloseTo(0.5);
    expect(winChance(1400, 1200)).toBeGreaterThan(0.75);
    expect(winChance(1200, 1400) + winChance(1400, 1200)).toBeCloseTo(1);
  });
});

describe("holding badges", () => {
  let heard: Reward[];
  beforeEach(() => {
    useSession.getState().reset();
    useSession.setState({ mode: "guided" });
    heard = [];
    const stop = onReward((r) => heard.push(r));
    return () => stop();
  });

  it("awards each once, announces it, and ignores unknown ids", () => {
    expect(useSession.getState().awardBadges(["first-win", "made-up"])).toEqual(["first-win"]);
    expect(useSession.getState().awardBadges(["first-win"])).toEqual([]);
    expect(useSession.getState().badges).toEqual(["first-win"]);
    expect(heard).toEqual([expect.objectContaining({ kind: "badge", name: "First blood" })]);
  });

  it("keeps every badge from either device when merging", () => {
    const doc = (badges: string[]): SessionDoc => ({
      mode: "guided", displayName: "you", trackId: null, progress: {}, challenges: {}, xp: 0,
      streakDays: 0, streakLastDay: null, misconceptions: [], badges,
    });
    expect(mergeSession(doc(["first-win"]), doc(["machine", "first-win"])).badges?.sort()).toEqual(["first-win", "machine"]);
  });
});
