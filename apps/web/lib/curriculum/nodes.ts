/**
 * The curriculum spine — U0 to U3, nineteen nodes.
 *
 * Ideation §9 fixes the node anatomy, and every node here follows it:
 *   hook → attempt → diagnosis → instruction → completion → build → retrieval
 *
 * Two authoring rules, both from the learning-science table in Ideation §5:
 *
 *   1. INSTRUCTION COMES AFTER THE ATTEMPT. Productive failure (Kapur) only
 *      works if the struggle happens first, so `instruction` is never shown
 *      before a learner has tried. The tutor's diagnosis IS the instruction.
 *
 *   2. UNDER 40 WORDS PER BEAT. Brilliant's discipline. If a beat needs more
 *      words than that, the instrument is not doing its job and the fix is a
 *      better instrument, not a longer paragraph.
 *
 * Content is data, not hard-coded screens, so the same shapes drive the path,
 * the lesson player and the review bench.
 */

import type { GateType } from "@/lib/ir/types";
import { TARGETS, distributionTarget, stateTarget, type Target } from "@/lib/grade/fidelity";
import type { MisconceptionId } from "@/lib/tutor/rules";

const R2 = Math.SQRT1_2;

export interface Unit {
  id: string;
  ordinal: number;
  title: string;
  /** What a learner can do when this unit is finished. */
  terminalSkill: string;
}

export interface RetrievalPrompt {
  /** Short enough to answer on the way past, on the path itself. */
  question: string;
  options: string[];
  answerIndex: number;
  /** Shown after answering, right or wrong. Never just "correct". */
  because: string;
}

export interface LessonNode {
  id: string;
  unitId: string;
  ordinal: number;
  title: string;
  prerequisites: string[];
  estMinutes: number;

  /** Beat 1 — the hook. The target or the surprise, before any explanation. */
  hook: string;
  /** The task, in one imperative sentence. */
  task: string;
  /** A constraint or clarification, only when the task genuinely needs one. */
  taskNote?: string;

  qubits: number;
  target: Target;
  /** The palette for this node. Locked gates are visible but ghosted. */
  allowedGates: GateType[];
  /** Gates pre-placed on the canvas — the worked-example half of the fade. */
  starter?: Array<{ type: GateType; targets: number[]; controls?: number[]; params?: number[]; column: number }>;
  /** Fewest gates a correct answer needs. Shown after a pass, never before. */
  par: number;

  /** Beat 4 — instruction, delivered only after the attempt. */
  instructionTitle: string;
  instruction: string;

  /** Beat 6 — what was built, and the consequence they did not expect. */
  passNote: string;

  /** Beat 7 — scheduled to reappear in a later unit. */
  retrieval: RetrievalPrompt;

  /** Misconceptions this node is built to surface. Feeds the heatmap. */
  misconceptions: MisconceptionId[];
}

/* -- Units ------------------------------------------------------------------- */

export const UNITS: Unit[] = [
  {
    id: "u0",
    ordinal: 0,
    title: "What a qubit is not",
    terminalSkill: "Tell quantum behaviour apart from ordinary randomness",
  },
  {
    id: "u1",
    ordinal: 1,
    title: "One qubit",
    terminalSkill: "Build and read any single-qubit state",
  },
  {
    id: "u2",
    ordinal: 2,
    title: "Phase",
    terminalSkill: "Tell global phase from relative phase, and use both",
  },
  {
    id: "u3",
    ordinal: 3,
    title: "Two qubits",
    terminalSkill: "Build Bell and GHZ states, and explain why the Bloch sphere stops working",
  },
];

/* -- Nodes ------------------------------------------------------------------- */

