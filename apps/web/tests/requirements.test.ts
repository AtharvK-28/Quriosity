/**
 * Nodes whose lesson is a process can't be skipped by reaching the state some
 * other way — and the intended circuit still passes. Grading itself is
 * untouched: the shortcut still grades at fidelity 1.
 */

import { describe, expect, it } from "vitest";
import { NODES_BY_ID, unmetRequirement } from "@/lib/curriculum/nodes";
import { grade } from "@/lib/grade/fidelity";
import { emptyCircuit, type Circuit, type GateType } from "@/lib/ir/types";
import { simulate } from "@/lib/sim/statevector";

function build(types: GateType[]): Circuit {
  const c = emptyCircuit(1);
  c.gates = types.map((type, column) => ({
    id: `g${column}`, type, targets: [0], controls: [], params: [], column,
    ...(type === "measure" ? { clbit: 0 } : {}),
  }));
  return c;
}

const node = (id: string) => NODES_BY_ID.get(id)!;
const grades = (id: string, c: Circuit) => grade(simulate(c), node(id).target).passed;

describe("teaching requirements", () => {
  it.each([
    ["u0.n3", [], ["h", "h"]],
    ["u1.n3", ["h"], ["h", "measure", "h"]],
    ["u2.n4", ["x"], ["h", "z", "h"]],
  ] as Array<[string, GateType[], GateType[]]>)("%s: the shortcut is refused, the lesson's circuit passes", (id, shortcut, intended) => {
    const short = build(shortcut);
    expect(grades(id, short)).toBe(true);
    expect(unmetRequirement(node(id), short)).toBeTruthy();

    const real = build(intended);
    expect(grades(id, real)).toBe(true);
    expect(unmetRequirement(node(id), real)).toBeNull();
  });

  it("leaves nodes without a requirement alone", () => {
    // u1.n2 teaches that a plain X is as right as H, Z, H.
    expect(unmetRequirement(node("u1.n2"), build(["x"]))).toBeNull();
  });
});
