"use client";

/**
 * Meet Ket: the first ninety seconds, spent operating on a qubit instead of
 * reading about one.
 *
 * Six scenes. You drag gates onto Ket, and its antenna swings along the real
 * rotation each gate performs (lib/ket/bloch.ts, checked against the
 * simulator), leaving the path it took as a dotted trail. You poke it to look,
 * and it collapses by the Born rule. Ten of it are prepared (prepared, not
 * copied: a qubit cannot be cloned) and looked at together, so the odds show.
 * Then the one thing a coin cannot do: H twice brings Ket home every time.
 * That is Unit 0's claim, felt before it is taught.
 *
 * Every scene can be skipped, gates can be dragged, clicked or typed (X, H),
 * and Space looks. With reduced motion nothing animates: each step lands at
 * once, trail included.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { GateTray } from "@/components/circuit/GateTray";
import { SoundToggle } from "@/components/arena/Game";
import { Ket, type KetMood } from "@/components/mascot/Ket";
import { along, applyGate, KET_GATES, measure, ZERO, type KetGate, type Vec3 } from "@/lib/ket/bloch";
import { play } from "@/lib/arena/sfx";
import { useDrag } from "@/stores/dragStore";
import s from "./MeetKet.module.css";

type Scene = "hello" | "flip" | "lean" | "look" | "ten" | "twist";
const SCENES: Scene[] = ["hello", "flip", "lean", "look", "ten", "twist"];
const SCENE_NAME: Record<Scene, string> = {
  hello: "Hello", flip: "Flip", lean: "Lean", look: "Look", ten: "Ten of me", twist: "The twist",
};

type Phase =
  | "hello"
  | "flip:wait" | "flip:done"
  | "lean:back" | "lean:wait" | "lean:done"
  | "look:wait" | "look:done"
  | "ten:ready" | "ten:done"
  | "twist:wait" | "twist:back" | "twist:done";

const ONE: Vec3 = [0, 0, -1];
const PLUS = applyGate(ZERO, "h");

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function coin(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

/** Ket's antenna, moved along the rotation a gate really is. */
function useKetMotion(initial: Vec3) {
  const [v, setV] = useState<Vec3>(initial);
  const [trail, setTrail] = useState<Vec3[]>([]);
  const vRef = useRef<Vec3>(initial);

  const run = useCallback((gate: KetGate) => new Promise<void>((resolve) => {
    const from = vRef.current;
    const end = applyGate(from, gate);
    const dur = reducedMotion() ? 0 : 420 + (480 * Math.abs(KET_GATES[gate].angle)) / Math.PI;
    const pts: Vec3[] = [from];
    const t0 = performance.now();
    const step = (now: number) => {
      const t = dur === 0 ? 1 : Math.min(1, (now - t0) / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const cur = t >= 1 ? end : along(from, gate, e);
      if (dur === 0) for (let i = 1; i <= 24; i++) pts.push(along(from, gate, i / 24));
      else pts.push(cur);
      vRef.current = cur;
      setV(cur);
      setTrail([...pts]);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  }), []);

  const jump = useCallback((to: Vec3) => {
    vRef.current = to;
    setV(to);
    setTrail([]);
  }, []);

  return { v, trail, run, jump };
}

export function MeetKet({ onDone }: { onDone(): void }) {
  const [phase, setPhase] = useState<Phase>("hello");
  const [busy, setBusy] = useState(false);
  const [bit, setBit] = useState<0 | 1 | null>(null);
  const [ten, setTen] = useState<Array<{ v: Vec3; bit: 0 | 1 | null }>>([]);
  const [burst, setBurst] = useState(false);
  const ket = useKetMotion(ZERO);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useDrag((st) => st.drag);

  const scene = phase.split(":")[0] as Scene;
  const allowed: KetGate[] =
    phase === "flip:wait" || phase === "lean:back" ? ["x"]
      : phase === "lean:wait" || phase === "twist:wait" ? ["h"]
        : [];

  /* -- Gates ----------------------------------------------------------------- */

  const apply = useCallback(async (gate: KetGate) => {
    if (busy || !allowed.includes(gate)) return;
    setBusy(true);
    play("run");
    await ket.run(gate);
    setBusy(false);
    setPhase((p) =>
      p === "flip:wait" ? "flip:done"
        : p === "lean:back" ? "lean:wait"
          : p === "lean:wait" ? "lean:done"
            : p === "twist:wait" ? "twist:back"
              : p,
    );
  }, [busy, allowed, ket]);

  // Ket is a drop target for the tray while a gate is wanted.
  useEffect(() => {
    if (allowed.length === 0) return;
    return useDrag.getState().register((type, x, y) => {
      const r = stageRef.current?.getBoundingClientRect();
      if (!r) return false;
      const pad = 40;
      if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) return false;
      void apply(type as KetGate);
      return true;
    });
  }, [allowed.length, apply]);

  /* -- Looking --------------------------------------------------------------- */

  const look = useCallback(() => {
    if (phase !== "look:wait" || busy) return;
    const m = measure(ket.v, coin());
    play("tick");
    ket.jump(m.after);
    setBit(m.bit);
    setPhase("look:done");
  }, [phase, busy, ket]);

  const lookTen = useCallback(() => {
    if (busy) return;
    setBusy(true);
    const gap = reducedMotion() ? 0 : 110;
    ten.forEach((k, i) => {
      window.setTimeout(() => {
        const m = measure(k.v, coin());
        if (i % 2 === 0) play("tick");
        setTen((all) => all.map((x, j) => (j === i ? { v: m.after, bit: m.bit } : x)));
        if (i === ten.length - 1) {
          setBusy(false);
          setPhase((p) => (p === "ten:ready" ? "ten:done" : "twist:done"));
          if (phase === "twist:back") {
            setBurst(true);
            play("win");
          }
        }
      }, i * gap);
    });
  }, [busy, ten, phase]);

  /* -- Scene changes ----------------------------------------------------------- */

  const next = useCallback(() => {
    switch (phase) {
      case "hello":
        setPhase("flip:wait");
        return;
      case "flip:done":
        setPhase("lean:back");
        return;
      case "lean:done":
        setPhase("look:wait");
        return;
      case "look:done":
        // Ten fresh qubits, each taken through |0⟩ then H: prepared, not copied.
        setTen(Array.from({ length: 10 }, () => ({ v: PLUS, bit: null })));
        setPhase("ten:ready");
        return;
      case "ten:done":
        ket.jump(PLUS);
        setTen([]);
        setPhase("twist:wait");
        return;
      case "twist:back":
        return;
      case "twist:done":
        onDone();
        return;
    }
  }, [phase, ket, onDone]);

  // The twist's ten are prepared the way Ket just was: H, then H.
  useEffect(() => {
    if (phase === "twist:back") setTen(Array.from({ length: 10 }, () => ({ v: applyGate(PLUS, "h"), bit: null })));
  }, [phase]);

  /* -- Keyboard -------------------------------------------------------------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "x" || k === "h") {
        e.preventDefault();
        void apply(k);
      } else if (e.key === " " && phase === "look:wait") {
        e.preventDefault();
        look();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, look, phase]);

  /* -- What Ket says ------------------------------------------------------------ */

  const counts = useMemo(() => {
    const zeros = ten.filter((k) => k.bit === 0).length;
    return { zeros, ones: ten.filter((k) => k.bit === 1).length };
  }, [ten]);

  const line = LINES[phase](bit, counts);
  const mood: KetMood =
    phase === "twist:done" ? "happy"
      : dragging && allowed.length > 0 ? "curious"
        : phase === "look:wait" ? "curious"
          : phase === "ten:done" || phase === "lean:done" ? "thinking"
            : "calm";

  const action = ACTIONS[phase];

  return (
    <section className={s.stage} aria-label="Meet Ket">
      <div className={s.sky} aria-hidden />

      <header className={s.top}>
        <ol className={s.map} aria-label="Intro progress">
          {SCENES.map((sc, i) => {
            const at = SCENES.indexOf(scene);
            return (
              <li key={sc} data-state={i < at ? "done" : i === at ? "now" : "next"}>
                <span className={s.star} />
                <span className={s.starName}>{SCENE_NAME[sc]}</span>
              </li>
            );
          })}
        </ol>
        <div className={s.topRight}>
          <SoundToggle />
          <button type="button" className={s.skip} onClick={onDone}>
            Skip the intro →
          </button>
        </div>
      </header>

      <div className={s.scene}>
        <div
          ref={stageRef}
          className={s.ketStage}
          data-target={allowed.length > 0 || undefined}
          data-over={(dragging && allowed.length > 0) || undefined}
          data-pokeable={phase === "look:wait" || undefined}
          onClick={phase === "look:wait" ? look : undefined}
          role={phase === "look:wait" ? "button" : undefined}
          tabIndex={phase === "look:wait" ? 0 : undefined}
          aria-label={phase === "look:wait" ? "Look at Ket" : undefined}
          onKeyDown={(e) => { if (phase === "look:wait" && e.key === "Enter") look(); }}
        >
          <div className={s.orbit} aria-hidden />
          <Ket
            key={phase === "hello" ? "hello" : "ket"}
            vector={ket.v}
            trail={ket.trail}
            mood={mood}
            size={220}
            className={phase === "hello" ? s.arrive : undefined}
            title={`Ket, ${describe(ket.v)}`}
          />
          {phase === "look:done" && bit !== null && <span className={s.said} data-bit={bit}>{bit}</span>}
          {burst && <Burst />}
        </div>

        <div className={s.talk}>
          <p className={s.bubble} role="status" aria-live="polite" key={phase}>
            {line}
          </p>

          {allowed.length > 0 && (
            <div className={s.tray}>
              <GateTray available={allowed} onPick={(t) => void apply(t as KetGate)} />
              <span className={s.trayHint}>
                Drag it onto Ket, click it, or press {allowed[0].toUpperCase()}
              </span>
            </div>
          )}

          <div className={s.actions}>
            {phase === "look:wait" && (
              <Button variant="primary" size="lg" onClick={look}>Look at Ket</Button>
            )}
            {(phase === "ten:ready" || phase === "twist:back") && (
              <Button variant="primary" size="lg" onClick={lookTen} disabled={busy || ten.some((k) => k.bit !== null)}>
                Look at all ten
              </Button>
            )}
            {action && (
              <Button variant="primary" size="lg" onClick={next} disabled={busy}>
                {action}
              </Button>
            )}
            {phase === "hello" && (
              <button type="button" className={s.skipInline} onClick={onDone}>
                I know quantum, skip this
              </button>
            )}
          </div>
        </div>
      </div>

      {ten.length > 0 && (
        <div className={s.ten} aria-label="Ten of Ket">
          {ten.map((k, i) => (
            <div key={i} className={s.mini} data-bit={k.bit ?? undefined} style={{ ["--i" as string]: i }}>
              <Ket vector={k.v} mood={k.bit === null ? "calm" : phase === "twist:done" ? "happy" : "curious"} size={58} />
              <span className={s.miniBit}>{k.bit ?? "?"}</span>
            </div>
          ))}
          {(phase === "ten:done" || phase === "twist:done") && (
            <p className={s.tally}>
              <b>{counts.zeros}</b> said 0 · <b>{counts.ones}</b> said 1
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Ket's words for each moment. Short, and never more than the physics says. */
const LINES: Record<Phase, (bit: 0 | 1 | null, c: { zeros: number; ones: number }) => string> = {
  hello: () => "Hi, I'm Ket. I'm a qubit: the thing a quantum computer is made of. Want to see what I can do?",
  "flip:wait": () => "Right now I'm |0⟩. My antenna points up. Drag the X gate onto me.",
  "flip:done": () => "Now I'm |1⟩, antenna down. X flips me, like turning over a coin. Nothing strange yet.",
  "lean:back": () => "Flip me back to |0⟩ with X first.",
  "lean:wait": () => "Now drag H onto me. This is where a coin can't follow.",
  "lean:done": () => "I'm |+⟩: halfway round, between 0 and 1. And not secretly one of them, either.",
  "look:wait": () => "Poke me to look. Looking makes me choose.",
  "look:done": (bit) =>
    `I said ${bit}, and now I'm |${bit}⟩ for good: looking changed me. One look tells you almost nothing about how I leaned.`,
  "ten:ready": () =>
    "Here are ten of me, each made fresh the same way: |0⟩, then H. (A qubit can't be copied, so each one is prepared.)",
  "ten:done": (_, c) =>
    `${c.zeros} said 0 and ${c.ones} said 1. About half and half, and a different split every time. So far I look like a coin toss.`,
  "twist:wait": () => "Here's a fresh me, already given one H. Now give me a second H.",
  "twist:back": () => "Back to |0⟩, antenna up. Toss a coin twice and it's still random. Let's look at ten of me, each given H twice.",
  "twist:done": (_, c) =>
    c.zeros === 10
      ? "All ten said 0. Every time. The two H's interfere, and the ways to reach 1 cancel out. That's why a qubit is not a coin."
      : "All ten came back. The two H's interfere, and the ways to reach 1 cancel out. That's why a qubit is not a coin.",
};

const ACTIONS: Partial<Record<Phase, string>> = {
  hello: "Hi, Ket",
  "flip:done": "Go on",
  "lean:done": "Go on",
  "look:done": "Prepare ten of me",
  "ten:done": "One more thing",
  "twist:done": "Start learning →",
};

function describe(v: Vec3): string {
  if (v[2] > 0.999) return "antenna up, state |0⟩";
  if (v[2] < -0.999) return "antenna down, state |1⟩";
  if (v[0] > 0.999) return "antenna out to the side, state |+⟩";
  return "antenna moving";
}

/** A one-shot burst when the twist lands. */
function Burst() {
  return (
    <span className={s.burst} aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <i key={i} style={{ ["--a" as string]: `${(i * 360) / 18}deg`, ["--d" as string]: `${70 + (i % 3) * 28}px` }} />
      ))}
    </span>
  );
}
