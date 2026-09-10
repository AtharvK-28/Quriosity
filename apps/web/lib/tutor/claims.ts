/**
 * The claim check — PRD E7-S8, TRD §11.3 G1 and G2.
 *
 * Every sentence the model writes is read for claims about the learner's
 * current circuit — how often an outcome comes up, or where a gate sits — and
 * each claim is compared with the simulation and the IR before the sentence
 * is shown. One contradiction withdraws the whole answer and the route shows
 * the rule engine's reading instead: a tutor that is usually right about the
 * thing on screen teaches the learner to distrust the screen.
 *
 * Reading intent from prose is heuristic, so the check leans one way. A
 * clause it cannot place — a general fact, a hypothetical, the target — goes
 * through unchecked rather than being suppressed. It acts only on clauses
 * that say they are about this circuit ("your circuit", "right now", "you
 * get"). The numbers the model is meant to use arrive as [[p:BITS]]
 * placeholders filled from the simulator, so this is the backstop, not the
 * main defence.
 */

import type { GateType } from "@/lib/ir/types";
import type { CircuitContext } from "./context";

export interface Contradiction {
  /** The words that made the claim. */
  claim: string;
  /** What the simulator or the circuit says instead. */
  actual: string;
}

type Truth = Pick<CircuitContext, "width" | "probabilities" | "gates" | "hasCircuit">;

/* -- Placeholders ------------------------------------------------------------ */

const PLACEHOLDER = /\[\[\s*p\s*:\s*\|?([01]+)\s*(?:⟩|>)?\s*\]\]/g;

export function formatProbability(p: number): string {
  if (p >= 0.9995) return "100%";
  if (p < 0.0005) return "0%";
  const pct = p * 100;
  return Math.abs(pct - Math.round(pct)) < 0.05 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
}

/** [[p:BITS]] → the simulated probability of that outcome, or "—" if there is none. */
export function fillPlaceholders(text: string, truth: Pick<Truth, "width" | "probabilities">): string {
  return text.replace(PLACEHOLDER, (_m, bits: string) =>
    truth.probabilities && bits.length === truth.width
      ? formatProbability(truth.probabilities[bits] ?? 0)
      : "—",
  );
}

/* -- Scope: is this clause about the circuit on screen? ---------------------- */

type Scope = "current" | "hypothetical" | "none";

// Models write both apostrophes; "you’d" must read the same as "you'd".
const HYPOTHETICAL =
  /\b(?:if|would|wouldn['’]t|once|should|could|might|target|targets|want|wants|need|needs|goal|aim|aims|expected|ideal|ideally|instead|supposed|meant|imagine|suppose|example|bell state|bell pair|ghz|w state)\b|['’]d\b/i;
const CURRENT =
  /\b(?:your|you['’]ll|you will|you get|you see|you['’]re|you are|you measure|right now|currently|as it stands|at the moment|so far|this circuit|the circuit|the result|the results|the histogram|the plot|the counts)\b/i;
/** Clauses that propose a gate rather than describe one. */
const SUGGESTION =
  /\b(?:add|adding|place|placing|put|putting|try|insert|apply|applying|use|using|move|moving|swap|replace|remove|removing|delete|drop|missing|without|another|extra|second|consider|lacks?|no)\b/i;

const CLAUSE = /,\s+|;\s+|:\s+|\s+[—–-]\s+|\s+(?:but|while|whereas)\s+/i;

/* -- Outcome claims ---------------------------------------------------------- */

const KET = /\|([01]+)\s*(?:⟩|>|〉)/g;
const PROB_OF =
  /\bP\(\s*\|?([01]+)\s*(?:⟩|>|〉)?\s*\)\s*(?:=|≈|~|is|of)?\s*(?:about|around|roughly|approximately)?\s*(\d{1,3}(?:\.\d+)?\s*%|0?\.\d+|1(?:\.0+)?|0|[1-9]\s*\/\s*[1-9]\d?)/gi;
const NUMBER = /(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)|\b(0?\.\d+|1\.0+)\b|\b([1-9])\s*\/\s*([1-9]\d?)\b/g;
const PROB_WORD = /\b(?:probability|chance|odds|likelihood)\b/i;
const APPROX = /\b(?:about|around|roughly|approximately|nearly|almost|close to|approx)\b|~|≈/i;
const BREAK = /\b(?:and|or|but|while|whereas|than|versus|vs)\b|[,;]/i;
const ALWAYS =
  /\b(?:always|every time|every shot|each time|every run|with certainty|for certain|for sure|guaranteed|certainly)\b/i;
const NEVER = /\b(?:never|not once)\b/i;
const HALF = /\bhalf (?:of )?the (?:time|shots|runs)\b|\b50\s*\/\s*50\b|\bfifty[- ]fifty\b/i;
const EQUAL = /\bequal(?:ly)? (?:likely|probable|probability|odds|chance)\b|\bevenly\b/i;

function parseNumber(raw: string): number {
  const s = raw.replace(/\s+/g, "");
  if (s.endsWith("%")) return parseFloat(s) / 100;
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    return a / b;
  }
  return parseFloat(s);
}

