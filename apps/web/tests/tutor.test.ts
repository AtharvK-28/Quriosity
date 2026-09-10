/**
 * Rule-engine tests — TRD §14, "one fixture per rule, positive and negative".
 *
 * The demo's central claim is that a wrong circuit produces a gate-and-wire
 * specific diagnosis with the language model switched off. Everything asserted
 * here runs locally and deterministically, so that claim is testable rather
 * than hopeful.
 */

import { describe, expect, it } from "vitest";
import { emptyCircuit, nextGateId, type Circuit, type Gate, type GateType } from "@/lib/ir/types";
import { simulate } from "@/lib/sim/statevector";
import { grade, TARGETS, stateTarget } from "@/lib/grade/fidelity";
import { diagnose, primaryDiagnosis, type DiagnosisContext } from "@/lib/tutor/rules";

function circuit(qubits: number, gates: Array<Partial<Gate> & { type: GateType }>): Circuit {
  const c = emptyCircuit(qubits);
  c.gates = gates.map((g, i) => ({
    id: g.id ?? nextGateId(),
    type: g.type,
    targets: g.targets ?? [0],
    controls: g.controls ?? [],
    params: g.params ?? [],
    column: g.column ?? i,
    ...(g.clbit !== undefined ? { clbit: g.clbit } : {}),
  }));
  return c;
}

function ctx(c: Circuit, target?: ReturnType<typeof TARGETS.bellPhiPlus>): DiagnosisContext {
  const result = simulate(c);
  return { circuit: c, result, target, grade: target ? grade(result, target) : undefined };
}

function ruleIds(c: DiagnosisContext): string[] {
  return diagnose(c).map((f) => f.ruleId);
}

/* -- L01: the money shot ----------------------------------------------------- */

describe("L01 — no entangler (the demo)", () => {
  it("names the gate, both wires, and the corrective action", () => {
    // The demo circuit: attempt a Bell state, omit the CNOT.
    const c = circuit(2, [{ type: "h", targets: [0], column: 0 }]);
    const f = primaryDiagnosis(ctx(c, TARGETS.bellPhiPlus()))!;

    expect(f).not.toBeNull();
    expect(f.ruleId).toBe("L01_no_entangler");
    expect(f.misconception).toBe("M8");

    // This is the exact sentence the demo script promises the jury.
    expect(f.message).toContain("q0 is in superposition");
    expect(f.message).toContain("separable");
    expect(f.message).toContain("CNOT");
    expect(f.message).toContain("q0 as control");
    expect(f.message).toContain("q1 as target");

    // And it carries a machine-applicable fix, so "show me" can act.
    expect(f.fix).toEqual({
      kind: "add_gate",
      type: "cx",
      targets: [1],
      controls: [0],
      params: [],
      column: 1,
      label: "Add CNOT · q0 → q1",
    });
  });

  it("applying the suggested fix produces a passing circuit", () => {
    const c = circuit(2, [{ type: "h", targets: [0], column: 0 }]);
    const f = primaryDiagnosis(ctx(c, TARGETS.bellPhiPlus()))!;
    expect(f.fix?.kind).toBe("add_gate");

    if (f.fix?.kind === "add_gate") {
      c.gates.push({
        id: nextGateId(),
        type: f.fix.type,
        targets: f.fix.targets,
        controls: f.fix.controls,
        params: f.fix.params,
        column: f.fix.column,
      });
    }
    expect(grade(simulate(c), TARGETS.bellPhiPlus()).passed).toBe(true);
  });

  it("does not fire once a two-qubit gate is present", () => {
    const c = circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "cx", targets: [1], controls: [0], column: 1 },
    ]);
    expect(ruleIds(ctx(c, TARGETS.bellPhiPlus()))).not.toContain("L01_no_entangler");
  });

  it("does not fire when the target does not need correlation", () => {
    // Four even outcomes factorises: two independent H gates reach it.
    const c = circuit(2, [{ type: "h", targets: [0], column: 0 }]);
    expect(ruleIds(ctx(c, TARGETS.flatTwo()))).not.toContain("L01_no_entangler");
  });

  it("still fires when nothing at all has been built yet", () => {
    const c = circuit(2, []);
    const f = primaryDiagnosis(ctx(c, TARGETS.bellPhiPlus()))!;
    expect(f.ruleId).toBe("L01_no_entangler");
    expect(f.message).toContain("H");
  });
});

/* -- L07: control and target swapped ----------------------------------------- */

