/**
 * The Rosetta Stone — one renderer per SDK, each a pure function IR → string.
 *
 * No renderer imports its SDK. Rendering is string generation; the SDK is only
 * needed at execution time. That is what lets the language toggle switch
 * Qiskit → Cirq → PennyLane with no server call and no perceptible delay, which
 * is the entire point of the feature (PRD E3-S2).
 *
 * Output must be executable as written. A learner who copies this into a
 * notebook gets a circuit that runs.
 */

import { GATES } from "../ir/gates";
import { inExecutionOrder } from "../ir/validate";
import { gateQubits, operativeGates, type Circuit, type Gate } from "../ir/types";

export type Sdk = "qiskit" | "cirq" | "pennylane" | "qsharp" | "qasm";

export const SDK_LABELS: Record<Sdk, string> = {
  qiskit: "Qiskit",
  cirq: "Cirq",
  pennylane: "PennyLane",
  qsharp: "Q#",
  qasm: "OpenQASM 3",
};

export const SDK_LANGUAGE: Record<Sdk, "python" | "qsharp" | "qasm"> = {
  qiskit: "python",
  cirq: "python",
  pennylane: "python",
  qsharp: "qsharp",
  qasm: "qasm",
};

export function render(circuit: Circuit, sdk: Sdk): string {
  switch (sdk) {
    case "qiskit": return renderQiskit(circuit);
    case "cirq": return renderCirq(circuit);
    case "pennylane": return renderPennyLane(circuit);
    case "qsharp": return renderQSharp(circuit);
    case "qasm": return renderQasm(circuit);
  }
}

/* -- Parameter formatting ---------------------------------------------------- */

/** π-expressions where they are clean, so code reads `np.pi/4` not `0.7853981`. */
function pyParam(theta: number, piSymbol: string): string {
  if (theta === 0) return "0";
  const ratio = theta / Math.PI;
  for (const d of [1, 2, 3, 4, 6, 8, 12, 16]) {
    const n = ratio * d;
    const r = Math.round(n);
    if (Math.abs(n - r) < 1e-9 && r !== 0) {
      const mag = Math.abs(r);
      const sign = r < 0 ? "-" : "";
      const num = mag === 1 ? piSymbol : `${mag} * ${piSymbol}`;
      return d === 1 ? `${sign}${num}` : `${sign}${num} / ${d}`;
    }
  }
  // Ten places: enough that importing this code back reproduces the circuit
  // exactly (the canonical hash rounds to nine), with trailing zeros trimmed.
  return String(Number(theta.toFixed(10)));
}

function hasParams(c: Circuit): boolean {
  return operativeGates(c).some((g) => g.params.length > 0);
}

function ops(c: Circuit): Gate[] {
  return inExecutionOrder(c.gates).filter((g) => g.type !== "barrier");
}

/** Every gate in time order, barriers included, for SDKs that can draw them. */
function withBarriers(c: Circuit): Gate[] {
  return inExecutionOrder(c.gates);
}

function measured(c: Circuit): Gate[] {
  return ops(c)
    .filter((g) => g.type === "measure")
    .sort((a, b) => (a.clbit ?? 0) - (b.clbit ?? 0));
}

/**
 * Measurements that something coherent happens after, on the same wire.
 *
 * These cannot be gathered into one read at the end: moving them changes the
 * physics (misconception M7 is exactly this). Terminal reads can, and are,
 * because that is how people write them. The rule matches the simulator's.
 */
function midCircuit(c: Circuit): Set<string> {
  const ordered = ops(c);
  const mid = new Set<string>();
  for (const g of ordered) {
    if (g.type !== "measure") continue;
    const wire = g.targets[0];
    if (ordered.some((o) => o.column > g.column && o.type !== "measure" && gateQubits(o).includes(wire))) {
      mid.add(g.id);
    }
  }
  return mid;
}

/** Barriers spell their span out wire by wire. */
function barrierWires(g: Gate): number[] {
  const lo = Math.min(...g.targets);
  const hi = Math.max(...g.targets);
  return g.targets.length > 1 ? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) : g.targets;
}

/* -- Qiskit ------------------------------------------------------------------ */

