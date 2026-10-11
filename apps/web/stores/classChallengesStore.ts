"use client";

/**
 * Challenges an instructor published to a class this account is in — PRD
 * E8-S6. Fetched from the server when signed in; they play in the same runner
 * as a challenge authored in this browser, with the target derived here from
 * the instructor's reference circuit.
 */

import { create } from "zustand";
import { validate } from "@/lib/ir/validate";
import type { AuthoredChallenge } from "./authoredStore";
import { api, useAuth } from "./authStore";

export interface ClassChallenge extends AuthoredChallenge {
  /** The class it was published to. */
  cohort: string;
}

interface ClassChallengesState {
  status: "idle" | "loading" | "ready" | "failed";
  items: ClassChallenge[];
  load(): Promise<void>;
}

export const useClassChallenges = create<ClassChallengesState>((set, get) => ({
  status: "idle",
  items: [],

  async load() {
    if (get().status === "loading") return;
    if (useAuth.getState().status !== "signed-in") {
      set({ status: "ready", items: [] });
      return;
    }
    set({ status: "loading" });
    try {
      const { challenges } = await api<{ challenges: ClassChallenge[] }>("/me/challenges");
      // Validated again here: the server checked it, but this is the input to
      // the simulator, and the simulator trusts nothing it is handed.
      set({ status: "ready", items: challenges.filter((c) => c.reference && validate(c.reference).valid) });
    } catch {
      set({ status: "failed", items: [] });
    }
  },
}));
