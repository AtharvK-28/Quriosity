/**
 * Where the arena server is.
 *
 * Decided in the browser, at connect time, in this order:
 *
 *   1. NEXT_PUBLIC_ARENA_URL, when the build set one.
 *   2. A server on this machine, when the page itself is on localhost — that
 *      is someone running `npm run dev:server` beside `npm run dev`.
 *   3. The deployed server, everywhere else.
 *
 * The fallback used to be localhost unconditionally, so a deployment built
 * without the variable tried to reach ws://localhost:4000 from a visitor's
 * browser — which is never the arena, and which an https page is not allowed
 * to open anyway.
 */

const DEPLOYED = "wss://quriosity-1.onrender.com";
const LOCAL = "ws://localhost:4000";

/** Is this page being served from the learner's own machine? */
export function isLocalPage(): boolean {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

/** The WebSocket origin, e.g. wss://host — no trailing slash, no path. */
export function arenaSocketBase(): string {
  const configured = process.env.NEXT_PUBLIC_ARENA_URL?.trim();
  const base = configured || (isLocalPage() ? LOCAL : DEPLOYED);
  return base.replace(/\/+$/, "");
}

/** The same server over HTTP, for the leaderboard. */
export function arenaHttpBase(): string {
  return arenaSocketBase().replace(/^ws/, "http");
}
