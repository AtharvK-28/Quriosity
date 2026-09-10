/**
 * Grading — TRD §10, PRD §6.2.
 *
 * The rule that shapes this file: GRADING COMPARES STATES, NEVER STRUCTURE.
 * Two structurally different circuits that reach the same state both pass. A
 * platform that compares gate lists teaches ritual instead of understanding,
 * and it rejects correct answers, which is worse than teaching nothing.
 *
 * Fidelity is F = |⟨ψ_target|ψ_actual⟩|². Because the inner product sits inside
 * an absolute value, a global phase difference cancels on its own. That is not
 * a convenience — it is the physics, and it is why misconception M5 resolves to
 * an explanation rather than a failure.
 */

import type { SimResult } from "../sim/statevector";
import { bitstring } from "../sim/statevector";

/** Pass threshold. Simulator floating-point error is far below this. */
export const PASS_EPSILON = 1e-3;
export const PASS_THRESHOLD = 1 - PASS_EPSILON;

/**
 * A target may be given as a state vector (the strict form) or as an outcome
 * distribution (when the lesson only cares about what you would measure).
 * Distribution targets are the right choice whenever relative phase is not yet
 * on the syllabus — grading a U1 learner on a phase they have not met is a way
 * to fail someone for being correct.
 */
export type Target =
  | { kind: "statevector"; qubits: number; amplitudes: Float64Array; label?: string }
  | { kind: "distribution"; qubits: number; probabilities: Float64Array; label?: string };

export interface GradeResult {
  passed: boolean;
  /** 0–1. Reported to 3dp everywhere it is shown. */
  fidelity: number;
  /**
   * The basis state with the largest amplitude error — the bar the lesson
   * screen points at when it says what was close and what was not.
   */
  worstBasis: { bits: string; index: number; target: number; actual: number } | null;
  /** True when the state matches up to an overall phase nobody could measure. */
  globalPhaseOnly: boolean;
  /** Set when the state is mixed and fidelity is computed against probabilities. */
  comparedAsDistribution: boolean;
}

/** Builds a state-vector target from amplitudes given as [re, im] pairs. */
export function stateTarget(qubits: number, amps: Array<[number, number]>, label?: string): Target {
  const flat = new Float64Array(2 ** qubits * 2);
  amps.forEach(([re, im], k) => {
    flat[2 * k] = re;
    flat[2 * k + 1] = im;
  });
  return { kind: "statevector", qubits, amplitudes: normalise(flat), label };
}

/** Builds a distribution target from a map of bitstring to probability. */
export function distributionTarget(
  qubits: number,
  spec: Record<string, number>,
  label?: string,
): Target {
  const p = new Float64Array(2 ** qubits);
  for (const [bits, prob] of Object.entries(spec)) {
    p[parseInt(bits, 2)] = prob;
  }
  const total = p.reduce((s, v) => s + v, 0);
  if (total > 0) for (let k = 0; k < p.length; k++) p[k] /= total;
  return { kind: "distribution", qubits, probabilities: p, label };
}

export function grade(result: SimResult, target: Target, epsilon = PASS_EPSILON): GradeResult {
  if (result.qubits !== target.qubits) {
    return {
      passed: false,
      fidelity: 0,
      worstBasis: null,
      globalPhaseOnly: false,
      comparedAsDistribution: target.kind === "distribution",
    };
  }

  const n = result.qubits;

  // A distribution target, or a mixed actual state, is compared on outcome
  // probabilities using the classical (Bhattacharyya) fidelity — the square of
  // the sum of √(p·q). It reduces to 1 exactly when the distributions match.
  const asDistribution = target.kind === "distribution" || result.statevector === null;

  if (asDistribution) {
    const targetP =
      target.kind === "distribution" ? target.probabilities : probsOf(target.amplitudes);
    let sum = 0;
    for (let k = 0; k < targetP.length; k++) {
      sum += Math.sqrt(targetP[k] * result.probabilities[k]);
    }
    const fidelity = clamp01(sum * sum);
    return {
      passed: fidelity >= 1 - epsilon,
      fidelity,
      worstBasis: worstOf(targetP, result.probabilities, n),
      globalPhaseOnly: false,
      comparedAsDistribution: true,
    };
  }

  // Pure-state path: F = |⟨target|actual⟩|².
  const actual = result.statevector!;
  const t = target.amplitudes;
  let re = 0;
  let im = 0;
  for (let k = 0; k < actual.length / 2; k++) {
    const tr = t[2 * k], ti = t[2 * k + 1];
    const ar = actual[2 * k], ai = actual[2 * k + 1];
    // conj(target) · actual
    re += tr * ar + ti * ai;
    im += tr * ai - ti * ar;
  }
  const fidelity = clamp01(re * re + im * im);
  const passed = fidelity >= 1 - epsilon;

  // Did it pass only because the absolute value threw away a phase? True when
  // the states match in every magnitude but differ by a constant rotation.
  const globalPhaseOnly = passed && !amplitudesMatch(t, actual);

  return {
    passed,
    fidelity,
    worstBasis: worstOf(probsOf(t), result.probabilities, n),
    globalPhaseOnly,
    comparedAsDistribution: false,
  };
}

