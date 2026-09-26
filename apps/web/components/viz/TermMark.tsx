/**
 * A word's specimen: the thing the word names, drawn small.
 *
 * Show, then explain (Design Doc §2.3) — even a definition leads with the
 * artefact. A Bloch vector for a state, a gate sitting on a wire for an
 * operation, the notation itself for a symbol. Drawn from the same tokens as
 * the full instruments, so the small version reads as the same object.
 */

import { GateMark } from "@/components/circuit/GateMark";
import type { TermMark as Mark } from "@/lib/curriculum/glossary";
import { GATES } from "@/lib/ir/gates";
import s from "./TermMark.module.css";

export function TermMark({ mark, size = 64 }: { mark: Mark; size?: number }) {
  return (
    <span className={s.tile} style={{ width: size, height: size }} aria-hidden>
      {"bloch" in mark && <MiniBloch v={mark.bloch} />}
      {"wire" in mark && (
        <span className={s.wire}>
          {mark.wire.map((type) => (
            <span key={type} className={s.gate} data-tall={GATES[type].controlArity > 0 || undefined}>
              <GateMark spec={GATES[type]} />
            </span>
          ))}
        </span>
      )}
      {"text" in mark && (
        <span className={s.text} data-long={mark.text.length > 3 || undefined}>
          {mark.text}
        </span>
      )}
    </span>
  );
}

const C = 50;
const R = 34;

/** Oblique view: +x towards the viewer and down-left, +y right, +z up. */
function project(x: number, y: number, z: number): [number, number] {
  return [C + R * (0.94 * y - 0.36 * x), C + R * (-0.94 * z + 0.3 * x)];
}

function MiniBloch({ v }: { v: [number, number, number] }) {
  const [x, y, z] = v;
  const radius = Math.hypot(x, y, z);
  const equator = Array.from({ length: 49 }, (_, i) => {
    const t = (i / 48) * 2 * Math.PI;
    return project(Math.cos(t), Math.sin(t), 0);
  })
    .map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`)
    .join("");
  const [tx, ty] = project(x, y, z);

  return (
    <svg viewBox="0 0 100 100" className={s.sphere}>
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--rule-3)" strokeWidth="2" />
      <path d={equator} fill="none" stroke="var(--rule-2)" strokeWidth="1.5" />
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="var(--rule-2)" strokeWidth="1.5" />
      {radius < 0.02 ? (
        // No individual state: the vector has nowhere to point.
        <>
          <circle cx={C} cy={C} r={4} fill="var(--phase)" />
          <circle cx={C} cy={C} r={13} fill="none" stroke="var(--phase)" strokeWidth="1.5" strokeDasharray="3 3" />
        </>
      ) : (
        <>
          {radius < 0.98 && (
            <circle
              cx={C} cy={C} r={R * radius}
              fill="none" stroke="var(--phase)" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6"
            />
          )}
          <line x1={C} y1={C} x2={tx} y2={ty} stroke="var(--phase)" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx={tx} cy={ty} r={5} fill="var(--phase)" />
        </>
      )}
    </svg>
  );
}
