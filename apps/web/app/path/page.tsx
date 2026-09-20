"use client";

/**
 * The learning path.
 *
 * The curriculum renders as a circuit acting on the learner's own wire:
 * completed nodes are filled gate glyphs, the current node is the active gate,
 * locked nodes are ghosted. The metaphor is structural rather than decorative —
 * prerequisites ARE time-ordering, which is exactly what a circuit encodes, so
 * a learner reads their own progress in the notation they are learning.
 *
 * Density note: only the current node and the first locked node carry a
 * caption. Labelling all nineteen turns the wire back into a list, which is the
 * thing the wire exists to avoid.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/chrome/TopBar";
import { NextUp } from "@/components/learning/NextUp";
import { Button, Readout, Registration } from "@/components/ui/primitives";
import {
  MASTERY_THRESHOLD, MODE, NODES_BY_ID, UNITS, currentNodeId, dueForReview,
  masteryRate, needsConsolidation, nodesInUnit, unitMastery, unitProgress, useSession,
} from "@/stores/sessionStore";
import type { LessonNode } from "@/lib/curriculum/nodes";
import { presentPrompt } from "@/lib/curriculum/study";
import s from "./path.module.css";

export default function PathPage() {
  const router = useRouter();
  const {
    mode, progress, xp, streakDays, hydrate, hydrated, recordReview, seedThrough,
  } = useSession();
  const caps = MODE[mode];

  useEffect(() => { hydrate(); }, [hydrate]);

  // /path?seed=u2 walks the path up to that unit. The local stand-in for the
  // seeded demo data in TRD §15 — the demo opens the Bell node directly, and a
  // fresh session correctly refuses to.
  useEffect(() => {
    const seed = new URLSearchParams(window.location.search).get("seed");
    if (seed) {
      seedThrough(seed);
      window.history.replaceState({}, "", "/path");
    }
  }, [seedThrough]);

  const current = useMemo(() => currentNodeId(progress), [progress]);
  const currentNode = current ? NODES_BY_ID.get(current) : null;
  const mastery = useMemo(() => masteryRate(progress), [progress]);
  const due = useMemo(() => dueForReview(progress), [progress]);

  const passedCount = Object.values(progress).filter((p) => p.state === "passed").length;
  const total = Object.keys(progress).length || 19;

  if (!hydrated) {
    return (
      <div className="sheet" style={{ minHeight: "100vh" }}>
        <TopBar />
      </div>
    );
  }

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />

      <main className={s.main}>
        <header className={s.head}>
          <div>
            <span className="label">Your path</span>
            <h1 className="statement statement--s" style={{ marginTop: 6 }}>
              {passedCount === 0
                ? "Nineteen nodes to a GHZ state."
                : passedCount >= total
                  ? "Every node in U0 to U3 is done."
                  : `${passedCount} of ${total} resolved.`}
            </h1>
          </div>

          <div className={s.stats}>
            {caps.motivation && <Readout value={xp} label="xp" />}
            {caps.streak && streakDays > 0 && <Readout value={`${streakDays}d`} label="streak" tone="flag" />}
            {mastery !== null && (
              <Readout
                value={`${Math.round(mastery * 100)}%`}
                label="first try"
                tone={mastery >= 0.8 ? "measure" : undefined}
              />
            )}
          </div>
        </header>

        {/* Retrieval practice, inline, on the way to the next node. */}
        {due.length > 0 && (
          <WarmUp node={due[0]} onAnswer={(ok) => recordReview(due[0].id, ok)} />
        )}

        {/* What to do next, and the evidence for it (E7-S7). The warm-up
            above already handles a due recall, so this card does not repeat it. */}
        {(currentNode || passedCount > 0) && <NextUp skipReview />}

        {UNITS.map((unit) => {
          const nodes = nodesInUnit(unit.id);
          const { passed, total: count } = unitProgress(progress, unit.id);
          const locked = nodes.every((n) => progress[n.id]?.state === "locked");
          const firstLocked = nodes.find((n) => progress[n.id]?.state === "locked");
          const blocker = firstLocked?.prerequisites
            .map((id) => NODES_BY_ID.get(id)?.title)
            .filter(Boolean)[0];

          return (
            <section key={unit.id} className={s.unit} data-locked={locked}>
              <div className={s.unitHead}>
                <div>
                  <h2 className={s.unitTitle}>
                    Unit {unit.ordinal} · {unit.title}
                  </h2>
                  <p className={s.unitSkill}>{unit.terminalSkill}</p>
                </div>
                <span className={`label ${s.unitCount}`}>
                  <span className={s.unitBar} aria-hidden>
                    <span
                      className={s.unitBarFill}
                      data-done={passed === count}
                      style={{ width: `${count > 0 ? (passed / count) * 100 : 0}%` }}
                    />
                  </span>
                  {passed} of {count}
                </span>
              </div>

              {/* Gates on the learner's own wire. Every one carries its title:
                  a row of identical ticks is a progress bar wearing a costume. */}
              <div className={s.wire}>
                <span className={s.wireLabel}>you</span>
                <div className={s.track}>
                  <span className={s.trackLine} aria-hidden />
                  {nodes.map((node, i) => {
                    const state = progress[node.id]?.state ?? "locked";
                    const isCurrent = node.id === current;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        className={s.node}
                        data-state={state}
                        disabled={state === "locked"}
                        onClick={() => router.push(`/lesson/${node.id}`)}
                        title={
                          state === "locked"
                            ? `${node.title} — finish ${blocker ?? "the previous node"} first`
                            : `${node.title} · ${node.estMinutes} min`
                        }
                      >
                        <span className={s.glyph} aria-hidden>
                          {state === "passed" ? "✓" : state === "locked" ? "○" : i + 1}
                        </span>
                        <span className={s.nodeTitle}>{node.title}</span>
                        <span className={s.nodeMeta} data-tone={isCurrent ? "now" : undefined}>
                          {isCurrent
                            ? "up next"
                            : state === "passed"
                              ? "done"
                              : state === "locked"
                                ? "locked"
                                : `${node.estMinutes} min`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {locked && blocker && (
                <p className={s.lockNote}>Finish “{blocker}” to open this unit.</p>
              )}

              {(() => {
                const rate = unitMastery(progress, unit.id);
                const missed = needsConsolidation(progress, unit.id);
                if (rate === null || missed.length === 0) return null;
                return (
                  <div className={s.consolidate}>
                    <div className={s.consolidateText}>
                      <span className="label" style={{ color: "var(--flag)" }}>
                        Consolidate before the next unit
                      </span>
                      <p className={s.consolidateBody}>
                        You got {Math.round(rate * 100)}% of this unit right first
                        time, below the {Math.round(MASTERY_THRESHOLD * 100)}% the
                        path asks for. Re-derive{" "}
                        {missed.length === 1 ? "this one" : `these ${missed.length}`} and
                        the next unit opens. Nothing is scored again.
                      </p>
                    </div>
                    <div className={s.consolidateList}>
                      {missed.map((n) => (
                        <Button
                          key={n.id}
                          variant="secondary"
                          size="sm"
                          onClick={() => router.push(`/lesson/${n.id}?consolidate=1`)}
                        >
                          {n.title}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </section>
          );
        })}
      </main>
    </div>
  );
}

/* -- The warm-up ---------------------------------------------------------------
   A concept previously passed, coming back at the interval its retention model
   asks for. It is framed as a warm-up on the way to the next node rather than
   as a test, and answering it wrong costs nothing but a shorter next interval.
   ------------------------------------------------------------------------- */

function WarmUp({ node, onAnswer }: { node: LessonNode; onAnswer(correct: boolean): void }) {
  // Authored answer-first, rendered shuffled — see presentPrompt.
  const prompt = useMemo(() => presentPrompt(node.retrieval), [node.retrieval]);
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const correct = picked === prompt.answerIndex;

  return (
    <div className={s.warmup}>
      <Registration />
      <span className="label">Warm-up · from {node.title}</span>
      <p className={s.warmupQ}>{prompt.question}</p>

      <div className={s.options}>
        {prompt.options.map((opt, i) => (
          <button
            key={opt}
            type="button"
            className={s.option}
            disabled={answered}
            data-state={
              !answered
                ? undefined
                : i === prompt.answerIndex
                  ? "right"
                  : i === picked
                    ? "wrong"
                    : undefined
            }
            onClick={() => {
              setPicked(i);
              onAnswer(i === prompt.answerIndex);
            }}
          >
            {opt}
          </button>
        ))}
      </div>

      {answered && (
        <p className={s.because}>
          {correct ? "" : "Not that one. "}
          {prompt.because}
        </p>
      )}
    </div>
  );
}
