"use client";

/**
 * Progress.
 *
 * What the platform has actually learned about this learner, shown back to
 * them. The interesting half is the misconception record: every rule the engine
 * fired on their circuits, and whether they have since passed the node it fired
 * on. That is the difference between "you got 7 wrong" and "here is the belief
 * that was costing you, and here is where you fixed it".
 *
 * Nothing on this screen is a score for its own sake. Every figure is either
 * something the mastery gate reads, or something a learner can act on.
 */

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/chrome/TopBar";
import { Button, Chip, Readout } from "@/components/ui/primitives";
import { MISCONCEPTIONS, type MisconceptionId } from "@/lib/tutor/rules";
import { CHALLENGES_BY_ID } from "@/lib/curriculum/challenges";
import { UNITS } from "@/lib/curriculum/nodes";
import {
  MASTERY_THRESHOLD, MODE, NODES, NODES_BY_ID, dueForReview, masteryRate,
  nodesInUnit, unitMastery, unitProgress, useSession,
} from "@/stores/sessionStore";
import s from "./profile.module.css";

export default function ProfilePage() {
  const router = useRouter();
  const {
    mode, displayName, progress, challenges, misconceptions, xp, streakDays,
    hydrate, hydrated,
  } = useSession();
  const caps = MODE[mode];

  useEffect(() => { hydrate(); }, [hydrate]);

  const passed = useMemo(
    () => Object.values(progress).filter((p) => p.state === "passed").length,
    [progress],
  );
  const mastery = useMemo(() => masteryRate(progress), [progress]);
  const due = useMemo(() => dueForReview(progress), [progress]);
  const solved = useMemo(
    () => Object.values(challenges).filter((c) => c.solved).length,
    [challenges],
  );

  /**
   * Misconceptions grouped by what the learner believed, with the node they
   * met it on and whether that node has since been passed. A belief you have
   * since resolved is worth showing — it is the clearest evidence the platform
   * can offer that the time spent stuck was time spent learning.
   */
  const beliefs = useMemo(() => {
    const byId = new Map<
      MisconceptionId,
      { count: number; nodes: Set<string>; resolved: boolean; lastAt: number }
    >();

    for (const e of misconceptions) {
      const id = e.misconceptionId as MisconceptionId;
      const entry = byId.get(id) ?? { count: 0, nodes: new Set<string>(), resolved: false, lastAt: 0 };
      entry.count += 1;
      entry.lastAt = Math.max(entry.lastAt, e.at);
      if (e.nodeId) entry.nodes.add(e.nodeId);
      byId.set(id, entry);
    }

    for (const [, entry] of byId) {
      // Resolved when every node it fired on has since been passed.
      entry.resolved =
        entry.nodes.size > 0 &&
        [...entry.nodes].every((n) => progress[n]?.state === "passed");
    }

    return [...byId.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [misconceptions, progress]);

  if (!hydrated) {
    return <div className="sheet" style={{ minHeight: "100vh" }}><TopBar /></div>;
  }

  const started = passed > 0 || solved > 0 || misconceptions.length > 0;

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />

      <main className={s.main}>
        <header className={s.head}>
          <div>
            <span className="label">Progress · {mode}</span>
            <h1 className="statement statement--s" style={{ marginTop: 6, maxWidth: "22ch" }}>
              {!started
                ? "Nothing recorded yet."
                : passed >= NODES.length
                  ? "Every node in U0 to U3 is done."
                  : `${passed} of ${NODES.length} nodes, ${solved} challenges.`}
            </h1>
          </div>
          <div className={s.stats}>
            {caps.motivation && <Readout value={xp} label="xp" />}
            {caps.streak && streakDays > 0 && (
              <Readout value={`${streakDays}d`} label="streak" tone="flag" />
            )}
            {mastery !== null && (
              <Readout
                value={`${Math.round(mastery * 100)}%`}
                label="first try"
                tone={mastery >= MASTERY_THRESHOLD ? "measure" : undefined}
              />
            )}
            {due.length > 0 && <Readout value={due.length} label="due to review" tone="flag" />}
          </div>
        </header>

        {!started ? (
          <div className={s.panel}>
            <p className={s.empty}>
              Pass a node and this fills in — which units you have finished, which
              beliefs the tutor caught you holding, and which of them you have since
              worked out of your system.
            </p>
            <div style={{ marginTop: "var(--s-4)" }}>
              <Button variant="primary" onClick={() => router.push("/path")}>
                Open the path
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* -- Units --------------------------------------------------------- */}
            <div className={s.units}>
              {UNITS.map((u) => {
                const { passed: p, total } = unitProgress(progress, u.id);
                const rate = unitMastery(progress, u.id);
                const complete = p === total;
                return (
                  <div key={u.id} className={s.unit} data-complete={complete}>
                    <UnitRing done={p} total={total} rate={rate} />
                    <span className={s.unitText}>
                      <span className={s.unitTitle}>{u.title}</span>
                      <span className={s.unitMeta}>
                        {p} of {total}
                        {rate !== null && ` · ${Math.round(rate * 100)}% first try`}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* -- Beliefs -------------------------------------------------------- */}
            <section className={s.section}>
              <div className={s.sectionHead}>
                <h2 className={s.sectionTitle}>What you believed, and when</h2>
                <span className="label">from the rule engine</span>
              </div>

              <div className={s.panel}>
                {beliefs.length === 0 ? (
                  <p className={s.empty}>
                    The tutor has not caught a misconception yet. That is either very
                    good or very early.
                  </p>
                ) : (
                  <div className={s.mList}>
                    {beliefs.map((b) => (
                      <div key={b.id} className={s.mRow}>
                        <span className={s.mBelief}>
                          {MISCONCEPTIONS[b.id] ?? b.id}
                        </span>
                        <span className={s.mMeta}>
                          {b.count}×
                          {b.nodes.size > 0 &&
                            ` · ${[...b.nodes]
                              .map((n) => NODES_BY_ID.get(n)?.title)
                              .filter(Boolean)[0]}`}
                        </span>
                        {b.resolved ? (
                          <Chip tone="measure" dot>worked out</Chip>
                        ) : (
                          <Chip tone="flag">still open</Chip>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* -- Challenges ----------------------------------------------------- */}
            {solved > 0 && (
              <section className={s.section}>
                <div className={s.sectionHead}>
                  <h2 className={s.sectionTitle}>Challenges solved</h2>
                  <span className="label">best gate count</span>
                </div>
                <div className={s.cList}>
                  {Object.entries(challenges)
                    .filter(([, c]) => c.solved)
                    .map(([id, c]) => {
                      const challenge = CHALLENGES_BY_ID.get(id);
                      if (!challenge) return null;
                      return (
                        <div key={id} className={s.cRow}>
                          <span className={s.cName}>{challenge.title}</span>
                          <span className={s.cScore}>
                            {c.bestGates}
                            {challenge.kind === "golf" && ` / ${challenge.par}`}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Completion on the arc, first-attempt accuracy in the middle. Two numbers that
 * mean different things should not share a channel, so one is angle and the
 * other is text.
 */
function UnitRing({
  done,
  total,
  rate,
}: {
  done: number;
  total: number;
  rate: number | null;
}) {
  const R = 20;
  const C = 2 * Math.PI * R;
  const frac = total > 0 ? done / total : 0;

  return (
    <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden style={{ flex: "none" }}>
      <circle cx="26" cy="26" r={R} fill="none" stroke="var(--paper-inset)" strokeWidth="5" />
      <circle
        cx="26" cy="26" r={R}
        fill="none"
        stroke={frac >= 1 ? "var(--measure)" : "var(--ink)"}
        strokeWidth="5"
        strokeLinecap="butt"
        strokeDasharray={`${C * frac} ${C}`}
        transform="rotate(-90 26 26)"
      />
      <text
        x="26" y="27"
        textAnchor="middle" dominantBaseline="middle"
        fontFamily="var(--font-mono)" fontSize="12" fontWeight="500"
        fill="var(--ink)"
      >
        {rate === null ? done : `${Math.round(rate * 100)}`}
      </text>
    </svg>
  );
}
