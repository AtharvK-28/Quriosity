"use client";

/**
 * The instructor console — PRD E10, Design Doc §8.6.
 *
 * The heatmap leads and the completion table follows, because an instructor has
 * ninety seconds before class and the first thing on the screen has to be the
 * thing that changes the lecture. Everything below the fold is detail they will
 * read later or never.
 *
 * Two sources, one screen. A signed-in instructor sees their own classes,
 * read live from the server — which refuses anyone else's (PRD §6.4). Everyone
 * else sees the seeded demo cohort, and the header says it is seeded rather
 * than waiting to be asked (PRD milestone M6).
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { Button, Disclosure, Input, Readout, Registration } from "@/components/ui/primitives";
import {
  cohortFromReport, cohortSummary, misconceptionRows, nodeColumns, seedCohort,
  type Cohort, type CohortReport,
} from "@/lib/curriculum/cohort";
import { api, ApiError, useAuth } from "@/stores/authStore";
import { Assignments } from "@/components/teach/Assignments";
import { StudentAttempts } from "@/components/teach/StudentAttempts";
import { UNITS } from "@/lib/curriculum/nodes";
import { csv, downloadText } from "@/lib/download";
import { NODES } from "@/stores/sessionStore";
import s from "./teach.module.css";

/**
 * PRD E10-S6: cohort results as CSV. Names go through `csv`, which neutralises
 * formula injection (SEC9) — a roster is exactly where "=HYPERLINK(…)" turns up.
 */
function exportCohort(cohort: Cohort) {
  const header = ["student", ...NODES.map((n) => n.id), "nodes_passed", "first_attempt_correct", "last_seen_days"];
  const rows = cohort.students.map((st) => [
    st.name,
    ...NODES.map((n) => st.progress[n.id] ?? "locked"),
    Object.values(st.progress).filter((v) => v === "passed").length,
    st.firstTime.size,
    st.lastSeenDays,
  ]);
  const slug = cohort.seeded ? "seeded" : cohort.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  downloadText(`cohort-results-${slug}.csv`, csv([header, ...rows]), "text/csv");
}

