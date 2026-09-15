/**
 * Density matrices, purity and entropy for any subset of wires — PRD E5-S5, E5-S6.
 *
 * `analysis.ts` already does one qubit and one pair for the Bloch sphere. This
 * is the general form the density-matrix view needs: trace out everything not
 * in `keep`, average over the measurement ensemble, and report
 *
 *   purity  Tr(ρ²)             1 for a pure state, 1/d when maximally mixed
 *   entropy −Σ λ log₂ λ         0 for a pure state, log₂ d when maximally mixed
 *
 * Entropy needs eigenvalues. ρ is Hermitian, so it is embedded as the real
 * symmetric matrix [[A, −B], [B, A]] (ρ = A + iB), whose spectrum is ρ's with
 * every eigenvalue doubled, and diagonalised with cyclic Jacobi rotations —
 * exact enough, dependency-free, and at d ≤ 32 far inside a frame.
 */

import type { Branch } from "./statevector";

export interface DensityMatrix {
  /** Wires kept, ascending. Subsystem bit i is wire keep[i]. */
  wires: number[];
  dim: number;
  /** Row-major real and imaginary parts, dim × dim. */
  re: Float64Array;
  im: Float64Array;
}

/** Largest subsystem this module will build. 2⁶ × 2⁶ is already 4096 cells. */
export const MAX_DENSITY_WIRES = 6;

export function densityMatrix(branches: Branch[], n: number, keep: number[]): DensityMatrix {
  const wires = [...new Set(keep)].sort((a, b) => a - b);
  if (wires.length === 0 || wires.length > MAX_DENSITY_WIRES || wires.some((w) => w < 0 || w >= n)) {
    throw new RangeError(`A density matrix needs 1 to ${MAX_DENSITY_WIRES} wires in range.`);
  }

  const dim = 1 << wires.length;
  const size = 2 ** n;
  let keepMask = 0;
  for (const w of wires) keepMask |= 1 << w;

  const re = new Float64Array(dim * dim);
  const im = new Float64Array(dim * dim);

  for (const b of branches) {
    // Group amplitudes by the configuration of the traced-out wires. Only
    // pairs sharing an environment survive the partial trace, so ρ is the sum
    // over environments of v vᴴ.
    const byEnv = new Map<number, Float64Array>();
    for (let k = 0; k < size; k++) {
      const ar = b.amps[2 * k];
      const ai = b.amps[2 * k + 1];
      if (ar === 0 && ai === 0) continue;
      const env = k & ~keepMask;
      let v = byEnv.get(env);
      if (!v) {
        v = new Float64Array(2 * dim);
        byEnv.set(env, v);
      }
      let s = 0;
      for (let i = 0; i < wires.length; i++) if ((k >> wires[i]) & 1) s |= 1 << i;
      v[2 * s] = ar;
      v[2 * s + 1] = ai;
    }

    for (const v of byEnv.values()) {
      for (let r = 0; r < dim; r++) {
        const xr = v[2 * r], xi = v[2 * r + 1];
        if (xr === 0 && xi === 0) continue;
        for (let c = 0; c < dim; c++) {
          const yr = v[2 * c], yi = v[2 * c + 1];
          // x · conj(y)
          re[r * dim + c] += b.weight * (xr * yr + xi * yi);
          im[r * dim + c] += b.weight * (xi * yr - xr * yi);
        }
      }
    }
  }

  return { wires, dim, re, im };
}

/** Tr(ρ²) = Σ |ρᵢⱼ|² for Hermitian ρ. */
export function purity(rho: DensityMatrix): number {
  let p = 0;
  for (let i = 0; i < rho.re.length; i++) p += rho.re[i] ** 2 + rho.im[i] ** 2;
  return Math.min(1, p);
}

/** Eigenvalues of ρ, descending, clamped to [0, 1]. */
export function eigenvalues(rho: DensityMatrix): number[] {
  const d = rho.dim;
  const m = 2 * d;
  const a = new Float64Array(m * m);
  for (let r = 0; r < d; r++) {
    for (let c = 0; c < d; c++) {
      const x = rho.re[r * d + c];
      const y = rho.im[r * d + c];
      a[r * m + c] = x;             // A
      a[(r + d) * m + (c + d)] = x; // A
      a[r * m + (c + d)] = -y;      // −B
      a[(r + d) * m + c] = y;       // B
    }
  }

  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) off += a[p * m + q] ** 2;
    if (off < 1e-22) break;

    for (let p = 0; p < m; p++) {
      for (let q = p + 1; q < m; q++) {
        const apq = a[p * m + q];
        if (Math.abs(apq) < 1e-15) continue;
        const app = a[p * m + p];
        const aqq = a[q * m + q];
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        for (let k = 0; k < m; k++) {
          const akp = a[k * m + p];
          const akq = a[k * m + q];
          a[k * m + p] = c * akp - s * akq;
          a[k * m + q] = s * akp + c * akq;
        }
        for (let k = 0; k < m; k++) {
          const apk = a[p * m + k];
          const aqk = a[q * m + k];
          a[p * m + k] = c * apk - s * aqk;
          a[q * m + k] = s * apk + c * aqk;
        }
      }
    }
  }

  const doubled = Array.from({ length: m }, (_, i) => a[i * m + i]).sort((x, y) => y - x);
  // Each eigenvalue of ρ appears twice in the embedding; take every other one.
  return Array.from({ length: d }, (_, i) => Math.max(0, Math.min(1, (doubled[2 * i] + doubled[2 * i + 1]) / 2)));
}

/** Von Neumann entropy in bits. */
export function entropy(rho: DensityMatrix): number {
  let s = 0;
  for (const l of eigenvalues(rho)) if (l > 1e-12) s -= l * Math.log2(l);
  return Math.max(0, s);
}

/* -- Pairwise links — PRD E5-S6 ---------------------------------------------- */

export interface PairLink {
  a: number;
  b: number;
  /** Tr(ρ_ab²). */
  purity: number;
  /** I(a:b) = S(a) + S(b) − S(ab), in bits. 0 exactly when the pair is a product. */
  mutualInformation: number;
  /**
   *   paired      — pure together, mixed apart: entangled with each other and
   *                 with nothing else.
   *   correlated  — the pair is not a product, and at least one of them is
   *                 also tied to other wires (or to a measurement record).
   *   independent — ρ_ab = ρ_a ⊗ ρ_b.
   */
  kind: "paired" | "correlated" | "independent";
}

const LINK_TOL = 1e-6;

export function pairLinks(branches: Branch[], n: number): PairLink[] {
  if (n < 2) return [];
  const single = Array.from({ length: n }, (_, q) => entropy(densityMatrix(branches, n, [q])));
  const links: PairLink[] = [];

  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const rho = densityMatrix(branches, n, [a, b]);
      const p = purity(rho);
      const mi = Math.max(0, single[a] + single[b] - entropy(rho));
      const kind: PairLink["kind"] =
        mi < LINK_TOL ? "independent" : p > 1 - LINK_TOL ? "paired" : "correlated";
      links.push({ a, b, purity: p, mutualInformation: mi, kind });
    }
  }
  return links;
}
