"use client";

/**
 * A failed run, logged for the learner's instructor (PRD E10-S5).
 *
 * Fire and forget, and only for a signed-in learner — a guest has no
 * instructor, and a run must never wait on the network. The server keeps the
 * last hundred and shows them only to the instructor of a class the learner
 * has joined.
 */

import type { Circuit } from "@/lib/ir/types";
import type { Finding } from "@/lib/tutor/rules";
import { api, useAuth } from "@/stores/authStore";

export function logAttempt(place: `lesson:${string}` | `challenge:${string}`, circuit: Circuit, fidelity: number, finding: Finding | null): void {
  if (useAuth.getState().status !== "signed-in") return;
  api("/me/attempts", {
    method: "POST",
    body: {
      place,
      ir: circuit,
      fidelity: Math.max(0, Math.min(1, fidelity)),
      ruleId: finding?.ruleId,
      misconceptionId: finding?.misconception ?? undefined,
      message: finding?.message,
    },
  }).catch(() => {
    /* an instructor misses one attempt; the learner loses nothing */
  });
}
