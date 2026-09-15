"use client";

/**
 * The lesson player.
 *
 * Six beats, one screen — the screen changes SHAPE as the beats progress rather
 * than navigating between pages. That is what keeps a node feeling like three
 * minutes instead of a form to fill in.
 *
 * The density rule this file exists to enforce: ONE PRIMARY OBJECT AT A TIME.
 *
 *   brief   → the claim and the target shape. No canvas yet.
 *   build   → the canvas. The target shrinks to a reference strip; there are no
 *             state views, because there is no state worth reading yet.
 *   result  → the two plots at identical scale, then one sentence.
 *   pass    → what you built and the consequence you did not expect.
 *
 * Instruction never appears before an attempt. Productive failure only works if
 * the struggle comes first, so "why that worked" is a disclosure on the pass
 * screen, not a paragraph on the way in.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { GateTray, TrayHint } from "@/components/circuit/GateTray";
import { Histogram, probabilityMap, toFractions } from "@/components/viz/Histogram";
import { BlochRow } from "@/components/viz/BlochSphere";
import { StateTable } from "@/components/viz/StateTable";
import { CodePanel } from "@/components/code/CodePanel";
import { Button, Chip, Disclosure, MarginNote, Readout, Registration, Segmented } from "@/components/ui/primitives";
import { emptyCircuit, gateCount, nextGateId, type Circuit, type GateType } from "@/lib/ir/types";
import { allQubitStates } from "@/lib/sim/analysis";
import { targetProbabilities, targetNeedsPhase } from "@/lib/grade/fidelity";
import type { Sdk } from "@/lib/render";
import type { Finding } from "@/lib/tutor/rules";
import { hasEvent, track } from "@/lib/analytics";
import { useCircuit } from "@/stores/circuitStore";
import { MODE, isNodeOpen, useSession } from "@/stores/sessionStore";
import { NODES, NODES_BY_ID, nextNodeId, unitOf, type LessonNode } from "@/lib/curriculum/nodes";
import s from "./LessonPlayer.module.css";

// Kept importable from here, where it used to live.
export { CodePanel };

type Beat = "brief" | "build" | "pass";
type StateView = "bloch" | "table" | "code";

const STATE_VIEWS: Array<{ value: StateView; label: string }> = [
  { value: "bloch", label: "Bloch" },
  { value: "table", label: "Table" },
  { value: "code", label: "Code" },
];

export function LessonPlayer({ node }: { node: LessonNode }) {
  const unit = unitOf(node.id);
  const {
    mode, progress, hydrated, recordAttempt, recordConsolidation, recordMisconception, hydrate,
  } = useSession();
  const caps = MODE[mode];

  const {
    circuit, version, setCircuit, replaceCircuit, held, pendingControl, selectedGateId, highlighted,
    run, running, error,
    hold, place, completeControlled, cancelPending, select, moveGate, removeGate, setParams,
    execute, applyFix, undo, clearRun,
  } = useCircuit();

  const [beat, setBeat] = useState<Beat>("brief");
  const [view, setView] = useState<StateView>("bloch");
  const [sdk, setSdk] = useState<Sdk>("qiskit");
  const [attempts, setAttempts] = useState(0);
  const [consolidating, setConsolidating] = useState(false);

  /** When the last failed run landed, for the S3 metric. */
  const lastFailure = useRef<{ at: number; tutorShown: boolean } | null>(null);
  /** The circuit version produced by applying code, for the S2 metric. */
  const codeVersion = useRef<number | null>(null);

  useEffect(() => { hydrate(); }, [hydrate]);

  // Read from the URL rather than useSearchParams: this page is statically
  // generated per node, and pulling in the search-params hook would make all
  // nineteen dynamic for the sake of one optional flag.
  useEffect(() => {
    setConsolidating(new URLSearchParams(window.location.search).get("consolidate") === "1");
  }, [node.id]);

  /* -- Load the node's starting circuit ------------------------------------- */

  const startingCircuit = useCallback((): Circuit => {
    const c = emptyCircuit(node.qubits, node.title);
    if (node.starter) {
      c.gates = node.starter.map((g) => ({
        id: nextGateId(),
        type: g.type,
        targets: g.targets,
        controls: g.controls ?? [],
        params: g.params ?? [],
        column: g.column,
        ...(g.type === "measure" ? { clbit: g.targets[0] } : {}),
      }));
    }
    return c;
  }, [node]);

  useEffect(() => {
    setCircuit(startingCircuit());
    setBeat("brief");
    setAttempts(0);
    lastFailure.current = null;
    codeVersion.current = null;
    // A fresh node starts clean: no carried-over verdict from the last one.
  }, [node.id, setCircuit, startingCircuit]);

  // After applying code, the store bumps its version once. Capture that
  // version so a later canvas edit can be told apart from the code's result.
  const awaitingCodeVersion = useRef(false);
  useEffect(() => {
    if (awaitingCodeVersion.current) {
      codeVersion.current = version;
      awaitingCodeVersion.current = false;
    }
  }, [version]);

  /* -- Target --------------------------------------------------------------- */

  const targetMap = useMemo(
    () => probabilityMap(targetProbabilities(node.target), node.qubits),
    [node],
  );
  const phaseMatters = useMemo(() => targetNeedsPhase(node.target), [node]);

  const lockedGates = useMemo<GateType[]>(() => {
    if (!caps.lockedGates) return [];
    // Show a couple of the gates this node does not open yet, so the shape of
    // what is coming is visible without crowding the tray.
    const allowed = new Set(node.allowedGates);
    return (["cx", "s", "t", "swap", "ccx"] as GateType[])
      .filter((g) => !allowed.has(g))
      .slice(0, 3);
  }, [caps.lockedGates, node.allowedGates]);

  /* -- Run ------------------------------------------------------------------ */

  function onRun() {
    execute(node.target);
    setAttempts((a) => a + 1);
  }

  // Commit the result to progress once, when it lands.
  useEffect(() => {
    if (!run?.grade) return;
    // A consolidation pass is re-derivation, not a fresh attempt: it must not
    // touch first-attempt accuracy or hand out XP a second time (E6-S5).
    if (!consolidating) {
      recordAttempt(node.id, run.grade.passed, run.grade.fidelity, gateCount(circuit));
    }
    if (run.finding?.misconception) {
      recordMisconception(run.finding.misconception, run.finding.ruleId, node.id);
    }

    if (!run.grade.passed) {
      const tutorShown = Boolean(run.finding);
      if (tutorShown && caps.proactiveTutor) {
        track("tutor_invoked", { trigger: "proactive", source: "rule", latency_ms: 0 });
      }
      lastFailure.current = { at: Date.now(), tutorShown };
    }

    if (run.grade.passed) {
      // PRD §8, S3: how long from a failed run to a corrected one.
      if (lastFailure.current) {
        track("corrected_after_failure", {
          node_id: node.id,
          seconds_since_failure: Math.round((Date.now() - lastFailure.current.at) / 1000),
          tutor_shown: lastFailure.current.tutorShown,
        });
        lastFailure.current = null;
      }
      // PRD §8, S2 — the headline metric: a correct circuit written as code.
      if (codeVersion.current !== null && codeVersion.current === version && !hasEvent("code_mode_first_correct", { node_id: node.id })) {
        const firstCanvasPass = NODES
          .map((n) => progress[n.id]?.passedAt ?? null)
          .filter((t): t is number => t !== null)
          .sort((a, b) => a - b)[0];
        track("code_mode_first_correct", {
          node_id: node.id,
          days_since_first_canvas_node: firstCanvasPass ? Math.floor((Date.now() - firstCanvasPass) / 86_400_000) : null,
        });
      }
      if (consolidating) recordConsolidation(node.id);
      setBeat("pass");
    }
    // Only react to a genuinely new run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.at]);

  const qubitStates = useMemo(
    () => (run ? allQubitStates(run.result) : undefined),
    [run],
  );

  const nextId = nextNodeId(node.id);
  const locked = hydrated && !isNodeOpen(progress, node.id);

  /* -- Keyboard: ⌘↵ runs ---------------------------------------------------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && beat === "build") {
        e.preventDefault();
        onRun();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && beat === "build") {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ======================================================================== */

  // A route is not an authorisation. Reaching a locked node by URL, by an
  // out-of-date link, or by the back button lands here rather than in a lesson
  // whose prerequisites the learner has not met.
  if (locked) {
    const blocker = node.prerequisites
      .map((id) => NODES_BY_ID.get(id)?.title)
      .filter(Boolean)[0];
    return (
      <div className={s.shell}>
        <nav className={s.crumb}>
          <Link href="/path" className={`label ${s.back}`}>
            ← Path
          </Link>
        </nav>
        <div style={{ maxWidth: "52ch", paddingTop: "var(--s-7)" }}>
          <h1 className="statement statement--s">This one is not open yet.</h1>
          <p className="prose" style={{ marginTop: "var(--s-4)" }}>
            {blocker
              ? `“${node.title}” opens once you have finished “${blocker}” — and once the unit before it is consolidated.`
              : `“${node.title}” is not available yet.`}
          </p>
          <div style={{ marginTop: "var(--s-5)" }}>
            <Button variant="primary" onClick={() => (window.location.href = "/path")}>
              Back to the path
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.shell}>
      <nav className={s.crumb}>
        <span className={s.crumbLeft}>
          <Link href="/path" className={`label ${s.back}`}>
            ← {unit?.title ?? "Path"}
          </Link>
          <span className="label">
            node {node.ordinal} · {node.estMinutes} min
          </span>
        </span>
        <span style={{ display: "flex", gap: "var(--s-3)", alignItems: "center" }}>
          {consolidating && <Chip tone="flag" dot>consolidating</Chip>}
          {beat === "build" && attempts > 0 && (
            <span className="label">
              {attempts} run{attempts === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </nav>

      {beat === "brief" && (
        <Brief
          node={node}
          targetMap={targetMap}
          phaseMatters={phaseMatters}
          consolidating={consolidating}
          onStart={() => {
            track("node_started", { node_id: node.id, unit_id: node.unitId });
            setBeat("build");
          }}
        />
      )}

      {beat === "build" && (
        <>
          <div className={s.taskStrip}>
            <div>
              <p className={s.taskStripText}>{node.task}</p>
              {node.taskNote && !run && (
                <p style={{ color: "var(--ink-muted)", marginTop: 6, fontSize: "var(--t-body)" }}>
                  {node.taskNote}
                </p>
              )}
            </div>
          </div>

          <div className={s.workspace}>
            <div>
              <div className={s.stage}>
                <Registration />
                <div className={s.stageBody}>
                  <CircuitCanvas
                    circuit={circuit}
                    minColumns={4}
                    selectedGateId={selectedGateId}
                    highlighted={highlighted}
                    qubitStates={qubitStates}
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

                <div className={s.stageFoot}>
                  <div className={s.trayRow}>
                    <GateTray
                      available={node.allowedGates}
                      locked={lockedGates}
                      held={held?.type ?? null}
                      onPick={(t) => hold(t)}
                    />
                  </div>
                  <div className={s.runRow}>
                    {selectedGateId && (
                      <Button variant="ghost" size="sm" onClick={() => removeGate(selectedGateId)}>
                        Delete
                      </Button>
                    )}
                    <Button variant="primary" onClick={onRun} disabled={running}>
                      {running ? "Running…" : "Run · ⌘↵"}
                    </Button>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "var(--s-3)" }}>
                <TrayHint held={held?.type ?? null} pending={pendingControl} />
              </div>

              {error && (
                <div className={s.diagnosis} role="alert">
                  <div className={s.diagnosisHead}>
                    <Chip tone="error" dot>
                      {error.code.replace("_", " ")}
                    </Chip>
                  </div>
                  <p className={s.diagnosisText}>{error.message}</p>
                  <p style={{ fontSize: "var(--t-body)", color: "var(--ink-3)" }}>
                    Nothing was lost — your circuit is exactly as you left it.
                  </p>
                </div>
              )}

              {/* The verdict, in place beneath the circuit. */}
              {run && run.grade && !run.grade.passed && (
                <div className={s.diagnosis}>
                  <div className={s.diagnosisHead}>
                    <Chip tone="error" dot>
                      fidelity {run.grade.fidelity.toFixed(3)}
                    </Chip>
                    {run.finding?.misconception && (
                      <span className="label">{run.finding.misconception}</span>
                    )}
                  </div>

                  <p className={s.diagnosisText}>
                    {run.finding?.message ??
                      `Fidelity ${run.grade.fidelity.toFixed(3)}. The state this circuit produces isn't the target one yet.`}
                  </p>

                  <div className={s.diagnosisActions}>
                    {run.finding?.fix && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          applyFix(run.finding!.fix!, run.finding!.misconception);
                          clearRun();
                        }}
                      >
                        {run.finding.fix.label}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={clearRun}>
                      Keep editing
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* The reference column. Small on purpose: the target is a
                reminder here, not a co-equal panel. */}
            <aside className={s.side}>
              <div className="panel">
                <div className={s.targetHead}>
                  <span className="label">Target</span>
                  {node.target.label && <span className="label label--ink">{node.target.label}</span>}
                </div>
                <Histogram
                  qubits={node.qubits}
                  actual={targetMap}
                  height={104}
                  dense
                />
                {phaseMatters && (
                  <p style={{ fontSize: "var(--t-body)", color: "var(--ink-muted)", marginTop: "var(--s-3)" }}>
                    The odds are only half of it — this target has a phase to match too.
                  </p>
                )}
              </div>

              {run && (
                <div className="panel">
                  <div className={s.viewHead}>
                    <span className="label">Your state</span>
                    <Segmented<StateView>
                      ariaLabel="State view"
                      value={view}
                      onChange={setView}
                      options={STATE_VIEWS}
                    />
                  </div>
                  <div className={s.viewBody}>
                    {view === "bloch" && qubitStates && <BlochRow states={qubitStates} size={122} />}
                    {view === "table" && <StateTable result={run.result} />}
                    {view === "code" && (
                      <CodePanel
                        circuit={circuit}
                        sdk={sdk}
                        onSdk={setSdk}
                        allowedGates={node.allowedGates}
                        requiredQubits={node.qubits}
                        onApply={(c) => {
                          awaitingCodeVersion.current = true;
                          replaceCircuit({ ...c, metadata: { ...c.metadata, name: node.title } });
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </aside>
          </div>
        </>
      )}

      {beat === "pass" && run && (
        <Pass
          node={node}
          circuit={circuit}
          countsMap={toFractions(run.counts.counts, run.shots)}
          targetMap={targetMap}
          shots={run.shots}
          fidelity={run.grade?.fidelity ?? 1}
          advice={run.advice}
          qubitStates={qubitStates ?? []}
          nextId={nextId}
          onReview={() => {
            setCircuit(startingCircuit());
            setBeat("build");
          }}
          onTryShorter={(c) => {
            setCircuit({ ...c, metadata: { ...c.metadata, name: node.title } });
            setBeat("build");
          }}
        />
      )}
    </div>
  );
}

/* -- Beat 1: the brief -------------------------------------------------------- */

function Brief({
  node,
  targetMap,
  phaseMatters,
  consolidating,
  onStart,
}: {
  node: LessonNode;
  targetMap: Record<string, number>;
  phaseMatters: boolean;
  consolidating: boolean;
  onStart(): void;
}) {
  return (
    <div className={s.brief}>
      <div>
        {consolidating && (
          <p style={{ marginBottom: "var(--s-4)", color: "var(--ink-3)", fontSize: "var(--t-body)" }}>
            You have already passed this one. Re-deriving it opens the next unit,
            and nothing here is scored again.
          </p>
        )}
        <h1 className={`statement statement--s ${s.hook}`}>{node.hook}</h1>
        <p className={s.taskLine}>{node.task}</p>
        {node.taskNote && <p className={s.taskNote}>{node.taskNote}</p>}
        <Button variant="primary" size="lg" onClick={onStart}>
          {consolidating ? "Build it again" : "Build it"}
        </Button>
      </div>

      <div className={s.targetCard}>
        <Registration />
        <div className={s.targetHead}>
          <span className="label">Aiming at</span>
          {node.target.label && <span className="label label--ink">{node.target.label}</span>}
        </div>
        <Histogram qubits={node.qubits} actual={targetMap} height={128} dense />
        <p style={{ fontSize: "var(--t-body)", color: "var(--ink-3)", marginTop: "var(--s-4)" }}>
          {phaseMatters
            ? "This shape, and the phase behind it. The grader checks both."
            : "Any circuit that produces this shape passes. There is more than one."}
        </p>
      </div>
    </div>
  );
}

/* -- Beat 6: the pass --------------------------------------------------------- */

function Pass({
  node,
  circuit,
  countsMap,
  targetMap,
  shots,
  fidelity,
  advice,
  qubitStates,
  nextId,
  onReview,
  onTryShorter,
}: {
  node: LessonNode;
  circuit: Circuit;
  countsMap: Record<string, number>;
  targetMap: Record<string, number>;
  shots: number;
  fidelity: number;
  /** A shorter equivalent (E7-S6) or an advisory lint. Offered, never pressed on. */
  advice: Finding | null;
  qubitStates: ReturnType<typeof allQubitStates>;
  nextId: string | null;
  onReview(): void;
  onTryShorter(c: Circuit): void;
}) {
  const used = gateCount(circuit);

  return (
    <div className={s.pass}>
      <div className={s.verdictBar}>
        <Readout value={fidelity.toFixed(3)} label="fidelity" tone="measure" />
        <Readout value={used} label="gates" />
        <Readout value={shots} label="shots" />
      </div>

      <div className={s.passPlot}>
        <Registration />
        <Histogram
          qubits={node.qubits}
          actual={countsMap}
          target={targetMap}
          shots={shots}
          height={150}
          hit={Object.keys(targetMap)}
          dense
        />
      </div>

      {/* States what was built and names the consequence they did not expect.
          No confetti — a fact they did not have thirty seconds ago. */}
      <h2 className="statement statement--s" style={{ maxWidth: "22ch" }}>
        {node.instructionTitle}
      </h2>
      <p className="prose">{node.passNote}</p>

      {advice && (
        <MarginNote label={advice.ruleId === "O01_shorter_equivalent" ? "A shorter way" : "Also worth knowing"}>
          {advice.message}
          {advice.fix?.kind === "replace_circuit" && (
            <span style={{ display: "block", marginTop: "var(--s-2)" }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => advice.fix?.kind === "replace_circuit" && onTryShorter(advice.fix.circuit)}
              >
                Build the shorter one →
              </Button>
            </span>
          )}
        </MarginNote>
      )}

      {/* Instruction is a disclosure, and it comes AFTER the attempt. */}
      <Disclosure label="Why that worked">
        <p className="prose">{node.instruction}</p>
      </Disclosure>

      <Disclosure label="See it in code">
        <CodePanel circuit={circuit} sdk="qiskit" />
      </Disclosure>

      <p className={s.parLine}>
        {used === node.par
          ? `Par is ${node.par} gates. You used ${used}.`
          : used < node.par
            ? `Par is ${node.par} gates. You used ${used} — shorter than par.`
            : `Someone solved this in ${node.par} gates. You used ${used}. Both are correct.`}
      </p>

      <div className={s.passActions}>
        {nextId ? (
          <Button variant="primary" size="lg" onClick={() => (window.location.href = `/lesson/${nextId}`)}>
            Next node →
          </Button>
        ) : (
          <Button variant="primary" size="lg" onClick={() => (window.location.href = "/path")}>
            Back to the path →
          </Button>
        )}
        <Button variant="ghost" onClick={onReview}>
          Build it again
        </Button>
      </div>
    </div>
  );
}

