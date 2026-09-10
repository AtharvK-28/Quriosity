/**
 * State analysis — reduced density matrices, Bloch vectors, purity, separability.
 *
 * Design Doc §10.1 and decision D5: the Bloch sphere is computed from the
 * REDUCED DENSITY MATRIX, never from raw amplitudes. The naive version is
 * physically wrong for entangled states, and an entangled qubit rendering
 * anywhere but the centre of the sphere is the kind of error that gets caught
 * on stage. Misconception M4 depends on this being exactly right.
 */

import type { Branch, SimResult } from "./statevector";

/** A 2x2 Hermitian density matrix. rho10 is conj(rho01) and is not stored. */
export interface DensityMatrix1 {
  rho00: number;
  rho11: number;
  rho01re: number;
  rho01im: number;
}

export interface QubitState {
  qubit: number;
  /** Bloch vector components ⟨X⟩, ⟨Y⟩, ⟨Z⟩. Length ≤ 1. */
  x: number;
  y: number;
  z: number;
  /** Tr(ρ²). 1 for a pure state, 0.5 for a maximally mixed qubit. */
  purity: number;
  /** |r|, the Bloch vector length. A pure state sits on the surface at r = 1. */
  radius: number;
  /** Von Neumann entropy in bits. 0 pure, 1 maximally mixed. */
  entropy: number;
  /** True when this qubit has no individual state of its own. */
  entangled: boolean;
  /** P(reading 1) on this wire. */
  p1: number;
}

const PURITY_TOL = 1e-9;

/** Reduced density matrix of one qubit, averaged over the ensemble. */
export function reducedDensityMatrix(branches: Branch[], n: number, qubit: number): DensityMatrix1 {
  const size = 2 ** n;
  const bit = 1 << qubit;
  let rho00 = 0;
  let rho11 = 0;
  let rho01re = 0;
  let rho01im = 0;

  for (const b of branches) {
    const w = b.weight;
    const a = b.amps;
    for (let k = 0; k < size; k++) {
      if (k & bit) continue;
      const j = k | bit;
      const a0r = a[2 * k], a0i = a[2 * k + 1];
      const a1r = a[2 * j], a1i = a[2 * j + 1];

      rho00 += w * (a0r * a0r + a0i * a0i);
      rho11 += w * (a1r * a1r + a1i * a1i);
      // a0 · conj(a1)
      rho01re += w * (a0r * a1r + a0i * a1i);
      rho01im += w * (a0i * a1r - a0r * a1i);
    }
  }
  return { rho00, rho11, rho01re, rho01im };
}

/** Everything the Bloch sphere and the entanglement indicator need for one wire. */
export function qubitState(branches: Branch[], n: number, qubit: number): QubitState {
  const { rho00, rho11, rho01re, rho01im } = reducedDensityMatrix(branches, n, qubit);

  const x = 2 * rho01re;
  const y = -2 * rho01im;
  const z = rho00 - rho11;

  const purity = rho00 * rho00 + rho11 * rho11 + 2 * (rho01re * rho01re + rho01im * rho01im);
  const radius = Math.min(1, Math.hypot(x, y, z));

  // Eigenvalues of a 2x2 density matrix are (1 ± r) / 2.
  const l0 = (1 + radius) / 2;
  const l1 = (1 - radius) / 2;
  const entropy = -(plogp(l0) + plogp(l1));

  return {
    qubit,
    x, y, z,
    purity,
    radius,
    entropy,
    entangled: purity < 1 - 1e-6,
    p1: rho11,
  };
}

function plogp(p: number): number {
  return p <= 0 ? 0 : p * Math.log2(p);
}

/** Per-wire states for the whole register. */
export function allQubitStates(result: SimResult): QubitState[] {
  return Array.from({ length: result.qubits }, (_, q) => qubitState(result.branches, result.qubits, q));
}

/* -- Separability ----------------------------------------------------------- */

export interface Separability {
  /** True when every wire has a state of its own — the register factorises. */
  separable: boolean;
  /** Wires whose reduced state is mixed, i.e. entangled with the rest. */
  entangledQubits: number[];
  /**
   * The product distribution implied by treating every wire as independent.
   * The Learn screen runs exactly this test: multiply the single-wire odds and
   * see whether the answer matches the register. When it does not, that failure
   * IS the definition of entanglement — not the correlation.
   */
  productDistribution: Float64Array;
  /** Largest absolute gap between the real distribution and the product one. */
  maxDeviation: number;
}

