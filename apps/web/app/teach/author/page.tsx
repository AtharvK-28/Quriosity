"use client";

/**
 * Author a challenge — PRD E8-S6.
 *
 * "Target defined by supplying a reference circuit; the platform derives the
 * target state." So the instructor does the one thing they already know how to
 * do — build the answer — and the page shows what learners will be asked to
 * reach, derived by running it. The reference is never shown to a learner
 * before three tries, same as the built-in set.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { GateTray, TrayHint } from "@/components/circuit/GateTray";
import { GateMark } from "@/components/circuit/GateMark";
import { Histogram, probabilityMap } from "@/components/viz/Histogram";
import { Button, Chip, Input, Registration, Segmented } from "@/components/ui/primitives";
import { GATES } from "@/lib/ir/gates";
import { emptyCircuit, gateCount, type GateType } from "@/lib/ir/types";
import { targetNeedsPhase, targetProbabilities } from "@/lib/grade/fidelity";
import { describeState } from "@/lib/sim/describe";
import { useCircuit } from "@/stores/circuitStore";
import { defaultPalette, deriveTarget, useAuthored, type AuthoredChallenge } from "@/stores/authoredStore";
import { useSession } from "@/stores/sessionStore";
import { PublishChallenge } from "@/components/teach/PublishChallenge";
import p from "@/components/ui/page.module.css";

const TRAY: GateType[] = [
  "h", "x", "y", "z", "s", "sdg", "t", "tdg", "rx", "ry", "rz", "p",
  "cx", "cz", "swap", "ccx", "crx", "cry", "crz", "measure", "reset",
];

export default function AuthorPage() {
  const { hydrate } = useSession();
  const authored = useAuthored();
  const {
    circuit, held, pendingControl, selectedGateId, highlighted,
    hold, place, completeControlled, cancelPending, select, moveGate, dropGate, rewireGate, removeGate, setParams,
    setCircuit, addQubit, removeQubit, undo,
  } = useCircuit();

  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [hint, setHint] = useState("");
  const [kind, setKind] = useState<AuthoredChallenge["kind"]>("reach");
  const [palette, setPalette] = useState<GateType[] | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
    useAuthored.getState().hydrate();
    // The authoring canvas starts empty; it does not borrow the bench's circuit.
    setCircuit(emptyCircuit(2, "Reference"));
  }, [hydrate, setCircuit]);

  const target = useMemo(() => (circuit.gates.length > 0 ? deriveTarget(circuit) : null), [circuit]);
  const suggested = useMemo(() => defaultPalette(circuit), [circuit]);
  const offered = palette ?? suggested;
  /** The target written out, when it is a pure state that can be. */
  const described = useMemo(
    () => (target?.kind === "statevector" ? describeState(target.amplitudes, target.qubits) : null),
    [target],
  );
  /** Gates the answer uses. Anything else offered is a decoy. */
  const used = useMemo(() => new Set(circuit.gates.map((g) => g.type)), [circuit]);
  const missing = circuit.gates.map((g) => g.type).filter((t) => t !== "barrier" && !offered.includes(t));

  const problems = [
    !title.trim() && "a title",
    !brief.trim() && "a one-line brief",
    gateCount(circuit) === 0 && "a reference circuit",
    missing.length > 0 && `the gates the answer uses in the palette (${[...new Set(missing)].map((t) => GATES[t].name).join(", ")})`,
  ].filter(Boolean) as string[];

  function save() {
    if (problems.length > 0) return;
    const id = authored.add({
      title: title.trim(),
      brief: brief.trim(),
      hint: hint.trim() || "Build the state one wire at a time, then link them.",
      kind,
      reference: circuit,
      allowedGates: offered,
    });
    setSavedId(id);
  }

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      <main className={p.main}>
        <nav style={{ marginBottom: "var(--s-4)" }}>
          <Link href="/teach" className="label">← Instructor console</Link>
        </nav>
        <header className={p.head}>
          <div>
            <span className="label">Author a challenge</span>
            <h1 className="statement statement--s" style={{ marginTop: 6, maxWidth: "26ch" }}>
              Build the answer. The platform works out the question.
            </h1>
          </div>
        </header>

        <div className={p.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", alignItems: "start" }}>
          <div className={p.stack}>
            <div className={p.panel} style={{ padding: 0 }}>
              <Registration />
              <div style={{ padding: "0 var(--s-4)" }}>
                <CircuitCanvas
                  circuit={circuit}
                  minColumns={5}
                  selectedGateId={selectedGateId}
                  highlighted={highlighted}
                  held={held}
                  pendingControl={pendingControl}
                  onPlace={place}
                  onCompleteControlled={completeControlled}
                  onCancelPending={cancelPending}
                  onSelect={select}
                  onMove={moveGate}
                  onDrop={dropGate}
                  onRewire={rewireGate}
                  onRemove={removeGate}
                  onParams={setParams}
                />
              </div>
              <div style={{ padding: "var(--s-4)", borderTop: "1px solid var(--rule-2)" }}>
                <GateTray available={TRAY} grouped held={held?.type ?? null} onPick={(t) => hold(t)} />
              </div>
            </div>
            <TrayHint held={held?.type ?? null} pending={pendingControl} />
            <div className={p.row}>
              <span className="label">Wires</span>
              <Button variant="ghost" size="sm" onClick={removeQubit} disabled={circuit.qubits <= 1}>−</Button>
              <span className="mono">{circuit.qubits}</span>
              <Button variant="ghost" size="sm" onClick={addQubit} disabled={circuit.qubits >= 5}>+</Button>
              <Button variant="ghost" size="sm" onClick={undo}>Undo</Button>
              {selectedGateId && <Button variant="ghost" size="sm" onClick={() => removeGate(selectedGateId)}>Delete gate</Button>}
            </div>

            <div className={p.panel}>
              <div className={p.sectionHead}>
                <span className="label">What learners will be asked to reach</span>
                {target && <Chip tone={target.kind === "statevector" ? "phase" : undefined}>{target.kind === "statevector" ? "state vector" : "distribution"}</Chip>}
              </div>
              {target ? (
                <>
                  {described && (
                    <div style={{ marginBottom: "var(--s-3)" }}>
                      <p className="mono" style={{ fontSize: "var(--t-title)", lineHeight: 1.3, overflowWrap: "anywhere" }} aria-label={`Target state ${described.ket}`}>
                        {described.ket}
                      </p>
                      <p style={{ marginTop: "var(--s-1)", color: "var(--measure)" }}>
                        {described.name ? `${described.name[0].toUpperCase()}${described.name.slice(1)}, worked out from your circuit.` : "Worked out from your circuit."}
                      </p>
                    </div>
                  )}
                  <Histogram qubits={circuit.qubits} actual={probabilityMap(targetProbabilities(target), circuit.qubits)} height={120} dense={circuit.qubits <= 3} />
                  <p className={p.muted} style={{ marginTop: "var(--s-3)" }}>
                    {target.kind === "statevector"
                      ? targetNeedsPhase(target)
                        ? "Graded as a state, phase included — a circuit with the same odds but a different phase will not pass."
                        : "Graded as a state. Any circuit reaching it passes, however it gets there."
                      : "A mid-circuit measurement leaves this mixed, so it is graded on outcome probabilities."}
                    {" "}Par is {gateCount(circuit)} gate{gateCount(circuit) === 1 ? "" : "s"}.
                  </p>
                </>
              ) : (
                <p className={p.muted}>Place gates on the canvas and the target appears here.</p>
              )}
            </div>
          </div>

          <form className={`${p.panel} ${p.stack}`} onSubmit={(e) => { e.preventDefault(); save(); }}>
            <label className={p.field}>
              <span className="label">Title</span>
              <Input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Three that disagree" />
            </label>
            <label className={p.field}>
              <span className="label">Brief — what, not how</span>
              <Input value={brief} maxLength={140} onChange={(e) => setBrief(e.target.value)} placeholder="Never all three the same." />
            </label>
            <label className={p.field}>
              <span className="label">Hint — offered only after a miss</span>
              <textarea className={p.textarea} rows={2} value={hint} maxLength={240} onChange={(e) => setHint(e.target.value)} />
            </label>
            <div className={p.field} style={{ alignItems: "flex-start" }}>
              <span className="label">Kind</span>
              <Segmented<AuthoredChallenge["kind"]>
                ariaLabel="Kind"
                value={kind}
                onChange={setKind}
                options={[{ value: "reach", label: "Reach" }, { value: "golf", label: "Golf" }]}
              />
            </div>
            <fieldset className={p.field} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: 5 }}>Palette</legend>
              <div className={p.row} style={{ gap: "var(--s-2)" }}>
                {TRAY.map((t) => {
                  const on = offered.includes(t);
                  const decoy = on && t !== "measure" && circuit.gates.length > 0 && !used.has(t);
                  return (
                    <label key={t} title={decoy ? `${GATES[t].name} · decoy, the answer doesn't use it` : GATES[t].name} style={{ display: "inline-flex", alignItems: "center", gap: 4, opacity: on ? 1 : 0.5, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setPalette(on ? offered.filter((x) => x !== t) : [...offered, t])}
                        aria-label={GATES[t].name}
                      />
                      <span style={{ width: 30, height: 30, display: "grid", placeItems: "center" }}><GateMark spec={GATES[t]} /></span>
                      {decoy && (
                        <span className="mono" style={{ fontSize: "var(--t-micro)", color: "var(--ink-faint)" }}>decoy</span>
                      )}
                    </label>
                  );
                })}
              </div>
              <span className={p.muted} style={{ marginTop: "var(--s-2)" }}>Suggested from the answer, with a decoy or two so the palette doesn&apos;t give it away.</span>
            </fieldset>

            {problems.length > 0 && <p className={p.muted}>Still needs {problems.join(", ")}.</p>}
            <div className={p.row}>
              <Button variant="primary" type="submit" disabled={problems.length > 0}>Save the challenge</Button>
            </div>
            {savedId && (
              <p className={p.good} role="status">
                Saved in this browser.{" "}
                <Link href={`/challenges/authored?id=${encodeURIComponent(savedId)}`}>Try it as a learner →</Link>
              </p>
            )}
            <p className={p.muted}>
              Saved challenges stay in this browser. Publish one to a class from the list
              below, and every member finds it under Challenges.
            </p>
          </form>
        </div>

        {authored.items.length > 0 && (
          <section className={p.section} style={{ marginTop: "var(--s-7)" }}>
            <div className={p.sectionHead}>
              <h2 className={p.sectionTitle}>Written here</h2>
            </div>
            <div className={`${p.panel} ${p.list}`}>
              {authored.items.map((a) => (
                <div key={a.id} className={p.listRow}>
                  <span>
                    <Link href={`/challenges/authored?id=${encodeURIComponent(a.id)}`}>{a.title}</Link>{" "}
                    <span className={p.mono}>{a.kind} · {a.reference.qubits}q · par {gateCount(a.reference)}</span>
                  </span>
                  <span className={p.row} style={{ gap: "var(--s-2)" }}>
                    <PublishChallenge challenge={a} />
                    <Button variant="ghost" size="sm" onClick={() => authored.remove(a.id)}>Delete</Button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
