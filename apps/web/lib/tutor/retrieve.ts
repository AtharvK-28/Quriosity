/**
 * Lexical retrieval over the corpus.
 *
 * BM25 with light suffix folding, no embeddings. The corpus is about fifty
 * passages and most questions are about named things — gates, lessons,
 * beliefs — which is where keyword scoring is strong, and where a confidence
 * threshold is honest: a question that shares no rare word with any passage
 * is not one the built-in guide should pretend to answer.
 */

import type { GateType } from "@/lib/ir/types";
import { CORPUS, type Passage } from "./corpus";
import type { TutorSource } from "./protocol";

const STOP = new Set(
  (
    "a an the is are was were be been being of to in on at for and or but if then than that this these those it its " +
    "as by with from what why how when where which who whom does do did doing can could should would will shall may " +
    "might must i me my mine you your we our they them their there here about into out so not no yes just also very " +
    "really please tell explain show give mean means get got " +
    // Words about the learner's own situation, not about content. Left in,
    // "what does my circuit do" matched whichever passage said "circuit".
    "circuit circuits gate gates wrong right correct fix fixed help hint stuck broken nudge next step " +
    "answer look work works happen happens"
  ).split(" "),
);

/** Crude suffix folding, so "entangled", "entanglement" and "entangle" meet. */
export function stem(word: string): string {
  let w = word;
  for (const suffix of ["ments", "ment", "ings", "ing", "edly", "ed", "es", "s"]) {
    if (w.length - suffix.length >= 3 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

/** The names people actually use for gates, mapped onto the registry. */
const GATE_ALIASES: Array<[RegExp, GateType]> = [
  [/\bhadamard\b|\bh[- ]gate\b/, "h"],
  [/\bcnot\b|\bcx\b|controlled[- ]not|controlled[- ]x\b/, "cx"],
  [/\bcz\b|controlled[- ]z\b/, "cz"],
  [/\btoffoli\b|\bccx\b|\bccnot\b/, "ccx"],
  [/\bswap\b/, "swap"],
  [/\bpauli[- ]?x\b|\bx[- ]gate\b|\bnot[- ]gate\b|\bbit[- ]flip\b/, "x"],
  [/\bpauli[- ]?y\b|\by[- ]gate\b/, "y"],
  [/\bpauli[- ]?z\b|\bz[- ]gate\b|\bphase[- ]flip\b/, "z"],
  [/\bs[- ]gate\b/, "s"],
  [/\bsdg\b|\bs[- ]dagger\b/, "sdg"],
  [/\bt[- ]gate\b|\bpi\/8\b|π\/8/, "t"],
  [/\btdg\b|\bt[- ]dagger\b/, "tdg"],
  [/\brx\b/, "rx"],
  [/\bry\b/, "ry"],
  [/\brz\b/, "rz"],
  [/\bcrx\b/, "crx"],
  [/\bcry\b/, "cry"],
  [/\bcrz\b/, "crz"],
  [/\bphase gate\b|\bp gate\b/, "p"],
  [/\bmeasure(ment)?\b|\bmeasuring\b/, "measure"],
  [/\breset\b/, "reset"],
  [/\bbarrier\b/, "barrier"],
];

const SINGLE_LETTER: Record<string, GateType> = { H: "h", X: "x", Y: "y", Z: "z", S: "s", T: "t" };

/** Gates a question names, by alias or by a capital single-letter name ("what does H do"). */
export function mentionedGates(question: string): GateType[] {
  const lower = question.toLowerCase();
  const found = new Set<GateType>();
  for (const [re, type] of GATE_ALIASES) if (re.test(lower)) found.add(type);
  for (const m of question.matchAll(/(?:^|[^A-Za-z])([HXYZST])(?=$|[^A-Za-z])/g)) {
    found.add(SINGLE_LETTER[m[1]]);
  }
  return [...found];
}

/* -- Index, built once ------------------------------------------------------- */

const K1 = 1.2;
const B = 0.75;
/** Added to a gate passage the question names outright. */
const GATE_BOOST = 3;
/** Below this the best match is a coincidence, not an answer. */
export const CONFIDENT = 3;

interface Doc {
  passage: Passage;
  tf: Map<string, number>;
  len: number;
}

const DOCS: Doc[] = CORPUS.map((p) => {
  // The title counts twice: it is what the passage is about.
  const tokens = tokenize(`${p.title} ${p.title} ${p.text}`);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return { passage: p, tf, len: tokens.length };
});

const AVG_LEN = DOCS.reduce((sum, d) => sum + d.len, 0) / DOCS.length;

const DF = new Map<string, number>();
for (const d of DOCS) for (const t of d.tf.keys()) DF.set(t, (DF.get(t) ?? 0) + 1);

function idf(term: string): number {
  const n = DF.get(term) ?? 0;
  return Math.log(1 + (DOCS.length - n + 0.5) / (n + 0.5));
}

export interface Hit {
  passage: Passage;
  score: number;
}

export function retrieve(question: string, k = 3): Hit[] {
  const terms = [...new Set(tokenize(question))];
  const named = new Set(mentionedGates(question));

  const hits: Hit[] = [];
  for (const d of DOCS) {
    let score = 0;
    for (const t of terms) {
      const f = d.tf.get(t);
      if (!f) continue;
      score += (idf(t) * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * d.len) / AVG_LEN));
    }
    if (d.passage.kind === "gate" && named.has(d.passage.id.slice(5) as GateType)) score += GATE_BOOST;
    if (score > 0) hits.push({ passage: d.passage, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, k);
}

export function isConfident(hits: Hit[]): boolean {
  return hits.length > 0 && hits[0].score >= CONFIDENT;
}

/** Up to two "related" links, one per destination. */
export function toSources(hits: Hit[]): TutorSource[] {
  const seen = new Set<string>();
  const out: TutorSource[] = [];
  for (const h of hits) {
    if (seen.has(h.passage.href)) continue;
    seen.add(h.passage.href);
    out.push({ title: h.passage.title, href: h.passage.href, kind: h.passage.kind });
    if (out.length === 2) break;
  }
  return out;
}
