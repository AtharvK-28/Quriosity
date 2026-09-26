/**
 * The physics firewall.
 *
 * Two directions, both pinned. Wrong physics is stopped — each catalogued law
 * by its commonest phrasing, and the computed laws by working the matrices.
 * And right physics goes through: every sentence the platform itself teaches
 * is run through the firewall, because one that blocks the curriculum would
 * block the tutor quoting it.
 */

import { describe, expect, it } from "vitest";
import { firewall } from "@/lib/tutor/firewall";
import { CORPUS, CORRECTIONS } from "@/lib/tutor/corpus";
import { NODES } from "@/lib/curriculum/nodes";
import { GLOSSARY } from "@/lib/curriculum/glossary";
import { GATES, GATE_TYPES } from "@/lib/ir/gates";

const blocked = (text: string) => firewall(text)?.law ?? null;

describe("catalogued laws", () => {
  it.each([
    ["Measuring one qubit lets you send a message to the other faster than light.", "no-signalling"],
    ["With entanglement you can communicate instantly across the galaxy.", "no-signalling"],
    ["CNOT copies the control qubit onto the target.", "no-cloning"],
    ["The circuit clones an unknown state into q1.", "no-cloning"],
    ["A quantum computer tries every possible answer at once.", "no-parallel-readout"],
    ["The algorithm checks all the inputs in parallel.", "no-parallel-readout"],
    ["The qubit is secretly either 0 or 1 before you look.", "no-hidden-value"],
    ["In superposition the qubit has a hidden value that measurement reveals.", "no-hidden-value"],
    ["A global phase changes the measurement probabilities.", "global-phase"],
    ["The global phase is observable if you run enough shots.", "global-phase"],
    ["Measurement doesn't change the state, it only reads it.", "measurement-disturbs"],
    ["Measurement is just a peek at the qubit.", "measurement-disturbs"],
    ["Grover's algorithm gives an exponential speedup.", "grover-quadratic"],
    ["More Grover iterations always improve the odds.", "grover-overshoot"],
    ["In Qiskit, q0 is the leftmost bit.", "little-endian"],
  ])("stops %j", (text, law) => {
    expect(blocked(text)).toBe(law);
  });

  it("answers with the curriculum's own correction", () => {
    const v = firewall("CNOT copies the qubit.");
    expect(v?.truth).toBe(CORRECTIONS.M8);
    expect(v?.misconception).toBe("M8");
  });

  it.each([
    "Nothing travels faster than light: the correlation only shows once you compare notes.",
    "Entanglement cannot be used to send a message faster than light.",
    "CNOT does not copy a superposed qubit — the no-cloning theorem forbids it.",
    "A common misconception is that CNOT copies the control qubit.",
    "On a basis state, CNOT copies the control's 0 or 1 onto the target.",
    "It's a myth that a quantum computer tries every answer at once.",
    "Grover gives a quadratic speedup, not an exponential one.",
    "Unlike Shor's exponential speedup, Grover's is quadratic.",
    "Measuring |0⟩ doesn't change the state.",
    "Measuring it again doesn't change the state.",
    "A global phase changes nothing you can measure.",
    "In Cirq, q0 is the leftmost bit.",
    "q0 is the rightmost bit.",
  ])("lets %j through", (text) => {
    expect(blocked(text)).toBeNull();
  });
});

describe("computed laws", () => {
  it("works out self-inverse claims from the matrices", () => {
    expect(blocked("H is its own inverse.")).toBeNull();
    expect(blocked("Applying X twice cancels out.")).toBeNull();
    expect(firewall("S is its own inverse.")?.truth).toMatch(/Pauli-Z/);
    expect(firewall("Applying T twice gets you back to the start.")?.truth).toMatch(/Phase S/);
  });

  it("works out what a gate does to a named state", () => {
    expect(blocked("H maps |0⟩ to |+⟩.")).toBeNull();
    expect(blocked("Z turns |+⟩ into |−⟩.")).toBeNull();
    expect(blocked("S takes |+⟩ to |i⟩.")).toBeNull();
    expect(blocked("Applying X to |1⟩ gives |0⟩.")).toBeNull();
    // Up to a global phase: Y|0⟩ = i|1⟩ is |1⟩.
    expect(blocked("Y sends |0⟩ to |1⟩.")).toBeNull();

    const v = firewall("H maps |0⟩ to |1⟩.");
    expect(v?.law).toBe("gate-algebra");
    expect(v?.truth).toContain("|+⟩");
    expect(blocked("Z flips |0⟩ to |1⟩.")).toBe("gate-algebra");
  });

  it("holds probabilities to one", () => {
    expect(blocked("You get |0⟩ with 70% and |1⟩ with 50%.")).toBe("normalisation");
    expect(blocked("|1⟩ comes up 150% of the time.")).toBe("normalisation");
    expect(blocked("You get |0⟩ with 70% and |1⟩ with 30%.")).toBeNull();
    // A comparison between two circuits is not one distribution.
    expect(blocked("Yours gives |00⟩ 50%, whereas the target gives |11⟩ 100%.")).toBeNull();
  });

  it("does not read lowercase letters as gates", () => {
    expect(blocked("Rotating about the x axis turns |0⟩ into |1⟩ at θ = π.")).toBeNull();
  });
});

describe("the platform's own teaching passes", () => {
  const sentences = [
    ...Object.values(CORRECTIONS),
    ...CORPUS.map((p) => p.answer),
    ...NODES.flatMap((n) => [n.hook, n.task, n.instruction, n.passNote, n.retrieval.because]),
    ...GATE_TYPES.map((t) => GATES[t].blurb),
    ...GLOSSARY.flatMap((t) => [t.short, t.more ?? ""]),
  ].filter(Boolean);

  it.each(sentences.map((s) => [s]))("%j", (text) => {
    expect(firewall(text)).toBeNull();
  });
});

describe("gate chips", () => {
  it("reads [[gate:ID]] as the gate it names", () => {
    expect(blocked("[[gate:s]] is its own inverse.")).toBe("gate-algebra");
    expect(blocked("The [[gate:h]] gate maps |0⟩ to |+⟩.")).toBeNull();
    expect(blocked("[[gate:cx]] copies the control qubit.")).toBe("no-cloning");
  });
});
