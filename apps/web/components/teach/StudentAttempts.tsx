"use client";

/**
 * One student's recent failed runs — PRD E10-S5: "a read-only view of the IR,
 * the result, and the diagnosis issued". What the instructor sees is what the
 * learner saw: the circuit as submitted, its fidelity, and the rule engine's
 * sentence.
 */

import { useEffect, useState } from "react";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { Chip } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/Dialog";
import { CHALLENGES_BY_ID } from "@/lib/curriculum/challenges";
import { NODES_BY_ID } from "@/lib/curriculum/nodes";
import type { Circuit } from "@/lib/ir/types";
import { api, ApiError } from "@/stores/authStore";
import s from "./teach.module.css";

interface Attempt {
  id: string;
  place: string;
  ir: Circuit;
  fidelity: number;
  ruleId: string | null;
  misconceptionId: string | null;
  message: string | null;
  at: number;
}

function placeTitle(place: string): string {
  const [kind, id] = place.split(":");
  if (kind === "lesson") return NODES_BY_ID.get(id)?.title ?? id;
  return CHALLENGES_BY_ID.get(id)?.title ?? id;
}

function ago(at: number): string {
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function StudentAttempts({
  cohortId,
  student,
  onClose,
}: {
  cohortId: string;
  student: { id: string; name: string } | null;
  onClose(): void;
}) {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!student) return;
    setAttempts(null);
    setProblem(null);
    api<{ attempts: Attempt[] }>(`/cohorts/${cohortId}/students/${student.id}/attempts`)
      .then((r) => setAttempts(r.attempts))
      .catch((e) => setProblem(e instanceof ApiError ? e.message : "Couldn't load their attempts."));
  }, [cohortId, student]);

  return (
    <Dialog open={student !== null} title={student ? `${student.name} · failed attempts` : ""} onClose={onClose} wide>
      {problem && <p className={s.muted}>{problem}</p>}
      {!problem && attempts === null && <p className={s.muted}>Loading…</p>}
      {attempts && attempts.length === 0 && (
        <p className={s.muted}>No failed runs yet — or none since they joined an account.</p>
      )}
      {attempts && attempts.length > 0 && (
        <ol className={s.attempts}>
          {attempts.map((a) => (
            <li key={a.id} className={s.attempt}>
              <div className={s.attemptHead}>
                <b>{placeTitle(a.place)}</b>
                <Chip tone="error" dot>fidelity {a.fidelity.toFixed(3)}</Chip>
                {a.misconceptionId && <span className="label">{a.misconceptionId}</span>}
                <span className={s.muted}>{ago(a.at)}</span>
              </div>
              <div className={s.attemptCircuit}>
                <CircuitCanvas circuit={a.ir} minColumns={3} readOnly />
              </div>
              <p className={s.attemptMessage}>
                {a.message ?? "No specific diagnosis — the state was simply not the target."}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}
