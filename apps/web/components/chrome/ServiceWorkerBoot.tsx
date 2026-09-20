"use client";

/**
 * Registers the offline shell.
 *
 * PRODUCTION ONLY, deliberately. A service worker in front of `next dev` fights
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
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

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
