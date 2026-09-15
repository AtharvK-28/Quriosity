/**
 * Qiskit code → IR, without running Python — PRD E3-S3, in the browser.
 *
 * The TRD's answer to "write code and have the canvas follow" is to execute the
 * code in a sandbox and introspect the SDK's circuit object, and that remains
 * the only way to accept arbitrary Python. This build has no sandbox, so it
 * does the part that needs none: it reads straight-line circuit construction —
 * `QuantumCircuit(n, m)` and then one gate call per statement — which is what
 * the code panel renders and what almost every textbook snippet looks like.
 *
 * Anything that would need execution to know what it does (a loop, a function,
 * a variable angle, `compose`) is refused with the line and the construct named,
 * so the learner is never handed a circuit that differs from the code they
 * wrote. Nothing here is ever `eval`'d (PRD SEC7).
 */

import { GATES } from "../ir/gates";
import { MAX_QUBITS, type GateType } from "../ir/types";
import { ExprError, evalAngle, splitArgs } from "./expr";
import {
  LocatedError, fail, finish, positionIn, unsupportedGate,
  type DraftGate, type ParseResult,
} from "./parse";

/** Qiskit method names, aliases included. */
const METHODS: Record<string, GateType> = {
  id: "i", i: "i",
  x: "x", y: "y", z: "z", h: "h",
  s: "s", sdg: "sdg", t: "t", tdg: "tdg",
  rx: "rx", ry: "ry", rz: "rz",
  p: "p",
  cx: "cx", cnot: "cx",
  cz: "cz", swap: "swap",
  crx: "crx", cry: "cry", crz: "crz",
  ccx: "ccx", toffoli: "ccx",
};

/** Methods that describe the circuit but do not change it. */
const INERT = new Set(["draw", "depth", "size", "width", "count_ops", "num_qubits", "num_clbits", "name"]);

const CONTROL_FLOW = /^(for|while|if|elif|else|def|class|with|try|except|finally|lambda|async|await|return|yield)\b/;

interface Stmt { text: string; line: number; column: number }

/**
 * Python logical lines: comments stripped, and physical lines joined while a
 * bracket is open or a line ends in a backslash.
 */
function logicalLines(src: string): Stmt[] {
  const out: Stmt[] = [];
  const lines = src.split(/\r?\n/);
  let buf = "";
  let start: { line: number; column: number } | null = null;
  let depth = 0;

  lines.forEach((raw, i) => {
    let line = "";
    let quote: string | null = null;
    for (const ch of raw) {
      if (quote) {
        line += ch;
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === "#") break;
      if (ch === "'" || ch === '"') quote = ch;
      if ("([{".includes(ch)) depth++;
      if (")]}".includes(ch)) depth--;
      line += ch;
    }

    const continued = line.trimEnd().endsWith("\\");
    if (continued) line = line.trimEnd().slice(0, -1);

    if (!start && line.trim()) {
      start = { line: i + 1, column: line.length - line.trimStart().length + 1 };
    }
    if (start) buf += (buf ? "\n" : "") + (buf ? line : line.trimStart());

    if (depth <= 0 && !continued && start) {
      if (buf.trim()) out.push({ text: buf.trimEnd(), ...start });
      buf = "";
      start = null;
      depth = 0;
    }
  });

  if (start && buf.trim()) {
    const s = start as { line: number; column: number };
    throw new LocatedError("A bracket opened here is never closed.", s.line, s.column);
  }
  return out;
}

export function parseQiskit(src: string): ParseResult {
  try {
    return read(src);
  } catch (e) {
    return fail(e);
  }
}

