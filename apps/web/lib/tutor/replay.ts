/**
 * Which gates a stored attempt's diagnosis pointed at.
 *
 * The server keeps a failed run's circuit, its place ("lesson:u3.n3",
 * "challenge:c.bell") and the rule that fired, but not the gate ids the rule
 * named. Those come back by running the same simulator and rule engine the
 * learner's browser ran, so an instructor sees the same gate ringed that the
 * learner saw.
 */

import { CHALLENGES_BY_ID } from "@/lib/curriculum/challenges";
import { NODES_BY_ID } from "@/lib/curriculum/nodes";
import { grade, type Target } from "@/lib/grade/fidelity";
import type { Circuit } from "@/lib/ir/types";
import { simulate } from "@/lib/sim/statevector";
import { diagnose, primaryDiagnosis } from "./rules";

/** The target a place was graded against, when this build knows it. */
export function targetForPlace(place: string): Target | null {
  const [kind, id] = place.split(":");
  if (kind === "lesson") return NODES_BY_ID.get(id)?.target ?? null;
  if (kind === "challenge") return CHALLENGES_BY_ID.get(id)?.target ?? null;
  return null;
}

/** Gate ids to highlight on a stored attempt. Empty when none can be found. */
export function attemptHighlights(place: string, circuit: Circuit, ruleId: string | null): string[] {
  const target = targetForPlace(place);
  if (!target || target.qubits !== circuit.qubits) return [];
  try {
    const result = simulate(circuit);
    const ctx = { circuit, result, target, grade: grade(result, target) };
    // The rule that fired then, if it still fires; otherwise today's diagnosis.
    const finding =
      (ruleId ? diagnose(ctx).find((f) => f.ruleId === ruleId) : undefined) ?? primaryDiagnosis(ctx);
    return finding?.gateIds ?? [];
  } catch {
    // A circuit this build cannot simulate is shown without a ring, not an error.
    return [];
  }
}
