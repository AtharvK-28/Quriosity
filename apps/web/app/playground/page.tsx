"use client";

/**
 * The qubit playground — one qubit, no circuit.
 *
 * Ported from the team prototype's playground: θ and φ place the state, gates
 * move it, Measure collapses it. Three changes. The sphere is the real one
 * (the same component as the bench, 3D where WebGL2 exists). Gates are the
 * registry's own matrices, not hand-written rotations. And measuring is
 * repeatable: "Measure 100 copies" prepares the state afresh each time, so a
 * probability is seen turning into counts — which a single collapse cannot
 * show — while measuring a collapsed state again shows it stays collapsed.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { Button, Slider } from "@/components/ui/primitives";
import { BlochSphere } from "@/components/viz/BlochSphere";
import { GATES, type Mat2 } from "@/lib/ir/gates";
import type { GateType } from "@/lib/ir/types";
import type { QubitState } from "@/lib/sim/analysis";
import s from "./playground.module.css";

/** [re α, im α, re β, im β] for α|0⟩ + β|1⟩. */
type Amps = [number, number, number, number];
interface Angles { theta: number; phi: number }

const DEG = Math.PI / 180;
const PLAY_GATES: GateType[] = ["x", "y", "z", "h", "s", "t"];

function fromAngles({ theta, phi }: Angles): Amps {
  const half = (theta * DEG) / 2;
  return [Math.cos(half), 0, Math.sin(half) * Math.cos(phi * DEG), Math.sin(half) * Math.sin(phi * DEG)];
}

/** Snap float dust (89.99999°) back to the whole degree it obviously is. */
function tidy(v: number): number {
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-6 ? r : v;
}

/** Back to (θ, φ), after dropping the global phase nobody could measure. */
function toAngles([ar, ai, br, bi]: Amps): Angles {
  const ma = Math.hypot(ar, ai);
  const mb = Math.hypot(br, bi);
  const theta = tidy((2 * Math.atan2(mb, ma)) / DEG);
  if (ma < 1e-9 || mb < 1e-9) return { theta, phi: 0 };
  const phi = tidy((((Math.atan2(bi, br) - Math.atan2(ai, ar)) / DEG) % 360 + 360) % 360) % 360;
  return { theta, phi };
}

/** The registry stores 2x2 matrices as [re00, im00, re01, im01, re10, im10, re11, im11]. */
function applyMatrix(m: Mat2, [ar, ai, br, bi]: Amps): Amps {
  return [
    m[0] * ar - m[1] * ai + m[2] * br - m[3] * bi,
    m[0] * ai + m[1] * ar + m[2] * bi + m[3] * br,
    m[4] * ar - m[5] * ai + m[6] * br - m[7] * bi,
    m[4] * ai + m[5] * ar + m[6] * bi + m[7] * br,
  ];
}

function p0Of({ theta }: Angles): number {
  return Math.cos((theta * DEG) / 2) ** 2;
}

const isSuperposition = (a: Angles) => {
  const p = p0Of(a);
  return p > 1e-6 && p < 1 - 1e-6;
};

