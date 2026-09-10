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
import { simulate, type SimResult } from "@/lib/sim/statevector";
import { grade, type GradeResult, type Target } from "@/lib/grade/fidelity";
import { primaryDiagnosis, type Finding, type SuggestedFix } from "@/lib/tutor/rules";
import { sampleCounts, applyGateNoise, scaleNoise, type Counts } from "@/lib/sim/sample";
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
  shots: number;
  noiseLevel: number;
  at: number;
}

interface CircuitState {
  circuit: Circuit;
  /** Bumped on every mutation, so views can memoise cheaply. */
  version: number;

  past: Circuit[];
  future: Circuit[];

  /** The gate the learner has picked up but not yet placed. */
  held: { type: GateType; params: number[] } | null;
  /** A two-qubit placement waiting for its second wire. */
  pendingControl: { type: GateType; control: number; column: number } | null;
  selectedGateId: string | null;
  /** Gate ids the tutor is pointing at. Highlighted on the canvas. */
  highlighted: string[];

  /** Where the scrubber sits. -1 is "before any gate"; null means "the end". */
  scrubColumn: number | null;

  shots: number;
  noiseLevel: number;

  run: RunOutput | null;
  running: boolean;
  error: RunError | null;

  // -- actions
  setCircuit(c: Circuit): void;
  reset(qubits?: number): void;

  hold(type: GateType, params?: number[]): void;
  release(): void;

  place(type: GateType, qubit: number, column: number, params?: number[]): string | null;
  beginControlled(type: GateType, control: number, column: number): void;
  completeControlled(target: number): string | null;
  cancelPending(): void;

  moveGate(id: string, qubit: number, column: number): void;
  removeGate(id: string): void;
  setParams(id: string, params: number[]): void;
  swapControlTarget(id: string): void;

  addQubit(): void;
  removeQubit(): void;

  select(id: string | null): void;
  highlight(ids: string[]): void;

  setScrub(col: number | null): void;
  setShots(n: number): void;
  setNoise(level: number): void;

  undo(): void;
  redo(): void;

  execute(target?: Target): void;
  applyFix(fix: SuggestedFix): void;
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
      });
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
      // A controlled gate cannot be placed in one action: it needs a second wire.
      if (spec.controlArity > 0) {
        get().beginControlled(type, qubit, column);
        return null;
      }
      if (spec.targetArity > 1) {
        get().beginControlled(type, qubit, column);
        return null;
      }

      const c = get().circuit;
      if (qubit < 0 || qubit >= c.qubits) return null;

      // PRD §11.1: an occupied slot inserts a new column rather than rejecting
      // the drop. The learner never has to make room by hand.
      const col = slotIsFree(c, column, [qubit]) ? column : firstFreeColumn(c, [qubit], column);

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
      set({ pendingControl: { type, control, column }, held: { type, params: defaultParams(type) } });
    },

    completeControlled(target) {
      const pending = get().pendingControl;
      if (!pending) return null;
      if (target === pending.control) return null;

      const c = get().circuit;
      const spec = GATES[pending.type];
      const wires = [pending.control, target];
      const col = slotIsFree(c, pending.column, wires)
        ? pending.column
        : firstFreeColumn(c, wires, pending.column);

      const id = nextGateId();
      mutate((d) => {
        d.gates.push({
          id,
          type: pending.type,
          // SWAP has two targets and no control; everything else is control→target.
          targets: spec.controlArity === 0 ? [pending.control, target] : [target],
          controls: spec.controlArity === 0 ? [] : [pending.control],
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

    moveGate(id, qubit, column) {
      const c = get().circuit;
      const g = c.gates.find((x) => x.id === id);
      if (!g) return;

      // Move by the offset applied to the gate's lowest wire, so a two-qubit
      // gate keeps its span rather than collapsing onto one line.
      const wires = gateQubits(g);
      const lowest = Math.min(...wires);
      const delta = qubit - lowest;
      const moved = wires.map((w) => w + delta);
      if (moved.some((w) => w < 0 || w >= c.qubits)) return;
      if (!slotIsFree(c, column, moved, id)) return;

      mutate((d) => {
        const t = d.gates.find((x) => x.id === id)!;
        t.targets = t.targets.map((w) => w + delta);
        t.controls = t.controls.map((w) => w + delta);
        t.column = column;
        if (t.type === "measure") t.clbit = t.targets[0];
      });
    },

    removeGate(id) {
      mutate((d) => {
        d.gates = d.gates.filter((g) => g.id !== id);
      });
      if (get().selectedGateId === id) set({ selectedGateId: null });
    },

    setParams(id, params) {
      mutate((d) => {
        const g = d.gates.find((x) => x.id === id);
        if (g) g.params = params;
      });
    },

    swapControlTarget(id) {
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
      if (c.qubits >= 12) return;
      mutate((d) => {
        d.qubits += 1;
        d.clbits += 1;
      });
    },

    removeQubit() {
      const c = get().circuit;
      if (c.qubits <= 1) return;
      const doomed = c.qubits - 1;
      mutate((d) => {
        d.gates = d.gates.filter((g) => !gateQubits(g).includes(doomed));
        d.qubits -= 1;
        d.clbits -= 1;
      });
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
        set({ error: problem, running: false, highlighted: problem.gateId ? [problem.gateId] : [] });
        return;
      }

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
        const finding = target
          ? primaryDiagnosis({ circuit, result, target, grade: graded!, noiseLevel })
          : primaryDiagnosis({ circuit, result, noiseLevel });

        set({
          run: { result, counts, grade: graded, finding, shots, noiseLevel, at: Date.now() },
          running: false,
          highlighted: finding?.gateIds ?? [],
          scrubColumn: null,
        });
      } catch (e) {
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

    applyFix(fix) {
      switch (fix.kind) {
        case "add_gate": {
          const c = get().circuit;
          const wires = [...fix.controls, ...fix.targets];
          const col = slotIsFree(c, fix.column, wires) ? fix.column : firstFreeColumn(c, wires, fix.column);
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
  const depth = circuitDepth(circuit) + 1;
  const amplitudes = 2 ** circuit.qubits;
  if (amplitudes * Math.max(1, depth) > 40_000_000) {
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
