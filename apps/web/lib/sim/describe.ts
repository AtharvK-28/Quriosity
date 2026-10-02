/**
 * A state, written the way a textbook writes it, and named when it has a name.
 *
 * Used where the platform works a state out for someone: the author page
 * derives a challenge's target from a reference circuit and says what it is,
 * "(|00⟩ + |11⟩) / √2 · Bell pair |Φ⁺⟩", rather than leaving the instructor
 * to read it off a histogram.
 *
 * Global phase is dropped: the first nonzero amplitude is made real and
 * positive, because no measurement can tell the two apart and grading ignores
 * it too. Bit order is the project's one convention: little-endian, q0 is the
 * rightmost bit of every ket.
 */

import { formatParam } from "@/lib/ir/gates";
import { bitstring } from "./statevector";

const EPS = 1e-9;
/** A written state with more terms than this is abbreviated. */
const MAX_TERMS = 8;

export interface StateDescription {
  /** e.g. "(|00⟩ + |11⟩) / √2". */
  ket: string;
  /** e.g. "Bell pair |Φ⁺⟩", or null when the state has no common name. */
  name: string | null;
}

interface Term {
  k: number;
  re: number;
  im: number;
}

/** `amplitudes` are interleaved [re, im] pairs, 2^qubits of them. */
export function describeState(amplitudes: Float64Array | number[], qubits: number): StateDescription {
  const terms = dephase(amplitudes, qubits);
  return { ket: writeKet(terms, qubits), name: nameOf(terms, qubits) };
}

/** Nonzero terms, with the global phase removed. */
function dephase(amplitudes: Float64Array | number[], qubits: number): Term[] {
  const raw: Term[] = [];
  for (let k = 0; k < 2 ** qubits; k++) {
    const re = amplitudes[2 * k] ?? 0;
    const im = amplitudes[2 * k + 1] ?? 0;
    if (re * re + im * im > EPS) raw.push({ k, re, im });
  }
  if (raw.length === 0) return raw;
  const { re: r0, im: i0 } = raw[0];
  const m = Math.hypot(r0, i0);
  // Multiply by conj(a0)/|a0|, which turns a0 real and positive.
  const cr = r0 / m;
  const ci = -i0 / m;
  return raw.map(({ k, re, im }) => ({ k, re: clean(re * cr - im * ci), im: clean(re * ci + im * cr) }));
}

function clean(x: number): number {
  return Math.abs(x) < 1e-12 ? 0 : x;
}

/* -- Writing ------------------------------------------------------------------ */

function writeKet(terms: Term[], qubits: number): string {
  if (terms.length === 0) return "0";
  const mags = terms.map((t) => Math.hypot(t.re, t.im));
  const even = mags.every((m) => Math.abs(m - mags[0]) < 1e-6);

  if (even) {
    // Factor the shared magnitude out: every coefficient is then a phase.
    const parts = terms.slice(0, MAX_TERMS).map((t, i) => {
      const [sign, factor] = phaseFactor(t.re / mags[i], t.im / mags[i]);
      const body = `${factor}|${bitstring(t.k, qubits)}⟩`;
      return i === 0 ? (sign === "−" ? `−${body}` : body) : `${sign} ${body}`;
    });
    const more = terms.length > MAX_TERMS ? ` + … (${terms.length} terms)` : "";
    const sum = parts.join(" ") + more;
    if (terms.length === 1) return sum;
    return `(${sum}) / ${rootOf(terms.length)}`;
  }

  const parts = terms.slice(0, MAX_TERMS).map((t, i) => {
    const coef = complexCoefficient(t.re, t.im);
    const neg = coef.startsWith("−");
    const body = `${neg ? coef.slice(1) : coef}|${bitstring(t.k, qubits)}⟩`;
    if (i === 0) return neg ? `−${body}` : body;
    return `${neg ? "−" : "+"} ${body}`;
  });
  const more = terms.length > MAX_TERMS ? ` + … (${terms.length} terms)` : "";
  return parts.join(" ") + more;
}

/** A unit complex number as a sign and a written factor: 1, i, or e^(iφ). */
function phaseFactor(re: number, im: number): ["+" | "−", string] {
  if (Math.abs(im) < 1e-6) return [re < 0 ? "−" : "+", ""];
  if (Math.abs(re) < 1e-6) return [im < 0 ? "−" : "+", "i"];
  const phi = Math.atan2(im, re);
  return ["+", `e^(i${formatParam(phi)})`];
}

function complexCoefficient(re: number, im: number): string {
  const f = (x: number) => Math.abs(x).toFixed(3);
  if (Math.abs(im) < 1e-6) return `${re < 0 ? "−" : ""}${f(re)}`;
  if (Math.abs(re) < 1e-6) return `${im < 0 ? "−" : ""}${f(im)}i`;
  return `(${re < 0 ? "−" : ""}${f(re)} ${im < 0 ? "−" : "+"} ${f(im)}i)`;
}

/** √n, simplified: √4 → 2, √8 → 2√2. */
function rootOf(n: number): string {
  let outside = 1;
  let inside = n;
  for (let d = 2; d * d <= inside; d++) {
    while (inside % (d * d) === 0) {
      outside *= d;
      inside /= d * d;
    }
  }
  if (inside === 1) return String(outside);
  return outside === 1 ? `√${inside}` : `(${outside}√${inside})`;
}

/* -- Naming ------------------------------------------------------------------- */

function nameOf(terms: Term[], qubits: number): string | null {
  if (terms.length === 0) return null;
  const R = Math.SQRT1_2;
  const is = (k: number, re: number, im = 0) =>
    terms.some((t) => t.k === k && Math.abs(t.re - re) < 1e-6 && Math.abs(t.im - im) < 1e-6);
  const two = (a: number, b: number, re: number, im = 0) => terms.length === 2 && is(a, R) && is(b, re * R, im * R);

  if (terms.length === 1) {
    return qubits === 1 ? null : `basis state |${bitstring(terms[0].k, qubits)}⟩`;
  }

  if (qubits === 1) {
    if (two(0, 1, 1)) return "|+⟩";
    if (two(0, 1, -1)) return "|−⟩";
    if (two(0, 1, 0, 1)) return "|+i⟩";
    if (two(0, 1, 0, -1)) return "|−i⟩";
    return null;
  }

  const all = 2 ** qubits - 1;
  if (qubits === 2) {
    if (two(0, 3, 1)) return "Bell pair |Φ⁺⟩";
    if (two(0, 3, -1)) return "Bell pair |Φ⁻⟩";
    if (two(1, 2, 1)) return "Bell pair |Ψ⁺⟩";
    if (two(1, 2, -1)) return "Bell pair |Ψ⁻⟩";
  } else {
    if (two(0, all, 1)) return `GHZ state, ${qubits} wires`;
    if (two(0, all, -1)) return `GHZ state (minus), ${qubits} wires`;
    const w = 1 / Math.sqrt(qubits);
    const oneHot = terms.length === qubits && terms.every((t) => isPowerOfTwo(t.k) && Math.abs(t.re - w) < 1e-6 && Math.abs(t.im) < 1e-6);
    if (oneHot) return `W state, ${qubits} wires`;
  }

  const u = 1 / Math.sqrt(2 ** qubits);
  if (terms.length === 2 ** qubits && terms.every((t) => Math.abs(t.re - u) < 1e-6 && Math.abs(t.im) < 1e-6)) {
    return "even superposition (|+⟩ on every wire)";
  }
  return null;
}

function isPowerOfTwo(k: number): boolean {
  return k > 0 && (k & (k - 1)) === 0;
}
