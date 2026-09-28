/**
 * The server.
 *
 * One process: the REST API for accounts, synced progress and cohorts
 * (`api/api.ts`), a leaderboard and health endpoint, and a WebSocket for
 * everything a match needs. It holds no rules — `arena/service.ts` does.
 * This file's whole job is turning frames into method calls and events into
 * frames, so the trust boundary has exactly one place to live.
 *
 * Exported as a factory rather than run on import, so the integration test can
 * boot a real server on an ephemeral port with an in-memory database and close
 * it again. A server you cannot start twice is a server you cannot test.
 *
 * SCOPE. The path, the bench, the challenges and the review bench still run
 * entirely on the client and keep working with this process stopped — which is
 * what keeps the offline shell honest. Losing the server costs ranked play and
 * cross-device sync, and nothing a learner is in the middle of.
 *
 * IDENTITY. The arena socket takes the same access token as the API. A player
 * IS an account (PRD §6.4: no arena for guests), so a rating follows the
 * person rather than the browser.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { openDb, type Db } from "./db/db.ts";
import { arenaRepo, type ArenaRepo } from "./db/repo.ts";
import { createApi } from "./api/api.ts";
import { verifyAccess } from "./auth/tokens.ts";
import { ARENA_MODES, createArena, type Arena, type ArenaChallenge, type ArenaMode, type BotPreference } from "./arena/service.ts";
import { frame, parseClientFrame } from "./ws/protocol.ts";
import { CHALLENGES } from "../../web/lib/curriculum/challenges";
import { emptyCircuit } from "../../web/lib/ir/types";
import { irHashSync } from "../../web/lib/ir/hash";

export interface ArenaServerOptions {
  port?: number;
  /** An open database. Tests pass one; otherwise one is opened from the next two. */
  db?: Db;
  /** Postgres URL (Neon). Unset: PGlite. */
  databaseUrl?: string;
  /** Where PGlite keeps its files. Unset: in memory. */
  dataDir?: string;
  tickMs?: number;
  corsOrigin?: string;
  jwtSecret: string;
  instructorCode?: string;
  adminEmails?: string[];
  secureCookies?: boolean;
  authPerMinute?: number;
  /** Look-before-you-leap before a match clock starts. Default 3s. */
  countdownMs?: number;
  /** How long a player waits for a human before a bot steps in. */
  botAfterMs?: number;
}

export interface ArenaServer {
  port: number;
  db: Db;
  repo: ArenaRepo;
  arena: Arena;
  close(): Promise<void>;
}

/**
 * Matches race on the platform's own challenges rather than invented ones, so
 * a player meets the same kind of problem they have been practising. Each mode
 * draws from its own kind (see `poolFor`): bug hunts start from the broken
 * circuit, golf from nothing, blitz from reach and golf targets.
 */
export const ARENA_CHALLENGES: ArenaChallenge[] = CHALLENGES.map((c) => {
  // The reference answer, laid out one gate per column the way "show me one
  // answer" loads it — the exact IR a copied answer arrives as.
  const ref = emptyCircuit(c.qubits);
  ref.gates = c.reference.map((g, i) => ({
    id: `r${i}`, type: g.type, targets: g.targets, controls: g.controls ?? [], params: g.params ?? [], column: i,
  }));
  return {
    id: c.id, title: c.title, brief: c.brief, kind: c.kind, qubits: c.qubits,
    target: c.target, allowedGates: c.allowedGates as string[], par: c.par,
    starter: c.starter, referenceHash: irHashSync(ref), reference: ref,
  };
});

