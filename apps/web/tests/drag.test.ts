/**
 * Drag and drop: a gate dragged from the tray lands whole, and one end of a
 * multi-wire gate can be dragged on its own.
 *
 * The canvas turns pointer positions into slots and calls these store
 * actions, so they carry the behaviour; the browser suite covers the pointer.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { dropWires } from "@/lib/ir/drop";
import { render } from "@/lib/render";
import { addedLines, linesForGates } from "@/lib/render/diff";
import { emptyCircuit } from "@/lib/ir/types";
import { validate } from "@/lib/ir/validate";
import { grade } from "@/lib/grade/fidelity";
import { CHALLENGES_BY_ID } from "@/lib/curriculum/challenges";
import { simulate } from "@/lib/sim/statevector";
import { useCircuit } from "@/stores/circuitStore";
import { useDrag } from "@/stores/dragStore";
import { useSession } from "@/stores/sessionStore";

const store = () => useCircuit.getState();

beforeEach(() => {
  useSession.setState({ hydrated: true, mode: "guided" });
  store().setCircuit(emptyCircuit(2));
});

describe("dropWires", () => {
  it("takes the dropped wire first, then the next ones down", () => {
    expect(dropWires("cx", 0, 2)).toEqual({ controls: [0], targets: [1] });
    expect(dropWires("ccx", 0, 3)).toEqual({ controls: [0, 1], targets: [2] });
  });

  it("goes up when there is no room below: a CNOT on the bottom wire is upside down", () => {
    expect(dropWires("cx", 1, 2)).toEqual({ controls: [1], targets: [0] });
    expect(dropWires("ccx", 2, 3)).toEqual({ controls: [2, 1], targets: [0] });
    expect(dropWires("ccx", 1, 3)).toEqual({ controls: [1, 2], targets: [0] });
  });

  it("gives a swap two targets and a barrier the whole register", () => {
    expect(dropWires("swap", 1, 3)).toEqual({ controls: [], targets: [1, 2] });
    expect(dropWires("barrier", 2, 3)).toEqual({ controls: [], targets: [0, 1, 2] });
  });

  it("refuses a register too small, or a wire off it", () => {
    expect(dropWires("cx", 0, 1)).toBeNull();
    expect(dropWires("ccx", 0, 2)).toBeNull();
    expect(dropWires("h", 2, 2)).toBeNull();
  });
});

describe("dropping from the tray", () => {
  it("places a single-wire gate where it lands", () => {
    const id = store().dropGate("h", 1, 0);
    expect(id).not.toBeNull();
    expect(store().circuit.gates[0]).toMatchObject({ type: "h", targets: [1], column: 0 });
    expect(store().pendingControl).toBeNull();
  });

  it("places a whole CNOT in one drop, with no wire-picking step", () => {
    store().dropGate("cx", 0, 1);
    expect(store().pendingControl).toBeNull();
    expect(store().circuit.gates[0]).toMatchObject({ type: "cx", controls: [0], targets: [1], column: 1 });
    expect(validate(store().circuit).valid).toBe(true);
  });

  it("gives a dropped controlled rotation its default angle and selects it, which opens the dial", () => {
    const id = store().dropGate("crz", 0, 0);
    expect(store().circuit.gates[0]).toMatchObject({ controls: [0], targets: [1], params: [Math.PI / 2] });
    expect(store().selectedGateId).toBe(id);
  });

  it("drops onto an occupied slot by moving to the next free column", () => {
    store().dropGate("h", 0, 0);
    store().dropGate("cx", 0, 0);
    const cx = store().circuit.gates.find((g) => g.type === "cx")!;
    expect(cx.column).toBe(1);
  });

  it("falls back to asking for the wires when the register cannot hold the gate", () => {
    store().setCircuit(emptyCircuit(1));
    expect(store().dropGate("cx", 0, 0)).toBeNull();
    expect(store().circuit.gates).toHaveLength(0);
    expect(store().pendingControl).toMatchObject({ type: "cx", picked: [0] });
  });

  it("is one undoable edit", () => {
    store().dropGate("cx", 0, 0);
    store().undo();
    expect(store().circuit.gates).toHaveLength(0);
  });
});

describe("dragging one end of a gate", () => {
  /** The launch video's bench scene, played through the store. */
  it("flips an upside-down CNOT when its control is dragged onto the target's wire, and the Bell pair passes", () => {
    const bell = CHALLENGES_BY_ID.get("c.bell")!.target;

    store().dropGate("h", 0, 0);
    const cx = store().dropGate("cx", 1, 1)!; // dropped on q1: control q1, target q0
    expect(store().circuit.gates.find((g) => g.id === cx)).toMatchObject({ controls: [1], targets: [0] });
    expect(grade(simulate(store().circuit), bell).passed).toBe(false);

    store().rewireGate(cx, 1, 0);
    expect(store().circuit.gates.find((g) => g.id === cx)).toMatchObject({ controls: [0], targets: [1] });
    expect(grade(simulate(store().circuit), bell).passed).toBe(true);
  });

  it("moves one end to a free wire and leaves the others", () => {
    store().setCircuit(emptyCircuit(3));
    const id = store().dropGate("cx", 0, 0)!;
    store().rewireGate(id, 1, 2);
    expect(store().circuit.gates[0]).toMatchObject({ controls: [0], targets: [2] });
  });

  it("will not move an end onto a wire another gate holds in that column", () => {
    store().setCircuit(emptyCircuit(3));
    store().dropGate("h", 2, 0);
    const id = store().dropGate("cx", 0, 0)!;
    store().rewireGate(id, 1, 2);
    expect(store().circuit.gates.find((g) => g.id === id)).toMatchObject({ controls: [0], targets: [1] });
  });

  it("ignores barriers, wires off the register and ends the gate does not have", () => {
    const id = store().dropGate("cx", 0, 0)!;
    const before = store().version;
    store().rewireGate(id, 0, 5);
    store().rewireGate(id, 3, 1);
    expect(store().version).toBe(before);
  });
});

