/**
 * What to do next, and why — PRD E7-S7.
 *
 * "Recommendation is derived from mastery gaps and misconception history, and
 * names the reason." The reason is the product here: "do Relative phase next"
 * is a to-do list, while "the tutor caught you treating relative phase as
 * invisible three times this week, and this is the node that builds it" is
 * something a learner can agree with or argue with.
 *
 * The order is a judgement about what costs the learner most if ignored:
 *
 *   1. A mastery gate holding the path shut      — nothing else moves until it clears
 *   2. A belief that keeps coming back           — practice on top of it compounds it
 *   3. A concept whose retention has decayed     — cheap now, expensive later
 *   4. The next open node                        — the default
 *   5. An unsolved challenge                     — when the path is done
 *
 * Pure: every input is passed in, so the same history always gives the same
 * advice and the tests can pin it.
 */

import { CHALLENGES, DIFFICULTY_COPY, type Challenge } from "./challenges";
import { NODES, NODES_BY_ID, UNITS, nodesInUnit, type LessonNode } from "./nodes";
import { MISCONCEPTIONS, type MisconceptionId } from "../tutor/rules";
import {
  MASTERY_THRESHOLD, challengeOpen, currentNodeId, dueForReview, needsConsolidation,
  retention, unitMastered, unitMastery,
  type ChallengeProgress, type MisconceptionEvent, type NodeProgress,
} from "@/stores/sessionStore";

export interface Recommendation {
  kind: "consolidate" | "revisit" | "review" | "node" | "challenge" | "done";
  title: string;
  href: string;
  /** One or two sentences naming the evidence. Never "because you should". */
  reason: string;
  nodeId?: string;
  challengeId?: string;
  misconceptionId?: MisconceptionId;
}

export interface RecommendInput {
  progress: Record<string, NodeProgress>;
  misconceptions: MisconceptionEvent[];
  challenges: Record<string, ChallengeProgress>;
  now?: number;
  /** For surfaces that already show a due recall inline, like the path's warm-up. */
  skipReview?: boolean;
}

