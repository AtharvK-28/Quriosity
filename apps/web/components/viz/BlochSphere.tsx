"use client";

/**
 * The Bloch sphere — Design Doc §10.1, decision D5.
 *
 * Drawn from the REDUCED DENSITY MATRIX, never from raw amplitudes. That single
 * choice is the difference between a physics tool and a toy: the naive
 * per-qubit-amplitude version puts an entangled qubit somewhere on the surface,
 * which is wrong, and wrong in a way a physicist spots from the back of the
 * room.
 *
 * A pure state sits on the surface. A mixed one sits inside, at the purity
 * radius. A maximally entangled qubit therefore sits at the dead centre, and
 * this component says so in words rather than leaving it as a puzzle —
 * misconception M4 is resolved by labelling, not by hiding.
 *
 * Rendered as inline SVG rather than WebGL: it needs no context, works where
 * WebGL2 does not, costs nothing to load, and at this size a projected
 * wireframe reads better than a shaded mesh.
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { QubitState } from "@/lib/sim/analysis";
import { phaseHueCss } from "@/lib/sim/analysis";
import { useTheme } from "@/components/chrome/useTheme";
import type { BlochPalette } from "./BlochSphere3D";

/**
 * Three.js is ~600KB and only some surfaces show a sphere, so it is loaded on
 * demand rather than in the first bundle. The workbench's TTI budget is 3.5s
 * with exactly this deferral assumed (PRD §7.1).
 */
const BlochSphere3D = dynamic(
  () => import("./BlochSphere3D").then((m) => m.BlochSphere3D),
  { ssr: false, loading: () => null },
);

/** WebGL2, once per session. PRD §7.8 requires a working path without it. */
function useWebGL2(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      setOk(Boolean(canvas.getContext("webgl2")));
    } catch {
      setOk(false);
    }
  }, []);
  return ok;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * Theme tokens, resolved from CSS so the two renderers cannot drift apart.
 * Re-read whenever the theme flips, because a WebGL scene bakes its colours
 * in. Null until the first read: the 3D view waits for it rather than paint a
 * frame in the wrong theme.
 */
function usePalette(): BlochPalette | null {
  const theme = useTheme();
  const [palette, setPalette] = useState<BlochPalette | null>(null);
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (name: string) => cs.getPropertyValue(name).trim();
    setPalette({
      ink: read("--ink"),
      rule: read("--rule"),
      ruleStrong: read("--rule-3"),
      paper: read("--paper"),
      phase: read("--phase"),
      muted: read("--ink-muted"),
      phaseL: parseFloat(read("--phase-l")) || 42,
    });
  }, [theme]);
  return palette;
}

const SIZE = 168;
const R = 58;
const CX = SIZE / 2;
const CY = SIZE / 2;

// A fixed three-quarter camera. Persisting an orbit per session is a v1
// nicety; a stable canonical view is what makes two spheres comparable.
const AZ = -0.62;
const EL = 0.34;

/** World (x, y, z) with z up → screen (x, y) with y down. */
function project(x: number, y: number, z: number): [number, number] {
  const sx = -Math.sin(AZ) * x + Math.cos(AZ) * y;
  const sy = -(-Math.cos(AZ) * Math.sin(EL) * x - Math.sin(AZ) * Math.sin(EL) * y + Math.cos(EL) * z);
  return [CX + sx * R, CY + sy * R];
}

/** A great circle in the plane spanned by two unit vectors, as an SVG path. */
function greatCircle(
  a: [number, number, number],
  b: [number, number, number],
  steps = 72,
): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const [px, py] = project(
      a[0] * c + b[0] * s,
      a[1] * c + b[1] * s,
      a[2] * c + b[2] * s,
    );
    pts.push(`${i === 0 ? "M" : "L"}${px.toFixed(2)},${py.toFixed(2)}`);
  }
  return pts.join(" ");
}

export interface BlochSphereProps {
  state: QubitState;
  label?: string;
  /** Compact form for a row of spheres. */
  size?: number;
}

