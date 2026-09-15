"use client";

/**
 * The workbench.
 *
 * Two lanes and a control bar. The reference bench carried eight simultaneous
 * information regions and read as crowded; everything here that is not the
 * circuit or the one state view you asked for is either a disclosure, a menu,
 * or absent.
 *
 * Mode discipline (PRD E7-S5): in Workbench mode the tutor produces no
 * proactive output whatsoever. It answers when invoked and is otherwise silent.
 * In Guided mode a failed run brings the diagnosis up on its own; a passing
 * run's advice (a shorter equivalent) waits to be asked for in every mode.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { GateTray, TrayHint } from "@/components/circuit/GateTray";
import { Histogram, probabilityMap, toFractions } from "@/components/viz/Histogram";
import { BlochRow } from "@/components/viz/BlochSphere";
import { StateTable } from "@/components/viz/StateTable";
import { DensityMatrix } from "@/components/viz/DensityMatrix";
import { MAX_PAIR_WIRES, PairLinks } from "@/components/viz/PairLinks";
import { CodePanel } from "@/components/code/CodePanel";
import { ImportDialog } from "@/components/code/ImportDialog";
import { ShortcutSheet } from "@/components/chrome/ShortcutSheet";
import { Menu } from "@/components/ui/Dialog";
import {
  Button, Chip, Disclosure, Input, Readout, Registration, Segmented, Slider,
} from "@/components/ui/primitives";
import { circuitDepth, gateCount, gateQubits, type Circuit, type GateType } from "@/lib/ir/types";
import { allQubitStates, qubitState } from "@/lib/sim/analysis";
import { pairLinks } from "@/lib/sim/density";
import { MAX_SIM_QUBITS } from "@/lib/sim/statevector";
import { renderQasm, type Sdk } from "@/lib/render";
import { fileSlug, toNotebook } from "@/lib/io/notebook";
import { FORK_FLAG, sharePath } from "@/lib/io/share";
import { downloadText } from "@/lib/download";
import { useCircuit, stateAtScrub } from "@/stores/circuitStore";
import { MODE, useSession } from "@/stores/sessionStore";
import { useLibrary } from "@/stores/libraryStore";
import { useTutor } from "@/stores/tutorStore";
import { TutorDock } from "@/components/tutor/TutorDock";
import type { TutorWhere } from "@/lib/tutor/protocol";
import s from "./build.module.css";

type View = "plot" | "bloch" | "table" | "density" | "code";

const VIEWS: Array<{ value: View; label: string }> = [
  { value: "plot", label: "Plot" },
  { value: "bloch", label: "Bloch" },
  { value: "table", label: "Table" },
  // "ρ" would read better, but the segment labels are uppercased and a capital
  // rho is indistinguishable from P.
  { value: "density", label: "Density" },
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
  "h", "x", "y", "z", "i", "s", "sdg", "t", "tdg",
  "rx", "ry", "rz", "p",
  "cx", "cz", "swap", "ccx", "crx", "cry", "crz",
  "measure", "reset", "barrier",
];

const BENCH: TutorWhere = { surface: "bench" };

/** Keys that belong to fields and to the canvas, never to the page. */
function typingInto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    Boolean(el.closest?.('[role="application"], [role="dialog"], [role="menu"]'))
  );
}

