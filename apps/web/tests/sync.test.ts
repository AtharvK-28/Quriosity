/**
 * Merging progress across devices, and turning a server report into the
 * instructor console's cohort.
 *
 * The merge runs on every sign-in, on every device, so the properties that
 * matter are the ones that make it safe to run blindly: nothing either side
 * earned is lost, nothing is counted twice, and the order does not matter.
 */

import { describe, expect, it } from "vitest";
import { earnedXp, mergeSession, type SessionDoc } from "@/lib/sync/merge";
import { cohortFromReport, misconceptionRows, nodeColumns, type CohortReport } from "@/lib/curriculum/cohort";
import type { NodeProgress } from "@/stores/sessionStore";

function node(state: NodeProgress["state"], over: Partial<NodeProgress> = {}): NodeProgress {
  return {
    state, attempts: state === "locked" ? 0 : 1, firstAttemptCorrect: state === "passed" ? true : null,
    bestFidelity: state === "passed" ? 1 : 0.5, passedAt: state === "passed" ? 1000 : null,
    gateCount: state === "passed" ? 2 : null, consolidated: false,
    nextReviewAt: null, intervalDays: 1, ease: 2.5, ...over,
  };
}

function doc(over: Partial<SessionDoc> = {}): SessionDoc {
  const base: SessionDoc = {
    mode: "guided", displayName: "you", trackId: null, progress: {}, challenges: {},
    xp: 0, streakDays: 0, streakLastDay: null, misconceptions: [],
  };
  const d = { ...base, ...over };
  if (over.xp === undefined) d.xp = earnedXp(d);
  return d;
}

describe("merging progress", () => {
  it("keeps everything either device passed", () => {
    const phone = doc({ progress: { "u0.n1": node("passed") } });
    const laptop = doc({ progress: { "u0.n2": node("passed") } });
    const m = mergeSession(phone, laptop);
    expect(m.progress["u0.n1"].state).toBe("passed");
    expect(m.progress["u0.n2"].state).toBe("passed");
  });

  it("never moves a node backwards", () => {
    const m = mergeSession(doc({ progress: { a: node("attempted") } }), doc({ progress: { a: node("passed") } }));
    expect(m.progress.a.state).toBe("passed");
    const n = mergeSession(doc({ progress: { a: node("passed") } }), doc({ progress: { a: node("attempted") } }));
    expect(n.progress.a.state).toBe("passed");
  });

  it("cannot erase a first-attempt miss", () => {
    const m = mergeSession(
      doc({ progress: { a: node("passed", { firstAttemptCorrect: true }) } }),
      doc({ progress: { a: node("passed", { firstAttemptCorrect: false }) } }),
    );
    expect(m.progress.a.firstAttemptCorrect).toBe(false);
  });

  it("counts XP once for a node passed on both devices, and adds what each earned alone", () => {
    const shared = node("passed");
    const phone = doc({ progress: { a: shared, b: node("passed") } }); // 60
    const laptop = doc({ progress: { a: shared, c: node("passed", { firstAttemptCorrect: false }) } }); // 50
    const m = mergeSession(phone, laptop);
    expect(m.xp).toBe(30 + 30 + 20);
  });

  it("keeps the larger review bonus, which progress cannot re-derive", () => {
    const phone = doc({ progress: { a: node("passed") }, xp: 30 + 15 });
    const laptop = doc({ progress: { a: node("passed") }, xp: 30 + 5 });
    expect(mergeSession(phone, laptop).xp).toBe(45);
  });

  it("merges challenges: solved anywhere is solved, best score is the best", () => {
    const m = mergeSession(
      doc({ challenges: { c1: { solved: true, attempts: 2, bestGates: 3, solvedAt: 50 } } }),
      doc({ challenges: { c1: { solved: false, attempts: 5, bestGates: 2, solvedAt: null } } }),
    );
    expect(m.challenges.c1).toEqual({ solved: true, attempts: 5, bestGates: 2, solvedAt: 50 });
  });

  it("keeps each misconception event once", () => {
    const e = { misconceptionId: "M8", ruleId: "L03_order_inverted", nodeId: "u3.n3", at: 5 };
    const m = mergeSession(doc({ misconceptions: [e] }), doc({ misconceptions: [e, { ...e, at: 9 }] }));
    expect(m.misconceptions).toHaveLength(2);
  });

  it("is the same in either order, and merging again changes nothing", () => {
    const a = doc({ progress: { x: node("passed"), y: node("attempted") }, challenges: { c: { solved: true, attempts: 1, bestGates: 2, solvedAt: 3 } } });
    const b = doc({ progress: { y: node("passed", { firstAttemptCorrect: false }), z: node("passed") } });
    const ab = mergeSession(a, b);
    const ba = mergeSession(b, a);
    expect(ab.progress).toEqual(ba.progress);
    expect(ab.challenges).toEqual(ba.challenges);
    expect(ab.xp).toBe(ba.xp);
    expect(mergeSession(ab, ab).progress).toEqual(ab.progress);
    expect(mergeSession(ab, ab).xp).toBe(ab.xp);
  });

  it("takes the account's preferences over a lab machine's", () => {
    const m = mergeSession(doc({ mode: "guided", displayName: "you" }), doc({ mode: "workbench", displayName: "Aarav" }));
    expect(m.mode).toBe("workbench");
    expect(m.displayName).toBe("Aarav");
  });

  it("is the local copy unchanged when the account has none yet", () => {
    const local = doc({ progress: { a: node("passed") } });
    expect(mergeSession(local, null)).toBe(local);
  });
});

describe("a live cohort", () => {
  const report: CohortReport = {
    cohort: { id: "c1", name: "CS-402", joinCode: "ABC234" },
    students: [
      {
        id: "s1", name: "Aarav",
        progress: { "u0.n1": { state: "passed", firstAttemptCorrect: true }, "u0.n2": { state: "attempted" } },
        misconceptions: [
          { misconceptionId: "M8", ruleId: "L03_order_inverted", nodeId: "u3.n3" },
          { misconceptionId: "M8", ruleId: "L03_order_inverted", nodeId: "u3.n3" },
        ],
        updatedAt: Date.now(),
      },
      {
        id: "s2", name: "Meera",
        progress: { "u0.n1": { state: "passed", firstAttemptCorrect: false } },
        misconceptions: [{ misconceptionId: "M8", ruleId: "L03_order_inverted", nodeId: "u3.n3" }],
        updatedAt: null,
      },
    ],
  };

  it("reads real progress into the console's shape", () => {
    const c = cohortFromReport(report);
    expect(c.seeded).toBe(false);
    expect(c.joinCode).toBe("ABC234");
    const col = nodeColumns(c).find((x) => x.node.id === "u0.n1")!;
    expect(col.passed).toBe(2);
    expect(col.firstTimeRate).toBe(0.5);
    expect(nodeColumns(c).find((x) => x.node.id === "u0.n2")!.attempting).toBe(1);
  });

  it("counts students, not events, in the heatmap", () => {
    const rows = misconceptionRows(cohortFromReport(report));
    expect(rows).toHaveLength(1);
    expect(rows[0].students).toBe(2);
    expect(rows[0].belief).toBe("puts gates in the wrong order");
    expect(rows[0].node?.id).toBe("u3.n3");
  });
});