export default function PlaygroundPage() {
  const [prep, setPrep] = useState<Angles>({ theta: 0, phi: 0 });
  const [collapsed, setCollapsed] = useState<0 | 1 | null>(null);
  const [again, setAgain] = useState(0);
  const [counts, setCounts] = useState<[number, number]>([0, 0]);
  const [recent, setRecent] = useState<Array<0 | 1>>([]);

  const shown: Angles = collapsed === null ? prep : { theta: collapsed ? 180 : 0, phi: 0 };
  const p0 = p0Of(shown);

  const qubit: QubitState = useMemo(() => {
    const [ar, ai, br, bi] = fromAngles(shown);
    return {
      qubit: 0,
      x: 2 * (ar * br + ai * bi),
      y: 2 * (ar * bi - ai * br),
      z: ar * ar + ai * ai - br * br - bi * bi,
      purity: 1,
      radius: 1,
      entropy: 0,
      entangled: false,
      p1: br * br + bi * bi,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.theta, shown.phi]);

  /** A new state means new statistics: the tally only ever describes one. */
  function prepare(next: Angles) {
    setPrep(next);
    setCollapsed(null);
    setAgain(0);
    setCounts([0, 0]);
    setRecent([]);
  }

  function applyGate(type: GateType) {
    const base = GATES[type].base;
    if (!base) return;
    prepare(toAngles(applyMatrix(base([]), fromAngles(shown))));
  }

  function record(outcomes: Array<0 | 1>) {
    const ones = outcomes.reduce<number>((n, o) => n + o, 0);
    setCounts(([z, o]) => [z + outcomes.length - ones, o + ones]);
    setRecent((r) => [...r, ...outcomes].slice(-60));
  }

  function measureOnce() {
    if (collapsed !== null) {
      setAgain((n) => n + 1);
      return;
    }
    const outcome: 0 | 1 = Math.random() < p0Of(prep) ? 0 : 1;
    setCollapsed(outcome);
    record([outcome]);
  }

  function measureCopies(n: number) {
    const p = p0Of(prep);
    record(Array.from({ length: n }, () => (Math.random() < p ? 0 : 1) as 0 | 1));
  }

  const total = counts[0] + counts[1];
  const [ar, , br, bi] = fromAngles(shown);
  const beta = Math.hypot(br, bi);

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />

      <main className={s.main}>
        <header className={s.head}>
          <span className="label">Playground · one qubit</span>
          <h1 className="statement statement--s">Put a qubit anywhere. Then look at it.</h1>
          <p className="prose prose--tight">
            Tilt it with θ, turn its phase with φ, or push it with a gate. Measuring gives a
            plain 0 or 1 — weighted by where you left it, and final once it has happened.
          </p>
        </header>

        <div className={s.grid}>
          <section className={s.panel} aria-label="Prepare the state">
            <div className={s.section}>
              <span className="label">Prepare</span>
              <div className={s.sliderRow}>
                <span className={s.sliderLabel}>θ — tilt away from |0⟩</span>
                <span className={s.sliderValue}>{Math.round(shown.theta)}°</span>
                <Slider
                  value={shown.theta}
                  min={0}
                  max={180}
                  step={1}
                  ariaLabel="Theta, the tilt away from zero, in degrees"
                  onChange={(theta) => prepare({ theta, phi: shown.phi })}
                />
              </div>
              <div className={s.sliderRow}>
                <span className={s.sliderLabel}>φ — phase</span>
                <span className={s.sliderValue}>{Math.round(shown.phi)}°</span>
                <Slider
                  value={shown.phi}
                  min={0}
                  max={359}
                  step={1}
                  ariaLabel="Phi, the phase angle, in degrees"
                  onChange={(phi) => prepare({ theta: shown.theta, phi })}
                />
              </div>
            </div>

            <div className={s.section}>
              <span className="label">Or apply a gate</span>
              <div className={s.gates}>
                <button
                  type="button"
                  className={s.gateBtn}
                  data-kind="reset"
                  onClick={() => prepare({ theta: 0, phi: 0 })}
                  title="Start again from |0⟩"
                >
                  |0⟩
                </button>
                {PLAY_GATES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={s.gateBtn}
                    onClick={() => applyGate(t)}
                    title={`${GATES[t].name}: ${GATES[t].blurb}`}
                    aria-label={`Apply ${GATES[t].name}`}
                  >
                    {GATES[t].glyph}
                  </button>
                ))}
              </div>
            </div>

            <div className={s.equation} aria-label="State written out">
              |ψ⟩ = {ar.toFixed(3)}|0⟩ + {beta.toFixed(3)}
              {beta > 5e-4 && Math.round(shown.phi) !== 0 && (
                <>
                  {" "}e<sup>i·{Math.round(shown.phi)}°</sup>
                </>
              )}
              |1⟩
            </div>

            <div className={s.section}>
              {([0, 1] as const).map((k) => {
                const p = k === 0 ? p0 : 1 - p0;
                return (
                  <div key={k} className={s.probRow}>
                    <span>P(|{k}⟩)</span>
                    <span className={s.track}>
                      <span className={s.fill} style={{ width: `${p * 100}%` }} />
                    </span>
                    <span className={s.probValue}>{(p * 100).toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={s.panel} aria-label="The Bloch sphere">
            <div className={s.sphere}>
              <BlochSphere state={qubit} size={280} label="your qubit" />
            </div>
            <p className={s.foot}>
              The arrow is the state before you look. North is |0⟩, south is |1⟩, and φ turns it
              around the equator — which changes nothing you can measure here, and everything a later
              gate does.
            </p>
          </section>
        </div>

        <section className={`${s.panel} ${s.measure}`} aria-label="Measure">
          <div className={s.measureHead}>
            <div className={s.verdictBlock} aria-live="polite">
              <p className={s.verdict}>{verdict(prep, collapsed, again, p0)}</p>
              <p className={s.verdictSub}>{verdictSub(prep, collapsed, again)}</p>
            </div>
            <div className={s.actions}>
              <Button variant="primary" onClick={measureOnce}>
                {collapsed === null ? "Measure" : "Measure again"}
              </Button>
              <Button variant="secondary" onClick={() => measureCopies(100)}>
                Measure 100 copies
              </Button>
              {collapsed !== null && (
                <Button variant="ghost" onClick={() => { setCollapsed(null); setAgain(0); }}>
                  Prepare it again
                </Button>
              )}
            </div>
          </div>

          {total > 0 && (
            <div className={s.tally}>
              <span className="label">
                Counts for this state · {total} measurement{total === 1 ? "" : "s"}
              </span>
              {([0, 1] as const).map((k) => {
                const n = counts[k];
                const predicted = k === 0 ? p0Of(prep) : 1 - p0Of(prep);
                return (
                  <div key={k} className={s.probRow}>
                    <span>|{k}⟩ × {n}</span>
                    <span className={s.track}>
                      <span className={s.fill} style={{ width: `${(n / total) * 100}%` }} />
                      <span className={s.expected} style={{ left: `${predicted * 100}%` }} aria-hidden />
                    </span>
                    <span className={s.probValue}>{((n / total) * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
              <div className={s.strip} aria-label={`Last ${recent.length} outcomes`}>
                {recent.map((o, i) => (
                  <span key={i} className={s.shot} data-v={o} />
                ))}
              </div>
              <p className={s.tallyNote}>
                The tick on each bar is the prediction, {(p0Of(prep) * 100).toFixed(1)}% for |0⟩. The
                counts wander around it and close in as you measure more copies.
              </p>
            </div>
          )}
        </section>

        <nav className={s.next} aria-label="Where to go next">
          <Link href="/build" className="label">Take it to the bench →</Link>
          <Link href="/start" className="label">Start the learning path →</Link>
        </nav>
      </main>
    </div>
  );
}

function verdict(prep: Angles, collapsed: 0 | 1 | null, again: number, p0: number): string {
  if (collapsed !== null) return again > 0 ? `Still |${collapsed}⟩.` : `It read |${collapsed}⟩.`;
  if (p0 > 1 - 1e-6) return "Measuring now gives |0⟩, for certain.";
  if (p0 < 1e-6) return "Measuring now gives |1⟩, for certain.";
  return `|0⟩ ${Math.round(p0 * 100)}% of the time, |1⟩ ${Math.round((1 - p0) * 100)}%.`;
}

function verdictSub(prep: Angles, collapsed: 0 | 1 | null, again: number): string {
  if (collapsed !== null) {
    if (again > 0) return `Measured ${again + 1} times now. A collapsed state stays collapsed — prepare it again for a fresh roll.`;
    return isSuperposition(prep)
      ? `The superposition is gone. Measure again and it reads |${collapsed}⟩ every time.`
      : `It was already |${collapsed}⟩, so there was nothing to collapse. A measurement only surprises you when the state is a superposition.`;
  }
  return isSuperposition(prep)
    ? "Any single measurement gives just one of them. Measure many copies to see the split."
    : "No superposition here, so every measurement agrees. Try H, or tilt θ.";
}