const DAY = 86_400_000;
/** How far back a belief counts as current. */
const RECENT = 14 * DAY;
/** How many catches make a belief a pattern rather than a slip. */
const PATTERN = 2;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function recommendNext({ progress, misconceptions, challenges, now = Date.now(), skipReview = false }: RecommendInput): Recommendation {
  /* 1 — a mastery gate --------------------------------------------------------- */
  for (let u = 0; u < UNITS.length - 1; u++) {
    const unit = UNITS[u];
    const rate = unitMastery(progress, unit.id);
    const missed = needsConsolidation(progress, unit.id);
    if (rate === null || missed.length === 0 || unitMastered(progress, unit.id)) continue;
    const next = UNITS[u + 1];
    const node = missed[0];
    return {
      kind: "consolidate",
      title: node.title,
      href: `/lesson/${node.id}?consolidate=1`,
      nodeId: node.id,
      reason:
        `You got ${pct(rate)} of “${unit.title}” right first time, under the ${pct(MASTERY_THRESHOLD)} the path asks for. ` +
        `Re-deriving “${node.title}”${missed.length > 1 ? ` and ${missed.length - 1} more` : ""} opens “${next.title}”, and nothing is scored again.`,
    };
  }

  /* 2 — a belief that keeps coming back ------------------------------------------ */
  const recent = misconceptions.filter((e) => now - e.at <= RECENT);
  const tally = new Map<MisconceptionId, { count: number; last: MisconceptionEvent }>();
  for (const e of recent) {
    const id = e.misconceptionId as MisconceptionId;
    if (!(id in MISCONCEPTIONS)) continue;
    const t = tally.get(id) ?? { count: 0, last: e };
    t.count += 1;
    if (e.at >= t.last.at) t.last = e;
    tally.set(id, t);
  }
  const patterns = [...tally.entries()]
    .filter(([, t]) => t.count >= PATTERN)
    .sort((a, b) => b[1].count - a[1].count || b[1].last.at - a[1].last.at);

  for (const [id, t] of patterns) {
    // The node that builds this idea, among the ones already passed. Sending
    // someone back to a lesson they cannot open is not a recommendation.
    const teacher = NODES.find((n) => n.misconceptions.includes(id) && progress[n.id]?.state === "passed");
    if (!teacher) continue;
    // Still a pattern only if it fired after that node was passed, or on work
    // that is not yet passed. A belief caught once and then resolved is history.
    const since = recent.filter((e) => e.misconceptionId === id && (!e.nodeId || progress[e.nodeId]?.state !== "passed"));
    if (since.length === 0) continue;

    const whereNode = t.last.nodeId ? NODES_BY_ID.get(t.last.nodeId) : null;
    return {
      kind: "revisit",
      title: teacher.title,
      href: `/lesson/${teacher.id}`,
      nodeId: teacher.id,
      misconceptionId: id,
      reason:
        `The tutor caught “${lower(MISCONCEPTIONS[id])}” ${t.count} times in the last two weeks` +
        `${whereNode ? `, most recently on “${whereNode.title}”` : ", most recently in a challenge"}. ` +
        `“${teacher.title}” is where that idea gets built — ${teacher.estMinutes} minutes, and it doesn't affect your first-try record.`,
    };
  }

  /* 3 — retention ---------------------------------------------------------------- */
  const due = (skipReview ? [] : dueForReview(progress, now))
    .map((n) => ({ node: n, r: retention(progress[n.id], now) }))
    .sort((a, b) => a.r - b.r);
  if (due.length > 0) {
    const { node, r } = due[0];
    return {
      kind: "review",
      title: node.title,
      href: "/review",
      nodeId: node.id,
      reason:
        `“${node.title}” is due for recall — its modelled retention is down to ${pct(r)}. ` +
        `Recalling it now stretches the next gap to about ${Math.max(2, Math.round((progress[node.id]?.intervalDays || 1) * (progress[node.id]?.ease ?? 2.5)))} days.` +
        (due.length > 1 ? ` ${due.length - 1} other${due.length === 2 ? " is" : "s are"} due too.` : ""),
    };
  }

  /* 4 — the path ------------------------------------------------------------------ */
  const current = currentNodeId(progress);
  if (current) {
    const node = NODES_BY_ID.get(current)!;
    return {
      kind: "node",
      title: node.title,
      href: `/lesson/${node.id}`,
      nodeId: node.id,
      reason: nodeReason(node, progress),
    };
  }

  /* 5 — practice ------------------------------------------------------------------- */
  const open = CHALLENGES.filter((c) => challengeOpen(progress, c.unlockAfter) && !challenges[c.id]?.solved)
    .sort((a, b) => a.difficulty - b.difficulty || (challenges[b.id]?.attempts ?? 0) - (challenges[a.id]?.attempts ?? 0));
  if (open.length > 0) {
    const c = open[0];
    return {
      kind: "challenge",
      title: c.title,
      href: `/challenges/${c.id}`,
      challengeId: c.id,
      reason: challengeReason(c, challenges[c.id]),
    };
  }

  const allPassed = NODES.every((n) => progress[n.id]?.state === "passed");
  return {
    kind: "done",
    title: allPassed ? "Everything on the path" : "Nothing open right now",
    href: allPassed ? "/build" : "/path",
    reason: allPassed
      ? "Every node is passed, every open challenge is solved, and nothing is due for recall. The bench is yours."
      : "Nothing is open yet. The path shows what unlocks next.",
  };
}

function nodeReason(node: LessonNode, progress: Record<string, NodeProgress>): string {
  const p = progress[node.id];
  if (p?.state === "attempted") {
    return `You've made ${p.attempts} run${p.attempts === 1 ? "" : "s"} at “${node.title}” without passing it yet, and it's the next thing the path needs. About ${node.estMinutes} minutes.`;
  }
  const prereq = node.prerequisites.map((id) => NODES_BY_ID.get(id)).find(Boolean);
  const unitStart = nodesInUnit(node.unitId)[0]?.id === node.id;
  if (unitStart && prereq) {
    return `It opens a new unit, and you've earned it by finishing “${prereq.title}”. About ${node.estMinutes} minutes.`;
  }
  return prereq
    ? `It's the next open node, and it builds directly on “${prereq.title}”, which you've passed. About ${node.estMinutes} minutes.`
    : `It's where the path starts. About ${node.estMinutes} minutes, and no setup.`;
}

function challengeReason(c: Challenge, record: ChallengeProgress | undefined): string {
  const tried = record && record.attempts > 0
    ? `You've tried it ${record.attempts} time${record.attempts === 1 ? "" : "s"}. `
    : "";
  return `${tried}Every open node is passed, so practice is the next thing that helps. This one is ${DIFFICULTY_COPY[c.difficulty].toLowerCase()}, par ${c.par}.`;
}