export function BlochSphereSVG({ state, label, size = SIZE }: BlochSphereProps) {
  const { x, y, z, radius, entangled, purity } = state;

  const paths = useMemo(
    () => ({
      equator: greatCircle([1, 0, 0], [0, 1, 0]),
      meridianXZ: greatCircle([1, 0, 0], [0, 0, 1]),
      meridianYZ: greatCircle([0, 1, 0], [0, 0, 1]),
    }),
    [],
  );

  const [tipX, tipY] = project(x, y, z);
  const [northX, northY] = project(0, 0, 1);
  const [southX, southY] = project(0, 0, -1);
  const [axisXx, axisXy] = project(1.16, 0, 0);
  const [axisYx, axisYy] = project(0, 1.16, 0);

  // The vector takes the state's phase from the same wheel the amplitude table
  // uses, so phase reads identically in both views.
  const phase = Math.atan2(y, x);
  const vectorColour = entangled ? "var(--ink-faint)" : phaseHueCss(phase);

  const scale = size / SIZE;

  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={describeBloch(state, label)}
        style={{ overflow: "visible" }}
      >
        {/* Sphere outline */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--rule-2)" strokeWidth="1.5" />

        {/* Three great circles */}
        <path d={paths.equator} fill="none" stroke="var(--rule)" strokeWidth="1" />
        <path d={paths.meridianXZ} fill="none" stroke="var(--rule)" strokeWidth="1" />
        <path d={paths.meridianYZ} fill="none" stroke="var(--rule)" strokeWidth="1" />

        {/* Axes */}
        <line x1={CX} y1={CY} x2={axisXx} y2={axisXy} stroke="var(--rule-3)" strokeWidth="1" />
        <line x1={CX} y1={CY} x2={axisYx} y2={axisYy} stroke="var(--rule-3)" strokeWidth="1" />
        <line x1={northX} y1={northY} x2={southX} y2={southY} stroke="var(--rule-3)" strokeWidth="1" />

        {/* Pole labels — the two states a measurement in this basis can give. */}
        <text
          x={northX} y={northY - 7} textAnchor="middle"
          fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-muted)"
        >
          |0⟩
        </text>
        <text
          x={southX} y={southY + 15} textAnchor="middle"
          fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-muted)"
        >
          |1⟩
        </text>

        {/* When there is no individual state, there is no vector to draw. The
            ring marks the purity radius so "at the centre" reads as a measured
            quantity rather than as a failure to render anything. */}
        {radius < 0.02 ? (
          <>
            <circle cx={CX} cy={CY} r={3.5} fill="var(--phase)" />
            <circle
              cx={CX} cy={CY} r={14}
              fill="none" stroke="var(--phase)" strokeWidth="1" strokeDasharray="3 3"
            />
          </>
        ) : (
          <>
            <line
              x1={CX} y1={CY} x2={tipX} y2={tipY}
              style={{ stroke: vectorColour }} strokeWidth="2.5" strokeLinecap="round"
            />
            <circle cx={tipX} cy={tipY} r={4} style={{ fill: vectorColour }} />
            {/* An interior state gets its radius drawn, so "not on the surface"
                is visible rather than inferred. */}
            {radius < 0.98 && (
              <circle
                cx={CX} cy={CY} r={R * radius}
                fill="none" stroke="var(--phase)" strokeWidth="1" strokeDasharray="3 3"
                opacity="0.5"
              />
            )}
          </>
        )}
      </svg>

      <figcaption
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-micro)",
          letterSpacing: "var(--ls-micro)",
          textTransform: "uppercase",
          color: entangled ? "var(--phase)" : "var(--ink-muted)",
          textAlign: "center",
          lineHeight: 1.4,
          maxWidth: size + 24,
        }}
      >
        {label ?? `q${state.qubit}`}
        {entangled && (
          <>
            <br />
            no individual state
          </>
        )}
        {!entangled && radius < 0.98 && (
          <>
            <br />
            purity {purity.toFixed(2)}
          </>
        )}
      </figcaption>
    </figure>
  );
}

/** The text equivalent. A11Y5 makes this a peer view, not a fallback. */
export function describeBloch(s: QubitState, label?: string): string {
  const name = label ?? `Qubit ${s.qubit}`;
  if (s.entangled) {
    return `${name}: Bloch vector at the centre of the sphere, length zero, purity ${s.purity.toFixed(2)}. This qubit has no individual state — it is entangled with another wire. The state-vector table is the view that works here.`;
  }
  const reads = `Reads 1 with probability ${(s.p1 * 100).toFixed(0)} percent.`;
  if (Math.abs(s.z - 1) < 1e-6) return `${name}: at the north pole, state |0⟩. ${reads}`;
  if (Math.abs(s.z + 1) < 1e-6) return `${name}: at the south pole, state |1⟩. ${reads}`;
  return `${name}: Bloch vector x ${s.x.toFixed(2)}, y ${s.y.toFixed(2)}, z ${s.z.toFixed(2)}, length ${s.radius.toFixed(2)}. ${reads}`;
}

/**
 * A row of spheres, one per wire. Above six the docs switch to the table, and
 * so does this — six small spheres is already at the edge of readable.
 */
export function BlochRow({
  states,
  size = 132,
}: {
  states: QubitState[];
  size?: number;
}) {
  if (states.length > 6) {
    return (
      <p style={{ fontSize: "var(--t-body)", color: "var(--ink-muted)", maxWidth: "48ch" }}>
        {states.length} wires is more spheres than are worth reading at once. The
        state-vector table shows all of them at once.
      </p>
    );
  }
  return (
    <div style={{ display: "flex", gap: "var(--s-5)", flexWrap: "wrap" }}>
      {states.map((s) => (
        <BlochSphere key={s.qubit} state={s} size={size} />
      ))}
    </div>
  );
}

/* -- The public component -----------------------------------------------------
   Picks the renderer and keeps the caption, the label and the text equivalent
   identical across both, so the two are genuinely the same view drawn twice
   rather than a good one and a consolation prize.
   ------------------------------------------------------------------------- */

export function BlochSphere({ state, label, size = SIZE }: BlochSphereProps) {
  const webgl = useWebGL2();
  const reducedMotion = useReducedMotion();
  const palette = usePalette();

  // Until the capability check resolves, render the SVG. It is correct, it is
  // instant, and swapping to 3D a frame later is not a flash of wrong content.
  if (webgl !== true || !palette) {
    return <BlochSphereSVG state={state} label={label} size={size} />;
  }

  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
      <div
        role="img"
        aria-label={describeBloch(state, label)}
        style={{ width: size, height: size, display: "grid", placeItems: "center" }}
      >
        <BlochSphere3D state={state} size={size} palette={palette} reducedMotion={reducedMotion} />
      </div>

      <figcaption
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-micro)",
          letterSpacing: "var(--ls-micro)",
          textTransform: "uppercase",
          color: state.entangled ? "var(--phase)" : "var(--ink-muted)",
          textAlign: "center",
          lineHeight: 1.4,
          maxWidth: size + 24,
        }}
      >
        {label ?? `q${state.qubit}`}
        {state.entangled && (
          <>
            <br />
            no individual state
          </>
        )}
        {!state.entangled && state.radius < 0.98 && (
          <>
            <br />
            purity {state.purity.toFixed(2)}
          </>
        )}
      </figcaption>
    </figure>
  );
}
