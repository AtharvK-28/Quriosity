-- Arena persistence.
--
-- Shaped to TRD §9 so that swapping SQLite for Postgres is a driver change
-- rather than a redesign: same table names, same column names, same
-- relationships. The type names differ because SQLite has fewer of them —
-- UUIDs are TEXT, TIMESTAMPTZ is INTEGER epoch milliseconds, BOOLEAN is 0/1.
--
-- Epoch milliseconds rather than an ISO string is deliberate. TRD §12.3 decides
-- the winner by ordering `submitted_at`, and ordering integers cannot be
-- confused by a timezone, a format or a locale.
--
-- `players` is a deliberate subset of TRD §9's `users`. Accounts are epic E1
-- and are not built — there is no email, no password_hash and no role here,
-- because inventing them would imply an authentication story this does not
-- have. What the arena genuinely needs is an identity, a rating and a game
-- count, and that is what this holds.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  display_name  TEXT    NOT NULL,
  rating        INTEGER NOT NULL DEFAULT 1200,
  games_played  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id               TEXT PRIMARY KEY,
  mode             TEXT    NOT NULL,          -- blitz | golf | bughunt
  challenge        TEXT    NOT NULL,          -- JSON: the target both players got
  player_a         TEXT    NOT NULL REFERENCES players(id),
  player_b         TEXT    NOT NULL REFERENCES players(id),
  rating_a_before  INTEGER NOT NULL,
  rating_b_before  INTEGER NOT NULL,
  winner_id        TEXT             REFERENCES players(id),
  rating_a_after   INTEGER,
  rating_b_after   INTEGER,
  flagged          INTEGER NOT NULL DEFAULT 0,
  started_at       INTEGER NOT NULL,
  ended_at         INTEGER
);

CREATE INDEX IF NOT EXISTS matches_player_a_idx ON matches (player_a, started_at DESC);
CREATE INDEX IF NOT EXISTS matches_player_b_idx ON matches (player_b, started_at DESC);

-- Every graded submission, kept whether it won or lost.
--
-- This is what makes a result explainable after the fact: the winner is the
-- earliest passing row by `submitted_at`, and that ordering can be re-derived
-- from the table rather than taken on trust. `ir_hash` is the canonical hash
-- the client and server both compute, and is what TRD §12.4's first anti-cheat
-- check compares against.
CREATE TABLE IF NOT EXISTS submissions (
  id            TEXT PRIMARY KEY,
  match_id      TEXT    NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id     TEXT    NOT NULL REFERENCES players(id),
  ir            TEXT    NOT NULL,             -- JSON
  ir_hash       TEXT    NOT NULL,
  passed        INTEGER NOT NULL,
  fidelity      REAL    NOT NULL,
  gate_count    INTEGER NOT NULL,
  submitted_at  INTEGER NOT NULL,             -- server clock, never the client's
  duration_ms   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS submissions_match_idx ON submissions (match_id, submitted_at);
