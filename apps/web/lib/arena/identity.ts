"use client";

/**
 * Who you are to the arena.
 *
 * A random id in this browser's local storage, and nothing else. There is no
 * account: E1 is not built, and inventing a login here would imply a security
 * story that does not exist. What a ranked ladder actually needs is a stable
 * handle and a rating attached to it, which this provides honestly.
 *
 * DELIBERATELY NOT the analytics pseudonym. That one is cleared when a learner
 * turns usage logging off in Settings, and someone declining telemetry should
 * not also lose their rating. Two different things, two different keys.
 *
 * The limitation this leaves: a rating lives in one browser, and clearing site
 * data starts a new one. Settings says so, and the arena says so on the way in.
 */

const KEY = "quriosity.arena.player";

function randomId(): string {
  const bytes = new Uint8Array(9);
  globalThis.crypto?.getRandomValues?.(bytes);
  const body = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
  return `p_${body || Math.random().toString(36).slice(2, 16)}`;
}

/** Stable for this browser. Created on first use. */
export function arenaPlayerId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const id = randomId();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private mode, or storage blocked. A per-session identity still plays;
    // it just does not carry a rating between reloads.
    return randomId();
  }
}

export function forgetArenaIdentity(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to forget */
  }
}
