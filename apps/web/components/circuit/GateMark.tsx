"use client";

/**
 * The canonical small rendering of a gate, outside the circuit grid.
 *
 * A multi-qubit gate cannot be drawn as its base letter. `cx` carries the base
 * unitary X and `cz` carries Z, so rendering the registry glyph puts a bare "X"
 * and a bare "Z" wherever these appear — visually identical to Pauli-X and
 * Pauli-Z sitting beside them. That bit someone in the tray, and it bit again
 * on the gate reference, which is the one page whose entire job is teaching the
 * notation.
 *
 * One component, used by the tray and the reference, so the two cannot drift.
 */

import type { GateSpec } from "@/lib/ir/gates";

export function GateMark({ spec, sub }: { spec: GateSpec; sub?: string }) {
  const multi = spec.controlArity > 0 || spec.targetArity > 1;

  if (!multi) {
    return (
      <span aria-hidden>
        {spec.glyph.replace("†", "")}
        {spec.glyph.includes("†") && (
          <span style={{ fontSize: "0.66em", verticalAlign: "super" }}>†</span>
        )}
      </span>
    );
  }

  // Controlled rotations need room for their label, so they get a taller mark
  // with the box big enough to read at tray size.
  if (spec.type === "crx" || spec.type === "cry" || spec.type === "crz") {
    return (
      <svg width="28" height="32" viewBox="0 0 28 32" aria-hidden style={{ color: "currentColor" }}>
        <line x1="14" y1="5" x2="14" y2="15" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="14" cy="5" r="2.6" fill="currentColor" />
        <rect x="1.5" y="15" width="25" height="15.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <text
          x="14" y="26.5" textAnchor="middle"
          fontFamily="var(--font-mono)" fontSize="10" fontWeight="500" fill="currentColor"
        >
          {sub ?? spec.glyph}
        </text>
      </svg>
    );
  }

  // The miniature of what the gate actually places: a control dot joined to its
  // target. That is the notation itself, so it needs no legend.
  return (
    <svg width="24" height="26" viewBox="0 0 24 26" aria-hidden style={{ color: "currentColor" }}>
      <line x1="12" y1="6" x2="12" y2="20" stroke="currentColor" strokeWidth="1.6" />

      {spec.type === "swap" ? (
        <>
          <Cross x={12} y={6} />
          <Cross x={12} y={20} />
        </>
      ) : spec.type === "ccx" ? (
        <>
          <circle cx="12" cy="4" r="2.4" fill="currentColor" />
          <circle cx="12" cy="12" r="2.4" fill="currentColor" />
          <XTarget x={12} y={21} />
        </>
      ) : spec.type === "cz" ? (
        <>
          {/* CZ is symmetric, and the notation says so: two identical dots. */}
          <circle cx="12" cy="6" r="2.8" fill="currentColor" />
          <circle cx="12" cy="20" r="2.8" fill="currentColor" />
        </>
      ) : spec.type === "cx" ? (
        <>
          <circle cx="12" cy="6" r="2.8" fill="currentColor" />
          <XTarget x={12} y={19} />
        </>
      ) : (
        // Controlled rotations: a dot, then the labelled box.
        <>
          <circle cx="12" cy="5" r="2.4" fill="currentColor" />
          <rect
            x="3" y="13" width="18" height="11" rx="1.5"
            fill="none" stroke="currentColor" strokeWidth="1.6"
          />
          <text
            x="12" y="21.5" textAnchor="middle"
            fontFamily="var(--font-mono)" fontSize="7.5" fill="currentColor"
          >
            {sub ?? spec.glyph}
          </text>
        </>
      )}
    </svg>
  );
}

function XTarget({ x, y }: { x: number; y: number }) {
  return (
    <>
      <circle cx={x} cy={y} r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1={x} y1={y - 4.6} x2={x} y2={y + 4.6} stroke="currentColor" strokeWidth="1.6" />
      <line x1={x - 4.6} y1={y} x2={x + 4.6} y2={y} stroke="currentColor" strokeWidth="1.6" />
    </>
  );
}

function Cross({ x, y }: { x: number; y: number }) {
  return (
    <>
      <line x1={x - 3.6} y1={y - 3.6} x2={x + 3.6} y2={y + 3.6} stroke="currentColor" strokeWidth="1.8" />
      <line x1={x + 3.6} y1={y - 3.6} x2={x - 3.6} y2={y + 3.6} stroke="currentColor" strokeWidth="1.8" />
    </>
  );
}