export default function BuildPage() {
  const { mode, hydrate, hydrated } = useSession();
  const caps = MODE[mode];
  const library = useLibrary();

  const {
    circuit, version, held, pendingControl, selectedGateId, highlighted,
    run, running, error, shots, noiseLevel, scrubColumn,
    hold, place, completeControlled, cancelPending, select, moveGate, removeGate, setParams,
    addQubit, removeQubit, setShots, setNoise, setScrub, setName,
    execute, undo, redo, reset, saveDraft, loadDraft, clearDraft, replaceCircuit, applyFix,
  } = useCircuit();

  const [view, setView] = useState<View>("plot");
  const [sdk, setSdk] = useState<Sdk>("qiskit");
  const [tutorOpen, setTutorOpen] = useState(false);
  const [restored, setRestored] = useState<null | "draft" | "fork">(null);
  const [ready, setReady] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => { hydrate(); useLibrary.getState().hydrate(); }, [hydrate]);

  // Workbench users open on the code lane (PRD §6.3, "Primary panel: Code").
  const initialView = useRef(false);
  useEffect(() => {
    if (!hydrated || initialView.current) return;
    initialView.current = true;
    if (caps.primaryPanel === "code") setView("code");
  }, [hydrated, caps.primaryPanel]);

  // Pick the bench back up where it was left. A lesson may have left its own
  // circuit in the shared store, so this runs on mount before anything else
  // can write. PRD E11-S3.
  useEffect(() => {
    const had = loadDraft();
    let forked = false;
    try {
      forked = window.sessionStorage.getItem(FORK_FLAG) === "1";
      window.sessionStorage.removeItem(FORK_FLAG);
    } catch { /* no session storage */ }
    setRestored(forked ? "fork" : had ? "draft" : null);
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

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(t);
  }, [status]);

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

  /** Wire pairs entangled with each other, for the brackets on the canvas. */
  const pairs = useMemo<Array<[number, number]>>(() => {
    if (!branchesAtCursor || !run || run.result.qubits < 2 || run.result.qubits > MAX_PAIR_WIRES) return [];
    return pairLinks(branchesAtCursor, run.result.qubits)
      .filter((l) => l.kind === "paired")
      .map((l) => [l.a, l.b]);
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

  /* -- Saving, sharing, exporting ------------------------------------------- */

  const startSave = useCallback(() => {
    if (savedId && library.get(savedId)) {
      library.save(circuit, circuit.metadata.name ?? library.get(savedId)!.name, savedId);
      setStatus("Saved in this browser.");
      return;
    }
    setSaveName(circuit.metadata.name ?? "");
    setSaving(true);
  }, [savedId, library, circuit]);

  function commitSave() {
    const name = saveName.trim() || "Untitled circuit";
    setName(name);
    const id = library.save({ ...circuit, metadata: { ...circuit.metadata, name } }, name, null);
    setSavedId(id);
    setSaving(false);
    setStatus(`Saved “${name}” in this browser.`);
  }

  async function share() {
    const url = `${window.location.origin}${sharePath(circuit)}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied. It opens this exact circuit, read-only, for anyone who has it.");
    } catch {
      setStatus(`Copy this link: ${url}`);
    }
  }

  function openSaved(id: string) {
    const item = library.get(id);
    if (!item) return;
    replaceCircuit(item.circuit);
    setName(item.name);
    setSavedId(id);
    setLibraryOpen(false);
    setStatus(`Opened “${item.name}”. Undo takes you back to what was on the bench.`);
  }

  function loadImported(c: Circuit) {
    replaceCircuit(c);
    setSavedId(null);
    setStatus(`Imported ${c.qubits} qubit${c.qubits === 1 ? "" : "s"} and ${gateCount(c)} gate${gateCount(c) === 1 ? "" : "s"}. Undo takes it back.`);
  }

  /* -- Wires ------------------------------------------------------------------ */

  const lastWire = circuit.qubits - 1;
  // What removing the wire would delete. A barrier spanning other wires only
  // shrinks, so it does not count.
  const gatesOnLast = circuit.gates.filter((g) =>
    g.type === "barrier" ? g.targets.length === 1 && g.targets[0] === lastWire : gateQubits(g).includes(lastWire),
  ).length;

  function onRemoveWire() {
    // E2-S4: a wire with gates on it asks first.
    if (gatesOnLast > 0) setConfirmRemove(true);
    else removeQubit();
  }

  /* -- Keyboard -------------------------------------------------------------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "Enter") { e.preventDefault(); execute(); return; }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); startSave(); return; }
      if (typingInto(e.target) && !mod) return;
      if (mod && e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === "z") {
        if (typingInto(e.target)) return; // a field's own undo
        e.preventDefault();
        undo();
        return;
      }
      if (mod || e.altKey) return;
      if (e.key === "?") { e.preventDefault(); setKeysOpen(true); return; }
      const index = ["1", "2", "3", "4", "5"].indexOf(e.key);
      if (index >= 0) setView(VIEWS[index].value);
      // ⌘/ belongs to the tutor dock, which owns the conversation.
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [execute, undo, redo, startSave]);

  if (!hydrated) {
    return (
      <div className="sheet" style={{ minHeight: "100vh" }}>
        <TopBar />
      </div>
    );
  }

  const atCap = circuit.qubits >= caps.maxQubits;
  const advice = run && !run.finding ? run.advice : null;

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
              onClick={() => { clearDraft(); reset(); setRestored(null); setSavedId(null); }}
            >
              Clear
            </Button>
            <Button variant="ghost" size="sm" onClick={startSave}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => void share()}>Share</Button>
            <Menu
              label="More"
              items={[
                { label: "Import OpenQASM or Qiskit…", onSelect: () => setImportOpen(true) },
                {
                  label: "Export OpenQASM 3",
                  hint: ".qasm",
                  onSelect: () => downloadText(`${fileSlug(circuit.metadata.name)}.qasm`, renderQasm(circuit)),
                },
                {
                  label: "Export Jupyter notebook",
                  hint: ".ipynb",
                  onSelect: () => downloadText(`${fileSlug(circuit.metadata.name)}.ipynb`, toNotebook(circuit, { shots }), "application/x-ipynb+json"),
                },
                { label: `Saved circuits (${library.items.length})`, onSelect: () => setLibraryOpen((v) => !v) },
                { label: "Keyboard shortcuts", hint: "?", onSelect: () => setKeysOpen(true) },
              ]}
            />
          </div>
        </header>

        {restored && (
          <div className={s.restored} role="status">
            <span className="label">
              {restored === "fork" ? "Forked from a shared link — this copy is yours" : "Picked up where you left off"}
            </span>
            <button type="button" className={s.restoredDismiss} onClick={() => setRestored(null)}>
              dismiss
            </button>
          </div>
        )}

        {status && (
          <p className={s.status} role="status">{status}</p>
        )}

        {saving && (
          <form
            className={s.saveForm}
            onSubmit={(e) => { e.preventDefault(); commitSave(); }}
          >
            <label className={s.saveLabel}>
              <span className="label">Name</span>
              <Input
                autoFocus
                value={saveName}
                maxLength={80}
                placeholder="Bell pair, with a phase kick"
                onChange={(e) => setSaveName(e.target.value)}
                aria-label="Circuit name"
              />
            </label>
            <Button variant="primary" size="sm" type="submit">Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setSaving(false)}>Cancel</Button>
            <span className={s.saveNote}>Saved in this browser. Share makes a link anyone can open.</span>
          </form>
        )}

        {libraryOpen && (
          <SavedCircuits
            onOpen={openSaved}
            onClose={() => setLibraryOpen(false)}
            currentId={savedId}
          />
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
                  pairs={pairs}
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
              <TrayHint held={held?.type ?? null} pending={pendingControl} />
            </div>

            <div className={s.controls}>
              <div className={s.control}>
                <span className="label">Wires</span>
                <span className={s.stepper}>
                  <button
                    type="button" className={s.stepBtn} onClick={onRemoveWire}
                    disabled={circuit.qubits <= 1} aria-label="Remove a qubit"
                  >−</button>
                  <span className={s.stepValue}>{circuit.qubits} qubits</span>
                  <button
                    type="button" className={s.stepBtn} onClick={addQubit}
                    disabled={atCap} aria-label="Add a qubit"
                  >+</button>
                </span>
                {atCap && (
                  <span className={s.capNote}>
                    {mode === "workbench"
                      ? `${MAX_SIM_QUBITS} is the in-browser simulator's ceiling`
                      : "Workbench mode goes further"}
                  </span>
                )}
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
                {run && (!caps.proactiveTutor || !run.finding) && (
                  <Button variant="ghost" size="sm" onClick={() => setTutorOpen((v) => !v)}>
                    Diagnosis
                  </Button>
                )}
                <Button variant="primary" onClick={() => execute()} disabled={running}>
                  {running ? "Running…" : "Run · ⌘↵"}
                </Button>
              </div>
            </div>

            {confirmRemove && (
              <div className={s.confirm} role="alertdialog" aria-label="Remove wire">
                <p>
                  q{lastWire} has {gatesOnLast} gate{gatesOnLast === 1 ? "" : "s"} on it. Remove the wire and
                  {gatesOnLast === 1 ? " that gate" : " those gates"}?
                </p>
                <div className={s.confirmActions}>
                  <Button variant="danger" size="sm" onClick={() => { removeQubit(); setConfirmRemove(false); }}>
                    Remove q{lastWire}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            )}

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
                <div className={s.diagnosisActions}>
                  {run.finding.fix && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => applyFix(run.finding!.fix!, run.finding!.misconception)}
                    >
                      {run.finding.fix.label}
                    </Button>
                  )}
                  <button
                    type="button"
                    className="label"
                    style={{ color: "var(--ink)" }}
                    onClick={() => void useTutor.getState().ask("Why is that wrong, and how do I fix it?")}
                  >
                    Ask the tutor why →
                  </button>
                </div>
              </div>
            )}

            {tutorOpen && run && !run.finding && (
              <div className={s.diagnosis} data-tone="calm">
                {advice ? (
                  <>
                    <span className="label">
                      {advice.ruleId === "O01_shorter_equivalent" ? "A shorter equivalent" : advice.ruleId}
                    </span>
                    <p className={s.diagnosisText} style={{ marginTop: 8 }}>{advice.message}</p>
                    {advice.fix && (
                      <div className={s.diagnosisActions}>
                        <Button variant="secondary" size="sm" onClick={() => applyFix(advice.fix!, advice.misconception)}>
                          {advice.fix.label}
                        </Button>
                        <span className={s.saveNote}>Undo brings yours back.</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className={s.diagnosisText}>
                    Nothing to flag. The rule engine found no misconception pattern in
                    this circuit, and no shorter way to write it — which is not the same
                    as saying it does what you intended.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* One state view at a time. */}
          <aside className={s.side}>
            <div className={s.panel}>
              <div className={s.panelHead}>
                <span className="label">
                  {view === "code" ? "Code" : scrubbing ? `State at step ${(scrubColumn ?? 0) + 1}` : "State"}
                </span>
                <Segmented<View> ariaLabel="State view" value={view} onChange={setView} options={VIEWS} />
              </div>

              {view === "code" ? (
                <CodePanel circuit={circuit} sdk={sdk} onSdk={setSdk} onApply={(c) => { replaceCircuit(c); setSavedId(null); }} />
              ) : !run ? (
                <p className={s.empty}>
                  {circuit.gates.length > 0 ? (
                    "Press Run to see what this circuit does."
                  ) : (
                    <>
                      Build a circuit and press Run. An empty circuit is a valid one —
                      it gives |{"0".repeat(Math.min(circuit.qubits, 8))}{circuit.qubits > 8 ? "…" : ""}⟩ every time.
                    </>
                  )}
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
                  {view === "bloch" && qubitStates && branchesAtCursor && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
                      <BlochRow states={qubitStates} size={126} />
                      <PairLinks branches={branchesAtCursor} qubits={run.result.qubits} />
                    </div>
                  )}
                  {view === "table" && <StateTable result={run.result} />}
                  {view === "density" && branchesAtCursor && (
                    <DensityMatrix
                      branches={branchesAtCursor}
                      qubits={run.result.qubits}
                      mixedRegister={branchesAtCursor.length > 1}
                    />
                  )}
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

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={loadImported}
        maxQubits={caps.maxQubits}
      />
      <ShortcutSheet open={keysOpen} onClose={() => setKeysOpen(false)} />
      <TutorDock where={BENCH} />
    </div>
  );
}

/* -- Saved circuits — PRD E11-S1 ------------------------------------------------ */

function SavedCircuits({
  onOpen,
  onClose,
  currentId,
}: {
  onOpen(id: string): void;
  onClose(): void;
  currentId: string | null;
}) {
  const { items, rename, remove } = useLibrary();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [doomed, setDoomed] = useState<string | null>(null);

  return (
    <section className={s.library} aria-label="Saved circuits">
      <div className={s.libraryHead}>
        <span className="label">Saved circuits · in this browser</span>
        <button type="button" className={s.restoredDismiss} onClick={onClose}>close</button>
      </div>

      {items.length === 0 ? (
        <p className={s.empty}>
          Circuits you save appear here. Everything you build in the workbench can
          be saved and shared by link.
        </p>
      ) : (
        <ul className={s.libraryList}>
          {items.map((item) => (
            <li key={item.id} className={s.libraryRow} data-current={item.id === currentId}>
              {editing === item.id ? (
                <form
                  className={s.renameForm}
                  onSubmit={(e) => { e.preventDefault(); rename(item.id, draft); setEditing(null); }}
                >
                  <Input autoFocus value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} aria-label="New name" />
                  <Button size="sm" variant="secondary" type="submit">Rename</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </form>
              ) : (
                <>
                  <button type="button" className={s.libraryName} onClick={() => onOpen(item.id)}>
                    {item.name}
                  </button>
                  <span className={s.libraryMeta}>
                    {item.circuit.qubits}q · {gateCount(item.circuit)} gates · {new Date(item.updatedAt).toLocaleDateString()}
                  </span>
                  <span className={s.libraryActions}>
                    {doomed === item.id ? (
                      <>
                        <Button size="sm" variant="danger" onClick={() => { remove(item.id); setDoomed(null); }}>Delete</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDoomed(null)}>Keep</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => onOpen(item.id)}>Open</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(item.id); setDraft(item.name); }}>Rename</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDoomed(item.id)}>Delete</Button>
                      </>
                    )}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
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
