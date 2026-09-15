/**
 * Angle expressions, evaluated without eval.
 *
 * PRD SEC7: code is never `eval`'d in the browser. Imported QASM and pasted
 * Qiskit both carry parameters like `np.pi / 4` or `-3*pi/2`, so this is a tiny
 * recursive-descent reader over numbers, a fixed set of named constants, the
 * four operators, powers and parentheses — and nothing else. A name that is
 * not a known constant is an error that says which name, not a guess.
 */

export class ExprError extends Error {
  constructor(message: string, readonly offset: number) {
    super(message);
    this.name = "ExprError";
  }
}

type Token =
  | { kind: "num"; value: number; at: number }
  | { kind: "name"; value: string; at: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/" | "**" | "(" | ")"; at: number };

/** Constants every supported dialect spells `pi` one way or another. */
const DEFAULT_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  "π": Math.PI,
  tau: 2 * Math.PI,
  "τ": 2 * Math.PI,
  "np.pi": Math.PI,
  "numpy.pi": Math.PI,
  "math.pi": Math.PI,
  "np.tau": 2 * Math.PI,
  "math.tau": 2 * Math.PI,
};

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }

    const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) {
      out.push({ kind: "num", value: parseFloat(num[0]), at: i });
      i += num[0].length;
      continue;
    }

    const name = /^[A-Za-z_πτ][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(src.slice(i));
    if (name) {
      out.push({ kind: "name", value: name[0], at: i });
      i += name[0].length;
      continue;
    }

    if (src.startsWith("**", i)) {
      out.push({ kind: "op", value: "**", at: i });
      i += 2;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      out.push({ kind: "op", value: ch as "+", at: i });
      i += 1;
      continue;
    }
    throw new ExprError(`"${ch}" can't appear in an angle.`, i);
  }
  return out;
}

/**
 * Evaluates an angle expression. Throws ExprError naming the offending token.
 *
 *   expr   := term (("+" | "-") term)*
 *   term   := unary (("*" | "/") unary)*
 *   unary  := ("+" | "-") unary | power
 *   power  := atom ("**" unary)?
 *   atom   := number | constant | "(" expr ")"
 */
export function evalAngle(src: string, constants: Record<string, number> = DEFAULT_CONSTANTS): number {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = () => tokens[pos];
  const isOp = (v: string) => {
    const t = peek();
    return t?.kind === "op" && t.value === v;
  };

  function expr(): number {
    let v = term();
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].value;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  function term(): number {
    let v = unary();
    while (isOp("*") || isOp("/")) {
      const t = tokens[pos++];
      const r = unary();
      if (t.value === "/" && r === 0) throw new ExprError("Division by zero in an angle.", t.at);
      v = t.value === "*" ? v * r : v / r;
    }
    return v;
  }

  function unary(): number {
    if (isOp("-")) { pos++; return -unary(); }
    if (isOp("+")) { pos++; return unary(); }
    return power();
  }

  function power(): number {
    const base = atom();
    if (isOp("**")) {
      pos++;
      return base ** unary();
    }
    return base;
  }

  function atom(): number {
    const t = peek();
    if (!t) throw new ExprError("The angle ends too early.", src.length);
    if (t.kind === "num") { pos++; return t.value; }
    if (t.kind === "name") {
      pos++;
      if (!(t.value in constants)) {
        throw new ExprError(`"${t.value}" isn't a number or a known constant.`, t.at);
      }
      return constants[t.value];
    }
    if (t.value === "(") {
      pos++;
      const v = expr();
      if (!isOp(")")) throw new ExprError("A bracket in this angle is never closed.", t.at);
      pos++;
      return v;
    }
    throw new ExprError(`"${t.value}" is out of place in this angle.`, t.at);
  }

  if (tokens.length === 0) throw new ExprError("The angle is empty.", 0);
  const value = expr();
  if (pos < tokens.length) {
    const t = tokens[pos];
    throw new ExprError(`Unexpected "${t.value}" in this angle.`, t.at);
  }
  if (!Number.isFinite(value)) throw new ExprError("That angle isn't a finite number.", 0);
  return value;
}

/**
 * Splits on top-level commas, so `rx(pi/2, 0)` gives two arguments and
 * `f(a, (b, c))` does not split inside the brackets. Offsets are kept so an
 * error can point at the exact argument.
 */
export function splitArgs(src: string): Array<{ text: string; offset: number }> {
  const out: Array<{ text: string; offset: number }> = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= src.length; i++) {
    const ch = src[i];
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    if ((ch === "," && depth === 0) || i === src.length) {
      const raw = src.slice(start, i);
      const lead = raw.length - raw.trimStart().length;
      if (raw.trim()) out.push({ text: raw.trim(), offset: start + lead });
      start = i + 1;
    }
  }
  return out;
}
