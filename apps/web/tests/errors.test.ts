/**
 * Run-failure taxonomy — PRD E4-S4, Design Doc §8.7.
 *
 * "Timeout, memory cap, qubit cap and invalid-circuit each produce a distinct
 * message naming the cause and the fix. No stack traces are shown to students."
 *
 * The UI blocks most of these before they can happen — the wire stepper stops
 * at the tier cap, for instance — so the codes are exercised here directly.
 * A path being unreachable through today's UI is not a reason to leave it
 * untested; it is a reason it will still be right when a permalink or an
 * import reaches it tomorrow.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useCircuit } from "@/stores/circuitStore";
import { useSession } from "@/stores/sessionStore";
import { MAX_GATES, emptyCircuit, nextGateId, type Circuit, type GateType } from "@/lib/ir/types";

function circuitOf(qubits: number, gates: Array<{ type: GateType; q: number; col: number }>): Circuit {
  const c = emptyCircuit(qubits);
  c.gates = gates.map((g) => ({
    id: nextGateId(),
    type: g.type,
    targets: [g.q],
    controls: [],
    params: [],
    column: g.col,
  }));
  return c;
}

function runWith(c: Circuit) {
  useCircuit.getState().setCircuit(c);
  useCircuit.getState().execute();
  return useCircuit.getState();
}

describe("run failures name a cause and a fix", () => {
  beforeEach(() => {
    useSession.setState({ mode: "guided", hydrated: true });
    useCircuit.getState().reset(2);
  });

  it("blocks a circuit past the tier cap, naming the cap and the mode", () => {
    const { error, run } = runWith(emptyCircuit(20));

    expect(error?.code).toBe("qubit_cap");
    expect(error!.message).toContain("12 qubits");
    expect(error!.message).toContain("20");
    expect(error!.message).toMatch(/guided/i);
    // The circuit is not run, and nothing is lost.
    expect(run).toBeNull();
    expect(useCircuit.getState().circuit.qubits).toBe(20);
  });

  it("blocks a circuit past the gate limit, with the count shown", () => {
    const gates = Array.from({ length: MAX_GATES + 5 }, (_, i) => ({
      type: "x" as GateType,
      q: 0,
      col: i,
    }));
    const { error } = runWith(circuitOf(1, gates));

    expect(error?.code).toBe("gate_limit");
    expect(error!.message).toContain(String(MAX_GATES + 5));
    expect(error!.message).toContain(String(MAX_GATES));
  });

  it("names the offending gate on an invalid circuit", () => {
    const c = emptyCircuit(2);
    c.gates = [
      // A CNOT using the same wire as control and target.
      { id: "bad", type: "cx", targets: [0], controls: [0], params: [], column: 0 },
    ];
    const { error } = runWith(c);

    expect(error?.code).toBe("invalid");
    expect(error!.gateId).toBe("bad");
    expect(error!.message).toContain("q0");
    expect(error!.message).toMatch(/control and target/i);
  });

  it("never shows a stack trace or a bare exception", () => {
    for (const c of [emptyCircuit(20), circuitOf(1, [{ type: "x", q: 5, col: 0 }])]) {
      const { error } = runWith(c);
      expect(error).not.toBeNull();
      expect(error!.message).not.toMatch(/at .*\(|Error:|undefined|NaN|\bnull\b/);
      // Every message ends as a sentence, not as a fragment or an object dump.
      expect(error!.message.trim()).toMatch(/[.!?]$/);
    }
  });

  it("runs an empty circuit rather than treating it as a failure", () => {
    // PRD §9: |00…0⟩ at 100% is correct, and a teaching moment.
    const { error, run } = runWith(emptyCircuit(2));

    expect(error).toBeNull();
    expect(run).not.toBeNull();
    expect(run!.result.probabilities[0]).toBeCloseTo(1, 12);
    expect(run!.counts.counts["00"]).toBe(run!.shots);
  });

  it("clears a previous error once the circuit is fixed", () => {
    runWith(emptyCircuit(20));
    expect(useCircuit.getState().error).not.toBeNull();

    runWith(circuitOf(2, [{ type: "h", q: 0, col: 0 }]));
    expect(useCircuit.getState().error).toBeNull();
    expect(useCircuit.getState().run).not.toBeNull();
  });

  it("a failed run leaves the circuit intact", () => {
    const c = circuitOf(2, [{ type: "h", q: 0, col: 0 }]);
    c.qubits = 20; // now over the cap, with the gate still on it
    runWith(c);

    expect(useCircuit.getState().error?.code).toBe("qubit_cap");
    expect(useCircuit.getState().circuit.gates).toHaveLength(1);
  });
});
