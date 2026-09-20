/**
 * Matchmaking — TRD §12.1.
 *
 *   band = 50, widening by 50 every 2s to a maximum of 400
 *   pair the closest available rating within the band
 *   after 60s, offer a practice target instead
 *
 * The TRD writes this against Redis sorted sets. This is the same algorithm
 * held in memory behind an interface, because a sorted set over a handful of
 * waiting players is a sorted array, and Redis earns its place when the queue
 * has to be shared between server processes rather than when it has to work.
 * `Matchmaker` is the seam where that swap happens.
 *
 * NO TIMERS IN HERE. `now` is passed in, so the widening schedule and the
 * timeout can be tested at whatever instants matter instead of by sleeping.
 */

export const BAND_START = 50;
export const BAND_STEP = 50;
export const BAND_MAX = 400;
export const WIDEN_EVERY_MS = 2_000;
export const QUEUE_TIMEOUT_MS = 60_000;

export interface QueueEntry {
  playerId: string;
  rating: number;
  mode: string;
  joinedAt: number;
}

export type Pair = [QueueEntry, QueueEntry];

export interface Matchmaker {
  join(entry: QueueEntry): void;
  leave(playerId: string): void;
  has(playerId: string): boolean;
  size(mode?: string): number;
  /** Everyone currently waiting, for a status view. */
  waiting(): QueueEntry[];
  /** Pairs formed at this instant. Paired players are removed from the queue. */
  pair(now: number): Pair[];
  /** Entries past the timeout, removed and handed back to be offered practice. */
  expire(now: number): QueueEntry[];
}

/** How wide a player's acceptable rating band is after waiting this long. */
export function bandFor(waitedMs: number): number {
  const steps = Math.floor(Math.max(0, waitedMs) / WIDEN_EVERY_MS);
  return Math.min(BAND_START + BAND_STEP * steps, BAND_MAX);
}

export function createMatchmaker(): Matchmaker {
  const entries = new Map<string, QueueEntry>();

  return {
    join(entry) {
      // Re-queueing keeps the original join time: a player who reconnects
      // should not lose the band they have already waited for.
      const existing = entries.get(entry.playerId);
      entries.set(entry.playerId, existing ? { ...entry, joinedAt: existing.joinedAt } : entry);
    },

    leave(playerId) {
      entries.delete(playerId);
    },

    has(playerId) {
      return entries.has(playerId);
    },

    size(mode) {
      if (!mode) return entries.size;
      let n = 0;
      for (const e of entries.values()) if (e.mode === mode) n++;
      return n;
    },

    waiting() {
      return [...entries.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    },

    pair(now) {
      const pairs: Pair[] = [];
      // Longest wait first: the player who has been waiting has the widest band
      // and the strongest claim to the next opponent.
      const queue = [...entries.values()].sort((a, b) => a.joinedAt - b.joinedAt);
      const taken = new Set<string>();

      for (const a of queue) {
        if (taken.has(a.playerId)) continue;
        const bandA = bandFor(now - a.joinedAt);

        let best: QueueEntry | null = null;
        let bestGap = Infinity;

        for (const b of queue) {
          if (b.playerId === a.playerId || taken.has(b.playerId)) continue;
          if (b.mode !== a.mode) continue;

          const gap = Math.abs(a.rating - b.rating);
          // Both bands must accept: the player who has waited longer cannot
          // drag someone who just arrived into a mismatch.
          if (gap > bandA || gap > bandFor(now - b.joinedAt)) continue;

          if (gap < bestGap) {
            best = b;
            bestGap = gap;
          }
        }

        if (best) {
          taken.add(a.playerId);
          taken.add(best.playerId);
          pairs.push([a, best]);
        }
      }

      for (const id of taken) entries.delete(id);
      return pairs;
    },

    expire(now) {
      const out: QueueEntry[] = [];
      for (const e of entries.values()) {
        if (now - e.joinedAt >= QUEUE_TIMEOUT_MS) out.push(e);
      }
      for (const e of out) entries.delete(e.playerId);
      return out;
    },
  };
}
