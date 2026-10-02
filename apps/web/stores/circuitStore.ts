"use client";

/**
 * The circuit store.
 *
 * The IR is the single source of truth and this store owns it. The canvas is a
 * pure renderer over this object; the code panel is a pure function of it; the
 * simulator consumes it. Nothing anywhere else in the app holds circuit state.
 *
 * Every mutation goes through an action here so that undo works uniformly and
 * the version counter can drive memoised recomputation.
 */

import { create } from "zustand";
import {
  circuitDepth,
  cloneCircuit,
  emptyCircuit,
  gateQubits,
  nextGateId,
  type Circuit,
  type Gate,
  type GateType,
} from "@/lib/ir/types";
import { GATES } from "@/lib/ir/gates";
import { firstFreeColumn, slotIsFree, validate } from "@/lib/ir/validate";
import { dropWires, nextOpenColumn, slotOpen, type Reserved } from "@/lib/ir/drop";
import { isLocked, ORACLE_PREFIX } from "@/lib/curriculum/oracle";
import { simulate, type SimResult } from "@/lib/sim/statevector";
import { grade, type GradeResult, type Target } from "@/lib/grade/fidelity";
import { diagnose, primaryDiagnosis, type Finding, type SuggestedFix } from "@/lib/tutor/rules";
import { optimisationFinding } from "@/lib/tutor/optimise";
import { sampleCounts, applyGateNoise, scaleNoise, type Counts } from "@/lib/sim/sample";
import { track } from "@/lib/analytics";
import { MODE, useSession } from "./sessionStore";

const UNDO_DEPTH = 60;

const DRAFT_KEY = "quriosity.bench.draft.v1";

/** Wall-clock ceiling, matching the server's EXEC_TIMEOUT_S. */
const EXEC_TIMEOUT_MS = 15_000;

/**
 * Every way a run can fail, each with a message that names the cause AND the
 * fix. PRD E4-S4: a learner never sees "an error occurred", and never sees a
 * stack trace. Design Doc §8.7 supplies the wording.
 */
export interface RunError {
  code: "invalid" | "qubit_cap" | "gate_limit" | "too_large" | "timeout";
  message: string;
  /** The gate at fault, so the canvas can point at it. */
  gateId?: string;
}

export interface RunOutput {
  result: SimResult;
  counts: Counts;
  grade: GradeResult | null;
  finding: Finding | null;
  /**
   * Something worth knowing that is not a failure: a shorter equivalent
   * circuit (E7-S6), or an advisory lint. Null whenever there is a blocking
   * finding — one correction at a time. Shown after a pass, or on request;
   * never proactively in Workbench mode.
   */
  advice: Finding | null;
  shots: number;
  noiseLevel: number;
  at: number;
}

/**
 * A multi-wire gate waiting for its remaining wires. `picked` holds the wires
 * chosen so far in placement order — controls first, then targets — and
 * `need` is how many it takes. A Toffoli needs three; a barrier needs its
 * first and last wire.
 */
export interface PendingPlacement {
  type: GateType;
  /** The first wire picked. Kept by name because it is what the canvas reads. */
  control: number;
  column: number;
  picked: number[];
  need: number;
}

interface CircuitState {
  circuit: Circuit;
  /** Bumped on every mutation, so views can memoise cheaply. */
  version: number;

  past: Circuit[];
  future: Circuit[];

  /** The gate the learner has picked up but not yet placed. */
  held: { type: GateType; params: number[] } | null;
  /** A multi-wire placement waiting for its remaining wires. */
  pendingControl: PendingPlacement | null;
  selectedGateId: string | null;
  /** Gate ids the tutor is pointing at. Highlighted on the canvas. */
  highlighted: string[];

  /** Where the scrubber sits. -1 is "before any gate"; null means "the end". */
  scrubColumn: number | null;
  /** Columns an oracle box holds in a lesson; no learner gate goes there. */
  reserved: Reserved | null;

