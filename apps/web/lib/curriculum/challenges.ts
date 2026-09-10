/**
 * Challenges — PRD E8.
 *
 * The path teaches a concept per node. Challenges are where a learner practises
 * until it is automatic, and they exist because repetition has to be voluntary
 * to happen at all (goal G4: eight attempts per learner per week).
 *
 * Three kinds, each grading something different:
 *
 *   reach   — build any circuit that reaches the target state. Correctness only.
 *   golf    — reach it in as few gates as possible. Correctness gates scoring;
 *             the score is gate count against a par (PRD §6.2).
 *   bughunt — a circuit that is nearly right is handed to you broken. Score is
 *             whether you found the fix, and the rule engine is the opponent.
 *
 * Grading is always by state fidelity, so on every one of these there is more
 * than one correct answer and the platform accepts all of them.
 */

import type { GateType } from "@/lib/ir/types";
import {
  TARGETS, distributionTarget, stateTarget, type Target,
} from "@/lib/grade/fidelity";

const R2 = Math.SQRT1_2;

export type ChallengeKind = "reach" | "golf" | "bughunt";

export interface Challenge {
  id: string;
  title: string;
  kind: ChallengeKind;
  /** One line. What you are being asked for, not how to do it. */
  brief: string;
  qubits: number;
  target: Target;
  allowedGates: GateType[];
  /** Fewest gates a correct answer needs. The bar in golf; a note elsewhere. */
  par: number;
  /** 1 warm-up, 2 solid, 3 genuinely hard. */
  difficulty: 1 | 2 | 3;
  /** Opens once this node is passed. Keeps a challenge from arriving too early. */
  unlockAfter: string;
  /** Pre-placed gates. For bug hunts this is the broken circuit. */
  starter?: Array<{
    type: GateType;
    targets: number[];
    controls?: number[];
    params?: number[];
    column: number;
  }>;
  /** Offered only after a failed attempt, and never automatically. */
  hint: string;
  /**
   * One canonical answer, in order.
   *
   * Two jobs. It is what `tests/solvable.test.ts` asserts against — brute
   * forcing a five-gate answer out of a hundred-move palette is not a test, it
   * is a hang — and it is what backs "show me a solution", which PRD §11.2
   * gates behind three failed attempts.
   *
   * It is never THE answer. Grading is by state, so a learner who finds a
   * different route of the same length has done just as well.
   */
  reference: Array<{ type: GateType; targets: number[]; controls?: number[]; params?: number[] }>;
}

/** The W-state split: put a third of the weight on the first wire. */
const W_THETA = 2 * Math.acos(1 / Math.sqrt(3));
/** One in three on |1>. */
const THIRD_THETA = 2 * Math.asin(Math.sqrt(1 / 3));

