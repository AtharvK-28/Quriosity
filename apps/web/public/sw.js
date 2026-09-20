/**
 * Quriosity's offline shell.
 *
 * The README has always said the demo is safe to give with the network down.
 * That was true of network CALLS — the simulator, the grader and the tutor's
 * rule engine all run in the browser, and nothing in the app reaches outside
 * the origin. It was not true of a reload: without this file, pulling the wifi
 * and pressing refresh gave you the browser's dinosaur.
 *
 * Strategy, by what is being asked for:
 *
 *   /_next/static/*   cache first.  Content-hashed by the build, so a hit is
 *                     always correct and a miss is always a new build.
 *   /api/*            never touched. The tutor streams NDJSON; a cached stream
 *                     is a wrong answer with a confident face.
 *   /video/*          never touched. Twenty megabytes each, and the lesson
 *                     already degrades to its transcript when one is missing.
 *   everything else   network first, falling back to cache. Documents and RSC
 *                     payloads have to be allowed to change.
 *
 * An uncached navigation while offline gets a page that names the cause and the
 * fix rather than a browser error — Design Doc §14 asks that of every error,
 * and an offline shell that fails silently is the worst kind.
 */

const VERSION = "v1";
const SHELL = `quriosity-shell-${VERSION}`;
const RUNTIME = `quriosity-runtime-${VERSION}`;

/**
 * Fetched on install, so a learner who installs the app and then loses
 * connectivity can still reach any node — not only the ones they happened to
 * open first. Nineteen small documents; `tests/offline.test.ts` fails if this
 * list drifts from the curriculum.
 */
const PRECACHE = [
  "/",
  "/start",
  "/path",
  "/build",
  "/challenges",
  "/playground",
  "/review",
  "/profile",
  "/tracks",
  "/reference",
  "/docs",
  "/settings",
  "/lesson/u0.n1",
  "/lesson/u0.n2",
  "/lesson/u0.n3",
  "/lesson/u1.n1",
  "/lesson/u1.n2",
  "/lesson/u1.n3",
  "/lesson/u1.n4",
  "/lesson/u1.n5",
  "/lesson/u1.n6",
  "/lesson/u2.n1",
  "/lesson/u2.n2",
  "/lesson/u2.n3",
  "/lesson/u2.n4",
  "/lesson/u2.n5",
  "/lesson/u3.n1",
  "/lesson/u3.n2",
  "/lesson/u3.n3",
  "/lesson/u3.n4",
  "/lesson/u3.n5",
];

const OFFLINE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline — Quriosity</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#140a2b; color:#f5efff; padding:24px;
         font-family: ui-sans-serif, system-ui, sans-serif; line-height:1.55 }
  main { max-width:44ch }
  h1 { font-family: Georgia, serif; font-weight:400; font-size:28px; margin:0 0 12px }
  p { color:#e2d8f5; margin:0 0 16px }
  a { color:#46e6a8; text-underline-offset:3px }
  code { font-family: ui-monospace, monospace; color:#cbbde8 }
</style></head>
<body><main>
  <h1>This page was never opened on this device.</h1>
  <p>You are offline, and only pages you have visited before are stored here.
     Everything already downloaded still works — the simulator and the tutor's
     rule engine run on this machine, not on a server.</p>
  <p><a href="/path">Go to your path</a> · <a href="/build">Open the bench</a></p>
</main></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // One missing route must not fail the whole install, so these are added
      // individually rather than with addAll.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            /* that route stays uncached; the rest still install */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("quriosity-") && !k.endsWith(VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) {
    const cache = await caches.open(RUNTIME);
    cache.put(request, fresh.clone());
  }
  return fresh;
}

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    // Opaque and error responses are not worth keeping; a cached 404 outlives
    // the deploy that fixes it.
    if (fresh && fresh.ok && fresh.type === "basic") {
      const cache = await caches.open(RUNTIME);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const hit = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
    if (hit) return hit;
    if (request.mode === "navigate") {
      return new Response(OFFLINE_PAGE, {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    throw new Error("offline and uncached");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The tutor streams; a replayed stream is worse than no answer.
  if (url.pathname.startsWith("/api/")) return;
  // Lesson videos are tens of megabytes and already degrade to their
  // transcript, which is committed and cached with the document.
  if (url.pathname.startsWith("/video/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
