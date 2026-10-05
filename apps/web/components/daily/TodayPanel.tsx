"use client";

/**
 * Today — the streak, this week, three quests and the daily puzzle, on one
 * card. It sits at the top of the path and the arena, so the first thing a
 * returning learner sees is what today is worth and how little it takes.
 *
 * Mode matrix (PRD §6.3): nothing here in Workbench. Track keeps the streak
 * and the puzzle but not the XP numbers.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MODE, useSession } from "@/stores/sessionStore";
import { Ket, type KetMood } from "@/components/mascot/Ket";
import { dailyChallenge, dayKey, addDays, liveStreak, msUntilTomorrow, questsFor, questDone, ALL_QUESTS_BONUS } from "@/lib/daily";
import s from "./TodayPanel.module.css";

function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function timeLeft(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function Flame({ lit, size = 28 }: { lit: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={s.flame} data-lit={lit || undefined} aria-hidden>
      <path d="M12 2.5c.6 3.2-1.9 4.9-3.4 7C7.2 11.4 6.5 13 6.5 15a5.5 5.5 0 0 0 11 0c0-2.6-1.4-4.3-2.6-5.6.1 1.6-.6 2.8-1.7 3.3.5-3.4-.3-7.3-1.2-10.2Z" />
      <path className={s.core} d="M12 21a3 3 0 0 1-3-3c0-1.6 1.2-2.6 2-3.6.2 1 .9 1.6 1.6 1.8-.1-1 .3-1.9.9-2.6.8 1 1.5 2.2 1.5 3.9a3 3 0 0 1-3 3.5Z" />
    </svg>
  );
}

export function Snow({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={s.snow} aria-hidden>
      <path d="M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17M9 4l3 2 3-2M9 20l3-2 3 2" />
    </svg>
  );
}

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

export function TodayPanel({ variant = "compact", showPuzzle = true }: { variant?: "compact" | "full"; showPuzzle?: boolean }) {
  const session = useSession();
  const now = useNow();
  const today = dayKey(now);
  const caps = MODE[session.mode];

  const streak = liveStreak(session, today);
  const daily = session.daily.day === today ? session.daily : null;
  const quests = useMemo(() => questsFor(today), [today]);
  const puzzle = useMemo(() => dailyChallenge(today), [today]);
  const counters = daily?.counters ?? {};
  const doneCount = quests.filter((q) => questDone(q, counters)).length;

  if (!session.hydrated || !caps.streak) return null;

  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const active = new Set(session.activeDays);
  const frozen = new Set(session.frozenDays);
  const left = timeLeft(msUntilTomorrow(now));
  // Ket carries the streak: pleased when today is done, in a scarf when a
  // freeze saved yesterday, sleepy when the streak is about to go.
  const coveredYesterday = frozen.has(addDays(today, -1));
  const ketMood: KetMood = streak.doneToday
    ? daily?.puzzle || doneCount === quests.length ? "happy" : "calm"
    : coveredYesterday && streak.days > 0
      ? "cozy"
      : streak.atRisk
        ? "sleepy"
        : "curious";

  return (
    <section className={s.panel} data-variant={variant} aria-label="Today">
      <div className={s.streak}>
        <Ket mood={ketMood} size={variant === "full" ? 76 : 60} className={s.ket} />
        <div className={s.streakText}>
          <Flame lit={streak.doneToday} size={variant === "full" ? 30 : 24} />
          <span className={s.streakNum}>{streak.days}</span>
          <span className={s.streakLabel}>day streak</span>
        </div>
        <p className={s.streakNote} data-risk={streak.atRisk || undefined}>
          {streak.doneToday
            ? "Safe for today. Come back tomorrow to keep it going."
            : coveredYesterday && streak.days > 0
              ? `A freeze kept your streak warm yesterday. Do one thing today — ${left} left.`
              : streak.atRisk
              ? `Do one thing today to keep it — ${left} left.`
              : session.bestStreak > 0
                ? `Start a new one today. Your best is ${session.bestStreak}.`
                : "Pass a lesson, a challenge or the puzzle to start one."}
        </p>
        <span className={s.freezes} title="A freeze covers a missed day. You earn one every seven days of streak, and can hold two.">
          <Snow /> {session.streakFreezes} {session.streakFreezes === 1 ? "freeze" : "freezes"}
        </span>
      </div>

      <ol className={s.week} aria-label="This week">
        {week.map((d) => {
          const state = active.has(d) ? "done" : frozen.has(d) ? "frozen" : d === today ? "today" : "missed";
          return (
            <li key={d} className={s.day} data-state={state} data-today={d === today || undefined} title={d}>
              <span className={s.dot}>{state === "done" ? "✓" : state === "frozen" ? <Snow size={11} /> : ""}</span>
              <span className={s.dayName}>{WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()]}</span>
            </li>
          );
        })}
      </ol>

      {showPuzzle && <Link href="/daily" className={s.puzzle} data-done={daily?.puzzle ? true : undefined}>
        <span className={s.puzzleKicker}>Daily puzzle · new in {left}</span>
        <span className={s.puzzleTitle}>{puzzle.title}</span>
        <span className={s.puzzleCta}>
          {daily?.puzzle
            ? `Solved · ${daily.puzzle.gates} gates · ${Math.round(daily.puzzle.ms / 1000)}s`
            : "Solve it →"}
        </span>
      </Link>}

      <div className={s.quests}>
        <div className={s.questHead}>
          <span className="label">Today&apos;s quests</span>
          <span className={s.questCount}>{doneCount}/{quests.length}</span>
        </div>
        <ul className={s.questList}>
          {quests.map((q) => {
            const have = Math.min(q.goal, counters[q.metric] ?? 0);
            const done = have >= q.goal;
            return (
              <li key={q.id} className={s.quest} data-done={done || undefined}>
                <span className={s.check} aria-hidden>{done ? "✓" : ""}</span>
                <span className={s.questBody}>
                  <span className={s.questTitle}>{q.title}</span>
                  <span className={s.bar}><span style={{ width: `${(have / q.goal) * 100}%` }} /></span>
                </span>
                <span className={s.questMeta}>
                  {q.goal > 1 && <span>{have}/{q.goal}</span>}
                  {caps.motivation && <b>+{q.xp} XP</b>}
                </span>
              </li>
            );
          })}
        </ul>
        {caps.motivation && (
          <p className={s.bonus} data-done={daily?.allBonus || undefined}>
            {daily?.allBonus ? `All three done — +${ALL_QUESTS_BONUS} XP bonus earned.` : `Finish all three for +${ALL_QUESTS_BONUS} XP more.`}
          </p>
        )}
      </div>
    </section>
  );
}
