/**
 * Arena persistence.
 *
 * `ArenaRepo` is the boundary. Everything above it — matchmaking, resolution,
 * the socket — talks to this interface and never to SQLite, so moving to
 * Postgres is a second implementation of this file rather than a rewrite of the
 * arena. The schema is already shaped to TRD §9 for the same reason.
 *
 * The one operation that genuinely constrains the choice of database is
 * `settleMatch`. TRD §12.2: "The rating update and the match record commit in
 * one transaction." SQLite gives real ACID transactions in a single file, so
 * that requirement is met here rather than deferred.
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { applyResult, STARTING_RATING, type Outcome, type RatingChange } from "../arena/elo.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

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
  touchPlayer(id: string, displayName: string): Player;
  getPlayer(id: string): Player | null;

  createMatch(m: {
    id: string; mode: string; challenge: unknown;
    playerA: string; playerB: string;
    ratingABefore: number; ratingBBefore: number; startedAt: number;
  }): void;

  getMatch(id: string): MatchRow | null;

  recordSubmission(s: {
    matchId: string; playerId: string; ir: unknown; irHash: string;
    passed: boolean; fidelity: number; gateCount: number;
    submittedAt: number; durationMs: number;
  }): SubmissionRow;

  submissionsFor(matchId: string): SubmissionRow[];

  /**
   * Close a match and move both ratings, in one transaction.
   * Returns null if the match was already settled — settling twice would
   * double a rating change, and a retry must not be able to cause that.
   */
  settleMatch(matchId: string, outcome: Outcome, flagged: boolean, endedAt: number): RatingChange | null;

  leaderboard(limit: number): Player[];
  matchHistory(playerId: string, limit: number): MatchRow[];
}

/* -- SQLite ------------------------------------------------------------------- */

const rowToPlayer = (r: Record<string, unknown>): Player => ({
  id: r.id as string,
  displayName: r.display_name as string,
  rating: Number(r.rating),
  gamesPlayed: Number(r.games_played),
});

const rowToMatch = (r: Record<string, unknown>): MatchRow => ({
  id: r.id as string,
  mode: r.mode as string,
  playerA: r.player_a as string,
  playerB: r.player_b as string,
  ratingABefore: Number(r.rating_a_before),
  ratingBBefore: Number(r.rating_b_before),
  winnerId: (r.winner_id as string) ?? null,
  ratingAAfter: r.rating_a_after === null ? null : Number(r.rating_a_after),
  ratingBAfter: r.rating_b_after === null ? null : Number(r.rating_b_after),
  flagged: Number(r.flagged) === 1,
  startedAt: Number(r.started_at),
  endedAt: r.ended_at === null ? null : Number(r.ended_at),
});

const rowToSubmission = (r: Record<string, unknown>): SubmissionRow => ({
  id: r.id as string,
  matchId: r.match_id as string,
  playerId: r.player_id as string,
  irHash: r.ir_hash as string,
  passed: Number(r.passed) === 1,
  fidelity: Number(r.fidelity),
  gateCount: Number(r.gate_count),
  submittedAt: Number(r.submitted_at),
  durationMs: Number(r.duration_ms),
});

