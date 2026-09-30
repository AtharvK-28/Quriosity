/**
 * Arena badges — goals beside the rating.
 *
 * A rating only ever says one thing. Badges give a player something else to
 * go for on a given night: win fast, win in one shot, beat someone better,
 * be a good sport. Each is decided from what a match already reports (the
 * result, the review, what this player did), never from anything a client
 * could claim that the server did not confirm.
 */

import { rankFor } from "./tiers";

export interface Badge {
  id: string;
  name: string;
  /** How to earn it, in a few words. */
  how: string;
  /** One or two characters for the medal. */
  glyph: string;
}

export const BADGES: Badge[] = [
  { id: "first-win", name: "First blood", how: "Win your first match", glyph: "1" },
  { id: "hat-trick", name: "Hat-trick", how: "Win three in a row", glyph: "×3" },
  { id: "lightspeed", name: "Lightspeed", how: "Win in under 20 seconds", glyph: "⚡" },
  { id: "one-shot", name: "One shot", how: "Win with your first submission", glyph: "◎" },
  { id: "giant-slayer", name: "Giant slayer", how: "Beat someone 100+ above you", glyph: "▲" },
  { id: "par-golfer", name: "Par golfer", how: "Win golf at or under par", glyph: "⛳" },
  { id: "exterminator", name: "Exterminator", how: "Win a bug hunt", glyph: "✕" },
  { id: "machine", name: "Beat the machine", how: "Beat a bot", glyph: "⚙" },
  { id: "run-it-back", name: "Run it back", how: "Play a rematch", glyph: "↻" },
  { id: "good-sport", name: "Good sport", how: "Say “good game” after a loss", glyph: "♥" },
  { id: "silver", name: "Silver league", how: "Reach Silver", glyph: "S" },
  { id: "gold", name: "Gold league", how: "Reach Gold", glyph: "G" },
];

export const BADGES_BY_ID = new Map(BADGES.map((b) => [b.id, b]));

export interface MatchFacts {
  won: boolean;
  mode: string;
  rated: boolean;
  opponentBot: boolean;
  opponentRating: number;
  ratingBefore: number;
  ratingAfter: number;
  /** Your winning time and gates, from the server's review. */
  yoursMs: number | null;
  yoursGates: number | null;
  par: number;
  /** How many times you pressed Submit this match. */
  submits: number;
  /** Consecutive wins including this one. */
  streak: number;
  wasRematch: boolean;
  flagged: boolean;
}

/** Badges this match earned. The caller keeps only the ones not already held. */
export function badgesFor(m: MatchFacts): string[] {
  if (m.flagged) return [];
  const out: string[] = [];
  if (m.wasRematch) out.push("run-it-back");
  if (m.won) {
    out.push("first-win");
    if (m.streak >= 3) out.push("hat-trick");
    if (m.yoursMs !== null && m.yoursMs < 20_000) out.push("lightspeed");
    // Only for a win you solved, not one handed over by a resignation.
    if (m.submits === 1 && m.yoursMs !== null) out.push("one-shot");
    if (m.opponentRating - m.ratingBefore >= 100) out.push("giant-slayer");
    if (m.mode === "golf" && m.yoursGates !== null && m.yoursGates <= m.par) out.push("par-golfer");
    if (m.mode === "bughunt") out.push("exterminator");
    if (m.opponentBot) out.push("machine");
  }
  if (m.rated) {
    const tier = rankFor(m.ratingAfter).tier.id;
    const order = ["novice", "bronze", "silver", "gold", "platinum", "diamond", "quantum"];
    if (order.indexOf(tier) >= order.indexOf("silver")) out.push("silver");
    if (order.indexOf(tier) >= order.indexOf("gold")) out.push("gold");
  }
  return out;
}
