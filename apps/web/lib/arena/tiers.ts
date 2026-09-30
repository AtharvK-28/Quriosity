/**
 * Ranks — a name and a next step for a rating.
 *
 * A bare Elo number tells you where you are and nothing about where you are
 * going. Chess sites and competitive games wrap it in tiers with divisions, so
 * every few wins moves a bar and every few more earns a new name. The rating
 * is still the truth; this is only how it is shown.
 *
 * A new account starts in the middle of Bronze (1200), so its first loss is a
 * setback, not a demotion.
 */

export interface Tier {
  id: "novice" | "bronze" | "silver" | "gold" | "platinum" | "diamond" | "quantum";
  name: string;
  min: number;
}

export const TIERS: Tier[] = [
  { id: "novice", name: "Novice", min: 0 },
  { id: "bronze", name: "Bronze", min: 1100 },
  { id: "silver", name: "Silver", min: 1300 },
  { id: "gold", name: "Gold", min: 1450 },
  { id: "platinum", name: "Platinum", min: 1600 },
  { id: "diamond", name: "Diamond", min: 1750 },
  { id: "quantum", name: "Quantum", min: 1900 },
];

const DIVISIONS = ["III", "II", "I"] as const;

/** Fewer games than this and the rating is still finding its level. */
export const PROVISIONAL_GAMES = 5;

export interface Rank {
  tier: Tier;
  /** "III" (lowest) to "I", or null for the tiers without divisions. */
  division: string | null;
  /** Rank label, e.g. "Silver II". */
  label: string;
  /** Rating where the current step started and where the next one starts. */
  from: number;
  to: number | null;
  /** 0–1 through the current step. */
  progress: number;
  /** What the next step is called. */
  next: string | null;
}

export function rankFor(rating: number): Rank {
  let i = TIERS.length - 1;
  while (i > 0 && rating < TIERS[i].min) i--;
  const tier = TIERS[i];
  const upper = TIERS[i + 1]?.min ?? null;

  // Novice and Quantum have no divisions: the floor and the summit.
  if (tier.id === "novice" || upper === null) {
    const to = upper;
    return {
      tier, division: null, label: tier.name,
      from: tier.min, to,
      progress: to === null ? 1 : Math.max(0, Math.min(1, (rating - 900) / (to - 900))),
      next: to === null ? null : `${TIERS[i + 1].name} III`,
    };
  }

  const span = (upper - tier.min) / DIVISIONS.length;
  const d = Math.min(DIVISIONS.length - 1, Math.floor((rating - tier.min) / span));
  const from = Math.round(tier.min + d * span);
  const to = Math.round(tier.min + (d + 1) * span);
  const next = d < DIVISIONS.length - 1 ? `${tier.name} ${DIVISIONS[d + 1]}` : TIERS[i + 1].id === "quantum" ? "Quantum" : `${TIERS[i + 1].name} III`;
  return {
    tier,
    division: DIVISIONS[d],
    label: `${tier.name} ${DIVISIONS[d]}`,
    from, to,
    progress: Math.max(0, Math.min(1, (rating - from) / (to - from))),
    next,
  };
}

/** Did this change of rating cross into a new rank, and which way? */
export function rankChange(before: number, after: number): { up: boolean; label: string } | null {
  const a = rankFor(before);
  const b = rankFor(after);
  if (a.label === b.label) return null;
  return { up: after > before, label: b.label };
}
