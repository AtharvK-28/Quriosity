"use client";

/**
 * Settings — PRD §4 `/settings`: mode, theme, accessibility, account.
 *
 *   E1-S3  Change mode later without losing progress.
 *   §7.4   Data export and deletion available from settings (DPDP Act 2023
 *          principles: say what is kept and why, and honour deletion).
 *   §8     Analytics are pseudonymous, local, and can be switched off.
 *
 * "Your data" is what this browser holds — plus, when signed in, the synced
 * copy the account keeps — and the page lists it rather than gesturing at it.
 */

import { useEffect, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { setTheme, useThemeChoice } from "@/components/chrome/useTheme";
import { Button, Input, Readout } from "@/components/ui/primitives";
import { MODE_COPY, useSession, type Mode } from "@/stores/sessionStore";
import { useLibrary } from "@/stores/libraryStore";
import { useAuthored } from "@/stores/authoredStore";
import { analyticsEnabled, readEvents, setAnalyticsEnabled, tutorCheckStats } from "@/lib/analytics";
import { lawName } from "@/lib/tutor/firewall";
import { downloadText } from "@/lib/download";
import { popsEnabled, setPopsEnabled } from "@/stores/popStore";
import { AccountPanel } from "@/components/account/AccountPanel";
import p from "@/components/ui/page.module.css";

const PREFIX = "quriosity.";

export default function SettingsPage() {
  const session = useSession();
  const library = useLibrary();
  const authored = useAuthored();
  const themeChoice = useThemeChoice();

  const [name, setName] = useState("");
  const [events, setEvents] = useState(0);
  const [tracking, setTracking] = useState(true);
  const [pops, setPops] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    session.hydrate();
    useLibrary.getState().hydrate();
    useAuthored.getState().hydrate();
    setEvents(readEvents().length);
    setTracking(analyticsEnabled());
    setPops(popsEnabled());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (session.hydrated) setName(session.displayName === "you" ? "" : session.displayName);
  }, [session.hydrated, session.displayName]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  if (!session.hydrated) return <div className="sheet" style={{ minHeight: "100vh" }}><TopBar /></div>;

  const passed = Object.values(session.progress).filter((x) => x.state === "passed").length;

  function exportData() {
    const dump: Record<string, unknown> = {};
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        const raw = window.localStorage.getItem(key);
        try { dump[key] = raw ? JSON.parse(raw) : raw; } catch { dump[key] = raw; }
      }
    } catch { /* storage unavailable: export what the stores hold */ }
    const body = JSON.stringify({ exported: new Date().toISOString(), note: "Everything Quriosity keeps about you in this browser.", data: dump }, null, 2);
    downloadText(`quriosity-data-${new Date().toISOString().slice(0, 10)}.json`, body, "application/json");
  }

  function deleteEverything() {
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(PREFIX)) keys.push(key);
      }
      keys.forEach((k) => window.localStorage.removeItem(k));
      const sessionKeys: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        if (key?.startsWith(PREFIX)) sessionKeys.push(key);
      }
      sessionKeys.forEach((k) => window.sessionStorage.removeItem(k));
    } catch { /* nothing more we can reach */ }
    window.location.href = "/";
  }

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      <main className={`${p.main} ${p.narrow}`}>
        <header className={p.head}>
          <div>
            <span className="label">Settings</span>
            <h1 className="statement statement--s" style={{ marginTop: 6 }}>How this works for you.</h1>
          </div>
        </header>

        {/* -- Account — E1 ----------------------------------------------------- */}
        <section className={p.section} id="account" style={{ scrollMarginTop: 84 }}>
          <div className={p.sectionHead}>
            <h2 className={p.sectionTitle}>Account</h2>
          </div>
          <AccountPanel />
        </section>

        {/* -- Mode — E1-S3 ------------------------------------------------------ */}
        <section className={p.section}>
          <div className={p.sectionHead}>
            <h2 className={p.sectionTitle}>Mode</h2>
          </div>
          <div
            className={p.grid}
            role="radiogroup"
            aria-label="Mode"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}
          >
            {(["guided", "workbench", "track"] as Mode[]).map((m) => (
              <label key={m} className={p.choice} data-on={session.mode === m}>
                <input
                  type="radio"
                  name="mode"
                  value={m}
                  checked={session.mode === m}
                  onChange={() => { session.setMode(m); setSaved(`Switched to ${MODE_COPY[m].title}.`); }}
                />
                <span className={p.choiceTitle}>{MODE_COPY[m].title}</span>
                <span className={p.muted}>{MODE_COPY[m].blurb}</span>
                <span className={p.mono}>{MODE_COPY[m].who}</span>
              </label>
            ))}
          </div>
          <p className={p.muted} style={{ marginTop: "var(--s-3)" }}>
            Changing mode changes what the interface offers from the next screen on.
            Progress, saved circuits and challenge records are untouched.
          </p>
        </section>

        {/* -- Name and theme ------------------------------------------------------ */}
        <section className={p.section}>
          <div className={p.sectionHead}>
            <h2 className={p.sectionTitle}>You</h2>
          </div>
          <div className={`${p.panel} ${p.stack}`}>
            <form
              className={p.row}
              onSubmit={(e) => { e.preventDefault(); session.setDisplayName(name.trim() || "you"); setSaved("Name saved."); }}
            >
              <label className={p.field} style={{ minWidth: "min(100%, 300px)" }}>
                <span className="label">Name on completion records</span>
                <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Only used on records you issue" />
              </label>
              <Button variant="secondary" size="sm" type="submit" style={{ alignSelf: "flex-end" }}>Save</Button>
            </form>

            <div className={p.row}>
              <span className="label">Theme</span>
              <Button variant={themeChoice === "system" ? "primary" : "ghost"} size="sm" onClick={() => setTheme("system")}>Match system</Button>
              <Button variant={themeChoice === "night" ? "primary" : "ghost"} size="sm" onClick={() => setTheme("night")}>Night</Button>
              <Button variant={themeChoice === "day" ? "primary" : "ghost"} size="sm" onClick={() => setTheme("day")}>Day</Button>
            </div>
            <label className={p.row} style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={pops}
                onChange={(e) => {
                  setPopsEnabled(e.target.checked);
                  setPops(e.target.checked);
                }}
              />
              <span>Tutor pop-ups — new words, hints and cheers during lessons</span>
            </label>
            <p className={p.muted}>
              Pop-ups never appear in Workbench mode. Motion follows your system&apos;s
              reduced-motion setting.
            </p>
          </div>
          {saved && <p className={p.muted} role="status" style={{ marginTop: "var(--s-2)" }}>{saved}</p>}
        </section>

        {/* -- Tutor checks ------------------------------------------------------------ */}
        <TutorChecks events={events} />

        {/* -- Data — §7.4 --------------------------------------------------------- */}
        <section className={p.section}>
          <div className={p.sectionHead}>
            <h2 className={p.sectionTitle}>Your data</h2>
            <span className={p.mono}>kept in this browser</span>
          </div>

          <div className={`${p.panel} ${p.stack}`}>
            <div className={p.row} style={{ gap: "var(--s-6)" }}>
              <Readout value={passed} label="nodes passed" />
              <Readout value={Object.values(session.challenges).filter((c) => c.solved).length} label="challenges solved" />
              <Readout value={library.items.length} label="saved circuits" />
              <Readout value={authored.items.length} label="authored challenges" />
              <Readout value={events} label="usage events" />
            </div>

            <p className={p.body}>
              As a guest, nothing here leaves this machine. Signed in, your progress,
              saved circuits and failed attempts are kept with your account as well, so
              they follow you to another device — and your instructor sees them if you
              join a class. Usage events — which nodes you started, how long a
              correction took, whether a tutor suggestion was taken — never leave this
              browser. They are kept so the platform can be judged on whether it
              teaches, and carry a random id, never your name.
            </p>

            <label className={p.row} style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={tracking}
                onChange={(e) => {
                  setAnalyticsEnabled(e.target.checked);
                  setTracking(e.target.checked);
                  setEvents(readEvents().length);
                }}
              />
              <span>Record usage events{tracking ? "" : " (off — the log has been cleared)"}</span>
            </label>

            <div className={p.row}>
              <Button variant="secondary" size="sm" onClick={exportData}>Download my data</Button>
              {!confirming ? (
                <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>Delete everything</Button>
              ) : (
                <span className={p.bad} role="alertdialog" aria-label="Confirm deletion">
                  This removes your progress, saved circuits, authored challenges and the
                  usage log from this browser, and cannot be undone.{" "}
                  <span className={p.row} style={{ marginTop: "var(--s-2)" }}>
                    <Button variant="danger" size="sm" onClick={deleteEverything}>Delete it all</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep it</Button>
                  </span>
                </span>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/**
 * How often the tutor's own checks overruled it here. The firewall is only
 * worth its place if it fires, so the count is shown, not just logged.
 */
function TutorChecks({ events }: { events: number }) {
  const [stats, setStats] = useState<ReturnType<typeof tutorCheckStats> | null>(null);
  useEffect(() => setStats(tutorCheckStats(readEvents())), [events]);
  if (!stats) return null;

  return (
    <section className={p.section}>
      <div className={p.sectionHead}>
        <h2 className={p.sectionTitle}>Tutor checks</h2>
        <span className={p.mono}>in this browser</span>
      </div>
      <div className={`${p.panel} ${p.stack}`}>
        <div className={p.row} style={{ gap: "var(--s-6)" }}>
          <Readout value={stats.answers} label="model answers" />
          <Readout value={stats.physics} label="stopped by the physics firewall" />
          <Readout value={stats.claim} label="stopped by the claim check" />
          <Readout value={stats.rated ? `${Math.round((stats.helpful / stats.rated) * 100)}%` : "—"} label="rated helpful" />
        </div>
        <p className={p.body}>
          Every sentence a model writes is checked twice before you see it: against
          the simulator&apos;s reading of your circuit, and against the laws of quantum
          mechanics. An answer that fails either is withdrawn and replaced with what
          is true.
          {stats.laws.length > 0 && (
            <> Caught here so far: {stats.laws.map(([law, n]) => `${lawName(law)} (${n})`).join(", ")}.</>
          )}
        </p>
      </div>
    </section>
  );
}
