/**
 * The physics firewall.
 *
 * The claim check (claims.ts) holds the tutor to the learner's own circuit.
 * This holds it to physics: statements that are wrong in every circuit — that
 * entanglement sends messages faster than light, that CNOT copies a qubit,
 * that a quantum computer tries every answer at once, that S is its own
 * inverse. A tutor that says any of these teaches it, and the learner has no
 * way to check it against the screen.
 *
 * Two kinds of law:
 *
 *   - CATALOGUED. Each of the platform's misconceptions has a wrong statement
 *     that can be recognised in prose. What is true instead is the same
 *     correction the corpus teaches (CORRECTIONS), so the firewall and the
 *     curriculum cannot drift apart.
 *   - COMPUTED. Claims about what a fixed gate does — "H sends |0⟩ to |1⟩",
 *     "S applied twice cancels", "|0⟩ 70% and |1⟩ 50%" — are not looked up,
 *     they are worked out with the gate registry's own matrices.
 *
 * Like the claim check, it leans towards letting text through. A clause that
 * negates the idea ("nothing travels faster than light") or a sentence that
 * frames it as a belief ("a common myth is that…") is the tutor correcting
 * the error, not making it.
 */

import { GATES } from "@/lib/ir/gates";
import type { GateType } from "@/lib/ir/types";
import { outcomeClaims, formatProbability } from "./claims";
import { CORRECTIONS } from "./corpus";
import type { MisconceptionId } from "./rules";

export interface Violation {
  law: string;
  /** Short name, shown to the learner. */
  name: string;
  /** The words that broke it. */
  claim: string;
  /** What is true instead, in a sentence a learner can check. */
  truth: string;
  misconception: MisconceptionId | null;
}

/* -- Reading clauses ---------------------------------------------------------- */

const CLAUSE = /,\s+|;\s+|:\s+|\s+[—–-]\s+|\s+(?:but|while|whereas|although|though)\s+/i;