  shots: number;
  noiseLevel: number;

  run: RunOutput | null;
  running: boolean;
  error: RunError | null;

  // -- actions
  setCircuit(c: Circuit): void;
  /** Swap in a whole circuit as one undoable edit — imports, code, the optimiser. */
  replaceCircuit(c: Circuit): void;
  /** Names the circuit. Not an undoable edit: it changes no physics. */
  setName(name: string | undefined): void;
  reset(qubits?: number): void;

  hold(type: GateType, params?: number[]): void;
  release(): void;

  place(type: GateType, qubit: number, column: number, params?: number[]): string | null;
  beginControlled(type: GateType, control: number, column: number): void;
  completeControlled(target: number): string | null;
  cancelPending(): void;
  /**
   * Places a gate dragged from the tray, all of it, where it was released.
   * A multi-wire gate takes the next wires along (see `dropWires`).
   */
  dropGate(type: GateType, qubit: number, column: number): string | null;

  moveGate(id: string, qubit: number, column: number): void;
  /**
   * Moves one wire of a multi-wire gate. Onto another of its own wires, the
   * two swap roles, which is how a dragged control dot flips a CNOT.
   */
  rewireGate(id: string, from: number, to: number): void;
  removeGate(id: string): void;
  setParams(id: string, params: number[]): void;
  swapControlTarget(id: string): void;
  /** Reserve (or free) an oracle box's columns. Cleared by setCircuit. */
  setReserved(r: Reserved | null): void;
  /**
   * Puts a different function in the oracle box, keeping the learner's gates
   * and history. Not an edit: it is which question the circuit is asked.
   */
  swapOracle(gates: Gate[]): void;

  addQubit(): void;
  removeQubit(): void;
  /** Removes one wire and every gate on it; wires below move up. */
  removeQubitAt(qubit: number): void;

  select(id: string | null): void;
  highlight(ids: string[]): void;

  setScrub(col: number | null): void;
  setShots(n: number): void;
  setNoise(level: number): void;

  undo(): void;
  redo(): void;

  execute(target?: Target): void;
  /** Applies a tutor suggestion. `misconceptionId` is only for the S4 metric. */
  applyFix(fix: SuggestedFix, misconceptionId?: string | null): void;
  clearRun(): void;

  /** Persist the bench's working circuit so a refresh does not cost it. */
  saveDraft(): void;
  /** Restore it. Returns false when there was nothing to restore. */
  loadDraft(): boolean;
  clearDraft(): void;
}

