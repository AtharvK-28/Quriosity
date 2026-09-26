/**
 * Entry point. Everything is in `server.ts`, which is a factory so that the
 * integration test can boot a real one on an ephemeral port.
 *
 * Environment:
 *   DATABASE_URL     Postgres (Neon). Unset: PGlite in DATA_DIR, for local use.
 *   DATA_DIR         Where local PGlite keeps its files. Default ./data.
 *   JWT_SECRET       Signs access tokens. Required in production.
 *   INSTRUCTOR_CODE  Signing up with this code makes an instructor account.
 *   ADMIN_EMAILS     Comma-separated emails that sign up as admins.
 *   CORS_ORIGIN      Origin allowed to read the public endpoints. Default *.
 *   PORT             Default 4000.
 */

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startArenaServer } from "./server.ts";

const production = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);

const dataDir = process.env.DATA_DIR ?? "./data";

let jwtSecret = process.env.JWT_SECRET?.trim() ?? "";
if (!jwtSecret) {
  if (production) {
    // A server that signs tokens with a secret anyone could guess is worse than
    // one that will not start. Set JWT_SECRET in the host's environment.
    console.error("JWT_SECRET is not set. Refusing to start in production without it.");
    process.exit(1);
  }
  // Local development: one random secret, kept beside the local database, so
  // a restart under `tsx watch` does not sign everyone out.
  const file = path.join(dataDir, ".dev-jwt-secret");
  try {
    jwtSecret = readFileSync(file, "utf8").trim();
  } catch {
    jwtSecret = randomBytes(32).toString("base64url");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(file, jwtSecret);
  }
}
if (production && !process.env.DATABASE_URL) {
  console.warn("DATABASE_URL not set: accounts and ratings are on this instance's disk and will not survive a redeploy.");
}

const server = await startArenaServer({
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
  dataDir,
  corsOrigin: process.env.CORS_ORIGIN,
  jwtSecret,
  instructorCode: process.env.INSTRUCTOR_CODE?.trim() || undefined,
  adminEmails: (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  // Plain http on localhost cannot carry a Secure cookie.
  secureCookies: production,
});

console.log(`server listening on :${server.port}  (ws://localhost:${server.port}/ws)`);
console.log(`  db ${server.db.kind === "postgres" ? "postgres (DATABASE_URL)" : `pglite in ${dataDir}`}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close().then(() => process.exit(0));
  });
}