/** Monday 00:00 UTC of this week — when the weekly ladder resets. */
export function weekStart(now = Date.now()): number {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

export async function startArenaServer(opts: ArenaServerOptions): Promise<ArenaServer> {
  const tickMs = opts.tickMs ?? 1_000;
  const ownsDb = !opts.db;
  const db = opts.db ?? (await openDb({ url: opts.databaseUrl, dir: opts.dataDir }));
  const repo = arenaRepo(db);
  const api = createApi({
    db,
    jwtSecret: opts.jwtSecret,
    instructorCode: opts.instructorCode,
    adminEmails: opts.adminEmails,
    secureCookies: opts.secureCookies ?? true,
    authPerMinute: opts.authPerMinute,
  });

  /** playerId → socket. One seat per player; a second connection replaces it. */
  const sockets = new Map<string, WebSocket>();

  function send(playerId: string, type: string, payload: unknown) {
    const ws = sockets.get(playerId);
    if (ws && ws.readyState === ws.OPEN) ws.send(frame(type, payload));
  }

  const arena = createArena(repo, {
    challenges: ARENA_CHALLENGES,
    countdownMs: opts.countdownMs ?? 3_000,
    botAfterMs: opts.botAfterMs,
    events: {
      emote: (to, p) => send(to, "match.emote", p),
      opponentEvent: (to, p) => send(to, "match.opponent_event", p),
      rematchOffered: (to, p) => send(to, "match.rematch_offered", p),
      matchFound: (to, p) => send(to, "match.found", p),
      opponentProgress: (to, p) => send(to, "match.opponent_progress", p),
      matchResult: (to, p) => send(to, "match.result", p),
      matchAbandoned: (to, p) => send(to, "match.abandoned", p),
      queueTimedOut: (to) => send(to, "queue.timeout", { reason: "no opponent found" }),
    },
  });

  const ticker = setInterval(() => {
    arena.tick().catch((e) => console.error("[arena] tick:", e instanceof Error ? e.message : e));
  }, tickMs);
  ticker.unref?.();

  /* -- HTTP ------------------------------------------------------------------- */

  const http: Server = createServer((req, res) => {
    route(req, res).catch((e) => {
      console.error("[http]", e instanceof Error ? e.message : e);
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "server error" }));
    });
  });

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    // The web app reaches the API through its own origin (a rewrite), so
    // cookies stay first-party. CORS only matters for the public reads below.
    res.setHeader("Access-Control-Allow-Origin", opts.corsOrigin ?? "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const json = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === "/health") return json(200, { ok: true, challenges: ARENA_CHALLENGES.length });

    // The lobby's live counters. Public: they say nothing about anyone.
    if (url.pathname === "/arena/stats") {
      const day = new Date();
      const today = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
      const { queued, live } = arena.stats();
      return json(200, { online: sockets.size, queued, live, today: await repo.countSince(today), weekEndsAt: weekStart() + 7 * 86_400_000 });
    }

    if (url.pathname === "/leaderboard") {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
      if (url.searchParams.get("period") === "week") {
        return json(200, { since: weekStart(), players: await repo.weekly(weekStart(), limit) });
      }
      return json(200, { players: await repo.leaderboard(limit) });
    }

    // A signed-in player's own record: tier, history, streak. Reached through
    // the web app's same-origin proxy, so it carries the bearer token.
    if (url.pathname === "/arena/profile") {
      const auth = req.headers.authorization ?? "";
      const claims = auth.startsWith("Bearer ") ? verifyAccess(opts.jwtSecret, auth.slice(7)) : null;
      if (!claims) return json(401, { error: "Sign in to see your record." });
      const profile = await repo.profile(claims.sub, 20);
      return json(200, profile ?? { player: null, matches: [], wins: 0, losses: 0, draws: 0, winStreak: 0, bestRating: 1200 });
    }

    if (url.pathname === "/history") {
      const id = url.searchParams.get("playerId");
      if (!id) return json(400, { error: "playerId required" });
      return json(200, { matches: await repo.matchHistory(id, 20) });
    }

    if (await api(req, res, url)) return;

    json(404, { error: "not found" });
  }

  /* -- WebSocket -------------------------------------------------------------- */

  const wss = new WebSocketServer({ server: http, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/ws", `http://${req.headers.host}`);
    const claims = verifyAccess(opts.jwtSecret, url.searchParams.get("token") ?? "");

    if (!claims) {
      ws.send(frame("error", { code: "sign_in_required", message: "Sign in to play ranked matches." }));
      ws.close();
      return;
    }
    const playerId = claims.sub;
    const displayName = claims.name.slice(0, 40) || "Player";

    // A second connection for the same player replaces the first, so a reloaded
    // tab does not leave a ghost holding the seat.
    if (sockets.get(playerId) !== ws) sockets.get(playerId)?.close();
    sockets.set(playerId, ws);

    // A database error must answer the frame, not take the process down.
    const fail = (e: unknown) => {
      console.error("[arena] socket:", e instanceof Error ? e.message : e);
      if (ws.readyState === ws.OPEN) {
        ws.send(frame("error", { code: "server_error", message: "The arena hit a problem. Try again." }));
      }
    };

    // Handlers first, then the greeting: a frame that arrives while the player
    // row is being written must not find nobody listening.
    ws.on("message", (raw) => void onMessage(raw).catch(fail));

    async function onMessage(raw: unknown) {
      const parsed = parseClientFrame(String(raw));
      if (!parsed.ok) {
        ws.send(frame("error", { code: "bad_frame", message: parsed.reason }));
        return;
      }
      const { type, payload } = parsed.frame;

      switch (type) {
        case "queue.join": {
          const mode: ArenaMode = ARENA_MODES.includes(payload.mode as ArenaMode) ? (payload.mode as ArenaMode) : "blitz";
          const bots: BotPreference = payload.bots === "now" || payload.bots === "never" ? payload.bots : "auto";
          await arena.queue(playerId, displayName, mode, Date.now(), bots);
          ws.send(frame("queue.joined", { mode, waiting: 1 }));
          // Pair immediately if an opponent is already waiting, rather than
          // making the first match wait for the next tick.
          await arena.tick();
          return;
        }
        case "queue.leave":
          arena.dequeue(playerId);
          ws.send(frame("queue.left", {}));
          return;

        case "match.heartbeat":
          arena.heartbeat(playerId);
          return;

        case "match.emote":
          arena.emote(playerId, String(payload.emote ?? ""));
          return;

        case "match.rematch":
          await arena.rematch(playerId);
          return;

        case "match.resign":
          await arena.resign(playerId);
          return;

        case "match.progress":
          arena.progress(playerId, {
            gateCount: Number(payload.gateCount) || 0,
            runCount: Number(payload.runCount) || 0,
          });
          return;

        case "match.submit": {
          const outcome = await arena.submit(playerId, payload.ir);
          if (outcome.status === "graded") {
            // The result frame, if there is one, is emitted by the service to
            // both players. This only acknowledges the grading.
            ws.send(frame("match.graded", { passed: outcome.passed, fidelity: outcome.fidelity, best: outcome.best }));
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
    }

    ws.on("close", () => {
      if (sockets.get(playerId) === ws) sockets.delete(playerId);
      arena.disconnect(playerId);
    });

    ws.on("error", () => { /* close will follow */ });

    repo.touchPlayer(playerId, displayName)
      .then((player) => ws.send(frame("session.ready", player)))
      .catch(fail);
  });

  await new Promise<void>((resolve) => http.listen(opts.port ?? 0, resolve));
  const port = (http.address() as AddressInfo).port;

  return {
    port,
    db,
    repo,
    arena,
    async close() {
      clearInterval(ticker);
      for (const ws of sockets.values()) ws.terminate();
      sockets.clear();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      if (ownsDb) await db.close();
    },
  };
}