export const useCircuit = create<CircuitState>((set, get) => {
  /** Pushes the current circuit onto the undo stack and applies a mutation. */
  function mutate(fn: (draft: Circuit) => void) {
    const { circuit, past } = get();
    const draft = cloneCircuit(circuit);
    fn(draft);
    set({
      circuit: draft,
      version: get().version + 1,
      past: [...past, circuit].slice(-UNDO_DEPTH),
      future: [],
      // Any edit invalidates the previous verdict. Holding a stale histogram
      // next to a changed circuit is the fastest way to teach the wrong thing.
      run: null,
      error: null,
    });
  }

  return {
    circuit: emptyCircuit(2),
    version: 0,
    past: [],
    future: [],
    held: null,
    pendingControl: null,
    selectedGateId: null,
    highlighted: [],
    scrubColumn: null,
    reserved: null,
    shots: 1024,
    noiseLevel: 0,
    run: null,
    running: false,
    error: null,

    setCircuit(c) {
      set({
        circuit: cloneCircuit(c),
        version: get().version + 1,
        past: [],
        future: [],
        run: null,
        error: null,
        scrubColumn: null,
        highlighted: [],
        selectedGateId: null,
        reserved: null,
      });
    },

    replaceCircuit(c) {
      mutate((d) => {
        const next = cloneCircuit(c);
        d.qubits = next.qubits;
        d.clbits = next.clbits;
        d.gates = next.gates;
        // A name the incoming circuit does not carry keeps the one the bench had.
        d.metadata = { ...d.metadata, ...next.metadata, name: next.metadata.name ?? d.metadata.name };
      });
      set({ scrubColumn: null, highlighted: [], selectedGateId: null, pendingControl: null, held: null });
    },

    setName(name) {
      const { circuit, version } = get();
      const clean = name?.replace(/\s+/g, " ").trim().slice(0, 80) || undefined;
      set({ circuit: { ...circuit, metadata: { ...circuit.metadata, name: clean } }, version: version + 1 });
    },

    reset(qubits) {
      const n = qubits ?? get().circuit.qubits;
      get().setCircuit(emptyCircuit(n));
    },

    hold(type, params) {
      set({ held: { type, params: params ?? defaultParams(type) }, pendingControl: null });
    },

    release() {
      set({ held: null });
    },

    place(type, qubit, column, params) {
      const spec = GATES[type];
      // A multi-wire gate cannot be placed in one action: it needs its other
      // wires. A barrier is placed the same way, by its first and last wire.
      if (spec.controlArity > 0 || spec.targetArity > 1 || type === "barrier") {
        if (qubit < 0 || qubit >= get().circuit.qubits) return null;
        get().beginControlled(type, qubit, column);
        return null;
      }

      const c = get().circuit;
      if (qubit < 0 || qubit >= c.qubits) return null;

      // PRD §11.1: an occupied slot inserts a new column rather than rejecting
      // the drop. The learner never has to make room by hand.
      const { reserved } = get();
      const col = slotOpen(c, column, [qubit], reserved) ? column : nextOpenColumn(c, [qubit], column, reserved);

      const id = nextGateId();
      mutate((d) => {
        d.gates.push({
          id,
          type,
          targets: [qubit],
          controls: [],
          params: params ?? defaultParams(type),
          column: col,
          ...(type === "measure" ? { clbit: qubit } : {}),
        });
      });
      set({ held: null, selectedGateId: id });
      return id;
    },

    beginControlled(type, control, column) {
      const spec = GATES[type];
      const need = type === "barrier" ? 2 : spec.controlArity + spec.targetArity;
      set({
        pendingControl: { type, control, column, picked: [control], need },
        held: { type, params: defaultParams(type) },
      });
    },

    completeControlled(wire) {
      const pending = get().pendingControl;
      if (!pending) return null;
      const c = get().circuit;
      if (wire < 0 || wire >= c.qubits) return null;

      const spec = GATES[pending.type];
      const isBarrier = pending.type === "barrier";

      // A barrier may start and end on the same wire; nothing else may use a
      // wire twice.
      if (!isBarrier && pending.picked.includes(wire)) return null;

      const picked = [...pending.picked, wire];
      if (picked.length < pending.need) {
        set({ pendingControl: { ...pending, picked } });
        return null;
      }

      let targets: number[];
      let controls: number[];
      if (isBarrier) {
        const lo = Math.min(...picked);
        const hi = Math.max(...picked);
        targets = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
        controls = [];
      } else {
        controls = picked.slice(0, spec.controlArity);
        targets = picked.slice(spec.controlArity);
      }

      const wires = [...controls, ...targets];
      const { reserved } = get();
      const col = slotOpen(c, pending.column, wires, reserved)
        ? pending.column
        : nextOpenColumn(c, wires, pending.column, reserved);

      const id = nextGateId();
      mutate((d) => {
        d.gates.push({
          id,
          type: pending.type,
          targets,
          controls,
          params: defaultParams(pending.type),
          column: col,
        });
      });
      set({ pendingControl: null, held: null, selectedGateId: id });
      return id;
    },

    cancelPending() {
      set({ pendingControl: null, held: null });
    },

    dropGate(type, qubit, column) {
      const c = get().circuit;
      const spec = GATES[type];
      if (spec.controlArity === 0 && spec.targetArity === 1 && type !== "barrier") {
        return get().place(type, qubit, column);
      }
      const wires = dropWires(type, qubit, c.qubits);
      // Too few wires to hold it: fall back to asking for them one by one.
      if (!wires) {
        get().place(type, qubit, column);
        return null;
      }
      const all = [...wires.controls, ...wires.targets];
      const { reserved } = get();
      const col = slotOpen(c, column, all, reserved) ? column : nextOpenColumn(c, all, column, reserved);
      const id = nextGateId();
      mutate((d) => {
        d.gates.push({
          id,
          type,
          targets: wires.targets,
          controls: wires.controls,
          params: defaultParams(type),
          column: col,
        });
      });
      set({ held: null, pendingControl: null, selectedGateId: id });
      return id;
    },

    moveGate(id, qubit, column) {
      const c = get().circuit;
      const g = c.gates.find((x) => x.id === id);
      if (!g || isLocked(id)) return;

      // Move by the offset applied to the gate's lowest wire, so a two-qubit
      // gate keeps its span rather than collapsing onto one line.
      const wires = gateQubits(g);
      const lowest = Math.min(...wires);
      const delta = qubit - lowest;
      // A drag reports every pointer move; only a real change is an edit.
      if (delta === 0 && column === g.column) return;
      const moved = wires.map((w) => w + delta);
      if (moved.some((w) => w < 0 || w >= c.qubits)) return;
      if (!slotOpen(c, column, moved, get().reserved, id)) return;

      mutate((d) => {
        const t = d.gates.find((x) => x.id === id)!;
        t.targets = t.targets.map((w) => w + delta);
        t.controls = t.controls.map((w) => w + delta);
        t.column = column;
        if (t.type === "measure") t.clbit = t.targets[0];
      });
    },

    rewireGate(id, from, to) {
      const c = get().circuit;
      const g = c.gates.find((x) => x.id === id);
      if (!g || g.type === "barrier" || from === to || isLocked(id)) return;
      if (to < 0 || to >= c.qubits) return;
      const wires = gateQubits(g);
      if (!wires.includes(from)) return;
      const own = wires.includes(to);
      if (!own && !slotIsFree(c, g.column, [to], id)) return;

      const swap = (w: number) => (w === from ? to : own && w === to ? from : w);
      mutate((d) => {
        const t = d.gates.find((x) => x.id === id)!;
        t.controls = t.controls.map(swap);
        t.targets = t.targets.map(swap);
      });
    },

    removeGate(id) {
      if (isLocked(id)) return;
      mutate((d) => {
        d.gates = d.gates.filter((g) => g.id !== id);
      });
      if (get().selectedGateId === id) set({ selectedGateId: null });
    },

    setParams(id, params) {
      if (isLocked(id)) return;
      mutate((d) => {
        const g = d.gates.find((x) => x.id === id);
        if (g) g.params = params;
      });
    },

    setReserved(r) {
      set({ reserved: r });
    },

    swapOracle(gates) {
      const swap = (c: Circuit): Circuit => ({
        ...c,
        gates: [...c.gates.filter((g) => !g.id.startsWith(ORACLE_PREFIX)), ...gates.map((g) => ({ ...g }))],
      });
      const { circuit, past, future, version } = get();
      // Every snapshot gets the same function, so undo never brings back a
      // box the lesson is no longer showing.
      set({
        circuit: swap(circuit),
        past: past.map(swap),
        future: future.map(swap),
        version: version + 1,
        run: null,
        error: null,
        highlighted: [],
      });
    },

    swapControlTarget(id) {
      if (isLocked(id)) return;
      mutate((d) => {
        const g = d.gates.find((x) => x.id === id);
        if (!g || g.controls.length !== 1 || g.targets.length !== 1) return;
        const c = g.controls[0];
        g.controls = [g.targets[0]];
        g.targets = [c];
      });
    },

    addQubit() {
      const c = get().circuit;
      // The tier cap is the mode's, not a constant (PRD §6.3).
      if (c.qubits >= MODE[useSession.getState().mode].maxQubits) return;
      mutate((d) => {
        d.qubits += 1;
        d.clbits += 1;
      });
    },

    removeQubit() {
      get().removeQubitAt(get().circuit.qubits - 1);
    },

    removeQubitAt(doomed) {
      const c = get().circuit;
      if (c.qubits <= 1 || doomed < 0 || doomed >= c.qubits) return;
      const shift = (q: number) => (q > doomed ? q - 1 : q);

      mutate((d) => {
        d.gates = d.gates
          .map((g) => {
            if (g.type === "barrier") {
              const kept = g.targets.filter((q) => q !== doomed).map(shift);
              return kept.length > 0 ? { ...g, targets: kept } : null;
            }
            if (gateQubits(g).includes(doomed)) return null;
            const moved = { ...g, targets: g.targets.map(shift), controls: g.controls.map(shift) };
            if (g.type === "measure" && g.clbit !== undefined) {
              // Bits follow their wires down. A read into the removed wire's
              // bit from another wire moves to that wire's own bit.
              moved.clbit = g.clbit === doomed ? moved.targets[0] : shift(g.clbit);
            }
            return moved;
          })
          .filter((g): g is Gate => g !== null);
        d.qubits -= 1;
        d.clbits = Math.max(d.qubits, d.clbits - 1);
      });
      set({ selectedGateId: null, highlighted: [] });
    },

    select(id) {
      set({ selectedGateId: id });
    },

    highlight(ids) {
      set({ highlighted: ids });
    },

    setScrub(col) {
      set({ scrubColumn: col });
    },

    setShots(n) {
      set({ shots: Math.max(1, Math.min(8192, Math.round(n))) });
    },

    setNoise(level) {
      set({ noiseLevel: Math.max(0, Math.min(1, level)), run: null });
    },

    undo() {
      const { past, circuit, future } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      set({
        circuit: previous,
        past: past.slice(0, -1),
        future: [circuit, ...future].slice(0, UNDO_DEPTH),
        version: get().version + 1,
        run: null,
      });
    },

    redo() {
      const { past, circuit, future } = get();
      if (future.length === 0) return;
      set({
        circuit: future[0],
        past: [...past, circuit].slice(-UNDO_DEPTH),
        future: future.slice(1),
        version: get().version + 1,
        run: null,
      });
    },

    execute(target) {
      const { circuit, shots, noiseLevel } = get();

      // Everything that can be known before running is checked before running.
      // Blocking early is what keeps a 20-qubit circuit from freezing the tab
      // and then reporting a timeout it caused itself.
      const problem = precheck(circuit);
      if (problem) {
        track("run_failed", { error_type: problem.code });
        set({ error: problem, running: false, highlighted: problem.gateId ? [problem.gateId] : [] });
        return;
      }
      // Counts toward the "run ten circuits" quest; never toward the streak.
      useSession.getState().logDaily("runs");

      set({ running: true, error: null });

      try {
        const started = performance.now();
        const result = simulate(circuit);

        // Gate noise mixes the exact distribution toward uniform before we
        // sample, which is what makes depth visibly expensive (M13).
        const oneQubit = circuit.gates.filter(
          (g) => gateQubits(g).length === 1 && g.type !== "measure" && g.type !== "barrier",
        ).length;
        const twoQubit = circuit.gates.filter((g) => gateQubits(g).length > 1).length;
        const noise = scaleNoise(noiseLevel);
        const distribution =
          noiseLevel > 0
            ? applyGateNoise(result.probabilities, { oneQubit, twoQubit }, noise)
            : result.probabilities;

        const counts = sampleCounts(distribution, circuit.qubits, shots, {
          seed: hashSeed(circuit, shots, noiseLevel),
          noise,
        });

        // The circuit is preserved either way — a failed run never costs work.
        if (performance.now() - started > EXEC_TIMEOUT_MS) {
          track("run_failed", { error_type: "timeout" });
          set({
            running: false,
            error: {
              code: "timeout",
              message:
                "This circuit needed more than 15 seconds. Try fewer qubits or fewer shots.",
            },
          });
          return;
        }

        const graded = target ? grade(result, target) : null;
        const ctx = target
          ? { circuit, result, target, grade: graded!, noiseLevel }
          : { circuit, result, noiseLevel };
        const found = primaryDiagnosis(ctx);
        // A rule that names a locked gate (an oracle's, or one the lesson
        // placed) would send the learner after something they cannot edit.
        const finding = found && found.gateIds.some(isLocked) ? null : found;

        // Advice only when nothing is wrong, and only where it is cheap: the
        // optimiser re-simulates, and a wide register is not where a learner
        // is golfing gate counts.
        const advice =
          finding || circuit.qubits > 10 || (graded && !graded.passed)
            ? null
            : optimisationFinding(circuit) ?? diagnose(ctx).find((f) => f.severity === "advisory") ?? null;

        const durationMs = Math.round(performance.now() - started);
        track("circuit_run", {
          qubits: circuit.qubits,
          gate_count: circuit.gates.filter((g) => g.type !== "barrier").length,
          backend: "browser",
          shots,
          noise: noiseLevel,
          cached: false,
          duration_ms: durationMs,
        });

        set({
          run: { result, counts, grade: graded, finding, advice, shots, noiseLevel, at: Date.now() },
          running: false,
          highlighted: finding?.gateIds ?? [],
          scrubColumn: null,
        });
      } catch (e) {
        track("run_failed", { error_type: "too_large" });
        set({
          running: false,
          error: {
            code: "too_large",
            message:
              e instanceof Error
                ? e.message
                : "This circuit could not be simulated. The circuit is unchanged.",
          },
        });
      }
    },

    applyFix(fix, misconceptionId = null) {
      // PRD §8, metric S4 — "the real signal": did the learner take the advice.
      track("tutor_suggestion_applied", { misconception_id: misconceptionId, applied: true });
      switch (fix.kind) {
        case "replace_circuit":
          get().replaceCircuit(fix.circuit);
          break;
        case "add_gate": {
          const c = get().circuit;
          const wires = [...fix.controls, ...fix.targets];
          const { reserved } = get();
          const col = slotOpen(c, fix.column, wires, reserved) ? fix.column : nextOpenColumn(c, wires, fix.column, reserved);
          const id = nextGateId();
          mutate((d) => {
            d.gates.push({
              id,
              type: fix.type,
              targets: fix.targets,
              controls: fix.controls,
              params: fix.params,
              column: col,
              ...(fix.type === "measure" ? { clbit: fix.targets[0] } : {}),
            });
          });
          set({ highlighted: [id], selectedGateId: id });
          break;
        }
        case "remove_gate":
          get().removeGate(fix.gateId);
          break;
        case "swap_control_target":
          get().swapControlTarget(fix.gateId);
          set({ highlighted: [fix.gateId] });
          break;
        case "replace_gate":
          mutate((d) => {
            const g = d.gates.find((x) => x.id === fix.gateId);
            if (g) g.type = fix.type;
          });
          set({ highlighted: [fix.gateId] });
          break;
      }
    },

    clearRun() {
      set({ run: null, error: null, highlighted: [] });
    },

    /* -- Draft persistence — PRD E11-S3 ------------------------------------
       The bench is where people build without a node telling them what to
       build, so it is the surface where losing work to an accidental reload
       actually costs something. Lessons deliberately do NOT restore: a node
       opens on its own starting circuit every time, which is the point.
       -------------------------------------------------------------------- */

    saveDraft() {
      if (typeof window === "undefined") return;
      const { circuit, shots, noiseLevel } = get();
      try {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ circuit, shots, noiseLevel, at: Date.now() }),
        );
      } catch {
        // Private browsing or a full quota. The circuit stays in memory.
      }
    },

    loadDraft() {
      if (typeof window === "undefined") return false;
      try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        if (!raw) return false;
        const saved = JSON.parse(raw) as {
          circuit?: Circuit;
          shots?: number;
          noiseLevel?: number;
        };
        // A draft written by an older schema, or corrupted, is discarded rather
        // than half-restored into something that will not simulate.
        if (!saved.circuit || !validate(saved.circuit).valid) {
          window.localStorage.removeItem(DRAFT_KEY);
          return false;
        }
        set({
          circuit: cloneCircuit(saved.circuit),
          version: get().version + 1,
          past: [],
          future: [],
          run: null,
          error: null,
          shots: saved.shots ?? 1024,
          noiseLevel: saved.noiseLevel ?? 0,
        });
        return saved.circuit.gates.length > 0;
      } catch {
        return false;
      }
    },

    clearDraft() {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* nothing to do */
      }
    },
  };
});

