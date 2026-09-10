/**
 * The golden physics suite — TRD §14.
 *
 * Ten circuits with hand-verified state vectors, asserted to 1e-9. This is a
 * BLOCKING gate: if it fails, the product is showing wrong physics, and wrong
 * physics on stage is the one failure the demo cannot survive.
 */

import { describe, expect, it } from "vitest";
import { emptyCircuit, nextGateId, type Circuit, type Gate, type GateType } from "@/lib/ir/types";
import { simulate, bitstring, normaliseGlobalPhase } from "@/lib/sim/statevector";
import { qubitState, separability, allQubitStates, pairPurity } from "@/lib/sim/analysis";
import { grade, TARGETS, stateTarget, distributionTarget } from "@/lib/grade/fidelity";
import { validate } from "@/lib/ir/validate";

const R2 = Math.SQRT1_2;
const TOL = 1e-9;

/* -- Test helpers ------------------------------------------------------------ */

function circuit(qubits: number, gates: Array<Partial<Gate> & { type: GateType }>): Circuit {
  const c = emptyCircuit(qubits);
  c.gates = gates.map((g, i) => ({
    id: nextGateId(),
    type: g.type,
    targets: g.targets ?? [0],
    controls: g.controls ?? [],
    params: g.params ?? [],
    column: g.column ?? i,
    ...(g.clbit !== undefined ? { clbit: g.clbit } : {}),
  }));
  return c;
}

/** Amplitude at basis index k as [re, im]. */
function amp(sv: Float64Array, k: number): [number, number] {
  return [sv[2 * k], sv[2 * k + 1]];
}

function expectAmp(sv: Float64Array, k: number, re: number, im: number, tol = TOL) {
  const [ar, ai] = amp(sv, k);
  expect(Math.abs(ar - re), `Re(amp[${k}]) = ${ar}, expected ${re}`).toBeLessThan(tol);
  expect(Math.abs(ai - im), `Im(amp[${k}]) = ${ai}, expected ${im}`).toBeLessThan(tol);
}

function probs(c: Circuit): number[] {
  return Array.from(simulate(c).probabilities);
}

/* -- 1. |0…0⟩ ---------------------------------------------------------------- */

describe("golden 01 — the empty circuit", () => {
  it("is a valid circuit that produces |00⟩ with certainty", () => {
    const c = circuit(2, []);
    expect(validate(c).valid).toBe(true);
    const r = simulate(c);
    expectAmp(r.statevector!, 0, 1, 0);
    expect(r.probabilities[0]).toBeCloseTo(1, 12);
    // PRD §9: this is correct and is a teaching moment, not an error.
    expect(r.mixed).toBe(false);
  });
});

/* -- 2. H|0⟩ ----------------------------------------------------------------- */

describe("golden 02 — H|0⟩", () => {
  it("is (|0⟩ + |1⟩)/√2", () => {
    const r = simulate(circuit(1, [{ type: "h", targets: [0] }]));
    expectAmp(r.statevector!, 0, R2, 0);
    expectAmp(r.statevector!, 1, R2, 0);
  });

  it("puts the Bloch vector on +X, on the surface", () => {
    const r = simulate(circuit(1, [{ type: "h", targets: [0] }]));
    const s = qubitState(r.branches, 1, 0);
    expect(s.x).toBeCloseTo(1, 9);
    expect(s.y).toBeCloseTo(0, 9);
    expect(s.z).toBeCloseTo(0, 9);
    expect(s.purity).toBeCloseTo(1, 9);
    expect(s.entangled).toBe(false);
  });

  it("H twice returns |0⟩ with certainty — misconception M1's demonstration", () => {
    const r = simulate(circuit(1, [
      { type: "h", targets: [0], column: 0 },
      { type: "h", targets: [0], column: 1 },
    ]));
    expectAmp(r.statevector!, 0, 1, 0);
    expectAmp(r.statevector!, 1, 0, 0);
  });
});

/* -- 3. Bell |Φ⁺⟩ ------------------------------------------------------------ */

