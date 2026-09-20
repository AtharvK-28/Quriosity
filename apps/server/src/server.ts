/**
 * The arena server.
 *
 * One process: an HTTP endpoint for the leaderboard and health, and a WebSocket
 * for everything a match needs. It holds no rules — `arena/service.ts` does.
 * This file's whole job is turning frames into method calls and events into
 * frames, so the trust boundary has exactly one place to live.
 *
 * Exported as a factory rather than run on import, so the integration test can
 * boot a real server on an ephemeral port with an in-memory database and close
 * it again. A server you cannot start twice is a server you cannot test.
 *
 * SCOPE. This serves the arena and nothing else. The path, the bench, the
 * challenges and the review bench stay entirely on the client and keep working
 * with this process stopped — which is what keeps the offline shell honest.
 * Losing the server costs you ranked play and nothing more.
 *
 * IDENTITY. Players are the pseudonymous id the client already generates for
 * its own local analytics, plus the display name from Settings. There is no
 * authentication: accounts are epic E1 and are not built. A rating is therefore
 * tied to a browser, and clearing site data starts a new one. That is a real
 * limitation, and it is written down rather than papered over.
 */

import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { openSqliteRepo, type ArenaRepo } from "./db/repo.ts";
import { createArena, type Arena, type ArenaChallenge } from "./arena/service.ts";
import { frame, parseClientFrame } from "./ws/protocol.ts";
import { CHALLENGES } from "../../web/lib/curriculum/challenges";

export interface ArenaServerOptions {
  port?: number;
  dbFile?: string;
  tickMs?: number;
  corsOrigin?: string;
}

export interface ArenaServer {
  port: number;
  repo: ArenaRepo;
  arena: Arena;
  close(): Promise<void>;
}

/**
 * Matches race on the platform's own challenges rather than invented ones, so
 * a player meets the same kind of problem they have been practising. Bug hunts
 * are excluded: they start from a broken circuit, which is a different race.
 */
export const ARENA_CHALLENGES: ArenaChallenge[] = CHALLENGES
  .filter((c) => c.kind !== "bughunt")
  .map((c) => ({
    id: c.id, title: c.title, brief: c.brief, qubits: c.qubits,
    target: c.target, allowedGates: c.allowedGates as string[], par: c.par,
    starter: c.starter,
  }));

export async function startArenaServer(opts: ArenaServerOptions = {}): Promise<ArenaServer> {
  const tickMs = opts.tickMs ?? 1_000;
  const repo = openSqliteRepo(opts.dbFile ?? "arena.db");

  /** playerId → socket. One seat per player; a second connection replaces it. */
  const sockets = new Map<string, WebSocket>();

  function send(playerId: string, type: string, payload: unknown) {
    const ws = sockets.get(playerId);
    if (ws && ws.readyState === ws.OPEN) ws.send(frame(type, payload));
  }

  const arena = createArena(repo, {
    challenges: ARENA_CHALLENGES,
    events: {
      matchFound: (to, p) => send(to, "match.found", p),
      opponentProgress: (to, p) => send(to, "match.opponent_progress", p),
      matchResult: (to, p) => send(to, "match.result", p),
      matchAbandoned: (to, p) => send(to, "match.abandoned", p),
      queueTimedOut: (to) => send(to, "queue.timeout", { reason: "no opponent found" }),
    },
  });

  const ticker = setInterval(() => arena.tick(), tickMs);
  ticker.unref?.();

  /* -- HTTP ------------------------------------------------------------------- */

  const http: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    // The client is served from a different origin in development.
    res.setHeader("Access-Control-Allow-Origin", opts.corsOrigin ?? "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const json = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === "/health") return json(200, { ok: true, challenges: ARENA_CHALLENGES.length });

    if (url.pathname === "/leaderboard") {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
      return json(200, { players: repo.leaderboard(limit) });
    }

    if (url.pathname === "/history") {
      const id = url.searchParams.get("playerId");
      if (!id) return json(400, { error: "playerId required" });
      return json(200, { matches: repo.matchHistory(id, 20) });
    }

    json(404, { error: "not found" });
  });

  /* -- WebSocket -------------------------------------------------------------- */

  const wss = new WebSocketServer({ server: http, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/ws", `http://${req.headers.host}`);
    const playerId = (url.searchParams.get("playerId") ?? "").slice(0, 64);
    const displayName = (url.searchParams.get("name") ?? "Anonymous").slice(0, 40) || "Anonymous";

    if (!playerId) {
      ws.send(frame("error", { code: "no_identity", message: "playerId is required" }));
      ws.close();
      return;
    }

    // A second connection for the same player replaces the first, so a reloaded
    // tab does not leave a ghost holding the seat.
    if (sockets.get(playerId) !== ws) sockets.get(playerId)?.close();
    sockets.set(playerId, ws);

    ws.send(frame("session.ready", repo.touchPlayer(playerId, displayName)));

    ws.on("message", (raw) => {
      const parsed = parseClientFrame(String(raw));
      if (!parsed.ok) {
        ws.send(frame("error", { code: "bad_frame", message: parsed.reason }));
        return;
      }
      const { type, payload } = parsed.frame;

      switch (type) {
        case "queue.join": {
          const mode = typeof payload.mode === "string" ? payload.mode : "blitz";
          arena.queue(playerId, displayName, mode);
          ws.send(frame("queue.joined", { mode, waiting: 1 }));
          // Pair immediately if an opponent is already waiting, rather than
          // making the first match wait for the next tick.
          arena.tick();
          return;
        }
        case "queue.leave":
          arena.dequeue(playerId);
          ws.send(frame("queue.left", {}));
          return;

        case "match.heartbeat":
          arena.heartbeat(playerId);
          return;

        case "match.progress":
          arena.progress(playerId, {
            gateCount: Number(payload.gateCount) || 0,
            runCount: Number(payload.runCount) || 0,
          });
          return;

        case "match.submit": {
          const outcome = arena.submit(playerId, payload.ir);
          if (outcome.status === "graded") {
            // The result frame, if there is one, is emitted by the service to
            // both players. This only acknowledges the grading.
            ws.send(frame("match.graded", { passed: outcome.passed, fidelity: outcome.fidelity }));
            return;
          }
          ws.send(frame("error", {
            code: outcome.status,
            message: outcome.status === "invalid" ? outcome.errors.join("; ")
              : outcome.status === "rejected" ? outcome.reason
              : "you are not in a match",
          }));
          return;
        }
      }
    });

    ws.on("close", () => {
      if (sockets.get(playerId) === ws) sockets.delete(playerId);
      arena.disconnect(playerId);
    });

    ws.on("error", () => { /* close will follow */ });
  });

  await new Promise<void>((resolve) => http.listen(opts.port ?? 0, resolve));
  const port = (http.address() as AddressInfo).port;

  return {
    port,
    repo,
    arena,
    async close() {
      clearInterval(ticker);
      for (const ws of sockets.values()) ws.terminate();
      sockets.clear();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      (repo as { close?(): void }).close?.();
    },
  };
}