/**
 * Everything knowable before a run. Each branch names the cause and the fix,
 * and none of them lose the learner's circuit.
 */
function precheck(circuit: Circuit): RunError | null {
  const { mode } = useSession.getState();
  const caps = MODE[mode];

  // 1 — the IR itself. Validation errors already name the gate and the reason,
  // so they are surfaced verbatim; only the code is translated, because the
  // validator owns some invariants the learner experiences as limits rather
  // than as malformed input.
  const { valid, errors } = validate(circuit);
  if (!valid) {
    const first = errors[0];
    const code: RunError["code"] = first.code === "too_many_gates" ? "gate_limit" : "invalid";
    return { code, message: first.message, gateId: first.gateId };
  }

  // 2 — tier cap. The message names the cap AND the mode that raises it.
  if (circuit.qubits > caps.maxQubits) {
    const raises = mode === "workbench" ? null : "Workbench mode goes further";
    return {
      code: "qubit_cap",
      message:
        `${mode[0].toUpperCase()}${mode.slice(1)} mode simulates up to ${caps.maxQubits} qubits. ` +
        `This circuit has ${circuit.qubits}.` + (raises ? ` ${raises}.` : ""),
    };
  }

  // 3 — the work this would actually cost. Every column is captured for the
  // scrubber, so cost is 2^n amplitudes times depth, and blocking here is what
  // prevents a frozen tab followed by a timeout of our own making.
  // 10M amplitudes is ~160MB of snapshots. At the Workbench cap of 16 qubits
  // that still allows a depth of 150, which is past anything built by hand.
  const depth = circuitDepth(circuit) + 1;
  const amplitudes = 2 ** circuit.qubits;
  if (amplitudes * Math.max(1, depth) > 10_000_000) {
    return {
      code: "too_large",
      message:
        `${circuit.qubits} qubits across a depth of ${depth} is more state than this ` +
        `browser can hold. Try fewer qubits, or a shorter circuit.`,
    };
  }

  return null;
}

function defaultParams(type: GateType): number[] {
  return GATES[type].paramArity === 1 ? [Math.PI / 2] : [];
}

/** A stable seed so an identical circuit sampled twice gives an identical plot. */
function hashSeed(c: Circuit, shots: number, noise: number): number {
  let h = 2166136261;
  const key = `${c.qubits}|${shots}|${noise}|${c.gates
    .map((g) => `${g.type}${g.column}${gateQubits(g).join(".")}${g.params.join(".")}`)
    .sort()
    .join(",")}`;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/* -- Derived selectors ------------------------------------------------------- */

/** The state at the scrub position, or the final state when not scrubbing. */
export function stateAtScrub(run: RunOutput | null, scrubColumn: number | null) {
  if (!run) return null;
  if (scrubColumn === null) return run.result.branches;
  const step = run.result.steps.find((s) => s.column === scrubColumn);
  return step?.branches ?? run.result.branches;
}