describe("golden 03 — Bell state", () => {
  const bell = () => circuit(2, [
    { type: "h", targets: [0], column: 0 },
    { type: "cx", targets: [1], controls: [0], column: 1 },
  ]);

  it("is (|00⟩ + |11⟩)/√2", () => {
    const r = simulate(bell());
    expectAmp(r.statevector!, 0, R2, 0);
    expectAmp(r.statevector!, 1, 0, 0);
    expectAmp(r.statevector!, 2, 0, 0);
    expectAmp(r.statevector!, 3, R2, 0);
  });

  it("puts each qubit's reduced state at the centre of the sphere", () => {
    // Decision D5 and misconception M4. The naive per-qubit-amplitude version
    // of this is physically wrong, and this test is what keeps it out.
    const r = simulate(bell());
    for (const q of [0, 1]) {
      const s = qubitState(r.branches, 2, q);
      expect(s.purity).toBeCloseTo(0.5, 9);
      expect(Math.hypot(s.x, s.y, s.z)).toBeLessThan(TOL);
      expect(s.entangled).toBe(true);
      expect(s.entropy).toBeCloseTo(1, 9);
    }
  });

  it("fails the factorisation test — which is what entanglement means", () => {
    const sep = separability(simulate(bell()));
    expect(sep.separable).toBe(false);
    expect(sep.entangledQubits).toEqual([0, 1]);
    // Independent leans would predict 25% everywhere; the register says 50/0/0/50.
    expect(sep.maxDeviation).toBeCloseTo(0.25, 9);
  });

  it("is a jointly pure pair", () => {
    expect(pairPurity(simulate(bell()).branches, 2, 0, 1)).toBeCloseTo(1, 9);
  });
});

/* -- 4. GHZ-3 ---------------------------------------------------------------- */

describe("golden 04 — GHZ₃", () => {
  it("is (|000⟩ + |111⟩)/√2", () => {
    const r = simulate(circuit(3, [
      { type: "h", targets: [0], column: 0 },
      { type: "cx", targets: [1], controls: [0], column: 1 },
      { type: "cx", targets: [2], controls: [1], column: 2 },
    ]));
    expectAmp(r.statevector!, 0, R2, 0);
    expectAmp(r.statevector!, 7, R2, 0);
    for (const k of [1, 2, 3, 4, 5, 6]) expectAmp(r.statevector!, k, 0, 0);
  });
});

/* -- 5. W-3 ------------------------------------------------------------------ */

describe("golden 05 — W₃", () => {
  it("is (|001⟩ + |010⟩ + |100⟩)/√3", () => {
    // Standard construction: RY(2·acos(1/√3)) then two controlled rotations.
    const theta = 2 * Math.acos(1 / Math.sqrt(3));
    const c = circuit(3, [
      { type: "ry", targets: [0], params: [theta], column: 0 },
      { type: "cry", targets: [1], controls: [0], params: [Math.PI / 2], column: 1 },
      { type: "cx", targets: [2], controls: [1], column: 2 },
      { type: "cx", targets: [1], controls: [0], column: 3 },
      { type: "x", targets: [0], column: 4 },
    ]);
    const r = simulate(c);
    const third = 1 / Math.sqrt(3);
    // One excitation on each of the three wires, equally weighted.
    for (const k of [1, 2, 4]) {
      const [re, im] = amp(r.statevector!, k);
      expect(Math.hypot(re, im)).toBeCloseTo(third, 9);
    }
    for (const k of [0, 3, 5, 6, 7]) {
      const [re, im] = amp(r.statevector!, k);
      expect(Math.hypot(re, im)).toBeLessThan(1e-9);
    }
  });
});

/* -- 6. QFT-3 ---------------------------------------------------------------- */

