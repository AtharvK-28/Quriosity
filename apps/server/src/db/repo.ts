/**
 * Arena persistence.
 *
 * `ArenaRepo` is the boundary. Everything above it — matchmaking, resolution,
 * the socket — talks to this interface and never to SQL. It was SQLite until
 * accounts needed a database that survives a redeploy; moving to Postgres was
 * a second implementation of this file, as the interface was drawn for.
 *
 * The one operation that genuinely constrains the database is `settleMatch`.
 * TRD §12.2: "The rating update and the match record commit in one
 * transaction." It locks the match row, so a retried or concurrent settle
 * cannot double a rating change.
 */

import { randomUUID } from "node:crypto";
import { applyResult, STARTING_RATING, type Outcome, type RatingChange } from "../arena/elo.ts";
import type { Db, Row } from "./db.ts";

export interface Player {
  id: string;
  displayName: string;
  rating: number;
  gamesPlayed: number;
}

export interface SubmissionRow {
  id: string;
  matchId: string;
  playerId: string;
  irHash: string;
  passed: boolean;
  fidelity: number;
  gateCount: number;
  submittedAt: number;
  durationMs: number;
}

export interface MatchRow {
  id: string;
  mode: string;
  playerA: string;
  playerB: string;
  ratingABefore: number;
  ratingBBefore: number;
  winnerId: string | null;
  ratingAAfter: number | null;
  ratingBAfter: number | null;
  flagged: boolean;
  startedAt: number;
  endedAt: number | null;
}

export interface ArenaRepo {
  /** Find or create by id, refreshing the display name and last-seen. */
  touchPlayer(id: string, displayName: string): Promise<Player>;
  getPlayer(id: string): Promise<Player | null>;

  createMatch(m: {
    id: string; mode: string; challenge: unknown;
    playerA: string; playerB: string;
    ratingABefore: number; ratingBBefore: number; startedAt: number;
    /** False against a bot: recorded, but no rating moves. */
    rated?: boolean;
  }): Promise<void>;

  getMatch(id: string): Promise<MatchRow | null>;

  recordSubmission(s: {
    matchId: string; playerId: string; ir: unknown; irHash: string;
    passed: boolean; fidelity: number; gateCount: number;
    submittedAt: number; durationMs: number;
  }): Promise<SubmissionRow>;

  submissionsFor(matchId: string): Promise<SubmissionRow[]>;

  /**
   * Close a match and move both ratings, in one transaction.
   * Resolves null if the match was already settled — settling twice would
   * double a rating change, and a retry must not be able to cause that.
   */
  settleMatch(matchId: string, outcome: Outcome, flagged: boolean, endedAt: number): Promise<RatingChange | null>;

  leaderboard(limit: number): Promise<Player[]>;
  matchHistory(playerId: string, limit: number): Promise<MatchRow[]>;
  /** A player's record: recent matches with opponents named, and the numbers a profile shows. */
  profile(playerId: string, limit?: number): Promise<PlayerProfile | null>;
  /** Points since a moment (3 a win, 1 a draw), rated matches only. */
  /** Matches finished since a moment — the lobby's "played today". */
  countSince(since: number): Promise<number>;
  weekly(since: number, limit: number): Promise<Array<{ id: string; displayName: string; rating: number; points: number; wins: number; played: number }>>;
}

export interface ProfileMatch {
  id: string;
  mode: string;
  rated: boolean;
  opponent: string;
  bot: boolean;
  result: "win" | "loss" | "draw";
  delta: number;
  ratingAfter: number;
  at: number;
}

export interface PlayerProfile {
  player: Player;
  matches: ProfileMatch[];
  wins: number;
  losses: number;
  draws: number;
  /** Consecutive wins, counting back from the latest match. */
  winStreak: number;
  bestRating: number;
}

const rowToPlayer = (r: Row): Player => ({
  id: r.id as string,
  displayName: r.display_name as string,
  rating: Number(r.rating),
  gamesPlayed: Number(r.games_played),
});

const rowToMatch = (r: Row): MatchRow => ({
  id: r.id as string,
  mode: r.mode as string,
  playerA: r.player_a as string,
  playerB: r.player_b as string,
  ratingABefore: Number(r.rating_a_before),
  ratingBBefore: Number(r.rating_b_before),
  winnerId: (r.winner_id as string) ?? null,
  ratingAAfter: r.rating_a_after === null ? null : Number(r.rating_a_after),
  ratingBAfter: r.rating_b_after === null ? null : Number(r.rating_b_after),
  flagged: Boolean(r.flagged),
  startedAt: Number(r.started_at),
  endedAt: r.ended_at === null ? null : Number(r.ended_at),
});

