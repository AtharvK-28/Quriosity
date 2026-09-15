/**
 * Circuits in and out of text — PRD E3-S3, E3-S4, E3-S5, E11-S2.
 *
 * The contract for every reader: a supported circuit comes back as the same
 * IR (up to closing column gaps a text format cannot hold), and anything
 * unsupported comes back as ONE error with a line, a column and the construct
 * named. A reader that silently skipped a statement would hand the learner a
 * different circuit from the one they wrote, which is worse than refusing.
 */

import { describe, expect, it } from "vitest";
import { emptyCircuit, nextGateId, type Circuit, type Gate, type GateType } from "@/lib/ir/types";
import { canonicalJson } from "@/lib/ir/hash";
import { compactColumns, layoutInOrder } from "@/lib/ir/layout";
import { validate } from "@/lib/ir/validate";
import { renderQasm, renderQiskit } from "@/lib/render";
import { parseQasm } from "@/lib/io/qasm";
import { parseQiskit } from "@/lib/io/qiskit";
import { evalAngle, ExprError } from "@/lib/io/expr";
import { toNotebook } from "@/lib/io/notebook";
import { decodeCircuit, encodeCircuit } from "@/lib/io/share";
import { simulate } from "@/lib/sim/statevector";
import { CHALLENGES } from "@/lib/curriculum/challenges";

function circuit(qubits: number, gates: Array<Partial<Gate> & { type: GateType }>, clbits = qubits): Circuit {
  const c = emptyCircuit(qubits);
  c.clbits = clbits;
  c.gates = gates.map((g, i) => ({
    id: nextGateId(),
    type: g.type,
    targets: g.targets ?? [0],
    controls: g.controls ?? [],
    params: g.params ?? [],
    column: g.column ?? i,
    ...(g.type === "measure" ? { clbit: g.clbit ?? g.targets?.[0] ?? 0 } : {}),
  }));
  return c;
}

/** The fixtures every reader is round-tripped over. */
const FIXTURES: Array<[string, Circuit]> = [
  ["empty", circuit(2, [])],
  ["bell", circuit(2, [{ type: "h" }, { type: "cx", controls: [0], targets: [1] }])],
  ["bell measured", circuit(2, [
    { type: "h" }, { type: "cx", controls: [0], targets: [1] },
    { type: "measure", targets: [0] }, { type: "measure", targets: [1], column: 2 },
  ])],
  ["ghz with a gap", circuit(3, [
    { type: "h", column: 0 },
    { type: "cx", controls: [0], targets: [1], column: 3 },
    { type: "cx", controls: [1], targets: [2], column: 7 },
  ])],
  ["every one-qubit gate", circuit(1, (["i", "x", "y", "z", "h", "s", "sdg", "t", "tdg"] as GateType[]).map((type) => ({ type })))],
  ["angles", circuit(2, [
    { type: "rx", params: [Math.PI / 4] },
    { type: "ry", params: [2 * Math.acos(1 / Math.sqrt(3))] },
    { type: "rz", params: [-3 * Math.PI / 2], targets: [1], column: 0 },
    { type: "p", params: [0.123456789], targets: [1], column: 1 },
    { type: "crx", params: [Math.PI], controls: [0], targets: [1] },
    { type: "cry", params: [Math.PI / 3], controls: [1], targets: [0] },
    { type: "crz", params: [Math.PI / 8], controls: [0], targets: [1] },
  ])],
  ["two-qubit and toffoli", circuit(3, [
    { type: "cz", controls: [2], targets: [0] },
    { type: "swap", targets: [0, 2] },
    { type: "ccx", controls: [0, 1], targets: [2] },
  ])],
  ["mid-circuit measurement, reset and barrier", circuit(2, [
    { type: "h" },
    { type: "measure", targets: [0] },
    { type: "barrier", targets: [0, 1] },
    { type: "reset", targets: [0] },
    { type: "h" },
    { type: "measure", targets: [0], clbit: 1 },
  ])],
  ...CHALLENGES.map((ch): [string, Circuit] => [
    `challenge ${ch.id}`,
    circuit(ch.qubits, ch.reference.map((g) => ({ ...g }))),
  ]),
];

function same(a: Circuit, b: Circuit) {
  expect(canonicalJson(b)).toBe(canonicalJson(compactColumns(a)));
}

