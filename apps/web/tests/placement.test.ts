/**
 * Placing and removing things on the canvas — PRD E2-S2, E2-S4, E2-S7, §6.3.
 *
 * These go through the store, which is the only thing the canvas calls, so a
 * passing test here means the click path works too.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { emptyCircuit, gateCount } from "@/lib/ir/types";
import { validate } from "@/lib/ir/validate";
import { MODE, useSession } from "@/stores/sessionStore";
import { useCircuit } from "@/stores/circuitStore";
import { MAX_SIM_QUBITS } from "@/lib/sim/statevector";

const store = () => useCircuit.getState();

beforeEach(() => {
  useSession.setState({ hydrated: true, mode: "guided" });
  store().setCircuit(emptyCircuit(3));
});

describe("multi-wire placement", () => {
  it("places a CNOT from its control, then its target", () => {
    store().place("cx", 0, 0);
    expect(store().pendingControl).toMatchObject({ control: 0, need: 2, picked: [0] });
    const id = store().completeControlled(2);
    expect(id).not.toBeNull();
    expect(store().circuit.gates[0]).toMatchObject({ type: "cx", controls: [0], targets: [2] });
    expect(store().pendingControl).toBeNull();
  });

  it("places a Toffoli with both controls and a target — it used to lose a control", () => {
    store().place("ccx", 0, 0);
    expect(store().completeControlled(1)).toBeNull();
    expect(store().pendingControl?.picked).toEqual([0, 1]);
    store().completeControlled(2);

    const [g] = store().circuit.gates;
    expect(g).toMatchObject({ type: "ccx", controls: [0, 1], targets: [2] });
    expect(validate(store().circuit).valid).toBe(true);
  });

  it("refuses to reuse a wire within one gate", () => {
    store().place("ccx", 1, 0);
    expect(store().completeControlled(1)).toBeNull();
    expect(store().pendingControl?.picked).toEqual([1]);
  });

  it("places SWAP on two targets", () => {
    store().place("swap", 2, 0);
    store().completeControlled(0);
    expect(store().circuit.gates[0]).toMatchObject({ type: "swap", controls: [], targets: [2, 0] });
  });

  it("places a controlled rotation with its default angle", () => {
    store().place("crz", 1, 0);
    store().completeControlled(0);
    expect(store().circuit.gates[0]).toMatchObject({ type: "crz", controls: [1], targets: [0], params: [Math.PI / 2] });
  });

  it("spans a barrier from its first wire to its last — E2-S7", () => {
    store().place("barrier", 2, 1);
    store().completeControlled(0);
    expect(store().circuit.gates[0]).toMatchObject({ type: "barrier", targets: [0, 1, 2], column: 1 });
    expect(gateCount(store().circuit)).toBe(0);
  });

  it("lets a barrier cover a single wire", () => {
    store().place("barrier", 1, 0);
    store().completeControlled(1);
    expect(store().circuit.gates[0]).toMatchObject({ type: "barrier", targets: [1] });
  });
});

describe("the qubit cap follows the mode — §6.3", () => {
  it("stops Guided at 12", () => {
    store().setCircuit(emptyCircuit(11));
    store().addQubit();
    store().addQubit();
    expect(store().circuit.qubits).toBe(MODE.guided.maxQubits);
  });

  it("lets Workbench go to the simulator's ceiling", () => {
    useSession.setState({ mode: "workbench" });
    store().setCircuit(emptyCircuit(12));
    for (let i = 0; i < 10; i++) store().addQubit();
    expect(store().circuit.qubits).toBe(MAX_SIM_QUBITS);
  });
});

describe("removing a wire — E2-S4", () => {
  function build() {
    const c = emptyCircuit(3);
    c.gates = [
      { id: "a", type: "h", targets: [0], controls: [], params: [], column: 0 },
      { id: "b", type: "cx", targets: [1], controls: [0], params: [], column: 1 },
      { id: "c", type: "x", targets: [2], controls: [], params: [], column: 0 },
      { id: "d", type: "barrier", targets: [0, 1, 2], controls: [], params: [], column: 2 },
      { id: "e", type: "measure", targets: [2], controls: [], params: [], column: 3, clbit: 2 },
    ];
    store().setCircuit(c);
  }

  it("deletes the gates on that wire and moves the wires below it up", () => {
    build();
    store().removeQubitAt(1);
    const c = store().circuit;

    expect(c.qubits).toBe(2);
    expect(c.gates.map((g) => g.id)).toEqual(["a", "c", "d", "e"]);
    expect(c.gates.find((g) => g.id === "c")!.targets).toEqual([1]);
    expect(c.gates.find((g) => g.id === "d")!.targets).toEqual([0, 1]);
    expect(c.gates.find((g) => g.id === "e")).toMatchObject({ targets: [1], clbit: 1 });
    expect(validate(c).valid).toBe(true);
  });

  it("is one undoable edit", () => {
    build();
    store().removeQubitAt(0);
    store().undo();
    expect(store().circuit.qubits).toBe(3);
    expect(store().circuit.gates).toHaveLength(5);
  });

  it("never removes the last wire", () => {
    store().setCircuit(emptyCircuit(1));
    store().removeQubitAt(0);
    expect(store().circuit.qubits).toBe(1);
  });
});

describe("whole-circuit replacement", () => {
  it("is undoable, so an import or an optimisation can be taken back", () => {
    store().place("h", 0, 0);
    const before = store().circuit;
    const incoming = emptyCircuit(2);
    store().replaceCircuit(incoming);
    expect(store().circuit.qubits).toBe(2);
    store().undo();
    expect(store().circuit).toEqual(before);
  });
});

describe("advice after a run — E7-S6", () => {
  it("offers a shorter equivalent when nothing is wrong", () => {
    store().setCircuit(emptyCircuit(1));
    store().place("h", 0, 0);
    store().place("h", 0, 1);
    store().place("x", 0, 2);
    store().execute();
    const run = store().run!;
    expect(run.finding).toBeNull();
    expect(run.advice?.ruleId).toBe("O01_shorter_equivalent");

    store().applyFix(run.advice!.fix!);
    expect(gateCount(store().circuit)).toBe(1);
  });

  it("withholds advice while there is a failure to fix", () => {
    const c = emptyCircuit(2);
    store().setCircuit(c);
    store().place("h", 0, 0);
    store().place("h", 1, 1);
    store().place("h", 1, 2);
    const bell = { kind: "distribution" as const, qubits: 2, probabilities: new Float64Array([0.5, 0, 0, 0.5]) };
    store().execute(bell);
    expect(store().run!.grade!.passed).toBe(false);
    expect(store().run!.advice).toBeNull();
  });
});
