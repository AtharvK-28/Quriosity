/**
 * Entry point. Everything is in `server.ts`, which is a factory so that the
 * integration test can boot a real one on an ephemeral port.
 */

import { startArenaServer } from "./server.ts";

const server = await startArenaServer({
  port: Number(process.env.PORT ?? 4000),
  dbFile: process.env.ARENA_DB ?? "arena.db",
  corsOrigin: process.env.CORS_ORIGIN,
});

console.log(`arena listening on :${server.port}  (ws://localhost:${server.port}/ws)`);
console.log(`  db ${process.env.ARENA_DB ?? "arena.db"}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close().then(() => process.exit(0));
  });
}