export function renderQiskit(c: Circuit): string {
  const lines: string[] = [];
  const params = hasParams(c);

  lines.push("from qiskit import QuantumCircuit");
  if (params) lines.push("import numpy as np");
  lines.push("");
  lines.push(`qc = QuantumCircuit(${c.qubits}, ${c.clbits})`);

  const measures: Gate[] = [];
  const mid = midCircuit(c);
  for (const g of withBarriers(c)) {
    if (g.type === "barrier") { lines.push(`qc.barrier(${barrierWires(g).join(", ")})`); continue; }
    if (g.type === "measure") {
      if (mid.has(g.id)) lines.push(`qc.measure(${g.targets[0]}, ${g.clbit ?? 0})`);
      else measures.push(g);
      continue;
    }
    const name = GATES[g.type].sdk.qiskit;
    const args: string[] = g.params.map((p) => pyParam(p, "np.pi"));
    // Qiskit takes controls first, then targets.
    args.push(...g.controls.map(String), ...g.targets.map(String));
    lines.push(`qc.${name}(${args.join(", ")})`);
  }

  if (measures.length > 0) {
    const qs = measures.map((g) => g.targets[0]);
    const cs = measures.map((g) => g.clbit ?? 0);
    lines.push(`qc.measure([${qs.join(", ")}], [${cs.join(", ")}])`);
  }

  lines.push("");
  lines.push("from qiskit_aer import AerSimulator");
  lines.push("result = AerSimulator().run(qc, shots=1024).result()");
  lines.push("print(result.get_counts())");
  return lines.join("\n");
}

/* -- Cirq -------------------------------------------------------------------- */

export function renderCirq(c: Circuit): string {
  const lines: string[] = [];
  const params = hasParams(c);

  lines.push("import cirq");
  if (params) lines.push("import numpy as np");
  lines.push("");
  lines.push(`q = cirq.LineQubit.range(${c.qubits})`);
  lines.push("circuit = cirq.Circuit([");

  const measures: Gate[] = [];
  const mid = midCircuit(c);
  for (const g of ops(c)) {
    if (g.type === "measure") {
      // A mid-circuit read keeps its place, under its own key.
      if (mid.has(g.id)) lines.push(`    cirq.measure(q[${g.targets[0]}], key='c${g.clbit ?? 0}'),`);
      else measures.push(g);
      continue;
    }
    lines.push(`    ${cirqOp(g)},`);
  }
  if (measures.length > 0) {
    const qs = measures.map((g) => `q[${g.targets[0]}]`).join(", ");
    lines.push(`    cirq.measure(${qs}, key='m'),`);
  }
  lines.push("])");
  lines.push("");
  lines.push("result = cirq.Simulator().run(circuit, repetitions=1024)");
  lines.push("print(result.histogram(key='m'))");
  return lines.join("\n");
}

function cirqOp(g: Gate): string {
  const q = (i: number) => `q[${i}]`;
  const p = g.params.map((v) => pyParam(v, "np.pi"));

  switch (g.type) {
    case "cx": return `cirq.CNOT(${q(g.controls[0])}, ${q(g.targets[0])})`;
    case "cz": return `cirq.CZ(${q(g.controls[0])}, ${q(g.targets[0])})`;
    case "ccx": return `cirq.TOFFOLI(${q(g.controls[0])}, ${q(g.controls[1])}, ${q(g.targets[0])})`;
    case "swap": return `cirq.SWAP(${q(g.targets[0])}, ${q(g.targets[1])})`;
    case "rx": return `cirq.rx(${p[0]})(${q(g.targets[0])})`;
    case "ry": return `cirq.ry(${p[0]})(${q(g.targets[0])})`;
    case "rz": return `cirq.rz(${p[0]})(${q(g.targets[0])})`;
    case "p": return `cirq.ZPowGate(exponent=${p[0]} / np.pi)(${q(g.targets[0])})`;
    case "sdg": return `(cirq.S ** -1)(${q(g.targets[0])})`;
    case "tdg": return `(cirq.T ** -1)(${q(g.targets[0])})`;
    case "crx": return `cirq.rx(${p[0]}).controlled()(${q(g.controls[0])}, ${q(g.targets[0])})`;
    case "cry": return `cirq.ry(${p[0]}).controlled()(${q(g.controls[0])}, ${q(g.targets[0])})`;
    case "crz": return `cirq.rz(${p[0]}).controlled()(${q(g.controls[0])}, ${q(g.targets[0])})`;
    case "reset": return `cirq.reset(${q(g.targets[0])})`;
    default: return `cirq.${GATES[g.type].sdk.cirq}(${q(g.targets[0])})`;
  }
}

