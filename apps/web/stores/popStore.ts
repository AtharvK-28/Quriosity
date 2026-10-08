"use client";

/**
 * The tutor's pop-ups.
 *
 * Four moments, each a few words long: a new word when a lesson introduces
 * one, a nudge when a run misses, a cheer when it lands, and a reward — a
 * quest done, a streak kept, a rank earned. They arrive as the tutor speaking
 * from its corner, one at a time, and queue rather than trample each other:
 *
 *   - a new word is never thrown away by something that happens after it;
 *     anything newer waits behind it
 *   - a hint or a cheer replaces an older hint or cheer — it is about the run
 *     that just happened, and the last one is stale
 *   - rewards queue, and close themselves
 *
 * Whether a pop may appear at all is decided here, not by each caller:
 *   - never in Workbench mode (PRD E7-S5: proactive tutor output there is a
 *     P1 defect), and rewards only where the mode shows the streak or XP,
 *   - never while the tutor's panel is already open,
 *   - never once the learner has switched them off in Settings.
 */

import { create } from "zustand";
import type { Term, TermMark } from "@/lib/curriculum/glossary";
import type { GateType } from "@/lib/ir/types";
import { MODE, useSession } from "./sessionStore";
import { useTutor } from "./tutorStore";

export type PopKind = "new" | "hint" | "win" | "reward";
export type RewardIcon = "xp" | "streak" | "freeze" | "rank" | "quest" | "badge";

export interface Pop {
  id: number;
  kind: PopKind;
  title: string;
  body?: string;
  /** "hint" and "win": the specimen beside the words — the gate to look at. */
  mark?: TermMark;
  /** "new" only: shown one per card, so each card is one line. */
  terms?: Term[];
  gates?: GateType[];
  /** "reward": what it is for, and the number that counts up. */
  reward?: { icon: RewardIcon; amount?: string; up?: boolean; glyph?: string };
  action?: { label: string; run(): void };
}

type PopInput = Omit<Pop, "id">;

const OFF_KEY = "quriosity.pops-off";
const SEEN_KEY = "quriosity.seen-words";
/** A cheer is gone before it is in the way. Nudges and new words wait. */
export const WIN_MS = 5000;
export const REWARD_MS = 5200;
const MAX_QUEUE = 5;

let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export function popsEnabled(): boolean {
  try {
    return window.localStorage.getItem(OFF_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setPopsEnabled(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(OFF_KEY);
    else window.localStorage.setItem(OFF_KEY, "1");
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
  if (!on) usePop.setState({ pop: null, queue: [] });
}

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Words (term:ID, gate:ID) this learner has not been shown yet. */
export function unseen(words: string[]): string[] {
  const seen = readSeen();
  return words.filter((w) => !seen.has(w));
}

export function markSeen(words: string[]): void {
  const seen = readSeen();
  words.forEach((w) => seen.add(w));
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* not remembered; it may pop again next visit */
  }
}

function allowed(kind: PopKind): boolean {
  if (!popsEnabled()) return false;
  const caps = MODE[useSession.getState().mode];
  if (kind === "reward" ? !caps.streak : !caps.proactiveTutor) return false;
  return !useTutor.getState().open;
}

/** Hints and cheers are about the latest run; an older one of either is stale. */
const aboutTheRun = (k: PopKind) => k === "hint" || k === "win";

interface PopState {
  pop: Pop | null;
  /** Waiting their turn. */
  queue: Pop[];
  /** Returns false when the pop was not allowed to appear. */
  show(input: PopInput): boolean;
  /** Closes the current pop; the next in line, if any, follows. */
  dismiss(): void;
  /** Closes everything, queue included — leaving the surface. */
  clear(): void;
}

function arm(pop: Pop) {
  if (timer) clearTimeout(timer);
  timer = null;
  const ms = pop.kind === "win" ? WIN_MS : pop.kind === "reward" ? REWARD_MS : 0;
  if (ms > 0) {
    timer = setTimeout(() => {
      if (usePop.getState().pop?.id === pop.id) usePop.getState().dismiss();
    }, ms);
  }
}

export const usePop = create<PopState>((set, get) => ({
  pop: null,
  queue: [],

  show: (input) => {
    if (!allowed(input.kind)) return false;
    const pop: Pop = { ...input, id: ++seq };
    const { pop: current, queue } = get();

    if (!current) {
      set({ pop });
      arm(pop);
      return true;
    }
    // A fresher word about the run replaces a stale one on screen.
    if (aboutTheRun(pop.kind) && aboutTheRun(current.kind)) {
      set({ pop });
      arm(pop);
      return true;
    }
    // The run's own feedback comes before what the run earned: a reward on
    // screen steps back to the front of the line and returns straight after.
    if (aboutTheRun(pop.kind) && current.kind === "reward") {
      set({ pop, queue: [current, ...queue.filter((q) => !aboutTheRun(q.kind))].slice(0, MAX_QUEUE) });
      arm(pop);
      return true;
    }
    // Otherwise wait in line — dropping any stale run pops already waiting.
    const waiting = queue.filter((q) => !(aboutTheRun(pop.kind) && aboutTheRun(q.kind)));
    set({ queue: [...waiting, pop].slice(-MAX_QUEUE) });
    return true;
  },

  dismiss: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const [next, ...rest] = get().queue;
    set({ pop: next ?? null, queue: rest });
    if (next) arm(next);
  },

  clear: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ pop: null, queue: [] });
  },
}));
