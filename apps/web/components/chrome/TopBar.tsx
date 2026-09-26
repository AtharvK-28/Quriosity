"use client";

/**
 * The top bar.
 *
 * Navigation is mode-conditional (PRD §6.3). Every route exists in every mode;
 * what differs is what is offered. Guided sees Path, Bench and Review. Workbench
 * sees the bench, the docs and the glossary and nothing else — no XP, no streak,
 * no leaderboard, not even as a greyed-out affordance.
 *
 * The glossary is in every mode's main run. It used to be reachable only from
 * the tutor's gate chips, and a reference nobody can find is not one.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MODE, useSession } from "@/stores/sessionStore";
import { useAuth } from "@/stores/authStore";
import { setTheme, useTheme } from "./useTheme";
import { useOnline } from "./useOnline";
import s from "./TopBar.module.css";

const NAV: Record<string, Array<{ href: string; label: string }>> = {
  guided: [
    { href: "/path", label: "Path" },
    { href: "/challenges", label: "Challenges" },
    { href: "/arena", label: "Arena" },
    { href: "/build", label: "Bench" },
    { href: "/review", label: "Review" },
    { href: "/profile", label: "Progress" },
    { href: "/reference", label: "Glossary" },
  ],
  // A researcher gets the bench and the docs (PRD §4: "Workbench mode surfaces
  // Build, Docs, and nothing else by default"). No path, no challenges, no
  // progress — none of it is why they opened the tab.
  workbench: [
    { href: "/build", label: "Bench" },
    { href: "/docs", label: "Docs" },
    { href: "/reference", label: "Glossary" },
  ],
  // PRD §4: "Track mode surfaces Tracks, Build, Challenges."
  track: [
    { href: "/tracks", label: "Tracks" },
    { href: "/challenges", label: "Challenges" },
    { href: "/arena", label: "Arena" },
    { href: "/build", label: "Bench" },
    { href: "/review", label: "Review" },
    { href: "/profile", label: "Progress" },
    { href: "/reference", label: "Glossary" },
  ],
};

/** Reachable from every mode, but never worth a slot in the main run. */
const SECONDARY = [
  { href: "/playground", label: "Playground" },
  { href: "/teach", label: "Teach" },
  { href: "/docs", label: "Docs" },
  { href: "/settings", label: "Settings" },
];

export function TopBar() {
  const pathname = usePathname();
  const { mode, xp, streakDays, hydrate, hydrated, setMode } = useSession();
  const online = useOnline();
  const caps = MODE[mode];
  const theme = useTheme();
  const other = theme === "night" ? "day" : "night";
  const { status: authStatus, user } = useAuth();

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
        {/* Below 900px the secondary group is hidden, so its links join the
            end of the scrolling run instead of becoming unreachable. */}
        {SECONDARY.filter((l) => !links.some((m) => m.href === l.href)).map((l) => (
          <Link
            key={`narrow-${l.href}`}
            href={l.href}
            className={`${s.link} ${s.narrowOnly}`}
            data-active={pathname.startsWith(l.href)}
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

      {/* Between a phone and a wide desktop there is not room for both runs of
          links and the controls, so the secondary run folds into one menu
          rather than pushing Glossary off the end of the bar. */}
      <MoreMenu
        links={SECONDARY.filter((l) => !links.some((m) => m.href === l.href))}
        pathname={pathname}
      />

      <div className={s.right}>
        {/* Losing the network changes nothing here, so this reassures rather
            than warns: it takes the measurement colour, not the error one, and
            it names what still works. Nothing in the app is gated on it. */}
        {!online && (
          <span className={s.offline} role="status" title="The simulator, the grader and the tutor's rule engine all run on this device.">
            <span className={s.offlineMark} aria-hidden>
              ●
            </span>
            offline · still works
          </span>
        )}

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

        <button
          type="button"
          className={s.modeTag}
          onClick={() => setTheme(other)}
          aria-label={`Theme: ${theme}. Switch to ${other}.`}
          title={`Switch to ${other}`}
        >
          <span aria-hidden>{theme === "night" ? "☾" : "☀"}</span>
          <span className={s.themeName}> {theme}</span>
        </button>

        <button type="button" className={s.modeTag} onClick={cycleMode} title="Change how the app behaves">
          {mode}
        </button>

        {authStatus === "signed-in" && user && (
          <Link href="/settings#account" className={s.account} title={`Signed in as ${user.email}`}>
            <span className={s.accountMark} aria-hidden>
              {user.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className={s.accountName}>{user.displayName}</span>
          </Link>
        )}
        {authStatus === "guest" && (
          <Link href={`/auth/login?next=${encodeURIComponent(pathname)}`} className={s.signIn}>
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

function MoreMenu({ links, pathname }: { links: Array<{ href: string; label: string }>; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (links.length === 0) return null;
  const active = links.some((l) => pathname.startsWith(l.href));

  return (
    <div className={s.more} ref={ref}>
      <button
        type="button"
        className={s.link}
        data-active={active}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Other pages"
        onClick={() => setOpen((o) => !o)}
      >
        More ▾
      </button>
      {open && (
        <div className={s.moreMenu} role="menu">
          {links.map((l) => (
            <Link key={l.href} href={l.href} role="menuitem" className={s.moreItem} data-active={pathname.startsWith(l.href)}>
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