export const CHALLENGES: Challenge[] = [
  /* -- Reach ---------------------------------------------------------------- */
  {
    id: "c.even",
    title: "An even coin",
    kind: "reach",
    brief: "Land |0⟩ and |1⟩ equally often.",
    qubits: 1,
    target: TARGETS.fairCoin(),
    allowedGates: ["h", "x", "ry", "measure"],
    par: 1,
    difficulty: 1,
    unlockAfter: "u0.n1",
    hint: "H does this in one gate. So does RY at a right angle.",
    reference: [{ type: "h", targets: [0] }],
  },
  {
    id: "c.third",
    title: "One in three",
    kind: "reach",
    brief: "Make |1⟩ come up a third of the time.",
    qubits: 1,
    target: distributionTarget(1, { "0": 2 / 3, "1": 1 / 3 }, "⅓ on |1⟩"),
    allowedGates: ["ry", "rx", "h", "x", "measure"],
    par: 1,
    difficulty: 2,
    unlockAfter: "u1.n5",
    hint: "P(|1⟩) = sin²(θ/2). Solve for a third and set the dial.",
    reference: [{ type: "ry", targets: [0], params: [THIRD_THETA] }],
  },
  {
    id: "c.minus",
    title: "The other even coin",
    kind: "reach",
    brief: "Build |−⟩ — the one whose histogram is identical to |+⟩'s.",
    qubits: 1,
    target: TARGETS.minus(),
    allowedGates: ["h", "z", "x", "s", "t", "measure"],
    par: 2,
    difficulty: 2,
    unlockAfter: "u2.n2",
    hint: "Two routes: a phase flip after H, or a bit flip before it.",
    reference: [{ type: "h", targets: [0] }, { type: "z", targets: [0] }],
  },
  {
    id: "c.iplus",
    title: "A quarter turn out",
    kind: "reach",
    brief: "Reach (|0⟩ + i|1⟩)/√2.",
    qubits: 1,
    target: stateTarget(1, [[R2, 0], [0, R2]], "|i+⟩"),
    allowedGates: ["h", "s", "sdg", "t", "z", "rz", "measure"],
    par: 2,
    difficulty: 2,
    unlockAfter: "u2.n3",
    hint: "Get onto the equator first, then turn a quarter of the way round it.",
    reference: [{ type: "h", targets: [0] }, { type: "s", targets: [0] }],
  },
  {
    id: "c.bell",
    title: "A pair that agrees",
    kind: "reach",
    brief: "Two qubits, always the same answer, neither deciding first.",
    qubits: 2,
    target: TARGETS.bellPhiPlus(),
    allowedGates: ["h", "cx", "cz", "x", "z", "measure"],
    par: 2,
    difficulty: 2,
    unlockAfter: "u3.n3",
    hint: "Superposition on one wire, then link the other to it.",
    reference: [{ type: "h", targets: [0] }, { type: "cx", targets: [1], controls: [0] }],
  },
  {
    id: "c.antibell",
    title: "A pair that disagrees",
    kind: "reach",
    brief: "|01⟩ half the time, |10⟩ half the time, and never a match.",
    qubits: 2,
    target: distributionTarget(2, { "01": 0.5, "10": 0.5 }, "always opposite"),
    allowedGates: ["h", "cx", "cz", "x", "z", "measure"],
    par: 3,
    difficulty: 2,
    unlockAfter: "u3.n3",
    hint: "Build the agreeing pair, then flip one of the wires.",
    reference: [{ type: "h", targets: [0] }, { type: "cx", targets: [1], controls: [0] }, { type: "x", targets: [1] }],
  },
  {
    id: "c.ghz",
    title: "Three that agree",
    kind: "reach",
    brief: "|000⟩ or |111⟩, never anything in between.",
    qubits: 3,
    target: TARGETS.ghz3(),
    allowedGates: ["h", "cx", "cz", "swap", "x", "measure"],
    par: 3,
    difficulty: 2,
    unlockAfter: "u3.n5",
    hint: "Chain it: link the second wire to the first, then the third to the second.",
    reference: [{ type: "h", targets: [0] }, { type: "cx", targets: [1], controls: [0] }, { type: "cx", targets: [2], controls: [1] }],
  },
  {
    id: "c.w3",
    title: "Exactly one",
    kind: "reach",
    brief: "Three wires, and exactly one of them reads 1 — equally likely which.",
    qubits: 3,
    target: distributionTarget(
      3,
      { "001": 1 / 3, "010": 1 / 3, "100": 1 / 3 },
      "the W state",
    ),
    allowedGates: ["h", "ry", "cx", "cry", "x", "measure"],
    par: 5,
    difficulty: 3,
    unlockAfter: "u3.n5",
    hint: "Split one third off the first wire, then split the remainder between the other two.",
    reference: [
      { type: "ry", targets: [0], params: [W_THETA] },
      { type: "cry", targets: [1], controls: [0], params: [Math.PI / 2] },
      { type: "cx", targets: [2], controls: [1] },
      { type: "cx", targets: [1], controls: [0] },
      { type: "x", targets: [0] },
    ],
  },

  /* -- Golf ------------------------------------------------------------------ */
  {
    id: "g.one",
    title: "Certainty, cheaply",
    kind: "golf",
    brief: "Reach a definite |1⟩.",
    qubits: 1,
    target: TARGETS.one(),
    allowedGates: ["h", "x", "z", "ry", "measure"],
    par: 1,
    difficulty: 1,
    unlockAfter: "u1.n2",
    hint: "There is a one-gate answer, and several three-gate ones.",
    reference: [{ type: "x", targets: [0] }],
  },
  {
    id: "g.bell",
    title: "Bell, in par",
    kind: "golf",
    brief: "The agreeing pair, in as few gates as you can manage.",
    qubits: 2,
    target: TARGETS.bellPhiPlus(),
    allowedGates: ["h", "cx", "cz", "x", "z", "s", "measure"],
    par: 2,
    difficulty: 2,
    unlockAfter: "u3.n3",
    hint: "Two gates is enough. Anything longer is doing work twice.",
    reference: [{ type: "h", targets: [0] }, { type: "cx", targets: [1], controls: [0] }],
  },
  {
    id: "g.flat",
    title: "Four ways, evenly",
    kind: "golf",
    brief: "Two wires, all four outcomes equally likely.",
    qubits: 2,
    target: TARGETS.flatTwo(),
    allowedGates: ["h", "x", "cx", "ry", "measure"],
    par: 2,
    difficulty: 1,
    unlockAfter: "u3.n1",
    hint: "The wires do not need to know about each other for this one.",
    reference: [{ type: "h", targets: [0] }, { type: "h", targets: [1] }],
  },

  /* -- Bug hunt --------------------------------------------------------------- */
  {
    id: "b.order",
    title: "Right gates, wrong day",
    kind: "bughunt",
    brief: "This was meant to be an agreeing pair. Both gates are correct.",
    qubits: 2,
    target: TARGETS.bellPhiPlus(),
    allowedGates: ["h", "cx", "cz", "x", "z", "measure"],
    par: 2,
    difficulty: 2,
    unlockAfter: "u3.n3",
    starter: [
      { type: "cx", targets: [1], controls: [0], column: 0 },
      { type: "h", targets: [0], column: 1 },
    ],
    hint: "A CNOT copies whatever the control has already decided. Has q0 decided yet?",
    reference: [{ type: "h", targets: [0] }, { type: "cx", targets: [1], controls: [0] }],
  },
  {
    id: "b.arrow",
    title: "Pointing the wrong way",
    kind: "bughunt",
    brief: "One gate is the right gate, aimed backwards.",
    qubits: 2,
    target: TARGETS.bellPhiPlus(),
    allowedGates: ["h", "cx", "cz", "x", "z", "measure"],
    par: 2,
    difficulty: 2,
    unlockAfter: "u3.n3",
    starter: [
      { type: "h", targets: [0], column: 0 },
      { type: "cx", targets: [0], controls: [1], column: 1 },
    ],
    hint: "Which wire is in superposition, and which one is the CNOT listening to?",
    reference: [{ type: "h", targets: [0] }, { type: "cx", targets: [1], controls: [0] }],
  },
  {
    id: "b.measured",
    title: "Read too early",
    kind: "bughunt",
    brief: "Every gate here is right. The circuit still cannot interfere.",
    qubits: 1,
    target: TARGETS.one(),
    allowedGates: ["h", "z", "x", "measure"],
    par: 3,
    difficulty: 3,
    unlockAfter: "u2.n4",
    starter: [
      { type: "h", targets: [0], column: 0 },
      { type: "measure", targets: [0], column: 1 },
      { type: "z", targets: [0], column: 2 },
      { type: "h", targets: [0], column: 3 },
    ],
    hint: "Measuring is not reading. What did the one in the middle cost you?",
    reference: [{ type: "h", targets: [0] }, { type: "z", targets: [0] }, { type: "h", targets: [0] }],
  },
];

export const CHALLENGES_BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]));

export const KIND_COPY: Record<ChallengeKind, { label: string; blurb: string }> = {
  reach: { label: "Reach", blurb: "Build anything that gets there." },
  golf: { label: "Golf", blurb: "Get there in the fewest gates." },
  bughunt: { label: "Bug hunt", blurb: "It is nearly right. Find the flaw." },
};

export const DIFFICULTY_COPY: Record<1 | 2 | 3, string> = {
  1: "Warm-up",
  2: "Solid",
  3: "Hard",
};

export function challengesByKind(kind: ChallengeKind): Challenge[] {
  return CHALLENGES.filter((c) => c.kind === kind);
}
