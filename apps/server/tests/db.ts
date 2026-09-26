/**
 * One in-process Postgres per test file, emptied between tests. Opening PGlite
 * costs about a second, so every test getting a fresh one would cost minutes;
 * truncating costs milliseconds and leaves nothing behind.
 */

import { afterAll } from "vitest";
import { openDb, type Db } from "../src/db/db.ts";

let shared: Promise<Db> | null = null;

export async function freshDb(): Promise<Db> {
  shared ??= openDb();
  const db = await shared;
  await db.query(
    `TRUNCATE users, refresh_tokens, user_documents, circuits, cohorts, cohort_members,
              players, matches, submissions, attempts, assignments RESTART IDENTITY CASCADE`,
  );
  return db;
}

afterAll(async () => {
  if (shared) await (await shared).close();
  shared = null;
});
