"use client";

/**
 * What to do next, and why — PRD E7-S7.
 *
 * The recommendation and its evidence in one card. The reason is set as
 * ordinary prose because it is an argument the learner can check against
 * their own memory of the week, not a label.
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Registration } from "@/components/ui/primitives";
import { recommendNext, type Recommendation } from "@/lib/curriculum/recommend";
import { useSession } from "@/stores/sessionStore";
import s from "./NextUp.module.css";

const KIND_LABEL: Record<Recommendation["kind"], string> = {
  consolidate: "Consolidate first",
  revisit: "Worth revisiting",
  review: "Due for recall",
  node: "Up next",
  challenge: "Practice",
  done: "All caught up",
};

const ACTION: Record<Recommendation["kind"], string> = {
  consolidate: "Re-derive it",
  revisit: "Revisit",
  review: "Recall it",
  node: "Open",
  challenge: "Try it",
  done: "Open the bench",
};

export function NextUp({ compact = false, skipReview = false }: { compact?: boolean; skipReview?: boolean }) {
  const router = useRouter();
  const { progress, misconceptions, challenges } = useSession();
  const rec = useMemo(
    () => recommendNext({ progress, misconceptions, challenges, skipReview }),
    [progress, misconceptions, challenges, skipReview],
  );

  return (
    <section className={s.card} data-kind={rec.kind} data-compact={compact} aria-label="Recommended next">
      <Registration />
      <div className={s.text}>
        <span className="label" style={{ color: rec.kind === "node" ? "var(--measure)" : rec.kind === "done" ? undefined : "var(--flag)" }}>
          {KIND_LABEL[rec.kind]}
        </span>
        <h2 className={s.title}>{rec.title}</h2>
        <p className={s.reason}>{rec.reason}</p>
      </div>
      <div className={s.actions}>
        {rec.misconceptionId && <Chip tone="flag">{rec.misconceptionId}</Chip>}
        <Button variant="primary" onClick={() => router.push(rec.href)}>
          {ACTION[rec.kind]}
        </Button>
      </div>
    </section>
  );
}
