/**
 * Every node must be solvable with the gates it actually offers.
 *
 * This is the test that catches the worst class of curriculum bug: a node whose
 * target cannot be reached with its own palette. A learner hitting one of those
 * has no move available and no way to know that, which is worse than a wrong
 * answer — it is an unwinnable screen.
 *
 * The search is a bounded brute force over the node's own allowed gates, up to
 * one gate more than par. If no circuit in that space reaches the target, the
 * node is not solvable as authored.
 */

import { describe, expect, it } from "vitest";
import { NODES, type LessonNode } from "@/lib/curriculum/nodes";
import { CHALLENGES, type Challenge } from "@/lib/curriculum/challenges";
import { emptyCircuit, nextGateId, type Circuit, type Gate, type GateType } from "@/lib/ir/types";
import { GATES } from "@/lib/ir/gates";
import { simulate } from "@/lib/sim/statevector";
import { grade } from "@/lib/grade/fidelity";
import { validate } from "@/lib/ir/validate";
import { lockedGates, oracleGates, oracleResults, type OracleSpec } from "@/lib/curriculum/oracle";

/**
 * Angles a learner can actually produce, quantised to whole degrees.
 *
 * The dial steps at 1°, so testing exact irrational solutions would prove
 * something the interface cannot deliver. Every angle here is reachable by
 * dragging alone; the text field additionally accepts pi/3 and 90deg forms.
 */
const DEG = Math.PI / 180;

function paramChoices(type: GateType): number[][] {
  if (GATES[type].paramArity === 0) return [[]];
  if (!PARAM_EDITING_AVAILABLE) return [[Math.PI / 2]];

  const degrees = [
    30, 45, 60, 90, 120, 135, 143, 180, 270,
    // The angle that lands 85% on |1⟩, to the nearest degree the dial offers.
    134,
  ];
  return degrees.map((d) => [d * DEG]);
}

/**
 * Rotation gates were unsettable until the parameter popover existed, and with
 * this false the suite reproduces exactly what that cost: u0.n2, u1.n5 and
 * u1.n6 have no reachable answer at all.
 */
const PARAM_EDITING_AVAILABLE = true;

interface Move {
  type: GateType;
  targets: number[];
  controls: number[];
  params: number[];
}

/** Every single placement a learner could make on this node, in one column. */
/** Nodes and challenges share the shape the search needs. */
type Solvable = Pick<LessonNode, "qubits" | "target" | "allowedGates" | "par" | "starter"> & { oracle?: OracleSpec };

function moves(node: Solvable): Move[] {
  const out: Move[] = [];
  for (const type of node.allowedGates) {
    const spec = GATES[type];
    if (type === "measure" || type === "barrier" || type === "reset") continue;

    for (const params of paramChoices(type)) {
      if (spec.controlArity === 0 && spec.targetArity === 1) {
        for (let q = 0; q < node.qubits; q++) {
          out.push({ type, targets: [q], controls: [], params });
        }
      } else if (spec.controlArity === 1) {
        for (let c = 0; c < node.qubits; c++) {
          for (let t = 0; t < node.qubits; t++) {
            if (c === t) continue;
            out.push({ type, targets: [t], controls: [c], params });
          }
        }
      } else if (spec.targetArity === 2) {
        for (let a = 0; a < node.qubits; a++) {
          for (let b = a + 1; b < node.qubits; b++) {
            out.push({ type, targets: [a, b], controls: [], params });
          }
        }
      }
    }
  }
  return out;
}

function build(node: Solvable, sequence: Move[]): Circuit {
  const c = emptyCircuit(node.qubits);
  const gates: Gate[] = [];
  let col = 0;

  for (const g of node.starter ?? []) {
    gates.push({
      id: nextGateId(),
      type: g.type,
      targets: g.targets,
      controls: g.controls ?? [],
      params: g.params ?? [],
      column: g.column,
    });
    col = Math.max(col, g.column + 1);
  }
  for (const m of sequence) {
    gates.push({ id: nextGateId(), type: m.type, targets: m.targets, controls: m.controls, params: m.params, column: col });
    col += 1;
  }
  c.gates = gates;
  return c;
}

