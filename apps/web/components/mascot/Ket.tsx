/**
 * Ket, the tutor's face.
 *
 * Named for the ket, |ψ⟩: the first piece of notation a learner meets. Ket
 * is a Bloch sphere with a face. The ring is its equator, where phase lives,
 * and the gold antenna is its state vector, drawn from the centre of the
 * sphere as a Bloch vector is. Pass `vector` and the antenna shows that
 * state exactly:
 *
 *   |0⟩  straight up          |1⟩  straight down
 *   |+⟩  out to Ket's right   |−⟩  out to its left
 *   |−i⟩ points at you: its bob sits on Ket's face
 *   |+i⟩ points away: the bob is hidden, marked by a dashed ring
 *   an entangled qubit's vector is shorter than 1, which on a sphere means
 *   inside it: inside Ket. So the antenna's direction is the vector's, and
 *   how far it reaches past the body is its length. Half-entangled, a stub;
 *   no state of its own at all (one half of a Bell pair), no antenna
 *
 * Without `vector`, the mood picks a pose. Moods are a face and a pose, not a
 * claim about any circuit.
 *
 * Motion is one-shot, never ambient: "happy" hops once when it appears.
 * Anything that moves the antenna (the onboarding) drives `vector` itself,
 * along the real rotation, in lib/ket/bloch.ts.
 */

import { toScreen, type Vec3 } from "@/lib/ket/bloch";
import s from "./Ket.module.css";

export type KetMood = "calm" | "curious" | "thinking" | "happy" | "sleepy" | "cozy";

/** The antenna pose for each mood, as a direction. */
const POSE: Record<KetMood, Vec3> = {
  calm: [0, 0, 1],
  curious: [Math.sin(0.61), 0, Math.cos(0.61)],
  thinking: [1, 0, 0],
  happy: [0, 0, 1],
  sleepy: [Math.sin(1.9), 0, Math.cos(1.9)],
  cozy: [0, 0, 1],
};

const C = { x: 32, y: 37 };
const R = 21;
/** Antenna length from the centre for a pure state. */
const L = 33;

const INK = "#1d0f45";

/**
 * Where the antenna's tip lands for vector v: along v's direction, reaching
 * from the surface (length 0) out to L (a pure state, length 1).
 */
function point(v: Vec3) {
  const r = Math.min(1, Math.hypot(v[0], v[1], v[2]));
  if (r < 1e-9) return { x: C.x, y: C.y, depth: 0 };
  const { sx, sy, depth } = toScreen([v[0] / r, v[1] / r, v[2] / r]);
  const reach = R + (L - R) * r;
  return { x: C.x + reach * sx, y: C.y + reach * sy, depth };
}

/** Splits a trail into runs drawn behind the body and runs drawn in front. */
function trailRuns(trail: readonly Vec3[]) {
  const runs: Array<{ front: boolean; pts: string[] }> = [];
  for (const v of trail) {
    const p = point(v);
    const inside = Math.hypot(p.x - C.x, p.y - C.y) < R;
    const front = !(inside && p.depth < 0);
    const last = runs[runs.length - 1];
    const xy = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (last && last.front === front) last.pts.push(xy);
    else runs.push({ front, pts: last ? [last.pts[last.pts.length - 1], xy] : [xy] });
  }
  return runs;
}