describe("golden 06 — QFT₃ on |000⟩", () => {
  it("produces a uniform superposition with zero relative phase", () => {
    const c = circuit(3, [
      { type: "h", targets: [0], column: 0 },
      { type: "crz", targets: [0], controls: [1], params: [Math.PI / 2], column: 1 },
      { type: "crz", targets: [0], controls: [2], params: [Math.PI / 4], column: 2 },
      { type: "h", targets: [1], column: 3 },
      { type: "crz", targets: [1], controls: [2], params: [Math.PI / 2], column: 4 },
      { type: "h", targets: [2], column: 5 },
      { type: "swap", targets: [0, 2], column: 6 },
    ]);
    const r = simulate(c);
    // QFT of |000⟩ is the uniform superposition: every outcome at 1/8.
    for (let k = 0; k < 8; k++) {
      expect(r.probabilities[k]).toBeCloseTo(1 / 8, 9);
    }
  });
});

/* -- 7. Grover-2, one iteration ---------------------------------------------- */

describe("golden 07 — Grover on 2 qubits, marking |11⟩", () => {
  it("finds the marked item with certainty after exactly one iteration", () => {
    // N = 4, one solution: the optimal iteration count is 1, and at exactly one
    // iteration the success probability is 1. Misconception M11 is what happens
    // when you keep going past this.
    const c = circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "h", targets: [1], column: 0 },
      // Oracle: phase-flip |11⟩
      { type: "cz", targets: [1], controls: [0], column: 1 },
      // Diffuser
      { type: "h", targets: [0], column: 2 },
      { type: "h", targets: [1], column: 2 },
      { type: "x", targets: [0], column: 3 },
      { type: "x", targets: [1], column: 3 },
      { type: "cz", targets: [1], controls: [0], column: 4 },
      { type: "x", targets: [0], column: 5 },
      { type: "x", targets: [1], column: 5 },
      { type: "h", targets: [0], column: 6 },
      { type: "h", targets: [1], column: 6 },
    ]);
    const r = simulate(c);
    expect(r.probabilities[3]).toBeCloseTo(1, 9);
    for (const k of [0, 1, 2]) expect(r.probabilities[k]).toBeLessThan(1e-9);
  });
});

/* -- 8. Phase kickback -------------------------------------------------------- */

describe("golden 08 — phase kickback", () => {
  it("kicks the phase onto the CONTROL, which is the whole mechanism", () => {
    // Control |+⟩, target |1⟩, controlled-Z. The phase appears on the control.
    // Misconception M9: "a controlled gate does nothing to the control".
    const c = circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "x", targets: [1], column: 0 },
      { type: "cz", targets: [1], controls: [0], column: 1 },
    ]);
    const r = simulate(c);
    // (|0⟩ − |1⟩)/√2 ⊗ |1⟩ — index 2 is q1=1,q0=0 and index 3 is q1=1,q0=1.
    expectAmp(r.statevector!, 2, R2, 0);
    expectAmp(r.statevector!, 3, -R2, 0);

    // The control is now |−⟩: its Bloch vector points at −X, and it is still pure.
    const s = qubitState(r.branches, 2, 0);
    expect(s.x).toBeCloseTo(-1, 9);
    expect(s.purity).toBeCloseTo(1, 9);
  });
});

/* -- 9. T sequence ----------------------------------------------------------- */

describe("golden 09 — T·T = S", () => {
  it("accumulates phase exactly", () => {
    const withT = simulate(circuit(1, [
      { type: "h", targets: [0], column: 0 },
      { type: "t", targets: [0], column: 1 },
      { type: "t", targets: [0], column: 2 },
    ]));
    const withS = simulate(circuit(1, [
      { type: "h", targets: [0], column: 0 },
      { type: "s", targets: [0], column: 1 },
    ]));
    for (let i = 0; i < withT.statevector!.length; i++) {
      expect(Math.abs(withT.statevector![i] - withS.statevector![i])).toBeLessThan(TOL);
    }
  });

  it("T eight times is the identity up to global phase", () => {
    const gates: Array<Partial<Gate> & { type: GateType }> = [{ type: "h", targets: [0], column: 0 }];
    for (let i = 1; i <= 8; i++) gates.push({ type: "t", targets: [0], column: i });
    const r = simulate(circuit(1, gates));
    const g = grade(r, TARGETS.plus());
    expect(g.fidelity).toBeCloseTo(1, 9);
  });
});