const rowToSubmission = (r: Row): SubmissionRow => ({
  id: r.id as string,
  matchId: r.match_id as string,
  playerId: r.player_id as string,
  irHash: r.ir_hash as string,
  passed: Boolean(r.passed),
  fidelity: Number(r.fidelity),
  gateCount: Number(r.gate_count),
  submittedAt: Number(r.submitted_at),
  durationMs: Number(r.duration_ms),
});

export function arenaRepo(db: Db): ArenaRepo {
  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params))[0] ?? null;

  return {
    async touchPlayer(id, displayName) {
      const now = Date.now();
      const r = await one(
        `INSERT INTO players (id, display_name, rating, games_played, created_at, last_seen_at)
         VALUES ($1, $2, $3, 0, $4, $4)
         ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, last_seen_at = EXCLUDED.last_seen_at
         RETURNING *`,
        [id, displayName, STARTING_RATING, now],
      );
      return rowToPlayer(r!);
    },

    async getPlayer(id) {
      const r = await one("SELECT * FROM players WHERE id = $1", [id]);
      return r ? rowToPlayer(r) : null;
    },

    async createMatch(m) {
      await db.query(
        `INSERT INTO matches (id, mode, challenge, player_a, player_b, rating_a_before, rating_b_before, started_at, rated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [m.id, m.mode, JSON.stringify(m.challenge), m.playerA, m.playerB, m.ratingABefore, m.ratingBBefore, m.startedAt, m.rated ?? true],
      );
    },

    async getMatch(id) {
      const r = await one("SELECT * FROM matches WHERE id = $1", [id]);
      return r ? rowToMatch(r) : null;
    },

    async recordSubmission(s) {
      const id = randomUUID();
      await db.query(
        `INSERT INTO submissions (id, match_id, player_id, ir, ir_hash, passed, fidelity, gate_count, submitted_at, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, s.matchId, s.playerId, JSON.stringify(s.ir), s.irHash, s.passed, s.fidelity, s.gateCount, s.submittedAt, s.durationMs],
      );
      return {
        id, matchId: s.matchId, playerId: s.playerId, irHash: s.irHash, passed: s.passed,
        fidelity: s.fidelity, gateCount: s.gateCount, submittedAt: s.submittedAt, durationMs: s.durationMs,
      };
    },

    async submissionsFor(matchId) {
      const rows = await db.query(
        "SELECT * FROM submissions WHERE match_id = $1 ORDER BY submitted_at ASC, id ASC",
        [matchId],
      );
      return rows.map(rowToSubmission);
    },

    async settleMatch(matchId, outcome, flagged, endedAt) {
      return db.tx(async (q) => {
        // Locked for the rest of the transaction: a second settle waits here,
        // then finds ended_at set and backs out.
        const [m] = await q.query("SELECT * FROM matches WHERE id = $1 FOR UPDATE", [matchId]);
        if (!m || m.ended_at !== null) return null;
        const match = rowToMatch(m);

        const players = await q.query("SELECT * FROM players WHERE id = ANY($1) FOR UPDATE", [[match.playerA, match.playerB]]);
        const a = players.map(rowToPlayer).find((p) => p.id === match.playerA);
        const b = players.map(rowToPlayer).find((p) => p.id === match.playerB);
        if (!a || !b) return null;

        const winnerId = outcome === "a" ? a.id : outcome === "b" ? b.id : null;

        // Unrated (a bot match): the record stands, the ratings do not move.
        if (m.rated === false) {
          await q.query(
            `UPDATE matches SET winner_id = $1, rating_a_after = $2, rating_b_after = $3, flagged = $4, ended_at = $5 WHERE id = $6`,
            [winnerId, a.rating, b.rating, flagged, endedAt, matchId],
          );
          return { ratingA: a.rating, ratingB: b.rating, deltaA: 0, deltaB: 0 };
        }

        const change = applyResult(a, b, outcome);

        // A flagged match is recorded and its rating is withheld (TRD §12.4:
        // "Flagged matches are recorded, not silently reversed").
        const ratingAAfter = flagged ? a.rating : change.ratingA;
        const ratingBAfter = flagged ? b.rating : change.ratingB;

        await q.query(
          `UPDATE matches SET winner_id = $1, rating_a_after = $2, rating_b_after = $3, flagged = $4, ended_at = $5
           WHERE id = $6`,
          [winnerId, ratingAAfter, ratingBAfter, flagged, endedAt, matchId],
        );
        if (!flagged) {
          await q.query("UPDATE players SET rating = $1, games_played = games_played + 1 WHERE id = $2", [ratingAAfter, a.id]);
          await q.query("UPDATE players SET rating = $1, games_played = games_played + 1 WHERE id = $2", [ratingBAfter, b.id]);
        }

        return flagged ? { ratingA: a.rating, ratingB: b.rating, deltaA: 0, deltaB: 0 } : change;
      });
    },

    async leaderboard(limit) {
      const rows = await db.query(
        "SELECT * FROM players WHERE games_played > 0 ORDER BY rating DESC, games_played DESC LIMIT $1",
        [limit],
      );
      return rows.map(rowToPlayer);
    },

    async profile(playerId, limit = 20) {
      const player = await one("SELECT * FROM players WHERE id = $1", [playerId]);
      if (!player) return null;
      const rows = await db.query(
        `SELECT m.*, pa.display_name AS name_a, pb.display_name AS name_b FROM matches m
           JOIN players pa ON pa.id = m.player_a
           JOIN players pb ON pb.id = m.player_b
          WHERE (m.player_a = $1 OR m.player_b = $1) AND m.ended_at IS NOT NULL
          ORDER BY m.ended_at DESC LIMIT $2`,
        [playerId, Math.max(1, Math.min(100, limit))],
      );
      const matches: ProfileMatch[] = rows.map((r) => {
        const mine = r.player_a === playerId;
        const before = Number(mine ? r.rating_a_before : r.rating_b_before);
        const afterRaw = mine ? r.rating_a_after : r.rating_b_after;
        const after = afterRaw === null ? before : Number(afterRaw);
        const opponentId = String(mine ? r.player_b : r.player_a);
        return {
          id: String(r.id),
          mode: String(r.mode),
          rated: r.rated !== false,
          opponent: String(mine ? r.name_b : r.name_a),
          bot: opponentId.startsWith("bot:"),
          result: r.winner_id === null ? "draw" : r.winner_id === playerId ? "win" : "loss",
          delta: after - before,
          ratingAfter: after,
          at: Number(r.ended_at),
        };
      });
      let winStreak = 0;
      for (const m of matches) {
        if (m.result !== "win") break;
        winStreak++;
      }
      const p = rowToPlayer(player);
      return {
        player: p,
        matches,
        wins: matches.filter((m) => m.result === "win").length,
        losses: matches.filter((m) => m.result === "loss").length,
        draws: matches.filter((m) => m.result === "draw").length,
        winStreak,
        bestRating: Math.max(p.rating, ...matches.filter((m) => m.rated).map((m) => m.ratingAfter)),
      };
    },

    async countSince(since) {
      const [r] = await db.query("SELECT COUNT(*)::int AS n FROM matches WHERE ended_at >= $1", [since]);
      return Number(r?.n ?? 0);
    },

    async weekly(since, limit) {
      const rows = await db.query(
        `SELECT p.id, p.display_name, p.rating,
                SUM(CASE WHEN m.winner_id = p.id THEN 3 WHEN m.winner_id IS NULL THEN 1 ELSE 0 END)::int AS points,
                SUM(CASE WHEN m.winner_id = p.id THEN 1 ELSE 0 END)::int AS wins,
                COUNT(*)::int AS played
           FROM matches m
           JOIN players p ON p.id = m.player_a OR p.id = m.player_b
          WHERE m.ended_at >= $1 AND m.rated = TRUE AND m.flagged = FALSE AND p.id NOT LIKE 'bot:%'
          GROUP BY p.id, p.display_name, p.rating
          ORDER BY points DESC, wins DESC, p.rating DESC
          LIMIT $2`,
        [since, limit],
      );
      return rows.map((r) => ({
        id: String(r.id), displayName: String(r.display_name), rating: Number(r.rating),
        points: Number(r.points), wins: Number(r.wins), played: Number(r.played),
      }));
    },

    async matchHistory(playerId, limit) {
      const rows = await db.query(
        `SELECT * FROM matches WHERE (player_a = $1 OR player_b = $1) AND ended_at IS NOT NULL
         ORDER BY started_at DESC LIMIT $2`,
        [playerId, limit],
      );
      return rows.map(rowToMatch);
    },
  };
}
