"use client";

/**
 * The challenge runner.
 *
 * Shares every part with the lesson player — same canvas, same tray, same
 * grader, same rule engine — and differs only in what it says about a result.
 *
 *   reach   — passed, and here is your circuit.
 *   golf    — passed, and here is your gate count against par. Correctness
 *             gates scoring; it is never part of the score (PRD §6.2).
 *   bughunt — you were handed something broken. The tutor is on the other side
 *             here: it will not name the fix until you have looked yourself.
 *
 * Hints exist and are never volunteered. One is offered after a failed run, and
 * the learner has to ask.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { GateTray, TrayHint } from "@/components/circuit/GateTray";
import { Histogram, probabilityMap, toFractions } from "@/components/viz/Histogram";
import { BlochRow } from "@/components/viz/BlochSphere";
import { StateTable } from "@/components/viz/StateTable";
import { CodePanel } from "@/components/lesson/LessonPlayer";
import {
  Button, Chip, Disclosure, Readout, Registration, Segmented,
} from "@/components/ui/primitives";
import { emptyCircuit, gateCount, nextGateId, type Circuit } from "@/lib/ir/types";
import { allQubitStates } from "@/lib/sim/analysis";
import { targetProbabilities } from "@/lib/grade/fidelity";
import type { Sdk } from "@/lib/render";
import { useCircuit } from "@/stores/circuitStore";
import { useSession } from "@/stores/sessionStore";
import {
  DIFFICULTY_COPY, KIND_COPY, type Challenge,
} from "@/lib/curriculum/challenges";
import s from "./ChallengeRunner.module.css";

type View = "bloch" | "table" | "code";
const VIEWS: Array<{ value: View; label: string }> = [
  { value: "bloch", label: "Bloch" },
  { value: "table", label: "Table" },
  { value: "code", label: "Code" },
];

export function ChallengeRunner({ challenge }: { challenge: Challenge }) {
  const { challenges, recordChallenge, recordMisconception, hydrate } = useSession();
  const {
    circuit, setCircuit, held, pendingControl, selectedGateId, highlighted,
    run, running, error,
    hold, place, completeControlled, cancelPending, select, moveGate, removeGate,
    setParams, execute, applyFix, clearRun, undo,
  } = useCircuit();

  const [view, setView] = useState<View>("bloch");
  const [sdk, setSdk] = useState<Sdk>("qiskit");
  const [attempts, setAttempts] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [solutionShown, setSolutionShown] = useState(false);

  useEffect(() => { hydrate(); }, [hydrate]);

  const startingCircuit = useCallback((): Circuit => {
    const c = emptyCircuit(challenge.qubits, challenge.title);
    if (challenge.starter) {
      c.gates = challenge.starter.map((g) => ({
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
  }, [challenge]);

  useEffect(() => {
    setCircuit(startingCircuit());
    setAttempts(0);
    setHintShown(false);
    setSolutionShown(false);
  }, [challenge.id, setCircuit, startingCircuit]);

  const targetMap = useMemo(
    () => probabilityMap(targetProbabilities(challenge.target), challenge.qubits),
    [challenge],
  );

  const record = challenges[challenge.id];
  const used = gateCount(circuit);

  function onRun() {
    execute(challenge.target);
    setAttempts((a) => a + 1);
  }

  useEffect(() => {
    if (!run?.grade) return;
    recordChallenge(challenge.id, run.grade.passed, gateCount(circuit));
    if (run.finding?.misconception) {
      recordMisconception(run.finding.misconception, run.finding.ruleId, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.at]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "Enter") { e.preventDefault(); onRun(); }
      else if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const qubitStates = useMemo(() => (run ? allQubitStates(run.result) : undefined), [run]);
  const passed = run?.grade?.passed ?? false;

  /**
   * A full solution is never volunteered and never offered early. PRD §11.2
   * gates it behind three failed attempts, and even then the learner has to
   * ask for it — being handed the answer you were about to find is worse than
   * being stuck for another minute.
   */
  const solutionAvailable = attempts >= 3 && !passed;

  function loadSolution() {
    const c = emptyCircuit(challenge.qubits, challenge.title);
    c.gates = challenge.reference.map((g, i) => ({
      id: nextGateId(),
      type: g.type,
      targets: g.targets,
      controls: g.controls ?? [],
      params: g.params ?? [],
      column: i,
    }));
    setCircuit(c);
    setSolutionShown(true);
  }

  // In golf, beating par is the whole point and is worth saying out loud.
  const golfVerdict =
    challenge.kind !== "golf" || !passed
      ? null
      : used < challenge.par
        ? `${used} gates — under par. Nobody has asked for shorter than this.`
        : used === challenge.par
          ? `${used} gates, exactly par.`
          : `${used} gates. Par is ${challenge.par}, so there is a shorter route.`;

  return (
    <div className={s.shell}>
      <nav className={s.crumb}>
        <Link href="/challenges" className={`label ${s.back}`}>← Challenges</Link>
        <span style={{ display: "flex", gap: "var(--s-3)", alignItems: "center" }}>
          <Chip>{KIND_COPY[challenge.kind].label}</Chip>
          <Chip>{DIFFICULTY_COPY[challenge.difficulty]}</Chip>
          {record?.solved && <Chip tone="measure" dot>solved</Chip>}
        </span>
      </nav>

      <header className={s.brief}>
        <h1 className="statement statement--s" style={{ maxWidth: "20ch" }}>
          {challenge.title}
        </h1>
        <p className={s.briefText}>{challenge.brief}</p>
        {challenge.kind === "bughunt" && (
          <p className={s.briefNote}>
            The circuit below is already on the bench. Do not clear it — the
            point is to find what is wrong with it.
          </p>
        )}
      </header>

      <div className={s.workspace}>
        <div>
          <div className={s.stage}>
            <Registration />
            <div className={s.stageBody}>
              <CircuitCanvas
                circuit={circuit}
                minColumns={5}
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
              <GateTray
                available={challenge.allowedGates}
                held={held?.type ?? null}
                onPick={(t) => hold(t)}
              />
              <div className={s.runRow}>
                <span className={s.gateCount}>
                  {used} gate{used === 1 ? "" : "s"}
                  {challenge.kind === "golf" && ` · par ${challenge.par}`}
                </span>
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
            <TrayHint held={held?.type ?? null} pending={Boolean(pendingControl)} />
          </div>

          {error && (
            <div className={s.verdict} data-tone="error" role="alert">
              <span className="label" style={{ color: "var(--error)" }}>
                {error.code.replace("_", " ")}
              </span>
              <p className={s.verdictText}>{error.message}</p>
            </div>
          )}

          {run?.grade && !passed && (
            <div className={s.verdict} data-tone="miss">
              <div className={s.verdictHead}>
                <Chip tone="error" dot>fidelity {run.grade.fidelity.toFixed(3)}</Chip>
                {run.finding?.misconception && (
                  <span className="label">{run.finding.misconception}</span>
                )}
              </div>
              <p className={s.verdictText}>
                {run.finding?.message ??
                  `Fidelity ${run.grade.fidelity.toFixed(3)}. Not the target state yet.`}
              </p>
              <div className={s.verdictActions}>
                {run.finding?.fix && challenge.kind !== "bughunt" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { applyFix(run.finding!.fix!); clearRun(); }}
                  >
                    {run.finding.fix.label}
                  </Button>
                )}
                {!hintShown && (
                  <Button variant="ghost" size="sm" onClick={() => setHintShown(true)}>
                    Give me a hint
                  </Button>
                )}
                {solutionAvailable && !solutionShown && (
                  <Button variant="ghost" size="sm" onClick={loadSolution}>
                    Show me one answer
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={clearRun}>Keep editing</Button>
              </div>
              {hintShown && <p className={s.hint}>{challenge.hint}</p>}
              {solutionShown && (
                <p className={s.hint}>
                  That is one answer, now on the bench — run it to see it pass. It is
                  not the only one: grading compares the state you reach, so any
                  circuit that gets there counts.
                </p>
              )}
              {!solutionAvailable && attempts > 0 && attempts < 3 && !hintShown && (
                <p className={s.hint}>
                  A full answer opens after three tries. You have had {attempts}.
                </p>
              )}
            </div>
          )}

          {passed && (
            <div className={s.verdict} data-tone="pass">
              <div className={s.verdictHead}>
                <Chip tone="measure" dot>fidelity {run!.grade!.fidelity.toFixed(3)}</Chip>
                <span className="label">
                  {record?.bestGates !== null && record?.bestGates !== undefined
                    ? `best ${record.bestGates}`
                    : ""}
                </span>
              </div>
              <p className={s.verdictText}>
                {golfVerdict ??
                  (challenge.kind === "bughunt"
                    ? "Fixed. The circuit reaches the target state it was always meant to."
                    : "That reaches the target. There are other circuits that also would.")}
              </p>

              <div className={s.passPlot}>
                <Histogram
                  qubits={challenge.qubits}
                  actual={toFractions(run!.counts.counts, run!.shots)}
                  target={targetMap}
                  shots={run!.shots}
                  hit={Object.keys(targetMap)}
                  height={132}
                  dense
                />
              </div>

              <Disclosure label="See it in code">
                <CodePanel circuit={circuit} sdk="qiskit" />
              </Disclosure>

              <div className={s.verdictActions}>
                <Button variant="primary" onClick={() => (window.location.href = "/challenges")}>
                  Back to challenges
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setCircuit(startingCircuit()); setHintShown(false); }}
                >
                  {challenge.kind === "golf" ? "Try for shorter" : "Try another way"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <aside className={s.side}>
          <div className={s.targetCard}>
            <Registration />
            <div className={s.targetHead}>
              <span className="label">Target</span>
              {challenge.target.label && (
                <span className="label label--ink">{challenge.target.label}</span>
              )}
            </div>
            <Histogram qubits={challenge.qubits} actual={targetMap} height={104} dense />
          </div>

          {/* Before the first run there is no state to show, so the column
              carries what actually counts as solved here instead. */}
          {!run && (
            <div className="panel">
              <div className={s.viewHead}>
                <span className="label">What counts as solved</span>
              </div>
              <div className={s.rules}>
                <span className={s.ruleRow}>
                  <span className={s.ruleMark}>01</span>
                  Any circuit reaching the target passes. Grading compares the
                  state you produce, never the gates you used.
                </span>
                <span className={s.ruleRow}>
                  <span className={s.ruleMark}>02</span>
                  {challenge.kind === "golf"
                    ? `Par is ${challenge.par} gates. Correctness comes first; the gate count is the score.`
                    : challenge.kind === "bughunt"
                      ? "The circuit on the bench is already wrong. Change it — do not start over."
                      : `Par is ${challenge.par} gates, but a longer correct answer still passes.`}
                </span>
                <span className={s.ruleRow}>
                  <span className={s.ruleMark}>03</span>
                  A hint is there if you ask for one. A full answer opens after
                  three tries.
                </span>
              </div>
            </div>
          )}

          {run && (
            <div className="panel">
              <div className={s.viewHead}>
                <span className="label">Your state</span>
                <Segmented<View> ariaLabel="State view" value={view} onChange={setView} options={VIEWS} />
              </div>
              {view === "bloch" && qubitStates && <BlochRow states={qubitStates} size={124} />}
              {view === "table" && <StateTable result={run.result} />}
              {view === "code" && <CodePanel circuit={circuit} sdk={sdk} onSdk={setSdk} />}
            </div>
          )}

          <div className="panel">
            <div style={{ display: "flex", gap: "var(--s-5)", flexWrap: "wrap" }}>
              <Readout value={attempts} label="runs" />
              <Readout value={record?.bestGates ?? "—"} label="best" tone={record?.solved ? "measure" : undefined} />
              <Readout value={challenge.par} label="par" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