/* -- 10. A deliberately mixed reduced state ---------------------------------- */

describe("golden 10 — mid-circuit measurement produces a genuinely mixed state", () => {
  it("collapses the superposition it observes — misconception M7", () => {
    // H, measure, then H again. If measurement were "just reading", the second
    // H would return the qubit to |0⟩. It does not: the outcome is 50/50.
    const c = circuit(1, [
      { type: "h", targets: [0], column: 0 },
      { type: "measure", targets: [0], clbit: 0, column: 1 },
      { type: "h", targets: [0], column: 2 },
    ]);
    const r = simulate(c);
    expect(r.mixed).toBe(true);
    expect(r.statevector).toBeNull();
    expect(r.probabilities[0]).toBeCloseTo(0.5, 9);
    expect(r.probabilities[1]).toBeCloseTo(0.5, 9);

    // Contrast: without the measurement, H·H is a certainty.
    const coherent = simulate(circuit(1, [
      { type: "h", targets: [0], column: 0 },
      { type: "h", targets: [0], column: 1 },
    ]));
    expect(coherent.probabilities[0]).toBeCloseTo(1, 9);
  });

  it("leaves the qubit maximally mixed after the measurement", () => {
    const r = simulate(circuit(1, [
      { type: "h", targets: [0], column: 0 },
      { type: "measure", targets: [0], clbit: 0, column: 1 },
      { type: "z", targets: [0], column: 2 },
    ]));
    const s = qubitState(r.branches, 1, 0);
    expect(s.purity).toBeCloseTo(0.5, 9);
    expect(s.radius).toBeLessThan(1e-9);
  });
});

/* -- Endianness -------------------------------------------------------------- */

describe("endianness — the platform convention is little-endian, matching Qiskit", () => {
  it("X on q0 alone gives the bitstring 01 on two wires", () => {
    // Basis index 1 has bit 0 set. Printed q1q0, that reads "01".
    // Misconception M10 lives here, and the axis label states the convention.
    const r = simulate(circuit(2, [{ type: "x", targets: [0] }]));
    expect(r.probabilities[1]).toBeCloseTo(1, 12);
    expect(bitstring(1, 2)).toBe("01");
  });

  it("X on q1 alone gives 10", () => {
    const r = simulate(circuit(2, [{ type: "x", targets: [1] }]));
    expect(r.probabilities[2]).toBeCloseTo(1, 12);
    expect(bitstring(2, 2)).toBe("10");
  });

  it("X on q0 and q2 of three wires gives 101", () => {
    const r = simulate(circuit(3, [
      { type: "x", targets: [0], column: 0 },
      { type: "x", targets: [2], column: 0 },
    ]));
    expect(r.probabilities[5]).toBeCloseTo(1, 12);
    expect(bitstring(5, 3)).toBe("101");
  });
});

/* -- Grading ----------------------------------------------------------------- */