export const NODES: LessonNode[] = [
  /* ===== U0 — What a qubit is not ========================================== */
  {
    id: "u0.n1",
    unitId: "u0",
    ordinal: 1,
    title: "An honest coin",
    prerequisites: [],
    estMinutes: 3,
    hook: "A fair coin is unpredictable, and completely lawful. You will never call it right on purpose — but the ratio holds.",
    task: "Build a circuit that comes back |0⟩ half the time and |1⟩ half the time.",
    taskNote: "One gate is enough. Try H.",
    qubits: 1,
    target: TARGETS.fairCoin(),
    allowedGates: ["h", "x", "measure"],
    par: 1,
    instructionTitle: "H puts a definite qubit on the fence",
    instruction:
      "H takes |0⟩ — a certainty — and turns it into an even lean between |0⟩ and |1⟩. The histogram over 1024 shots is how you read a lean: not one answer, a ratio.",
    passNote:
      "That is an even lean. Nothing about it is hidden — the qubit does not secretly hold a value you have not looked at yet. The next node is where that stops being a figure of speech.",
    retrieval: {
      question: "You run this same circuit 1024 more times. What changes?",
      options: [
        "The ratio stays near 50/50, the exact counts differ",
        "You get exactly 512 and 512 again",
        "The qubit remembers and gives the other answer",
      ],
      answerIndex: 0,
      because:
        "Sampling scatter is real. 'About half' is the correct reading; 'exactly 512' would be the suspicious one.",
    },
    misconceptions: [],
  },
  {
    id: "u0.n2",
    unitId: "u0",
    ordinal: 2,
    title: "A lean, not an answer",
    prerequisites: ["u0.n1"],
    estMinutes: 4,
    hook: "H gives you an even lean. But the lean is a dial, and you can set it anywhere.",
    task: "Make |1⟩ come up 85% of the time.",
    taskNote: "RY(θ) tilts the qubit. P(|1⟩) = sin²(θ/2).",
    qubits: 1,
    target: distributionTarget(1, { "0": 0.15, "1": 0.85 }, "85% |1⟩"),
    allowedGates: ["ry", "rx", "h", "x", "measure"],
    par: 1,
    instructionTitle: "The amplitude is not the odds",
    instruction:
      "RY sets an amplitude. Square it and you get the probability — which is why an even lean is 0.71 and 0.71, not 0.5 and 0.5. Squaring is the step everyone skips once.",
    passNote:
      "You set a probability by choosing an angle. Every quantum algorithm is this move repeated: arrange amplitudes so the answer you want is the one that survives squaring.",
    retrieval: {
      question: "An amplitude of 0.6 on |1⟩ means P(|1⟩) is:",
      options: ["0.36", "0.6", "0.775"],
      answerIndex: 0,
      because: "Probability is the amplitude squared. 0.6² = 0.36.",
    },
    misconceptions: [],
  },
  {
    id: "u0.n3",
    unitId: "u0",
    ordinal: 3,
    title: "Where the coin analogy dies",
    prerequisites: ["u0.n2"],
    estMinutes: 4,
    hook: "Flip a coin twice and it is still random. Do the quantum equivalent and the randomness cancels out completely.",
    task: "Apply H twice to |0⟩ and get |0⟩ back with certainty.",
    qubits: 1,
    target: stateTarget(1, [[1, 0], [0, 0]], "|0⟩ with certainty"),
    allowedGates: ["h", "x", "z", "measure"],
    par: 2,
    instructionTitle: "Amplitudes cancel. Probabilities cannot.",
    instruction:
      "After one H the qubit is not secretly 0 or 1. If it were, a second H would leave it random. Instead the two paths to |1⟩ cancel exactly, and |0⟩ comes back certain.",
    passNote:
      "A hidden value cannot do this. That cancellation — interference — is the entire reason a quantum computer is worth building, and you have now seen it in two gates.",
    retrieval: {
      question: "Why does H·H return |0⟩ with certainty?",
      options: [
        "The two paths to |1⟩ cancel",
        "H is its own inverse, so nothing happened",
        "The qubit was secretly |0⟩ the whole time",
      ],
      answerIndex: 0,
      because:
        "H is self-inverse, but that is the arithmetic, not the mechanism. The mechanism is cancellation — and it is why a hidden-value model fails here.",
    },
    misconceptions: ["M1"],
  },

  /* ===== U1 — One qubit ==================================================== */
  {
    id: "u1.n1",
    unitId: "u1",
    ordinal: 1,
    title: "X flips it",
    prerequisites: ["u0.n3"],
    estMinutes: 2,
    hook: "The simplest gate there is. X is the quantum NOT.",
    task: "Turn |0⟩ into |1⟩.",
    qubits: 1,
    target: TARGETS.one(),
    allowedGates: ["x", "h", "z", "measure"],
    par: 1,
    instructionTitle: "X exchanges |0⟩ and |1⟩",
    instruction:
      "On a definite state, X does exactly what NOT does to a bit. On a lean, it exchanges the two amplitudes — which is a different operation with the same name.",
    passNote:
      "One gate, one certainty. Worth noticing: X on |0⟩ is not random at all. Not every quantum gate produces uncertainty.",
    retrieval: {
      question: "X applied to an even lean gives:",
      options: ["The same even lean", "A definite |1⟩", "A definite |0⟩"],
      answerIndex: 0,
      because: "X swaps the two amplitudes. When they are equal, swapping them changes nothing.",
    },
    misconceptions: [],
  },
  {
    id: "u1.n2",
    unitId: "u1",
    ordinal: 2,
    title: "Getting back to certainty",
    prerequisites: ["u1.n1"],
    estMinutes: 3,
    hook: "You can go from a certainty to a lean. Going back is the useful direction.",
    task: "Starting from |0⟩, reach a definite |1⟩ using H at least once.",
    taskNote: "There is more than one route. Any of them passes.",
    qubits: 1,
    target: TARGETS.one(),
    allowedGates: ["h", "x", "z", "measure"],
    starter: [{ type: "h", targets: [0], column: 0 }],
    par: 3,
    instructionTitle: "Two different circuits, one state",
    instruction:
      "H, Z, H reaches |1⟩. So does a plain X. The grader compares the state you produced, never the gates you used — so both are correct, and that is a fact about physics, not a leniency.",
    passNote:
      "Someone else solved this with a single X. Both answers are right: two circuits that reach the same state are the same operation, written differently.",
    retrieval: {
      question: "Two circuits reach the same state by different routes. The grader:",
      options: ["Passes both", "Passes the shorter one", "Passes the one matching the reference"],
      answerIndex: 0,
      because:
        "Grading compares states. A platform that compares gate lists teaches ritual and rejects correct answers.",
    },
    misconceptions: [],
  },
  {
    id: "u1.n3",
    unitId: "u1",
    ordinal: 3,
    title: "Measuring is deciding",
    prerequisites: ["u1.n2"],
    estMinutes: 4,
    hook: "Measure a leaning qubit, then measure it again. The second reading tells you nothing new.",
    task: "Put q0 on the fence, measure it, then apply H again and measure.",
    taskNote: "Watch what the first measurement costs you.",
    qubits: 1,
    target: TARGETS.fairCoin(),
    allowedGates: ["h", "x", "measure"],
    par: 3,
    instructionTitle: "Measurement is not a peek",
    instruction:
      "Without the measurement, H·H returns |0⟩ with certainty. With it, you get 50/50. Reading the qubit destroyed the lean that the second H needed — you did not discover a value, you created one.",
    passNote:
      "This is the difference between observing and reading. Everything that survives to the end of a circuit has to stay unmeasured until then.",
    retrieval: {
      question: "You measure a qubit, get |1⟩, and measure the same qubit again. You get:",
      options: ["|1⟩, with certainty", "50/50 again", "|0⟩, because it flipped"],
      answerIndex: 0,
      because: "The first measurement decided the value. There is no lean left to collapse.",
    },
    misconceptions: ["M7"],
  },
  {
    id: "u1.n4",
    unitId: "u1",
    ordinal: 4,
    title: "The sphere",
    prerequisites: ["u1.n3"],
    estMinutes: 4,
    hook: "Every state of one qubit is a point on a sphere. |0⟩ is the north pole; |1⟩ is the south.",
    task: "Put q0 on the equator, pointing along +X.",
    taskNote: "That state is called |+⟩.",
    qubits: 1,
    target: TARGETS.plus(),
    allowedGates: ["h", "x", "z", "ry", "measure"],
    par: 1,
    instructionTitle: "The equator is where the odds are even",
    instruction:
      "Height on the sphere is the odds: poles are certainties, the equator is 50/50. Position around the equator is phase — invisible to a measurement in this basis, and the subject of the next unit.",
    passNote:
      "|+⟩ sits on the surface, which means the qubit has a state entirely its own. Hold on to that. In Unit 3 you will build a qubit that does not.",
    retrieval: {
      question: "A qubit on the equator of the Bloch sphere reads:",
      options: ["50/50", "Always |0⟩", "It depends on the phase"],
      answerIndex: 0,
      because: "Height sets the odds. Everywhere on the equator is an even lean, whatever the phase.",
    },
    misconceptions: ["M4"],
  },
  {
    id: "u1.n5",
    unitId: "u1",
    ordinal: 5,
    title: "Any odds you like",
    prerequisites: ["u1.n4"],
    estMinutes: 3,
    hook: "The dial goes anywhere between the poles.",
    task: "Reach a state that gives |1⟩ exactly a quarter of the time.",
    qubits: 1,
    target: distributionTarget(1, { "0": 0.75, "1": 0.25 }, "25% |1⟩"),
    allowedGates: ["ry", "rx", "h", "x", "measure"],
    par: 1,
    instructionTitle: "RY(θ) tilts by θ",
    instruction:
      "P(|1⟩) = sin²(θ/2). For a quarter, θ = π/3. The parameter field takes π-expressions, so you can write what you mean rather than a decimal.",
    passNote:
      "You can now reach any point on the front half of the sphere. The back half needs phase, which is Unit 2.",
    retrieval: {
      question: "To make |1⟩ certain with RY, you need θ =",
      options: ["π", "π/2", "2π"],
      answerIndex: 0,
      because: "sin²(π/2) = 1. A π rotation carries the north pole to the south pole.",
    },
    misconceptions: [],
  },
  {
    id: "u1.n6",
    unitId: "u1",
    ordinal: 6,
    title: "Build it unaided",
    prerequisites: ["u1.n5"],
    estMinutes: 4,
    hook: "No hints on this one. You have every gate you need.",
    task: "Reach the state that gives |1⟩ 90% of the time, and read it out.",
    qubits: 1,
    target: distributionTarget(1, { "0": 0.1, "1": 0.9 }, "90% |1⟩"),
    allowedGates: ["ry", "rx", "rz", "h", "x", "z", "s", "t", "measure"],
    par: 2,
    instructionTitle: "You have the whole single-qubit toolkit",
    instruction:
      "Rotation for the odds, measurement to read it out. Everything in Unit 1 was one qubit; everything interesting starts when there are two.",
    passNote:
      "That is Unit 1 complete. You can build and read any state of one qubit — which is exactly the point where most explanations of quantum computing start, and you got here by building.",
    retrieval: {
      question: "Which of these does NOT change the odds of a measurement in the Z basis?",
      options: ["Z", "X", "RY(π/4)"],
      answerIndex: 0,
      because: "Z changes phase only. Unit 2 is about what that is good for.",
    },
    misconceptions: [],
  },

  /* ===== U2 — Phase ======================================================== */
  {
    id: "u2.n1",
    unitId: "u2",
    ordinal: 1,
    title: "The gate that does nothing",
    prerequisites: ["u1.n6"],
    estMinutes: 3,
    hook: "Add a Z to |0⟩ and run it. Nothing happens. This is not a bug and it is worth four minutes.",
    task: "Reach |1⟩ — and try putting a Z somewhere to see what it costs you.",
    qubits: 1,
    target: TARGETS.one(),
    allowedGates: ["z", "x", "h", "s", "t", "measure"],
    par: 1,
    instructionTitle: "A phase on the whole state is undetectable",
    instruction:
      "Z multiplies |1⟩ by −1. If the qubit is entirely |0⟩ or entirely |1⟩, that factor applies to everything, and no measurement in any basis can see it. Fidelity ignores it too — which is why it passes.",
    passNote:
      "Global phase is real arithmetic with no observable consequence. The moment a state is split across |0⟩ and |1⟩, though, Z stops being invisible. That is the next node.",
    retrieval: {
      question: "Z applied to |1⟩ produces −|1⟩. A measurement can tell the difference:",
      options: ["Never", "Only in the X basis", "Always"],
      answerIndex: 0,
      because: "A phase on the entire state is unobservable in every basis. Only relative phase is measurable.",
    },
    misconceptions: ["M5"],
  },
  {
    id: "u2.n2",
    unitId: "u2",
    ordinal: 2,
    title: "The same odds, a different state",
    prerequisites: ["u2.n1"],
    estMinutes: 4,
    hook: "|+⟩ and |−⟩ both read 50/50. They are not the same state, and one measurement tells them apart.",
    task: "Build |−⟩.",
    taskNote: "Its histogram looks exactly like |+⟩'s. The grader is not fooled, and neither should you be.",
    qubits: 1,
    target: TARGETS.minus(),
    allowedGates: ["h", "z", "x", "s", "t", "measure"],
    par: 2,
    instructionTitle: "Relative phase is measurable",
    instruction:
      "Apply H to |+⟩ and you get |0⟩ with certainty. Apply H to |−⟩ and you get |1⟩ with certainty. Same 50/50 in this basis, opposite certainties in that one.",
    passNote:
      "Global phase is undetectable; relative phase decides the answer. Every algorithm that beats a classical one lives in that gap.",
    retrieval: {
      question: "|+⟩ and |−⟩ differ by:",
      options: ["A relative phase, which is measurable", "A global phase, which is not", "Nothing at all"],
      answerIndex: 0,
      because: "The sign sits on one amplitude, not on both. Change basis with H and the difference becomes a certainty.",
    },
    misconceptions: ["M5", "M6"],
  },
  {
    id: "u2.n3",
    unitId: "u2",
    ordinal: 3,
    title: "Quarter turns",
    prerequisites: ["u2.n2"],
    estMinutes: 3,
    hook: "Z is a half turn of phase. S is a quarter. T is an eighth. They stack.",
    task: "Reach the state (|0⟩ + i|1⟩)/√2.",
    taskNote: "That is |+⟩ with a quarter turn of phase on |1⟩.",
    qubits: 1,
    target: stateTarget(1, [[R2, 0], [0, R2]], "|i+⟩"),
    allowedGates: ["h", "s", "t", "z", "x", "rz", "measure"],
    par: 2,
    instructionTitle: "Phase gates accumulate",
    instruction:
      "T twice is S. S twice is Z. Z twice is nothing at all. Phase is an angle, and angles wrap — which is why the phase colour wheel in this app is a wheel.",
    passNote:
      "You just moved a state around the equator without changing its odds once. Position on the equator is the only thing that changed, and it is invisible to a Z-basis measurement.",
    retrieval: {
      question: "T applied four times is equivalent to:",
      options: ["Z", "S", "The identity"],
      answerIndex: 0,
      because: "T is an eighth turn. Four of them make a half turn, which is Z.",
    },
    misconceptions: [],
  },
  {
    id: "u2.n4",
    unitId: "u2",
    ordinal: 4,
    title: "Invisible, then decisive",
    prerequisites: ["u2.n3"],
    estMinutes: 5,
    hook: "H, then a phase, then H again. The phase is unmeasurable in the middle and decides everything at the end.",
    task: "Use H, Z, H to turn |0⟩ into a certain |1⟩.",
    taskNote: "Check the reading between the gates if you want to see the point.",
    qubits: 1,
    target: TARGETS.one(),
    allowedGates: ["h", "z", "s", "t", "p", "x", "measure"],
    starter: [{ type: "h", targets: [0], column: 0 }],
    par: 3,
    instructionTitle: "This is what a quantum computer sells",
    instruction:
      "Halfway through, the qubit reads 50/50 and a measurement there would learn nothing and destroy everything. The second H converts that unmeasurable phase into a certainty. Probabilities can only add; amplitudes can cancel.",
    passNote:
      "Interference, in three gates. Deutsch–Jozsa, Grover and Shor are all this move, arranged so the wrong answers cancel and the right one survives.",
    retrieval: {
      question: "Measuring between the two H gates would:",
      options: [
        "Destroy the phase and give 50/50 at the end",
        "Show the phase directly",
        "Make no difference",
      ],
      answerIndex: 0,
      because: "The middle reading is 50/50 whatever the phase — and taking it collapses the lean the second H needs.",
    },
    misconceptions: ["M7"],
  },
  {
    id: "u2.n5",
    unitId: "u2",
    ordinal: 5,
    title: "Phase, unaided",
    prerequisites: ["u2.n4"],
    estMinutes: 4,
    hook: "Everything from Unit 2, no scaffolding.",
    task: "Reach (|0⟩ − i|1⟩)/√2.",
    qubits: 1,
    target: stateTarget(1, [[R2, 0], [0, -R2]], "|i−⟩"),
    allowedGates: ["h", "s", "sdg", "t", "tdg", "z", "x", "rz", "p", "measure"],
    par: 2,
    instructionTitle: "Both directions around the equator",
    instruction:
      "S turns one way, S† turns the other. Having both means you can reach any point on the equator in at most a few gates.",
    passNote:
      "Unit 2 complete. You can put a qubit anywhere on the sphere. Two qubits is where the sphere stops being enough.",
    retrieval: {
      question: "Which pair of states is distinguishable by a Z-basis measurement alone?",
      options: ["|0⟩ and |1⟩", "|+⟩ and |−⟩", "|i+⟩ and |i−⟩"],
      answerIndex: 0,
      because: "The other two pairs differ only by phase, and read identically until you change basis.",
    },
    misconceptions: ["M6"],
  },

  /* ===== U3 — Two qubits =================================================== */
  {
    id: "u3.n1",
    unitId: "u3",
    ordinal: 1,
    title: "Two separate stories",
    prerequisites: ["u2.n5"],
    estMinutes: 4,
    hook: "Two qubits, four outcomes. Every one of them is a plain multiplication.",
    task: "Put both qubits on the fence, so all four outcomes are equally likely.",
    qubits: 2,
    target: TARGETS.flatTwo(),
    allowedGates: ["h", "x", "z", "measure"],
    par: 2,
    instructionTitle: "Independent means multiply",
    instruction:
      "P(00) is P(q0 = 0) × P(q1 = 0). Four even bars, and knowing q0 still tells you nothing about q1. Hold on to that multiplication — it is the test you are about to run on something that fails it.",
    passNote:
      "A flat table is not a linked one. These two qubits are as independent as two separate coins, and the arithmetic proves it.",
    retrieval: {
      question: "Four outcomes at 25% each means the qubits are:",
      options: ["Independent", "Entangled", "Impossible to tell apart"],
      answerIndex: 0,
      because: "0.5 × 0.5 = 0.25 for every row. The multiplication works, so the register factorises.",
    },
    misconceptions: [],
  },
  {
    id: "u3.n2",
    unitId: "u3",
    ordinal: 2,
    title: "One qubit acting on another",
    prerequisites: ["u3.n1"],
    estMinutes: 4,
    hook: "CNOT flips the target when the control is 1. On definite inputs, the whole gate is four boring rows.",
    task: "Use CNOT to turn |10⟩ into |11⟩.",
    taskNote: "q1 is already 1. Copy that decision onto q0.",
    qubits: 2,
    target: stateTarget(2, [[0, 0], [0, 0], [0, 0], [1, 0]], "|11⟩"),
    allowedGates: ["x", "cx", "cz", "h", "measure"],
    starter: [{ type: "x", targets: [1], column: 0 }],
    par: 2,
    instructionTitle: "Bookkeeping — for now",
    instruction:
      "On a definite control, CNOT copies a decision that has already been made, and it never needed to look at the target to do it. Nothing surprising has happened yet.",
    passNote:
      "Four rows, no surprises. Now feed the control a lean instead of a decision, and the same gate stops being bookkeeping.",
    retrieval: {
      question: "CNOT with control |0⟩ and target |1⟩ gives:",
      options: ["Control |0⟩, target |1⟩", "Control |0⟩, target |0⟩", "Control |1⟩, target |1⟩"],
      answerIndex: 0,
      because: "The control is 0, so the target is left alone.",
    },
    misconceptions: [],
  },
  {
    id: "u3.n3",
    unitId: "u3",
    ordinal: 3,
    title: "Two coins, one answer",
    prerequisites: ["u3.n2"],
    estMinutes: 6,
    hook: "Build a pair that always agrees — without either qubit deciding first.",
    task: "Reach a state that gives |00⟩ half the time and |11⟩ half the time, and never |01⟩ or |10⟩.",
    taskNote: "Two gates is enough.",
    qubits: 2,
    target: TARGETS.bellDistribution(),
    allowedGates: ["h", "cx", "cz", "x", "z", "measure"],
    par: 2,
    instructionTitle: "The multiplication fails, and that failure is the concept",
    instruction:
      "Run the test from the last node. Each qubit alone reads 50/50, so independence predicts 25% on every row. The register says 50/0/0/50. No pair of independent leans can produce that table.",
    passNote:
      "That is a Bell state. Entanglement is not the correlation — a pair of coins glued together at the factory would be correlated too. It is the failure of the multiplication that would otherwise explain it.",
    retrieval: {
      question: "Why is |00⟩ + |11⟩ not just two coins secretly set to match?",
      options: [
        "Because no two independent leans multiply out to that table",
        "Because measuring one sends a signal to the other",
        "Because the qubits are physically touching",
      ],
      answerIndex: 0,
      because:
        "Nothing travels between them. The pair never had two separate stories for a signal to travel between — it had one joint description all along.",
    },
    misconceptions: ["M3", "M8"],
  },
  {
    id: "u3.n4",
    unitId: "u3",
    ordinal: 4,
    title: "Where the sphere runs out",
    prerequisites: ["u3.n3"],
    estMinutes: 4,
    hook: "Open the Bloch sphere on a qubit of your Bell pair. It sits at the dead centre.",
    task: "Build the Bell state again, then look at q0 on the sphere.",
    taskNote: "The centre is the answer, not an error.",
    qubits: 2,
    target: TARGETS.bellPhiPlus(),
    allowedGates: ["h", "cx", "cz", "x", "z", "s", "measure"],
    par: 2,
    instructionTitle: "No individual state to draw",
    instruction:
      "The sphere holds every state one qubit can have on its own. An entangled qubit does not have one — only the pair does. A point at the centre means exactly that, and it is the signature of entanglement rather than a rendering failure.",
    passNote:
      "The state-vector table still works here, which is why this app treats it as a peer view rather than a fallback. Two qubits need four numbers, and a sphere only has room for one qubit's worth.",
    retrieval: {
      question: "A qubit whose Bloch vector is at the centre of the sphere is:",
      options: [
        "Entangled, or otherwise mixed — it has no state of its own",
        "In an even superposition",
        "Broken",
      ],
      answerIndex: 0,
      because: "Length on the sphere is purity. Zero length means no individual state exists to draw.",
    },
    misconceptions: ["M4"],
  },
  {
    id: "u3.n5",
    unitId: "u3",
    ordinal: 5,
    title: "Three that agree",
    prerequisites: ["u3.n4"],
    estMinutes: 5,
    hook: "Two qubits that always agree. Now do three.",
    task: "Reach |000⟩ half the time and |111⟩ half the time.",
    qubits: 3,
    target: TARGETS.ghz3(),
    allowedGates: ["h", "cx", "cz", "x", "z", "swap", "measure"],
    par: 3,
    instructionTitle: "Entanglement chains",
    instruction:
      "One H and two CNOTs. Each CNOT ties another wire to a decision that has still not been made. Nothing here is limited to two qubits.",
    passNote:
      "That is a GHZ state — and the whole of Unit 3. You can build entangled registers, run the factorisation test that proves they are entangled, and explain why the Bloch sphere goes quiet.",
    retrieval: {
      question: "Measuring one qubit of a GHZ₃ state gives |1⟩. The other two are now:",
      options: ["Both |1⟩", "Both still 50/50", "One |1⟩ and one |0⟩"],
      answerIndex: 0,
      because: "The state has only two branches. Learning which one you are in fixes all three wires at once.",
    },
    misconceptions: ["M3", "M8"],
  },
];

/* -- Graph helpers ----------------------------------------------------------- */

export const NODES_BY_ID = new Map(NODES.map((n) => [n.id, n]));

export function nodesInUnit(unitId: string): LessonNode[] {
  return NODES.filter((n) => n.unitId === unitId).sort((a, b) => a.ordinal - b.ordinal);
}

export function unitOf(nodeId: string): Unit | undefined {
  const node = NODES_BY_ID.get(nodeId);
  return node ? UNITS.find((u) => u.id === node.unitId) : undefined;
}

/** Nodes that list `nodeId` as a prerequisite. */
export function childrenOf(nodeId: string): LessonNode[] {
  return NODES.filter((n) => n.prerequisites.includes(nodeId));
}

/** Reading order across the whole curriculum. */
export const NODE_ORDER: string[] = NODES.map((n) => n.id);

export function nextNodeId(nodeId: string): string | null {
  const i = NODE_ORDER.indexOf(nodeId);
  return i >= 0 && i < NODE_ORDER.length - 1 ? NODE_ORDER[i + 1] : null;
}
