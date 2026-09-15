/**
 * OpenQASM import — PRD E3-S4.
 *
 * Reads the subset of OpenQASM 3 (and the OpenQASM 2 spellings people still
 * paste) that maps onto the platform's gate set: register declarations, the
 * standard gates by name, measurement, reset and barrier. Round-tripping a
 * circuit through `renderQasm` and back yields the same IR, up to closing the
 * column gaps a text format cannot express.
 *
 * Everything else — gate definitions, modifiers, classical control, loops — is
 * refused with the construct named and the line it is on. Refusing loudly is
 * the requirement; a reader that skipped an `if` would hand back a circuit that
 * does something different from the one pasted in.
 */

import { GATES } from "../ir/gates";
import { MAX_QUBITS, type GateType } from "../ir/types";
import { ExprError, evalAngle, splitArgs } from "./expr";
import {
  LocatedError, fail, finish, positionIn, unsupportedGate,
  type DraftGate, type ParseResult,
} from "./parse";

/** QASM spellings, including the OpenQASM 2 and stdgates aliases. */
const NAMES: Record<string, GateType> = {
  id: "i", i: "i",
  x: "x", y: "y", z: "z", h: "h",
  s: "s", sdg: "sdg", t: "t", tdg: "tdg",
  rx: "rx", ry: "ry", rz: "rz",
  p: "p", phase: "p", u1: "p",
  cx: "cx", CX: "cx", cnot: "cx",
  cz: "cz", swap: "swap",
  crx: "crx", cry: "cry", crz: "crz",
  ccx: "ccx",
};

/** Constructs that are real QASM but outside what the platform runs. */
const REFUSED: Array<[RegExp, string]> = [
  [/^gate\b/, "Custom gate definitions aren't supported. Write the gates out by name."],
  [/^def\b|^defcal\b|^cal\b/, "Subroutines and calibrations aren't supported."],
  [/^(if|else)\b/, "Classical control (`if`) isn't supported. Every gate here runs unconditionally."],
  [/^(for|while)\b/, "Loops aren't supported. Write each gate out."],
  [/^(input|output|const|let|float|int|uint|angle|bool|complex|duration|stretch)\b/, "Classical variables aren't supported. Put the angle straight into the gate."],
  [/^(box|delay)\b/, "Timing instructions (`box`, `delay`) aren't supported."],
  [/^(opaque)\b/, "Opaque gates aren't supported."],
];

interface Register { offset: number; size: number }

interface Statement {
  text: string;
  line: number;
  column: number;
}

/** Comments out, line numbers kept: every stripped character becomes a space. */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("//", i)) {
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
    } else if (src.startsWith("/*", i)) {
      while (i < src.length && !src.startsWith("*/", i)) { out += src[i] === "\n" ? "\n" : " "; i++; }
      out += "  ";
      i += 2;
    } else {
      out += src[i++];
    }
  }
  return out;
}

function statements(src: string): Statement[] {
  const clean = stripComments(src);
  const out: Statement[] = [];
  let line = 1;
  let column = 1;
  let buf = "";
  let start: { line: number; column: number } | null = null;
  // A `{ … }` block is one statement, whatever semicolons it holds, so a gate
  // definition or a loop is refused as itself rather than as broken fragments.
  let depth = 0;

  const emit = () => {
    if (buf.trim() && start) out.push({ text: buf.trim(), ...start });
    buf = "";
    start = null;
  };

  for (const ch of clean) {
    if (ch === ";" && depth === 0) {
      emit();
    } else {
      if (!start && !/\s/.test(ch)) start = { line, column };
      if (start) buf += ch;
      if (ch === "{") depth += 1;
      if (ch === "}" && depth > 0 && --depth === 0) emit();
    }
    if (ch === "\n") { line += 1; column = 1; } else { column += 1; }
  }

  if (buf.trim() && start) {
    throw new LocatedError("This statement is missing its closing `;`.", start.line, start.column);
  }
  return out;
}

export function parseQasm(src: string): ParseResult {
  try {
    return read(src);
  } catch (e) {
    return fail(e);
  }
}