describe("moving a gate", () => {
  it("does not record an edit when the gate is dropped back where it was", () => {
    const id = store().dropGate("h", 0, 0)!;
    const depth = store().past.length;
    store().moveGate(id, 0, 0);
    store().moveGate(id, 0, 0);
    expect(store().past.length).toBe(depth);
    store().moveGate(id, 1, 2);
    expect(store().past.length).toBe(depth + 1);
  });
});

describe("the drag itself", () => {
  it("hands the drop to the first target that takes it, then ends", () => {
    const seen: string[] = [];
    const off1 = useDrag.getState().register(() => false);
    const off2 = useDrag.getState().register((type) => (seen.push(type), true));
    useDrag.getState().begin("x", 0, 0);
    useDrag.getState().moveTo(10, 10);
    expect(useDrag.getState().drag).toMatchObject({ type: "x", x: 10, y: 10 });
    expect(useDrag.getState().end(10, 10)).toBe(true);
    expect(seen).toEqual(["x"]);
    expect(useDrag.getState().drag).toBeNull();
    off1();
    off2();
    useDrag.getState().begin("x", 0, 0);
    expect(useDrag.getState().end(0, 0)).toBe(false);
  });
});

describe("the code writes itself", () => {
  it("finds the line a dropped gate wrote", () => {
    store().dropGate("h", 0, 0);
    const before = render(store().circuit, "qiskit");
    store().dropGate("cx", 1, 1);
    const after = render(store().circuit, "qiskit");
    const lines = after.split("\n");
    expect(addedLines(before, after).map((i) => lines[i])).toEqual(["qc.cx(1, 0)"]);
  });

  it("finds the line of the gate the tutor points at, in every dialect", () => {
    store().dropGate("h", 0, 0);
    const cx = store().dropGate("cx", 1, 1)!;
    const c = store().circuit;
    for (const sdk of ["qiskit", "cirq", "pennylane", "qsharp", "qasm"] as const) {
      const lines = render(c, sdk).split("\n");
      const flagged = linesForGates(c, sdk, [cx]).map((i) => lines[i]);
      expect(flagged.length, sdk).toBeGreaterThan(0);
      expect(flagged.join(" "), sdk).not.toMatch(/\bh\b|\bH\b/);
    }
    expect(linesForGates(c, "qiskit", [cx]).map((i) => render(c, "qiskit").split("\n")[i])).toEqual(["qc.cx(1, 0)"]);
  });

  it("marks nothing for a gate that is not there", () => {
    expect(linesForGates(store().circuit, "qiskit", ["nope"])).toEqual([]);
  });
});
