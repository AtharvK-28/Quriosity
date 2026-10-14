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
import { formatCount, t, type MessageKey } from "@/lib/i18n";
import { dayKey, liveStreak } from "@/lib/daily";
import s from "./TopBar.module.css";

type NavLink = { href: string; label: string };
const link = (href: string, key: MessageKey): NavLink => ({ href, label: t(key) });

const NAV: Record<string, NavLink[]> = {
  guided: [
    link("/path", "nav.path"),
    link("/challenges", "nav.challenges"),
    link("/arena", "nav.arena"),
    link("/build", "nav.bench"),
    link("/review", "nav.review"),
    link("/profile", "nav.progress"),
    link("/reference", "nav.glossary"),
  ],
  // A researcher gets the bench and the docs (PRD §4: "Workbench mode surfaces
  // Build, Docs, and nothing else by default"). No path, no challenges, no
  // progress — none of it is why they opened the tab.
  workbench: [link("/build", "nav.bench"), link("/docs", "nav.docs"), link("/reference", "nav.glossary")],
  // PRD §4: "Track mode surfaces Tracks, Build, Challenges."
  track: [
    link("/tracks", "nav.tracks"),
    link("/challenges", "nav.challenges"),
    link("/arena", "nav.arena"),
    link("/build", "nav.bench"),
    link("/review", "nav.review"),
    link("/profile", "nav.progress"),
    link("/reference", "nav.glossary"),
  ],
};

/** Reachable from every mode, but never worth a slot in the main run. */
const SECONDARY: NavLink[] = [
  link("/playground", "nav.playground"),
  link("/teach", "nav.teach"),
  link("/docs", "nav.docs"),
  link("/settings", "nav.settings"),
];

export function TopBar() {
  const pathname = usePathname();
  const session = useSession();
  const { mode, xp, hydrate, hydrated, setMode } = session;
  const live = liveStreak(session);
  const puzzleDone = session.daily.day === dayKey() && session.daily.puzzle !== null;
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

      <nav className={s.nav} aria-label={t("nav.main")}>
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
          <span className={s.offline} role="status" title={t("topbar.offlineTitle")}>
            <span className={s.offlineMark} aria-hidden>
              ●
            </span>
            {t("topbar.offline")}
          </span>
        )}

        {/* Only rendered where the mode permits. Hidden UI is not a control on
            the server, but here the whole point is that it does not exist. */}
        {/* The streak is the way back in: it links to today, and says when
            today still needs doing. */}
        {hydrated && caps.streak && (
          <Link
            href="/daily"
            className={s.streak}
            data-state={live.doneToday ? "done" : live.atRisk ? "risk" : "idle"}
            title={live.doneToday ? t("topbar.streakDone", { days: live.days }) : live.atRisk ? t("topbar.streakRisk", { days: live.days }) : t("topbar.streakStart")}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden className={s.streakFlame}>
              <path d="M12 2.5c.6 3.2-1.9 4.9-3.4 7C7.2 11.4 6.5 13 6.5 15a5.5 5.5 0 0 0 11 0c0-2.6-1.4-4.3-2.6-5.6.1 1.6-.6 2.8-1.7 3.3.5-3.4-.3-7.3-1.2-10.2Z" />
            </svg>
            {live.days}
            {!puzzleDone && <span className={s.streakDot} aria-label={t("topbar.puzzleWaiting")} />}
          </Link>
        )}
        {hydrated && caps.motivation && (
          <span className={s.stat} title={t("topbar.xpTitle")}>
            {t("topbar.xp", { xp: formatCount(xp) })}
          </span>
        )}

        <button
          type="button"
          className={s.modeTag}
          onClick={() => setTheme(other)}
          aria-label={t("topbar.themeLabel", { theme, other })}
          title={t("topbar.themeTitle", { other })}
        >
          <span aria-hidden>{theme === "night" ? "☾" : "☀"}</span>
          <span className={s.themeName}> {theme}</span>
        </button>

        <button type="button" className={s.modeTag} onClick={cycleMode} title={t("topbar.modeTitle")}>
          {mode}
        </button>

        {authStatus === "signed-in" && user && (
          <Link href="/settings#account" className={s.account} title={t("topbar.signedInAs", { email: user.email })}>
            <span className={s.accountMark} aria-hidden>
              {user.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className={s.accountName}>{user.displayName}</span>
          </Link>
        )}
        {authStatus === "guest" && (
          <Link href={`/auth/login?next=${encodeURIComponent(pathname)}`} className={s.signIn}>
            {t("topbar.signIn")}
          </Link>
        )}
      </div>
    </header>
  );
}

function MoreMenu({ links, pathname }: { links: NavLink[]; pathname: string }) {
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
        aria-label={t("nav.otherPages")}
        onClick={() => setOpen((o) => !o)}
      >
        {t("nav.more")} ▾
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
