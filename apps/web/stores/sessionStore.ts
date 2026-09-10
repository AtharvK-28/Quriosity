"use client";

/**
 * Session, mode and progress.
 *
 * The mode matrix (PRD §6.3) is enforced here rather than in components, so a
 * screen never has to remember whether it is allowed to show XP. Ask
 * `motivationVisible(mode)` and render accordingly.
 *
 * Guided learners get the return loop — XP, a streak, a path that fills in.
 * Workbench users get none of it: a researcher who sees XP closes the tab, and
 * PRD E7-S5 makes proactive tutor output in this mode a P1 defect. Track sits
 * between: the streak, because professionals study in evenings and it helps,
 * and nothing else.
 */

import { create } from "zustand";
import { NODES, NODES_BY_ID, NODE_ORDER, UNITS, nodesInUnit, type LessonNode } from "@/lib/curriculum/nodes";

export type Mode = "guided" | "workbench" | "track";

export type NodeState = "locked" | "available" | "attempted" | "passed";

export interface NodeProgress {
  state: NodeState;
  attempts: number;
  /** Solved without a failed run first. Drives the mastery threshold. */
  firstAttemptCorrect: boolean | null;
  bestFidelity: number;
  passedAt: number | null;
  gateCount: number | null;
  /**
   * Re-derived after a first attempt that missed. First-attempt accuracy is a
   * historical fact and cannot be raised, so the mastery gate is cleared by
   * doing the work again rather than by the number changing.
   */
  consolidated: boolean;

  /** SM-2 style scheduling for the review bench. */
  nextReviewAt: number | null;
  intervalDays: number;
  ease: number;
}

/** What a learner has done with one challenge. */
export interface ChallengeProgress {
  solved: boolean;
  attempts: number;
  /** Fewest gates in a passing answer. This is the golf score. */
  bestGates: number | null;
  solvedAt: number | null;
}

export interface MisconceptionEvent {
  misconceptionId: string;
  ruleId: string;
  nodeId: string | null;
  at: number;
}

interface SessionState {
  hydrated: boolean;
  mode: Mode;
  displayName: string;

  progress: Record<string, NodeProgress>;
  challenges: Record<string, ChallengeProgress>;
  xp: number;
  streakDays: number;
  streakLastDay: string | null;

  /** Every rule hit, kept locally. This is what the instructor heatmap reads. */
  misconceptions: MisconceptionEvent[];

  setMode(mode: Mode): void;
  setDisplayName(name: string): void;

  recordAttempt(nodeId: string, passed: boolean, fidelity: number, gateCount: number): void;
  /** Mark a missed node as re-derived, which is what opens the next unit. */
  recordConsolidation(nodeId: string): void;
  recordChallenge(id: string, solved: boolean, gateCount: number): void;
  recordMisconception(misconceptionId: string, ruleId: string, nodeId: string | null): void;
  recordReview(nodeId: string, recalled: boolean): void;

  reset(): void;
  hydrate(): void;
  /** Walk the path up to a unit or node id. See `seedThrough` below. */
  seedThrough(id: string): void;
}

const STORAGE_KEY = "quriosity.session.v1";

