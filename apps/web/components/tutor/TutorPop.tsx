"use client";

/**
 * The tutor, dropping by.
 *
 * It speaks from its corner — bottom right, where the "Ask Ket" button
 * lives — as a speech bubble with its own avatar, so a pop reads as the tutor
 * saying something rather than the app throwing a banner. One card at a time;
 * anything else waits its turn (the count shows in the header).
 *
 *   new     a flashcard: the specimen large, the word, its notation, one line.
 *           Stepped through one word at a time, with ← → as well as buttons.
 *   hint    what to look at, never the fix, and a "Why?" into the chat.
 *   win     a cheer that closes itself.
 *   reward  a quest, the streak, a rank, XP — a medallion and a number that
 *           counts up, and it closes itself.
 *
 * Colour follows the system's rule that colour is data: the card is
 * achromatic and the signal colour — flag for a miss, measure for a pass, gold
 * for a reward — marks only what happened.
 *
 * Mounted once, in the layout: rewards arrive from anywhere (the arena, the
 * review bench), and this listens for them.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { GateMark } from "@/components/circuit/GateMark";
import { Ket, type KetMood } from "@/components/mascot/Ket";
import { TermMark } from "@/components/viz/TermMark";
import { GATES } from "@/lib/ir/gates";
import { onReward } from "@/lib/rewards";
import { REWARD_MS, usePop, WIN_MS, type Pop, type RewardIcon } from "@/stores/popStore";
import { useTutor } from "@/stores/tutorStore";
import { popReward } from "./moments";
import s from "./TutorPop.module.css";

export function TutorPop() {
  const pop = usePop((st) => st.pop);
  const waiting = usePop((st) => st.queue.length);
  const dismiss = usePop((st) => st.dismiss);
  const tutorOpen = useTutor((st) => st.open);

  // Rewards are announced by the stores; this is where they become visible.
  useEffect(() => onReward(popReward), []);

  // Opening the panel is the learner choosing the long form; the pop goes.
  useEffect(() => {
    if (tutorOpen) usePop.getState().clear();
  }, [tutorOpen]);

  if (!pop) return null;
  return <Card key={pop.id} pop={pop} waiting={waiting} onClose={dismiss} />;
}

/** Ket's face for each moment: a new idea, a nudge, a pass, a reward. */
const MOOD: Record<Pop["kind"], KetMood> = { new: "curious", hint: "thinking", win: "happy", reward: "happy" };

const KICKER: Record<Pop["kind"], string> = {
  new: "New word",
  hint: "Hint",
  win: "Passed",
  reward: "Earned",
};

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || Boolean(el.closest?.('[role="application"], [role="dialog"]'));
}

