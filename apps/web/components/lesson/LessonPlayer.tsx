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
import { KetBeside } from "@/components/mascot/KetWatch";
import { isLocked, lockedGates as lessonLockedGates, oracleGates, oracleMiss, oracleResults, reservedColumns } from "@/lib/curriculum/oracle";
import { GateTray, TrayHint } from "@/components/circuit/GateTray";
import { Histogram, probabilityMap, toFractions } from "@/components/viz/Histogram";
import { BlochRow } from "@/components/viz/BlochSphere";
import { StateTable } from "@/components/viz/StateTable";
import { CodePanel } from "@/components/code/CodePanel";
import { GateMark } from "@/components/circuit/GateMark";
import { GATES } from "@/lib/ir/gates";
import { VideoDisclosure } from "@/components/lesson/VideoDisclosure";
import { StudyQuiz } from "@/components/lesson/StudyQuiz";
import { StepThrough } from "@/components/lesson/StepThrough";
import { notesFor, quizFor } from "@/lib/curriculum/study";
import { Button, Chip, Disclosure, MarginNote, Readout, Registration, Segmented, Slider } from "@/components/ui/primitives";
import { circuitDepth, emptyCircuit, gateCount, nextGateId, type Circuit, type GateType } from "@/lib/ir/types";
import { allQubitStates, qubitState } from "@/lib/sim/analysis";
import { targetProbabilities, targetNeedsPhase } from "@/lib/grade/fidelity";
import type { Sdk } from "@/lib/render";
import type { Finding } from "@/lib/tutor/rules";
import { hasEvent, track } from "@/lib/analytics";
import { stateAtScrub, useCircuit, type RunOutput } from "@/stores/circuitStore";
import { MODE, isNodeOpen, useSession } from "@/stores/sessionStore";
import { NODES, NODES_BY_ID, nextNodeId, unitOf, unmetRequirement, type LessonNode } from "@/lib/curriculum/nodes";
import { clearPop, dismissPop, popHint, popMissingStep, popNewWords, popWin } from "@/components/tutor/moments";
import { logAttempt } from "@/lib/sync/attempts";
import s from "./LessonPlayer.module.css";

// Kept importable from here, where it used to live.
export { CodePanel };

type Beat = "brief" | "build" | "pass";
type StateView = "plot" | "bloch" | "table" | "code";

/**
 * Plot first, and the default.
 *
 * The lesson used to offer Bloch, Table and Code — so a learner could see the
 * target's histogram and never their own. The verdict was a fidelity number and
 * a sentence, with the one comparison that matters missing from the screen.
 * Design Doc §5 asks for "the two plots at identical scale, so the comparison
 * is visual before it is numerical", and this is where that happens.
 *
 * Defaulting to Bloch was also wrong on the way in: the sphere is not taught
 * until u1.n4, and node one opened with an unexplained one.
 */