describe("column layout", () => {
  it("closes gaps without reordering anything on a wire", () => {
    const c = FIXTURES.find(([n]) => n === "ghz with a gap")![1];
    expect(compactColumns(c).gates.map((g) => g.column)).toEqual([0, 1, 2]);
  });

  it("lets gates on disjoint wires share a column", () => {
    const gates = layoutInOrder(circuit(2, [{ type: "h", targets: [0] }, { type: "h", targets: [1] }]).gates);
    expect(gates.map((g) => g.column)).toEqual([0, 0]);
  });

  it("gives a barrier its whole span", () => {
    const gates = layoutInOrder(circuit(3, [
      { type: "barrier", targets: [0, 2] },
      { type: "x", targets: [1] },
    ]).gates);
    expect(gates[1].column).toBe(1);
  });

  it("never changes the state", () => {
    for (const [name, c] of FIXTURES) {
      expect(Array.from(simulate(compactColumns(c)).probabilities), name).toEqual(Array.from(simulate(c).probabilities));
    }
  });
});

describe("angle expressions", () => {
  it("reads the spellings the SDKs emit", () => {
    expect(evalAngle("pi / 4")).toBeCloseTo(Math.PI / 4, 12);
    expect(evalAngle("-3 * np.pi / 2")).toBeCloseTo(-1.5 * Math.PI, 12);
    expect(evalAngle("2*(pi/8)")).toBeCloseTo(Math.PI / 4, 12);
    expect(evalAngle("1.5e-1")).toBeCloseTo(0.15, 12);
    expect(evalAngle("π")).toBeCloseTo(Math.PI, 12);
    expect(evalAngle("2**3")).toBe(8);
  });

  it("refuses names it does not know, and says which", () => {
    expect(() => evalAngle("theta / 2")).toThrow(/"theta"/);
    expect(() => evalAngle("__import__")).toThrow(ExprError);
    expect(() => evalAngle("pi / 0")).toThrow(/zero/);
    expect(() => evalAngle("(pi")).toThrow(/never closed/);
  });
});

describe("OpenQASM round trip — E3-S4", () => {
  for (const [name, c] of FIXTURES) {
    it(`${name} comes back as the same IR`, () => {
      const r = parseQasm(renderQasm(c));
      if (!r.ok) throw new Error(`${r.error.line}:${r.error.column} ${r.error.message}\n${renderQasm(c)}`);
      same(c, r.circuit);
      expect(r.circuit.metadata.sdk_origin).toBe("qasm");
    });
  }

  it("reads OpenQASM 2 spellings", () => {
    const r = parseQasm(`
      OPENQASM 2.0;
      include "qelib1.inc";
      qreg q[2];
      creg c[2];
      h q[0];
      CX q[0], q[1];
      u1(pi/2) q[1];
      measure q -> c;
    `);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.circuit.gates.map((g) => g.type)).toEqual(["h", "cx", "p", "measure", "measure"]);
  });

  it("broadcasts a one-qubit gate over a register", () => {
    const r = parseQasm("OPENQASM 3.0; qubit[3] q; h q;");
    expect(r.ok && r.circuit.gates.map((g) => g.targets[0])).toEqual([0, 1, 2]);
  });

  it("flattens several registers into one index space", () => {
    const r = parseQasm("OPENQASM 3.0; qubit[2] a; qubit b; cx a[1], b;");
    expect(r.ok && r.circuit.qubits).toBe(3);
    expect(r.ok && r.circuit.gates[0]).toMatchObject({ controls: [1], targets: [2] });
  });

  const refusals: Array<[string, string, RegExp, number]> = [
    ["an unsupported gate", 'OPENQASM 3.0;\nqubit[1] q;\nsx q[0];', /`sx` isn't in the supported gate set/, 3],
    ["a gate definition", "OPENQASM 3.0;\nqubit[1] q;\ngate foo a { h a; }", /Custom gate definitions/, 3],
    ["classical control", "OPENQASM 3.0;\nqubit[1] q;\nbit c;\nif (c) x q[0];", /Classical control/, 4],
    ["a modifier", "OPENQASM 3.0;\nqubit[2] q;\nctrl @ x q[0], q[1];", /modifiers/, 3],
    ["a loop", "OPENQASM 3.0;\nqubit[2] q;\n\nfor int i in [0:1] { h q[i]; }", /Loops/, 4],
    ["an undeclared register", "OPENQASM 3.0;\nqubit[1] q;\nh r[0];", /`r` isn't a declared qubit register/, 3],
    ["an index out of range", "OPENQASM 3.0;\nqubit[2] q;\nx q[2];", /out of range/, 3],
    ["a wrong argument count", "OPENQASM 3.0;\nqubit[2] q;\ncx q[0];", /acts on 2 qubits, got 1/, 3],
    ["a bad angle", "OPENQASM 3.0;\nqubit[1] q;\nrx(theta) q[0];", /"theta"/, 3],
    ["a missing semicolon", "OPENQASM 3.0;\nqubit[1] q;\nh q[0]", /missing its closing/, 3],
    ["no qubits", "OPENQASM 3.0;", /No qubits/, 1],
    ["a control on its own target", "OPENQASM 3.0;\nqubit[2] q;\ncx q[1], q[1];", /both control and target/, 3],
  ];

  for (const [what, src, message, line] of refusals) {
    it(`refuses ${what}, with the line`, () => {
      const r = parseQasm(src);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.message).toMatch(message);
      expect(r.error.line).toBe(line);
      expect(r.error.column).toBeGreaterThan(0);
    });
  }

  it("points the column at the argument that is wrong", () => {
    const r = parseQasm("OPENQASM 3.0;\nqubit[2] q;\ncx q[0], q[5];");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.column).toBe(10);
  });

  it("ignores comments without losing line numbers", () => {
    const r = parseQasm("OPENQASM 3.0; // header\n/* a\nblock */ qubit[1] q;\n// nothing\nfoo q[0];");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.line).toBe(5);
  });
});