/* -- PennyLane --------------------------------------------------------------- */

export function renderPennyLane(c: Circuit): string {
  const lines: string[] = [];
  const params = hasParams(c);

  lines.push("import pennylane as qml");
  if (params) lines.push("import numpy as np");
  lines.push("");
  lines.push(`dev = qml.device("default.qubit", wires=${c.qubits})`);
  lines.push("");
  lines.push("@qml.qnode(dev)");
  lines.push("def circuit():");

  let body = 0;
  const mid = midCircuit(c);
  for (const g of withBarriers(c)) {
    if (g.type === "barrier") { lines.push(`    qml.Barrier(wires=[${barrierWires(g).join(", ")}])`); continue; }
    if (g.type === "measure") {
      // Terminal reads are declared in the return. A mid-circuit one is a
      // real operation in PennyLane and has to stay where it is.
      if (mid.has(g.id)) { lines.push(`    qml.measure(${g.targets[0]})`); body += 1; }
      continue;
    }
    lines.push(`    ${pennylaneOp(g)}`);
    body += 1;
  }
  if (body === 0) lines.push("    qml.Identity(wires=0)");

  const reads = measured(c).filter((g) => !mid.has(g.id)).map((g) => g.targets[0]);
  const wires = reads.length > 0 ? reads : [...Array(c.qubits).keys()];
  lines.push(`    return qml.probs(wires=[${wires.join(", ")}])`);
  lines.push("");
  lines.push("print(circuit())");
  return lines.join("\n");
}

function pennylaneOp(g: Gate): string {
  const p = g.params.map((v) => pyParam(v, "np.pi"));
  switch (g.type) {
    case "cx": return `qml.CNOT(wires=[${g.controls[0]}, ${g.targets[0]}])`;
    case "cz": return `qml.CZ(wires=[${g.controls[0]}, ${g.targets[0]}])`;
    case "ccx": return `qml.Toffoli(wires=[${g.controls[0]}, ${g.controls[1]}, ${g.targets[0]}])`;
    case "swap": return `qml.SWAP(wires=[${g.targets[0]}, ${g.targets[1]}])`;
    case "crx": return `qml.CRX(${p[0]}, wires=[${g.controls[0]}, ${g.targets[0]}])`;
    case "cry": return `qml.CRY(${p[0]}, wires=[${g.controls[0]}, ${g.targets[0]}])`;
    case "crz": return `qml.CRZ(${p[0]}, wires=[${g.controls[0]}, ${g.targets[0]}])`;
    case "rx": return `qml.RX(${p[0]}, wires=${g.targets[0]})`;
    case "ry": return `qml.RY(${p[0]}, wires=${g.targets[0]})`;
    case "rz": return `qml.RZ(${p[0]}, wires=${g.targets[0]})`;
    case "p": return `qml.PhaseShift(${p[0]}, wires=${g.targets[0]})`;
    case "sdg": return `qml.adjoint(qml.S)(wires=${g.targets[0]})`;
    case "tdg": return `qml.adjoint(qml.T)(wires=${g.targets[0]})`;
    case "i": return `qml.Identity(wires=${g.targets[0]})`;
    case "reset": return `qml.measure(${g.targets[0]}, reset=True)`;
    default: return `qml.${GATES[g.type].sdk.pennylane}(wires=${g.targets[0]})`;
  }
}

/* -- Q# ---------------------------------------------------------------------- */

export function renderQSharp(c: Circuit): string {
  const lines: string[] = [];
  lines.push("namespace Quriosity {");
  lines.push("    open Microsoft.Quantum.Arrays;");
  lines.push("    open Microsoft.Quantum.Measurement;");
  lines.push("");
  lines.push("    operation Run() : Result[] {");
  lines.push(`        use q = Qubit[${c.qubits}];`);

  const mid = midCircuit(c);
  for (const g of ops(c)) {
    if (g.type === "measure") {
      // Terminal reads are the trailing ForEach. A mid-circuit read happens here.
      if (mid.has(g.id)) lines.push(`        let c${g.clbit ?? 0} = M(q[${g.targets[0]}]);`);
      continue;
    }
    lines.push(`        ${qsharpOp(g)}`);
  }

  lines.push("        return ForEach(MResetZ, q);");
  lines.push("    }");
  lines.push("}");
  return lines.join("\n");
}

