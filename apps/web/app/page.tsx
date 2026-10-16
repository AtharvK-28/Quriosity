"use client";

/**
 * Landing.
 *
 * The reference landing carried five major sections and three interactive
 * widgets. This carries one claim, one instrument and one action above the
 * fold, because the instrument makes the argument better than the copy does.
 *
 * The claim is the curiosity hook, not the product pitch: a newcomer does not
 * yet know what a circuit is, so "which gate is wrong" means nothing to them,
 * while "a qubit is not a coin" is a puzzle they want solved. The pitch moves
 * down to head the loop, where it is explained.
 *
 * The hero widget is not a mockup: it builds a real IR, runs it through the
 * real simulator, and samples real shots. Dragging the phase moves a quantity
 * no measurement in the middle of the circuit could ever reveal, and the final
 * reading swings from certainty to certainty. That is the entire product thesis
 * in one control.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { Button, Registration, Slider } from "@/components/ui/primitives";
import { Ket } from "@/components/mascot/Ket";
import { Histogram, toFractions } from "@/components/viz/Histogram";
import { BlochSphere } from "@/components/viz/BlochSphere";
import { qubitState } from "@/lib/sim/analysis";
import { render, SDK_LABELS } from "@/lib/render";
import { NODES, UNITS, nodesInUnit } from "@/lib/curriculum/nodes";
import { CHALLENGES } from "@/lib/curriculum/challenges";
import { MISCONCEPTIONS } from "@/lib/tutor/rules";
import { emptyCircuit, nextGateId, type Circuit } from "@/lib/ir/types";
import { formatParam } from "@/lib/ir/gates";
import { simulate } from "@/lib/sim/statevector";
import { sampleCounts } from "@/lib/sim/sample";
import s from "./page.module.css";

const SHOTS = 1024;

/** H · P(φ) · H · measure — interference in four gates. */
function interferenceCircuit(phi: number): Circuit {
  const c = emptyCircuit(1, "Interference");
  c.gates = [
    { id: "g1", type: "h", targets: [0], controls: [], params: [], column: 0 },
    { id: "g2", type: "p", targets: [0], controls: [], params: [phi], column: 1 },
    { id: "g3", type: "h", targets: [0], controls: [], params: [], column: 2 },
    { id: "g4", type: "measure", targets: [0], controls: [], params: [], column: 3, clbit: 0 },
  ];
  return c;
}

/** The Bell state, used to show the same circuit in three dialects. */
function bellCircuit(): Circuit {
  const c = emptyCircuit(2, "Bell state");
  c.gates = [
    { id: "b1", type: "h", targets: [0], controls: [], params: [], column: 0 },
    { id: "b2", type: "cx", targets: [1], controls: [0], params: [], column: 1 },
    { id: "b3", type: "measure", targets: [0], controls: [], params: [], column: 2, clbit: 0 },
    { id: "b4", type: "measure", targets: [1], controls: [], params: [], column: 2, clbit: 1 },
  ];
  return c;
}

function verdictFor(phi: number): string {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.22;
  if (near(phi, 0) || near(phi, 2 * Math.PI)) {
    return "No phase turn. The two paths add on |0⟩ and the qubit comes back certain — as though neither H had happened.";
  }
  if (near(phi, Math.PI)) {
    return "A half turn nobody could measure has flipped a certainty into its exact opposite. That cancellation is what a quantum computer sells.";
  }
  if (near(phi, Math.PI / 2) || near(phi, (3 * Math.PI) / 2)) {
    return "Quarter turn: the paths partly cancel and the reading is an honest coin again — halfway between two certainties.";
  }
  return "The plot moves continuously with a quantity that no measurement taken in the middle of this circuit could reveal.";
}