describe("grading compares states, never structure", () => {
  it("passes two structurally different circuits that reach the same state", () => {
    // Route A: H then CNOT.
    const a = simulate(circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "cx", targets: [1], controls: [0], column: 1 },
    ]));
    // Route B: H on both, CZ between, H on the target. Same Bell state, four
    // gates instead of two, and a completely different structure.
    const b = simulate(circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "h", targets: [1], column: 0 },
      { type: "cz", targets: [1], controls: [0], column: 1 },
      { type: "h", targets: [1], column: 2 },
    ]));

    const target = TARGETS.bellPhiPlus();
    expect(grade(a, target).passed).toBe(true);
    expect(grade(b, target).passed).toBe(true);
    expect(grade(a, target).fidelity).toBeCloseTo(1, 9);
    expect(grade(b, target).fidelity).toBeCloseTo(1, 9);
  });

  it("passes a state that differs only by a global phase, and says so", () => {
    // Z·X·Z·X on |0⟩ is −|0⟩: physically identical, amplitudes negated.
    const r = simulate(circuit(1, [
      { type: "x", targets: [0], column: 0 },
      { type: "z", targets: [0], column: 1 },
      { type: "x", targets: [0], column: 2 },
      { type: "z", targets: [0], column: 3 },
    ]));
    const target = stateTarget(1, [[1, 0], [0, 0]]);
    const g = grade(r, target);
    expect(g.passed).toBe(true);
    expect(g.fidelity).toBeCloseTo(1, 9);
  });

  it("fails a state at 0.99 fidelity — the threshold is a real tolerance", () => {
    const r = simulate(circuit(1, [{ type: "ry", targets: [0], params: [0.2] }]));
    const g = grade(r, stateTarget(1, [[1, 0], [0, 0]]));
    expect(g.fidelity).toBeLessThan(0.999);
    expect(g.passed).toBe(false);
  });

  it("distinguishes |+⟩ from |−⟩ — relative phase is real", () => {
    const minus = simulate(circuit(1, [
      { type: "h", targets: [0], column: 0 },
      { type: "z", targets: [0], column: 1 },
    ]));
    expect(grade(minus, TARGETS.minus()).passed).toBe(true);
    expect(grade(minus, TARGETS.plus()).passed).toBe(false);

    // ...but both are 50/50 in the Z basis, which is exactly why M6 exists.
    expect(minus.probabilities[0]).toBeCloseTo(0.5, 9);
    expect(grade(minus, TARGETS.fairCoin()).passed).toBe(true);
  });

  it("grades a distribution target on outcomes alone", () => {
    const bell = simulate(circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "cx", targets: [1], controls: [0], column: 1 },
    ]));
    expect(grade(bell, TARGETS.bellDistribution()).passed).toBe(true);
    expect(grade(bell, TARGETS.flatTwo()).passed).toBe(false);
  });
});

/* -- Global phase normalisation ---------------------------------------------- */

describe("global phase normalisation", () => {
  it("makes the first significant amplitude real and positive", () => {
    const raw = new Float64Array([0, -R2, 0, R2]); // −i(|0⟩ − |1⟩)/√2
    const out = normaliseGlobalPhase(raw);
    expect(out[0]).toBeCloseTo(R2, 12);
    expect(out[1]).toBeCloseTo(0, 12);
    // The relative phase between the two amplitudes must survive untouched.
    expect(out[2]).toBeCloseTo(-R2, 12);
    expect(out[3]).toBeCloseTo(0, 12);
  });

  it("preserves every probability", () => {
    const raw = new Float64Array([0.5, 0.5, 0.5, -0.5]);
    const out = normaliseGlobalPhase(raw);
    for (const k of [0, 1]) {
      const before = raw[2 * k] ** 2 + raw[2 * k + 1] ** 2;
      const after = out[2 * k] ** 2 + out[2 * k + 1] ** 2;
      expect(after).toBeCloseTo(before, 12);
    }
  });
});

/* -- Normalisation invariant -------------------------------------------------- */

describe("the state stays normalised", () => {
  it("holds across a deep circuit with every gate class", () => {
    const c = circuit(3, [
      { type: "h", targets: [0], column: 0 },
      { type: "ry", targets: [1], params: [0.7], column: 0 },
      { type: "t", targets: [2], column: 0 },
      { type: "cx", targets: [1], controls: [0], column: 1 },
      { type: "crz", targets: [2], controls: [1], params: [1.1], column: 2 },
      { type: "swap", targets: [0, 2], column: 3 },
      { type: "ccx", targets: [2], controls: [0, 1], column: 4 },
      { type: "p", targets: [0], params: [0.3], column: 5 },
      { type: "sdg", targets: [1], column: 5 },
    ]);
    const r = simulate(c);
    const total = Array.from(r.probabilities).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 10);

    // And every intermediate step is normalised too, which the scrubber relies on.
    for (const step of r.steps) {
      const sum = step.branches.reduce((acc, b) => {
        let n = 0;
        for (let i = 0; i < b.amps.length; i += 2) n += b.amps[i] ** 2 + b.amps[i + 1] ** 2;
        return acc + b.weight * n;
      }, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });
});
