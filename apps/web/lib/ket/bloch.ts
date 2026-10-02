/**
 * One qubit as a Bloch vector, for Ket.
 *
 * A single-qubit gate is a rotation of the Bloch sphere: U = exp(-iθ n·σ/2)
 * turns the vector by θ about the axis n. The path the vector takes while
 * the gate acts is that rotation run from 0 to θ, so when Ket's antenna
 * sweeps from |0⟩ to |+⟩ it follows the route the state really takes, not a
 * straight line drawn between the ends. tests/ket.test.ts checks every gate
 * here against the simulator.
 *
 * Convention, as everywhere in this project: x = ⟨X⟩, y = ⟨Y⟩, z = ⟨Z⟩, and
 * |0⟩ is +z.
 */

export type Vec3 = readonly [number, number, number];

export const ZERO: Vec3 = [0, 0, 1];

/** The gates Ket can take, with the rotation each one is. */
export const KET_GATES = {
  x: { axis: [1, 0, 0] as Vec3, angle: Math.PI },
  y: { axis: [0, 1, 0] as Vec3, angle: Math.PI },
  z: { axis: [0, 0, 1] as Vec3, angle: Math.PI },
  h: { axis: [Math.SQRT1_2, 0, Math.SQRT1_2] as Vec3, angle: Math.PI },
  s: { axis: [0, 0, 1] as Vec3, angle: Math.PI / 2 },
  sdg: { axis: [0, 0, 1] as Vec3, angle: -Math.PI / 2 },
  t: { axis: [0, 0, 1] as Vec3, angle: Math.PI / 4 },
  tdg: { axis: [0, 0, 1] as Vec3, angle: -Math.PI / 4 },
} as const;

export type KetGate = keyof typeof KET_GATES;

/** Rodrigues: v turned by `angle` about the unit axis n. */
export function rotate(v: Vec3, n: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dot = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
  const cross: Vec3 = [n[1] * v[2] - n[2] * v[1], n[2] * v[0] - n[0] * v[2], n[0] * v[1] - n[1] * v[0]];
  return [
    v[0] * c + cross[0] * s + n[0] * dot * (1 - c),
    v[1] * c + cross[1] * s + n[1] * dot * (1 - c),
    v[2] * c + cross[2] * s + n[2] * dot * (1 - c),
  ];
}

export function applyGate(v: Vec3, gate: KetGate): Vec3 {
  const { axis, angle } = KET_GATES[gate];
  return rotate(v, axis, angle);
}

/** The vector part-way through a gate, t from 0 to 1. */
export function along(v: Vec3, gate: KetGate, t: number): Vec3 {
  const { axis, angle } = KET_GATES[gate];
  return rotate(v, axis, angle * t);
}

/** P(reading 0) for a pure state: (1 + z) / 2. */
export function pZero(v: Vec3): number {
  return Math.min(1, Math.max(0, (1 + v[2]) / 2));
}

/**
 * One look. The state collapses to |0⟩ or |1⟩ with the Born-rule odds;
 * `r` is a uniform draw in [0, 1), passed in so tests can fix it.
 */
export function measure(v: Vec3, r: number): { bit: 0 | 1; after: Vec3 } {
  return r < pZero(v) ? { bit: 0, after: [0, 0, 1] } : { bit: 1, after: [0, 0, -1] };
}

/** A state near a named one gets its name; anything else is described by its odds. */
export function nameOf(v: Vec3, eps = 1e-3): string | null {
  const named: Array<[string, Vec3]> = [
    ["|0⟩", [0, 0, 1]], ["|1⟩", [0, 0, -1]],
    ["|+⟩", [1, 0, 0]], ["|−⟩", [-1, 0, 0]],
    ["|+i⟩", [0, 1, 0]], ["|−i⟩", [0, -1, 0]],
  ];
  for (const [name, t] of named) {
    if (Math.abs(v[0] - t[0]) < eps && Math.abs(v[1] - t[1]) < eps && Math.abs(v[2] - t[2]) < eps) return name;
  }
  return null;
}

/**
 * Ket faces you: z is up and x is to its right, which puts you on the −y
 * side of the sphere (x × z = −y). Screen coordinates are y-down; `depth` is
 * how far the vector points toward you.
 */
export function toScreen(v: Vec3): { sx: number; sy: number; depth: number } {
  return { sx: v[0], sy: -v[2], depth: -v[1] };
}