describe("L07 — control and target exchanged", () => {
  it("identifies the specific gate and the column it sits in", () => {
    // H on q0, then CNOT pointing the wrong way. Reversing it gives |Φ⁺⟩.
    const c = circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "cx", targets: [0], controls: [1], column: 1 },
    ]);
    const g = grade(simulate(c), TARGETS.bellPhiPlus());
    expect(g.passed).toBe(false);

    const f = primaryDiagnosis(ctx(c, TARGETS.bellPhiPlus()))!;
    expect(f.ruleId).toBe("L07_control_target_swapped");
    expect(f.message).toContain("column 1");
    expect(f.gateIds).toHaveLength(1);
    expect(f.fix?.kind).toBe("swap_control_target");
  });

  it("does not fire on a circuit that is already correct", () => {
    const c = circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "cx", targets: [1], controls: [0], column: 1 },
    ]);
    expect(ruleIds(ctx(c, TARGETS.bellPhiPlus()))).not.toContain("L07_control_target_swapped");
  });
});

/* -- L03: order inverted ------------------------------------------------------ */

describe("L03 — gates in the wrong order", () => {
  it("catches CNOT placed before the Hadamard", () => {
    // The cohort-level error the instructor heatmap is built to surface.
    const c = circuit(2, [
      { type: "cx", targets: [1], controls: [0], column: 0 },
      { type: "h", targets: [0], column: 1 },
    ]);
    const f = primaryDiagnosis(ctx(c, TARGETS.bellPhiPlus()))!;
    expect(f.ruleId).toBe("L03_order_inverted");
    expect(f.message).toContain("wrong order");
    expect(f.columns).toEqual([0, 1]);
  });
});

/* -- L12: relative phase ------------------------------------------------------ */

describe("L12 — relative phase ignored", () => {
  it("explains why a correct-looking histogram still fails", () => {
    // |+⟩ submitted where |−⟩ was wanted. Both read 50/50 in the Z basis.
    const c = circuit(1, [{ type: "h", targets: [0], column: 0 }]);
    const f = primaryDiagnosis(ctx(c, TARGETS.minus()))!;

    expect(f.ruleId).toBe("L12_relative_phase_ignored");
    expect(f.misconception).toBe("M6");
    expect(f.message).toContain("The odds are right");
    expect(f.message).toContain("relative phase");
    expect(f.fix?.kind).toBe("add_gate");
  });

  it("applying its fix passes", () => {
    const c = circuit(1, [{ type: "h", targets: [0], column: 0 }]);
    const f = primaryDiagnosis(ctx(c, TARGETS.minus()))!;
    if (f.fix?.kind === "add_gate") {
      c.gates.push({
        id: nextGateId(), type: f.fix.type, targets: f.fix.targets,
        controls: f.fix.controls, params: f.fix.params, column: f.fix.column,
      });
    }
    expect(grade(simulate(c), TARGETS.minus()).passed).toBe(true);
  });
});

/* -- L04: global phase -------------------------------------------------------- */

describe("L04 — a gate with no observable effect", () => {
  it("names the gate that only moved the global phase, and still passes", () => {
    // Z on |1⟩ negates the amplitude: same physics, different amplitudes.
    const c = circuit(1, [
      { type: "x", targets: [0], column: 0 },
      { type: "z", targets: [0], column: 1 },
    ]);
    const context = ctx(c, stateTarget(1, [[0, 0], [1, 0]]));

    // The circuit is correct. The finding explains, it does not fail anyone.
    expect(context.grade!.passed).toBe(true);

    const f = diagnose(context).find((x) => x.ruleId === "L04_global_phase_only")!;
    expect(f).toBeDefined();
    expect(f.severity).toBe("advisory");
    expect(f.misconception).toBe("M5");
    // It points at the specific gate rather than talking about phase in general.
    expect(f.message).toContain("Pauli-Z");
    expect(f.message).toContain("q0");
    expect(f.message).toContain("column 1");
    expect(f.gateIds).toHaveLength(1);
  });

  it("catches the Z added to |0⟩ that the learner expected to do something", () => {
    // Misconception M5 as the ideation doc describes it, verbatim.
    const c = circuit(1, [{ type: "z", targets: [0], column: 0 }]);
    const f = diagnose(ctx(c)).find((x) => x.ruleId === "L04_global_phase_only")!;
    expect(f).toBeDefined();
    expect(f.message).toContain("column 0");
    expect(f.fix?.kind).toBe("remove_gate");
  });

  it("stays quiet when every gate changes the state", () => {
    const c = circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "cx", targets: [1], controls: [0], column: 1 },
    ]);
    expect(ruleIds(ctx(c))).not.toContain("L04_global_phase_only");
  });
});