/** A clause that denies the idea is a correction, not a claim. */
const NEGATED =
  /\b(?:not|no|never|cannot|can['’]t|won['’]t|doesn['’]t|don['’]t|isn['’]t|aren['’]t|didn['’]t|nothing|nor|neither|impossible|forbids?|rules? out|rather than|instead of|unlike|only appears?|only seems?)\b/i;

/** A sentence that names the idea as a belief in order to correct it. */
const FRAMED =
  /\b(?:myths?|misconceptions?|beliefs?|believe[sd]?|tempting|misleading|people think|often said|pop[- ]science|popular (?:idea|picture|claim)|mistaken(?:ly)?|wrongly|a common (?:mistake|error|confusion))\b/i;

/* -- Catalogued laws ---------------------------------------------------------- */

interface Law {
  id: string;
  name: string;
  misconception: MisconceptionId;
  /** Recognises the wrong statement within one clause. */
  wrong: RegExp[];
  /**
   * Sentences where the pattern is true after all. Checked on the whole
   * sentence, because the qualifier is often in a neighbouring clause.
   */
  unless?: RegExp;
  /**
   * For laws whose wrong statement is itself a negation ("measurement does
   * not change the state"), clause negation cannot be the exemption.
   */
  negationIsTheClaim?: boolean;
}

const FTL = String.raw`(?:faster[- ]than[- ]light|superluminal(?:ly)?|instant(?:ly|aneous(?:ly)?)?)`;
const SIGNAL = String.raw`(?:send\w*|transmit\w*|communicat\w*|signal\w*|messages?|telegraph\w*)`;
// Single letters must be capitals: "the X gate" is a gate, "the x axis" is not.
const GATE = String.raw`(?:[Hh]adamard|Pauli-?[XYZ]|S†|T†|Sdg|Tdg|[HXYZST])`;
const KET = String.raw`\|\s*(?:[01]|[+\-−]|[+\-−]?i)\s*(?:⟩|>|〉)`;

const LAWS: Law[] = [
  {
    id: "no-signalling",
    name: "no faster-than-light signalling",
    misconception: "M3",
    wrong: [
      new RegExp(String.raw`\b${SIGNAL}\b[^.]*?\b${FTL}\b`, "i"),
      new RegExp(String.raw`\b${FTL}\b[^.]*?\b${SIGNAL}\b`, "i"),
    ],
  },
  {
    id: "no-cloning",
    name: "the no-cloning theorem",
    misconception: "M8",
    wrong: [
      /\b(?:cop(?:y|ies|ying)|clon(?:e|es|ing)|duplicat(?:e|es|ing))\s+(?:an?\s+|the\s+|any\s+|its\s+|your\s+)?(?:unknown\s+|arbitrary\s+|superposed\s+|quantum\s+|control(?:'s)?\s+)?(?:qubits?|states?|superpositions?)\b/i,
      /\bmakes?\s+(?:an?\s+)?(?:identical\s+|perfect\s+|exact\s+)?cop(?:y|ies)\s+of\s+(?:an?\s+|the\s+|any\s+|its\s+)?(?:unknown\s+|arbitrary\s+|superposed\s+|quantum\s+)?(?:qubits?|states?|superpositions?)\b/i,
    ],
    // CNOT really does copy a basis state — that is its truth table.
    unless: /\b(?:classical|basis|definite|computational|0 or 1|\|0⟩ or \|1⟩|truth table|state ?vector)\b/i,
  },
  {
    id: "no-parallel-readout",
    name: "one measurement, one outcome",
    misconception: "M2",
    wrong: [
      /\b(?:tr(?:y|ies|ying)|check(?:s|ing)?|test(?:s|ing)?|evaluat\w+|comput\w+|explor\w+|search(?:es|ing)?)\s+(?:every|all)\s+(?:of\s+)?(?:the\s+)?(?:possible\s+)?(?:answers?|solutions?|inputs?|possibilit(?:y|ies)|combinations?|options?|paths?|values?)\b[^.]*?\b(?:at once|simultaneously|in parallel|at the same time)\b/i,
      /\bmeasur\w*\b[^.]*?\b(?:gives|returns|reads out|reveals|shows)\s+(?:you\s+)?(?:all|every one of)\s+(?:the\s+)?(?:answers|results|outcomes|values|possibilities)\b/i,
    ],
  },
  {
    id: "no-hidden-value",
    name: "no hidden value before measurement",
    misconception: "M1",
    wrong: [
      /\b(?:is|was)\s+(?:secretly|really|actually|already)\s+either\s+\|?\s*0\s*(?:⟩|>)?\s+or\s+\|?\s*1\b/i,
      /\b(?:has|holds|had|carries)\s+(?:a\s+)?(?:hidden|predetermined|pre-determined|secret)\s+(?:value|answer|outcome|result|bit)\b/i,
    ],
  },
  {
    id: "global-phase",
    name: "global phase is unobservable",
    misconception: "M5",
    wrong: [
      /\bglobal phase\b[^.]*?\b(?:changes?|affects?|alters?|shifts?|skews?)\s+(?:the\s+|your\s+)?(?:measurement|probabilit\w*|outcomes?|results?|histogram|counts|odds|statistics)\b/i,
      /\bglobal phase\b[^.]*?\b(?:is|are)\s+(?:measurable|observable|detectable|visible)\b/i,
    ],
  },
  {
    id: "measurement-disturbs",
    name: "measurement collapses the state",
    misconception: "M7",
    wrong: [
      /\bmeasur\w*\b[^.]*?\b(?:doesn['’]t|does not|won['’]t|will not|never)\s+(?:change|affect|disturb|alter|collapse)\s+(?:the\s+|its\s+|a\s+)?(?:state|qubit|superposition)\b/i,
      /\bmeasur\w*\s+(?:is|are)\s+(?:just|only|simply|merely)\s+(?:a\s+)?(?:passive\s+)?(?:peek|look|glance|read-?out)\b/i,
    ],
    // Measuring a basis state, or measuring twice, really does leave it alone.
    unless: /\b(?:again|second|repeat\w*|twice|already|definite|basis|eigen\w*)\b|\|\s*[01]\s*(?:⟩|>)/i,
    negationIsTheClaim: true,
  },
  {
    id: "grover-quadratic",
    name: "Grover's speedup is quadratic",
    misconception: "M12",
    wrong: [/\bgrover\w*\b[^.]*?\bexponential(?:ly)?\b/i, /\bexponential(?:ly)?\b[^.]*?\bgrover\w*/i],
  },
  {
    id: "grover-overshoot",
    name: "Grover iterations overshoot",
    misconception: "M11",
    wrong: [
      /\bmore\s+(?:grover\s+)?iterations\b[^.]*?\b(?:always)\s+(?:help|improve|increase|raise|boost)/i,
      /\b(?:extra|more|additional)\s+(?:grover\s+)?iterations\b[^.]*?\bcan(?:not|['’]t) hurt\b/i,
    ],
  },
  {
    id: "little-endian",
    name: "q0 is the rightmost bit",
    misconception: "M10",
    wrong: [
      /\bq(?:ubit\s*)?0\b[^.]*?\b(?:is|as|=|means|sits?|goes|appears?)\b[^.]*?\b(?:left(?:most)?|first)\s+(?:bit|character|digit|position|place)\b/i,
      /\b(?:left(?:most)?|first)\s+(?:bit|character|digit)\b[^.]*?\b(?:is|=|means|belongs to|represents|is for)\s+(?:q0|qubit 0|qubit zero)\b/i,
    ],
    // Cirq and PennyLane really do order the other way.
    unless: /\b(?:cirq|pennylane|big[- ]endian)\b/i,
  },
];

/* -- Computed laws: fixed gates, worked out ------------------------------------ */

type C = [number, number];
type Vec = [C, C];

const R = Math.SQRT1_2;
const STATES: Record<string, Vec> = {
  "0": [[1, 0], [0, 0]],
  "1": [[0, 0], [1, 0]],
  "+": [[R, 0], [R, 0]],
  "-": [[R, 0], [-R, 0]],
  "+i": [[R, 0], [0, R]],
  "-i": [[R, 0], [0, -R]],
};

function ketKey(raw: string): string | null {
  const inner = raw.replace(/[|⟩>〉\s]/g, "").replace("−", "-");
  const key = inner === "i" ? "+i" : inner;
  return key in STATES ? key : null;
}

function ketLabel(key: string): string {
  return `|${key.replace("-", "−")}⟩`;
}

const GATE_NAMES: Record<string, GateType> = {
  hadamard: "h", h: "h", x: "x", "pauli-x": "x", paulix: "x", y: "y", "pauli-y": "y", pauliy: "y",
  z: "z", "pauli-z": "z", pauliz: "z", s: "s", t: "t", "s†": "sdg", sdg: "sdg", "t†": "tdg", tdg: "tdg",
};

function fixedGate(word: string): GateType | null {
  const type = GATE_NAMES[word.toLowerCase()];
  return type && GATES[type].base && GATES[type].paramArity === 0 ? type : null;
}

function matrix(type: GateType): C[] {
  const m = GATES[type].base!([]);
  return [[m[0], m[1]], [m[2], m[3]], [m[4], m[5]], [m[6], m[7]]];
}

const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];

function apply(m: C[], v: Vec): Vec {
  return [add(mul(m[0], v[0]), mul(m[1], v[1])), add(mul(m[2], v[0]), mul(m[3], v[1]))];
}

/** |⟨a|b⟩|² — one when the states match up to a global phase. */
function overlap(a: Vec, b: Vec): number {
  const conj = (c: C): C => [c[0], -c[1]];
  const ip = add(mul(conj(a[0]), b[0]), mul(conj(a[1]), b[1]));
  return ip[0] ** 2 + ip[1] ** 2;
}

function square(m: C[]): C[] {
  const at = (r: number, c: number) => m[r * 2 + c];
  const out: C[] = [];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 2; c++) out.push(add(mul(at(r, 0), at(0, c)), mul(at(r, 1), at(1, c))));
  return out;
}

/** Equal up to a global phase: every entry of a is e^{iφ} times b's. */
function samePhysics(a: C[], b: C[]): boolean {
  let phase: C | null = null;
  for (let k = 0; k < 4; k++) {
    const [x, y] = [a[k], b[k]];
    const mx = Math.hypot(...x);
    const my = Math.hypot(...y);
    if (Math.abs(mx - my) > 1e-9) return false;
    if (my < 1e-9) continue;
    // x / y, for unit-modulus ratio
    const ratio: C = [(x[0] * y[0] + x[1] * y[1]) / (my * my), (x[1] * y[0] - x[0] * y[1]) / (my * my)];
    if (!phase) phase = ratio;
    else if (Math.hypot(ratio[0] - phase[0], ratio[1] - phase[1]) > 1e-9) return false;
  }
  return true;
}

const IDENTITY: C[] = [[1, 0], [0, 0], [0, 0], [1, 0]];
const NAMED: GateType[] = ["x", "y", "z", "h", "s", "sdg", "t", "tdg"];

function whatSquareIs(type: GateType): string {
  const sq = square(matrix(type));
  const same = NAMED.find((t) => samePhysics(sq, matrix(t)));
  return same ? GATES[same].name : "a different gate";
}

const SELF_INVERSE_CLAIM = [
  new RegExp(String.raw`\b(${GATE})(?:\s+gate)?\s+is\s+(?:its\s+own|self)[- ]inverse\b`),
  new RegExp(
    String.raw`\b(?:[Aa]pply(?:ing)?|[Tt]wo|[Dd]oubl(?:e|ing))\s+(?:an?\s+)?(${GATE})s?(?:\s+gates?)?\s+(?:twice|in a row|back[- ]to[- ]back|one after (?:the )?other)\b[^.]*?\b(?:cancels?|cancel out|undo(?:es)?|does nothing|do nothing|gets? you back|returns? (?:you )?to (?:the )?(?:start|original|beginning)|is the identity|equals? the identity)\b`,
  ),
];

const ACTION_CLAIM = [
  new RegExp(
    String.raw`\b(${GATE})(?:\s+gate)?\s+(?:maps|turns|takes|sends|transforms|converts|changes|flips|rotates|brings|moves)\s+(${KET})\s+(?:to|into|onto)\s+(${KET})`,
  ),
  new RegExp(
    String.raw`\b(?:[Aa]pply(?:ing)?\s+|[Aa]n?\s+|[Tt]he\s+)(${GATE})(?:\s+gate)?\s+(?:to|on)\s+(${KET})\s+(?:gives|yields|produces|makes|leaves|results in|returns|puts it in)\s+(?:you\s+)?(${KET})`,
  ),
];

function computedViolation(clause: string): Violation | null {
  const claim = clause.trim();

  for (const re of SELF_INVERSE_CLAIM) {
    const m = re.exec(clause);
    const type = m && fixedGate(m[1]);
    if (!type) continue;
    if (!samePhysics(square(matrix(type)), IDENTITY)) {
      return {
        law: "gate-algebra",
        name: "gate algebra",
        claim,
        truth: `${GATES[type].name} applied twice is ${whatSquareIs(type)}, not the identity — so it is not its own inverse.`,
        misconception: null,
      };
    }
  }

  for (const re of ACTION_CLAIM) {
    const m = re.exec(clause);
    if (!m) continue;
    const type = fixedGate(m[1]);
    const from = ketKey(m[2]);
    const to = ketKey(m[3]);
    if (!type || !from || !to) continue;
    const out = apply(matrix(type), STATES[from]);
    if (overlap(out, STATES[to]) < 0.999) {
      const actual = Object.keys(STATES).find((k) => overlap(out, STATES[k]) > 0.999);
      return {
        law: "gate-algebra",
        name: "gate algebra",
        claim,
        truth: `${GATES[type].name} sends ${ketLabel(from)} to ${actual ? ketLabel(actual) : "a different state"}, not ${ketLabel(to)}.`,
        misconception: null,
      };
    }
  }

  // Outcomes of one register must add up to one, whatever the circuit.
  const claims = outcomeClaims(clause);
  const over = claims.find((c) => c.p > 1 + 1e-9);
  if (over) {
    return {
      law: "normalisation",
      name: "probabilities add up to 100%",
      claim,
      truth: `No outcome can have a probability above 100%, and ${formatProbability(over.p)} was claimed for |${over.bits}⟩.`,
      misconception: null,
    };
  }
  const byBits = new Map<string, number>();
  let tolerance = 0;
  for (const c of claims) {
    // The same outcome given two numbers is a comparison, not a distribution.
    if (byBits.has(c.bits)) return null;
    byBits.set(c.bits, c.p);
    tolerance += c.tolerance;
  }
  const widths = new Set([...byBits.keys()].map((b) => b.length));
  const total = [...byBits.values()].reduce((a, b) => a + b, 0);
  if (byBits.size >= 2 && widths.size === 1 && total > 1 + Math.max(tolerance, 0.02)) {
    return {
      law: "normalisation",
      name: "probabilities add up to 100%",
      claim,
      truth: `The outcomes of one measurement add up to exactly 100%, and these add up to ${Math.round(total * 100)}%.`,
      misconception: null,
    };
  }
  return null;
}

/* -- The firewall ------------------------------------------------------------- */

/**
 * The tutor names gates as [[gate:ID]] chips. Read as prose, a chip is the
 * gate's own letter, so "[[gate:s]] is its own inverse" is checked like "S is".
 */
const CHIP = /\[\[\s*gate\s*:\s*([a-z]+)\s*\]\]/g;
const LETTER: Partial<Record<GateType, string>> = {
  h: "H", x: "X", y: "Y", z: "Z", s: "S", t: "T", sdg: "S†", tdg: "T†",
};

function asProse(text: string): string {
  return text.replace(CHIP, (_m, id: string) => LETTER[id as GateType] ?? GATES[id as GateType]?.name ?? id);
}

/** The first physics violation in a chunk of released text, or null. */
export function firewall(text: string): Violation | null {
  const sentences = asProse(text).split(/(?<=[.!?])\s+|\n+/);
  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    const framed = FRAMED.test(sentence);

    for (const clause of sentence.split(CLAUSE)) {
      if (!clause.trim()) continue;
      const negated = NEGATED.test(clause);

      for (const law of LAWS) {
        if (framed) break;
        if (negated && !law.negationIsTheClaim) continue;
        if (law.unless?.test(sentence)) continue;
        if (law.wrong.some((re) => re.test(clause))) {
          return {
            law: law.id,
            name: law.name,
            claim: clause.trim(),
            truth: CORRECTIONS[law.misconception],
            misconception: law.misconception,
          };
        }
      }

      if (!negated && !framed) {
        const bad = computedViolation(clause);
        if (bad) return bad;
      }
    }
  }
  return null;
}
