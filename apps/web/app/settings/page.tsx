"use client";

/**
 * Settings — PRD §4 `/settings`: mode, theme, accessibility, account.
 *
 *   E1-S3  Change mode later without losing progress.
 *   §7.4   Data export and deletion available from settings (DPDP Act 2023
 *          principles: say what is kept and why, and honour deletion).
 *   §8     Analytics are pseudonymous, local, and can be switched off.
 *
 * There is no account yet, so "your data" is exactly what this browser holds,
 * and the page lists it rather than gesturing at it.
 */

import { useEffect, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { setTheme, useTheme } from "@/components/chrome/useTheme";
import { Button, Input, Readout } from "@/components/ui/primitives";
import { MODE_COPY, useSession, type Mode } from "@/stores/sessionStore";
import { useLibrary } from "@/stores/libraryStore";
import { useAuthored } from "@/stores/authoredStore";
import { analyticsEnabled, readEvents, setAnalyticsEnabled } from "@/lib/analytics";
import { downloadText } from "@/lib/download";
import p from "@/components/ui/page.module.css";

const PREFIX = "quriosity.";

export default function SettingsPage() {
  const session = useSession();
  const library = useLibrary();
  const authored = useAuthored();
  const theme = useTheme();

  const [name, setName] = useState("");
  const [events, setEvents] = useState(0);
  const [tracking, setTracking] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    session.hydrate();
    useLibrary.getState().hydrate();
    useAuthored.getState().hydrate();
    setEvents(readEvents().length);
    setTracking(analyticsEnabled());
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
              <Button variant={theme === "night" ? "primary" : "ghost"} size="sm" onClick={() => setTheme("night")}>Night</Button>
              <Button variant={theme === "day" ? "primary" : "ghost"} size="sm" onClick={() => setTheme("day")}>Day</Button>
            </div>
            <p className={p.muted}>
              Motion follows your system&apos;s reduced-motion setting: the scrubber steps
              instead of tweening, and nothing animates on its own.
            </p>
          </div>
          {saved && <p className={p.muted} role="status" style={{ marginTop: "var(--s-2)" }}>{saved}</p>}
        </section>

        {/* -- Data — §7.4 --------------------------------------------------------- */}
        <section className={p.section}>
          <div className={p.sectionHead}>
            <h2 className={p.sectionTitle}>Your data</h2>
            <span className={p.mono}>all of it is in this browser</span>
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
              There is no account, so nothing here has left this machine. Progress and
              saved circuits are kept so you can pick up where you stopped. Usage events
              — which nodes you started, how long a correction took, whether a tutor
              suggestion was taken — are kept so the platform can be judged on whether
              it teaches. They carry a random id, never your name.
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
