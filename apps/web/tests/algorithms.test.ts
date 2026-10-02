/**
 * Unit 4's algorithms, checked from first principles.
 *
 * The lesson targets say what a correct circuit leaves behind; this file does
 * not trust them. It builds every function the algorithms promise to handle,
 * runs the textbook circuit through the simulator, and checks the claim each
 * lesson makes: Deutsch tells constant from balanced, Deutsch–Jozsa returns 00
 * exactly for a constant function, Bernstein–Vazirani reads out the secret.
 * Then it checks the lesson's own boxes are the functions their reveals say.
 */

import { describe, expect, it } from "vitest";
import { NODES } from "@/lib/curriculum/nodes";
import { oracleGates, oracleResults } from "@/lib/curriculum/oracle";
import { emptyCircuit, type Circuit, type Gate, type GateType } from "@/lib/ir/types";
import { qubitState } from "@/lib/sim/analysis";
import { simulate } from "@/lib/sim/statevector";

let uid = 0;
const g = (type: GateType, targets: number[], column: number, controls: number[] = []): Gate =>
  ({ id: `t${uid++}`, type, targets, controls, params: [], column });

/**
 * An oracle |x⟩|y⟩ → |x⟩|y ⊕ f(x)⟩ for an affine f(x) = s·x ⊕ c: a CNOT from
 * each input where s has a 1, and an X when c is 1. Every function these
 * algorithms are promised (constant, balanced on ≤ 2 bits, or s·x) is affine.
 */
function affineOracle(n: number, s: number, c: number, start: number): Gate[] {
  const out: Gate[] = [];
  let col = start;
  for (let w = 0; w < n; w++) if ((s >> w) & 1) out.push(g("cx", [n], col++, [w]));
  if (c) out.push(g("x", [n], col++));
  return out;
}

/** The textbook circuit: helper to |−⟩, H on every input, the oracle, H on every input. */
function algorithm(n: number, oracle: (start: number) => Gate[]): Circuit {
  const c = emptyCircuit(n + 1);
  const inputs = Array.from({ length: n }, (_, w) => w);
  const body = oracle(3);
  const end = Math.max(3, ...body.map((x) => x.column + 1));
  c.gates = [
    g("x", [n], 0),
    g("h", [n], 1),
    ...inputs.map((w) => g("h", [w], 2)),
    ...body,
    ...inputs.map((w) => g("h", [w], end)),
  ];
  return c;
}

/** P(the input wires read `value`), marginalising the helper. */
function pInputs(c: Circuit, n: number, value: number): number {
  const r = simulate(c);
  let p = 0;
  for (let k = 0; k < r.probabilities.length; k++) if ((k & ((1 << n) - 1)) === value) p += r.probabilities[k];
  return p;
}

/** f's truth table, by running the box on each basis input with the helper at 0. */
function truthTable(n: number, box: Gate[]): number[] {
  return Array.from({ length: 2 ** n }, (_, x) => {
    const c = emptyCircuit(n + 1);
    const prep = Array.from({ length: n }, (_, w) => w).filter((w) => (x >> w) & 1).map((w) => g("x", [w], 0));
    c.gates = [...prep, ...box.map((b) => ({ ...b, column: b.column + 1 }))];
    return simulate(c).probabilities[x | (1 << n)] > 0.5 ? 1 : 0;
  });
}

describe("phase kickback", () => {
  it("a CNOT onto |−⟩ turns its control from |+⟩ to |−⟩ and leaves the target in |−⟩", () => {
    const c = emptyCircuit(2);
    c.gates = [g("x", [1], 0), g("h", [1], 1), g("h", [0], 0), g("cx", [1], 2, [0])];
    const r = simulate(c);
    const control = qubitState(r.branches, 2, 0);
    const target = qubitState(r.branches, 2, 1);
    expect(control.x).toBeCloseTo(-1, 9);
    expect(target.x).toBeCloseTo(-1, 9);
    expect(control.entangled || target.entangled).toBe(false);
  });
});

describe("Deutsch", () => {
  it("reads 0 for both constant functions and 1 for both balanced ones", () => {
    for (const [s, c, constant] of [[0, 0, true], [0, 1, true], [1, 0, false], [1, 1, false]] as const) {
      const p0 = pInputs(algorithm(1, (at) => affineOracle(1, s, c, at)), 1, 0);
      expect(p0, `s=${s} c=${c}`).toBeCloseTo(constant ? 1 : 0, 9);
    }
  });
});

describe("Deutsch–Jozsa on two bits", () => {
  it("returns 00 with certainty for a constant function and never for a balanced one", () => {
    // Every 2-bit function that is constant or balanced: s = 0 is constant,
    // any other s is balanced, and c complements the output either way.
    for (let s = 0; s < 4; s++) {
      for (let c = 0; c < 2; c++) {
        const p00 = pInputs(algorithm(2, (at) => affineOracle(2, s, c, at)), 2, 0);
        expect(p00, `s=${s} c=${c}`).toBeCloseTo(s === 0 ? 1 : 0, 9);
      }
    }
  });
});

describe("Bernstein–Vazirani", () => {
  it("reads every 3-bit secret out in one query", () => {
    for (let s = 0; s < 8; s++) {
      expect(pInputs(algorithm(3, (at) => affineOracle(3, s, 0, at)), 3, s), `s=${s}`).toBeCloseTo(1, 9);
    }
  });
});

describe("the lesson's boxes are the functions they say they are", () => {
  const oracleNodes = NODES.filter((n) => n.oracle);

  it("covers the three oracle nodes", () => {
    expect(oracleNodes.map((n) => n.id)).toEqual(["u4.n2", "u4.n3", "u4.n4"]);
  });

  for (const node of oracleNodes) {
    const spec = node.oracle!;
    const n = node.qubits - 1;

    it(`${node.id}: each reveal matches the box's truth table`, () => {
      spec.variants.forEach((v, i) => {
        const table = truthTable(n, oracleGates({ ...spec, column: 0 }, i));
        const ones = table.filter(Boolean).length;
        if (v.reveal.startsWith("constant")) expect(ones === 0 || ones === table.length, v.reveal).toBe(true);
        if (v.reveal.startsWith("balanced")) expect(ones, v.reveal).toBe(table.length / 2);
        const secret = v.reveal.match(/s = ([01]+)/)?.[1];
        if (secret) {
          const s = parseInt(secret, 2);
          table.forEach((fx, x) => {
            let parity = 0;
            for (let b = s & x; b; b >>= 1) parity ^= b & 1;
            expect(fx, `${v.reveal}, x=${x}`).toBe(parity);
          });
        }
      });
    });

    it(`${node.id}: no circuit that ignores the box passes every function`, () => {
      // The lesson's helper preparation and nothing else: right for some
      // functions, wrong for others. One answer cannot fit them all.
      const c = emptyCircuit(node.qubits);
      c.gates = [g("x", [n], 0), g("h", [n], 1), ...oracleGates(spec, 0)];
      expect(oracleResults(c, spec).every((r) => r.passed)).toBe(false);
    });
  }
});