function read(src: string): ParseResult {
  let circuitVar: string | null = null;
  let qubits = 0;
  let clbits = 0;
  const drafts: DraftGate[] = [];
  const notes: string[] = [];
  const constants: Record<string, number> = {
    pi: Math.PI, "np.pi": Math.PI, "numpy.pi": Math.PI, "math.pi": Math.PI,
    tau: 2 * Math.PI, "np.tau": 2 * Math.PI, "math.tau": 2 * Math.PI,
  };

  for (const st of logicalLines(src)) {
    const at = (offset = 0) => positionIn(st.text, offset, st.line, st.column);
    const err = (message: string, offset = 0): never => {
      const p = at(offset);
      throw new LocatedError(message, p.line, p.column);
    };
    const text = st.text;

    if (/^(import|from)\b/.test(text)) continue;

    if (CONTROL_FLOW.test(text)) {
      const word = CONTROL_FLOW.exec(text)![1];
      err(`\`${word}\` needs the code to run to know which gates it places, and this build reads code without running it. Write each gate call out.`);
    }

    /* -- The circuit itself ---------------------------------------------------- */

    const ctor = /^([A-Za-z_]\w*)\s*=\s*QuantumCircuit\s*\(([\s\S]*)\)\s*$/.exec(text);
    if (ctor) {
      if (circuitVar) err("Only one circuit per snippet is read. This is a second `QuantumCircuit`.");
      circuitVar = ctor[1];
      const args = splitArgs(ctor[2]);
      if (args.length === 0 || args.length > 2 || args.some((a) => !/^\d+$/.test(a.text))) {
        err("Declare the circuit with plain counts, like `QuantumCircuit(2, 2)`. Registers aren't read here.");
      }
      qubits = parseInt(args[0].text, 10);
      clbits = args[1] ? parseInt(args[1].text, 10) : qubits;
      if (qubits < 1 || qubits > MAX_QUBITS) err(`A circuit needs between 1 and ${MAX_QUBITS} qubits.`);
      continue;
    }

    if (/QuantumRegister|ClassicalRegister/.test(text)) {
      err("Registers aren't read here. Declare the circuit as `QuantumCircuit(qubits, bits)`.");
    }

    /* -- Gate calls ------------------------------------------------------------ */

    const call = circuitVar
      ? new RegExp(`^${circuitVar}\\s*\\.\\s*([A-Za-z_]\\w*)\\s*\\(([\\s\\S]*)\\)\\s*$`).exec(text)
      : null;

    if (!call) {
      if (circuitVar && new RegExp(`^${circuitVar}\\s*\\.`).test(text)) {
        err(`\`${text.split("(")[0].trim()}\` isn't a call this reader understands.`);
      }

      // A name bound to a plain angle (`theta = np.pi / 4`) can be read
      // without running anything, so later gate calls may use it.
      const binding = /^([A-Za-z_]\w*)\s*=\s*([^=][\s\S]*)$/.exec(text);
      if (binding) {
        try {
          constants[binding[1]] = evalAngle(binding[2], constants);
        } catch {
          // Not an angle — running the circuit, collecting counts. Neither
          // changes the circuit, so it is skipped.
        }
        continue;
      }
      if (/^(print|display|plot_\w+)\s*\(/.test(text)) continue;

      // Anything else is skipped and said so, rather than silently dropped.
      notes.push(`Line ${st.line} doesn't build the circuit, so it was skipped.`);
      continue;
    }

    const method = call[1];
    const argsSrc = call[2];
    const argsOffset = text.indexOf("(") + 1;
    const args = splitArgs(argsSrc);

    if (INERT.has(method)) continue;
    if (args.some((a) => /^[A-Za-z_]\w*\s*=(?!=)/.test(a.text))) {
      err(`Keyword arguments aren't read. Pass them in order, like \`${circuitVar}.rx(pi / 2, 0)\`.`);
    }

    /** An int, a list of ints, or `range(...)`. */
    const wires = (raw: string, offset: number, limit: number, kind: string): number[] => {
      const t = raw.trim();
      let values: number[];
      if (/^\d+$/.test(t)) values = [parseInt(t, 10)];
      else if (/^\[[\d\s,]*\]$/.test(t)) values = t.slice(1, -1).split(",").filter((v) => v.trim()).map((v) => parseInt(v, 10));
      else if (/^range\(\s*\d+\s*(,\s*\d+\s*)?\)$/.test(t)) {
        const [a, b] = t.slice(6, -1).split(",").map((v) => parseInt(v, 10));
        values = b === undefined ? Array.from({ length: a }, (_, i) => i) : Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
      } else {
        err(`\`${t}\` needs to be a ${kind} index written as a number.`, offset);
      }
      for (const v of values!) {
        if (v >= limit) err(`${kind} ${v} is out of range — this circuit has ${limit}.`, offset);
      }
      return values!;
    };

    if (!circuitVar) err("Declare the circuit first, like `qc = QuantumCircuit(2, 2)`.");

    if (method === "measure_all") {
      if (clbits < qubits) clbits = qubits;
      for (let q = 0; q < qubits; q++) {
        drafts.push({ type: "measure", targets: [q], controls: [], params: [], clbit: q, ...at() });
      }
      continue;
    }

    if (method === "measure") {
      if (args.length !== 2) err(`\`${circuitVar}.measure\` takes a qubit and a bit.`);
      const qs = wires(args[0].text, argsOffset + args[0].offset, qubits, "qubit");
      const cs = wires(args[1].text, argsOffset + args[1].offset, clbits, "bit");
      if (qs.length !== cs.length) err("The qubit and bit lists passed to `measure` are different lengths.");
      qs.forEach((q, i) => drafts.push({ type: "measure", targets: [q], controls: [], params: [], clbit: cs[i], ...at() }));
      continue;
    }

    if (method === "reset") {
      if (args.length !== 1) err(`\`${circuitVar}.reset\` takes one qubit.`);
      for (const q of wires(args[0].text, argsOffset + args[0].offset, qubits, "qubit")) {
        drafts.push({ type: "reset", targets: [q], controls: [], params: [], ...at() });
      }
      continue;
    }

    if (method === "barrier") {
      const span = args.length === 0
        ? Array.from({ length: qubits }, (_, i) => i)
        : args.flatMap((a) => wires(a.text, argsOffset + a.offset, qubits, "qubit"));
      drafts.push({ type: "barrier", targets: [...new Set(span)].sort((a, b) => a - b), controls: [], params: [], ...at() });
      continue;
    }

    const type = METHODS[method];
    if (!type) err(unsupportedGate(`${circuitVar}.${method}`), text.indexOf(method));
    const spec = GATES[type!];
    const arity = spec.controlArity + spec.targetArity;

    if (args.length !== spec.paramArity + arity) {
      const want = spec.paramArity > 0
        ? `${spec.paramArity} angle and ${arity} qubit${arity === 1 ? "" : "s"}`
        : `${arity} qubit${arity === 1 ? "" : "s"}`;
      err(`\`${circuitVar}.${method}\` takes ${want}, got ${args.length} argument${args.length === 1 ? "" : "s"}.`);
    }

    const params = args.slice(0, spec.paramArity).map((a) => {
      try {
        return evalAngle(a.text, constants);
      } catch (e) {
        if (e instanceof ExprError) {
          err(
            /isn't a number or a known constant/.test(e.message)
              ? `${e.message} Angles are read without running the code, so write the value itself, like \`np.pi / 4\`.`
              : e.message,
            argsOffset + a.offset + e.offset,
          );
        }
        throw e;
      }
    });

    // Qiskit takes controls first, then targets. A single-qubit gate on a list
    // or a range applies to each wire in it, which is Qiskit's behaviour too.
    const wireArgs = args.slice(spec.paramArity).map((a) => wires(a.text, argsOffset + a.offset, qubits, "qubit"));
    const width = Math.max(...wireArgs.map((w) => w.length));
    if (arity > 1 && width > 1) err(`Pass single wires to \`${circuitVar}.${method}\`, one call per gate.`);

    for (let i = 0; i < width; i++) {
      const picked = wireArgs.map((w) => (w.length === 1 ? w[0] : w[i]));
      drafts.push({
        type: type!,
        controls: picked.slice(0, spec.controlArity),
        targets: picked.slice(spec.controlArity),
        params: [...params],
        ...at(),
      });
    }
  }

  if (!circuitVar) {
    throw new LocatedError("No circuit here. Start with a line like `qc = QuantumCircuit(2, 2)`.", 1, 1);
  }
  return finish(drafts, qubits, clbits, "qiskit", notes);
}