/**
 * An oracle node's circuit for a search: the lesson's gates, `before`, the box
 * (placed after them, since only the order matters to the simulator), then
 * `after`. The real columns are checked separately, on the node's reference.
 */
function buildAround(node: Solvable, before: Move[], after: Move[]): { circuit: Circuit; box: number } {
  const spec = node.oracle!;
  const c = emptyCircuit(node.qubits);
  const gates: Gate[] = lockedGates(node.starter ?? []);
  let col = Math.max(0, ...gates.map((g) => g.column + 1));
  for (const m of before) gates.push({ id: nextGateId(), ...m, column: col++ });
  const box = oracleGates({ ...spec, column: col }, 0);
  gates.push(...box);
  col += spec.width;
  const boxAt = col - spec.width;
  for (const m of after) gates.push({ id: nextGateId(), ...m, column: col++ });
  c.gates = gates;
  return { circuit: c, box: boxAt };
}

/** Passes the node: every hidden function, for an oracle node; the target otherwise. */
function passes(node: Solvable, c: { circuit: Circuit; box: number }): boolean {
  if (node.oracle) return oracleResults(c.circuit, { ...node.oracle, column: c.box }).every((r) => r.passed);
  return grade(simulate(c.circuit), node.target).passed;
}

/** Every way to split a sequence around the box. */
function candidates(node: Solvable, seq: Move[]): Array<{ circuit: Circuit; box: number }> {
  if (!node.oracle) return [{ circuit: build(node, seq), box: 0 }];
  return Array.from({ length: seq.length + 1 }, (_, k) => buildAround(node, seq.slice(0, k), seq.slice(k)));
}

/** Depth-first search for any circuit reaching the target within `maxGates`. */
function findSolution(node: Solvable, maxGates: number): Move[] | null {
  const options = moves(node);

  // The starter circuit alone may already be the answer.
  if (candidates(node, []).some((c) => passes(node, c))) return [];

  const stack: Move[][] = options.map((m) => [m]);
  while (stack.length > 0) {
    const seq = stack.pop()!;
    let passed = false;
    try {
      passed = candidates(node, seq).some((c) => passes(node, c));
    } catch {
      continue;
    }
    if (passed) return seq;
    if (seq.length < maxGates) {
      for (const m of options) stack.push([...seq, m]);
    }
  }
  return null;
}

/** Past four gates the search is a hang, not a test; these nodes carry a reference. */
const SEARCHABLE = (node: LessonNode) => node.par <= 4;

describe("every curriculum node is solvable with its own palette", () => {
  for (const node of NODES.filter(SEARCHABLE)) {
    it(`${node.id} — ${node.title}`, () => {
      // One gate more than par, so there is slack for a longer valid route.
      const solution = findSolution(node, Math.min(node.par + 1, 4));
      expect(
        solution,
        `${node.id} "${node.title}" cannot be solved with [${node.allowedGates.join(", ")}] ` +
          `in ${node.par + 1} gates. Target: ${node.target.label ?? node.target.kind}.`,
      ).not.toBeNull();
    });
  }
});

describe("par is achievable", () => {
  for (const node of NODES.filter(SEARCHABLE)) {
    it(`${node.id} — par is ${node.par}`, () => {
      const solution = findSolution(node, node.par);
      expect(
        solution,
        `${node.id} claims par ${node.par} but no solution that short exists.`,
      ).not.toBeNull();
    });
  }
});

/* -- Node references ------------------------------------------------------------
   A node's reference is one intended solution, at the columns a learner would
   actually use. It has to fit around the lesson's locked gates and the box,
   use only the node's palette, meet par, and pass: for an oracle node, for
   every function the box can hide.
   ------------------------------------------------------------------------- */

function nodeFromReference(node: LessonNode): Circuit {
  const c = emptyCircuit(node.qubits, node.title);
  c.gates = [
    ...lockedGates(node.starter ?? []),
    ...(node.oracle ? oracleGates(node.oracle, 0) : []),
    ...(node.reference ?? []).map((g) => ({
      id: nextGateId(),
      type: g.type,
      targets: g.targets,
      controls: g.controls ?? [],
      params: g.params ?? [],
      column: g.column,
    })),
  ];
  return c;
}

