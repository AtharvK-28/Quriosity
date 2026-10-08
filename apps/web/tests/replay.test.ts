/**
 * An instructor opening a student's failed run sees the same gate ringed the
 * student saw — recovered by re-running the rule engine on the stored circuit.
 */

import { describe, expect, it } from "vitest";
import { attemptHighlights, targetForPlace } from "@/lib/tutor/replay";
import { emptyCircuit, type Circuit } from "@/lib/ir/types";

function upsideDownBell(): Circuit {
  const c = emptyCircuit(2);
  c.gates = [
    { id: "a", type: "h", targets: [0], controls: [], params: [], column: 0 },
    { id: "b", type: "cx", targets: [0], controls: [1], params: [], column: 1 },
  ];
  return c;
}

describe("attemptHighlights", () => {
  it("rings the upside-down CNOT on the Bell challenge", () => {
    expect(attemptHighlights("challenge:c.bell", upsideDownBell(), "L07_control_target_swapped")).toEqual(["b"]);
  });

  it("finds it without the stored rule id too", () => {
    expect(attemptHighlights("challenge:c.bell", upsideDownBell(), null)).toEqual(["b"]);
  });

  it("rings nothing for an unknown place or a register of the wrong size", () => {
    expect(attemptHighlights("challenge:nope", upsideDownBell(), null)).toEqual([]);
    expect(attemptHighlights("lesson:u0.n1", upsideDownBell(), null)).toEqual([]);
    expect(targetForPlace("elsewhere:x")).toBeNull();
  });
});