function qsharpOp(g: Gate): string {
  const q = (i: number) => `q[${i}]`;
  const p = g.params.map((v) => pyParam(v, "PI()"));
  switch (g.type) {
    case "cx": return `CNOT(${q(g.controls[0])}, ${q(g.targets[0])});`;
    case "cz": return `CZ(${q(g.controls[0])}, ${q(g.targets[0])});`;
    case "ccx": return `CCNOT(${q(g.controls[0])}, ${q(g.controls[1])}, ${q(g.targets[0])});`;
    case "swap": return `SWAP(${q(g.targets[0])}, ${q(g.targets[1])});`;
    case "rx": return `Rx(${p[0]}, ${q(g.targets[0])});`;
    case "ry": return `Ry(${p[0]}, ${q(g.targets[0])});`;
    case "rz": return `Rz(${p[0]}, ${q(g.targets[0])});`;
    case "p": return `R1(${p[0]}, ${q(g.targets[0])});`;
    case "crx": return `Controlled Rx([${q(g.controls[0])}], (${p[0]}, ${q(g.targets[0])}));`;
    case "cry": return `Controlled Ry([${q(g.controls[0])}], (${p[0]}, ${q(g.targets[0])}));`;
    case "crz": return `Controlled Rz([${q(g.controls[0])}], (${p[0]}, ${q(g.targets[0])}));`;
    case "sdg": return `Adjoint S(${q(g.targets[0])});`;
    case "tdg": return `Adjoint T(${q(g.targets[0])});`;
    case "reset": return `Reset(${q(g.targets[0])});`;
    case "i": return `I(${q(g.targets[0])});`;
    default: return `${GATES[g.type].sdk.qsharp}(${q(g.targets[0])});`;
  }
}

/* -- OpenQASM 3 -------------------------------------------------------------- */

export function renderQasm(c: Circuit): string {
  const lines: string[] = [];
  lines.push("OPENQASM 3.0;");
  lines.push('include "stdgates.inc";');
  lines.push("");
  lines.push(`qubit[${c.qubits}] q;`);
  lines.push(`bit[${c.clbits}] c;`);
  lines.push("");

  const measures: Gate[] = [];
  const mid = midCircuit(c);
  for (const g of withBarriers(c)) {
    if (g.type === "barrier") {
      lines.push(`barrier ${barrierWires(g).map((i) => `q[${i}]`).join(", ")};`);
      continue;
    }
    if (g.type === "measure") {
      if (mid.has(g.id)) lines.push(`c[${g.clbit ?? 0}] = measure q[${g.targets[0]}];`);
      else measures.push(g);
      continue;
    }
    const name = GATES[g.type].sdk.qasm;
    const wires = gateQubits(g).map((i) => `q[${i}]`).join(", ");
    const p = g.params.length > 0 ? `(${g.params.map((v) => pyParam(v, "pi")).join(", ")})` : "";
    lines.push(`${name}${p} ${wires};`);
  }

  // A full-register read collapses to `c = measure q;`, which is how a QASM
  // author would actually write it.
  const readsEveryWire =
    measures.length === c.qubits &&
    measures.every((g, i) => g.targets[0] === i && (g.clbit ?? i) === i);

  if (readsEveryWire) {
    lines.push("c = measure q;");
  } else {
    for (const g of measures) lines.push(`c[${g.clbit ?? 0}] = measure q[${g.targets[0]}];`);
  }
  return lines.join("\n");
}

/* -- Line mapping ------------------------------------------------------------ */

/**
 * Which gate produced which line. The code panel uses this to tie a line to a
 * glyph on the canvas, so hovering a line highlights the gate and vice versa —
 * the "same circuit, two dialects, tied line by line" behaviour in the mockup.
 */
export function lineMap(circuit: Circuit, sdk: Sdk): Map<number, string> {
  const map = new Map<number, string>();
  const code = render(circuit, sdk).split("\n");
  const gates = ops(circuit).filter((g) => g.type !== "measure");

  let cursor = 0;
  for (let line = 0; line < code.length; line++) {
    const text = code[line].trim();
    if (!text || text.startsWith("#") || text.startsWith("//")) continue;
    if (cursor >= gates.length) break;

    const g = gates[cursor];
    const name = GATES[g.type].sdk[sdk === "qasm" ? "qasm" : sdk];
    if (name && text.toLowerCase().includes(name.toLowerCase().split("(")[0])) {
      map.set(line, g.id);
      cursor += 1;
    }
  }
  return map;
}