const STATE_VIEWS: Array<{ value: StateView; label: string }> = [
  { value: "plot", label: "Plot" },
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
    run, running, error, scrubColumn,
    hold, place, completeControlled, cancelPending, select, moveGate, dropGate, rewireGate, removeGate, setParams,
    execute, applyFix, undo, clearRun, setScrub, setReserved, swapOracle,
  } = useCircuit();

  const [beat, setBeat] = useState<Beat>("brief");
  const [view, setView] = useState<StateView>("plot");
  const [sdk, setSdk] = useState<Sdk>("qiskit");
  const [attempts, setAttempts] = useState(0);
  const [consolidating, setConsolidating] = useState(false);
  /** Both on ask, both reset per node. Neither is ever volunteered. */
  const [nudgeShown, setNudgeShown] = useState(false);
  const [ideaShown, setIdeaShown] = useState(false);
  /** Which function the oracle box holds right now, on an oracle node. */
  const [variant, setVariant] = useState(0);

  /** When the last failed run landed, for the S3 metric. */
  const lastFailure = useRef<{ at: number; tutorShown: boolean } | null>(null);
  /** The circuit version produced by applying code, for the S2 metric. */
  const codeVersion = useRef<number | null>(null);

  useEffect(() => { hydrate(); }, [hydrate]);

  // Read from the URL rather than useSearchParams: this page is statically
  // generated per node, and pulling in the search-params hook would make all
  // lessons dynamic for the sake of one optional flag.
  useEffect(() => {
    setConsolidating(new URLSearchParams(window.location.search).get("consolidate") === "1");
  }, [node.id]);

  /* -- Load the node's starting circuit ------------------------------------- */

  const startingCircuit = useCallback((): Circuit => {
    const c = emptyCircuit(node.qubits, node.title);
    const starter = node.starter ?? [];
    c.gates = [
      // The lesson's own gates (a helper qubit's preparation): shown, locked.
      ...lessonLockedGates(starter.filter((g) => g.locked)),
      ...starter.filter((g) => !g.locked).map((g) => ({
        id: nextGateId(),
        type: g.type,
        targets: g.targets,
        controls: g.controls ?? [],
        params: g.params ?? [],
        column: g.column,
        ...(g.type === "measure" ? { clbit: g.targets[0] } : {}),
      })),
      ...(node.oracle ? oracleGates(node.oracle, 0) : []),
    ];
    return c;
  }, [node]);

  /** The node's starting circuit, with the box's columns held and f₁ in it. */
  const loadStart = useCallback(() => {
    setCircuit(startingCircuit());
    setReserved(node.oracle ? reservedColumns(node.oracle) : null);
    setVariant(0);
  }, [node, setCircuit, setReserved, startingCircuit]);

  useEffect(() => {
    loadStart();
    setBeat("brief");
    setAttempts(0);
    setNudgeShown(false);
    setIdeaShown(false);
    lastFailure.current = null;
    codeVersion.current = null;
    // A fresh node starts clean: no carried-over verdict from the last one.
  }, [node.id, loadStart]);

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

  const activeTarget = node.oracle ? node.oracle.variants[variant]?.target ?? node.target : node.target;
  const targetMap = useMemo(
    () => probabilityMap(targetProbabilities(activeTarget), node.qubits),
    [activeTarget, node.qubits],
  );
  const phaseMatters = useMemo(() => targetNeedsPhase(activeTarget), [activeTarget]);
  /** The lesson placed gates the learner cannot edit: code must not replace them. */
  const hasLocked = Boolean(node.oracle || node.starter?.some((g) => g.locked));

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
    // A cursor left in the middle of the previous circuit would silently show
    // the wrong step against the new result.
    setScrub(null);
    clearPop();
    execute(activeTarget);
    setAttempts((a) => a + 1);
  }

  // Commit the result to progress once, when it lands.
  useEffect(() => {
    if (!run?.grade) return;
    // The right state reached without the move the node teaches is not a pass.
    const missing = run.grade.passed
      ? unmetRequirement(node, circuit) ?? (node.oracle ? oracleMiss(circuit, node.oracle) : null)
      : null;
    const passed = run.grade.passed && !missing;
    // A consolidation pass is re-derivation, not a fresh attempt: it must not
    // touch first-attempt accuracy or hand out XP a second time (E6-S5).
    if (!consolidating) {
      recordAttempt(node.id, passed, run.grade.fidelity, learnerGateCount(circuit));
    }
    if (run.finding?.misconception) {
      recordMisconception(run.finding.misconception, run.finding.ruleId, node.id);
    }

    if (!passed) {
      if (missing) popMissingStep(missing);
      else popHint(run.finding, circuit, run.grade.fidelity);
      logAttempt(`lesson:${node.id}`, circuit, run.grade.fidelity, run.finding);
      const tutorShown = Boolean(run.finding);
      if (tutorShown && caps.proactiveTutor) {
        track("tutor_invoked", { trigger: "proactive", source: "rule", latency_ms: 0 });
      }
      lastFailure.current = { at: Date.now(), tutorShown };
    }

    if (passed) {
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
      popWin(attempts <= 1 ? "First try, too." : undefined);
      setBeat("pass");
    }
    // Only react to a genuinely new run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.at]);

  /* -- The scrubber ---------------------------------------------------------
     Every state view winds with the cursor rather than showing only the end,
     because the rotation IS the gate. u0.n3 is the node this exists for: the
     final state of H·H is |0⟩, identical to where it started, and the only
     place the lesson lives is the middle column. A static end-state view
     cannot show it at all.
     ------------------------------------------------------------------------- */

  const depth = circuitDepth(circuit) + 1;

  const branchesAtCursor = useMemo(
    () => stateAtScrub(run, scrubColumn),
    [run, scrubColumn],
  );

  const qubitStates = useMemo(() => {
    if (!run) return undefined;
    if (!branchesAtCursor) return allQubitStates(run.result);
    return Array.from({ length: run.result.qubits }, (_, q) =>
      qubitState(branchesAtCursor, run.result.qubits, q),
    );
  }, [branchesAtCursor, run]);

  /**
   * Exact probabilities at the cursor, so the plot winds with the scrubber.
   *
   * Sampling only exists at the end of a circuit — there are no shots halfway
   * through one — so a scrubbed plot shows the true distribution and drops the
   * shot count rather than inventing counts for a moment that was never run.
   */
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

  /** The run as it stands at the cursor, so the amplitude table winds too. */
  const cursorResult = useMemo(
    () => (run && branchesAtCursor ? { ...run.result, branches: branchesAtCursor } : null),
    [run, branchesAtCursor],
  );

  const scrubbing = scrubColumn !== null;

  /** The move this node teaches, when the run reached the state without it. */
  const requirementMiss = useMemo(
    () => (run?.grade?.passed ? unmetRequirement(node, circuit) : null),
    // Judged against the circuit as it was run, not as it is being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run?.at, node],
  );
  /** Right for the function on show, wrong for another the box could hide. */
  const oracleShortfall = useMemo(
    () => (run?.grade?.passed && node.oracle ? oracleMiss(circuit, node.oracle) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run?.at, node],
  );
  const missingStep = requirementMiss ?? oracleShortfall;
  /** How the last run did against every function the box can hide. */
  const variantResults = useMemo(
    () => (run && node.oracle ? oracleResults(circuit, node.oracle) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run?.at, node],
  );

  const nextId = nextNodeId(node.id);
  const locked = hydrated && !isNodeOpen(progress, node.id);

  // The words this node introduces, the first time a learner opens it. Waits
  // for the session, so the mode is known before the tutor decides to speak,
  // and only while the brief is up: a learner who has already pressed Build
  // is past the point where a vocabulary card helps.
  const onBrief = beat === "brief";
  useEffect(() => {
    if (!hydrated || locked || !onBrief) return;
    const t = setTimeout(() => popNewWords(node.id), 700);
    return () => clearTimeout(t);
  }, [node.id, hydrated, locked, onBrief]);

  // Nothing the tutor said on one node applies on the next.
  useEffect(() => dismissPop, [node.id]);

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
                  <KetBeside circuit={circuit} live selectedGateId={selectedGateId}>
                    <CircuitCanvas
                      circuit={circuit}
                      minColumns={4}
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
                      onDrop={dropGate}
                      onRewire={rewireGate}
                      onRemove={removeGate}
                      onParams={setParams}
                      pointAt={caps.proactiveTutor && run && !run.grade?.passed ? highlighted[0] ?? null : null}
                      box={node.oracle ? {
                        from: node.oracle.column,
                        to: node.oracle.column + node.oracle.width - 1,
                        label: node.oracle.label,
                        name: node.oracle.variants[variant]?.name,
                        hidden: true,
                      } : null}
                    />
                  </KetBeside>
                </div>

                {/* Aligned with the circuit above it. Dragging winds every
                    state view backwards through the gates — the signature
                    interaction from Design Doc §3, and the only way to see a
                    state that the end of the circuit has already undone. */}
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

              {node.oracle && (
                <div className={s.oracleBar}>
                  <span className="label">The box hides one of</span>
                  <div className={s.oracleChips} role="group" aria-label="Function in the box">
                    {node.oracle.variants.map((v, i) => {
                      const r = variantResults?.[i];
                      return (
                        <button
                          key={v.name}
                          type="button"
                          className={s.oracleChip}
                          aria-pressed={i === variant}
                          data-result={r ? (r.passed ? "pass" : "fail") : undefined}
                          aria-label={`${v.name}${r ? (r.passed ? ", right" : ", wrong") : ""}`}
                          onClick={() => {
                            if (i === variant || !node.oracle) return;
                            swapOracle(oracleGates(node.oracle, i));
                            setVariant(i);
                          }}
                        >
                          {v.name}
                          {r && <span aria-hidden>{r.passed ? " ✓" : " ✗"}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <span className={s.oracleNote}>
                    {variantResults
                      ? `Right for ${variantResults.filter((r) => r.passed).length} of ${variantResults.length}. Every run checks all of them.`
                      : "Every run checks all of them. Switch to see each one's result."}
                  </span>
                </div>
              )}

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
                    Your circuit is untouched.
                  </p>
                </div>
              )}

              {/* The verdict, in place beneath the circuit. */}
              {run && run.grade && (!run.grade.passed || missingStep) && (
                <div className={s.diagnosis} data-tone={missingStep ? "flag" : undefined}>
                  <div className={s.diagnosisHead}>
                    <Chip tone={missingStep ? "flag" : "error"} dot>
                      {missingStep
                        ? requirementMiss ? "right state · one step missing" : "right for this f · not for all"
                        : `fidelity ${run.grade.fidelity.toFixed(3)}`}
                    </Chip>
                    {run.finding?.misconception && (
                      <span className="label">{run.finding.misconception}</span>
                    )}
                  </div>

                  <p className={s.diagnosisText}>
                    {missingStep ?? run.finding?.message ??
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
                    {attempts >= 2 && !nudgeShown && (
                      <Button variant="ghost" size="sm" onClick={() => setNudgeShown(true)}>
                        I'm stuck
                      </Button>
                    )}
                    {attempts >= 3 && nudgeShown && !ideaShown && (
                      <Button variant="ghost" size="sm" onClick={() => setIdeaShown(true)}>
                        Explain the idea
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={clearRun}>
                      Keep editing
                    </Button>
                  </div>

                  {/* Productive failure ends in instruction — it is not
                      "struggle indefinitely". Kapur's sequence is attempt,
                      then teach, and a learner on their fourth run has done
                      the attempting. Both of these are on ask and neither is
                      ever volunteered. */}
                  {nudgeShown && (
                    <p className={s.stuckNote}>
                      {node.taskNote ?? `You have everything you need in the tray: ${node.allowedGates
                        .filter((g) => g !== "measure")
                        .map((g) => g.toUpperCase())
                        .join(", ")}.`}
                    </p>
                  )}
                  {ideaShown && (
                    <p className={s.stuckNote}>
                      <b>{node.instructionTitle}.</b> {node.instruction}
                    </p>
                  )}
                  {attempts < 3 && nudgeShown && !ideaShown && (
                    <p className={s.stuckNote} data-quiet>
                      One more run unlocks the explanation.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* The reference column. Small on purpose: the target is a
                reminder here, not a co-equal panel. */}
            <aside className={s.side}>
              <div className="panel">
                <div className={s.targetHead}>
                  <span className="label">Target</span>
                  {!node.oracle && activeTarget.label && <span className="label label--ink">{activeTarget.label}</span>}
                </div>
                {node.oracle ? (
                  <p className={s.oracleRule}>{node.oracle.rule}</p>
                ) : (
                  <Histogram
                    qubits={node.qubits}
                    actual={targetMap}
                    height={104}
                    dense
                  />
                )}
                {phaseMatters && !node.oracle && (
                  <p style={{ fontSize: "var(--t-body)", color: "var(--ink-muted)", marginTop: "var(--s-3)" }}>
                    The odds are only half of it — this target has a phase to match too.
                  </p>
                )}
              </div>

              {run && (
                <div className="panel">
                  <div className={s.viewHead}>
                    {/* Says which state is on screen. Without this a scrubbed
                        view is indistinguishable from the final one. */}
                    <span className="label">
                      {scrubbing ? `Your state · step ${scrubColumn! + 1}` : "Your state"}
                    </span>
                    <Segmented<StateView>
                      ariaLabel="State view"
                      value={view}
                      onChange={setView}
                      options={STATE_VIEWS}
                    />
                  </div>
                  <div className={s.viewBody}>
                    {/* Yours in solid, the target as the dashed ghost behind
                        it. One plot, not two side by side — the gap between
                        the bars IS the verdict, and it cannot be read across
                        two charts at different scales. */}
                    {view === "plot" && (
                      <Histogram
                        qubits={node.qubits}
                        actual={
                          scrubbing && cursorProbabilities
                            ? probabilityMap(cursorProbabilities, node.qubits)
                            : toFractions(run.counts.counts, run.shots)
                        }
                        target={scrubbing ? undefined : targetMap}
                        shots={scrubbing ? undefined : run.shots}
                        hit={run.grade?.passed ? Object.keys(targetMap) : undefined}
                        height={150}
                        dense
                      />
                    )}
                    {view === "bloch" && qubitStates && <BlochRow states={qubitStates} size={122} />}
                    {view === "table" && cursorResult && <StateTable result={cursorResult} />}
                    {view === "code" && (
                      <CodePanel
                        circuit={circuit}
                        sdk={sdk}
                        highlighted={highlighted}
                        onSdk={setSdk}
                        allowedGates={node.allowedGates}
                        requiredQubits={node.qubits}
                        onApply={hasLocked ? undefined : (c) => {
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
          advice={node.oracle ? null : run.advice}
          run={run}
          nextId={nextId}
          onReview={() => {
            loadStart();
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

/**
 * Gates the learner placed. The lesson's own (a helper's preparation, an
 * oracle box) are not theirs, so they count toward neither par nor the record.
 */
function learnerGateCount(circuit: Circuit): number {
  return gateCount({ ...circuit, gates: circuit.gates.filter((g) => !isLocked(g.id)) });
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
  const unitNo = Number(node.unitId.replace(/\D/g, "")) || 0;
  const tray = node.allowedGates.filter((g) => g !== "barrier").slice(0, 8);
  return (
    <div className={s.brief} style={{ ["--u" as string]: `var(--unit-${unitNo % 5})` }}>
      <OrbitArt />
      <div className={s.briefText}>
        <span className={s.unitPill}>
          <span className={s.unitDot} aria-hidden />
          Unit {unitNo} · node {node.ordinal} · {node.estMinutes} min
        </span>
        {consolidating && (
          <p style={{ marginBottom: "var(--s-4)", color: "var(--ink-3)", fontSize: "var(--t-body)" }}>
            You have already passed this one. Re-deriving it opens the next unit,
            and nothing here is scored again.
          </p>
        )}
        <h1 className={`statement statement--s ${s.hook}`}>{node.hook}</h1>
        <p className={s.taskLine}>{node.task}</p>
        {node.taskNote && <p className={s.taskNote}>{node.taskNote}</p>}
        <div className={s.briefActions}>
          <Button variant="primary" size="lg" onClick={onStart}>
            {consolidating ? "Build it again" : "Build it"}
          </Button>
          {tray.length > 0 && (
            <div className={s.trayPeek} aria-label="Gates in your tray">
              <span className={s.trayLabel}>Your tray</span>
              {tray.map((g) => (
                <span key={g} className={s.trayGate} title={GATES[g].name}>
                  <GateMark spec={GATES[g]} />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={s.targetCard}>
        <Registration />
        <div className={s.targetHead}>
          <span className="label">Aiming at</span>
          {node.target.label && <span className="label label--ink">{node.target.label}</span>}
        </div>
        {node.oracle ? (
          <>
            <p className={s.oracleRule}>{node.oracle.rule}</p>
            <p style={{ fontSize: "var(--t-body)", color: "var(--ink-3)", marginTop: "var(--s-4)" }}>
              The box hides one of {node.oracle.variants.length} functions. One circuit has to be right for all of them.
            </p>
          </>
        ) : (
          <>
            <Histogram qubits={node.qubits} actual={targetMap} height={128} dense />
            <p style={{ fontSize: "var(--t-body)", color: "var(--ink-3)", marginTop: "var(--s-4)" }}>
              {phaseMatters
                ? "This shape, and the phase behind it. The grader checks both."
                : "Any circuit that produces this shape passes. There is more than one."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Decoration for the opening screen: a Bloch sphere in the unit's colour,
 * its equator slowly turning. It sits behind the words and says nothing —
 * the lesson does the saying.
 */
function OrbitArt() {
  return (
    <svg className={s.orbitArt} viewBox="0 0 400 400" aria-hidden>
      <defs>
        <radialGradient id="orbit-core" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="170" fill="url(#orbit-core)" />
      <circle cx="200" cy="200" r="150" className={s.orbitLine} />
      <g className={s.orbitSpin}>
        <ellipse cx="200" cy="200" rx="150" ry="46" className={s.orbitLine} />
        <circle cx="350" cy="200" r="6" className={s.orbitDot} />
      </g>
      <g className={s.orbitSpinSlow}>
        <ellipse cx="200" cy="200" rx="46" ry="150" className={s.orbitLine} data-faint />
        <circle cx="200" cy="50" r="4" className={s.orbitDot} />
      </g>
      <line x1="200" y1="200" x2="292" y2="118" className={s.orbitVector} />
      <circle cx="292" cy="118" r="7" className={s.orbitDot} />
    </svg>
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
  run,
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
  run: RunOutput;
  nextId: string | null;
  onReview(): void;
  onTryShorter(c: Circuit): void;
}) {
  const used = learnerGateCount(circuit);
  const notes = notesFor(node.id);
  const cards = quizFor(node.id);

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

      {node.oracle && (
        <div className={s.reveal}>
          <span className="label">What the box hid</span>
          <ul>
            {node.oracle.variants.map((v) => (
              <li key={v.name}>
                <b>{v.name}</b> {v.reveal} <span className={s.revealOk}>✓ right</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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

      {/* Instruction is a disclosure, and it comes AFTER the attempt. The notes
          are the same beat as statements rather than a second one, so they sit
          inside it instead of earning a row of their own. */}
      <Disclosure label="Why that worked">
        <p className="prose">{node.instruction}</p>
        {notes.length > 0 && (
          <ul className={s.notes}>
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </Disclosure>

      {/* What you built, wound back through itself. Directly under "why that
          worked" because for several nodes it IS why it worked — u0.n3's
          middle column is the whole lesson, and the end state has erased it. */}
      <Disclosure label="Step through what you built">
        <StepThrough circuit={circuit} run={run} />
      </Disclosure>

      {/* The same instruction at length. Sits directly under the written one
          because it is the same beat, not a new one — and stays collapsed, so
          a lesson never opens with a video. */}
      <VideoDisclosure nodeId={node.id} />

      {/* Retrieval, offered and never pressed. Writes nothing to the review
          scheduler — see StudyQuiz. */}
      {cards.length > 0 && (
        <Disclosure label={`Check yourself · ${cards.length} question${cards.length === 1 ? "" : "s"}`}>
          <StudyQuiz cards={cards} />
        </Disclosure>
      )}

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

