"use client";

/**
 * Publish an authored challenge to a class — PRD E8-S6. The instructor picks
 * one of the classes they run; every member then finds it under Challenges.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/primitives";
import type { AuthoredChallenge } from "@/stores/authoredStore";
import { api, ApiError, useAuth } from "@/stores/authStore";
import s from "./PublishChallenge.module.css";

interface Cohort {
  id: string;
  name: string;
  role: "instructor" | "member";
}

/** The classes this account runs, fetched once per page. */
function useTaught(): Cohort[] | null {
  const status = useAuth((a) => a.status);
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  useEffect(() => {
    if (status !== "signed-in") return;
    let live = true;
    api<{ cohorts: Cohort[] }>("/cohorts")
      .then(({ cohorts }) => live && setCohorts(cohorts.filter((c) => c.role === "instructor")))
      .catch(() => live && setCohorts([]));
    return () => { live = false; };
  }, [status]);
  return cohorts;
}

export function PublishChallenge({ challenge }: { challenge: AuthoredChallenge }) {
  const status = useAuth((a) => a.status);
  const taught = useTaught();
  const [cohortId, setCohortId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (taught && taught.length > 0 && !cohortId) setCohortId(taught[0].id);
  }, [taught, cohortId]);

  if (status !== "signed-in") {
    return <Link href="/auth/login?next=%2Fteach%2Fauthor" className={s.note}>Sign in to publish</Link>;
  }
  if (taught === null) return null;
  if (taught.length === 0) {
    return <Link href="/teach" className={s.note}>Create a class to publish to</Link>;
  }

  async function publish() {
    setBusy(true);
    setMessage(null);
    const { title, brief, hint, kind, reference, allowedGates } = challenge;
    try {
      await api(`/cohorts/${cohortId}/challenges`, {
        method: "POST",
        body: { challenge: { title, brief, hint, kind, reference, allowedGates } },
      });
      setMessage({ ok: true, text: `Published to ${taught!.find((c) => c.id === cohortId)?.name ?? "the class"}.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't publish it." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={s.publish}>
      <select
        className={s.select}
        value={cohortId}
        onChange={(e) => setCohortId(e.target.value)}
        aria-label={`Class to publish “${challenge.title}” to`}
      >
        {taught.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <Button variant="secondary" size="sm" onClick={() => void publish()} disabled={busy || !cohortId}>
        {busy ? "Publishing…" : "Publish"}
      </Button>
      {message && (
        <span className={message.ok ? s.ok : s.bad} role="status">{message.text}</span>
      )}
    </span>
  );
}
