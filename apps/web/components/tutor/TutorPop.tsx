"use client";

/**
 * The tutor, dropping by.
 *
 * A small instrument card, built from the same parts as the rest of the
 * product: a hairline frame with registration crosses, a mono header, a
 * specimen well, one sentence. It never covers the middle of the screen,
 * never takes focus, and holds one idea per card — new words are stepped
 * through one at a time.
 *
 * Colour follows the system's rule that colour is data: the card is
 * achromatic, the kicker takes the colour of what happened (flag for a miss,
 * measure for a pass), and the accent is spent only on the next action.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { GateMark } from "@/components/circuit/GateMark";
import { Registration } from "@/components/ui/primitives";
import { TermMark } from "@/components/viz/TermMark";
import { GATES } from "@/lib/ir/gates";
import { usePop, WIN_MS, type Pop } from "@/stores/popStore";
import { useTutor } from "@/stores/tutorStore";
import s from "./TutorPop.module.css";

export function TutorPop() {
  const pop = usePop((st) => st.pop);
  const dismiss = usePop((st) => st.dismiss);
  const tutorOpen = useTutor((st) => st.open);

  // Opening the panel is the learner choosing the long form; the pop goes.
  useEffect(() => {
    if (tutorOpen) dismiss();
  }, [tutorOpen, dismiss]);

  useEffect(() => {
    if (!pop) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pop, dismiss]);

  if (!pop) return null;
  return <Card key={pop.id} pop={pop} onClose={dismiss} />;
}

const KICKER: Record<Pop["kind"], string> = {
  new: "New word",
  hint: "Hint",
  win: "Passed",
};

function Card({ pop, onClose }: { pop: Pop; onClose(): void }) {
  const [step, setStep] = useState(0);
  const terms = pop.terms ?? [];
  const gates = pop.gates ?? [];
  // A new-word pop is one card per term, then the new gates as a last card.
  const cards = pop.kind === "new" ? terms.length + (gates.length > 0 ? 1 : 0) : 1;
  const last = step >= cards - 1;
  const term = pop.kind === "new" ? terms[step] : undefined;
  const gateCard = pop.kind === "new" && !term;

  return (
    <aside
      className={s.pop}
      data-side={pop.side}
      data-kind={pop.kind}
      role={pop.kind === "hint" ? "alert" : "status"}
      aria-label="Tutor"
    >
      <Registration />

      <header className={s.head}>
        <span className={s.mark} aria-hidden>
          q
        </span>
        <span className={s.kicker}>
          <span className={s.dot} aria-hidden />
          {gateCard ? "New in your tray" : KICKER[pop.kind]}
        </span>
        <span className={s.spacer} />
        {cards > 1 && (
          <span className={s.steps} aria-label={`${step + 1} of ${cards}`}>
            {Array.from({ length: cards }, (_, i) => (
              <span key={i} className={s.step} data-on={i === step || undefined} />
            ))}
          </span>
        )}
        <button type="button" className={s.close} onClick={onClose} aria-label="Dismiss">
          ✕
        </button>
      </header>

      {/* Keyed by step, so each card settles in rather than swapping text. */}
      <div className={s.body} key={step}>
        {term && (
          <>
            {term.mark && <TermMark mark={term.mark} size={60} />}
            <div className={s.copy}>
              <p className={s.title}>{term.term}</p>
              <p className={s.text}>{term.short}</p>
            </div>
          </>
        )}

        {gateCard && (
          <ul className={s.gates}>
            {gates.map((type) => (
              <li key={type}>
                <Link href={`/reference#gate-${type}`} className={s.gateRow}>
                  <span className={s.gateGlyph} aria-hidden>
                    <GateMark spec={GATES[type]} />
                  </span>
                  <span className={s.gateText}>
                    <b>{GATES[type].name}</b>
                    <span>{GATES[type].blurb}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {pop.kind !== "new" && (
          <>
            {pop.mark && <TermMark mark={pop.mark} size={56} />}
            <div className={s.copy}>
              <p className={s.title}>{pop.title}</p>
              {pop.body && <p className={s.text}>{pop.body}</p>}
            </div>
          </>
        )}
      </div>

      {(pop.kind === "new" || pop.action) && (
        <footer className={s.foot}>
          {pop.kind === "new" && (
            <Link href={term ? `/reference#term-${term.id}` : "/reference"} className={s.link}>
              Glossary →
            </Link>
          )}
          <span className={s.spacer} />
          {pop.kind === "new" && step > 0 && (
            <button type="button" className={s.ghost} onClick={() => setStep((n) => n - 1)}>
              Back
            </button>
          )}
          {pop.kind === "new" && (
            <button
              type="button"
              className={s.primary}
              onClick={() => (last ? onClose() : setStep((n) => n + 1))}
            >
              {last ? "Got it" : "Next"}
            </button>
          )}
          {pop.action && (
            <button
              type="button"
              className={s.primary}
              onClick={() => {
                onClose();
                pop.action!.run();
              }}
            >
              {pop.action.label}
            </button>
          )}
        </footer>
      )}

      {/* A cheer closes itself; the bar says when. */}
      {pop.kind === "win" && <span className={s.timer} style={{ animationDuration: `${WIN_MS}ms` }} aria-hidden />}
    </aside>
  );
}