function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

interface OutcomeClaim {
  bits: string;
  p: number;
  tolerance: number;
}

/** Every (outcome, probability) pair a clause asserts. */
export function outcomeClaims(clause: string): OutcomeClaim[] {
  const exact = APPROX.test(clause) ? 0.06 : 0.015;
  const claims: OutcomeClaim[] = [];

  for (const m of clause.matchAll(PROB_OF)) {
    claims.push({ bits: m[1], p: parseNumber(m[2]), tolerance: exact });
  }

  const rest = clause.replace(PROB_OF, " ");
  const kets = [...rest.matchAll(KET)].map((m) => ({
    bits: m[1],
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
  if (kets.length === 0) return claims;

  // A bare decimal or fraction is only a probability when the clause says so.
  const probWords = PROB_WORD.test(rest);
  const numbers = [...rest.matchAll(NUMBER)]
    .filter((m) => m[1] !== undefined || probWords)
    .map((m) => ({ value: parseNumber(m[0]), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));

  const bound = new Map<number, { p: number; tolerance: number }>();
  const used = new Set<number>();

  // A number just after its ket: "|00⟩ 50%", "|00⟩ with probability 0.5".
  kets.forEach((k, i) => {
    const limit = kets[i + 1]?.start ?? rest.length;
    const n = numbers.find(
      (x) =>
        x.start >= k.end && x.start < limit && !used.has(x.start) &&
        wordCount(rest.slice(k.end, x.start)) <= 4 && !BREAK.test(rest.slice(k.end, x.start)),
    );
    if (n) {
      bound.set(i, { p: n.value, tolerance: exact });
      used.add(n.start);
    }
  });

  // A number just before it: "a 50% chance of |00⟩".
  kets.forEach((k, i) => {
    if (bound.has(i)) return;
    const from = kets[i - 1]?.end ?? 0;
    const candidates = numbers.filter(
      (x) =>
        x.end <= k.start && x.start >= from && !used.has(x.start) &&
        wordCount(rest.slice(x.end, k.start)) <= 5 && !BREAK.test(rest.slice(x.end, k.start)),
    );
    const n = candidates[candidates.length - 1];
    if (n) {
      bound.set(i, { p: n.value, tolerance: exact });
      used.add(n.start);
    }
  });

  // "|00⟩ and |11⟩ each 50%".
  const values = [...new Set([...bound.values()].map((b) => b.p))];
  if (/\beach\b/i.test(rest) && values.length === 1) {
    kets.forEach((_, i) => {
      if (!bound.has(i)) bound.set(i, { p: values[0], tolerance: exact });
    });
  }

  // Words instead of numbers.
  const unbound = kets.map((_, i) => i).filter((i) => !bound.has(i));
  if (unbound.length > 0) {
    const never = rest.search(NEVER);
    if (never >= 0) {
      for (const i of unbound) if (kets[i].start > never) bound.set(i, { p: 0, tolerance: 0.005 });
    } else if (ALWAYS.test(rest) && kets.length === 1) {
      bound.set(0, { p: 1, tolerance: 0.005 });
    } else if (HALF.test(rest) && unbound.length <= 2) {
      for (const i of unbound) bound.set(i, { p: 0.5, tolerance: APPROX.test(rest) ? 0.06 : 0.02 });
    } else if (EQUAL.test(rest) && unbound.length >= 2) {
      for (const i of unbound) bound.set(i, { p: 1 / unbound.length, tolerance: 0.02 });
    }
  }

  for (const [i, b] of bound) claims.push({ bits: kets[i].bits, ...b });
  return claims;
}

/* -- Gate claims ------------------------------------------------------------- */

const GATE_WORDS: Record<string, GateType> = {
  hadamard: "h", h: "h", x: "x", y: "y", z: "z", s: "s", t: "t",
  "s†": "sdg", sdg: "sdg", "t†": "tdg", tdg: "tdg",
  rx: "rx", ry: "ry", rz: "rz", crx: "crx", cry: "cry", crz: "crz",
  cnot: "cx", cx: "cx", cz: "cz", swap: "swap", toffoli: "ccx", ccx: "ccx",
  measurement: "measure", measure: "measure", reset: "reset",
};

// Single letters must be capitals: "the X on q1" is a gate, "the x axis" is not.
const GATE_AT =
  /\b(?:[Yy]our|[Tt]he)\s+(Hadamard|hadamard|CNOT|cnot|Toffoli|toffoli|SWAP|swap|CCX|CRX|CRY|CRZ|CX|CZ|RX|RY|RZ|Sdg|Tdg|S†|T†|measurement|measure|reset|[HXYZST])(?:\s+gate)?\s+(?:on|at|acting on)\s+(?:qubit\s+|wire\s+)?q?(\d+)(?:,?\s+(?:in|at)\s+column\s+(\d+))?/g;

/* -- The checker ------------------------------------------------------------- */

export class ClaimChecker {
  private carry: Scope = "none";

  constructor(private readonly truth: Truth) {}

  /** The first contradiction in a chunk of checked text, or null. */
  check(text: string): Contradiction | null {
    const sentences = text.split(/(?<=[.!?])\s+|\n{2,}/);
    for (let si = 0; si < sentences.length; si++) {
      const sentence = sentences[si];
      let scope: Scope = si === 0 ? this.carry : "none";
      for (const clause of sentence.split(CLAUSE)) {
        if (!clause.trim()) continue;
        if (HYPOTHETICAL.test(clause)) scope = "hypothetical";
        else if (CURRENT.test(clause)) scope = "current";
        const bad = this.checkClause(clause, scope);
        if (bad) return bad;
      }
      // A sentence cut at a colon or a line break carries its scope into the
      // next chunk, so "Your circuit gives:" still governs the list after it.
      this.carry = /[.!?]["')\]]*\s*$/.test(sentence) ? "none" : scope;
    }
    return null;
  }

  private checkClause(clause: string, scope: Scope): Contradiction | null {
    const { truth } = this;
    const claim = clause.trim();

    if (scope === "current") {
      for (const c of outcomeClaims(clause)) {
        if (c.bits.length !== truth.width) continue;
        if (!truth.probabilities) {
          return { claim, actual: "nothing was simulated, so no probability can be backed" };
        }
        const actual = truth.probabilities[c.bits] ?? 0;
        if (Math.abs(actual - c.p) > c.tolerance) {
          return { claim, actual: `P(${c.bits}) is ${formatProbability(actual)}` };
        }
      }
    }

    if (scope !== "hypothetical" && truth.hasCircuit && !SUGGESTION.test(clause)) {
      for (const m of clause.matchAll(GATE_AT)) {
        const type = GATE_WORDS[m[1].toLowerCase()];
        const qubit = Number(m[2]);
        const column = m[3] === undefined ? null : Number(m[3]);
        const present = truth.gates.some(
          (g) => g.type === type && g.qubits.includes(qubit) && (column === null || g.column === column),
        );
        if (!present) {
          return {
            claim,
            actual: `there is no ${m[1]} on q${qubit}${column === null ? "" : ` in column ${column}`}`,
          };
        }
      }
    }
    return null;
  }
}
