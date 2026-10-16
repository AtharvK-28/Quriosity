"use client";

/**
 * Onboarding. A first visit meets Ket (components/onboarding/MeetKet): ninety
 * seconds operating on a qubit, skippable at every step. Then, or straight
 * away on a return visit, the mode choice below.
 *
 * Mode selection:
 *
 * One screen, three cards, no progress bar, no confirm step. The question is
 * asked once and answered in one click, and each card previews its own primary
 * surface so the choice is made by recognition rather than by reading.
 *
 * Asking rather than inferring is decision D6: inference gets this wrong often
 * enough to alienate the researcher segment on their first screen, and that is
 * an expensive place to lose someone.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/chrome/TopBar";
import { MeetKet } from "@/components/onboarding/MeetKet";
import { Registration } from "@/components/ui/primitives";
import { MODE, MODE_COPY, useSession, type Mode } from "@/stores/sessionStore";
import s from "./start.module.css";

/** Set once Ket has been met or skipped, so a return visit goes straight to the choice. */
const MET_KET = "quriosity.met-ket.v1";

export default function StartPage() {
  const router = useRouter();
  const setMode = useSession((st) => st.setMode);
  const [stage, setStage] = useState<"loading" | "intro" | "choose">("loading");

  useEffect(() => {
    let met = false;
    try {
      met = window.localStorage.getItem(MET_KET) === "1";
    } catch {
      // Storage blocked: meet Ket every time, which is harmless.
    }
    const replay = new URLSearchParams(window.location.search).has("intro");
    setStage(met && !replay ? "choose" : "intro");
  }, []);

  function metKet() {
    try {
      window.localStorage.setItem(MET_KET, "1");
    } catch {
      // Nothing to remember it in; the choice still follows.
    }
    setStage("choose");
    window.scrollTo({ top: 0 });
  }

  function choose(mode: Mode) {
    setMode(mode);
    router.push(MODE[mode].landingRoute);
  }

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />

      {stage === "intro" && <MeetKet onDone={metKet} />}

      {stage === "choose" && <main className={s.main}>
        <header className={s.head}>
          <h1 className="statement statement--s">How do you want to learn?</h1>
          <p className="prose" style={{ marginTop: "var(--s-3)" }}>
            You can change this any time — it costs you no progress.
          </p>
        </header>

        <div className={s.cards}>
          {(["guided", "workbench", "track"] as Mode[]).map((mode) => (
            <button key={mode} type="button" className={s.card} onClick={() => choose(mode)}>
              <Registration />
              <div className={s.preview}>{PREVIEWS[mode]}</div>
              <h2 className={s.cardTitle}>{MODE_COPY[mode].title}</h2>
              <p className={s.cardBlurb}>{MODE_COPY[mode].blurb}</p>
              <span className={s.cardWho}>{MODE_COPY[mode].who}</span>
            </button>
          ))}
        </div>

        <p className={s.footnote}>
          Workbench mode hides every XP counter, streak and leaderboard in the
          product, and the tutor never speaks unless you ask it to.
        </p>
        <button type="button" className={s.replay} onClick={() => setStage("intro")}>
          Meet Ket again
        </button>
      </main>}
    </div>
  );
}

/* Each card previews the surface it opens, so the choice is recognition. */
const PREVIEWS: Record<Mode, React.ReactNode> = {
  guided: (
    <span className={s.previewCircuit} aria-hidden>
      <span className={s.pwire} />
      <span className={s.pgate}>H</span>
      <span className={s.pwire} />
      <span className={s.pgate}>M</span>
      <span className={s.pwire} />
    </span>
  ),
  workbench: (
    <code className={s.previewCode} aria-hidden>
      qc.h(0)
      <br />
      qc.cx(0, 1)
    </code>
  ),
  track: (
    <span className={s.previewList} aria-hidden>
      <span>▸ Optimisation</span>
      <span>▸ Cryptography</span>
      <span>▸ Simulation</span>
    </span>
  ),
};
