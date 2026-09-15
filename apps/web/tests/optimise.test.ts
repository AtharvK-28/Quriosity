/**
 * Shorter equivalents — PRD E7-S6.
 *
 * Two promises, both asserted: a suggestion is genuinely shorter, and it is
 * genuinely equivalent. The second is checked here more strictly than the
 * optimiser checks itself — against random input states, not only |0…0⟩ —
 * because a rewrite that only happens to agree on |0⟩ is not an identity.
 */

import { describe, expect, it } from "vitest";
import { emptyCircuit, gateCount, nextGateId, type Circuit, type Gate, type GateType } from "@/lib/ir/types";
import { validate } from "@/lib/ir/validate";
import { simulate } from "@/lib/sim/statevector";
import { optimise, optimisationFinding } from "@/lib/tutor/optimise";
import { CHALLENGES } from "@/lib/curriculum/challenges";
import { NODES } from "@/lib/curriculum/nodes";

function circuit(qubits: number, gates: Array<Partial<Gate> & { type: GateType }>): Circuit {
  const c = emptyCircuit(qubits);
  c.gates = gates.map((g, i) => ({
    id: nextGateId(),
    type: g.type,
    targets: g.targets ?? [0],
    controls: g.controls ?? [],
    params: g.params ?? [],
    column: g.column ?? i,
  }));
  return c;
}

/** Deterministic pseudo-random angles, so a failure reproduces. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 2 ** 32;
}

/**
 * Prepends a random product state and compares final states up to global
 * phase. Run over several seeds this distinguishes unitaries, not just their
 * action on |0⟩.
 */
function expectEquivalent(a: Circuit, b: Circuit) {
  for (let seed = 1; seed <= 6; seed++) {
    const r = rng(seed * 7919);
    const prep: Gate[] = [];
    for (let q = 0; q < a.qubits; q++) {
      prep.push({ id: nextGateId(), type: "ry", targets: [q], controls: [], params: [r() * 6], column: 0 });
      prep.push({ id: nextGateId(), type: "rz", targets: [q], controls: [], params: [r() * 6], column: 1 });
    }
    const shift = (c: Circuit): Circuit => ({
      ...c,
      gates: [...prep, ...c.gates.map((g) => ({ ...g, column: g.column + 2 }))],
    });
    const sa = simulate(shift(a)).statevector!;
    const sb = simulate(shift(b)).statevector!;
    let re = 0;
    let im = 0;
    for (let k = 0; k < sa.length / 2; k++) {
      re += sa[2 * k] * sb[2 * k] + sa[2 * k + 1] * sb[2 * k + 1];
      im += sa[2 * k] * sb[2 * k + 1] - sa[2 * k + 1] * sb[2 * k];
    }
    expect(re * re + im * im, `seed ${seed}`).toBeGreaterThan(1 - 1e-9);
  }
}

const CASES: Array<[string, Circuit, number]> = [
  ["H·H cancels", circuit(1, [{ type: "h" }, { type: "h" }, { type: "x" }]), 1],
  ["X·X cancels across a gap", circuit(2, [{ type: "x", column: 0 }, { type: "h", targets: [1], column: 1 }, { type: "x", column: 4 }]), 1],
  ["S·S† cancels", circuit(1, [{ type: "h" }, { type: "s" }, { type: "sdg" }]), 1],
  ["T·T is S", circuit(1, [{ type: "h" }, { type: "t" }, { type: "t" }]), 2],
  ["S·S·S is S†", circuit(1, [{ type: "h" }, { type: "s" }, { type: "s" }, { type: "s" }]), 2],
  ["Z·S·T merges to one P", circuit(1, [{ type: "h" }, { type: "z" }, { type: "s" }, { type: "t" }]), 2],
  ["RZ + RZ is one RZ", circuit(1, [{ type: "h" }, { type: "rz", params: [0.3] }, { type: "rz", params: [0.4] }]), 2],
  ["RX by a full turn goes", circuit(1, [{ type: "rx", params: [2 * Math.PI] }, { type: "h" }]), 1],
  ["RY + RY adds up", circuit(1, [{ type: "ry", params: [0.2] }, { type: "ry", params: [0.5] }]), 1],
  ["RY + RY to a full turn vanishes", circuit(1, [{ type: "ry", params: [Math.PI] }, { type: "ry", params: [Math.PI] }, { type: "h" }]), 1],
  ["identity goes", circuit(1, [{ type: "h" }, { type: "i" }]), 1],
  ["H·X·H is Z", circuit(1, [{ type: "x" }, { type: "h" }, { type: "x" }, { type: "h" }]), 2],
  ["H·Z·H is X", circuit(1, [{ type: "h" }, { type: "z" }, { type: "h" }]), 1],
  ["CX·CX cancels", circuit(2, [{ type: "h" }, { type: "cx", controls: [0], targets: [1] }, { type: "cx", controls: [0], targets: [1] }]), 1],
  ["CZ cancels with its mirror", circuit(2, [{ type: "h" }, { type: "cz", controls: [0], targets: [1] }, { type: "cz", controls: [1], targets: [0] }]), 1],
  ["SWAP cancels either way round", circuit(2, [{ type: "x" }, { type: "swap", targets: [0, 1] }, { type: "swap", targets: [1, 0] }]), 1],
  ["CCX·CCX cancels", circuit(3, [{ type: "h" }, { type: "ccx", controls: [0, 1], targets: [2] }, { type: "ccx", controls: [1, 0], targets: [2] }]), 1],
  ["rewrites chain", circuit(1, [{ type: "h" }, { type: "t" }, { type: "tdg" }, { type: "h" }, { type: "x" }]), 1],
];

