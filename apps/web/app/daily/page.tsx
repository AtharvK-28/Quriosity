"use client";

/**
 * The daily puzzle — one challenge a day, the same for everyone.
 *
 * Signed in, the server starts your clock when you open it and grades your
 * answer, so the leaderboard is fewest gates and then fastest, on the
 * server's own timing. As a guest the puzzle still counts for your streak and
 * quests; only the leaderboard needs an account.
 *
 * Solving it gives a share line in the manner of Wordle: how it went, never
 * the answer.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { ChallengeRunner } from "@/components/challenge/ChallengeRunner";
import { TutorDock } from "@/components/tutor/TutorDock";
import { TodayPanel, timeLeft } from "@/components/daily/TodayPanel";
import { Button } from "@/components/ui/primitives";
import { dailyChallenge, dayKey, liveStreak, msUntilTomorrow, shareLine } from "@/lib/daily";
import { gateCount, type Circuit } from "@/lib/ir/types";
import { useSession } from "@/stores/sessionStore";
import { api, useAuth } from "@/stores/authStore";
import { formatDate } from "@/lib/i18n";
import s from "./daily.module.css";

interface Board {
  day: string;
  solvers: number;
  top: Array<{ rank: number; name: string; gates: number; ms: number; you: boolean }>;
  you: { rank: number; gates: number; ms: number } | null;
}

const secs = (ms: number) => {
  const t = Math.round(ms / 1000);
  return t >= 60 ? `${Math.floor(t / 60)}m ${t % 60}s` : `${t}s`;
};

export default function DailyPage() {
  const session = useSession();
  const authStatus = useAuth((a) => a.status);
  const [day] = useState(() => dayKey());
  const challenge = useMemo(() => dailyChallenge(day), [day]);
  const [board, setBoard] = useState<Board | null>(null);
  const [copied, setCopied] = useState(false);
  const opened = useRef(Date.now());
  // Time-dependent, so only after mount: the server cannot know the browser's now.
  const [nextIn, setNextIn] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNextIn(timeLeft(msUntilTomorrow()));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const hydrate = useSession((st) => st.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  const loadBoard = useCallback(async () => {
    try {
      const b = authStatus === "signed-in"
        ? await api<Board>("/daily/leaderboard")
        : ((await fetch("/api/server/daily/leaderboard").then((r) => (r.ok ? r.json() : null))) as Board | null);
      if (b) setBoard(b);
    } catch {
      /* the board is a nicety */
    }
  }, [authStatus]);

  // Signed in: the server's clock starts now.
  useEffect(() => {
    if (authStatus === "unknown") return;
    if (authStatus === "signed-in") void api("/daily/start", { method: "POST" }).catch(() => {});
    void loadBoard();
  }, [authStatus, loadBoard]);

  const solved = session.daily.day === day ? session.daily.puzzle : null;
  const streak = liveStreak(session, day);

  const onResult = useCallback(
    (r: { passed: boolean; circuit: Circuit; attempts: number; assisted: boolean }) => {
      if (authStatus === "signed-in" && !r.assisted) {
        void api<{ passed: boolean }>("/daily/submit", { method: "POST", body: { ir: r.circuit } })
          .then(() => loadBoard())
          .catch(() => {});
      }
      if (!r.passed) return;
      useSession.getState().recordPuzzle({
        gates: gateCount(r.circuit),
        ms: Date.now() - opened.current,
        tries: Math.max(1, r.attempts),
        assisted: r.assisted,
      });
    },
    [authStatus, loadBoard],
  );

  async function share() {
    if (!solved) return;
    const text = `${shareLine(day, { gates: solved.gates, ms: board?.you?.ms ?? solved.ms, par: challenge.par, tries: solved.tries }, streak.days)}\n${window.location.origin}/daily`;
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* dismissed */
    }
  }

  // A fixed locale and UTC, so the server's render and the browser's agree.
  const dateLabel = formatDate(new Date(`${day}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      <header className={s.head}>
        <div>
          <span className="label">Daily puzzle · {dateLabel}</span>
          <h1 className="statement statement--s" style={{ marginTop: 6 }}>One puzzle. Everyone. Today.</h1>
        </div>
        <div className={s.next}>
          <span className={s.nextLabel}>Next puzzle in</span>
          <span className={s.nextTime}>{nextIn ?? "—"}</span>
        </div>
      </header>

      {solved && (
        <section className={s.solved} aria-live="polite">
          <div>
            <span className={s.solvedKicker}>{solved.assisted ? "Solved, with the answer shown" : "Solved"}</span>
            <p className={s.solvedLine}>
              {solved.gates} {solved.gates === 1 ? "gate" : "gates"} · {secs(board?.you?.ms ?? solved.ms)} · {solved.tries} {solved.tries === 1 ? "try" : "tries"}
              {board?.you && <> · <b>#{board.you.rank}</b> of {board.solvers}</>}
            </p>
            {streak.days > 0 && <p className={s.solvedStreak}>{streak.days}-day streak. See you tomorrow.</p>}
          </div>
          <Button variant="primary" onClick={() => void share()}>{copied ? "Copied" : "Share result"}</Button>
        </section>
      )}

      <ChallengeRunner challenge={challenge} backHref="/path" backLabel="Your path" badge="daily puzzle" onResult={onResult} />
      <TutorDock where={{ surface: "challenge", challengeId: challenge.id }} />

      <div className={s.below}>
        <section className={s.board}>
          <div className={s.boardHead}>
            <span className="label">Today&apos;s leaderboard</span>
            <span className={s.boardMeta}>{board ? `${board.solvers} solved` : ""}</span>
          </div>
          <p className={s.quiet}>Fewest gates first, then fastest — timed by the server from when you opened the puzzle.</p>
          {authStatus !== "signed-in" && (
            <p className={s.quiet}>
              <Link href="/auth/login?next=%2Fdaily">Sign in</Link> to get on the board. Your solve still counts for your streak without one.
            </p>
          )}
          {board && board.top.length === 0 && <p className={s.quiet}>Nobody has solved it yet today. First place is open.</p>}
          {board && board.top.length > 0 && (
            <ol className={s.rows}>
              {board.top.map((r) => (
                <li key={r.rank} className={s.row} data-you={r.you || undefined}>
                  <span className={s.rank}>{r.rank}</span>
                  <span className={s.name}>{r.name}{r.you ? " (you)" : ""}</span>
                  <span className={s.num}>{r.gates}g</span>
                  <span className={s.num}>{secs(r.ms)}</span>
                </li>
              ))}
              {board.you && board.you.rank > board.top.length && (
                <li className={s.row} data-you>
                  <span className={s.rank}>{board.you.rank}</span>
                  <span className={s.name}>you</span>
                  <span className={s.num}>{board.you.gates}g</span>
                  <span className={s.num}>{secs(board.you.ms)}</span>
                </li>
              )}
            </ol>
          )}
        </section>
        <TodayPanel variant="full" showPuzzle={false} />
      </div>
    </div>
  );
}
