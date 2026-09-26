"use client";

/**
 * Assignments for a live class — PRD E10-S4: "Assignment appears on students'
 * paths; submissions and grades roll up automatically." The roll-up is the
 * server reading the progress students already sync, so there is nothing for
 * a student to hand in.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { CHALLENGES } from "@/lib/curriculum/challenges";
import { NODES, UNITS } from "@/lib/curriculum/nodes";
import { api, ApiError } from "@/stores/authStore";
import s from "./teach.module.css";

interface Assignment {
  id: string;
  kind: "node" | "challenge";
  itemId: string;
  title: string | null;
  dueAt: number;
  done: number;
  total: number;
}

const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export function Assignments({ cohortId }: { cohortId: string }) {
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [pick, setPick] = useState(`node:${NODES[0].id}`);
  const [due, setDue] = useState(isoDay(Date.now() + 7 * DAY));
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ assignments: Assignment[] }>(`/cohorts/${cohortId}/assignments`)
      .then((r) => setItems(r.assignments))
      .catch((e) => setProblem(e instanceof ApiError ? e.message : "Couldn't load assignments."));
  }, [cohortId]);

  useEffect(load, [load]);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    const [kind, itemId] = pick.split(":");
    // End of the chosen day, in the instructor's own time zone.
    const dueAt = new Date(`${due}T23:59:59`).getTime();
    try {
      await api(`/cohorts/${cohortId}/assignments`, { method: "POST", body: { kind, itemId, dueAt } });
      load();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Couldn't assign that.");
    }
  }

  async function remove(id: string) {
    await api(`/cohorts/${cohortId}/assignments/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  return (
    <div className={s.assignments}>
      <form className={s.assignForm} onSubmit={assign}>
        <label className={s.assignField}>
          <span className="label">Assign</span>
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={s.select}>
            {UNITS.map((u) => (
              <optgroup key={u.id} label={`Unit ${u.ordinal} · ${u.title}`}>
                {NODES.filter((n) => n.unitId === u.id).map((n) => (
                  <option key={n.id} value={`node:${n.id}`}>{n.title}</option>
                ))}
              </optgroup>
            ))}
            <optgroup label="Challenges">
              {CHALLENGES.map((c) => (
                <option key={c.id} value={`challenge:${c.id}`}>{c.title}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className={s.assignField}>
          <span className="label">Due</span>
          <input type="date" value={due} min={isoDay(Date.now())} onChange={(e) => setDue(e.target.value)} className={s.select} />
        </label>
        <Button variant="secondary" size="sm" type="submit">Assign</Button>
      </form>
      {problem && <p className={s.muted} role="alert">{problem}</p>}

      {items && items.length === 0 && <p className={s.muted}>Nothing assigned yet.</p>}
      {items && items.length > 0 && (
        <ul className={s.assignList}>
          {items.map((a) => {
            const overdue = a.dueAt < Date.now();
            const pct = a.total > 0 ? Math.round((a.done / a.total) * 100) : 0;
            return (
              <li key={a.id} className={s.assignRow}>
                <span className={s.assignTitle}>
                  {a.title ?? a.itemId}
                  <span className={s.muted}>{a.kind === "node" ? "lesson" : "challenge"}</span>
                </span>
                <span className={s.assignDue} data-overdue={overdue || undefined}>
                  {overdue ? "was due" : "due"} {new Date(a.dueAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </span>
                <span className={s.assignBar} aria-label={`${a.done} of ${a.total} done`}>
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className={s.assignCount}>{a.done}/{a.total}</span>
                <button type="button" className={s.assignRemove} onClick={() => remove(a.id)} aria-label="Remove assignment">✕</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
