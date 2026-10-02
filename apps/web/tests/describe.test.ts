/**
 * Writing a state as a ket and naming it — used where the platform works a
 * state out for someone (the author page). Every case here is a circuit run
 * through the real simulator, so a wrong ket is a wrong claim about physics.
 */

import { describe, expect, it } from "vitest";
import { describeState } from "@/lib/sim/describe";
import { simulate } from "@/lib/sim/statevector";
import { emptyCircuit, type Circuit, type GateType } from "@/lib/ir/types";

type G = { type: GateType; targets: number[]; controls?: number[]; params?: number[] };

function state(qubits: number, gates: G[]) {
  const c: Circuit = emptyCircuit(qubits);
  c.gates = gates.map((g, i) => ({ id: `g${i}`, controls: [], params: [], column: i, ...g }));
  const r = simulate(c);
  return describeState(r.statevector!, qubits);
}

describe("describeState", () => {
  it("writes and names the four Bell pairs, q0 on the right", () => {
    expect(state(2, [{ type: "h", targets: [0] }, { type: "cx", controls: [0], targets: [1] }]))
      .toEqual({ ket: "(|00⟩ + |11⟩) / √2", name: "Bell pair |Φ⁺⟩" });
    expect(state(2, [{ type: "x", targets: [0] }, { type: "h", targets: [0] }, { type: "cx", controls: [0], targets: [1] }]))
      .toEqual({ ket: "(|00⟩ − |11⟩) / √2", name: "Bell pair |Φ⁻⟩" });
    expect(state(2, [{ type: "h", targets: [0] }, { type: "cx", controls: [0], targets: [1] }, { type: "x", targets: [0] }]))
      .toEqual({ ket: "(|01⟩ + |10⟩) / √2", name: "Bell pair |Ψ⁺⟩" });
    expect(state(2, [{ type: "x", targets: [0] }, { type: "h", targets: [0] }, { type: "cx", controls: [0], targets: [1] }, { type: "x", targets: [0] }]).name)
      .toBe("Bell pair |Ψ⁻⟩");
  });

  it("drops global phase: −|Φ⁺⟩ is still |Φ⁺⟩", () => {
    const d = state(2, [
      { type: "h", targets: [0] }, { type: "cx", controls: [0], targets: [1] },
      // XZXZ = −I on one wire: a global −1. (XZX alone is −Z, a relative phase, giving |Φ⁻⟩.)
      { type: "x", targets: [0] }, { type: "z", targets: [0] }, { type: "x", targets: [0] }, { type: "z", targets: [0] },
    ]);
    expect(d).toEqual({ ket: "(|00⟩ + |11⟩) / √2", name: "Bell pair |Φ⁺⟩" });
  });

  it("names the one-qubit equator states and a GHZ", () => {
    expect(state(1, [{ type: "h", targets: [0] }])).toEqual({ ket: "(|0⟩ + |1⟩) / √2", name: "|+⟩" });
    expect(state(1, [{ type: "x", targets: [0] }, { type: "h", targets: [0] }])).toEqual({ ket: "(|0⟩ − |1⟩) / √2", name: "|−⟩" });
    expect(state(1, [{ type: "h", targets: [0] }, { type: "s", targets: [0] }])).toEqual({ ket: "(|0⟩ + i|1⟩) / √2", name: "|+i⟩" });
    expect(state(3, [
      { type: "h", targets: [0] }, { type: "cx", controls: [0], targets: [1] }, { type: "cx", controls: [1], targets: [2] },
    ])).toEqual({ ket: "(|000⟩ + |111⟩) / √2", name: "GHZ state, 3 wires" });
  });

  it("puts q0 on the right of a basis state", () => {
    expect(state(2, [{ type: "x", targets: [0] }])).toEqual({ ket: "|01⟩", name: "basis state |01⟩" });
    expect(state(1, [{ type: "x", targets: [0] }])).toEqual({ ket: "|1⟩", name: null });
  });

  it("simplifies the factor and writes other phases as e^(iφ)", () => {
    expect(state(2, [{ type: "h", targets: [0] }, { type: "h", targets: [1] }]))
      .toEqual({ ket: "(|00⟩ + |01⟩ + |10⟩ + |11⟩) / 2", name: "even superposition (|+⟩ on every wire)" });
    expect(state(1, [{ type: "h", targets: [0] }, { type: "t", targets: [0] }]).ket).toBe("(|0⟩ + e^(iπ/4)|1⟩) / √2");
    expect(state(3, [{ type: "h", targets: [0] }, { type: "h", targets: [1] }, { type: "h", targets: [2] }]).ket)
      .toBe("(|000⟩ + |001⟩ + |010⟩ + |011⟩ + |100⟩ + |101⟩ + |110⟩ + |111⟩) / (2√2)");
  });

  it("writes uneven amplitudes as decimals and leaves them unnamed", () => {
    expect(state(1, [{ type: "ry", targets: [0], params: [Math.PI / 3] }]))
      .toEqual({ ket: "0.866|0⟩ + 0.500|1⟩", name: null });
  });
});