export function Ket({
  mood = "calm",
  vector,
  trail,
  size = 32,
  title,
  className,
}: {
  mood?: KetMood;
  /** A Bloch vector (length ≤ 1) for the antenna to show. Overrides the mood's pose. */
  vector?: Vec3;
  /** Where the antenna has just been, drawn as a dotted path. */
  trail?: readonly Vec3[];
  size?: number;
  /** Set to give Ket an accessible name; otherwise it is decoration. */
  title?: string;
  className?: string;
}) {
  const v = vector ?? POSE[mood];
  const tip = point(v);
  const outside = Math.hypot(tip.x - C.x, tip.y - C.y) > R - 1.5;
  const length = Math.hypot(v[0], v[1], v[2]);
  // Where the bob is drawn: out past the body, on the face (pointing at you),
  // hidden behind (a dashed ring, the drawing convention), or not at all.
  const bob: "back" | "front" | "hidden" | "none" =
    length < 0.04 ? "none" : outside ? "back" : tip.depth > 0.05 ? "front" : tip.depth < -0.05 ? "hidden" : "back";
  const runs = trail && trail.length > 1 ? trailRuns(trail) : [];
  const happy = mood === "happy";
  const closed = happy || mood === "sleepy";

  const bobShape = (dashed = false) => (
    <circle
      cx={tip.x}
      cy={tip.y}
      r="3.6"
      fill={dashed ? "none" : "#ffdc62"}
      stroke={dashed ? "#ffdc62" : "#b8860b"}
      strokeWidth={dashed ? 1.4 : 1}
      strokeDasharray={dashed ? "2 1.6" : undefined}
      opacity={dashed ? 0.85 : 1}
    />
  );

  return (
    <svg
      className={`${s.ket}${className ? ` ${className}` : ""}`}
      data-mood={mood}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <radialGradient id="ket-body" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#d9c9ff" />
          <stop offset="0.55" stopColor="#9d7fff" />
          <stop offset="1" stopColor="#5b3fd1" />
        </radialGradient>
      </defs>

      {/* Behind the body: the far half of the equator, the trail and the
          antenna. The body hides whatever of them lies inside it. */}
      <path d="M6 46 A26 6 0 0 1 58 46" fill="none" stroke="#7cc4ff" strokeWidth="2.2" opacity="0.55" />
      {runs.filter((r) => !r.front).map((r, i) => (
        <polyline key={`b${i}`} points={r.pts.join(" ")} className={s.trail} />
      ))}
      {bob !== "none" && (
        <line x1={C.x} y1={C.y} x2={tip.x} y2={tip.y} stroke="#f4c430" strokeWidth="3" strokeLinecap="round" />
      )}
      {bob === "back" && bobShape()}

      {/* The sphere, lit from the upper left so it reads as round. */}
      <circle cx={C.x} cy={C.y} r={R} fill="url(#ket-body)" />
      <ellipse cx="24" cy="26" rx="6" ry="3.6" fill="#fff" opacity="0.35" transform="rotate(-25 24 26)" />

      {/* The face. */}
      <g>
        {closed ? (
          <>
            <path d={happy ? "M21 34 q4 -5 8 0" : "M21 33 q4 3.5 8 0"} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
            <path d={happy ? "M35 34 q4 -5 8 0" : "M35 33 q4 3.5 8 0"} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          </>
        ) : (
          <>
            <ellipse cx="25" cy="33" rx="4.2" ry={mood === "curious" ? 5.2 : 4.6} fill="#fff" />
            <ellipse cx="39" cy="33" rx="4.2" ry={mood === "curious" ? 5.2 : 4.6} fill="#fff" />
            {/* Thinking looks up and to the side. */}
            <circle cx={mood === "thinking" ? 26.6 : 25.4} cy={mood === "thinking" ? 31.4 : 33.6} r="2.3" fill={INK} />
            <circle cx={mood === "thinking" ? 40.6 : 39.4} cy={mood === "thinking" ? 31.4 : 33.6} r="2.3" fill={INK} />
          </>
        )}
        <ellipse cx="19.5" cy="41" rx="3" ry="1.8" fill="#ff8fb1" opacity={mood === "cozy" ? 0.9 : 0.6} />
        <ellipse cx="44.5" cy="41" rx="3" ry="1.8" fill="#ff8fb1" opacity={mood === "cozy" ? 0.9 : 0.6} />
        {happy && <path d="M26 42 q6 7 12 0 z" fill={INK} />}
        {(mood === "calm" || mood === "cozy") && <path d="M27.5 42.5 q4.5 3.6 9 0" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />}
        {mood === "curious" && <ellipse cx="32" cy="44" rx="2.4" ry="2.8" fill={INK} />}
        {mood === "thinking" && <path d="M28 44 h8" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />}
        {mood === "sleepy" && <ellipse cx="32" cy="43.5" rx="1.8" ry="1.5" fill={INK} />}
      </g>

      {mood === "sleepy" && (
        <text x="50" y="16" className={s.zzz}>
          z<tspan dx="1" dy="-4" fontSize="6">z</tspan>
        </text>
      )}

      {/* The near half of the equator; a scarf covers it when Ket is cozy. */}
      {mood === "cozy" ? (
        <g>
          <path d="M11.5 47 Q32 55 52.5 47 L53.5 52 Q32 60.5 10.5 52 Z" fill="#ff6b93" />
          <path d="M18 49.6 L17 54.5 M25 51.3 L24.4 56.4 M32 51.8 V57 M39 51.3 L39.6 56.4 M46 49.6 L47 54.5" stroke="#ffd1de" strokeWidth="1.6" />
          <path d="M40 53 l3 9 l5 -1.5 l-2.5 -8.5 z" fill="#ff6b93" />
        </g>
      ) : (
        <path d="M6 46 A26 6 0 0 0 58 46" fill="none" stroke="#7cc4ff" strokeWidth="2.4" strokeLinecap="round" />
      )}

      {/* In front: the trail where it passes before the body, and a bob
          that points at you or hides behind. */}
      {runs.filter((r) => r.front).map((r, i) => (
        <polyline key={`f${i}`} points={r.pts.join(" ")} className={s.trail} />
      ))}
      {bob === "front" && bobShape()}
      {bob === "hidden" && bobShape(true)}
    </svg>
  );
}
