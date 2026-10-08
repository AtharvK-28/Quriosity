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
 *     they are worked out with the gate registry's own matrices. CNOT, CZ,
 *     SWAP and Toffoli on basis states ("CNOT turns |10⟩ into |11⟩") are
 *     worked out under every wire assignment, since bit order varies by SDK.
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
  {
    id: "entangled-no-own-state",
    name: "an entangled qubit has no state of its own",
    misconception: "M4",
    wrong: [
      /\b(?:entangled|bell (?:pair|state))\b[^.]*?\b(?:each|every|both|either)\s+(?:of\s+the\s+)?qubits?\b[^.]*?\b(?:has|have|keeps?|still has)\s+(?:its|their)\s+own\s+(?:pure\s+|definite\s+|individual\s+)?(?:state|bloch vector|arrow|direction)\b/i,
      /\b(?:each|every|either)\s+(?:half|qubit)\s+of\s+(?:an?\s+|the\s+)?(?:entangled|bell)\s+(?:pair|state)\b[^.]*?\b(?:is|sits|points|lies)\s+(?:in\s+(?:a\s+)?(?:pure|definite)\s+state|on\s+the\s+surface)\b/i,
      /\bentangled\s+qubit(?:'s)?\b[^.]*?\b(?:bloch\s+)?(?:vector|arrow)\b[^.]*?\b(?:on|at|reaches|touches)\s+the\s+surface\b/i,
      /\b(?:one|a single)\s+bloch sphere\b[^.]*?\b(?:shows?|represents?|holds?|draws?|captures?|describes?)\s+(?:the\s+(?:full|whole|joint|complete)\s+state\s+of\s+)?(?:two|both|2|multiple|several|many)\s+(?:entangled\s+)?qubits\b/i,
      /\b(?:two|2|multi)[- ]qubit\s+(?:state|register)s?\b[^.]*?\b(?:fits?|lives?|lies?|is drawn|can be drawn|sits?|can be shown)\s+on\s+(?:a|one|the)\s+(?:single\s+)?bloch sphere\b/i,
    ],
  },
  {
    id: "relative-phase",
    name: "relative phase is physical",
    misconception: "M6",
    wrong: [
      /\brelative phases?\b[^.]*?\b(?:doesn['’]t|does not|don['’]t|do not|never|won['’]t|will not)\s+(?:really\s+)?(?:matter|make (?:any |a )?difference|affect anything|change anything|do anything)\b/i,
      /\brelative phases?\b[^.]*?\b(?:is|are)\s+(?:irrelevant|meaningless|unphysical|not physical|unobservable|undetectable|unmeasurable|just bookkeeping|only bookkeeping)\b/i,
      /\brelative phases?\b[^.]*?\bcan\s+(?:always\s+|safely\s+)?be\s+(?:ignored|dropped|discarded)\b/i,
      /\|\s*\+\s*(?:⟩|>)\s+and\s+\|\s*[−-]\s*(?:⟩|>)\s+(?:are|is)\s+(?:really\s+|actually\s+|just\s+)?(?:the same(?:\s+state)?|identical|equivalent|interchangeable|indistinguishable)\b/i,
    ],
    // The histogram really can't tell them apart; that is the half-truth M6 grows from.
    unless: /\b(?:z[- ]?basis|histogram|counts?|odds|probabilit\w*|statistics|computational basis|measur\w*|global)\b/i,
    negationIsTheClaim: true,
  },
  {
    id: "kickback",
    name: "a controlled gate can change its control",
    misconception: "M9",
    wrong: [
      /\bcontrol(?:\s+qubit)?\b[^.]*?\b(?:is\s+never|is\s+not\s+ever|never\s+gets?|can(?:not|['’]t)\s+(?:ever\s+)?be)\s+(?:changed|affected|touched|altered|modified|disturbed)\b/i,
      /\b(?:controlled[- ]gates?|CNOTs?|CX|CZ|Controlled-[XZ]|Toffoli)\b[^.]*?\b(?:never|can(?:not|['’]t))\s+(?:change[sd]?|affects?|touch(?:es)?|alters?|modif(?:y|ies)|disturbs?)\s+(?:the\s+|its\s+)?controls?\b/i,
      /\b(?:controlled[- ]gates?|CNOTs?|CX|CZ|Controlled-[XZ]|Toffoli)\b[^.]*?\b(?:always|only ever)\s+leaves?\s+(?:the\s+|its\s+)?controls?\s+(?:alone|unchanged|untouched)\b/i,
      /\bcontrol(?:\s+qubit)?\s+(?:always|never\s+changes|is\s+always)\s+(?:stays?\s+|remains?\s+)?(?:unchanged|untouched|unaffected|the same)\b/i,
    ],
    // On basis states the control really is left alone — that is the truth table.
    unless: /\b(?:basis|classical|computational|definite|truth table|0 or 1)\b|\|\s*[01]+\s*(?:⟩|>)/i,
    negationIsTheClaim: true,
  },
  {
    id: "noise-everywhere",
    name: "noise acts at every gate",
    misconception: "M13",
    wrong: [
      /\bnoise\b[^.]*?\b(?:only|just)\s+(?:ever\s+)?(?:happens?|occurs?|acts?|matters?|comes?|appears?|affects?|creeps? in|enters?|kicks? in)\b[^.]*?\b(?:at the end|during (?:the )?(?:final )?measurement|at (?:the )?(?:final )?measurement|at readout|on readout|when you measure)\b/i,
      /\bnoise\s+(?:is|=)\s+(?:just|only|simply|merely)\s+(?:a\s+|some\s+)?(?:random\s+)?(?:bit[- ]flips?|readout errors?)\b/i,
    ],
  },
  {
    id: "noise-grows-with-depth",
    name: "error grows with circuit depth",
    misconception: "M13",
    wrong: [
      /\b(?:depth|deeper circuits?|more gates|circuit length|longer circuits?|gate count)\b[^.]*?\b(?:doesn['’]t|does not|don['’]t|do not|won['’]t|never)\s+(?:matter|affect|change|increase|add to|raise|make a difference to)\b[^.]*?\b(?:noise|errors?|fidelity|accuracy)\b/i,
      /\b(?:noise|errors?)\b[^.]*?\b(?:doesn['’]t|does not|don['’]t|do not|won['’]t|never)\s+(?:grow|build up|accumulate|increase|depend)\b[^.]*?\b(?:depth|gates|circuit length|longer|deeper)\b/i,
    ],
    negationIsTheClaim: true,
  },
  {
    id: "quantum-alongside-classical",
    name: "quantum computers work alongside classical ones",
    misconception: "M14",
    wrong: [
      /\bquantum comput\w*\b[^.]*?\b(?:will|would|are going to|is going to|could|can|shall)\s+(?:eventually\s+|soon\s+|one day\s+|someday\s+|completely\s+|fully\s+)?(?:replace|supersede|make\s+(?:all\s+)?(?:classical|ordinary|regular|normal|conventional)\s+computers?\s+obsolete)\b/i,
      /\bquantum comput\w*\b[^.]*?\b(?:faster|better|quicker|more powerful)\s+(?:at|for|on|than classical computers (?:at|for|on))\s+(?:everything|anything|every(?:\s+\w+)?\s+(?:problem|task|computation|program)|all\s+(?:problems|tasks|computations|programs))\b/i,
      /\bquantum comput\w*\b[^.]*?\b(?:speeds? up|accelerates?|solves?)\s+(?:everything|every (?:problem|task|computation|program)|all (?:problems|tasks|computations|programs))\b/i,
      /\bquantum comput\w*\b[^.]*?\b(?:doesn['’]t|does not|don['’]t|do not|won['’]t|will not)\s+need\s+(?:a\s+|any\s+)?classical\s+(?:computers?|hardware|help|control)\b/i,
    ],
  },
];

/* -- Computed laws: multi-qubit gates on basis states -------------------------- */

/*
 * "CNOT turns |10⟩ into |11⟩" is right with the control on the left, as
 * textbooks write it, and wrong with the control on the right, as Qiskit
 * orders bits. The tutor may be using either, so a claim is only wrong when no
 * wire assignment makes it right.
 */
const MGATE = String.raw`(CNOTs?|CX|C-NOT|[Cc]ontrolled-(?:NOT|X|Z)|CZ|SWAP|[Ss]wap|Toffoli|CCX|CCNOT)`;
const MKET = String.raw`\|\s*[01]{2,3}\s*(?:⟩|>|〉)`;

const MULTI_CLAIM = [
  new RegExp(
    String.raw`\b${MGATE}(?:\s+gate)?\s+(?:maps|turns|takes|sends|transforms|converts|changes|flips|brings|moves)\s+(${MKET})\s+(?:to|into|onto)\s+[−-]?\s*(${MKET})`,
  ),
  new RegExp(
    String.raw`\b(?:[Aa]pply(?:ing)?\s+(?:an?\s+|the\s+)?|[Aa]n?\s+|[Tt]he\s+)${MGATE}(?:\s+gate)?\s+(?:to|on)\s+(${MKET})\s+(?:gives|yields|produces|makes|leaves|results in|returns|puts it in)\s+(?:you\s+)?[−-]?\s*(${MKET})`,
  ),
];

type MultiGate = "cx" | "cz" | "swap" | "ccx";

function multiGate(word: string): MultiGate | null {
  const w = word.toLowerCase().replace(/s$/, "");
  if (["cnot", "cx", "c-not", "controlled-not", "controlled-x"].includes(w)) return "cx";
  if (["cz", "controlled-z"].includes(w)) return "cz";
  if (w === "swap") return "swap";
  if (["toffoli", "ccx", "ccnot"].includes(w)) return "ccx";
  return null;
}

const bitsOf = (ket: string) => ket.replace(/[^01]/g, "");

/** Every basis state the gate can send `bits` to, over every wire assignment. */
function multiOutcomes(gate: MultiGate, bits: string): string[] | null {
  const n = bits.length;
  const flip = (b: string, i: number) => b.slice(0, i) + (b[i] === "1" ? "0" : "1") + b.slice(i + 1);
  if (gate === "cz") return n === 2 ? [bits] : null;
  if (gate === "swap") return n === 2 ? [bits[1] + bits[0]] : null;
  if (gate === "cx") {
    if (n !== 2) return null;
    return [bits[0] === "1" ? flip(bits, 1) : bits, bits[1] === "1" ? flip(bits, 0) : bits];
  }
  if (n !== 3) return null;
  const out: string[] = [];
  for (let target = 0; target < 3; target++) {
    const controls = [0, 1, 2].filter((i) => i !== target);
    out.push(controls.every((i) => bits[i] === "1") ? flip(bits, target) : bits);
  }
  return out;
}

const GATE_TITLE: Record<MultiGate, string> = { cx: "CNOT", cz: "Controlled-Z", swap: "SWAP", ccx: "Toffoli" };

function multiTruth(gate: MultiGate, from: string, outs: string[], claimed: string): string {
  const ket = (b: string) => `|${b}⟩`;
  const distinct = [...new Set(outs)];
  if (gate === "cz") {
    return `Controlled-Z never changes a basis state's bits, only its sign: ${ket(from)} stays ${ket(from)}${from === "11" ? " (with a minus sign)" : ""}, not ${ket(claimed)}.`;
  }
  if (distinct.length === 1) {
    return `${GATE_TITLE[gate]} sends ${ket(from)} to ${ket(distinct[0])}, not ${ket(claimed)}.`;
  }
  return `${GATE_TITLE[gate]} sends ${ket(from)} to ${distinct.map(ket).join(" or ")}, depending on which qubit is the ${gate === "ccx" ? "target" : "control"} — never to ${ket(claimed)}.`;
}

function multiViolation(clause: string): Violation | null {
  for (const re of MULTI_CLAIM) {
    const m = re.exec(clause);
    if (!m) continue;
    const gate = multiGate(m[1]);
    const from = bitsOf(m[2]);
    const to = bitsOf(m[3]);
    if (!gate || from.length !== to.length) continue;
    const outs = multiOutcomes(gate, from);
    if (!outs || outs.includes(to)) continue;
    return {
      law: "gate-algebra",
      name: "gate algebra",
      claim: clause.trim(),
      truth: multiTruth(gate, from, outs, to),
      misconception: null,
    };
  }
  return null;
}

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

  const multi = multiViolation(clause);
  if (multi) return multi;

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

/** The learner-facing name of a law, by id. */
export function lawName(id: string): string {
  if (id === "gate-algebra") return "gate algebra";
  if (id === "normalisation") return "probabilities add up to 100%";
  return LAWS.find((l) => l.id === id)?.name ?? id;
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
