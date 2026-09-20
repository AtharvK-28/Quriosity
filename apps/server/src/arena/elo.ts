/**
 * Elo — TRD §12.2, implemented exactly as written there.
 *
 *   E_a = 1 / (1 + 10 ** ((R_b - R_a) / 400))
 *   R_a' = round(R_a + K * (S_a - E_a))
 *   K = 32 if games_played < 30 else 16
 *
 * Rating floor 100.
 *
 * Kept as pure arithmetic in its own file, with no database and no clock,
 * because the TRD is emphatic about why this has to be trustworthy: "an Elo
 * change without a match record is unexplainable, and an unexplained rating
 * change destroys trust in a ranked ladder faster than any bug." A pure
 * function can be checked against hand-worked numbers; a method on a service
 * that also writes rows cannot.
 */

export const STARTING_RATING = 1200;
export const RATING_FLOOR = 100;
export const PROVISIONAL_GAMES = 30;

export type Outcome = "a" | "b" | "draw";

export interface RatingChange {
  ratingA: number;
  ratingB: number;
  deltaA: number;
  deltaB: number;
}

/** K-factor. Higher while a rating is still provisional. */
export function kFactor(gamesPlayed: number): number {
  return gamesPlayed < PROVISIONAL_GAMES ? 32 : 16;
}

/** Expected score for A against B. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/**
 * New ratings after one match.
 *
 * Both players are scored from their own K, so a provisional player moving
 * against a settled one does not drag the settled rating around by 32 points.
 */
export function applyResult(
  a: { rating: number; gamesPlayed: number },
  b: { rating: number; gamesPlayed: number },
  outcome: Outcome,
): RatingChange {
  const scoreA = outcome === "a" ? 1 : outcome === "b" ? 0 : 0.5;
  const scoreB = 1 - scoreA;

  const expA = expectedScore(a.rating, b.rating);
  const expB = expectedScore(b.rating, a.rating);

  const nextA = Math.max(RATING_FLOOR, Math.round(a.rating + kFactor(a.gamesPlayed) * (scoreA - expA)));
  const nextB = Math.max(RATING_FLOOR, Math.round(b.rating + kFactor(b.gamesPlayed) * (scoreB - expB)));

  return {
    ratingA: nextA,
    ratingB: nextB,
    deltaA: nextA - a.rating,
    deltaB: nextB - b.rating,
  };
}
