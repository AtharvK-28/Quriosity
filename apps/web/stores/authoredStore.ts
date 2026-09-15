"use client";

/**
 * Instructor-authored challenges — PRD E8-S6.
 *
 * "Target defined by supplying a reference circuit; the platform derives the
 * target state." The instructor builds the answer, the platform simulates it,
 * and the state it reaches becomes the target — a state vector when the answer
 * is pure, an outcome distribution when a mid-circuit measurement leaves it
 * mixed. Grading then works exactly as it does for the built-in set: by state,
 * so any other circuit reaching it passes too.
 *
 * Stored in this browser. Without a server an authored challenge can be tried
 * here and shared by nothing; the list says so.
 */

import { create } from "zustand";
import { GATES } from "@/lib/ir/gates";
import { gateCount, type Circuit, type GateType } from "@/lib/ir/types";
import { validate } from "@/lib/ir/validate";
import { simulate } from "@/lib/sim/statevector";
import type { Target } from "@/lib/grade/fidelity";
import type { Challenge, ChallengeKind } from "@/lib/curriculum/challenges";
import { compactColumns } from "@/lib/ir/layout";

export interface AuthoredChallenge {
  id: string;
  title: string;
  brief: string;
  kind: Exclude<ChallengeKind, "bughunt">;
  hint: string;
  reference: Circuit;
  allowedGates: GateType[];
  createdAt: number;
}

const KEY = "quriosity.authored.v1";

/** The target a reference circuit reaches. */
export function deriveTarget(reference: Circuit, label?: string): Target {
  const r = simulate(reference);
  if (r.statevector) {
    return { kind: "statevector", qubits: r.qubits, amplitudes: r.statevector, label };
  }
  return { kind: "distribution", qubits: r.qubits, probabilities: r.probabilities, label };
}

/** An authored challenge in the shape the runner already plays. */
export function toChallenge(a: AuthoredChallenge): Challenge {
  const ordered = compactColumns(a.reference).gates;
  return {
    id: a.id,
    title: a.title,
    kind: a.kind,
    brief: a.brief,
    qubits: a.reference.qubits,
    target: deriveTarget(a.reference, "the instructor's state"),
    allowedGates: a.allowedGates,
    par: gateCount(a.reference),
    difficulty: gateCount(a.reference) <= 2 ? 1 : gateCount(a.reference) <= 4 ? 2 : 3,
    unlockAfter: "",
    hint: a.hint,
    reference: ordered
      .filter((g) => g.type !== "barrier")
      .map((g) => ({ type: g.type, targets: g.targets, controls: g.controls, params: g.params })),
  };
}

/** The palette an authored challenge offers: what the answer used, plus a read. */
export function defaultPalette(reference: Circuit): GateType[] {
  const used = new Set<GateType>(reference.gates.map((g) => g.type).filter((t) => t !== "barrier"));
  used.add("measure");
  // Offer the obvious alternatives too, so the palette does not give the answer away.
  if (used.has("cx")) used.add("cz");
  if (used.has("h")) used.add("x");
  return (Object.keys(GATES) as GateType[]).filter((t) => used.has(t));
}

interface AuthoredState {
  hydrated: boolean;
  items: AuthoredChallenge[];
  hydrate(): void;
  add(input: Omit<AuthoredChallenge, "id" | "createdAt">): string;
  remove(id: string): void;
}

function persist(items: AuthoredChallenge[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* in memory only */
  }
}

export const useAuthored = create<AuthoredState>((set, get) => ({
  hydrated: false,
  items: [],

  hydrate() {
    if (get().hydrated) return;
    let items: AuthoredChallenge[] = [];
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        items = parsed.filter(
          (x): x is AuthoredChallenge =>
            x && typeof x.id === "string" && typeof x.title === "string" && x.reference && validate(x.reference).valid,
        );
      }
    } catch {
      items = [];
    }
    set({ hydrated: true, items });
  },

  add(input) {
    const id = `a.${Date.now().toString(36)}`;
    const items = [{ ...input, id, createdAt: Date.now() }, ...get().items];
    set({ items });
    persist(items);
    return id;
  },

  remove(id) {
    const items = get().items.filter((x) => x.id !== id);
    set({ items });
    persist(items);
  },
}));