function blankProgress(): NodeProgress {
  return {
    state: "locked",
    attempts: 0,
    firstAttemptCorrect: null,
    bestFidelity: 0,
    passedAt: null,
    gateCount: null,
    consolidated: false,
    nextReviewAt: null,
    intervalDays: 0,
    ease: 2.5,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export const useSession = create<SessionState>((set, get) => ({
  hydrated: false,
  mode: "guided",
  displayName: "you",
  progress: {},
  challenges: {},
  xp: 0,
  streakDays: 0,
  streakLastDay: null,
  misconceptions: [],

  setMode(mode) {
    set({ mode });
    persist(get());
  },

  setDisplayName(displayName) {
    set({ displayName });
    persist(get());
  },

  recordAttempt(nodeId, passed, fidelity, gateCount) {
    const progress = { ...get().progress };
    const p = { ...(progress[nodeId] ?? blankProgress()) };

    p.attempts += 1;
    p.bestFidelity = Math.max(p.bestFidelity, fidelity);
    if (p.firstAttemptCorrect === null) p.firstAttemptCorrect = passed;

    let xp = get().xp;
    let streakDays = get().streakDays;
    let streakLastDay = get().streakLastDay;

    if (passed && p.state !== "passed") {
      p.state = "passed";
      p.passedAt = Date.now();
      p.gateCount = gateCount;
      // First review one day out; the bench takes it from there.
      p.intervalDays = 1;
      p.nextReviewAt = Date.now() + 86_400_000;

      // XP is only ever awarded for a node passed for the first time, so it
      // cannot be farmed by re-running a solved circuit.
      xp += p.firstAttemptCorrect ? 30 : 20;

      const t = today();
      if (streakLastDay !== t) {
        const gap = streakLastDay ? daysBetween(streakLastDay, t) : Infinity;
        streakDays = gap === 1 ? streakDays + 1 : 1;
        streakLastDay = t;
      }
    } else if (!passed && p.state !== "passed") {
      p.state = "attempted";
    }

    progress[nodeId] = p;
    set({ progress: recomputeUnlocks(progress), xp, streakDays, streakLastDay });
    persist(get());
  },

  recordChallenge(id, solved, gateCount) {
    const challenges = { ...get().challenges };
    const c = { ...(challenges[id] ?? { solved: false, attempts: 0, bestGates: null, solvedAt: null }) };

    c.attempts += 1;
    let xp = get().xp;

    if (solved) {
      // XP once per challenge, but a shorter answer always replaces the record.
      // Practice should be worth repeating without being worth farming.
      if (!c.solved) {
        c.solved = true;
        c.solvedAt = Date.now();
        xp += 15;
      }
      c.bestGates = c.bestGates === null ? gateCount : Math.min(c.bestGates, gateCount);
    }

    challenges[id] = c;
    set({ challenges, xp });
    persist(get());
  },

  recordConsolidation(nodeId) {
    const progress = { ...get().progress };
    const p = progress[nodeId];
    if (!p || p.state !== "passed" || p.consolidated) return;
    progress[nodeId] = { ...p, consolidated: true };
    set({ progress: recomputeUnlocks(progress) });
    persist(get());
  },

  recordMisconception(misconceptionId, ruleId, nodeId) {
    set({
      misconceptions: [
        ...get().misconceptions,
        { misconceptionId, ruleId, nodeId, at: Date.now() },
      ].slice(-500),
    });
    persist(get());
  },

  recordReview(nodeId, recalled) {
    const progress = { ...get().progress };
    const p = { ...(progress[nodeId] ?? blankProgress()) };

    // SM-2, simplified to the two outcomes this bench actually offers. The
    // arithmetic is shown to the learner rather than hidden behind a level:
    // re-derive it and the interval grows, miss it and it halves.
    if (recalled) {
      p.ease = Math.min(2.8, p.ease + 0.1);
      p.intervalDays = Math.max(1, Math.round((p.intervalDays || 1) * p.ease));
    } else {
      p.ease = Math.max(1.3, p.ease - 0.2);
      p.intervalDays = Math.max(1, Math.round((p.intervalDays || 2) / 2));
    }
    p.nextReviewAt = Date.now() + p.intervalDays * 86_400_000;

    progress[nodeId] = p;
    set({ progress, xp: get().xp + (recalled ? 5 : 0) });
    persist(get());
  },

  reset() {
    set({
      mode: "guided",
      progress: recomputeUnlocks({}),
      challenges: {},
      xp: 0,
      streakDays: 0,
      streakLastDay: null,
      misconceptions: [],
    });
    persist(get());
  },

  /**
   * Walks the path up to a point, marking everything before it as passed on
   * the first attempt.
   *
   * Accepts a unit id ("u2" — that whole unit and everything before it) or a
   * node id ("u3.n3" — everything strictly before that node, so the node
   * itself is the one left to do).
   *
   * This is the local stand-in for the seeded users in TRD §15's
   * `docker-compose.demo.yml`. The demo script opens the Bell node directly,
   * and a fresh session correctly refuses that, so a demo needs a way to arrive
   * with the path already walked. It writes only to this browser's own storage
   * and grants nothing a learner could not have earned.
   */
  seedThrough(id) {
    const stop = NODE_ORDER.indexOf(id);
    let upto: number;

    if (stop >= 0) {
      upto = stop; // everything strictly before this node
    } else {
      const unit = UNITS.find((u) => u.id === id);
      if (!unit) return;
      const last = nodesInUnit(unit.id).at(-1);
      upto = last ? NODE_ORDER.indexOf(last.id) + 1 : 0;
    }

    const now = Date.now();
    const DAY = 86_400_000;
    const progress: Record<string, NodeProgress> = {};

    NODE_ORDER.slice(0, upto).forEach((nodeId, i) => {
      // Older nodes have been reviewed more often, so their intervals are
      // longer and their next review is further out. A seed where every
      // interval is one day makes the review bench look broken.
      const age = upto - i;                       // 1 for the most recent
      const interval = Math.min(32, 2 ** Math.min(5, Math.floor(age / 3)));
      const elapsed = (age % 7) * 0.4 * interval; // some are nearly due

      progress[nodeId] = {
        ...blankProgress(),
        state: "passed",
        attempts: 1,
        firstAttemptCorrect: true,
        bestFidelity: 1,
        passedAt: now - age * DAY,
        gateCount: 2,
        intervalDays: interval,
        nextReviewAt: now + (interval - elapsed) * DAY,
      };
    });
    // 30 XP per first-attempt pass, matching what recordAttempt awards, so a
    // seeded session is indistinguishable from one that walked the path.
    const earned = Object.keys(progress).length * 30;

    set({
      hydrated: true,
      progress: recomputeUnlocks(progress),
      xp: earned,
      streakDays: Math.max(1, get().streakDays),
      streakLastDay: today(),
    });
    persist(get());
  },

  hydrate() {
    if (get().hydrated) return;
    let loaded: Partial<SessionState> = {};
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) loaded = JSON.parse(raw);
    } catch {
      // A corrupt or unavailable store is not worth failing a session over.
    }
    set({
      hydrated: true,
      mode: loaded.mode ?? "guided",
      displayName: loaded.displayName ?? "you",
      progress: recomputeUnlocks(loaded.progress ?? {}),
      challenges: loaded.challenges ?? {},
      xp: loaded.xp ?? 0,
      streakDays: loaded.streakDays ?? 0,
      streakLastDay: loaded.streakLastDay ?? null,
      misconceptions: loaded.misconceptions ?? [],
    });
  },
}));