/* -- L05: measurement then coherent work -------------------------------------- */

describe("L05 — a coherent gate after a measurement", () => {
  it("names both columns and says measurement is not reading", () => {
    const c = circuit(1, [
      { type: "h", targets: [0], column: 0 },
      { type: "measure", targets: [0], clbit: 0, column: 1 },
      { type: "h", targets: [0], column: 2 },
    ]);
    const f = diagnose(ctx(c)).find((x) => x.ruleId === "L05_measure_then_coherent")!;
    expect(f).toBeDefined();
    expect(f.misconception).toBe("M7");
    expect(f.message).toContain("column 1");
    expect(f.message).toContain("column 2");
    expect(f.message).toContain("destroys the superposition");
  });

  it("does not fire when the measurement is terminal", () => {
    const c = circuit(1, [
      { type: "h", targets: [0], column: 0 },
      { type: "measure", targets: [0], clbit: 0, column: 1 },
    ]);
    expect(ruleIds(ctx(c))).not.toContain("L05_measure_then_coherent");
  });
});

/* -- L10 / L02: redundant pairs ----------------------------------------------- */

describe("L10 — H undone by H", () => {
  it("fires with both columns named", () => {
    const c = circuit(1, [
      { type: "h", targets: [0], column: 0 },
      { type: "h", targets: [0], column: 1 },
    ]);
    const f = diagnose(ctx(c)).find((x) => x.ruleId === "L10_h_without_purpose")!;
    expect(f).toBeDefined();
    expect(f.misconception).toBe("M1");
    expect(f.message).toContain("columns 0 and 1");
  });

  it("does not fire when something sits between them", () => {
    const c = circuit(1, [
      { type: "h", targets: [0], column: 0 },
      { type: "z", targets: [0], column: 1 },
      { type: "h", targets: [0], column: 2 },
    ]);
    expect(ruleIds(ctx(c))).not.toContain("L10_h_without_purpose");
  });
});

describe("L02 — redundant self-inverse pair", () => {
  it("fires on X followed by X", () => {
    const c = circuit(1, [
      { type: "x", targets: [0], column: 0 },
      { type: "x", targets: [0], column: 1 },
    ]);
    expect(ruleIds(ctx(c))).toContain("L02_redundant_pair");
  });

  it("does not fire on X followed by Z", () => {
    const c = circuit(1, [
      { type: "x", targets: [0], column: 0 },
      { type: "z", targets: [0], column: 1 },
    ]);
    expect(ruleIds(ctx(c))).not.toContain("L02_redundant_pair");
  });
});

/* -- L11: entangled Bloch sphere ---------------------------------------------- */

describe("L11 — an entangled qubit has no individual state", () => {
  it("explains the centre of the sphere rather than reporting a bug", () => {
    const c = circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "cx", targets: [1], controls: [0], column: 1 },
    ]);
    const f = diagnose(ctx(c)).find((x) => x.ruleId === "L11_reduced_state_mixed")!;
    expect(f).toBeDefined();
    expect(f.misconception).toBe("M4");
    expect(f.message).toContain("not a bug");
    expect(f.qubits).toEqual([0, 1]);
  });

  it("does not fire on a separable register", () => {
    const c = circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "h", targets: [1], column: 0 },
    ]);
    expect(ruleIds(ctx(c))).not.toContain("L11_reduced_state_mixed");
  });
});

/* -- L08 / L09: wires that do nothing or are never read ------------------------ */

describe("L08 — idle qubit", () => {
  it("names the wire", () => {
    const c = circuit(3, [{ type: "h", targets: [0], column: 0 }]);
    const f = diagnose(ctx(c)).find((x) => x.ruleId === "L08_idle_qubit")!;
    expect(f).toBeDefined();
    expect(f.qubits).toEqual([1, 2]);
    expect(f.message).toContain("q1, q2");
  });

  it("does not fire when every wire is used", () => {
    const c = circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "x", targets: [1], column: 0 },
    ]);
    expect(ruleIds(ctx(c))).not.toContain("L08_idle_qubit");
  });
});

describe("L09 — a wire with gates but no measurement", () => {
  it("fires only when some other wire IS measured", () => {
    const c = circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "x", targets: [1], column: 0 },
      { type: "measure", targets: [0], clbit: 0, column: 1 },
    ]);
    const f = diagnose(ctx(c)).find((x) => x.ruleId === "L09_unmeasured_result")!;
    expect(f).toBeDefined();
    expect(f.qubits).toEqual([1]);
  });

  it("stays quiet on a circuit with no measurements at all", () => {
    const c = circuit(2, [{ type: "h", targets: [0], column: 0 }]);
    expect(ruleIds(ctx(c))).not.toContain("L09_unmeasured_result");
  });
});

