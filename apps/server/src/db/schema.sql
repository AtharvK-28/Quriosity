-- Quriosity persistence. Postgres — Neon in production, PGlite everywhere else.
--
-- Shaped to TRD §9. Times are BIGINT epoch milliseconds, not TIMESTAMPTZ: TRD
-- §12.3 decides a match by ordering `submitted_at`, and ordering integers
-- cannot be confused by a timezone, a format or a locale.
--
-- Every statement is idempotent (IF NOT EXISTS), so the whole file runs on
-- every boot and is its own migration until a column ever has to change.

-- -- Accounts (PRD E1) ------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,            -- stored lowercased
  password_hash  TEXT NOT NULL,                   -- Argon2id, TRD §13.4
  display_name   TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'student'
                   CHECK (role IN ('student', 'instructor', 'admin')),
  created_at     BIGINT NOT NULL
);

-- Refresh tokens rotate on every use. A token presented twice means it was
-- copied, so the whole family is revoked (TRD §13.4). Only a hash is kept.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family       TEXT NOT NULL,
  token_hash   TEXT NOT NULL,
  expires_at   BIGINT NOT NULL,
  used_at      BIGINT,
  revoked_at   BIGINT,
  created_at   BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens (family);

-- A learner's progress, as one document per kind ("session" today). Progress
-- only ever advances, so two devices merge rather than overwrite — the merge
-- runs on the client, and this stores the result.
CREATE TABLE IF NOT EXISTS user_documents (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  doc         JSONB NOT NULL,
  updated_at  BIGINT NOT NULL,
  PRIMARY KEY (user_id, kind)
);

-- Saved circuits (PRD E11-S1).
CREATE TABLE IF NOT EXISTS circuits (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          TEXT NOT NULL,
  name        TEXT NOT NULL,
  circuit     JSONB NOT NULL,
  saved_at    BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- -- Cohorts (PRD E10) --------------------------------------------------------

CREATE TABLE IF NOT EXISTS cohorts (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  join_code      TEXT NOT NULL UNIQUE,
  instructor_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id  TEXT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  BIGINT NOT NULL,
  PRIMARY KEY (cohort_id, user_id)
);

-- -- Arena (PRD E9, TRD §12) --------------------------------------------------
--
-- `players.id` is the user's id, but there is deliberately no foreign key:
-- deleting an account anonymises its matches rather than erasing them, so an
-- opponent's rating history stays explicable (PRD §7.4).

CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  display_name  TEXT    NOT NULL,
  rating        INTEGER NOT NULL DEFAULT 1200,
  games_played  INTEGER NOT NULL DEFAULT 0,
  created_at    BIGINT  NOT NULL,
  last_seen_at  BIGINT  NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id               TEXT PRIMARY KEY,
  mode             TEXT    NOT NULL,              -- blitz | golf | bughunt
  challenge        JSONB   NOT NULL,              -- the target both players got
  player_a         TEXT    NOT NULL REFERENCES players(id),
  player_b         TEXT    NOT NULL REFERENCES players(id),
  rating_a_before  INTEGER NOT NULL,
  rating_b_before  INTEGER NOT NULL,
  winner_id        TEXT             REFERENCES players(id),
  rating_a_after   INTEGER,
  rating_b_after   INTEGER,
  flagged          BOOLEAN NOT NULL DEFAULT FALSE,
  started_at       BIGINT  NOT NULL,
  ended_at         BIGINT
);

CREATE INDEX IF NOT EXISTS matches_player_a_idx ON matches (player_a, started_at DESC);
CREATE INDEX IF NOT EXISTS matches_player_b_idx ON matches (player_b, started_at DESC);

-- Every graded submission, kept whether it won or lost. The winner is the
-- earliest passing row by `submitted_at`, re-derivable from this table rather
-- than taken on trust. `ir_hash` is what TRD §12.4's copy check compares.
CREATE TABLE IF NOT EXISTS submissions (
  id            TEXT PRIMARY KEY,
  match_id      TEXT    NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id     TEXT    NOT NULL REFERENCES players(id),
  ir            JSONB   NOT NULL,
  ir_hash       TEXT    NOT NULL,
  passed        BOOLEAN NOT NULL,
  fidelity      DOUBLE PRECISION NOT NULL,
  gate_count    INTEGER NOT NULL,
  submitted_at  BIGINT  NOT NULL,                 -- server clock, never the client's
  duration_ms   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS submissions_match_idx ON submissions (match_id, submitted_at);

-- -- Instructor depth (PRD E10-S4, E10-S5) -------------------------------------

-- A learner's failed runs, so their instructor can open one (E10-S5): the
-- circuit, what it scored, and the diagnosis the learner was shown. Only the
-- most recent 100 per learner are kept.
CREATE TABLE IF NOT EXISTS attempts (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place             TEXT NOT NULL,                -- "lesson:u3.n3" | "challenge:c.even"
  ir                JSONB NOT NULL,
  fidelity          DOUBLE PRECISION NOT NULL,
  rule_id           TEXT,
  misconception_id  TEXT,
  message           TEXT,
  created_at        BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS attempts_user_idx ON attempts (user_id, created_at DESC);

-- A lesson or challenge set for a cohort, with a deadline (E10-S4). Whether a
-- student has done it is read from their synced progress, never reported.
CREATE TABLE IF NOT EXISTS assignments (
  id          TEXT PRIMARY KEY,
  cohort_id   TEXT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('node', 'challenge')),
  item_id     TEXT NOT NULL,
  due_at      BIGINT NOT NULL,
  created_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS assignments_cohort_idx ON assignments (cohort_id, due_at);

-- A challenge an instructor authored and published to a cohort (E8-S6). The
-- body is the authored challenge as the web app stores it: a reference
-- circuit, from which every member's browser derives the target.
CREATE TABLE IF NOT EXISTS class_challenges (
  id          TEXT PRIMARY KEY,
  cohort_id   TEXT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        JSONB NOT NULL,
  created_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS class_challenges_cohort_idx ON class_challenges (cohort_id, created_at DESC);

-- Bot matches (the arena's answer to an empty queue) are recorded but move no
-- rating. Added after launch, so it is added here rather than in the CREATE.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS rated BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS matches_ended_idx ON matches (ended_at);

-- The daily puzzle (one per UTC day, the same for everyone). The clock starts
-- when the player opens it (started_at, server time) and stops when the server
-- grades a passing answer; only the first solve counts.
CREATE TABLE IF NOT EXISTS daily_results (
  day         TEXT   NOT NULL,
  user_id     TEXT   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at  BIGINT NOT NULL,
  solved_at   BIGINT,
  gates       INTEGER,
  ms          INTEGER,
  tries       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id)
);

CREATE INDEX IF NOT EXISTS daily_results_board_idx ON daily_results (day, gates, ms);
