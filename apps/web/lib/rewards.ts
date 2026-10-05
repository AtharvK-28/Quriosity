/**
 * Rewards, announced.
 *
 * The session store decides when something was earned — a quest done, a
 * streak extended, a freeze spent — and says so here. Whatever shows it (the
 * tutor's pop-ups, mounted once in the layout) listens. Keeping the two apart
 * means the store never imports UI, and a test can listen too.
 */

export type Reward =
  | { kind: "quest"; title: string; xp: number }
  | { kind: "allQuests"; xp: number }
  | { kind: "streak"; days: number; event: "extended" | "started" | "froze" | "earnedFreeze"; freezes: number }
  | { kind: "arena"; xp: number; won: boolean; firstWinToday: boolean }
  | { kind: "rank"; tier: string; up: boolean }
  | { kind: "badge"; name: string; how: string; glyph: string };

type Listener = (r: Reward) => void;

const listeners = new Set<Listener>();

export function onReward(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function announce(r: Reward): void {
  for (const fn of listeners) {
    try {
      fn(r);
    } catch {
      /* one bad listener must not stop the others */
    }
  }
}
