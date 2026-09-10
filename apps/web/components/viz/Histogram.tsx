"use client";

/**
 * The probability histogram — Design Doc §10.2.
 *
 * This is the verdict in this product. Nobody is ever told "correct"; they are
 * handed a plot and one sentence about what its shape means. So the plot has to
 * be honest:
 *
 *   - The Y axis is fixed 0–1 and never auto-scales. Auto-scaling makes a 4%
 *     outcome look large, which is a lie the learner cannot catch.
 *   - The endianness convention is printed on the axis, not hidden in a
 *     footnote. Misconception M10 survives by being unstated.
 *   - When a target is present it draws as a ghost bar BEHIND the actual, so
 *     the gap between them is the visual, rather than two charts side by side.
 */

import { bitstring } from "@/lib/sim/statevector";
import styles from "./Histogram.module.css";

export interface HistogramSeries {
  /** Bitstring (q_{n-1}…q_0) → value in 0–1. */
  values: Record<string, number>;
}

export interface HistogramProps {
  qubits: number;
  /** What the circuit actually produced. */
  actual: Record<string, number>;
  /** The target shape, drawn as a dashed ghost behind the actual. */
  target?: Record<string, number>;
  /** The noiseless result, drawn as an outline when noise is on. */
  ideal?: Record<string, number>;
  /** Outcomes to draw in the error colour — what the diagnosis points at. */
  flagged?: string[];
  /** Outcomes to draw in the measurement colour — a matched target. */
  hit?: string[];
  /** Print the value above each bar. Auto-off above 16 outcomes. */
  showValues?: boolean;
  height?: number;
  /** Total shots, printed in the caption. Omit for an exact distribution. */
  shots?: number;
  /** Show every basis state, including zeros. Default shows only what occurred. */
  dense?: boolean;
}

export function Histogram({
  qubits,
  actual,
  target,
  ideal,
  flagged = [],
  hit = [],
  showValues,
  height = 150,
  shots,
  dense = false,
}: HistogramProps) {
  // Which columns to draw. Union of every series so a target outcome the
  // circuit missed entirely still gets a column — that empty column is often
  // the whole point.
  const keys = new Set<string>();
  if (dense && qubits <= 4) {
    for (let k = 0; k < 2 ** qubits; k++) keys.add(bitstring(k, qubits));
  } else {
    for (const s of [actual, target, ideal]) {
      if (!s) continue;
      for (const [k, v] of Object.entries(s)) if (v > 1e-9) keys.add(k);
    }
  }
  const columns = [...keys].sort((a, b) => parseInt(a, 2) - parseInt(b, 2));
  const printValues = showValues ?? columns.length <= 16;

  const flaggedSet = new Set(flagged);
  const hitSet = new Set(hit);

  return (
    <figure className={styles.root}>
      <div className={styles.plot} style={{ ["--plot-h" as string]: `${height}px` }}>
        <div className={styles.axis} aria-hidden>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <span key={t} className={styles.tick} style={{ top: `${(1 - t) * 100}%` }}>
              {t === 0 || t === 1 ? t.toFixed(0) : t.toFixed(2).slice(1)}
            </span>
          ))}
        </div>
        {[0.25, 0.5, 0.75].map((t) => (
          <span
            key={t}
            className={styles.gridline}
            data-major={t === 0.5}
            style={{ top: `${(1 - t) * 100}%` }}
            aria-hidden
          />
        ))}

        {columns.map((bits) => {
          const a = actual[bits] ?? 0;
          const t = target?.[bits];
          const i = ideal?.[bits];
          return (
            <div key={bits} className={styles.col}>
              {t !== undefined && (
                <span
                  className={styles.bar}
                  data-series="target"
                  style={{ height: `${t * 100}%`, width: "100%", maxWidth: 56 }}
                  aria-hidden
                />
              )}
              {i !== undefined && (
                <span
                  className={styles.bar}
                  data-series="ideal"
                  style={{ height: `${i * 100}%`, width: "100%", maxWidth: 56 }}
                  aria-hidden
                />
              )}
              <span
                className={styles.bar}
                style={{ height: `${a * 100}%` }}
                data-flagged={flaggedSet.has(bits)}
                data-hit={hitSet.has(bits)}
              >
                {printValues && a > 0.004 && (
                  // Above about 85% there is no room left above the bar, and a
                  // value that escapes the plot lands on whatever is above it.
                  <span className={styles.value} data-inside={a > 0.85}>
                    {shots ? Math.round(a * shots) : `${(a * 100).toFixed(0)}%`}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.labels} aria-hidden>
        {columns.map((bits) => (
          <span key={bits} className={styles.label} data-flagged={flaggedSet.has(bits)}>
            {bits}
          </span>
        ))}
      </div>

      <figcaption className={styles.caption}>
        {/* One wire has no ordering to state, and "q0…q0" reads as a bug. */}
        <span>{qubits > 1 ? `q${qubits - 1}…q0 · little-endian` : "q0"}</span>
        <span>{shots ? `${shots} shots` : "exact"}</span>
      </figcaption>

      {(target || ideal) && (
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.swatch} /> yours
          </span>
          {target && (
            <span className={styles.legendItem}>
              <span className={styles.swatch} data-series="target" /> target
            </span>
          )}
          {ideal && (
            <span className={styles.legendItem}>
              <span className={styles.swatch} data-series="ideal" /> noiseless
            </span>
          )}
        </div>
      )}

      {/* A live region announces the reading. PRD A11Y7 / Design §12 A6. */}
      <p className="sr-only" aria-live="polite">
        {describeHistogram(actual, shots)}
      </p>
    </figure>
  );
}

/** "Two outcomes: 0 0 at 51 percent, 1 1 at 49 percent." */
export function describeHistogram(values: Record<string, number>, shots?: number): string {
  const rows = Object.entries(values)
    .filter(([, v]) => v > 0.004)
    .sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return "No outcomes recorded.";
  const parts = rows.map(
    ([bits, v]) => `${bits.split("").join(" ")} at ${Math.round(v * 100)} percent`,
  );
  return `${rows.length} outcome${rows.length === 1 ? "" : "s"}: ${parts.join(", ")}.${shots ? ` Over ${shots} shots.` : ""}`;
}

/** Counts → fractions, the shape this component consumes. */
export function toFractions(counts: Record<string, number>, shots: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) out[k] = v / shots;
  return out;
}

/** Exact probabilities → the same shape. */
export function probabilityMap(probabilities: Float64Array, qubits: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let k = 0; k < probabilities.length; k++) {
    if (probabilities[k] > 1e-9) out[bitstring(k, qubits)] = probabilities[k];
  }
  return out;
}
