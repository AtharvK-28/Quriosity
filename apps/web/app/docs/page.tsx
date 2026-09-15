"use client";

/**
 * Docs — PRD §4 `/docs`: "IR schema, API, gate reference".
 *
 * The researcher's page (persona P2), so it is written as a reference, not a
 * tour: the object every surface works on, the conventions that decide what a
 * bitstring means, what goes in and out as text, and the limits. The gate table
 * lives at /reference and is linked rather than repeated.
 */

import Link from "next/link";
import { TopBar } from "@/components/chrome/TopBar";
import { KEYBOARD_GRAMMAR } from "@/components/circuit/CircuitCanvas";
import { PAGE_SHORTCUTS, ShortcutTable } from "@/components/chrome/ShortcutSheet";
import { MAX_GATES, MAX_QUBITS, SCHEMA_VERSION } from "@/lib/ir/types";
import { MAX_SIM_QUBITS } from "@/lib/sim/statevector";
import { PASS_THRESHOLD } from "@/lib/grade/fidelity";
import { MODE } from "@/stores/sessionStore";
import p from "@/components/ui/page.module.css";

const SCHEMA = `interface Circuit {
  schema_version: "${SCHEMA_VERSION}";
  id?: string;               // assigned on save
  qubits: number;            // 1–${MAX_QUBITS}
  clbits: number;            // defaults to qubits
  gates: Gate[];
  metadata: { name?: string; created_by?: string; sdk_origin?: "canvas" | "qiskit" | "cirq" | "pennylane" | "qasm" };
}

interface Gate {
  id: string;                // stable across edits; the tutor points at gates by this
  type: GateType;            // "h" | "cx" | "rz" | … — see the gate reference
  targets: number[];         // qubit indices, ordered
  controls: number[];        // empty for single-qubit gates
  params: number[];          // radians; length fixed per gate type
  column: number;            // integer time slot; gaps render as identity
  clbit?: number;            // measure only
}`;

const INVARIANTS = [
  `Qubit count between 1 and ${MAX_QUBITS}.`,
  "Every target, control and classical bit index is in range.",
  "A gate's targets and controls do not overlap.",
  "Parameter count matches the gate's registry entry.",
  "Every parameter is a finite number.",
  "The gate type exists in the registry.",
  "No two gates share a qubit in the same column.",
  "Columns are non-negative integers.",
  "Gate ids are unique within the circuit.",
  "A measurement carries a classical bit in range.",
];

const QASM_EXAMPLE = `OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[2] c;

h q[0];
cx q[0], q[1];
c = measure q;`;

const QISKIT_EXAMPLE = `from qiskit import QuantumCircuit
import numpy as np

theta = np.pi / 3          # a name bound to an angle is fine
qc = QuantumCircuit(2, 2)
qc.ry(theta, 0)
qc.cx(0, 1)
qc.measure([0, 1], [0, 1])`;

