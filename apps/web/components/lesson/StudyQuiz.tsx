"use client";

/**
 * The optional check after a pass.
 *
 * Three decisions worth stating, because each of them could reasonably have
 * gone the other way:
 *
 *   1. IT WRITES NOTHING TO THE SCHEDULER. The node was passed seconds ago.
 *      Letting a correct answer here grow the review interval would schedule on
 *      the strength of short-term memory, which is the precise failure spaced
 *      repetition exists to avoid. The review bench schedules; this does not.
 *   2. IT IS NOT SCORED. No mark is kept, nothing is reported, and a wrong
 *      answer costs nothing. It exists to make the learner retrieve rather than
 *      recognise — the act of answering is the whole benefit.
 *   3. IT ANSWERS IN PLACE. Every question stays on screen with its reason
 *      shown, rather than advancing. There is no next-question rhythm to fall
 *      into and nothing to complete.
 */

import { useMemo, useState } from "react";
import type { RetrievalPrompt } from "@/lib/curriculum/nodes";
import { presentPrompt } from "@/lib/curriculum/study";
import s from "./StudyQuiz.module.css";

export function StudyQuiz({ cards }: { cards: RetrievalPrompt[] }) {
  if (cards.length === 0) return null;
  return (
    <div className={s.wrap}>
      {cards.map((card, i) => (
        <Question key={card.question} card={card} ordinal={i + 1} total={cards.length} />
      ))}
    </div>
  );
}

function Question({
  card: authored,
  ordinal,
  total,
}: {
  card: RetrievalPrompt;
  ordinal: number;
  total: number;
}) {
  // Authored answer-first, rendered shuffled — see presentPrompt.
  const card = useMemo(() => presentPrompt(authored), [authored]);
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;

  return (
    <div className={s.q}>
      <span className="label">
        {ordinal} of {total}
      </span>
      <p className={s.question}>{card.question}</p>

      <div className={s.options} role="group" aria-label={card.question}>
        {card.options.map((opt, i) => (
          <button
            key={opt}
            type="button"
            className={s.option}
            disabled={answered}
            data-state={
              !answered
                ? undefined
                : i === card.answerIndex
                  ? "right"
                  : i === picked
                    ? "wrong"
                    : undefined
            }
            onClick={() => setPicked(i)}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Shown right or wrong, and never just "correct" — the reason is the
          only part of this worth reading. */}
      {answered && <p className={s.because}>{card.because}</p>}
    </div>
  );
}
