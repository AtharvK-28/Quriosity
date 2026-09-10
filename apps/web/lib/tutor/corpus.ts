/**
 * What the tutor knows, drawn from the platform's own content.
 *
 * Three kinds of passage: the lessons, the gate registry, and the fourteen
 * misconceptions with what is true instead. The same list grounds both
 * engines — Claude receives it in its cached system prompt, the built-in guide
 * retrieves from it — so the two cannot teach different things.
 */

import { NODES } from "@/lib/curriculum/nodes";
import { GATES, GATE_TYPES } from "@/lib/ir/gates";
import { MISCONCEPTIONS, type MisconceptionId } from "./rules";

export interface Passage {
  id: string;
  kind: "lesson" | "gate" | "misconception";
  title: string;
  /** Everything retrieval may match on. */
  text: string;
  /** What the built-in guide says when this passage is the best match. */
  answer: string;
  /** Where "related" links go. */
  href: string;
}

/**
 * The correction for each belief. MISCONCEPTIONS names the belief; this is
 * what is true instead, in a sentence or two a learner can check.
 */
export const CORRECTIONS: Record<MisconceptionId, string> = {
  M1: "Before it is measured, a qubit in superposition has no hidden value waiting to be read. Its state is the pair of amplitudes, phases included — and amplitudes can cancel through interference, which no coin can do.",
  M2: "A measurement returns one outcome, not all of them. Quantum algorithms arrange interference so that amplitudes on wrong answers cancel and amplitudes on right answers add up.",
  M3: "Measuring one half of an entangled pair changes nothing that can be observed on the other half alone. The correlation only shows when the two sets of results are compared, which needs an ordinary classical channel — so nothing travels faster than light.",
  M4: "An entangled qubit has no pure state of its own. Its reduced state is mixed, so its Bloch vector sits inside the sphere — at the very centre for a maximally entangled pair like a Bell state.",
  M5: "Multiplying the whole state by the same phase e^(iφ) changes no measurement probability in any basis. Global phase is unobservable, so two states that differ only by it are the same state.",
  M6: "Relative phase — the phase between amplitudes — is invisible in a Z-basis histogram, but it decides what the next gate does. |+⟩ and |−⟩ give identical counts, yet a Hadamard sends one to |0⟩ and the other to |1⟩.",
  M7: "Measurement is not a passive read-out: it collapses the state to the outcome observed. Every gate after a measurement acts on that outcome, not on the superposition that existed before.",
  M8: "CNOT cannot copy an unknown state; the no-cloning theorem rules it out. With a superposed control it produces an entangled state, not two independent copies.",
  M9: "A controlled gate can change its control. With the target in |−⟩, a CNOT puts a phase back onto the control — phase kickback, the mechanism behind Deutsch–Jozsa and Grover oracles.",
  M10: "In Qiskit, and on this platform, bitstrings are little-endian: qubit 0 is the rightmost character. So 01 means q0 = 1 and q1 = 0.",
  M11: "Grover's success probability rises and then falls again. The best number of iterations is about (π/4)·√N; going past it makes the right answer less likely, not more.",
  M12: "Grover's algorithm needs about √N queries where a classical search needs about N — a quadratic speedup, not an exponential one.",
  M13: "Noise acts at every gate, and two-qubit gates are the noisiest, so error grows with circuit depth. A deeper circuit drifts further from the ideal distribution.",
  M14: "Quantum computers speed up particular problems, such as simulating quantum systems. They work alongside classical computers, which prepare the inputs, control the device and interpret the results.",
};

/** "A qubit is…" → "a qubit is…", but "CNOT copies…" keeps its acronym. */
function lowerFirst(s: string): string {
  return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

const lessons: Passage[] = NODES.map((n) => ({
  id: `lesson:${n.id}`,
  kind: "lesson",
  title: n.title,
  text: `${n.hook} ${n.task} ${n.instructionTitle} ${n.instruction} ${n.passNote}`,
  answer: `${n.instruction} (From the lesson “${n.title}”.)`,
  href: `/lesson/${n.id}`,
}));

const gates: Passage[] = GATE_TYPES.map((t) => {
  const g = GATES[t];
  const qiskit = g.sdk.qiskit ? ` Its Qiskit name is \`${g.sdk.qiskit}\`.` : "";
  return {
    id: `gate:${t}`,
    kind: "gate",
    title: `${g.name} gate`,
    text: `${g.name} gate ${t}. ${g.blurb}`,
    answer: `[[gate:${t}]] ${g.blurb}${qiskit}`,
    href: `/reference#gate-${t}`,
  };
});

const beliefs: Passage[] = (Object.keys(MISCONCEPTIONS) as MisconceptionId[]).map((m) => ({
  id: `misconception:${m}`,
  kind: "misconception",
  title: `Myth: ${lowerFirst(MISCONCEPTIONS[m])}`,
  text: `${MISCONCEPTIONS[m]}. ${CORRECTIONS[m]}`,
  answer: `A common belief is that ${lowerFirst(MISCONCEPTIONS[m])}. ${CORRECTIONS[m]}`,
  href: "/profile",
}));

export const CORPUS: Passage[] = [...lessons, ...gates, ...beliefs];