export function separability(result: SimResult): Separability {
  const n = result.qubits;
  const states = allQubitStates(result);
  const entangledQubits = states.filter((s) => s.entangled).map((s) => s.qubit);

  const product = new Float64Array(2 ** n);
  for (let k = 0; k < 2 ** n; k++) {
    let p = 1;
    for (let q = 0; q < n; q++) {
      const bit = (k >> q) & 1;
      p *= bit ? states[q].p1 : 1 - states[q].p1;
    }
    product[k] = p;
  }

  let maxDeviation = 0;
  for (let k = 0; k < product.length; k++) {
    maxDeviation = Math.max(maxDeviation, Math.abs(product[k] - result.probabilities[k]));
  }

  return {
    separable: entangledQubits.length === 0,
    entangledQubits,
    productDistribution: product,
    maxDeviation,
  };
}

/**
 * Purity of the joint reduced state of a pair, which is what the pair-wise
 * entanglement indicator on the canvas is drawn from (PRD E5-S6).
 * Returns 1 for an unentangled pair and 0.25 for a maximally entangled one.
 */
export function pairPurity(branches: Branch[], n: number, a: number, b: number): number {
  const size = 2 ** n;
  const aBit = 1 << a;
  const bBit = 1 << b;

  // Build the 4x4 reduced density matrix over (a, b) as flat complex storage.
  const re = new Float64Array(16);
  const im = new Float64Array(16);

  for (const br of branches) {
    const w = br.weight;
    const amps = br.amps;
    for (let k = 0; k < size; k++) {
      const ka = (k & aBit) ? 1 : 0;
      const kb = (k & bBit) ? 1 : 0;
      const rest = k & ~aBit & ~bBit;
      const row = kb * 2 + ka;

      for (let l = 0; l < size; l++) {
        // Only terms sharing the same environment configuration survive the trace.
        if ((l & ~aBit & ~bBit) !== rest) continue;
        const la = (l & aBit) ? 1 : 0;
        const lb = (l & bBit) ? 1 : 0;
        const col = lb * 2 + la;

        const kr = amps[2 * k], ki = amps[2 * k + 1];
        const lr = amps[2 * l], li = amps[2 * l + 1];
        // ψ_k · conj(ψ_l)
        re[row * 4 + col] += w * (kr * lr + ki * li);
        im[row * 4 + col] += w * (ki * lr - kr * li);
      }
    }
  }

  // Tr(ρ²) = Σ_ij |ρ_ij|²  for a Hermitian ρ.
  let purity = 0;
  for (let i = 0; i < 16; i++) purity += re[i] * re[i] + im[i] * im[i];
  return purity;
}

/** Wire pairs that are entangled with each other, for the canvas indicator. */
export function entangledPairs(result: SimResult): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  const n = result.qubits;
  if (n < 2) return pairs;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const pa = qubitState(result.branches, n, a);
      const pb = qubitState(result.branches, n, b);
      if (!pa.entangled || !pb.entangled) continue;
      // A pair that is pure jointly but mixed individually is entangled with
      // each other rather than with the rest of the register.
      if (pairPurity(result.branches, n, a, b) > 1 - 1e-6) pairs.push([a, b]);
    }
  }
  return pairs;
}

/* -- Amplitude table -------------------------------------------------------- */

export interface AmplitudeRow {
  index: number;
  bits: string;
  re: number;
  im: number;
  magnitude: number;
  /** Radians in (-π, π]. */
  phase: number;
  probability: number;
}

/**
 * The state-vector table. Design Doc §10.3 calls this the accessible primary,
 * not a fallback — it is a peer view of the Bloch sphere, and it is the view
 * that survives when a state is mixed or the register is too wide to draw.
 */
export function amplitudeRows(result: SimResult, opts?: { includeZeros?: boolean }): AmplitudeRow[] {
  const n = result.qubits;
  const sv = result.statevector;
  const rows: AmplitudeRow[] = [];

  for (let k = 0; k < 2 ** n; k++) {
    const re = sv ? sv[2 * k] : NaN;
    const im = sv ? sv[2 * k + 1] : NaN;
    const probability = result.probabilities[k];
    const magnitude = sv ? Math.hypot(re, im) : Math.sqrt(probability);
    if (!opts?.includeZeros && magnitude < 1e-9) continue;
    rows.push({
      index: k,
      bits: bits(k, n),
      re,
      im,
      magnitude,
      phase: sv ? Math.atan2(im, re) : NaN,
      probability,
    });
  }
  return rows;
}

function bits(k: number, n: number): string {
  let s = "";
  for (let j = n - 1; j >= 0; j--) s += (k >> j) & 1;
  return s;
}

/**
 * Hue for a phase angle. Design Doc §5.1: φ maps to hue directly so that 2π and
 * 0 are the same colour, which they must be because they are the same physics.
 * Kept here rather than in a component so the Bloch view and the amplitude
 * table cannot drift apart.
 */
export function phaseHue(phase: number): string {
  const deg = ((phase * 180) / Math.PI + 360) % 360;
  // Comma-separated on purpose: valid CSS, and the only hsl() form three.js
  // can parse. The space-separated form renders as white in WebGL.
  return `hsl(${deg.toFixed(1)}, 62%, 42%)`;
}
