"use client";

/**
 * What the tutor says when it drops by — the three moments, worded once.
 *
 * Each stays short on purpose. The full diagnosis is already written under
 * the circuit; the pop points at it rather than repeating it, and offers the
 * long form (the chat) as one tap.
 */

import { gatesIntroducedIn, termsIntroducedIn } from "@/lib/curriculum/glossary";
import { GATES } from "@/lib/ir/gates";
import { gateQubits, type Circuit } from "@/lib/ir/types";
import type { Finding } from "@/lib/tutor/rules";
import { markSeen, unseen, usePop } from "@/stores/popStore";
import { useTutor } from "@/stores/tutorStore";
import { MODE, useSession } from "@/stores/sessionStore";
import type { Reward } from "@/lib/rewards";
import { FOLLOW_UP } from "./TutorDock";

/** A new lesson: the words and gates it introduces, first time only. */
export function popNewWords(nodeId: string): void {
  const terms = termsIntroducedIn(nodeId);
  const gates = gatesIntroducedIn(nodeId);
  const words = [...terms.map((t) => `term:${t.id}`), ...gates.map((g) => `gate:${g}`)];
  const fresh = new Set(unseen(words));
  if (fresh.size === 0) return;

  const shown = usePop.getState().show({
    kind: "new",
    title: "New words",
    terms: terms.filter((t) => fresh.has(`term:${t.id}`)),
    gates: gates.filter((g) => fresh.has(`gate:${g}`)),
  });
  // Only what was actually shown counts as seen, so a suppressed pop can
  // still introduce the words another time.
  if (shown) markSeen([...fresh]);
}

function flaggedGate(finding: Finding | null, circuit: Circuit) {
  return finding?.gateIds.map((id) => circuit.gates.find((g) => g.id === id)).find(Boolean) ?? null;
}

/** Where to look, in a few words — never the fix itself. */
function nudge(finding: Finding | null, circuit: Circuit): string {
  if (!finding) return "Compare your bars with the dashed target.";
  const gate = flaggedGate(finding, circuit);
  if (gate) return `Look at the highlighted ${GATES[gate.type].name} on q${gateQubits(gate)[0]}.`;
  if (finding.qubits.length > 0) return `Look at wire q${finding.qubits[0]}.`;
  return "Compare your bars with the dashed target.";
}

/** A run that missed. */
export function popHint(finding: Finding | null, circuit: Circuit, fidelity: number): void {
  usePop.getState().show({
    kind: "hint",
    title: fidelity >= 0.8 ? "Close — one thing to check." : "Not quite yet.",
    body: nudge(finding, circuit),
    mark: (() => {
      const gate = flaggedGate(finding, circuit);
      return gate ? { wire: [gate.type] } : undefined;
    })(),
    action: finding
      ? { label: "Why?", run: () => void useTutor.getState().ask(FOLLOW_UP) }
      : undefined,
  });
}

/** The right state, reached without the move the node is teaching. */
export function popMissingStep(why: string): void {
  usePop.getState().show({ kind: "hint", title: "Right state, one step missing.", body: why });
}

const CHEERS = ["Nailed it!", "That's the one.", "Spot on!", "Beautiful."];

/** A run that landed. */
export function popWin(body?: string): void {
  usePop.getState().show({
    kind: "win",
    title: CHEERS[Math.floor(Math.random() * CHEERS.length)],
    body,
  });
}

/** A new run is under way: whatever the last one prompted is stale. */
export function clearPop(): void {
  const { pop, queue, dismiss } = usePop.getState();
  usePop.setState({ queue: queue.filter((q) => q.kind !== "hint" && q.kind !== "win") });
  if (pop && (pop.kind === "hint" || pop.kind === "win")) dismiss();
}

/**
 * Leaving the surface: nothing the tutor said here applies anywhere else.
 * Rewards are about the learner, not the page, so they stay.
 */
export function dismissPop(): void {
  const { pop, queue } = usePop.getState();
  const rewards = queue.filter((q) => q.kind === "reward");
  if (pop?.kind === "reward") {
    usePop.setState({ queue: rewards });
    return;
  }
  usePop.getState().clear();
  const [first, ...rest] = rewards;
  if (first) usePop.setState({ pop: first, queue: rest });
}

/** Something earned — a quest, the streak, a rank, arena XP — in the tutor's voice. */
export function popReward(r: Reward): void {
  const motivation = MODE[useSession.getState().mode].motivation;
  const show = usePop.getState().show;
  switch (r.kind) {
    case "quest":
      show({ kind: "reward", title: "Quest complete", body: r.title, reward: { icon: "quest", amount: motivation ? `+${r.xp} XP` : undefined } });
      return;
    case "allQuests":
      show({
        kind: "reward",
        title: "All three quests done",
        body: "That's today handled. New quests at midnight UTC.",
        reward: { icon: "xp", amount: motivation ? `+${r.xp} XP` : undefined },
      });
      return;
    case "streak": {
      const title =
        r.event === "froze" ? "Streak saved by a freeze"
          : r.event === "earnedFreeze" ? `${r.days} days — freeze earned`
            : r.days === 1 ? "Day one of your streak"
              : `${r.days}-day streak`;
      const body =
        r.event === "froze" ? `A freeze covered the day you missed. ${r.freezes} left.`
          : r.event === "earnedFreeze" ? "A freeze covers a day you miss. You can hold two."
            : r.days === 1 ? "Come back tomorrow to make it two."
              : "Kept alive for today. See you tomorrow.";
      show({
        kind: "reward",
        title,
        body,
        reward: { icon: r.event === "froze" || r.event === "earnedFreeze" ? "freeze" : "streak", amount: String(r.days) },
      });
      return;
    }
    case "arena":
      if (!motivation) return;
      show({
        kind: "reward",
        title: r.firstWinToday ? "First win of the day" : r.won ? "Match won" : "Match played",
        body: r.firstWinToday ? "Bonus XP for your first win today." : "Every match counts toward your quests.",
        reward: { icon: "xp", amount: `+${r.xp} XP` },
      });
      return;
    case "badge":
      show({
        kind: "reward",
        title: `Badge: ${r.name}`,
        body: r.how,
        reward: { icon: "badge", glyph: r.glyph, amount: "New badge" },
      });
      return;
    case "rank":
      show({
        kind: "reward",
        title: r.up ? `Promoted to ${r.tier}` : `Now ${r.tier}`,
        body: r.up ? "Your rank moved up. Keep it there." : "One bad match. Win it back.",
        reward: { icon: "rank", amount: r.tier, up: r.up },
      });
      return;
  }
}