/** Beliefs are stored lowercase so they read inside a sentence. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface ClassSummary {
  id: string;
  name: string;
  members: number;
  role: "instructor" | "member";
  joinCode?: string;
}

export default function TeachPage() {
  const { status, user } = useAuth();
  const teaches = status === "signed-in" && (user?.role === "instructor" || user?.role === "admin");

  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [selected, setSelected] = useState<string>("demo");
  const [live, setLive] = useState<Cohort | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const loadClasses = useCallback(async (pick?: string) => {
    try {
      const r = await api<{ cohorts: ClassSummary[] }>("/cohorts");
      const mine = r.cohorts.filter((c) => c.role === "instructor");
      setClasses(mine);
      setSelected((cur) => pick ?? (cur !== "demo" ? cur : mine[0]?.id ?? "demo"));
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : "Couldn't load your classes.");
      setClasses([]);
    }
  }, []);

  useEffect(() => {
    if (teaches) void loadClasses();
  }, [teaches, loadClasses]);

  useEffect(() => {
    if (selected === "demo") {
      setLive(null);
      return;
    }
    let cancelled = false;
    api<CohortReport>(`/cohorts/${selected}/report`)
      .then((r) => {
        if (!cancelled) {
          setLive(cohortFromReport(r));
          setProblem(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setProblem(e instanceof ApiError ? e.message : "Couldn't load that class.");
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  async function createClass(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ cohort: { id: string } }>("/cohorts", { method: "POST", body: { name: newName } });
      setNewName("");
      await loadClasses(r.cohort.id);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Couldn't create that class.");
    }
  }

  const seeded = useMemo(() => seedCohort(58), []);
  const cohort = live ?? seeded;
  const empty = !cohort.seeded && cohort.students.length === 0;

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />

      <main className={s.main}>
        {teaches ? (
          <div className={s.classBar}>
            <label className={s.classPick}>
              <span className="label">Class</span>
              <select value={selected} onChange={(e) => setSelected(e.target.value)} className={s.select}>
                {(classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.members}
                  </option>
                ))}
                <option value="demo">Demo data (seeded)</option>
              </select>
            </label>
            <form className={s.classNew} onSubmit={createClass}>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New class name" maxLength={80} />
              <Button variant="secondary" size="sm" type="submit" disabled={!newName.trim()}>
                Create class
              </Button>
            </form>
          </div>
        ) : (
          <p className={s.instructorHint}>
            Instructors see their own class here, live.{" "}
            {status === "signed-in" ? (
              "Your account is a student account."
            ) : (
              <>
                <Link href="/auth/signup?next=/teach">Sign up with your instructor code</Link> or{" "}
                <Link href="/auth/login?next=/teach">sign in</Link>.
              </>
            )}
          </p>
        )}
        {problem && (
          <p className={s.problem} role="alert">
            {problem}
          </p>
        )}

        {empty ? (
          <EmptyClass cohort={cohort} />
        ) : (
          <CohortView cohort={cohort} liveId={cohort.seeded ? undefined : selected} />
        )}
      </main>
    </div>
  );
}

function EmptyClass({ cohort }: { cohort: Cohort }) {
  return (
    <div className={s.lead}>
      <Registration />
      <span className="label">{cohort.name}</span>
      <h2 className={s.leadStatement}>No students yet.</h2>
      <p className={s.leadBody}>
        Share this code. Students enter it in Settings, under Account, and their progress appears
        here as they work.
      </p>
      <span className={s.joinCode}>{cohort.joinCode}</span>
    </div>
  );
}

function CohortView({ cohort, liveId }: { cohort: Cohort; liveId?: string }) {
  const rows = useMemo(() => misconceptionRows(cohort), [cohort]);
  const [opened, setOpened] = useState<{ id: string; name: string } | null>(null);
  const columns = useMemo(() => nodeColumns(cohort), [cohort]);
  const summary = useMemo(() => cohortSummary(cohort), [cohort]);

  const top = rows[0];
  const topPct = top ? Math.round((top.students / cohort.students.length) * 100) : 0;

  return (
    <>
        {cohort.seeded ? (
          <span className={s.seeded}>Seeded demo data · 58 students · not a real cohort</span>
        ) : (
          <span className={s.live}>
            Live · {cohort.students.length} {cohort.students.length === 1 ? "student" : "students"} · join code{" "}
            {cohort.joinCode}
          </span>
        )}

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

        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-5)", flexWrap: "wrap", marginBottom: "var(--s-5)" }}>
          <Link href="/teach/author" className="label">Author a challenge →</Link>
          <Button variant="ghost" size="sm" onClick={() => exportCohort(cohort)}>Export results as CSV</Button>
        </div>

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
              {top.students} of {cohort.students.length} students have hit this
              {top.node ? ` in “${top.node.title}”` : ""}. The rule engine caught each
              one by reading the circuit — actual attempts, not a quiz score.
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
            {rows.length === 0 && (
              <p className={s.heatEmpty}>
                Nothing caught yet. Rows appear here as the rule engine reads your students&apos; circuits.
              </p>
            )}
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

        {/* -- Assignments (live classes) — PRD E10-S4 --------------------------- */}
        {liveId && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Assignments</h2>
              <span className="label">completion from synced progress</span>
            </div>
            <Assignments cohortId={liveId} />
          </section>
        )}

        {/* -- Completion ------------------------------------------------------- */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Node completion</h2>
            <span className="label">
              {summary.stuck && summary.stuck.attempting > 0 ? `most attempting: ${summary.stuck.node.title}` : ""}
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
        <Disclosure label={`Roster · ${cohort.students.length} ${cohort.students.length === 1 ? "student" : "students"}`}>
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
                      : st.lastSeenDays >= 99
                        ? "not synced yet"
                        : `last seen ${st.lastSeenDays}d ago`}
                  </span>
                  {liveId && (
                    <button type="button" className={s.studentOpen} onClick={() => setOpened({ id: st.id, name: st.name })}>
                      Failed attempts →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Disclosure>

        {liveId && <StudentAttempts cohortId={liveId} student={opened} onClose={() => setOpened(null)} />}
    </>
  );
}
