"use client";

/**
 * The review bench.
 *
 * Retention practice, framed honestly: every concept decays from the day you
 * last re-derived it, and this screen shows the decay and the arithmetic that
 * moves it. Re-derive something and the interval grows; miss it and it halves.
 *
 * There is deliberately no streak to break here. Skipping a day costs you the
 * decay and nothing else — which is true, and which is the difference between
 * spaced repetition and a slot machine.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/chrome/TopBar";
import { Button, Chip, Readout, Registration } from "@/components/ui/primitives";
import { NODES, NODES_BY_ID, dueForReview, retention, useSession } from "@/stores/sessionStore";
import { UNITS } from "@/lib/curriculum/nodes";
import type { LessonNode, RetrievalPrompt } from "@/lib/curriculum/nodes";
import { cardForReview, presentPrompt } from "@/lib/curriculum/study";
import s from "./review.module.css";

export default function ReviewPage() {
  const router = useRouter();
  const { progress, hydrate, hydrated, recordReview } = useSession();
  const [answered, setAnswered] = useState<Record<string, number>>({});

  useEffect(() => { hydrate(); }, [hydrate]);

  const passed = useMemo(
    () => NODES.filter((n) => progress[n.id]?.state === "passed"),
    [progress],
  );
  const due = useMemo(() => dueForReview(progress), [progress]);
  const active = due.find((n) => answered[n.id] === undefined) ?? null;

  // Which question this node asks this time. Rotating means a returning learner
  // recalls the concept rather than where the right answer sat last time; the
  // index comes from the stored interval, so nothing new has to be persisted.
  // Pinned to the interval as it was on arrival, so answering cannot swap the
  // question out from under the learner mid-read.
  const [pinnedInterval] = useState(() => new Map<string, number>());
  if (active && !pinnedInterval.has(active.id)) {
    pinnedInterval.set(active.id, progress[active.id]?.intervalDays ?? 1);
  }
  const activeCard = active
    ? cardForReview(active.id, pinnedInterval.get(active.id) ?? 1)
    : null;
  // Authored answer-first, rendered shuffled — see presentPrompt.
  const activePrompt = activeCard ? presentPrompt(activeCard) : null;

  if (!hydrated) {
    return <div className="sheet" style={{ minHeight: "100vh" }}><TopBar /></div>;
  }

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />

      <main className={s.main}>
        <header className={s.head}>
          <div>
            <span className="label">Return · nothing new today</span>
            <h1 className="statement statement--s" style={{ marginTop: 6, maxWidth: "20ch" }}>
              {passed.length === 0
                ? "Nothing to review yet."
                : due.length === 0
                  ? "Everything is above threshold."
                  : `${due.length} concept${due.length === 1 ? "" : "s"} ${due.length === 1 ? "has" : "have"} decayed past the ask-back point.`}
            </h1>
          </div>
          <div className={s.stats}>
            <Readout value={passed.length} label="resolved" />
            <Readout value={due.length} label="due now" tone={due.length > 0 ? "flag" : "measure"} />
          </div>
        </header>

        {passed.length === 0 && (
          <p className="prose">
            Pass a node and it appears here, with the date it starts asking for
            itself back. <Button variant="ghost" onClick={() => router.push("/path")}>Open the path</Button>
          </p>
        )}

        {active && activePrompt && (
          <ReviewTask
            node={active}
            card={activePrompt}
            onAnswer={(index) => {
              setAnswered((a) => ({ ...a, [active.id]: index }));
              recordReview(active.id, index === activePrompt.answerIndex);
            }}
          />
        )}

        {passed.length > 0 && (
          <section className={s.table}>
            <div className={s.tableHead}>
              <span className="label">Concept</span>
              <span className="label">Retention</span>
              <span className="label">Interval</span>
              <span className="label">Next</span>
            </div>

            {(() => {
              const now = Date.now();
              const rows = passed
                .map((node) => {
                  const p = progress[node.id];
                  const days = p.nextReviewAt
                    ? Math.ceil((p.nextReviewAt - now) / 86_400_000)
                    : 0;
                  return { node, p, r: retention(p, now), days, overdue: days <= 0 };
                })
                .sort((a, b) => a.days - b.days);

              // Three bands, because "what should I do right now" is the only
              // question this screen is asked.
              const bands: Array<{ key: string; label: string; of: typeof rows }> = [
                { key: "due", label: "Due now", of: rows.filter((x) => x.overdue) },
                { key: "soon", label: "Within the week", of: rows.filter((x) => !x.overdue && x.days <= 7) },
                { key: "held", label: "Holding", of: rows.filter((x) => !x.overdue && x.days > 7) },
              ].filter((band) => band.of.length > 0);

              return bands.map((band) => (
                <div key={band.key}>
                  <div className={s.bandHead}>
                    <span className="label" data-band={band.key}>
                      {band.label}
                    </span>
                    <span className={s.bandCount}>{band.of.length}</span>
                  </div>

                  {band.of.map(({ node, p, r, days, overdue }) => {
                    const unit = UNITS.find((u) => u.id === node.unitId);
                    return (
                      <div key={node.id} className={s.row}>
                        <span className={s.rowName}>
                          <b>{node.title}</b>
                          <span className={s.rowUnit}>
                            Unit {unit?.ordinal} · {unit?.title}
                          </span>
                        </span>

                        <DecayCurve retention={r} intervalDays={p.intervalDays} />

                        <span className={s.rowMono}>{p.intervalDays}d</span>
                        <span className={s.rowMono} data-overdue={overdue}>
                          {overdue ? "now" : `${days}d`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}

            <p className={s.footnote}>
              Re-derive a concept and its interval multiplies by its ease factor.
              Miss it and the interval halves. The arithmetic is shown rather than
              hidden behind a level, and skipping costs the decay and nothing else.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

/**
 * The forgetting curve for one concept, with a dot at where it stands now.
 *
 * A bar would say "retention is 0.62". The curve says "it is 0.62 and falling,
 * and here is how fast" — which is the only reason the number is interesting.
 */
