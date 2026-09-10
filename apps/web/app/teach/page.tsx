"use client";

/**
 * The instructor console — PRD E10, Design Doc §8.6.
 *
 * The heatmap leads and the completion table follows, because an instructor has
 * ninety seconds before class and the first thing on the screen has to be the
 * thing that changes the lecture. Everything below the fold is detail they will
 * read later or never.
 *
 * The data is seeded, and the header says so rather than waiting to be asked
 * (PRD milestone M6). The misconception ids are the real ones the rule engine
 * emits, so when a backend lands this screen swaps its source and keeps its
 * shape — `misconception_events` is already indexed for exactly this query.
 */

import { useMemo, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { Button, Chip, Disclosure, Readout, Registration } from "@/components/ui/primitives";
import {
  cohortSummary, misconceptionRows, nodeColumns, seedCohort,
} from "@/lib/curriculum/cohort";
import { UNITS } from "@/lib/curriculum/nodes";
import { NODES } from "@/stores/sessionStore";
import s from "./teach.module.css";

/** Beliefs are stored lowercase so they read inside a sentence. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function TeachPage() {
  const cohort = useMemo(() => seedCohort(58), []);
  const rows = useMemo(() => misconceptionRows(cohort), [cohort]);
  const columns = useMemo(() => nodeColumns(cohort), [cohort]);
  const summary = useMemo(() => cohortSummary(cohort), [cohort]);

  const [showRoster, setShowRoster] = useState(false);
  const top = rows[0];
  const topPct = top ? Math.round((top.students / cohort.students.length) * 100) : 0;

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />

      <main className={s.main}>
        <span className={s.seeded}>
          Seeded demo data · 58 students · not a real cohort
        </span>

        <header className={s.head}>
          <div>
            <span className="label">{cohort.name}</span>
            <h1 className="statement statement--s" style={{ marginTop: 6, maxWidth: "24ch" }}>
              Where the class is stuck.
            </h1>
          </div>
          <div className={s.stats}>
            <Readout value={summary.total} label="students" />
            <Readout value={summary.active} label="active this week" tone="measure" />
            <Readout value={`${summary.median}/${NODES.length}`} label="median node" />
          </div>
        </header>

        {/* The lead. One sentence an instructor can act on before the bell. */}
        {top && (
          <div className={s.lead}>
            <Registration />
            <span className="label" style={{ color: "var(--error)" }}>
              The thing to cover first
            </span>
            <h2 className={s.leadStatement}>
              {topPct}% of the class {top.belief}.
            </h2>
            <p className={s.leadBody}>
              {top.students} of {cohort.students.length} students have hit this in{" "}
              {top.node ? `“${top.node.title}”` : "their attempts"}. The rule engine
              caught every one of them by reading the circuit, so these are actual
              submitted circuits rather than a guess from a quiz score.
            </p>
          </div>
        )}

        {/* -- The heatmap ------------------------------------------------------ */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Misconceptions, ranked</h2>
            <span className="label">by students affected</span>
          </div>

          <div className={s.heat}>
            {rows.map((r, i) => {
              const pct = Math.round((r.students / cohort.students.length) * 100);
              return (
                <div key={`${r.id}-${r.ruleId}`} className={s.heatRow}>
                  <div className={s.belief}>
                    <span className={s.beliefText}>{sentence(r.belief)}</span>
                    <span className={s.beliefMeta}>
                      {r.id} · {r.ruleId}
                      {r.node && ` · ${r.node.title}`}
                    </span>
                  </div>
                  <span className={s.count}>{r.students} students</span>
                  <span className={s.pct}>{pct}%</span>
                  <span className={s.heatBar} aria-hidden>
                    <span
                      className={s.heatFill}
                      data-top={i === 0}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* -- Completion ------------------------------------------------------- */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Node completion</h2>
            <span className="label">
              {summary.stuck ? `most attempting: ${summary.stuck.node.title}` : ""}
            </span>
          </div>

          <div className={s.matrixWrap}>
            <div className={s.matrix}>
              {columns.map((c) => {
                const total = cohort.students.length;
                return (
                  <div key={c.node.id} className={s.col}>
                    <span
                      className={s.stack}
                      title={`${c.node.title}: ${c.passed} passed, ${c.attempting} attempting, ${c.locked} not reached`}
                    >
                      <span className={s.segPassed} style={{ height: `${(c.passed / total) * 100}%` }} />
                      <span className={s.segAttempting} style={{ height: `${(c.attempting / total) * 100}%` }} />
                      <span className={s.segLocked} style={{ height: `${(c.locked / total) * 100}%` }} />
                    </span>
                    <span className={s.colLabel}>{c.node.title}</span>
                  </div>
                );
              })}
            </div>

            <div className={s.legend}>
              <span className={s.legendItem}>
                <span className={s.swatch} style={{ background: "var(--ink)" }} /> passed
              </span>
              <span className={s.legendItem}>
                <span className={s.swatch} style={{ background: "var(--flag)" }} /> attempting
              </span>
              <span className={s.legendItem}>
                <span className={s.swatch} style={{ background: "var(--rule-2)" }} /> not reached
              </span>
              <span style={{ marginLeft: "auto" }}>
                {UNITS.map((u) => u.title).join(" · ")}
              </span>
            </div>
          </div>
        </section>

        {/* The roster is detail. It opens when asked for and not before. */}
        <Disclosure label={`Roster · ${cohort.students.length} students`}>
          <div className={s.roster}>
            {cohort.students.map((st) => {
              const passed = Object.values(st.progress).filter((v) => v === "passed").length;
              const pct = (passed / NODES.length) * 100;
              return (
                <div key={st.id} className={s.student}>
                  <div className={s.studentTop}>
                    <span className={s.studentName}>{st.name}</span>
                    <span className={s.studentMeta}>
                      {passed}/{NODES.length}
                    </span>
                  </div>
                  <span className={s.track} aria-hidden>
                    <span
                      className={s.trackFill}
                      data-stalled={st.lastSeenDays > 3}
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </span>
                  <span className={s.studentMeta}>
                    {st.lastSeenDays === 0
                      ? "active today"
                      : `last seen ${st.lastSeenDays}d ago`}
                  </span>
                </div>
              );
            })}
          </div>
        </Disclosure>
      </main>
    </div>
  );
}
