"use client";

/**
 * The gate reference.
 *
 * The one screen in the product where a table is the right answer. It is also
 * the destination the tutor links to when its retrieval confidence is low —
 * "I'm not confident enough to answer that, here is the reference for CRZ" is a
 * better response than a guess, and it needs somewhere to point.
 */

import { useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { Segmented } from "@/components/ui/primitives";
import { GATES, GATE_TYPES } from "@/lib/ir/gates";
import { GateMark } from "@/components/circuit/GateMark";
import { UNITS } from "@/lib/curriculum/nodes";
import { SDK_LABELS, type Sdk } from "@/lib/render";
import s from "./reference.module.css";

const SDKS: Array<{ value: Sdk; label: string }> = (
  ["qiskit", "cirq", "pennylane", "qsharp", "qasm"] as Sdk[]
).map((k) => ({ value: k, label: SDK_LABELS[k] }));

export default function ReferencePage() {
  const [sdk, setSdk] = useState<Sdk>("qiskit");

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />

      <main className={s.main}>
        <header className={s.head}>
          <div>
            <span className="label">Reference</span>
            <h1 className="statement statement--s" style={{ marginTop: 6 }}>
              Every gate this platform runs.
            </h1>
          </div>
          <Segmented<Sdk> ariaLabel="SDK spelling" value={sdk} onChange={setSdk} options={SDKS} />
        </header>

        <p className="prose" style={{ marginBottom: "var(--s-6)" }}>
          A circuit using anything outside this set is rejected at validation with
          the gate named. Switching the column on the right changes only the
          spelling — never the circuit.
        </p>

        <div className={s.table}>
          <div className={s.thead}>
            <span className="label">Gate</span>
            <span className="label">Wires</span>
            <span className="label">What it does</span>
            <span className="label">{SDK_LABELS[sdk]}</span>
            <span className="label">Unit</span>
          </div>

          {GATE_TYPES.map((type) => {
            const g = GATES[type];
            const unit = UNITS.find((u) => u.id === g.unlocksIn);
            const wires = g.targetArity + g.controlArity;
            return (
              <div key={type} id={`gate-${type}`} className={s.row} style={{ scrollMarginTop: 84 }}>
                <span className={s.glyphCell}>
                  <span className={s.glyph} aria-hidden>
                    <GateMark spec={g} />
                  </span>
                  <span className={s.name}>{g.name}</span>
                </span>
                <span className={s.mono}>
                  {wires}
                  {g.paramArity > 0 && " · θ"}
                </span>
                <span className={s.blurb}>{g.blurb}</span>
                <code className={s.code}>{g.sdk[sdk] || "—"}</code>
                <span className={s.mono}>{unit ? `U${unit.ordinal}` : g.unlocksIn}</span>
              </div>
            );
          })}
        </div>

        <p className={s.footnote}>
          Parameters accept radians, degrees (<code>90deg</code>) or π-expressions
          (<code>pi/4</code>), and render back as the cleanest form — <code>π/4</code>,
          never <code>0.7853981</code>.
        </p>
      </main>
    </div>
  );
}
