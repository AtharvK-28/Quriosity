"use client";

/**
 * The top bar.
 *
 * Navigation is mode-conditional (PRD §6.3). Every route exists in every mode;
 * what differs is what is offered. Guided sees Path, Bench and Review. Workbench
 * sees the bench and the gate reference and nothing else — no XP, no streak, no
 * leaderboard, not even as a greyed-out affordance.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { MODE, useSession } from "@/stores/sessionStore";
import s from "./TopBar.module.css";

const NAV: Record<string, Array<{ href: string; label: string }>> = {
  guided: [
    { href: "/path", label: "Path" },
    { href: "/challenges", label: "Challenges" },
    { href: "/build", label: "Bench" },
    { href: "/review", label: "Review" },
    { href: "/profile", label: "Progress" },
  ],
  // A researcher gets the bench and the reference. No path, no challenges, no
  // progress — none of it is why they opened the tab.
  workbench: [
    { href: "/build", label: "Bench" },
    { href: "/reference", label: "Gates" },
  ],
  track: [
    { href: "/path", label: "Track" },
    { href: "/challenges", label: "Challenges" },
    { href: "/build", label: "Bench" },
    { href: "/review", label: "Review" },
    { href: "/profile", label: "Progress" },
  ],
};

/** Reachable from every mode, but never worth a slot in the main run. */
const SECONDARY = [
  { href: "/teach", label: "Teach" },
  { href: "/reference", label: "Gates" },
];

export function TopBar() {
  const pathname = usePathname();
  const { mode, xp, streakDays, hydrate, hydrated, setMode } = useSession();
  const caps = MODE[mode];

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const links = NAV[mode] ?? NAV.guided;

  function cycleMode() {
    const order = ["guided", "workbench", "track"] as const;
    setMode(order[(order.indexOf(mode) + 1) % order.length]);
  }

  return (
    <header className={s.bar}>
      <Link href="/" className={s.brand}>
        <span className={s.mark} aria-hidden>
          q
        </span>
        <span className={s.wordmark}>Quriosity</span>
      </Link>

      <nav className={s.nav} aria-label="Main">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={s.link}
            data-active={pathname === l.href || pathname.startsWith(`${l.href}/`)}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <div className={s.secondary}>
        {SECONDARY.filter((l) => !links.some((m) => m.href === l.href)).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={s.link}
            data-active={pathname.startsWith(l.href)}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <div className={s.right}>
        {/* Only rendered where the mode permits. Hidden UI is not a control on
            the server, but here the whole point is that it does not exist. */}
        {hydrated && caps.streak && streakDays > 0 && (
          <span className={s.stat} title={`${streakDays} days in a row`}>
            <span className={s.statMark} aria-hidden>
              ▲
            </span>
            {streakDays}d
          </span>
        )}
        {hydrated && caps.motivation && (
          <span className={s.stat} title="Experience from nodes passed">
            {xp} xp
          </span>
        )}

        <button type="button" className={s.modeTag} onClick={cycleMode} title="Change how the app behaves">
          {mode}
        </button>
      </div>
    </header>
  );
}