export function openSqliteRepo(file = ":memory:"): ArenaRepo & { close(): void } {
  const db = new DatabaseSync(file);
  db.exec(readFileSync(path.join(HERE, "schema.sql"), "utf8"));

  const q = {
    getPlayer: db.prepare("SELECT * FROM players WHERE id = ?"),
    insertPlayer: db.prepare(
      "INSERT INTO players (id, display_name, rating, games_played, created_at, last_seen_at) VALUES (?, ?, ?, 0, ?, ?)",
    ),
    touchPlayer: db.prepare("UPDATE players SET display_name = ?, last_seen_at = ? WHERE id = ?"),
    insertMatch: db.prepare(
      `INSERT INTO matches (id, mode, challenge, player_a, player_b, rating_a_before, rating_b_before, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    getMatch: db.prepare("SELECT * FROM matches WHERE id = ?"),
    insertSubmission: db.prepare(
      `INSERT INTO submissions (id, match_id, player_id, ir, ir_hash, passed, fidelity, gate_count, submitted_at, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    submissionsFor: db.prepare("SELECT * FROM submissions WHERE match_id = ? ORDER BY submitted_at ASC, id ASC"),
    settleMatch: db.prepare(
      `UPDATE matches SET winner_id = ?, rating_a_after = ?, rating_b_after = ?, flagged = ?, ended_at = ?
       WHERE id = ? AND ended_at IS NULL`,
    ),
    bumpPlayer: db.prepare("UPDATE players SET rating = ?, games_played = games_played + 1 WHERE id = ?"),
    leaderboard: db.prepare("SELECT * FROM players WHERE games_played > 0 ORDER BY rating DESC, games_played DESC LIMIT ?"),
    history: db.prepare(
      "SELECT * FROM matches WHERE (player_a = ? OR player_b = ?) AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT ?",
    ),
  };

  return {
    touchPlayer(id, displayName) {
      const now = Date.now();
      const existing = q.getPlayer.get(id) as Record<string, unknown> | undefined;
      if (existing) {
        q.touchPlayer.run(displayName, now, id);
        return { ...rowToPlayer(existing), displayName };
      }
      q.insertPlayer.run(id, displayName, STARTING_RATING, now, now);
      return { id, displayName, rating: STARTING_RATING, gamesPlayed: 0 };
    },

    getPlayer(id) {
      const r = q.getPlayer.get(id) as Record<string, unknown> | undefined;
      return r ? rowToPlayer(r) : null;
    },

    createMatch(m) {
      q.insertMatch.run(
        m.id, m.mode, JSON.stringify(m.challenge), m.playerA, m.playerB,
        m.ratingABefore, m.ratingBBefore, m.startedAt,
      );
    },

    getMatch(id) {
      const r = q.getMatch.get(id) as Record<string, unknown> | undefined;
      return r ? rowToMatch(r) : null;
    },

    recordSubmission(s) {
      const id = randomUUID();
      q.insertSubmission.run(
        id, s.matchId, s.playerId, JSON.stringify(s.ir), s.irHash,
        s.passed ? 1 : 0, s.fidelity, s.gateCount, s.submittedAt, s.durationMs,
      );
      return { id, ...s, ir: undefined as never } as unknown as SubmissionRow;
    },

    submissionsFor(matchId) {
      return (q.submissionsFor.all(matchId) as Record<string, unknown>[]).map(rowToSubmission);
    },

    settleMatch(matchId, outcome, flagged, endedAt) {
      const match = this.getMatch(matchId);
      if (!match || match.endedAt !== null) return null;

      const a = this.getPlayer(match.playerA);
      const b = this.getPlayer(match.playerB);
      if (!a || !b) return null;

      const change = applyResult(a, b, outcome);
      const winnerId = outcome === "a" ? a.id : outcome === "b" ? b.id : null;

      // A flagged match is recorded and its rating is withheld (TRD §12.4:
      // "Flagged matches are recorded, not silently reversed").
      const ratingAAfter = flagged ? a.rating : change.ratingA;
      const ratingBAfter = flagged ? b.rating : change.ratingB;

      db.exec("BEGIN IMMEDIATE");
      try {
        const res = q.settleMatch.run(winnerId, ratingAAfter, ratingBAfter, flagged ? 1 : 0, endedAt, matchId);
        // Guard against a concurrent settle that won the race.
        if (Number(res.changes) === 0) {
          db.exec("ROLLBACK");
          return null;
        }
        if (!flagged) {
          q.bumpPlayer.run(ratingAAfter, a.id);
          q.bumpPlayer.run(ratingBAfter, b.id);
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }

      return flagged
        ? { ratingA: a.rating, ratingB: b.rating, deltaA: 0, deltaB: 0 }
        : change;
    },

    leaderboard(limit) {
      return (q.leaderboard.all(limit) as Record<string, unknown>[]).map(rowToPlayer);
    },

    matchHistory(playerId, limit) {
      return (q.history.all(playerId, playerId, limit) as Record<string, unknown>[]).map(rowToMatch);
    },

    close() {
      db.close();
    },
  };
}
