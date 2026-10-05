/**
 * The daily loop — a reason to come back tomorrow.
 *
 * Borrowed from what works elsewhere: one shared puzzle a day that everyone
 * plays and can compare (chess.com's daily puzzle, Wordle's share line), three
 * small quests that refresh at midnight, and a streak that a missed day can be
 * rescued from once in a while (Duolingo's freeze), because a streak lost to
 * one bad day is a learner lost.
 *
 * Everything here is pure and keyed by the UTC date, so the web app and the
 * server agree on today's puzzle without asking each other.
 */

import { CHALLENGES, type Challenge } from "@/lib/curriculum/challenges";

/** Today, as the server and every browser count it: the UTC date. */
export function dayKey(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function addDays(day: string, n: number): string {
  return dayKey(Date.parse(day) + n * 86_400_000);
}

/** Milliseconds until the next puzzle. */
export function msUntilTomorrow(now: number = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * Today's puzzle. Weekdays draw from the easier two thirds, weekends from
 * everything — the harder ones land when there is time for them. Never the
 * same puzzle two days running.
 */
export function dailyChallenge(day: string = dayKey()): Challenge {
  return resolveDaily(day, 14);
}

/**
 * Yesterday's puzzle is itself the result of this rule, so it is resolved the
 * same way — back a fortnight, which is far past where a chain of bumps can
 * reach. Deterministic, and cheap: one hash per day.
 */
function resolveDaily(day: string, depth: number): Challenge {
  const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
  const pool = CHALLENGES.filter((c) => weekend || c.difficulty <= 2);
  const raw = pool[hash(`daily:${day}`) % pool.length];
  if (depth === 0) return raw;
  const yesterday = resolveDaily(addDays(day, -1), depth - 1);
  return raw.id !== yesterday.id ? raw : pool[(pool.indexOf(raw) + 1) % pool.length];
}

/* -- Quests -------------------------------------------------------------------- */

export type DailyMetric =
  | "puzzle" | "lessons" | "challenges" | "arenaGames" | "arenaWins" | "reviews" | "firstTries" | "runs";

export interface Quest {
  id: string;
  title: string;
  metric: DailyMetric;
  goal: number;
  xp: number;
}

export const QUEST_POOL: Quest[] = [
  { id: "lesson", title: "Pass a lesson", metric: "lessons", goal: 1, xp: 20 },
  { id: "challenge", title: "Solve a challenge", metric: "challenges", goal: 1, xp: 20 },
  { id: "arena-play", title: "Play two arena matches", metric: "arenaGames", goal: 2, xp: 25 },
  { id: "arena-win", title: "Win an arena match", metric: "arenaWins", goal: 1, xp: 30 },
  { id: "review", title: "Review three concepts", metric: "reviews", goal: 3, xp: 20 },
  { id: "first-try", title: "Get something right first time", metric: "firstTries", goal: 1, xp: 25 },
  { id: "runs", title: "Run ten circuits", metric: "runs", goal: 10, xp: 15 },
];

export const PUZZLE_QUEST: Quest = { id: "puzzle", title: "Solve the daily puzzle", metric: "puzzle", goal: 1, xp: 30 };

/** Finishing all three is worth a little more than the sum. */
export const ALL_QUESTS_BONUS = 40;

/** Today's three: the puzzle, and two drawn from the pool. */
export function questsFor(day: string = dayKey()): Quest[] {
  const h = hash(`quests:${day}`);
  const first = h % QUEST_POOL.length;
  let second = Math.floor(h / QUEST_POOL.length) % QUEST_POOL.length;
  if (second === first) second = (second + 1) % QUEST_POOL.length;
  return [PUZZLE_QUEST, QUEST_POOL[first], QUEST_POOL[second]];
}

export type DailyCounters = Partial<Record<DailyMetric, number>>;

export function questDone(q: Quest, counters: DailyCounters): boolean {
  return (counters[q.metric] ?? 0) >= q.goal;
}

/* -- The streak ---------------------------------------------------------------- */

/** A freeze is earned every seven days of streak, and at most this many are kept. */
export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;

export interface StreakState {
  streakDays: number;
  streakLastDay: string | null;
  streakFreezes: number;
  bestStreak: number;
  activeDays: string[];
  frozenDays: string[];
}

/**
 * Today counts. A gap of one day continues the streak; a gap with a freeze in
 * hand spends it on each missed day; anything else starts again at one.
 * Returns the new state and what happened, so the caller can say so.
 */
export function extendStreak(s: StreakState, today: string): { next: StreakState; event: null | "extended" | "started" | "froze" | "earnedFreeze" } {
  if (s.streakLastDay === today) return { next: s, event: null };
  const gap = s.streakLastDay ? daysBetween(s.streakLastDay, today) : Infinity;
  const missed = gap - 1;
  let { streakDays, streakFreezes } = s;
  const frozenDays = [...s.frozenDays];
  let event: "extended" | "started" | "froze" | "earnedFreeze" = "extended";

  if (gap === 1) streakDays += 1;
  else if (Number.isFinite(gap) && missed >= 1 && missed <= streakFreezes && streakDays > 0) {
    for (let i = 1; i <= missed; i++) frozenDays.push(addDays(s.streakLastDay!, i));
    streakFreezes -= missed;
    streakDays += 1;
    event = "froze";
  } else {
    streakDays = 1;
    event = "started";
  }

  if (streakDays > 0 && streakDays % FREEZE_EVERY === 0 && streakFreezes < MAX_FREEZES) {
    streakFreezes += 1;
    if (event === "extended") event = "earnedFreeze";
  }

  return {
    next: {
      streakDays,
      streakLastDay: today,
      streakFreezes,
      bestStreak: Math.max(s.bestStreak, streakDays),
      activeDays: [...new Set([...s.activeDays, today])].sort().slice(-120),
      frozenDays: [...new Set(frozenDays)].sort().slice(-60),
    },
    event,
  };
}

/**
 * The streak as it stands today, before anything is done: still alive if
 * yesterday counted or enough freezes can cover the gap, zero otherwise.
 */
export function liveStreak(s: Pick<StreakState, "streakDays" | "streakLastDay" | "streakFreezes">, today: string = dayKey()): {
  days: number;
  doneToday: boolean;
  atRisk: boolean;
} {
  if (!s.streakLastDay || s.streakDays <= 0) return { days: 0, doneToday: false, atRisk: false };
  const gap = daysBetween(s.streakLastDay, today);
  if (gap <= 0) return { days: s.streakDays, doneToday: true, atRisk: false };
  if (gap - 1 <= s.streakFreezes) return { days: s.streakDays, doneToday: false, atRisk: true };
  return { days: 0, doneToday: false, atRisk: false };
}

/** The share line, Wordle-style: no spoilers, just how it went. */
export function shareLine(day: string, r: { gates: number; ms: number; par: number; tries: number }, streak: number): string {
  const secs = Math.round(r.ms / 1000);
  const time = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
  const bars = "▰".repeat(Math.min(r.gates, 12)) + (r.gates <= r.par ? " ✓par" : "");
  return [
    `Quriosity daily · ${day}`,
    `${bars}`,
    `${r.gates} gate${r.gates === 1 ? "" : "s"} · ${time} · ${r.tries} ${r.tries === 1 ? "try" : "tries"}`,
    streak > 1 ? `${streak}-day streak` : "",
  ].filter(Boolean).join("\n");
}
