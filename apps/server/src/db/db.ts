/**
 * The database, behind one small interface.
 *
 * Production is Postgres (Neon), reached with `pg` through DATABASE_URL.
 * Everywhere else — `npm run dev:server` on a laptop, and every test — is
 * PGlite: the same Postgres, compiled to WebAssembly and running in-process.
 * One SQL dialect, one schema file, and no "works on SQLite, breaks on
 * Postgres" class of bug, without anyone having to install a database to run
 * the server.
 *
 * Epoch-millisecond columns are BIGINT, which `pg` returns as strings; every
 * reader converts with Number(). That is safe until the year 287,396.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Row = Record<string, unknown>;

export interface Query {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Query {
  /** Runs `fn` in one transaction: all of it commits, or none of it does. */
  tx<T>(fn: (q: Query) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly kind: "postgres" | "pglite";
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(path.join(HERE, "schema.sql"), "utf8");

/** `url` set: Postgres. Unset: PGlite, in `dir` if given, else in memory. */
export async function openDb(opts: { url?: string; dir?: string } = {}): Promise<Db> {
  const db = opts.url ? await openPostgres(opts.url) : await openPglite(opts.dir);
  await migrate(db);
  return db;
}

async function migrate(db: Db) {
  // Idempotent by construction: every statement is CREATE … IF NOT EXISTS.
  await db.tx(async (q) => {
    // Comments go first, so a semicolon in one can never split a statement.
    const sql = SCHEMA.replace(/--[^\n]*/g, "");
    for (const stmt of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
      await q.query(stmt);
    }
  });
}

async function openPostgres(url: string): Promise<Db> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    // Neon requires TLS; a local Postgres URL without sslmode stays plain.
    ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined,
  });

  return {
    kind: "postgres",
    async query(sql, params = []) {
      const res = await pool.query(sql, params);
      return res.rows;
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({
          async query(sql, params = []) {
            return (await client.query(sql, params)).rows;
          },
        });
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

async function openPglite(dir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const lite = dir ? new PGlite(dir) : new PGlite();
  await lite.waitReady;

  return {
    kind: "pglite",
    async query(sql, params = []) {
      return (await lite.query(sql, params)).rows as never;
    },
    async tx(fn) {
      return lite.transaction(async (t) =>
        fn({
          async query(sql, params = []) {
            return (await t.query(sql, params)).rows as never;
          },
        }),
      );
    },
    async close() {
      await lite.close();
    },
  };
}