function persist(s: SessionState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mode: s.mode,
        displayName: s.displayName,
        progress: s.progress,
        challenges: s.challenges,
        xp: s.xp,
        streakDays: s.streakDays,
        streakLastDay: s.streakLastDay,
        misconceptions: s.misconceptions,
      }),
    );
  } catch {
    // Private browsing, quota, or a blocked store. Progress stays in memory.
  }
}

/**
 * A node is available when every prerequisite has passed — and, at a unit
 * boundary, when the previous unit has been mastered.
 *
 * The DAG is walked from scratch each time rather than patched incrementally,
 * because an unlock state that drifts out of sync with the graph is impossible
 * to debug.
 */
function recomputeUnlocks(progress: Record<string, NodeProgress>): Record<string, NodeProgress> {
  const next: Record<string, NodeProgress> = {};
  for (const node of NODES) {
    const p = { ...(progress[node.id] ?? blankProgress()) };
    if (p.state !== "passed") {
      const ready = node.prerequisites.every((id) => progress[id]?.state === "passed");

      // A prerequisite in another unit means this node opens a new unit, and
      // that is where the mastery threshold applies (PRD E6-S3).
      const gatingUnits = node.prerequisites
        .map((id) => NODES_BY_ID.get(id)?.unitId)
        .filter((u): u is string => Boolean(u) && u !== node.unitId);

      const mastered = gatingUnits.every((u) => unitMastered(progress, u));
      p.state = ready && mastered ? (p.attempts > 0 ? "attempted" : "available") : "locked";
    }
    next[node.id] = p;
  }
  return next;
}

/** Mastery threshold from PRD E6-S3. */
export const MASTERY_THRESHOLD = 0.8;

/**
 * First-attempt accuracy across a finished unit. Null until the unit is
 * complete, because a partial unit's rate says nothing useful.
 */
export function unitMastery(
  progress: Record<string, NodeProgress>,
  unitId: string,
): number | null {
  const nodes = nodesInUnit(unitId);
  if (nodes.length === 0) return null;
  if (!nodes.every((n) => progress[n.id]?.state === "passed")) return null;
  const right = nodes.filter((n) => progress[n.id]?.firstAttemptCorrect).length;
  return right / nodes.length;
}

/**
 * Nodes a learner passed but missed on the first attempt, and has not yet
 * re-derived. These are what the consolidation step asks for.
 */
export function needsConsolidation(
  progress: Record<string, NodeProgress>,
  unitId: string,
): LessonNode[] {
  return nodesInUnit(unitId).filter((n) => {
    const p = progress[n.id];
    return p?.state === "passed" && p.firstAttemptCorrect === false && !p.consolidated;
  });
}

/**
 * Has this unit been mastered well enough to open the next one?
 *
 * Either the learner got 80% right first time, or they have gone back and
 * re-derived the ones they missed. The second branch matters: first-attempt
 * accuracy is a fixed historical fact, so a gate that only accepted the first
 * branch would be permanently unwinnable for anyone who had a bad night.
 */
export function unitMastered(progress: Record<string, NodeProgress>, unitId: string): boolean {
  const rate = unitMastery(progress, unitId);
  if (rate === null) return false;
  if (rate >= MASTERY_THRESHOLD) return true;
  return needsConsolidation(progress, unitId).length === 0;
}

/* -- Mode matrix — PRD §6.3 --------------------------------------------------- */

