/**
 * The daily loop and the arena's ranks.
 *
 * The streak is the part most likely to feel unfair if it is wrong, so its
 * rules are pinned day by day: a gap of one continues, a freeze covers a
 * missed day, anything else starts again — and a freeze is earned every
 * seven days. Quests pay out once. Ranks move at the documented boundaries.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  addDays, dailyChallenge, dayKey, extendStreak, liveStreak, questsFor, shareLine,
  MAX_FREEZES, QUEST_POOL, type StreakState,
} from "@/lib/daily";
import { rankFor, rankChange } from "@/lib/arena/tiers";
import { onReward, type Reward } from "@/lib/rewards";
import { blankDaily, useSession, ARENA_XP } from "@/stores/sessionStore";
import { mergeSession, type SessionDoc } from "@/lib/sync/merge";
import { CHALLENGES } from "@/lib/curriculum/challenges";

const fresh = (): StreakState => ({ streakDays: 0, streakLastDay: null, streakFreezes: 0, bestStreak: 0, activeDays: [], frozenDays: [] });

describe("today's puzzle", () => {
  it("is the same for everyone on a day, and a real challenge", () => {
    const a = dailyChallenge("2026-09-26");
    expect(dailyChallenge("2026-09-26").id).toBe(a.id);
    expect(CHALLENGES).toContain(a);
  });

  it("never repeats two days running, and keeps weekdays to the easier ones", () => {
    let day = "2026-01-01";
    for (let i = 0; i < 120; i++) {
      const next = addDays(day, 1);
      expect(dailyChallenge(next).id).not.toBe(dailyChallenge(day).id);
      const weekday = ![0, 6].includes(new Date(`${next}T12:00:00Z`).getUTCDay());
      if (weekday) expect(dailyChallenge(next).difficulty).toBeLessThanOrEqual(2);
      day = next;
    }
  });

  it("counts days in UTC", () => {
    expect(dayKey(Date.UTC(2026, 8, 26, 23, 59))).toBe("2026-09-26");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("quests", () => {
  it("are three a day: the puzzle and two different others", () => {
    for (let d = 0; d < 60; d++) {
      const q = questsFor(addDays("2026-01-01", d));
      expect(q).toHaveLength(3);
      expect(q[0].id).toBe("puzzle");
      expect(new Set(q.map((x) => x.id)).size).toBe(3);
      expect(QUEST_POOL.map((x) => x.id)).toEqual(expect.arrayContaining([q[1].id, q[2].id]));
    }
  });
});

describe("the streak", () => {
  it("continues after a one-day gap and restarts after a longer one", () => {
    let s = extendStreak(fresh(), "2026-09-01").next;
    expect(s.streakDays).toBe(1);
    s = extendStreak(s, "2026-09-02").next;
    expect(s.streakDays).toBe(2);
    expect(extendStreak(s, "2026-09-02").event).toBeNull(); // same day: nothing
    const broken = extendStreak(s, "2026-09-05");
    expect(broken.event).toBe("started");
    expect(broken.next.streakDays).toBe(1);
    expect(broken.next.bestStreak).toBe(2);
  });

  it("earns a freeze every seven days, holds at most two, and spends one on a missed day", () => {
    let s = fresh();
    for (let d = 0; d < 7; d++) s = extendStreak(s, addDays("2026-09-01", d)).next;
    expect(s.streakDays).toBe(7);
    expect(s.streakFreezes).toBe(1);

    // Miss the 8th; the 9th keeps the streak and spends the freeze.
    const saved = extendStreak(s, "2026-09-09");
    expect(saved.event).toBe("froze");
    expect(saved.next.streakDays).toBe(8);
    expect(saved.next.streakFreezes).toBe(0);
    expect(saved.next.frozenDays).toEqual(["2026-09-08"]);

    let many = { ...fresh(), streakFreezes: MAX_FREEZES };
    for (let d = 0; d < 14; d++) many = extendStreak(many, addDays("2026-10-01", d)).next;
    expect(many.streakFreezes).toBe(MAX_FREEZES);
  });

  it("reads as alive, at risk, or gone before today's action", () => {
    const s = { streakDays: 5, streakLastDay: "2026-09-25", streakFreezes: 0 };
    expect(liveStreak(s, "2026-09-25")).toEqual({ days: 5, doneToday: true, atRisk: false });
    expect(liveStreak(s, "2026-09-26")).toEqual({ days: 5, doneToday: false, atRisk: true });
    expect(liveStreak(s, "2026-09-27").days).toBe(0);
    expect(liveStreak({ ...s, streakFreezes: 1 }, "2026-09-27").atRisk).toBe(true);
  });

  it("shares how it went, never the answer", () => {
    const line = shareLine("2026-09-26", { gates: 2, ms: 42_000, par: 2, tries: 1 }, 5);
    expect(line).toContain("Quriosity daily · 2026-09-26");
    expect(line).toContain("2 gates · 42s · 1 try");
    expect(line).toContain("5-day streak");
    expect(line).not.toMatch(/\b(H|CNOT|cx)\b/);
  });
});

describe("the session store pays out", () => {
  let heard: Reward[];
  let stop: () => void;
  beforeEach(() => {
    useSession.getState().reset();
    useSession.setState({ mode: "guided", xp: 0, daily: blankDaily() });
    heard = [];
    stop = onReward((r) => heard.push(r));
    return () => stop();
  });

  it("the puzzle quest once, with the streak, and the all-three bonus when earned", () => {
    useSession.getState().recordPuzzle({ gates: 2, ms: 30_000, tries: 1, assisted: false });
    const s = useSession.getState();
    expect(s.daily.done).toContain("puzzle");
    expect(s.xp).toBe(30);
    expect(s.streakDays).toBe(1);
    expect(heard.map((r) => r.kind)).toEqual(["streak", "quest"]);

    // A second solve the same day pays nothing more.
    useSession.getState().recordPuzzle({ gates: 1, ms: 1, tries: 1, assisted: false });
    expect(useSession.getState().xp).toBe(30);
  });

  it("arena XP, with a bonus for the first win of the day", () => {
    useSession.getState().recordArena(true, true);
    const first = useSession.getState().xp;
    expect(first).toBeGreaterThanOrEqual(ARENA_XP.played + ARENA_XP.won + ARENA_XP.firstWinToday);
    expect(heard.find((r) => r.kind === "arena")).toMatchObject({ won: true, firstWinToday: true });
    heard = [];
    useSession.getState().recordArena(true, true);
    expect(heard.find((r) => r.kind === "arena")).toMatchObject({ firstWinToday: false });
    expect(useSession.getState().daily.counters.arenaWins).toBe(2);
  });

  it("runs count toward quests but never keep a streak", () => {
    useSession.getState().logDaily("runs", 3);
    expect(useSession.getState().streakDays).toBe(0);
    expect(useSession.getState().daily.counters.runs).toBe(3);
  });
});

describe("merging the daily loop across devices", () => {
  const base = (over: Partial<SessionDoc>): SessionDoc => ({
    mode: "guided", displayName: "you", trackId: null, progress: {}, challenges: {}, xp: 0,
    streakDays: 0, streakLastDay: null, misconceptions: [], ...over,
  });

  it("keeps counters at their highest, paid quests paid, and every active day", () => {
    const day = dayKey();
    const a = base({ activeDays: ["2026-09-01"], daily: { ...blankDaily(day), counters: { runs: 4 }, done: ["runs"] } });
    const b = base({ activeDays: ["2026-09-02"], daily: { ...blankDaily(day), counters: { runs: 2, lessons: 1 }, done: ["lesson"] } });
    const m = mergeSession(a, b);
    expect(m.daily?.counters).toEqual({ runs: 4, lessons: 1 });
    expect(m.daily?.done.sort()).toEqual(["lesson", "runs"]);
    expect(m.activeDays).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("takes the newer day when the two disagree", () => {
    const a = base({ daily: blankDaily("2026-09-01") });
    const b = base({ daily: blankDaily("2026-09-02") });
    expect(mergeSession(a, b).daily?.day).toBe("2026-09-02");
  });
});

describe("ranks", () => {
  it("starts a new account mid-Bronze, with divisions and a next step", () => {
    const r = rankFor(1200);
    expect(r.tier.id).toBe("bronze");
    expect(r.label).toBe("Bronze II");
    expect(r.next).toBe("Bronze I");
    expect(r.progress).toBeGreaterThan(0);
    expect(r.progress).toBeLessThan(1);
  });

  it("moves at the boundaries, and says which way", () => {
    expect(rankFor(1099).label).toBe("Novice");
    expect(rankFor(1300).label).toBe("Silver III");
    expect(rankFor(1449).label).toBe("Silver I");
    expect(rankFor(2100).label).toBe("Quantum");
    expect(rankFor(2100).next).toBeNull();
    expect(rankChange(1290, 1305)).toEqual({ up: true, label: "Silver III" });
    expect(rankChange(1305, 1295)?.up).toBe(false);
    expect(rankChange(1200, 1210)).toBeNull();
  });
});
