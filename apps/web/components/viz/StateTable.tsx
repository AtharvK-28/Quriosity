"use client";

/**
 * The state-vector table — Design Doc §10.3.
 *
 * A peer view of the Bloch sphere, not a degraded fallback. It is the view that
 * still works when a state is entangled, when it is mixed, or when there are
 * more wires than spheres worth drawing — and it is the accessible primary,
 * reachable in one keystroke.
 *
 * Phase carries a hue AND an arrow angle AND a numeric value, so colour is
 * never the sole carrier of meaning (PRD A11Y4).
 */

import { formatParam } from "@/lib/ir/gates";
import { amplitudeRows, phaseHue, type AmplitudeRow } from "@/lib/sim/analysis";
import type { SimResult } from "@/lib/sim/statevector";

export function StateTable({
  result,
  order = "basis",
  maxRows = 16,
}: {
  result: SimResult;
  order?: "basis" | "probability";
  maxRows?: number;
}) {
  const all = amplitudeRows(result);
  const rows = order === "probability" ? [...all].sort((a, b) => b.probability - a.probability) : all;
  const shown = rows.slice(0, maxRows);
  const hiddenNonZero = rows.length - shown.length;
  const zeros = 2 ** result.qubits - rows.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-micro)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <thead>
          <tr>
            {["state", result.mixed ? "" : "amplitude", "magnitude", result.mixed ? "" : "phase", "probability"]
              .filter(Boolean)
              .map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === "state" ? "left" : "right",
                    padding: "0 0 6px",
                    borderBottom: "1px solid var(--rule-2)",
                    letterSpacing: "var(--ls-micro)",
                    textTransform: "uppercase",
                    color: "var(--ink-faint)",
                    fontWeight: 500,
                  }}
                >
                  {h}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <Row key={r.index} row={r} mixed={result.mixed} />
          ))}
        </tbody>
      </table>

      {/* Rows that are exactly zero are collapsed rather than listed. A table
          of sixteen rows where fourteen are 0.0000 hides the two that matter. */}
      {(zeros > 0 || hiddenNonZero > 0) && (
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--t-micro)",
            letterSpacing: "var(--ls-micro)",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
          }}
        >
          {hiddenNonZero > 0 && `${hiddenNonZero} more`}
          {hiddenNonZero > 0 && zeros > 0 && " · "}
          {zeros > 0 && `${zeros} zero amplitude${zeros === 1 ? "" : "s"}`}
        </p>
      )}

      {result.mixed && (
        <p style={{ fontSize: "var(--t-body)", color: "var(--ink-2)", maxWidth: "52ch" }}>
          This state is mixed — a measurement partway through the circuit left an
          ensemble rather than one state. Probabilities are exact; there are no
          single amplitudes to report.
        </p>
      )}
    </div>
  );
}

function Row({ row, mixed }: { row: AmplitudeRow; mixed: boolean }) {
  const cell: React.CSSProperties = {
    padding: "5px 0",
    textAlign: "right",
    borderBottom: "1px solid var(--rule)",
    color: "var(--ink-2)",
  };

  return (
    <tr>
      <td style={{ ...cell, textAlign: "left", color: "var(--ink)" }}>|{row.bits}⟩</td>

      {!mixed && (
        <td style={cell}>
          {row.re.toFixed(4)}
          {row.im >= 0 ? " + " : " − "}
          {Math.abs(row.im).toFixed(4)}i
        </td>
      )}

      <td style={cell}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
          {/* Magnitude carries a number AND a proportional bar. */}
          <span
            style={{
              width: 34,
              height: 6,
              background: "var(--paper-inset)",
              position: "relative",
              display: "inline-block",
            }}
            aria-hidden
          >
            <span
              style={{
                position: "absolute",
                inset: 0,
                width: `${row.magnitude * 100}%`,
                background: "var(--ink-muted)",
              }}
            />
          </span>
          {row.magnitude.toFixed(4)}
        </span>
      </td>

      {!mixed && (
        <td style={cell}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
            {/* Hue AND arrow angle AND the value itself. */}
            <PhaseArrow phase={row.phase} />
            {formatParam(row.phase)}
          </span>
        </td>
      )}

      <td style={{ ...cell, color: "var(--ink)" }}>{(row.probability * 100).toFixed(1)}%</td>
    </tr>
  );
}

function PhaseArrow({ phase }: { phase: number }) {
  const deg = (phase * 180) / Math.PI;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden style={{ flex: "none" }}>
      <circle cx="7" cy="7" r="6" fill="none" stroke="var(--rule-2)" strokeWidth="1" />
      <line
        x1="7" y1="7"
        x2={7 + 5 * Math.cos(phase)}
        y2={7 - 5 * Math.sin(phase)}
        stroke={phaseHue(phase)}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <title>{`phase ${deg.toFixed(0)} degrees`}</title>
    </svg>
  );
}