export interface ModeCapabilities {
  landingRoute: string;
  /** XP, streak and badges. */
  motivation: boolean;
  /** Day streak specifically — Track keeps this and nothing else. */
  streak: boolean;
  leaderboard: boolean;
  /** The tutor speaks on its own, or only when invoked. */
  proactiveTutor: boolean;
  lockedGates: boolean;
  maxQubits: number;
  defaultShots: number;
  /** Which lane opens first on the bench. */
  primaryPanel: "canvas" | "code";
}

export const MODE: Record<Mode, ModeCapabilities> = {
  guided: {
    landingRoute: "/path",
    motivation: true,
    streak: true,
    leaderboard: true,
    proactiveTutor: true,
    lockedGates: true,
    maxQubits: 12,
    defaultShots: 1024,
    primaryPanel: "canvas",
  },
  workbench: {
    landingRoute: "/build",
    motivation: false,
    streak: false,
    leaderboard: false,
    // PRD E7-S5: proactive output here is a P1 defect, not a preference.
    proactiveTutor: false,
    lockedGates: false,
    maxQubits: 12,
    defaultShots: 4096,
    primaryPanel: "code",
  },
  track: {
    landingRoute: "/path",
    motivation: false,
    streak: true,
    leaderboard: false,
    proactiveTutor: true,
    lockedGates: true,
    maxQubits: 12,
    defaultShots: 1024,
    primaryPanel: "canvas",
  },
};

export const MODE_COPY: Record<Mode, { title: string; blurb: string; who: string }> = {
  guided: {
    title: "Guided",
    blurb: "Build circuits by dragging. The code writes itself beside you.",
    who: "New to quantum",
  },
  workbench: {
    title: "Workbench",
    blurb: "Straight to the bench. No XP, no streaks, no tutor unless you ask.",
    who: "Already write Qiskit or Cirq",
  },
  track: {
    title: "Track",
    blurb: "The same path, time-boxed, with application framing at each unit.",
    who: "Evaluating it for a project",
  },
};

/* -- Derived progress -------------------------------------------------------- */

export function unitProgress(progress: Record<string, NodeProgress>, unitId: string) {
  const nodes = nodesInUnit(unitId);
  const passed = nodes.filter((n) => progress[n.id]?.state === "passed").length;
  return { passed, total: nodes.length, complete: passed === nodes.length && nodes.length > 0 };
}

/**
 * The node a learner should open next: the first that is actually open.
 *
 * Returns null when a mastery gate is holding everything shut. There used to be
 * a fallback to "the first node that is not passed", which happily offered a
 * locked node on the Up Next card and routed straight past the gate.
 */
export function currentNodeId(progress: Record<string, NodeProgress>): string | null {
  for (const node of NODES) {
    const state = progress[node.id]?.state;
    if (state === "available" || state === "attempted") return node.id;
  }
  return null;
}

/** Is this node open to be worked on right now? */
export function isNodeOpen(progress: Record<string, NodeProgress>, nodeId: string): boolean {
  const state = progress[nodeId]?.state;
  return state === "available" || state === "attempted" || state === "passed";
}

/**
 * Mastery across the curriculum: first-attempt accuracy over attempted nodes.
 * The 80% threshold in PRD E6-S3 gates unit advancement, not individual nodes.
 */
export function masteryRate(progress: Record<string, NodeProgress>): number | null {
  const scored = Object.values(progress).filter((p) => p.firstAttemptCorrect !== null);
  if (scored.length === 0) return null;
  return scored.filter((p) => p.firstAttemptCorrect).length / scored.length;
}

/** Nodes whose retention has decayed past the point of asking for them back. */
export function dueForReview(progress: Record<string, NodeProgress>, now = Date.now()) {
  return NODES.filter((n) => {
    const p = progress[n.id];
    return p?.state === "passed" && p.nextReviewAt !== null && p.nextReviewAt <= now;
  });
}

/**
 * Retention strength on a decaying-exponential model, which is what the review
 * bench plots. 1.0 the moment it was re-derived, falling toward 0 as the
 * interval elapses. Honest about being a model rather than a measurement.
 */
export function retention(p: NodeProgress | undefined, now = Date.now()): number {
  if (!p || p.state !== "passed" || !p.passedAt) return 0;
  const halfLifeMs = Math.max(1, p.intervalDays) * 86_400_000;
  const elapsed = now - (p.nextReviewAt ? p.nextReviewAt - halfLifeMs : p.passedAt);
  return Math.max(0, Math.min(1, Math.pow(0.5, elapsed / halfLifeMs)));
}

/** A challenge opens once the node that teaches it has been passed. */
export function challengeOpen(
  progress: Record<string, NodeProgress>,
  unlockAfter: string,
): boolean {
  return progress[unlockAfter]?.state === "passed";
}

export { NODES, NODES_BY_ID, UNITS, nodesInUnit };