describe("Qiskit code → IR — E3-S3", () => {
  for (const [name, c] of FIXTURES) {
    it(`${name} comes back as the same IR`, () => {
      const r = parseQiskit(renderQiskit(c));
      if (!r.ok) throw new Error(`${r.error.line}:${r.error.column} ${r.error.message}\n${renderQiskit(c)}`);
      same(c, r.circuit);
      expect(r.notes).toEqual([]);
    });
  }

  it("reads hand-written textbook code", () => {
    const r = parseQiskit(`
from qiskit import QuantumCircuit
from math import pi

theta = pi / 3
circuit = QuantumCircuit(3)
circuit.h(0)
circuit.cnot(0, 1)   # same as cx
circuit.ry(theta, 2)
circuit.toffoli(0, 1, 2)
circuit.barrier()
circuit.measure_all()
circuit.draw("mpl")
`);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.circuit.gates.map((g) => g.type)).toEqual(["h", "cx", "ry", "ccx", "barrier", "measure", "measure", "measure"]);
    expect(r.circuit.gates[2].params[0]).toBeCloseTo(Math.PI / 3, 12);
    expect(validate(r.circuit).valid).toBe(true);
  });

  it("applies a one-qubit gate across a list or a range", () => {
    const r = parseQiskit("qc = QuantumCircuit(3, 3)\nqc.h(range(3))\nqc.x([0, 2])");
    expect(r.ok && r.circuit.gates.map((g) => `${g.type}${g.targets[0]}`)).toEqual(["h0", "h1", "h2", "x0", "x2"]);
  });

  it("joins a call split across lines", () => {
    const r = parseQiskit("qc = QuantumCircuit(2)\nqc.cx(\n    0,\n    1,\n)");
    expect(r.ok && r.circuit.gates[0]).toMatchObject({ type: "cx", controls: [0], targets: [1] });
  });

  const refusals: Array<[string, string, RegExp, number]> = [
    ["a loop", "qc = QuantumCircuit(2)\nfor q in range(2):\n    qc.h(q)", /`for` needs the code to run/, 2],
    ["a function", "def bell(qc):\n    qc.h(0)", /`def`/, 1],
    ["an unsupported gate", "qc = QuantumCircuit(1)\nqc.sx(0)", /`qc\.sx` isn't in the supported gate set/, 2],
    ["compose", "qc = QuantumCircuit(1)\nqc.compose(other)", /`qc\.compose` isn't in the supported gate set/, 2],
    ["an unknown angle", "qc = QuantumCircuit(1)\nqc.rx(theta, 0)", /"theta".*without running/, 2],
    ["registers", "q = QuantumRegister(2)\nqc = QuantumCircuit(q)", /Registers aren't read/, 1],
    ["a gate before the circuit", "qc.h(0)", /No circuit here/, 1],
    ["an index out of range", "qc = QuantumCircuit(2)\nqc.x(2)", /out of range/, 2],
    ["keyword arguments", "qc = QuantumCircuit(1)\nqc.rx(theta=1, qubit=0)", /Keyword arguments/, 2],
    ["an unclosed bracket", "qc = QuantumCircuit(1)\nqc.h(0", /never closed/, 2],
    ["a second circuit", "a = QuantumCircuit(1)\nb = QuantumCircuit(1)", /Only one circuit/, 2],
  ];

  for (const [what, src, message, line] of refusals) {
    it(`refuses ${what}, with the line`, () => {
      const r = parseQiskit(src);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.message).toMatch(message);
      expect(r.error.line).toBe(line);
    });
  }

  it("says so when it skips a line that does not build the circuit", () => {
    const r = parseQiskit("qc = QuantumCircuit(1)\nqc.h(0)\nsomething_else()");
    expect(r.ok && r.notes).toEqual(["Line 3 doesn't build the circuit, so it was skipped."]);
  });
});

describe("mid-circuit measurement in rendered code", () => {
  const c = FIXTURES.find(([n]) => n === "mid-circuit measurement, reset and barrier")![1];

  it("keeps a mid-circuit read where it happens in every SDK", () => {
    const qiskit = renderQiskit(c).split("\n");
    expect(qiskit.indexOf("qc.measure(0, 0)")).toBeLessThan(qiskit.indexOf("qc.reset(0)"));
    const qasm = renderQasm(c).split("\n");
    expect(qasm.indexOf("c[0] = measure q[0];")).toBeLessThan(qasm.indexOf("reset q[0];"));
  });
});

describe("Jupyter export — E3-S5", () => {
  it("is a valid nbformat 4 notebook whose code is the rendered Qiskit", () => {
    const c = FIXTURES.find(([n]) => n === "bell measured")![1];
    c.metadata.name = "Bell pair";
    const nb = JSON.parse(toNotebook(c, { shots: 2048 }));

    expect(nb.nbformat).toBe(4);
    expect(nb.metadata.kernelspec.language).toBe("python");
    const code = nb.cells.filter((x: { cell_type: string }) => x.cell_type === "code").map((x: { source: string[] }) => x.source.join(""));
    expect(code).toHaveLength(4);
    expect(code[0]).toMatch(/from qiskit import QuantumCircuit/);
    expect(code[0]).toMatch(/from qiskit_aer import AerSimulator/);
    expect(code[1]).toMatch(/qc = QuantumCircuit\(2, 2\)\nqc\.h\(0\)\nqc\.cx\(0, 1\)/);
    expect(code[2]).toMatch(/shots=2048/);
    expect(code[3]).toMatch(/plot_histogram\(counts\)/);
    expect(nb.cells[0].source.join("")).toMatch(/# Bell pair/);

    // The construction cell reads back as the same circuit.
    const back = parseQiskit(code.join("\n"));
    if (!back.ok) throw new Error(back.error.message);
    same(c, back.circuit);
  });
});

describe("share links — E11-S2", () => {
  for (const [name, c] of FIXTURES) {
    it(`${name} survives a link exactly, columns included`, () => {
      const code = encodeCircuit(c);
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      const back = decodeCircuit(code);
      expect(back).not.toBeNull();
      expect(canonicalJson(back!)).toBe(canonicalJson(c));
    });
  }

  it("keeps the circuit's name", () => {
    const c = circuit(1, [{ type: "h" }]);
    c.metadata.name = "Qubit on the fence — ½";
    expect(decodeCircuit(encodeCircuit(c))!.metadata.name).toBe("Qubit on the fence — ½");
  });

  it("rejects damaged, oversized and invalid links whole", () => {
    const good = encodeCircuit(circuit(2, [{ type: "h" }]));
    expect(decodeCircuit(good.slice(0, -4))).toBeNull();
    expect(decodeCircuit("not a link!")).toBeNull();
    expect(decodeCircuit("A".repeat(70_000))).toBeNull();

    // Well-formed, but the gate points at a wire that does not exist.
    const bad = circuit(2, [{ type: "x" }]);
    bad.gates[0].targets = [5];
    expect(decodeCircuit(encodeCircuit(bad))).toBeNull();

    // Well-formed JSON that is not a circuit.
    const junk = btoa(JSON.stringify({ f: 1, q: 2, c: 2, g: [["eval", [0], [], [], 0]] })).replace(/=+$/, "");
    expect(decodeCircuit(junk)).toBeNull();
  });
});