export default function DocsPage() {
  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      <main className={`${p.main} ${p.narrow}`}>
        <header className={p.head}>
          <div>
            <span className="label">Docs</span>
            <h1 className="statement statement--s" style={{ marginTop: 6 }}>
              One circuit object, and everything it becomes.
            </h1>
          </div>
        </header>

        <nav className={p.toc} aria-label="On this page">
          <a href="#ir">The IR</a>
          <a href="#conventions">Conventions</a>
          <a href="#formats">Code and formats</a>
          <a href="#sharing">Links and records</a>
          <a href="#keyboard">Keyboard</a>
          <a href="#limits">Limits</a>
          <Link href="/reference">Gate reference →</Link>
        </nav>

        <section id="ir" className={p.section}>
          <div className={p.sectionHead}>
            <h2 className={p.sectionTitle}>The IR</h2>
            <span className={p.mono}>schema {SCHEMA_VERSION} · frozen</span>
          </div>
          <p className={p.body} style={{ marginBottom: "var(--s-4)" }}>
            The canvas, the code panel, the simulator, the grader and the tutor all
            work on this one object. Nothing translates canvas to code directly; each
            SDK is a renderer over the IR, which is why switching dialect is instant
            and why a circuit drawn in one place is exactly the circuit run in another.
          </p>
          <pre className={p.code}>{SCHEMA}</pre>
          <h3 className="label" style={{ display: "block", margin: "var(--s-5) 0 var(--s-2)" }}>
            Validation — every circuit, before it reaches anything
          </h3>
          <ol className={p.body} style={{ paddingLeft: "1.4em", listStyle: "decimal" }}>
            {INVARIANTS.map((i) => <li key={i}>{i}</li>)}
          </ol>
          <p className={p.muted} style={{ marginTop: "var(--s-3)" }}>
            A failure names the gate, the wire and the reason. The canonical hash drops
            ids and metadata and orders gates by column then wire, so two physically
            identical circuits hash the same.
          </p>
        </section>

        <section id="conventions" className={p.section}>
          <div className={p.sectionHead}>
            <h2 className={p.sectionTitle}>Conventions</h2>
          </div>
          <div className={p.tableWrap}>
            <table className={p.table}>
              <tbody>
                <tr><th scope="row">Endianness</th><td>Little-endian, as Qiskit. Basis index k has bit j equal to qubit j; bitstrings print q<sub>n−1</sub> … q<sub>0</sub>, and every axis says so.</td></tr>
                <tr><th scope="row">Global phase</th><td>The first amplitude above 10⁻⁹ is made real and positive. This changes no physics and makes states comparable.</td></tr>
                <tr><th scope="row">Grading</th><td>By state fidelity F = |⟨target|actual⟩|², passing at F ≥ {PASS_THRESHOLD}. Never by gate names or order, so any correct circuit passes. Mixed states and distribution targets compare outcome probabilities.</td></tr>
                <tr><th scope="row">Bloch vectors</th><td>From each qubit&apos;s reduced density matrix. An entangled qubit sits at the centre, labelled as having no individual state.</td></tr>
                <tr><th scope="row">Measurement</th><td>A terminal read leaves the state alone. A mid-circuit read splits it into a weighted ensemble of branches and is marked “mid” on the canvas.</td></tr>
                <tr><th scope="row">Parameters</th><td>Radians. Inputs accept <code>pi/4</code>, <code>90deg</code> or a decimal, and display as the cleanest π fraction.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="formats" className={p.section}>
          <div className={p.sectionHead}>
            <h2 className={p.sectionTitle}>Code and formats</h2>
          </div>
          <div className={p.tableWrap}>
            <table className={p.table}>
              <thead>
                <tr><th>Format</th><th>Render</th><th>Edit / import</th><th>Notes</th></tr>
              </thead>
              <tbody>
                <tr><td>Qiskit</td><td>Yes</td><td>Yes</td><td>Straight-line construction, read without running it.</td></tr>
                <tr><td>OpenQASM 3 (and 2)</td><td>Yes</td><td>Yes</td><td>Standard gates, measure, reset, barrier. Export from the bench menu.</td></tr>
                <tr><td>Cirq</td><td>Yes</td><td>—</td><td>Rendered from the IR.</td></tr>
                <tr><td>PennyLane</td><td>Yes</td><td>—</td><td>Rendered from the IR.</td></tr>
                <tr><td>Q#</td><td>Yes</td><td>—</td><td>Rendered from the IR.</td></tr>
                <tr><td>Jupyter</td><td>—</td><td>—</td><td>Export: imports, construction, execution and a histogram cell, nbformat 4.</td></tr>
              </tbody>
            </table>
          </div>

          <p className={p.body} style={{ margin: "var(--s-4) 0" }}>
            Editing reads code without executing it, so it accepts what can be known
            without running: one circuit declared with plain counts, one gate call per
            statement, and angles written as numbers, π expressions or names bound to
            them. Loops, functions, registers, custom gates, modifiers and classical
            control are refused with the line and the construct named — never skipped,
            because a skipped line is a different circuit. A failed parse leaves the
            canvas as it was.
          </p>
          <div className={p.grid}>
            <div className={p.stack}>
              <span className="label">OpenQASM</span>
              <pre className={p.code}>{QASM_EXAMPLE}</pre>
            </div>
            <div className={p.stack}>
              <span className="label">Qiskit</span>
              <pre className={p.code}>{QISKIT_EXAMPLE}</pre>
            </div>
          </div>
          <p className={p.muted} style={{ marginTop: "var(--s-3)" }}>
            Text has no columns, so an imported circuit is laid out as early as each gate
            can go. Order on every wire is kept exactly; a round trip closes gaps and
            changes nothing else.
          </p>
        </section>

        <section id="sharing" className={p.section}>
          <div className={p.sectionHead}>
            <h2 className={p.sectionTitle}>Links and records</h2>
          </div>
          <p className={p.body}>
            <b>Share</b> on the bench copies <code>/build/&lt;circuit&gt;</code>, where the
            path segment is the circuit itself, encoded. Anyone with it opens that
            exact circuit read-only and can fork a copy. Nothing is uploaded; the link
            is validated like any other input before it is drawn.
          </p>
          <p className={p.body} style={{ marginTop: "var(--s-3)" }}>
            A <b>completion record</b> at <code>/record/&lt;code&gt;</code> carries the track,
            the date, the node list and a checksum, and the page reports whether the two
            still agree. It shows a record was not edited; without accounts it cannot show
            who earned it, and it says so.
          </p>
        </section>

        <section id="keyboard" className={p.section}>
          <div className={p.sectionHead}>
            <h2 className={p.sectionTitle}>Keyboard</h2>
            <span className={p.mono}>? opens this on the bench</span>
          </div>
          <div className={p.grid}>
            <div className={p.stack}>
              <span className="label">On the circuit</span>
              <ShortcutTable rows={KEYBOARD_GRAMMAR} />
            </div>
            <div className={p.stack}>
              <span className="label">On the bench</span>
              <ShortcutTable rows={PAGE_SHORTCUTS} />
            </div>
          </div>
        </section>

        <section id="limits" className={p.section}>
          <div className={p.sectionHead}>
            <h2 className={p.sectionTitle}>Limits</h2>
          </div>
          <div className={p.tableWrap}>
            <table className={p.table}>
              <tbody>
                <tr><th scope="row">Qubits</th><td>Guided {MODE.guided.maxQubits} · Track {MODE.track.maxQubits} · Workbench {MODE.workbench.maxQubits}. The browser simulator stops at {MAX_SIM_QUBITS}: it keeps the state after every column for the scrubber, and 2²⁰ amplitudes per column does not fit.</td></tr>
                <tr><th scope="row">Gates</th><td>{MAX_GATES} per circuit, checked before a run.</td></tr>
                <tr><th scope="row">Run time</th><td>15 seconds, then a named error. The circuit is never lost.</td></tr>
                <tr><th scope="row">Shots</th><td>128 to 8192. The state vector is exact and does not depend on them.</td></tr>
                <tr><th scope="row">Where it runs</th><td>Simulation, grading, rendering and the rule-engine tutor all run in the browser. Only the tutor&apos;s free-text answers call a server, and only when a key is configured.</td></tr>
                <tr><th scope="row">Your data</th><td>Kept in this browser. Export or delete it from <Link href="/settings">Settings</Link>.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
