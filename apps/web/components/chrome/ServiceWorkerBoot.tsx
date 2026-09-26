"use client";

/**
 * Registers the offline shell.
 *
 * PRODUCTION ONLY, deliberately — and in development it removes any worker a
 * production run left behind. A service worker in front of `next dev` fights
 * hot reload and serves chunks that no longer exist, and the symptom looks like
 * a broken app rather than a stale cache. The offline demo therefore runs from
 * a production build:
 *
 *     npm run build && npm start
 *
 * which is the right way to demo this anyway — dev mode double-invokes every
 * effect under Strict Mode, and that has already produced one visible bug in
 * the fork banner.
 */

import { useEffect } from "react";

export function ServiceWorkerBoot() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // Not registering is not enough in development. A worker left behind by
    // an earlier `npm start` on the same port keeps answering, cache first,
    // with the old build's chunks — and the page then fails to hydrate
    // because the server's HTML is newer than the JavaScript. Remove it.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.filter((k) => k.startsWith("quriosity-")).map((k) => caches.delete(k))))
          .catch(() => {});
      }
      return;
    }

    // After load, so registering never competes with the first paint.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // An unavailable service worker costs offline support and nothing else.
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
