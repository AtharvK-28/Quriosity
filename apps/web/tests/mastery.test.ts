/**
 * Mastery gating — PRD E6-S3.
 *
 * "Pass threshold is 80% first-attempt accuracy across the node's checks. Below
 * that, the node offers a variant rather than unlocking the next."
 *
 * The subtlety this file exists to guard: first-attempt accuracy is a fixed
 * historical fact. A gate that only ever accepted "get the number above 80%"
 * would be permanently unwinnable for anyone who had a bad night on their first
 * pass through a unit. So the gate has two doors — clear the threshold, or go
 * back and re-derive the ones you missed — and the second must actually open.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  MASTERY_THRESHOLD, currentNodeId, isNodeOpen, needsConsolidation, unitMastered,
  unitMastery, useSession,
} from "@/stores/sessionStore";
import { nodesInUnit } from "@/lib/curriculum/nodes";

function pass(nodeId: string, firstTime: boolean) {
  const { recordAttempt } = useSession.getState();
  // A miss then a pass is what "not first time" means.
  if (!firstTime) recordAttempt(nodeId, false, 0.4, 1);
  recordAttempt(nodeId, true, 1, 2);
}

function stateOf(nodeId: string) {
  return useSession.getState().progress[nodeId]?.state;
}

describe("unit mastery gating", () => {
  beforeEach(() => {
    useSession.setState({ hydrated: true });
    useSession.getState().reset();
  });

  const u0 = nodesInUnit("u0").map((n) => n.id);
  const firstOfU1 = nodesInUnit("u1")[0].id;

  it("opens the next unit when every node was right first time", () => {
    for (const id of u0) pass(id, true);

    expect(unitMastery(useSession.getState().progress, "u0")).toBe(1);
    expect(unitMastered(useSession.getState().progress, "u0")).toBe(true);
    expect(stateOf(firstOfU1)).toBe("available");
  });

  it("holds the next unit shut below the threshold", () => {
    // Two of three right first time is 67%, under the 80% bar.
    pass(u0[0], true);
    pass(u0[1], true);
    pass(u0[2], false);

    const { progress } = useSession.getState();
    expect(unitMastery(progress, "u0")).toBeCloseTo(2 / 3, 6);
    expect(unitMastery(progress, "u0")!).toBeLessThan(MASTERY_THRESHOLD);
    expect(unitMastered(progress, "u0")).toBe(false);

    // Every node in u0 is passed, and u1 is still locked.
    expect(u0.every((id) => stateOf(id) === "passed")).toBe(true);
    expect(stateOf(firstOfU1)).toBe("locked");
  });

  it("names exactly which nodes have to be re-derived", () => {
    pass(u0[0], true);
    pass(u0[1], false);
    pass(u0[2], false);

    const missed = needsConsolidation(useSession.getState().progress, "u0");
    expect(missed.map((n) => n.id)).toEqual([u0[1], u0[2]]);
  });

  it("opens the unit once the missed nodes are re-derived", () => {
    pass(u0[0], true);
    pass(u0[1], true);
    pass(u0[2], false);
    expect(stateOf(firstOfU1)).toBe("locked");

    useSession.getState().recordConsolidation(u0[2]);

    expect(unitMastered(useSession.getState().progress, "u0")).toBe(true);
    expect(stateOf(firstOfU1)).toBe("available");
  });

  it("is not clearable by consolidating a node that was already right", () => {
    pass(u0[0], true);
    pass(u0[1], false);
    pass(u0[2], false);

    // Consolidating the one they got right changes nothing.
    useSession.getState().recordConsolidation(u0[0]);
    expect(stateOf(firstOfU1)).toBe("locked");

    useSession.getState().recordConsolidation(u0[1]);
    expect(stateOf(firstOfU1)).toBe("locked");

    useSession.getState().recordConsolidation(u0[2]);
    expect(stateOf(firstOfU1)).toBe("available");
  });

  it("reports no mastery for a unit that is not finished", () => {
    pass(u0[0], true);
    expect(unitMastery(useSession.getState().progress, "u0")).toBeNull();
    expect(unitMastered(useSession.getState().progress, "u0")).toBe(false);
  });

  it("never traps a learner: the gate is always clearable", () => {
    // The worst case — every node missed on the first attempt.
    for (const id of u0) pass(id, false);
    expect(unitMastery(useSession.getState().progress, "u0")).toBe(0);
    expect(stateOf(firstOfU1)).toBe("locked");

    // Re-deriving all of them still opens the unit, even though the accuracy
    // number itself can never move.
    for (const id of u0) useSession.getState().recordConsolidation(id);

    expect(unitMastery(useSession.getState().progress, "u0")).toBe(0);
    expect(unitMastered(useSession.getState().progress, "u0")).toBe(true);
    expect(stateOf(firstOfU1)).toBe("available");
  });

  it("never offers a locked node as what to do next", () => {
    // The Up Next card routes to whatever this returns, so a locked node here
    // is a door straight past the gate.
    pass(u0[0], true);
    pass(u0[1], true);
    pass(u0[2], false);

    const { progress } = useSession.getState();
    expect(currentNodeId(progress)).toBeNull();
    expect(isNodeOpen(progress, firstOfU1)).toBe(false);

    useSession.getState().recordConsolidation(u0[2]);
    expect(currentNodeId(useSession.getState().progress)).toBe(firstOfU1);
  });

  it("does not award XP twice for a consolidated node", () => {
    pass(u0[0], false);
    const before = useSession.getState().xp;
    useSession.getState().recordConsolidation(u0[0]);
    expect(useSession.getState().xp).toBe(before);
  });

  it("gates every unit boundary, not just the first", () => {
    for (const id of u0) pass(id, true);
    const u1 = nodesInUnit("u1").map((n) => n.id);

    // Four of six right first time is 67%.
    u1.forEach((id, i) => pass(id, i < 4));

    expect(unitMastered(useSession.getState().progress, "u1")).toBe(false);
    expect(stateOf(nodesInUnit("u2")[0].id)).toBe("locked");
  });
});
