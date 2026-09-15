"use client";

/**
 * The density-matrix view — PRD E5-S5, Design Doc §7.3 ("density matrix" is
 * the fourth state view).
 *
 * "Heatmap of real and imaginary parts, with purity and von Neumann entropy
 * reported." Colour follows the one rule the product has: hue is phase. A
 * positive real entry is drawn at phase 0, a negative one at π, a positive
 * imaginary one at π/2 — the same wheel the amplitude table and the Bloch
 * vector use, so a learner who has read one of them can read this. Strength is
 * the fill; the value is printed in the cell when the grid is small enough to
 * hold it, and in the cell's title when it is not (A11Y4: colour is never the
 * only carrier).
 *
 * It works on any subsystem up to four wires, which is where it earns its
 * place: pick one half of a Bell pair and watch the off-diagonals vanish.
 */

import { useMemo, useState } from "react";
import { Readout, Segmented } from "@/components/ui/primitives";
import { densityMatrix, entropy, purity } from "@/lib/sim/density";
import { phaseHueCss } from "@/lib/sim/analysis";
import type { Branch } from "@/lib/sim/statevector";
import s from "./DensityMatrix.module.css";

type Part = "re" | "im";

/** Largest subsystem drawn as a grid. 16 × 16 is already 256 cells. */
const MAX_GRID_WIRES = 4;

export function DensityMatrix({
  branches,
  qubits,
  mixedRegister,
}: {
  branches: Branch[];
  qubits: number;
  /** True when a mid-circuit measurement left the whole register mixed. */
  mixedRegister: boolean;
}) {
  const options = useMemo(() => subsystems(qubits), [qubits]);
  const [key, setKey] = useState(options[0].key);
  const [part, setPart] = useState<Part>("re");

  const chosen = options.find((o) => o.key === key) ?? options[0];
  const rho = useMemo(() => densityMatrix(branches, qubits, chosen.wires), [branches, qubits, chosen]);
  const p = purity(rho);
  const S = entropy(rho);
  const d = rho.dim;
  const values = part === "re" ? rho.re : rho.im;
  const showValues = d <= 4;
  const labels = Array.from({ length: d }, (_, i) => bitsOf(i, chosen.wires.length));
  const pure = p > 1 - 1e-6;
  const whole = chosen.wires.length === qubits;

  return (
    <div className={s.view}>
      <div className={s.controls}>
        <label className={s.pick}>
          <span className="label">Subsystem</span>
          <select className={s.select} value={chosen.key} onChange={(e) => setKey(e.target.value)}>
            {options.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
        <Segmented<Part>
          ariaLabel="Matrix part"
          value={part}
          onChange={setPart}
          options={[{ value: "re", label: "Real" }, { value: "im", label: "Imaginary" }]}
        />
      </div>

      <div className={s.gridWrap}>
        <table className={s.grid} data-dense={!showValues} aria-label={`${part === "re" ? "Real" : "Imaginary"} part of the density matrix for ${chosen.label}`}>
          <thead>
            <tr>
              <th aria-hidden />
              {labels.map((l) => (
                <th key={l} scope="col" className={s.axis}>⟨{l}|</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((row, r) => (
              <tr key={row}>
                <th scope="row" className={s.axis}>|{row}⟩</th>
                {labels.map((col, c) => {
                  const v = values[r * d + c];
                  const mag = Math.min(1, Math.abs(v) * 2);
                  const angle = part === "re" ? (v >= 0 ? 0 : Math.PI) : v >= 0 ? Math.PI / 2 : -Math.PI / 2;
                  const tiny = Math.abs(v) < 5e-4;
                  return (
                    <td
                      key={col}
                      className={s.cell}
                      title={`ρ[${row},${col}] ${part === "re" ? "real" : "imaginary"} part ${v.toFixed(4)}`}
                      style={
                        tiny
                          ? undefined
                          : { background: `color-mix(in srgb, ${phaseHueCss(angle)} ${Math.round(18 + mag * 70)}%, transparent)` }
                      }
                    >
                      {showValues && (tiny ? "·" : fmt(v))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={s.readouts}>
        <Readout value={p.toFixed(3)} label="purity Tr ρ²" tone={pure ? "measure" : "flag"} />
        <Readout value={S.toFixed(3)} label="entropy · bits" />
        <Readout value={`${d}×${d}`} label="dimension" />
      </div>

      <p className={s.reading}>{reading(pure, whole, mixedRegister, S, chosen.wires.length)}</p>

      <p className={s.legend}>
        Hue is phase, as everywhere else: {part === "re" ? "positive entries at 0, negative at π" : "positive entries at π/2, negative at −π/2"}.
        Fill is magnitude. Rows and columns read {chosen.wires.length > 1 ? `q${Math.max(...chosen.wires)}…q${Math.min(...chosen.wires)}` : `q${chosen.wires[0]}`}.
      </p>
    </div>
  );
}

function reading(pure: boolean, whole: boolean, mixedRegister: boolean, S: number, wires: number): string {
  if (pure) {
    return whole
      ? "Pure: the register has one definite state, so every off-diagonal term is intact."
      : "Pure: this part of the register has a state of its own — nothing outside it is correlated with it.";
  }
  const max = S > wires - 1e-6;
  if (mixedRegister && whole) {
    return "Mixed: a measurement partway through left an ensemble, and the off-diagonal terms it destroyed are gone.";
  }
  return max
    ? "Maximally mixed: on its own this subsystem is pure randomness. All of its information lives in correlations with the wires traced out."
    : "Mixed: some of this subsystem's information lives in correlations with the wires traced out, which is what entanglement looks like from inside.";
}

function subsystems(n: number): Array<{ key: string; label: string; wires: number[] }> {
  const out: Array<{ key: string; label: string; wires: number[] }> = [];
  const all = Array.from({ length: n }, (_, i) => i);
  if (n <= MAX_GRID_WIRES) out.push({ key: "all", label: n === 1 ? "q0" : "Whole register", wires: all });
  if (n > 1) {
    for (let q = 0; q < n; q++) out.push({ key: `q${q}`, label: `q${q} alone`, wires: [q] });
  }
  if (n > 2 && n <= 8) {
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) out.push({ key: `q${a}q${b}`, label: `q${a} and q${b}`, wires: [a, b] });
    }
  }
  return out;
}

function bitsOf(k: number, width: number): string {
  let out = "";
  for (let j = width - 1; j >= 0; j--) out += (k >> j) & 1;
  return out;
}

function fmt(v: number): string {
  const r = v.toFixed(2);
  return r === "-0.00" ? "0.00" : r;
}
