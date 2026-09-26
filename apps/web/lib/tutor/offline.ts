/**
 * The built-in guide — what the tutor says with no model behind it.
 *
 * Used when no API key is configured, when the service is unreachable, and
 * when Claude declines. It answers from two sources only: the rule engine's
 * reading of the learner's circuit, and a passage from the platform's own
 * content. When neither fits it says so and points at the reference, which is
 * a better answer than a guess.
 */

import type { CircuitContext } from "./context";
import { CORPUS } from "./corpus";
import type { Violation } from "./firewall";
import type { TutorSource } from "./protocol";
import { isConfident, retrieve, toSources, type Hit } from "./retrieve";

/** Questions about the learner's own work go to the rule engine first. */
const ABOUT_MINE =
  /\b(my|mine|wrong|fix|hint|stuck|broken|fail\w*|nudge|circuit|next step|which gate)\b/i;

export interface GuideAnswer {
  text: string;
  sources: TutorSource[];
}

const REFERENCE: TutorSource = { title: "Glossary", href: "/reference", kind: "gate" };

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function percent(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function describeOutcomes(ctx: CircuitContext): string {
  const shown = ctx.outcomes.slice(0, 4);
  let text =
    shown.length === 1
      ? `As it stands, your circuit gives |${shown[0].bits}⟩ every time — there is no uncertainty in it.`
      : `As it stands, your circuit gives ${list(shown.map((o) => `|${o.bits}⟩ ${percent(o.p)}`))} of the time.`;
  if (ctx.entangled.length >= 2) {
    text += ` ${list(ctx.entangled.map((q) => `q${q}`))} are entangled, so none of them has a state of its own.`;
  }
  if (!ctx.finding) text += " The rule engine found nothing to flag.";
  if (shown.some((o) => o.bits.length > 1)) text += " Bitstrings read right to left: q0 is the rightmost digit.";
  return text;
}

function aboutTheirCircuit(ctx: CircuitContext): string | null {
  if (ctx.finding) {
    const fix = ctx.finding.fix ? ` Try this: ${ctx.finding.fix.label}.` : "";
    return `${ctx.finding.message}${fix}`;
  }
  if (ctx.grade?.passed) {
    return `Your circuit already reaches the target — fidelity ${ctx.grade.fidelity.toFixed(3)}. Nothing to fix; see if you can do it in fewer gates.`;
  }
  if (ctx.outcomes.length > 0) return describeOutcomes(ctx);
  return null;
}

/**
 * "Related" links for an answer. For a question about the learner's own
 * circuit, the belief behind the rule engine's finding comes first — that is
 * what the answer is about. Then any passage the question itself matched.
 */
export function relatedSources(
  question: string,
  ctx: CircuitContext | null,
  hits: Hit[] = retrieve(question, 3),
): TutorSource[] {
  const out: TutorSource[] = [];
  const belief = ABOUT_MINE.test(question) ? ctx?.finding?.misconception : null;
  if (belief) {
    const myth = CORPUS.find((p) => p.id === `misconception:${belief}`);
    if (myth) out.push({ title: myth.title, href: myth.href, kind: myth.kind });
  }
  if (isConfident(hits)) {
    for (const s of toSources(hits)) if (!out.some((o) => o.href === s.href)) out.push(s);
  }
  return out.slice(0, 2);
}

/**
 * What replaces an answer the claim check withdrew. The contradiction was
 * about the learner's circuit, so the replacement is the simulator's and the
 * rule engine's reading of it, whatever the question was.
 */
export function retractionAnswer(question: string, ctx: CircuitContext): GuideAnswer {
  const truth = ctx.hasCircuit ? aboutTheirCircuit(ctx) : null;
  return truth ? { text: truth, sources: relatedSources(question, ctx) } : guideAnswer(question, ctx);
}

/**
 * What replaces an answer the physics firewall withdrew. The error was about
 * physics, not the circuit, so the replacement is the law it broke — the same
 * correction the curriculum teaches — with the myth it came from linked.
 */
export function physicsAnswer(v: Violation, question: string, ctx: CircuitContext): GuideAnswer {
  const myth = v.misconception ? CORPUS.find((p) => p.id === `misconception:${v.misconception}`) : null;
  const sources: TutorSource[] = myth ? [{ title: myth.title, href: myth.href, kind: myth.kind }] : [REFERENCE];
  for (const s of relatedSources(question, ctx)) if (!sources.some((o) => o.href === s.href)) sources.push(s);
  return { text: v.truth, sources: sources.slice(0, 2) };
}

export function guideAnswer(question: string, ctx: CircuitContext | null): GuideAnswer {
  const hits = retrieve(question, 3);
  const sources = relatedSources(question, ctx, hits);
  const mine = ctx?.hasCircuit ? aboutTheirCircuit(ctx) : null;

  if (mine && ABOUT_MINE.test(question)) return { text: mine, sources };
  if (isConfident(hits)) return { text: hits[0].passage.answer, sources };
  if (mine) return { text: mine, sources };

  return {
    text:
      "I can't answer that one confidently without the full tutor. Ask about a gate by name, an idea from a lesson, or the circuit you have open — or look it up in the glossary.",
    sources: [REFERENCE],
  };
}
