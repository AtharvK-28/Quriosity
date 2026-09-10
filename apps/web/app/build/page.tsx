"use client";

/**
 * The workbench.
 *
 * Two lanes and a control bar. The reference bench carried eight simultaneous
 * information regions and read as crowded; everything here that is not the
 * circuit or the one state view you asked for is either a disclosure or absent.
 *
 * Mode discipline (PRD E7-S5): in Workbench mode the tutor produces no
 * proactive output whatsoever. It answers when invoked and is otherwise silent.
 * In Guided mode a failed run brings the diagnosis up on its own.
 */

import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { GateTray, TrayHint } from "@/components/circuit/GateTray";
import { Histogram, probabilityMap, toFractions } from "@/components/viz/Histogram";
import { BlochRow } from "@/components/viz/BlochSphere";
import { StateTable } from "@/components/viz/StateTable";
import { CodePanel } from "@/components/lesson/LessonPlayer";
import {
  Button, Chip, Disclosure, Readout, Registration, Segmented, Slider,
} from "@/components/ui/primitives";
import { circuitDepth, gateCount, type GateType } from "@/lib/ir/types";
import { allQubitStates, qubitState } from "@/lib/sim/analysis";
import type { Sdk } from "@/lib/render";
import { useCircuit, stateAtScrub } from "@/stores/circuitStore";
import { MODE, useSession } from "@/stores/sessionStore";
import { useTutor } from "@/stores/tutorStore";
import { TutorDock } from "@/components/tutor/TutorDock";
import type { TutorWhere } from "@/lib/tutor/protocol";
import s from "./build.module.css";

type View = "plot" | "bloch" | "table" | "code";

const VIEWS: Array<{ value: View; label: string }> = [
  { value: "plot", label: "Plot" },
  { value: "bloch", label: "Bloch" },
  { value: "table", label: "Table" },
  { value: "code", label: "Code" },
];

/**
 * The bench offers the whole gate set in every mode.
 *
 * PRD §6.3 locks gates "by node" in Guided mode — and the bench is not a node,
 * it is the free surface. Gating it by an arbitrary slice of the registry made
 * CNOT unreachable and two-qubit circuits impossible to build here, which is
 * the opposite of what a sandbox is for. Per-node locking lives in the lesson
 * player, where there is a node to lock against.
 */
const TRAY: GateType[] = [
  "h", "x", "y", "z", "s", "sdg", "t", "tdg",
  "rx", "ry", "rz", "p",
  "cx", "cz", "swap", "ccx",
  "measure", "reset", "barrier",
];

const BENCH: TutorWhere = { surface: "bench" };

