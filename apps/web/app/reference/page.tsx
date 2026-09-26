"use client";

/**
 * The glossary: every term, and every gate this platform runs.
 *
 * One place to look a word up. The tutor links here when its confidence is
 * low, gate chips link to their row, and the pop-ups that introduce a word
 * link to its entry — so the address of each entry is stable: #term-ID and
 * #gate-ID, and arriving on either opens the right tab.
 */

import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { Input, Segmented } from "@/components/ui/primitives";
import { GATES, GATE_TYPES } from "@/lib/ir/gates";
import { GateMark } from "@/components/circuit/GateMark";
import { TermMark } from "@/components/viz/TermMark";
import { NODES_BY_ID, UNITS } from "@/lib/curriculum/nodes";
import { GLOSSARY, type Term } from "@/lib/curriculum/glossary";
import { SDK_LABELS, type Sdk } from "@/lib/render";
import s from "./reference.module.css";

type Tab = "terms" | "gates";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "terms", label: "Terms" },
  { value: "gates", label: "Gates" },
];

const SDKS: Array<{ value: Sdk; label: string }> = (
  ["qiskit", "cirq", "pennylane", "qsharp", "qasm"] as Sdk[]
).map((k) => ({ value: k, label: SDK_LABELS[k] }));

/** Terms grouped by the unit that first needs them, then the rest. */
function groups(terms: Term[]): Array<{ title: string; terms: Term[] }> {
  const out = UNITS.map((u) => ({
    title: `Unit ${u.ordinal} · ${u.title}`,
    terms: terms.filter((t) => t.introducedIn && NODES_BY_ID.get(t.introducedIn)?.unitId === u.id),
  }));
  out.push({ title: "On the screen", terms: terms.filter((t) => !t.introducedIn) });
  return out.filter((g) => g.terms.length > 0);
}

export default function GlossaryPage() {
  const [tab, setTab] = useState<Tab>("terms");
  const [sdk, setSdk] = useState<Sdk>("qiskit");
  const [query, setQuery] = useState("");

  // Arriving on #gate-… or #term-… opens that tab and scrolls to the entry.
  useEffect(() => {
    function follow() {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      setTab(hash.startsWith("gate-") ? "gates" : "terms");
      setQuery("");
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
    }
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GLOSSARY;
    return GLOSSARY.filter((t) => `${t.term} ${t.symbol ?? ""} ${t.short} ${t.more ?? ""}`.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />

      <main className={s.main}>
        <header className={s.head}>
          <div>
            <span className="label">Glossary</span>
            <h1 className="statement statement--s" style={{ marginTop: 6 }}>
              Look anything up.
            </h1>
          </div>
          <Segmented<Tab> ariaLabel="Glossary section" value={tab} onChange={setTab} options={TABS} />
        </header>

        {tab === "terms" && (
          <>
            <div className={s.search}>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search — qubit, phase, entanglement…"
                aria-label="Search the glossary"
              />
            </div>

            {shown.length === 0 && (
              <p className={s.empty}>
                Nothing matches “{query}”. Try the Gates tab, or ask the tutor.
              </p>
            )}

            {groups(shown).map((g) => (
              <section key={g.title} className={s.group}>
                <h2 className="label">{g.title}</h2>
                <dl className={s.terms}>
                  {g.terms.map((t) => (
                    <div key={t.id} id={`term-${t.id}`} className={s.term} style={{ scrollMarginTop: 84 }}>
                      <dt className={s.termName}>
                        {t.mark && <TermMark mark={t.mark} size={44} />}
                        <span>
                          {t.term}
                          {t.symbol && <span className={s.symbol}>{t.symbol}</span>}
                        </span>
                      </dt>
                      <dd className={s.termBody}>
                        <p>{t.short}</p>
                        {t.more && <p className={s.more}>{t.more}</p>}
                        {t.gates && (
                          <span className={s.termGates}>
                            {t.gates.map((type) => (
                              <a key={type} href={`#gate-${type}`} className={s.gateLink}>
                                {GATES[type].name}
                              </a>
                            ))}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </>
        )}

        {tab === "gates" && (
          <>
            <div className={s.gatesHead}>
              <p className={s.lede}>Every gate the simulator runs. The right column is just spelling.</p>
              <Segmented<Sdk> ariaLabel="SDK spelling" value={sdk} onChange={setSdk} options={SDKS} />
            </div>

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
              Angles accept <code>pi/4</code>, <code>90deg</code> or radians.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
