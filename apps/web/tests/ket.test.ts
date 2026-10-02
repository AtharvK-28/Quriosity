/**
 * Ket's physics. The antenna is a Bloch vector, so every rotation here must
 * agree with the simulator, and the path a gate draws must end where the gate
 * does. A mascot that shows the wrong state is a physics bug, not an art bug.
 */

import { describe, expect, it } from "vitest";
import { along, applyGate, KET_GATES, measure, nameOf, pZero, toScreen, ZERO, type KetGate, type Vec3 } from "@/lib/ket/bloch";
import { qubitState } from "@/lib/sim/analysis";
import { simulate } from "@/lib/sim/statevector";
import { emptyCircuit } from "@/lib/ir/types";

function simulated(gates: KetGate[]): Vec3 {
  const c = emptyCircuit(1);
  c.gates = gates.map((type, i) => ({ id: `g${i}`, type, targets: [0], controls: [], params: [], column: i }));
  const r = simulate(c);
  const s = qubitState(r.branches, 1, 0);
  return [s.x, s.y, s.z];
}

function ket(gates: KetGate[]): Vec3 {
  return gates.reduce<Vec3>((v, g) => applyGate(v, g), ZERO);
}

const close = (a: Vec3, b: Vec3) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 9));

describe("Ket's rotations agree with the simulator", () => {
  const all = Object.keys(KET_GATES) as KetGate[];

  it("for every gate on |0⟩, and after H", () => {
    for (const g of all) {
      close(ket([g]), simulated([g]));
      close(ket(["h", g]), simulated(["h", g]));
    }
  });

  it("for a hundred random sequences", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 100; n++) {
      const seq = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => all[Math.floor(rand() * all.length)]);
      close(ket(seq), simulated(seq));
    }
  });

  it("H twice is back to |0⟩: the interference the onboarding ends on", () => {
    close(ket(["h", "h"]), ZERO);
    expect(nameOf(ket(["h"]))).toBe("|+⟩");
    expect(nameOf(ket(["x"]))).toBe("|1⟩");
    expect(nameOf(ket(["h", "z"]))).toBe("|−⟩");
    expect(nameOf(ket(["h", "s"]))).toBe("|+i⟩");
  });
});

describe("the path a gate draws", () => {
  it("starts where the state was and ends where the gate leaves it", () => {
    for (const g of Object.keys(KET_GATES) as KetGate[]) {
      const from = ket(["h", "t"]);
      close(along(from, g, 0), from);
      close(along(from, g, 1), applyGate(from, g));
    }
  });

  it("stays on the sphere the whole way", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const v = along(ZERO, "h", t);
      expect(Math.hypot(...v)).toBeCloseTo(1, 12);
    }
  });

  it("sends X from |0⟩ through the side facing you, not round the edge", () => {
    // Rotating +z about +x passes through −y, which faces the viewer.
    expect(toScreen(along(ZERO, "x", 0.5)).depth).toBeCloseTo(1, 9);
  });
});

describe("a look", () => {
  it("follows the Born rule and collapses", () => {
    const plus = ket(["h"]);
    expect(pZero(plus)).toBeCloseTo(0.5, 12);
    expect(measure(plus, 0.49)).toEqual({ bit: 0, after: [0, 0, 1] });
    expect(measure(plus, 0.51)).toEqual({ bit: 1, after: [0, 0, -1] });
    expect(measure(ZERO, 0.999).bit).toBe(0);
    expect(measure([0, 0, -1], 0).bit).toBe(1);
  });
});