function read(src: string): ParseResult {
  const qreg = new Map<string, Register>();
  const creg = new Map<string, Register>();
  let qubits = 0;
  let clbits = 0;
  const drafts: DraftGate[] = [];

  const stmts = statements(src);
  if (stmts.length === 0) throw new LocatedError("There's nothing here to import.", 1, 1);

  for (const st of stmts) {
    const at = (offset = 0) => positionIn(st.text, offset, st.line, st.column);
    const err = (message: string, offset = 0): never => {
      const p = at(offset);
      throw new LocatedError(message, p.line, p.column);
    };
    const text = st.text.replace(/\s+/g, " ");

    if (/^OPENQASM\b/.test(text)) {
      if (!/^OPENQASM [23](\.\d+)?$/.test(text)) err("Only OpenQASM 2 and 3 are read here.");
      continue;
    }

    if (/^include\b/.test(text)) {
      const file = /^include "([^"]+)"$/.exec(text)?.[1];
      if (file !== "stdgates.inc" && file !== "qelib1.inc") {
        err(`Only the standard gate library can be included, not "${file ?? text}".`);
      }
      continue;
    }

    for (const [pattern, message] of REFUSED) {
      if (pattern.test(text)) err(message);
    }
    if (text.includes("@")) {
      err("Gate modifiers (`ctrl @`, `inv @`, `pow @`) aren't supported. Use the controlled gate by name, such as `cx`.");
    }

    /* -- Declarations -------------------------------------------------------- */

    const qdecl = /^qubit(?:\[(\d+)\])? ([A-Za-z_]\w*)$/.exec(text) ?? swap(/^qreg ([A-Za-z_]\w*)\[(\d+)\]$/.exec(text));
    if (qdecl) {
      const [, sizeRaw, name] = qdecl;
      const size = sizeRaw === undefined ? 1 : parseInt(sizeRaw, 10);
      if (qreg.has(name) || creg.has(name)) err(`\`${name}\` is declared twice.`);
      if (size < 1) err(`\`${name}\` needs at least one qubit.`);
      if (qubits + size > MAX_QUBITS) err(`That makes ${qubits + size} qubits. The limit is ${MAX_QUBITS}.`);
      qreg.set(name, { offset: qubits, size });
      qubits += size;
      continue;
    }

    const cdecl = /^bit(?:\[(\d+)\])? ([A-Za-z_]\w*)$/.exec(text) ?? swap(/^creg ([A-Za-z_]\w*)\[(\d+)\]$/.exec(text));
    if (cdecl) {
      const [, sizeRaw, name] = cdecl;
      const size = sizeRaw === undefined ? 1 : parseInt(sizeRaw, 10);
      if (qreg.has(name) || creg.has(name)) err(`\`${name}\` is declared twice.`);
      creg.set(name, { offset: clbits, size });
      clbits += size;
      continue;
    }

    /* -- Operands ------------------------------------------------------------ */

    /** `q[2]` → [2 + offset]; `q` → the whole register. */
    function operand(raw: string, offset: number, registers: Map<string, Register>, kind: string): number[] {
      const m = /^([A-Za-z_]\w*)(?:\s*\[\s*(\d+)\s*\])?$/.exec(raw.trim());
      if (!m) err(`\`${raw.trim()}\` isn't a ${kind} reference.`, offset);
      const [, name, indexRaw] = m!;
      const reg = registers.get(name);
      if (!reg) err(`\`${name}\` isn't a declared ${kind} register.`, offset);
      if (indexRaw === undefined) return Array.from({ length: reg!.size }, (_, i) => reg!.offset + i);
      const index = parseInt(indexRaw, 10);
      if (index >= reg!.size) err(`\`${name}[${index}]\` is out of range — \`${name}\` has ${reg!.size}.`, offset);
      return [reg!.offset + index];
    }

    /* -- Measurement --------------------------------------------------------- */

    const assign = /^(.+?) ?= ?measure (.+)$/.exec(text);
    const arrow = /^measure (.+?) ?-> ?(.+)$/.exec(text);
    if (assign || arrow) {
      const [bitsRaw, qubitsRaw] = assign ? [assign[1], assign[2]] : [arrow![2], arrow![1]];
      const qs = operand(qubitsRaw, 0, qreg, "qubit");
      const cs = operand(bitsRaw, 0, creg, "bit");
      if (qs.length !== cs.length) {
        err(`Measuring ${qs.length} qubit${qs.length === 1 ? "" : "s"} into ${cs.length} bit${cs.length === 1 ? "" : "s"} doesn't line up.`);
      }
      qs.forEach((q, i) => drafts.push({ type: "measure", targets: [q], controls: [], params: [], clbit: cs[i], ...at() }));
      continue;
    }
    if (/^measure\b/.test(text)) err("A measurement needs somewhere to go, like `c[0] = measure q[0];`.");

    /* -- Gate application ---------------------------------------------------- */

    const head = /^([A-Za-z_]\w*)/.exec(st.text);
    if (!head) err(`\`${text}\` isn't a statement this reader understands.`);
    const name = head![1];
    let rest = st.text.slice(name.length);
    let restOffset = name.length;

    let paramsRaw: string | null = null;
    const leading = rest.length - rest.trimStart().length;
    if (rest.trimStart().startsWith("(")) {
      const open = leading;
      let depth = 0;
      let close = -1;
      for (let i = open; i < rest.length; i++) {
        if (rest[i] === "(") depth++;
        else if (rest[i] === ")" && --depth === 0) { close = i; break; }
      }
      if (close < 0) err("A bracket in this statement is never closed.", restOffset + open);
      paramsRaw = rest.slice(open + 1, close);
      rest = rest.slice(close + 1);
      restOffset += close + 1;
    }

    const operands = splitArgs(rest);

    if (name === "reset") {
      if (operands.length === 0) err("`reset` needs a qubit.");
      for (const o of operands) {
        for (const q of operand(o.text, restOffset + o.offset, qreg, "qubit")) {
          drafts.push({ type: "reset", targets: [q], controls: [], params: [], ...at() });
        }
      }
      continue;
    }

    if (name === "barrier") {
      const wires = operands.length === 0
        ? Array.from({ length: qubits }, (_, i) => i)
        : operands.flatMap((o) => operand(o.text, restOffset + o.offset, qreg, "qubit"));
      if (wires.length === 0) err("`barrier` needs at least one qubit.");
      drafts.push({ type: "barrier", targets: [...new Set(wires)].sort((a, b) => a - b), controls: [], params: [], ...at() });
      continue;
    }

    const type = NAMES[name] ?? NAMES[name.toLowerCase()];
    if (!type) err(unsupportedGate(name));
    const spec = GATES[type!];

    const params: number[] = [];
    const paramArgs = paramsRaw === null ? [] : splitArgs(paramsRaw);
    if (paramArgs.length !== spec.paramArity) {
      err(`\`${name}\` takes ${spec.paramArity} angle${spec.paramArity === 1 ? "" : "s"}, got ${paramArgs.length}.`);
    }
    for (const a of paramArgs) {
      try {
        params.push(evalAngle(a.text));
      } catch (e) {
        if (e instanceof ExprError) err(e.message, name.length + leading + 1 + a.offset + e.offset);
        throw e;
      }
    }

    const arity = spec.controlArity + spec.targetArity;
    const resolved = operands.map((o) => operand(o.text, restOffset + o.offset, qreg, "qubit"));
    if (resolved.length !== arity) {
      err(`\`${name}\` acts on ${arity} qubit${arity === 1 ? "" : "s"}, got ${resolved.length}.`);
    }

    // A one-qubit gate on a whole register applies to every wire in it. For
    // multi-qubit gates, OpenQASM broadcasts element-wise over equal-length
    // registers; mixed single wires repeat.
    const width = Math.max(...resolved.map((r) => r.length));
    if (resolved.some((r) => r.length !== 1 && r.length !== width)) {
      err(`The registers passed to \`${name}\` have different sizes.`);
    }
    for (let i = 0; i < width; i++) {
      const wires = resolved.map((r) => (r.length === 1 ? r[0] : r[i]));
      drafts.push({
        type: type!,
        controls: wires.slice(0, spec.controlArity),
        targets: wires.slice(spec.controlArity),
        params: [...params],
        ...at(),
      });
    }
  }

  if (qubits === 0) throw new LocatedError("No qubits are declared. Add a line like `qubit[2] q;`.", 1, 1);

  // A program with no bit register still needs classical bits in the IR; the
  // IR's own default is one per qubit.
  return finish(drafts, qubits, clbits || qubits, "qasm");
}

/** `qreg q[2]` captures (name, size); reorder to match `qubit[2] q`. */
function swap(m: RegExpExecArray | null): RegExpExecArray | null {
  if (!m) return null;
  const out = [m[0], m[2], m[1]] as unknown as RegExpExecArray;
  return out;
}