describe("the optimiser finds shorter equivalents", () => {
  for (const [name, c, after] of CASES) {
    it(name, () => {
      const o = optimise(c);
      expect(o, "no suggestion was made").not.toBeNull();
      expect(o!.before).toBe(gateCount(c));
      expect(o!.after).toBe(after);
      expect(validate(o!.circuit).valid).toBe(true);
      expectEquivalent(c, o!.circuit);
    });
  }
});

describe("the optimiser leaves alone what it must", () => {
  const untouched: Array<[string, Circuit]> = [
    ["a Bell pair", circuit(2, [{ type: "h" }, { type: "cx", controls: [0], targets: [1] }])],
    ["CX with its direction reversed", circuit(2, [{ type: "h" }, { type: "cx", controls: [0], targets: [1] }, { type: "cx", controls: [1], targets: [0] }])],
    ["H·H with a measurement between", (() => {
      const c = circuit(1, [{ type: "h" }, { type: "measure" }, { type: "h" }]);
      c.gates[1].clbit = 0;
      return c;
    })()],
    ["H·H with a barrier between", circuit(1, [{ type: "h" }, { type: "barrier" }, { type: "h" }])],
    ["H·H with a CX on the wire between", circuit(2, [{ type: "h" }, { type: "cx", controls: [0], targets: [1] }, { type: "h" }])],
    ["a controlled rotation by 2π (a relative phase, not an identity)", circuit(2, [{ type: "h" }, { type: "crz", controls: [0], targets: [1], params: [2 * Math.PI] }])],
  ];

  for (const [name, c] of untouched) {
    it(name, () => {
      expect(optimise(c)).toBeNull();
    });
  }

  it("never beats a golf par or a reach answer, which would mean the par is wrong", () => {
    for (const ch of CHALLENGES) {
      const c = circuit(ch.qubits, ch.reference.map((g) => ({ ...g })));
      const o = optimise(c);
      if (ch.kind !== "bughunt") {
        expect(o, ch.id).toBeNull();
      } else if (o) {
        // A bug hunt's par counts repairing the handed-over circuit, not
        // starting over, so a shorter route can exist. It must still be real.
        expectEquivalent(c, o.circuit);
      }
    }
  });

  it("suggests nothing on any node's starter circuit that is already minimal", () => {
    for (const n of NODES) {
      if (!n.starter) continue;
      const c = circuit(n.qubits, n.starter.map((g) => ({ ...g })));
      const o = optimise(c);
      if (o) expectEquivalent(c, o.circuit);
    }
  });
});

describe("the advisory finding — E7-S6 wording", () => {
  it("names the saving and offers the shorter circuit", () => {
    const c = circuit(2, [
      { type: "h" }, { type: "h" }, { type: "h" },
      { type: "cx", controls: [0], targets: [1] },
    ]);
    const f = optimisationFinding(c)!;
    expect(f.severity).toBe("advisory");
    expect(f.message).toMatch(/works in 4 gates; the same state takes 2/);
    expect(f.message).toMatch(/Saving: 2 gates/);
    expect(f.gateIds).toHaveLength(2);
    expect(f.fix?.kind).toBe("replace_circuit");
    if (f.fix?.kind === "replace_circuit") expect(gateCount(f.fix.circuit)).toBe(2);
  });
});
