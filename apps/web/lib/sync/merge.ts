/**
 * Merging two copies of a learner's progress — this browser's and the
 * account's.
 *
 * Progress only moves forward, so a merge never has to choose a loser: a node
 * passed on either side is passed, a challenge solved on either is solved, a
 * misconception seen on either was seen. That makes the merge safe to run on
 * every sign-in, on every device, in any order — merging the same two copies
 * twice gives the same answer, and so does merging them the other way round.
 *
 * XP is the one field that is not a max. It is re-derived from the merged
 * progress (30 or 20 per node, 15 per challenge), because adding the two
 * totals would count a node passed on both devices twice and taking the larger
 * would drop what the other device earned. Only review-recall bonuses cannot
 * be re-derived, so the larger of the two is kept.
 */

import type { ChallengeProgress, MisconceptionEvent, Mode, NodeProgress, NodeState } from "@/stores/sessionStore";

export interface SessionDoc {
  mode: Mode;
  displayName: string;
  trackId: string | null;
  progress: Record<string, NodeProgress>;
  challenges: Record<string, ChallengeProgress>;
  xp: number;
  streakDays: number;
  streakLastDay: string | null;
  misconceptions: MisconceptionEvent[];
}

const RANK: Record<NodeState, number> = { locked: 0, available: 1, attempted: 2, passed: 3 };

const minDefined = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));

function mergeNode(a: NodeProgress | undefined, b: NodeProgress | undefined): NodeProgress {
  if (!a) return b!;
  if (!b) return a;
  // The further-along record keeps its review schedule; ties go to the one
  // that has been scheduled furthest out, which is the better-remembered.
  const lead = RANK[a.state] !== RANK[b.state]
    ? (RANK[a.state] > RANK[b.state] ? a : b)
    : (a.intervalDays >= b.intervalDays ? a : b);

  return {
    ...lead,
    attempts: Math.max(a.attempts, b.attempts),
    bestFidelity: Math.max(a.bestFidelity, b.bestFidelity),
    // A miss on either device is a miss. First-attempt accuracy is a fact
    // about the past; a merge must not be able to improve it.
    firstAttemptCorrect:
      a.firstAttemptCorrect === null ? b.firstAttemptCorrect
        : b.firstAttemptCorrect === null ? a.firstAttemptCorrect
          : a.firstAttemptCorrect && b.firstAttemptCorrect,
    passedAt: minDefined(a.passedAt, b.passedAt),
    gateCount: minDefined(a.gateCount, b.gateCount),
    consolidated: a.consolidated || b.consolidated,
  };
}

function mergeChallenge(a: ChallengeProgress | undefined, b: ChallengeProgress | undefined): ChallengeProgress {
  if (!a) return b!;
  if (!b) return a;
  return {
    solved: a.solved || b.solved,
    attempts: Math.max(a.attempts, b.attempts),
    bestGates: minDefined(a.bestGates, b.bestGates),
    solvedAt: minDefined(a.solvedAt, b.solvedAt),
  };
}

/** XP the progress itself accounts for. Everything else is recall bonus. */
export function earnedXp(doc: Pick<SessionDoc, "progress" | "challenges">): number {
  let xp = 0;
  for (const p of Object.values(doc.progress)) if (p.state === "passed") xp += p.firstAttemptCorrect ? 30 : 20;
  for (const c of Object.values(doc.challenges)) if (c.solved) xp += 15;
  return xp;
}

const MAX_EVENTS = 1000;

/**
 * `remote` is the account's copy. Where the two genuinely disagree about a
 * preference — mode, track, name — the account wins, because that is what the
 * learner set up deliberately; this browser may be a lab machine.
 */
export function mergeSession(local: SessionDoc, remote: SessionDoc | null): SessionDoc {
  if (!remote) return local;

  const progress: Record<string, NodeProgress> = {};
  for (const id of new Set([...Object.keys(local.progress), ...Object.keys(remote.progress)])) {
    progress[id] = mergeNode(local.progress[id], remote.progress[id]);
  }

  const challenges: Record<string, ChallengeProgress> = {};
  for (const id of new Set([...Object.keys(local.challenges), ...Object.keys(remote.challenges)])) {
    challenges[id] = mergeChallenge(local.challenges[id], remote.challenges[id]);
  }

  const seen = new Set<string>();
  const misconceptions = [...remote.misconceptions, ...local.misconceptions]
    .filter((e) => {
      const key = `${e.at}|${e.misconceptionId}|${e.ruleId}|${e.nodeId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((x, y) => x.at - y.at)
    .slice(-MAX_EVENTS);

  const bonus = Math.max(0, local.xp - earnedXp(local), remote.xp - earnedXp(remote));

  // The streak belongs to whichever copy was active most recently.
  const streak =
    (local.streakLastDay ?? "") > (remote.streakLastDay ?? "") ? local
      : (remote.streakLastDay ?? "") > (local.streakLastDay ?? "") ? remote
        : local.streakDays >= remote.streakDays ? local : remote;

  return {
    mode: remote.mode ?? local.mode,
    displayName: remote.displayName && remote.displayName !== "you" ? remote.displayName : local.displayName,
    trackId: remote.trackId ?? local.trackId,
    progress,
    challenges,
    xp: earnedXp({ progress, challenges }) + bonus,
    streakDays: streak.streakDays,
    streakLastDay: streak.streakLastDay,
    misconceptions,
  };
}
