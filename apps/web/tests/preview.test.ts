/**
 * The angle readout on the parameter popover.
 *
 * The popover used to compute P(|1⟩) as sin²(θ/2), which is the closed form for
 * RY acting on |0⟩ and on nothing else. u1.n5 opens both H and RY, so a learner
 * can put an H in front of the rotation and read a number that is simply wrong.
 *
 * These are the cases that closed form gets wrong, checked against the real
 * simulator — which is what the popover now uses.
 */

import { describe, expect, it } from "vitest";
import { emptyCircuit, nextGateId, type Circuit, type Gate, type GateType } from "@/lib/ir/types";
import { simulate } from "@/lib/sim/statevector";
import { wireProbabilityOne } from "@/lib/sim/analysis";

function circuit(qubits: number, gates: Array<Partial<Gate> & { type: GateType }>): Circuit {
  const c = emptyCircuit(qubits);
  c.gates = gates.map((g, i) => ({
    id: nextGateId(),
    type: g.type,
    targets: g.targets ?? [0],
    controls: g.controls ?? [],
    params: g.params ?? [],
    column: g.column ?? i,
    ...(g.type === "measure" ? { clbit: g.targets?.[0] ?? 0 } : {}),
  }));
  return c;
}

/** What the popover used to print. */
const closedForm = (theta: number) => Math.sin(theta / 2) ** 2;

function actual(c: Circuit, wire = 0): number {
  return wireProbabilityOne(simulate(c).branches, c.qubits, wire);
}

describe("the angle readout", () => {
  it("agrees with the closed form for RY on |0⟩, which is the case it was written for", () => {
    for (const theta of [0, Math.PI / 6, Math.PI / 3, Math.PI / 2, Math.PI, 2.498]) {
      const c = circuit(1, [{ type: "ry", params: [theta] }]);
      expect(actual(c)).toBeCloseTo(closedForm(theta), 10);
    }
  });

  it("disagrees with it once an H sits in front — the case that made this necessary", () => {
    // RY(θ) on |+⟩ reads |1⟩ with probability (1 + sin θ)/2, not sin²(θ/2).
    const theta = Math.PI / 2;
    const c = circuit(1, [{ type: "h" }, { type: "ry", params: [theta], column: 1 }]);

    expect(actual(c)).toBeCloseTo(1, 10);
    expect(closedForm(theta)).toBeCloseTo(0.5, 10);

    for (const t of [Math.PI / 6, Math.PI / 3, Math.PI / 2]) {
      const k = circuit(1, [{ type: "h" }, { type: "ry", params: [t], column: 1 }]);
      expect(actual(k)).toBeCloseTo((1 + Math.sin(t)) / 2, 10);
    }
  });

  it("disagrees when the rotation acts on |1⟩ rather than |0⟩", () => {
    // RY(θ) on |1⟩ reads |1⟩ with probability cos²(θ/2).
    const theta = Math.PI / 3;
    const c = circuit(1, [{ type: "x" }, { type: "ry", params: [theta], column: 1 }]);
    expect(actual(c)).toBeCloseTo(Math.cos(theta / 2) ** 2, 10);
    expect(actual(c)).not.toBeCloseTo(closedForm(theta), 3);
  });

  it("reads the marginal on the right wire in a two-qubit circuit", () => {
    const theta = Math.PI / 3;
    const c = circuit(2, [{ type: "ry", targets: [1], params: [theta] }]);
    expect(actual(c, 1)).toBeCloseTo(closedForm(theta), 10);
    expect(actual(c, 0)).toBeCloseTo(0, 10);
  });

  it("reports the marginal for an entangled wire rather than failing", () => {
    // Neither qubit of a Bell pair has a state of its own, but each still has
    // an honest probability of reading 1.
    const c = circuit(2, [{ type: "h" }, { type: "cx", controls: [0], targets: [1], column: 1 }]);
    expect(actual(c, 0)).toBeCloseTo(0.5, 10);
    expect(actual(c, 1)).toBeCloseTo(0.5, 10);
  });

  it("survives a mid-circuit measurement, where the state is an ensemble", () => {
    const c = circuit(1, [{ type: "h" }, { type: "measure", column: 1 }]);
    expect(actual(c)).toBeCloseTo(0.5, 10);
  });
});
