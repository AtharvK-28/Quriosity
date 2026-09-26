"use client";

/**
 * The tutor's pop-ups.
 *
 * Three moments, each a few words long: a new word when a lesson introduces
 * one, a nudge when a run misses, a cheer when it lands. One pop at a time —
 * a newer one replaces an older one — and each slides in from a side picked
 * at random, so it reads as the tutor dropping by rather than a banner.
 *
 * Whether a pop may appear at all is decided here, not by each caller:
 *   - never in Workbench mode (PRD E7-S5: proactive tutor output there is a
 *     P1 defect),
 *   - never while the tutor's panel is already open,
 *   - never once the learner has switched them off in Settings.
 */

import { create } from "zustand";
import type { Term, TermMark } from "@/lib/curriculum/glossary";
import type { GateType } from "@/lib/ir/types";
import { MODE, useSession } from "./sessionStore";
import { useTutor } from "./tutorStore";

export type PopKind = "new" | "hint" | "win";
export type PopSide = "right" | "top" | "bottom";

export interface Pop {
  id: number;
  kind: PopKind;
  side: PopSide;
  title: string;
  body?: string;
  /** "hint" and "win": the specimen beside the words — the gate to look at. */
  mark?: TermMark;
  /** "new" only: shown one per card, so each card is one line. */
  terms?: Term[];
  gates?: GateType[];
  action?: { label: string; run(): void };
}

type PopInput = Omit<Pop, "id" | "side">;

const OFF_KEY = "quriosity.pops-off";
const SEEN_KEY = "quriosity.seen-words";
const SIDES: PopSide[] = ["right", "top", "bottom"];
/** A cheer is gone before it is in the way. Nudges and new words wait. */
export const WIN_MS = 5000;

let seq = 0;
let lastSide: PopSide | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function pickSide(): PopSide {
  const options = SIDES.filter((s) => s !== lastSide);
  lastSide = options[Math.floor(Math.random() * options.length)];
  return lastSide;
}

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
  if (!on) usePop.getState().dismiss();
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

function allowed(): boolean {
  if (!popsEnabled()) return false;
  if (!MODE[useSession.getState().mode].proactiveTutor) return false;
  return !useTutor.getState().open;
}

interface PopState {
  pop: Pop | null;
  /** Returns false when the pop was not allowed to appear. */
  show(input: PopInput): boolean;
  dismiss(): void;
}

export const usePop = create<PopState>((set) => ({
  pop: null,

  show: (input) => {
    if (!allowed()) return false;
    if (timer) clearTimeout(timer);
    const pop: Pop = { ...input, id: ++seq, side: pickSide() };
    set({ pop });
    if (pop.kind === "win") {
      timer = setTimeout(() => {
        if (usePop.getState().pop?.id === pop.id) set({ pop: null });
      }, WIN_MS);
    }
    return true;
  },

  dismiss: () => {
    if (timer) clearTimeout(timer);
    set({ pop: null });
  },
}));
