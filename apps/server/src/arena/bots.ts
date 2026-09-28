/**
 * Arena bots — an opponent when nobody else is online.
 *
 * A ladder with three players online is a queue that times out, and a queue
 * that times out teaches people not to open the page. Chess sites solved this
 * long ago: when nobody is free, you play the computer. These bots do not
 * build circuits. Each match draws a plan — when it will solve, in how many
 * gates, how its visible progress unfolds — from its rating and the
 * challenge's par, and the service plays that plan out on the clock.
 *
 * Bot matches are always UNRATED. A rating says how you do against people; a
 * bot that moves it would be a way to farm it. They still count for daily
 * quests, XP and streaks, so a quiet evening is not a wasted one.
 */

export interface BotIdentity {
  id: string;
  name: string;
  rating: number;
}

export interface BotPlan {
  bot: BotIdentity;
  /** When the bot's correct circuit lands (server clock), or null: it gets stuck. */
  solveAt: number | null;
  /** How many gates its answer uses. */
  gates: number;
  /** What the human sees of it, in order: gate and run counts over time. */
  progress: Array<{ at: number; gateCount: number; runCount: number }>;
  /** A "good luck" at the start, sometimes. */
  greets: boolean;
}

const NAMES = [
  "Hadamard Hal", "Pauli Pip", "Bloch Bea", "Qubit Quinn", "Phase Phil",
  "Toffoli Tess", "Grover Gus", "Kickback Kit", "Swap Sam", "Theta Thea",
];

export const isBot = (id: string) => id.startsWith("bot:");

/** A bot near the player's rating, so the match is worth playing. */
export function pickBot(rating: number, random: () => number): BotIdentity {
  const name = NAMES[Math.floor(random() * NAMES.length)];
  const offset = Math.round((random() - 0.5) * 120);
  return {
    id: `bot:${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    rating: Math.max(600, Math.round(rating + offset)),
  };
}

/**
 * Seconds a bot of this rating takes on a challenge of this par. At 1200 a
 * two-gate target takes ~26s; every 300 points halves or doubles it, and the
 * draw is jittered so the same bot is not a metronome.
 */
export function solveSeconds(rating: number, par: number, random: () => number): number {
  const base = 12 + par * 7;
  const skill = 2 ** ((1200 - rating) / 300);
  const jitter = 0.7 + random() * 0.7;
  return Math.max(6, base * skill * jitter);
}

export function planBot(
  bot: BotIdentity,
  mode: string,
  par: number,
  startsAt: number,
  capMs: number | null,
  random: () => number,
): BotPlan {
  const seconds = solveSeconds(bot.rating, par, random);
  // In golf a weaker bot sometimes never finds an answer — the cap ends the
  // match anyway. In a race it always gets there eventually: a race nobody
  // can finish is not a match, it is a wait.
  const stuckChance = mode === "golf" ? Math.max(0.04, Math.min(0.25, (1300 - bot.rating) / 1200)) : 0;
  let solveAt: number | null = random() < stuckChance ? null : startsAt + Math.round(seconds * 1000);
  if (solveAt !== null && capMs !== null && solveAt > startsAt + capMs - 2000) solveAt = null;

  // Golf: a strong bot finds par, a weaker one lands a gate or two over.
  const over = mode === "golf" ? (bot.rating >= 1400 ? (random() < 0.7 ? 0 : 1) : Math.floor(random() * 3)) : Math.floor(random() * 2);
  const gates = Math.max(1, par + over);

  // Visible progress: gates appear over the first two-thirds of the solve,
  // runs are sprinkled after the first gate. A stuck bot fiddles and stops.
  const until = (solveAt ?? startsAt + Math.round(seconds * 1500)) - startsAt;
  const progress: BotPlan["progress"] = [];
  let runs = 0;
  const steps = gates + 2;
  for (let i = 1; i <= steps; i++) {
    const at = startsAt + Math.round((until * i) / (steps + 1));
    const gateCount = Math.min(gates, Math.ceil((gates * i) / (steps - 1)));
    if (i > 2 && random() < 0.6) runs++;
    progress.push({ at, gateCount, runCount: runs });
  }

  return { bot, solveAt, gates, progress, greets: random() < 0.5 };
}
