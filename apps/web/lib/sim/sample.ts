/**
 * Shot sampling and the noise overlay.
 *
 * The histogram is the verdict in this product, so what it shows has to be an
 * honest sample rather than the exact distribution drawn as bars — a learner
 * who runs 1024 shots should see sampling scatter, because that scatter is the
 * reason "about 50/50" is the correct reading and "exactly 512" is not.
 */

import { bitstring } from "./statevector";

export interface NoiseSpec {
  /** Probability a single-qubit gate goes wrong. */
  gateError1q: number;
  /** Probability a two-qubit gate goes wrong. Always the dominant term. */
  gateError2q: number;
  /** Probability a readout reports the opposite bit. */
  readoutError: number;
}

export const IDEAL: NoiseSpec = { gateError1q: 0, gateError2q: 0, readoutError: 0 };

/** A plausible current-hardware error budget, for the noise slider at 100%. */
export const DEVICE: NoiseSpec = { gateError1q: 0.001, gateError2q: 0.012, readoutError: 0.021 };

export function scaleNoise(level: number): NoiseSpec {
  const t = Math.max(0, Math.min(1, level));
  return {
    gateError1q: DEVICE.gateError1q * t,
    gateError2q: DEVICE.gateError2q * t,
    readoutError: DEVICE.readoutError * t,
  };
}

export interface Counts {
  /** Bitstring (q_{n-1}…q_0) to shot count. Only outcomes that occurred. */
  counts: Record<string, number>;
  shots: number;
}

/** Deterministic RNG so a demo run is reproducible and a cached run matches. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draws `shots` samples from the exact distribution. Optionally applies readout
 * error, which flips individual reported bits — that is what puts the small
 * stray bars on an otherwise two-outcome histogram, and it is a real effect
 * rather than decoration.
 */
export function sampleCounts(
  probabilities: Float64Array,
  qubits: number,
  shots: number,
  opts?: { seed?: number; noise?: NoiseSpec; measuredQubits?: number[] },
): Counts {
  const rand = mulberry32(opts?.seed ?? 0x5eed);
  const readout = opts?.noise?.readoutError ?? 0;

  // Cumulative distribution, built once.
  const cdf = new Float64Array(probabilities.length);
  let acc = 0;
  for (let k = 0; k < probabilities.length; k++) {
    acc += probabilities[k];
    cdf[k] = acc;
  }
  // Guard against a distribution that does not quite reach 1 in floating point.
  if (acc > 0) for (let k = 0; k < cdf.length; k++) cdf[k] /= acc;

  const counts: Record<string, number> = {};
  for (let s = 0; s < shots; s++) {
    const u = rand();
    let k = binarySearch(cdf, u);
    if (readout > 0) {
      for (let q = 0; q < qubits; q++) {
        if (rand() < readout) k ^= 1 << q;
      }
    }
    const key = bitstring(k, qubits);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { counts, shots };
}

function binarySearch(cdf: Float64Array, u: number): number {
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < u) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The gate-noise contribution, applied to the exact distribution before
 * sampling. A depolarising channel of total strength ε mixes the ideal
 * distribution toward uniform, which is the right first-order picture of what
 * depth costs you — and it is what makes misconception M13 visible: the same
 * circuit, made deeper, degrades.
 */
export function applyGateNoise(
  probabilities: Float64Array,
  gateCounts: { oneQubit: number; twoQubit: number },
  noise: NoiseSpec,
): Float64Array {
  const epsilon =
    1 - (1 - noise.gateError1q) ** gateCounts.oneQubit * (1 - noise.gateError2q) ** gateCounts.twoQubit;
  if (epsilon <= 0) return probabilities;

  const uniform = 1 / probabilities.length;
  const out = new Float64Array(probabilities.length);
  for (let k = 0; k < probabilities.length; k++) {
    out[k] = (1 - epsilon) * probabilities[k] + epsilon * uniform;
  }
  return out;
}

/** Counts as sorted rows for the histogram, with zero-count outcomes dropped. */
export function countRows(
  counts: Counts,
  qubits: number,
  order: "basis" | "probability" = "basis",
): Array<{ bits: string; count: number; fraction: number }> {
  const rows = Object.entries(counts.counts).map(([bits, count]) => ({
    bits,
    count,
    fraction: count / counts.shots,
  }));
  if (order === "probability") rows.sort((a, b) => b.count - a.count);
  else rows.sort((a, b) => parseInt(a.bits, 2) - parseInt(b.bits, 2));
  return rows;
}

/** Exact probabilities as histogram rows, for the target and the ideal overlay. */
export function probabilityRows(
  probabilities: Float64Array,
  qubits: number,
  opts?: { floor?: number },
): Array<{ bits: string; fraction: number }> {
  const floor = opts?.floor ?? 1e-9;
  const rows: Array<{ bits: string; fraction: number }> = [];
  for (let k = 0; k < probabilities.length; k++) {
    if (probabilities[k] < floor) continue;
    rows.push({ bits: bitstring(k, qubits), fraction: probabilities[k] });
  }
  return rows;
}