describe("every node reference fits, stays in the palette, meets par and passes", () => {
  for (const node of NODES.filter((n) => n.reference)) {
    it(`${node.id} — ${node.title}`, () => {
      const c = nodeFromReference(node);
      expect(validate(c).valid, `${node.id}'s reference collides with the lesson's own gates`).toBe(true);
      for (const g of node.reference!) {
        expect(node.allowedGates, `${node.id}'s reference uses ${g.type}`).toContain(g.type);
        if (node.oracle) {
          const { column, width } = node.oracle;
          expect(g.column >= column && g.column < column + width, `${node.id}'s reference puts a gate inside the box`).toBe(false);
        }
      }
      expect(node.reference!.length).toBeLessThanOrEqual(node.par);
      if (node.oracle) {
        const results = oracleResults(c, node.oracle);
        expect(results.filter((r) => !r.passed).map((r) => r.name), `${node.id} fails for`).toEqual([]);
      } else {
        expect(grade(simulate(c), node.target).passed).toBe(true);
      }
    });
  }

  it("covers every node too big to search", () => {
    for (const node of NODES.filter((n) => !SEARCHABLE(n))) {
      expect(node.reference, `${node.id} has par ${node.par} and no reference`).toBeDefined();
    }
  });
});

/* -- Challenges ---------------------------------------------------------------
   Challenges carry a reference answer rather than being brute forced. A
   five-gate answer drawn from a hundred-move palette is 10^10 circuits — that
   is a hang, not a test. The reference proves the challenge is winnable and
   proves the stated par is honest, which is what actually matters.
   ------------------------------------------------------------------------- */

function fromReference(c: Challenge): Circuit {
  const circuit = emptyCircuit(c.qubits, c.title);
  circuit.gates = c.reference.map((g, i) => ({
    id: nextGateId(),
    type: g.type,
    targets: g.targets,
    controls: g.controls ?? [],
    params: g.params ?? [],
    column: i,
  }));
  return circuit;
}

describe("every challenge has a reference answer that actually works", () => {
  for (const c of CHALLENGES) {
    it(`${c.id} — ${c.title}`, () => {
      const result = grade(simulate(fromReference(c)), c.target);
      expect(
        result.passed,
        `${c.id} "${c.title}": the reference answer scores ${result.fidelity.toFixed(4)}, ` +
          `which does not pass. Target: ${c.target.label ?? c.target.kind}.`,
      ).toBe(true);
    });
  }
});

describe("stated par is honest", () => {
  for (const c of CHALLENGES) {
    it(`${c.id} — par ${c.par}`, () => {
      expect(
        c.reference.length,
        `${c.id} claims par ${c.par} but its reference needs ${c.reference.length} gates.`,
      ).toBeLessThanOrEqual(c.par);
    });
  }
});

describe("a reference only uses gates the challenge offers", () => {
  for (const c of CHALLENGES) {
    it(`${c.id} — palette covers the answer`, () => {
      const offered = new Set(c.allowedGates);
      for (const g of c.reference) {
        expect(
          offered.has(g.type),
          `${c.id}'s reference uses ${g.type}, which is not in its palette.`,
        ).toBe(true);
      }
    });
  }
});

describe("a bug hunt starts broken", () => {
  for (const c of CHALLENGES.filter((x) => x.kind === "bughunt")) {
    it(`${c.id} — the given circuit fails`, () => {
      expect(c.starter, `${c.id} is a bug hunt with no broken circuit`).toBeDefined();

      const given = emptyCircuit(c.qubits);
      given.gates = (c.starter ?? []).map((g) => ({
        id: nextGateId(),
        type: g.type,
        targets: g.targets,
        controls: g.controls ?? [],
        params: g.params ?? [],
        column: g.column,
        ...(g.type === "measure" ? { clbit: g.targets[0] } : {}),
      }));

      // Handing someone a circuit that already passes is not a bug hunt.
      expect(
        grade(simulate(given), c.target).passed,
        `${c.id} passes as given — there is no bug to find.`,
      ).toBe(false);
    });
  }
});