export default function LandingPage() {
  const [phi, setPhi] = useState(0);

  const { counts, midpointReading, midState } = useMemo(() => {
    const circuit = interferenceCircuit(phi);
    const result = simulate(circuit);
    const sampled = sampleCounts(result.probabilities, 1, SHOTS, {
      seed: Math.round(phi * 1000),
    });

    // The state halfway through, after H and the phase but before the second H.
    // On the sphere it walks around the equator; on a Z-basis measurement it is
    // 50/50 the whole way. Showing both at once is the argument.
    const half = simulate({
      ...circuit,
      gates: circuit.gates.filter((g) => g.column < 2),
    });
    return {
      counts: sampled,
      midpointReading: half.probabilities[0],
      midState: qubitState(half.branches, 1, 0),
    };
  }, [phi]);

  return (
    <div className={`${s.page} sheet`}>
      <TopBar />

      <section className={s.hero}>
        <div>
          <span className={s.eyebrow}>
            <span className={s.eyebrowDot} aria-hidden />
            Learn quantum by building it
          </span>

          <h1 className={`statement ${s.headline}`}>
            A qubit is <span className="glow-text">not a coin.</span>
          </h1>

          <p className={`prose ${s.sub}`}>
            Ten minutes to find out why. Drag gates, run real physics, and get
            told exactly what went wrong.
          </p>

          <div className={s.actions}>
            <Button variant="primary" size="lg" onClick={() => (window.location.href = "/start")}>
              Start building
            </Button>
            <Link href="/build" className={s.textLink}>
              Skip to the bench <span aria-hidden>→</span>
            </Link>
            <Link href="/playground" className={s.textLink}>
              Play with one qubit <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        {/* The instrument. Real IR, real simulator, real shots. */}
        <div className={s.instrument}>
          <Registration />

          <div className={s.instrumentHead}>
            <span className="label label--measure">Live · not a screenshot</span>
            <span className="label">{SHOTS} shots</span>
          </div>

          <div className={s.circuitStrip}>
            <span className={s.stripLabel}>q₀</span>
            <span className={s.stripWire} />
            <span className={s.stripGate}>H</span>
            <span className={s.stripWire} />
            <span className={s.stripGate} data-live="true">
              P({formatParam(phi)})
            </span>
            <span className={s.stripWire} />
            <span className={s.stripGate}>H</span>
            <span className={s.stripWire} />
            <span className={s.stripGate}>M</span>
          </div>

          <div className={s.twoViews}>
            <div className={s.viewCell}>
              <span className={`label ${s.viewLabel}`}>Halfway</span>
              <BlochSphere state={midState} label="drag to orbit" size={160} />
            </div>
            <div className={s.viewCell}>
              <span className={`label ${s.viewLabel}`}>Measured at the end</span>
              <Histogram
                qubits={1}
                actual={toFractions(counts.counts, SHOTS)}
                shots={SHOTS}
                height={128}
                dense
              />
            </div>
          </div>

          <div className={s.dialRow} style={{ marginTop: "var(--s-5)" }}>
            <span className="label">Drag the phase — this is the whole idea</span>
            <Slider
              value={phi}
              min={0}
              max={Math.PI * 2}
              step={Math.PI / 60}
              onChange={setPhi}
              ariaLabel="Phase angle applied between the two Hadamard gates"
            />
            <div className={s.dialTicks} aria-hidden>
              <span>φ = 0</span>
              <span>π</span>
              <span>2π</span>
            </div>
          </div>

          <p className={s.verdict}>{verdictFor(phi)}</p>

          <p
            className="label"
            style={{ marginTop: "var(--s-3)", color: "var(--ink-faint)", textTransform: "none", letterSpacing: 0 }}
          >
            Measured halfway, it reads {Math.round(midpointReading * 100)}/
            {Math.round((1 - midpointReading) * 100)} at every phase.
          </p>
        </div>
      </section>

      {/* -- The loop ------------------------------------------------------- */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <span className="label">The loop</span>
          <h2 className={`statement ${s.sectionTitle}`}>
            A wrong circuit should tell you which gate is wrong.
          </h2>
          <p className={s.lead}>
            Every lesson runs the same four beats, so you always know what comes next.
          </p>
        </div>

        <ol className={s.loop}>
          {[
            { n: "01", t: "See a target", d: "A shape to hit, not a paragraph." },
            { n: "02", t: "Build and run", d: "Drag gates. The code writes itself." },
            { n: "03", t: "Get diagnosed", d: "The gate, the wire and the fix." },
            { n: "04", t: "Then the why", d: "Explained after you try — so it sticks." },
          ].map((b) => (
            <li key={b.n} className={`${s.loopStep} lift`}>
              <span className={s.loopNum}>{b.n}</span>
              <div>
                <h3 className={s.loopTitle}>{b.t}</h3>
                <p className={s.loopBody}>{b.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* -- Rosetta --------------------------------------------------------- */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <span className="label">One circuit, five dialects</span>
          <h2 className={`statement ${s.sectionTitle}`}>
            Switching SDK changes the spelling, never the circuit.
          </h2>
          <p className={s.lead}>
            Build it once and read it in the toolkit you will use next: the code is written as you place each gate.
          </p>
        </div>

        <div className={s.rosetta}>
          {(["qiskit", "cirq", "pennylane"] as const).map((sdk) => (
            <div key={sdk} className={s.dialect}>
              <span className="label label--ink">{SDK_LABELS[sdk]}</span>
              <pre className={s.code}>{render(bellCircuit(), sdk)}</pre>
            </div>
          ))}
        </div>
        <p className={s.rosettaNote}>
          One circuit, rendered in your browser. Q# and OpenQASM too.
        </p>
      </section>

      {/* -- What is inside --------------------------------------------------- */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <span className="label">What is inside</span>
          <h2 className={`statement ${s.sectionTitle}`}>
            Entanglement is not hard. It is a stack of easy things.
          </h2>
          <p className={s.lead}>
            Five short units take you from one qubit, through entanglement, to your first quantum algorithms. Every lesson ends in a circuit you built yourself.
          </p>
        </div>

        <div className={s.units}>
          {UNITS.map((u) => (
            <article key={u.id} className={`${s.unitCard} lift`} style={{ ["--u" as string]: `var(--unit-${u.ordinal % 5})` }}>
              <span className="label">Unit {u.ordinal}</span>
              <h3 className={s.unitTitle}>{u.title}</h3>
              <p className={s.unitSkill}>{u.terminalSkill}</p>
              <span className={s.unitCount}>
                {nodesInUnit(u.id).length} nodes ·{" "}
                {nodesInUnit(u.id).reduce((m, n) => m + n.estMinutes, 0)} min
              </span>
            </article>
          ))}
        </div>

        <div className={s.counts}>
          {[
            { n: String(NODES.length), t: "lesson nodes, each ending in a circuit you built" },
            { n: String(CHALLENGES.length), t: "challenges — reach, golf and bug hunt" },
            {
              n: String(Object.keys(MISCONCEPTIONS).length),
              t: "catalogued misconceptions the tutor knows by name",
            },
            { n: "13", t: "rules that diagnose without calling a model" },
          ].map((c) => (
            <div key={c.t} className={s.count}>
              <span className={s.countN}>{c.n}</span>
              <span className={s.countT}>{c.t}</span>
            </div>
          ))}
        </div>
      </section>

      {/* -- Three ways in ----------------------------------------------------- */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <span className="label">Three ways in</span>
          <h2 className={`statement ${s.sectionTitle}`}>
            A researcher who sees XP closes the tab. So they never see it.
          </h2>
          <p className={s.lead}>
            Pick how you want to work. The mode switch in the top bar changes it at any time.
          </p>
        </div>

        <div className={s.swaps}>
          {[
            {
              out: "Guided",
              to: "Drag, run, get told why",
              why: "A path, challenges and a tutor that helps the moment a run fails.",
              href: "/path",
              cta: "Open the path",
              tone: "var(--cta)",
            },
            {
              out: "Workbench",
              to: "Straight to the bench",
              why: "No XP, no streaks, no tutor unless asked. Twelve wires and noise.",
              href: "/build",
              cta: "Open the bench",
              tone: "var(--phase)",
            },
            {
              out: "Teaching",
              to: "See where the class is stuck",
              why: "A ranked list of what your class actually misunderstands.",
              href: "/teach",
              cta: "See the heatmap",
              tone: "var(--measure)",
            },
          ].map((sw) => (
            <article key={sw.out} className={`${s.swap} lift`} style={{ ["--tone" as string]: sw.tone }}>
              <span className={s.modePill}>{sw.out}</span>
              <h3 className={s.swapIn}>{sw.to}</h3>
              <p className={s.swapWhy}>{sw.why}</p>
              <Link href={sw.href} className={`label ${s.swapLink}`}>
                {sw.cta} →
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* -- Library (planned) ------------------------------------------------
          Not built yet, and the section says so on every card: a landing
          page that promises what it cannot open is the fastest way to lose a
          reader's trust. */}
      <section className={s.section} aria-labelledby="library-head">
        <div className={s.sectionHead}>
          <span className="label">
            Digital library <span className={s.soon}>Coming soon</span>
          </span>
          <h2 id="library-head" className={`statement ${s.sectionTitle}`}>
            The reading and watching, next to the doing.
          </h2>
          <p className={s.lead}>
            Next: papers and lectures to go with each lesson, gathered in one place.
          </p>
        </div>

        <div className={s.swaps}>
          {[
            {
              out: "Journals",
              to: "Papers worth reading",
              why: "Peer-reviewed references on quantum computing and on how it is learned, chosen unit by unit, each with a note on why it matters.",
            },
            {
              out: "Video",
              to: "Lectures and talks",
              why: "Video references from across the field, linked from the lesson they explain.",
            },
            {
              out: "Sources",
              to: "Gathered in one place",
              why: "Papers, videos and the platform's own lessons and glossary, searchable together.",
            },
          ].map((card) => (
            <article key={card.out} className={s.swap} data-soon>
              <span className={s.swapTag}>{card.out}</span>
              <h3 className={s.swapIn}>{card.to}</h3>
              <p className={s.swapWhy}>{card.why}</p>
              <span className={`label ${s.swapLink} ${s.soonLink}`}>Coming soon</span>
            </article>
          ))}
        </div>

        <p className={s.rosettaNote}>
          Here today: the <Link href="/reference">glossary</Link>, every term the
          lessons use, defined and linked back to where it is taught.
        </p>
      </section>

      <section className={s.close}>
        {/* Ket, the tutor, meets you at the door. Motion is one hop on
            arrival, then stillness. */}
        <figure className={s.ketCard} aria-label="Ket, the tutor">
          <Ket size={132} mood="happy" />
          <figcaption className={s.ketSays}>
            I&apos;m Ket, your tutor. When a run goes wrong, I&apos;ll point at the gate and say why.
          </figcaption>
        </figure>
        <span className="label">Start anywhere</span>
        <h2 className="statement statement--s" style={{ maxWidth: "20ch" }}>
          Unit 0 takes ten minutes.
        </h2>
        <p className="prose">Nothing to install. It all runs in this tab.</p>
        <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap" }}>
          <Button variant="primary" size="lg" onClick={() => (window.location.href = "/start")}>
            Start with Unit 0
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => (window.location.href = "/challenges")}
          >
            Browse the challenges
          </Button>
        </div>
      </section>

      <footer className={s.footer}>
        <span>Quriosity · SIH 26140 · Quantum Latte</span>
        <span>Simulated in your browser · nothing is uploaded</span>
      </footer>
    </div>
  );
}