function Card({ pop, waiting, onClose }: { pop: Pop; waiting: number; onClose(): void }) {
  const [step, setStep] = useState(0);
  const terms = pop.terms ?? [];
  const gates = pop.gates ?? [];
  // A new-word pop is one card per term, then the new gates as a last card.
  const cards = pop.kind === "new" ? terms.length + (gates.length > 0 ? 1 : 0) : 1;
  const last = step >= cards - 1;
  const term = pop.kind === "new" ? terms[step] : undefined;
  const gateCard = pop.kind === "new" && !term;
  const autoMs = pop.kind === "win" ? WIN_MS : pop.kind === "reward" ? REWARD_MS : 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (pop.kind !== "new" || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") { e.preventDefault(); if (last) onClose(); else setStep((n) => n + 1); }
      if (e.key === "ArrowLeft" && step > 0) { e.preventDefault(); setStep((n) => n - 1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pop.kind, last, step, onClose]);

  return (
    <aside className={s.pop} data-kind={pop.kind} role={pop.kind === "hint" ? "alert" : "status"} aria-label="Tutor">
      <div className={s.card}>
        {(pop.kind === "win" || pop.kind === "reward") && <Burst />}

        <header className={s.head}>
          <span className={s.who}>
            <span className={s.avatar} aria-hidden><Ket mood={MOOD[pop.kind]} size={36} /></span>
            <span className={s.whoText}>
              <span className={s.name}>Ket</span>
              <span className={s.kicker}>{gateCard ? "New in your tray" : KICKER[pop.kind]}{cards > 1 ? ` · ${step + 1} of ${cards}` : ""}</span>
            </span>
          </span>
          {waiting > 0 && <span className={s.more} title={`${waiting} more waiting`}>+{waiting}</span>}
          <button type="button" className={s.close} onClick={onClose} aria-label="Dismiss">✕</button>
        </header>

        {cards > 1 && (
          <div className={s.segments} aria-hidden>
            {Array.from({ length: cards }, (_, i) => (
              <span key={i} data-on={i <= step || undefined} />
            ))}
          </div>
        )}

        {/* Keyed by step, so each card settles in rather than swapping text. */}
        <div className={s.body} key={step}>
          {term && (
            <>
              <div className={s.specimen}>
                {term.mark ? <TermMark mark={term.mark} size={76} /> : <span className={s.initial}>{term.term.slice(0, 1)}</span>}
              </div>
              <div className={s.copy}>
                {term.symbol && <span className={s.symbol}>{term.symbol}</span>}
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

          {(pop.kind === "hint" || pop.kind === "win") && (
            <>
              <div className={s.specimen} data-small>
                {pop.mark ? <TermMark mark={pop.mark} size={56} /> : <Glyph kind={pop.kind} />}
              </div>
              <div className={s.copy}>
                <p className={s.title}>{pop.title}</p>
                {pop.body && <p className={s.text}>{pop.body}</p>}
              </div>
            </>
          )}

          {pop.kind === "reward" && pop.reward && (
            <>
              <Medallion icon={pop.reward.icon} up={pop.reward.up} glyph={pop.reward.glyph} />
              <div className={s.copy}>
                {pop.reward.amount && <span className={s.amount}>{pop.reward.amount}</span>}
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
            {pop.kind === "new" && cards > 1 && <span className={s.keys} aria-hidden>← →</span>}
            {pop.kind === "new" && step > 0 && (
              <button type="button" className={s.ghost} onClick={() => setStep((n) => n - 1)}>
                Back
              </button>
            )}
            {pop.kind === "new" && (
              <button type="button" className={s.primary} onClick={() => (last ? onClose() : setStep((n) => n + 1))}>
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

        {/* A cheer or a reward closes itself; the bar says when. */}
        {autoMs > 0 && <span className={s.timer} style={{ animationDuration: `${autoMs}ms` }} aria-hidden />}
      </div>
      <span className={s.tail} aria-hidden />
    </aside>
  );
}

function Glyph({ kind }: { kind: "hint" | "win" }) {
  return kind === "win" ? (
    <svg viewBox="0 0 48 48" width="44" height="44" className={s.glyph} aria-hidden>
      <circle cx="24" cy="24" r="20" />
      <path d="M15 24.5l6 6 12-13" />
    </svg>
  ) : (
    <svg viewBox="0 0 48 48" width="44" height="44" className={s.glyph} aria-hidden>
      <circle cx="21" cy="21" r="11" />
      <path d="M29 29l9 9" />
    </svg>
  );
}

function Medallion({ icon, up, glyph }: { icon: RewardIcon; up?: boolean; glyph?: string }) {
  if (icon === "badge") {
    return (
      <span className={s.medallion} data-icon="badge">
        <span className={s.badgeGlyph}>{glyph}</span>
      </span>
    );
  }
  return (
    <span className={s.medallion} data-icon={icon} data-down={up === false || undefined}>
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden>
        {icon === "streak" && (
          <path className={s.fill} d="M24 5c1.2 6.4-3.8 9.8-6.8 14-2.8 3.8-4.2 7-4.2 11a11 11 0 0 0 22 0c0-5.2-2.8-8.6-5.2-11.2.2 3.2-1.2 5.6-3.4 6.6 1-6.8-.6-14.6-2.4-20.4Z" />
        )}
        {icon === "freeze" && (
          <path className={s.stroke} d="M24 6v36M8.4 15l31.2 18M39.6 15 8.4 33M18 9l6 4 6-4M18 39l6-4 6 4" />
        )}
        {icon === "xp" && (
          <path className={s.fill} d="M24 5l5.6 11.6 12.8 1.8-9.3 9 2.2 12.7L24 34l-11.3 6.1 2.2-12.7-9.3-9 12.8-1.8Z" />
        )}
        {icon === "quest" && (
          <>
            <rect className={s.stroke} x="9" y="9" width="30" height="30" rx="4" />
            <path className={s.stroke} d="M16 24.5l5.5 5.5L33 18" />
          </>
        )}
        {icon === "rank" && (
          <>
            <polygon className={s.stroke} points="24,5 40,14 40,34 24,43 8,34 8,14" />
            <path className={s.stroke} d={up === false ? "M24 17v14M18 25l6 6 6-6" : "M24 31V17M18 23l6-6 6 6"} />
          </>
        )}
      </svg>
    </span>
  );
}

/** A small burst from the avatar. Decoration earned by an action, gone in a second. */
function Burst() {
  return (
    <span className={s.burst} aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} style={{ ["--a" as string]: `${i * 30 + (i % 2) * 11}deg`, ["--d" as string]: `${40 + (i % 3) * 18}px` }} />
      ))}
    </span>
  );
}