function DecayCurve({
  retention: r,
  intervalDays,
}: {
  retention: number;
  intervalDays: number;
}) {
  const W = 132;
  const H = 30;
  const points: string[] = [];

  // Exponential decay over two half-lives, which is the window that matters.
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const y = Math.pow(0.5, t * 2);
    points.push(`${(t * W).toFixed(1)},${(H - y * (H - 3) - 1.5).toFixed(1)}`);
  }

  // Where this concept sits on its own curve right now.
  const at = r > 0 ? Math.min(1, Math.log2(1 / Math.max(r, 0.02)) / 2) : 1;
  const dotX = at * W;
  const dotY = H - r * (H - 3) - 1.5;
  const low = r < 0.5;

  return (
    <span className={s.curve}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <line x1="0" y1={H - 1.5} x2={W} y2={H - 1.5} stroke="var(--rule)" strokeWidth="1" />
        {/* The threshold this bench asks concepts back at. */}
        <line
          x1="0" y1={H - 0.5 * (H - 3) - 1.5} x2={W} y2={H - 0.5 * (H - 3) - 1.5}
          stroke="var(--rule-2)" strokeWidth="1" strokeDasharray="2 3"
        />
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke={low ? "var(--flag)" : "var(--measure)"}
          strokeWidth="1.5"
          opacity="0.55"
        />
        <circle cx={dotX} cy={dotY} r="3" fill={low ? "var(--flag)" : "var(--measure)"} />
      </svg>
      <span className={s.curveValue}>{r.toFixed(2)}</span>
    </span>
  );
}

function ReviewTask({
  node,
  card,
  onAnswer,
}: {
  node: LessonNode;
  card: RetrievalPrompt;
  onAnswer(i: number): void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;

  return (
    <div className={s.task}>
      <Registration />
      <div className={s.taskHead}>
        <span className="label">Restore · {node.title}</span>
        <Chip tone="flag" dot>due</Chip>
      </div>

      <p className={s.taskQ}>{card.question}</p>

      <div className={s.options}>
        {card.options.map((opt, i) => (
          <button
            key={opt}
            type="button"
            className={s.option}
            disabled={answered}
            data-state={
              !answered ? undefined
                : i === card.answerIndex ? "right"
                : i === picked ? "wrong" : undefined
            }
            onClick={() => { setPicked(i); onAnswer(i); }}
          >
            {opt}
          </button>
        ))}
      </div>

      {answered && <p className={s.because}>{card.because}</p>}
    </div>
  );
}
