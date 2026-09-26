"use client";

/**
 * What a learner's classes have set them — PRD E10-S4: "Assignment appears on
 * students' paths." Status is read from this browser's own progress, the same
 * progress the server rolls up for the instructor, so the two always agree.
 * Renders nothing for guests or anyone with nothing assigned.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Registration } from "@/components/ui/primitives";
import { api, useAuth } from "@/stores/authStore";
import { useSession } from "@/stores/sessionStore";
import s from "./Assigned.module.css";

interface Assignment {
  id: string;
  kind: "node" | "challenge";
  itemId: string;
  title: string | null;
  dueAt: number;
  cohort: string;
}

const DAY = 86_400_000;

function when(dueAt: number): { text: string; late: boolean } {
  const days = Math.ceil((dueAt - Date.now()) / DAY);
  if (days < 0) return { text: `was due ${-days}d ago`, late: true };
  if (days === 0) return { text: "due today", late: false };
  if (days === 1) return { text: "due tomorrow", late: false };
  return { text: `due in ${days} days`, late: false };
}

export function Assigned() {
  const status = useAuth((st) => st.status);
  const { progress, challenges } = useSession();
  const [items, setItems] = useState<Assignment[] | null>(null);

  useEffect(() => {
    if (status !== "signed-in") {
      setItems(null);
      return;
    }
    api<{ assignments: Assignment[] }>("/me/assignments")
      .then((r) => setItems(r.assignments))
      .catch(() => setItems(null));
  }, [status]);

  if (!items || items.length === 0) return null;

  const done = (a: Assignment) =>
    a.kind === "node" ? progress[a.itemId]?.state === "passed" : Boolean(challenges[a.itemId]?.solved);
  // Outstanding first, soonest due first; finished work sinks to the bottom.
  const sorted = [...items].sort((a, b) => Number(done(a)) - Number(done(b)) || a.dueAt - b.dueAt);
  const open = sorted.filter((a) => !done(a)).length;

  return (
    <section className={s.card} aria-label="Assigned to you">
      <Registration />
      <div className={s.head}>
        <span className="label">Assigned to you</span>
        <span className="label">{open === 0 ? "all done" : `${open} to do`}</span>
      </div>
      <ul className={s.list}>
        {sorted.map((a) => {
          const isDone = done(a);
          const w = when(a.dueAt);
          const href = a.kind === "node" ? `/lesson/${a.itemId}` : `/challenges/${a.itemId}`;
          return (
            <li key={a.id} className={s.row} data-done={isDone || undefined}>
              <span className={s.mark} aria-hidden>{isDone ? "✓" : a.kind === "node" ? "▸" : "◆"}</span>
              <Link href={href} className={s.title}>{a.title ?? a.itemId}</Link>
              <span className={s.meta}>{a.cohort}</span>
              <span className={s.due} data-late={!isDone && w.late ? true : undefined}>
                {isDone ? "done" : w.text}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