/** Amplitudes equal component-wise, with no phase allowance. */
function amplitudesMatch(a: Float64Array, b: Float64Array, tol = 1e-6): boolean {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > tol) return false;
  }
  return true;
}

function probsOf(amps: Float64Array): Float64Array {
  const p = new Float64Array(amps.length / 2);
  for (let k = 0; k < p.length; k++) {
    p[k] = amps[2 * k] ** 2 + amps[2 * k + 1] ** 2;
  }
  return p;
}

function worstOf(
  target: Float64Array,
  actual: Float64Array,
  n: number,
): GradeResult["worstBasis"] {
  let idx = -1;
  let worst = 0;
  for (let k = 0; k < target.length; k++) {
    const d = Math.abs(target[k] - actual[k]);
    if (d > worst) {
      worst = d;
      idx = k;
    }
  }
  if (idx < 0 || worst < 1e-9) return null;
  return { bits: bitstring(idx, n), index: idx, target: target[idx], actual: actual[idx] };
}

function normalise(amps: Float64Array): Float64Array {
  let norm = 0;
  for (let i = 0; i < amps.length; i += 2) norm += amps[i] ** 2 + amps[i + 1] ** 2;
  if (norm === 0) return amps;
  const s = 1 / Math.sqrt(norm);
  const out = new Float64Array(amps.length);
  for (let i = 0; i < amps.length; i++) out[i] = amps[i] * s;
  return out;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * The outcome distribution a target implies. A state-vector target still has
 * one — it is what a Z-basis measurement of that state would give — and the
 * lesson screen plots it so a learner always sees the shape they are aiming at,
 * whether or not phase is part of the grade.
 */
export function targetProbabilities(target: Target): Float64Array {
  return target.kind === "distribution" ? target.probabilities : probsOf(target.amplitudes);
}

/** True when reaching this target requires attention to phase, not just odds. */
export function targetNeedsPhase(target: Target): boolean {
  if (target.kind !== "statevector") return false;
  // Any amplitude that is not a non-negative real carries phase information
  // the learner has to get right.
  for (let k = 0; k < target.amplitudes.length; k += 2) {
    if (Math.abs(target.amplitudes[k + 1]) > 1e-9) return true;
    if (target.amplitudes[k] < -1e-9) return true;
  }
  return false;
}

/** Fidelity to 3dp, the format used everywhere it is displayed. */
export function formatFidelity(f: number): string {
  return f.toFixed(3);
}

/* -- Named targets used by the curriculum ----------------------------------- */

const R2 = Math.SQRT1_2;

export const TARGETS = {
  /** |+⟩ — an even lean with no value hidden inside it. */
  plus: (): Target => stateTarget(1, [[R2, 0], [R2, 0]], "|+⟩"),
  /** |−⟩ — same odds, opposite phase. The pair that makes M6 visible. */
  minus: (): Target => stateTarget(1, [[R2, 0], [-R2, 0]], "|−⟩"),
  /** |1⟩ */
  one: (): Target => stateTarget(1, [[0, 0], [1, 0]], "|1⟩"),
  /** An even two-outcome coin, phase-agnostic. */
  fairCoin: (): Target => distributionTarget(1, { "0": 0.5, "1": 0.5 }, "a fair coin"),
  /** |Φ⁺⟩ = (|00⟩ + |11⟩)/√2 — the Bell state the whole demo turns on. */
  bellPhiPlus: (): Target =>
    stateTarget(2, [[R2, 0], [0, 0], [0, 0], [R2, 0]], "|Φ⁺⟩"),
  /** The Bell state graded on outcomes only, for learners who have not met phase. */
  bellDistribution: (): Target =>
    distributionTarget(2, { "00": 0.5, "11": 0.5 }, "always agreeing"),
  /** GHZ across three wires. */
  ghz3: (): Target =>
    stateTarget(
      3,
      [[R2, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [R2, 0]],
      "|GHZ₃⟩",
    ),
  /** Four even outcomes — flat, and deliberately NOT entangled. */
  flatTwo: (): Target =>
    distributionTarget(2, { "00": 0.25, "01": 0.25, "10": 0.25, "11": 0.25 }, "four even outcomes"),
} as const;
