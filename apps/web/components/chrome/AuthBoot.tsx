"use client";

/**
 * Starts the session check and the sync engine, once, on whichever page a
 * visit begins. Renders nothing.
 */

import { useEffect } from "react";
import { useAuth } from "@/stores/authStore";
import { startSyncEngine } from "@/lib/sync/engine";

let started = false;

export function AuthBoot() {
  useEffect(() => {
    if (started) return;
    started = true;
    startSyncEngine();
    useAuth.getState().boot();
  }, []);
  return null;
}