export default function BuildPage() {
  const { mode, hydrate, hydrated } = useSession();
  const caps = MODE[mode];

  const {
    circuit, version, held, pendingControl, selectedGateId, highlighted,
    run, running, error, shots, noiseLevel, scrubColumn,
    hold, place, completeControlled, cancelPending, select, moveGate, removeGate, setParams,
    addQubit, removeQubit, setShots, setNoise, setScrub,
    execute, undo, redo, reset, saveDraft, loadDraft, clearDraft,
  } = useCircuit();

  const [view, setView] = useState<View>("plot");
  const [sdk, setSdk] = useState<Sdk>("qiskit");
  const [tutorOpen, setTutorOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { hydrate(); }, [hydrate]);

  // Pick the bench back up where it was left. A lesson may have left its own
  // circuit in the shared store, so this runs on mount before anything else
  // can write. PRD E11-S3.
  useEffect(() => {
    setRestored(loadDraft());
    setReady(true);
  }, [loadDraft]);

  // Save on every mutation, once the restore has run — otherwise the first
  // render would overwrite the draft with an empty circuit.
  useEffect(() => {
    if (!ready) return;
    saveDraft();
  }, [ready, version, shots, noiseLevel, saveDraft]);

  // Guided mode brings the diagnosis up on its own; Workbench never does.
  useEffect(() => {
    if (!run) { setTutorOpen(false); return; }
    if (caps.proactiveTutor && run.finding) setTutorOpen(true);
  }, [run, caps.proactiveTutor]);

  const depth = circuitDepth(circuit) + 1;
  const gates = gateCount(circuit);

  /* -- The scrubber reads the state at a column, not just at the end. ------- */

  const branchesAtCursor = useMemo(
    () => stateAtScrub(run, scrubColumn),
    [run, scrubColumn],
  );

  const qubitStates = useMemo(() => {
    if (!branchesAtCursor || !run) return undefined;
    return Array.from({ length: run.result.qubits }, (_, q) =>
      qubitState(branchesAtCursor, run.result.qubits, q),
    );
  }, [branchesAtCursor, run]);

  /** Exact probabilities at the cursor, so the plot winds with the scrubber. */
  const cursorProbabilities = useMemo(() => {
    if (!branchesAtCursor || !run) return null;
    const n = run.result.qubits;
    const p = new Float64Array(2 ** n);
    for (const b of branchesAtCursor) {
      for (let k = 0; k < p.length; k++) {
        p[k] += b.weight * (b.amps[2 * k] ** 2 + b.amps[2 * k + 1] ** 2);
      }
    }
    return p;
  }, [branchesAtCursor, run]);

  const scrubbing = scrubColumn !== null;

  /* -- Keyboard -------------------------------------------------------------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "Enter") { e.preventDefault(); execute(); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      // ⌘/ belongs to the tutor dock, which owns the conversation.
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [execute, undo, redo]);

  if (!hydrated) {
    return (
      <div className="sheet" style={{ minHeight: "100vh" }}>
        <TopBar />
      </div>
    );
  }

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />

      <main className={s.main}>
        <header className={s.head}>
          <h1 className={s.name}>{circuit.metadata.name ?? "Untitled circuit"}</h1>
          <div className={s.headActions}>
            <Chip>{gates} gates</Chip>
            <Chip>depth {Math.max(0, depth)}</Chip>
            <Button variant="ghost" size="sm" onClick={undo}>Undo</Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { clearDraft(); reset(); setRestored(false); }}
            >
              Clear
            </Button>
          </div>
        </header>

        {restored && (
          <div className={s.restored} role="status">
            <span className="label">Picked up where you left off</span>
            <button type="button" className={s.restoredDismiss} onClick={() => setRestored(false)}>
              dismiss
            </button>
          </div>
        )}

        <div className={s.lanes}>
          <div>
            <div className={s.stage}>
              <Registration />

              <div className={s.stageBody}>
                <CircuitCanvas
                  circuit={circuit}
                  minColumns={6}
                  selectedGateId={selectedGateId}
                  highlighted={highlighted}
                  qubitStates={qubitStates}
                  scrubColumn={scrubColumn}
                  held={held}
                  pendingControl={pendingControl}
                  onPlace={place}
                  onCompleteControlled={completeControlled}
                  onCancelPending={cancelPending}
                  onSelect={select}
                  onMove={moveGate}
                  onRemove={removeGate}
                  onParams={setParams}
                />
              </div>

              {/* The scrubber, aligned with the circuit above it. Dragging it
                  winds every state view backwards through the circuit — the
                  rotation IS the gate, which is the most useful thing an
                  animation can teach here. */}
              {run && depth > 1 && (
                <div className={s.scrubber}>
                  <span className="label">Time</span>
                  <span className={s.scrubTrack}>
                    <Slider
                      value={scrubColumn === null ? depth - 1 : scrubColumn}
                      min={-1}
                      max={depth - 1}
                      step={1}
                      ariaLabel="Step through the circuit"
                      onChange={(v) => setScrub(v >= depth - 1 ? null : v)}
                    />
                  </span>
                  <span className={s.scrubLabel}>
                    {scrubColumn === null
                      ? "end"
                      : scrubColumn < 0
                        ? "before"
                        : `step ${scrubColumn + 1} of ${depth}`}
                  </span>
                </div>
              )}

              <div className={s.stageFoot}>
                <GateTray
                  available={TRAY}
                  grouped
                  held={held?.type ?? null}
                  onPick={(t) => hold(t)}
                />
                {selectedGateId && (
                  <Button variant="ghost" size="sm" onClick={() => removeGate(selectedGateId)}>
                    Delete gate
                  </Button>
                )}
              </div>
            </div>

            <div style={{ marginTop: "var(--s-3)" }}>
              <TrayHint held={held?.type ?? null} pending={Boolean(pendingControl)} />
            </div>

            <div className={s.controls}>
              <div className={s.control}>
                <span className="label">Wires</span>
                <span className={s.stepper}>
                  <button
                    type="button" className={s.stepBtn} onClick={removeQubit}
                    disabled={circuit.qubits <= 1} aria-label="Remove a qubit"
                  >−</button>
                  <span className={s.stepValue}>{circuit.qubits} qubits</span>
                  <button
                    type="button" className={s.stepBtn} onClick={addQubit}
                    disabled={circuit.qubits >= caps.maxQubits} aria-label="Add a qubit"
                  >+</button>
                </span>
              </div>

              <div className={s.control}>
                <span className="label">Shots · {shots}</span>
                <Slider
                  value={Math.log2(shots)} min={7} max={13} step={1}
                  ariaLabel="Shot count"
                  onChange={(v) => setShots(2 ** v)}
                />
              </div>

              <div className={s.control}>
                <span className="label">
                  Noise · {noiseLevel === 0 ? "ideal" : `${Math.round(noiseLevel * 100)}%`}
                </span>
                <Slider
                  value={noiseLevel} min={0} max={1} step={0.05}
                  ariaLabel="Device noise level"
                  onChange={setNoise}
                />
              </div>

              <span className={s.spacer} />

              <div className={s.controlRow}>
                {!caps.proactiveTutor && run && (
                  <Button variant="ghost" size="sm" onClick={() => setTutorOpen((v) => !v)}>
                    Diagnosis
                  </Button>
                )}
                <Button variant="primary" onClick={() => execute()} disabled={running}>
                  {running ? "Running…" : "Run · ⌘↵"}
                </Button>
              </div>
            </div>

            {error && (
              <div className={s.errorBar} role="alert">
                <span className="label" style={{ color: "var(--error)" }}>
                  {error.code.replace("_", " ")}
                </span>
                <p style={{ marginTop: 6 }}>{error.message}</p>
                <p style={{ marginTop: 6, color: "var(--ink-muted)" }}>
                  Your circuit is untouched.
                </p>
              </div>
            )}

            {tutorOpen && run?.finding && (
              <div className={s.diagnosis}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <span className="label">
                    {run.finding.misconception
                      ? `${run.finding.misconception} · ${run.finding.ruleId}`
                      : run.finding.ruleId}
                  </span>
                  <button type="button" className="label" onClick={() => setTutorOpen(false)}>
                    dismiss
                  </button>
                </div>
                <p className={s.diagnosisText}>{run.finding.message}</p>
                <button
                  type="button"
                  className="label"
                  style={{ marginTop: 10, color: "var(--ink)" }}
                  onClick={() => void useTutor.getState().ask("Why is that wrong, and how do I fix it?")}
                >
                  Ask the tutor why →
                </button>
              </div>
            )}

            {tutorOpen && run && !run.finding && (
              <div className={s.diagnosis}>
                <p className={s.diagnosisText}>
                  Nothing to flag. The rule engine found no misconception pattern in
                  this circuit — which is not the same as saying it does what you
                  intended.
                </p>
              </div>
            )}
          </div>

          {/* One state view at a time. */}
          <aside className={s.side}>
            <div className={s.panel}>
              <div className={s.panelHead}>
                <span className="label">
                  {scrubbing ? `State at step ${(scrubColumn ?? 0) + 1}` : "State"}
                </span>
                <Segmented<View> ariaLabel="State view" value={view} onChange={setView} options={VIEWS} />
              </div>

              {!run ? (
                <p className={s.empty}>
                  Build a circuit and press Run. An empty circuit is a valid one —
                  it gives |{"0".repeat(circuit.qubits)}⟩ every time.
                </p>
              ) : (
                <>
                  {view === "plot" && (
                    <Histogram
                      qubits={run.result.qubits}
                      actual={
                        scrubbing && cursorProbabilities
                          ? probabilityMap(cursorProbabilities, run.result.qubits)
                          : toFractions(run.counts.counts, run.shots)
                      }
                      ideal={
                        run.noiseLevel > 0 && !scrubbing
                          ? probabilityMap(run.result.probabilities, run.result.qubits)
                          : undefined
                      }
                      shots={scrubbing ? undefined : run.shots}
                      height={160}
                      dense={run.result.qubits <= 3}
                    />
                  )}
                  {view === "bloch" && qubitStates && <BlochRow states={qubitStates} size={126} />}
                  {view === "table" && <StateTable result={run.result} />}
                  {view === "code" && <CodePanel circuit={circuit} sdk={sdk} onSdk={setSdk} />}
                </>
              )}
            </div>

            {run && (
              <div className={s.panel}>
                <div style={{ display: "flex", gap: "var(--s-5)", flexWrap: "wrap" }}>
                  <Readout value={run.result.durationMs < 1 ? "<1" : Math.round(run.result.durationMs)} label="ms" />
                  <Readout value={run.shots} label="shots" />
                  <Readout
                    value={run.result.mixed ? "mixed" : "pure"}
                    label="state"
                    tone={run.result.mixed ? "flag" : undefined}
                  />
                </div>

                <Disclosure label="What this run means">
                  <p style={{ fontSize: "var(--t-body)", color: "var(--ink-2)", lineHeight: 1.55 }}>
                    {readingOf(run)}
                  </p>
                </Disclosure>
              </div>
            )}
          </aside>
        </div>
      </main>

      <TutorDock where={BENCH} />
    </div>
  );
}

/** One plain sentence about what the plot shows. Never a verdict. */
function readingOf(run: NonNullable<ReturnType<typeof useCircuit.getState>["run"]>): string {
  const states = allQubitStates(run.result);
  const entangled = states.filter((q) => q.entangled).map((q) => `q${q.qubit}`);
  const outcomes = Object.keys(run.counts.counts).length;

  const parts: string[] = [];
  parts.push(
    outcomes === 1
      ? "One outcome every run — there was no uncertainty in this circuit to begin with."
      : `${outcomes} distinct outcomes across ${run.shots} shots.`,
  );
  if (entangled.length > 0) {
    parts.push(
      `${entangled.join(", ")} ${entangled.length === 1 ? "has" : "have"} no individual state — the Bloch view puts ${entangled.length === 1 ? "it" : "them"} at the centre, which is the signature of entanglement rather than an error.`,
    );
  }
  if (run.noiseLevel > 0) {
    parts.push(
      `Noise is at ${Math.round(run.noiseLevel * 100)}%, so the outline is what an ideal device would have given you.`,
    );
  }
  if (run.result.mixed) {
    parts.push("A measurement partway through left this state mixed, so there is no single state vector to report.");
  }
  return parts.join(" ");
}