/* -- L06: Grover over-rotation ------------------------------------------------ */

describe("L06 — too many Grover iterations", () => {
  it("fires when the round count exceeds the optimum", () => {
    // Three diffusion rounds on 2 qubits, where the optimum is 1.
    const gates: Array<Partial<Gate> & { type: GateType }> = [];
    let col = 0;
    for (let round = 0; round < 6; round++) {
      gates.push({ type: "h", targets: [0], column: col });
      gates.push({ type: "h", targets: [1], column: col });
      col += 1;
      gates.push({ type: "cz", targets: [1], controls: [0], column: col });
      col += 1;
    }
    const c = circuit(2, gates);
    const f = diagnose(ctx(c)).find((x) => x.ruleId === "L06_grover_iterations");
    expect(f).toBeDefined();
    expect(f!.misconception).toBe("M11");
    expect(f!.message).toContain("rotation, not an accumulation");
  });
});

/* -- The fallback must still be specific -------------------------------------- */

describe("the partial-credit fallback", () => {
  it("names the outcome that is wrong and by how much", () => {
    // A circuit no rule covers: a rotation that lands short of the target.
    const c = circuit(1, [{ type: "ry", targets: [0], params: [1.0], column: 0 }]);
    const f = primaryDiagnosis(ctx(c, TARGETS.one()))!;
    expect(f.ruleId).toBe("F00_fidelity_gap");
    expect(f.message).toMatch(/Fidelity 0\.\d{3}/);
    expect(f.message).toMatch(/\|[01]⟩/);
    expect(f.message).toContain("%");
  });

  it("says nothing at all when the circuit passes", () => {
    const c = circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "cx", targets: [1], controls: [0], column: 1 },
    ]);
    expect(primaryDiagnosis(ctx(c, TARGETS.bellPhiPlus()))).toBeNull();
  });
});

/* -- Voice ------------------------------------------------------------------- */

describe("every diagnosis meets the voice contract", () => {
  const cases: Array<[string, Circuit, ReturnType<typeof TARGETS.bellPhiPlus> | undefined]> = [
    ["missing entangler", circuit(2, [{ type: "h", targets: [0], column: 0 }]), TARGETS.bellPhiPlus()],
    ["swapped control", circuit(2, [
      { type: "h", targets: [0], column: 0 },
      { type: "cx", targets: [0], controls: [1], column: 1 },
    ]), TARGETS.bellPhiPlus()],
    ["wrong order", circuit(2, [
      { type: "cx", targets: [1], controls: [0], column: 0 },
      { type: "h", targets: [0], column: 1 },
    ]), TARGETS.bellPhiPlus()],
    ["relative phase", circuit(1, [{ type: "h", targets: [0], column: 0 }]), TARGETS.minus()],
  ];

  for (const [name, c, target] of cases) {
    it(`${name}: is specific, unapologetic and under 60 words`, () => {
      const f = primaryDiagnosis(ctx(c, target))!;
      expect(f).not.toBeNull();

      // Design Doc §4.3: errors do not apologise and are never vague.
      expect(f.message).not.toMatch(/oops|sorry|whoops|uh.?oh|not quite right/i);
      expect(f.message).not.toMatch(/😅|🎉|❌|✅/);
      // No exclamation marks anywhere in the product's voice.
      expect(f.message).not.toContain("!");
      // TRD §11.3 guardrail G4: 60 words maximum.
      expect(f.message.split(/\s+/).length).toBeLessThanOrEqual(60);
      // It must point at something concrete: a wire, a column, or a gate.
      expect(f.message).toMatch(/q\d|column \d|\|[01]+⟩/);
    });
  }
});

/* -- Performance -------------------------------------------------------------- */

describe("the rule engine meets its latency budget", () => {
  it("diagnoses in well under the 200ms budget", () => {
    const c = circuit(4, [
      { type: "h", targets: [0], column: 0 },
      { type: "h", targets: [1], column: 0 },
      { type: "cx", targets: [2], controls: [0], column: 1 },
      { type: "cx", targets: [3], controls: [1], column: 2 },
    ]);
    const context = ctx(c, TARGETS.ghz3());

    const t0 = performance.now();
    for (let i = 0; i < 20; i++) diagnose(context);
    const perCall = (performance.now() - t0) / 20;

    expect(perCall).toBeLessThan(200);
  });
});
