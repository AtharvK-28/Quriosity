/**
 * Study material — the written half of the instruction beat.
 *
 * Two things per node, both derived from the video briefs in
 * docs/05-Video-Production-Guide.md so that the page and the narration cannot
 * drift apart:
 *
 *   notes — the concept as statements, for revision rather than discovery.
 *   cards — extra retrieval prompts.
 *
 * ON CARDS AND "FLASHCARDS". A flashcard in this product is a `RetrievalPrompt`
 * and nothing else. There is no second type, no second store and no second
 * scheduler — the review bench's SM-2 already schedules by node, and these
 * simply give it more than one question to ask so a returning learner is
 * recalling the concept rather than the position of an answer they have seen
 * four times.
 *
 * WHY THIS IS NOT IN nodes.ts. That file is the curriculum spine and holds one
 * beat per field under a 40-word rule. Notes are deliberately longer than a
 * beat and are read after the work, so they sit in a layer beside it — the same
 * shape as media.ts.
 *
 * Every node has a pack, including the two consolidation nodes. The no-video
 * rule does not apply here: notes appear on the pass screen, after the attempt,
 * exactly where `instruction` already does.
 */

import { NODES_BY_ID, type RetrievalPrompt } from "@/lib/curriculum/nodes";

export interface StudyPack {
  /** Statements, not prose. Five to seven, in the voice of `instruction`. */
  notes: string[];
  /** Asked after the video, and rotated through by the review bench. */
  cards: RetrievalPrompt[];
}

export const STUDY: Record<string, StudyPack> = {
  /* ===== U0 — What a qubit is not ========================================== */

  "u0.n1": {
    notes: [
      "H turns a definite |0⟩ into an even lean between |0⟩ and |1⟩.",
      "A lean is not a hidden value. The qubit does not secretly hold 0 or 1.",
      "A measurement returns one classical bit, never a fraction, so a lean is only visible across many runs.",
      "This platform runs 1024 shots by default; the histogram counts outcomes across them.",
      "Two bars near 512 with some scatter is the correct reading. Exactly 512 would be the suspicious one.",
      "The ratio is a property of the state. The exact counts are a property of this particular batch.",
    ],
    cards: [
      {
        question: "A single measurement of a leaning qubit tells you:",
        options: [
          "Which outcome came up, and nothing about the lean",
          "The two probabilities",
          "Half a bit",
        ],
        answerIndex: 0,
        because: "One run returns one outcome. The lean only appears in the tally across many of them.",
      },
      {
        question: "Why run 1024 shots rather than one?",
        options: [
          "A lean can only be read as a ratio across runs",
          "To make the simulation more accurate",
          "To average out hardware noise",
        ],
        answerIndex: 0,
        because: "Each run collapses to a single bit. The ratio between runs is what carries the state.",
      },
    ],
  },

  "u0.n2": {
    notes: [
      "RY(θ) tilts the qubit away from |0⟩, and P(|1⟩) = sin²(θ/2).",
      "θ = 0 gives a certain |0⟩; θ = π gives a certain |1⟩; everything between is a lean you chose.",
      "The state stores amplitudes, not probabilities. The probability is the amplitude squared.",
      "An even lean has amplitudes 0.707 and 0.707 — not 0.5 and 0.5.",
      "An amplitude of 0.6 means a probability of 0.36, not 60%.",
      "Amplitudes can be negative or complex; probabilities never can. Everything interesting lives in that gap.",
      "The histogram shows you the squares. The amplitude table shows what the gates actually act on.",
    ],
    cards: [
      {
        question: "To reach P(|1⟩) = 0.5 with RY, θ is:",
        options: ["π/2", "π/4", "π"],
        answerIndex: 0,
        because: "P(|1⟩) = sin²(θ/2), and sin²(π/4) = 0.5. Half the way to the south pole.",
      },
      {
        question: "Two states have amplitudes (0.6, 0.8) and (0.8, 0.6). Their histograms:",
        options: [
          "Differ — 36/64 against 64/36",
          "Are identical, because the same numbers appear",
          "Cannot be compared without more shots",
        ],
        answerIndex: 0,
        because: "Squaring gives 0.36/0.64 and 0.64/0.36. Swapping the amplitudes swaps the odds.",
      },
    ],
  },

  "u0.n3": {
    notes: [
      "H applied twice to |0⟩ returns |0⟩ with certainty — one full bar, no scatter.",
      "A hidden value cannot produce that: if the first H secretly picked 0 the second gives 50/50, and if it picked 1 it also gives 50/50.",
      "The machine produces a certainty, which neither branch reaches. So there was no hidden value.",
      "After the first H both amplitudes are positive; the second H sends each onto both outputs.",
      "The two routes to |1⟩ arrive with opposite signs and equal size, so they sum to zero.",
      "The two routes to |0⟩ arrive with the same sign and reinforce.",
      "“H is its own inverse” is the arithmetic, not the mechanism — it would predict the same result for a coin, which is false.",
    ],
    cards: [
      {
        question: "Interference requires amplitudes that can be:",
        options: ["Negative", "Larger than one", "Irrational"],
        answerIndex: 0,
        because: "Probabilities can only pile up. A sign is what lets two routes cancel.",
      },
      {
        question: "After H·H the outcome |1⟩ is:",
        options: [
          "Unavailable — its amplitude is exactly zero",
          "Rare, but it turns up occasionally",
          "As likely as |0⟩",
        ],
        answerIndex: 0,
        because: "Cancellation removes the outcome. It does not merely make it unlikely.",
      },
    ],
  },

  /* ===== U1 — One qubit ==================================================== */

  "u1.n1": {
    notes: [
      "X exchanges the amplitudes of |0⟩ and |1⟩.",
      "On a definite state that looks exactly like a classical NOT.",
      "On an even lean the two amplitudes are equal, so exchanging them changes nothing at all.",
      "“Quantum NOT” is a nickname for the definite case, not a definition of the gate.",
      "X on |0⟩ is completely certain — not every quantum gate produces uncertainty.",
    ],
    cards: [
      {
        question: "X applied to |+⟩ gives:",
        options: ["|+⟩, unchanged", "|−⟩", "A certain |1⟩"],
        answerIndex: 0,
        because: "|+⟩ has two equal positive amplitudes. Swapping equal things changes nothing.",
      },
      {
        question: "X applied twice to any state gives:",
        options: ["The original state", "An even lean", "The opposite state"],
        answerIndex: 0,
        because: "Exchanging the two amplitudes and exchanging them back is doing nothing.",
      },
    ],
  },

  "u1.n2": {
    notes: [
      "Several different circuits reach the same state: a single X reaches |1⟩, and so does H, Z, H.",
      "The grader compares the state you produced against the state the task asked for.",
      "It never compares your gate list to a reference gate list.",
      "Two circuits that produce the same state are the same operation, written differently.",
      "Gate-list grading rejects correct answers for being unfamiliar, and teaches ritual instead of physics.",
      "Global phase is ignored for the same reason — no measurement in any basis can see it.",
    ],
    cards: [
      {
        question: "You solve a node in two gates and par is three. The grader:",
        options: [
          "Passes it — grading is on state, not gate count",
          "Fails it for not matching par",
          "Passes it but marks the answer non-standard",
        ],
        answerIndex: 0,
        because: "Par is reported after a pass. It is information about the node, not a requirement.",
      },
      {
        question: "A platform that checks your gate sequence against the author's teaches:",
        options: ["Ritual — guessing what the author meant", "Efficiency", "Correct physics"],
        answerIndex: 0,
        because: "It rejects correct answers that look unfamiliar, which trains imitation instead of reasoning.",
      },
    ],
  },

  "u1.n3": {
    notes: [
      "H·H returns |0⟩ with certainty. H, measure, H returns 50/50.",
      "The only difference is one mid-circuit measurement, and it costs the certainty.",
      "Measuring is not peeking: if the value already existed, reading it could not change the outcome.",
      "A measurement decides. Before it there are two amplitudes and no value; after it there is a value and no lean.",
      "The second H had nothing left to interfere with.",
      "Measuring the same qubit twice gives the same answer — the first reading already decided it.",
      "Anything that has to survive to the end of a circuit stays unmeasured until then.",
    ],
    cards: [
      {
        question: "Measurement is best described as:",
        options: [
          "An irreversible operation on the state",
          "A read-only observation",
          "A pause in the circuit",
        ],
        answerIndex: 0,
        because: "It destroys the lean. Nothing about it is free, and nothing about it is reversible.",
      },
      {
        question: "You measure mid-circuit and get |0⟩. The state immediately after is:",
        options: [
          "Definitely |0⟩, with no lean left",
          "The lean it had before",
          "Random again",
        ],
        answerIndex: 0,
        because: "The reading collapsed it onto |0⟩. There is nothing left to collapse.",
      },
    ],
  },

  "u1.n4": {
    notes: [
      "Every state one qubit can have on its own is a point on the Bloch sphere.",
      "The north pole is |0⟩ and the south pole is |1⟩.",
      "Latitude is the odds: the poles are certainties and the equator is 50/50.",
      "Longitude is phase, and it does not change the odds in this basis.",
      "|+⟩ sits on the equator, pointing along +X.",
      "The length of the arrow is purity, and for any state one qubit can have alone it is exactly one.",
    ],
    cards: [
      {
        question: "Two states sit at the same latitude, different longitudes. Their Z-basis histograms:",
        options: ["Are identical", "Differ", "Cannot be computed"],
        answerIndex: 0,
        because: "Latitude sets the odds. Longitude is phase, and a Z-basis measurement cannot see it.",
      },
      {
        question: "An arrow shorter than the sphere's radius means:",
        options: [
          "The qubit has no state entirely of its own",
          "The simulator lost precision",
          "The qubit is close to |0⟩",
        ],
        answerIndex: 0,
        because: "Length is purity. Anything short of the surface is a mixed state.",
      },
    ],
  },

  "u1.n5": {
    notes: [
      "P(|1⟩) = sin²(θ/2) is the whole of RY's behaviour.",
      "θ = π/3 gives 25%, θ = π/2 gives 50%, θ = π gives 100%.",
      "The parameter field accepts π-expressions, so you can write the angle you mean rather than a decimal.",
      "RY reaches any latitude, which is any set of odds.",
      "It cannot reach the back of the sphere. That needs phase, which is Unit 2.",
    ],
    cards: [
      {
        question: "RY(π/2) applied to |0⟩ produces:",
        options: ["An even lean — the same odds as H", "A certain |1⟩", "A certain |0⟩"],
        answerIndex: 0,
        because: "sin²(π/4) = 0.5. It lands on the equator, as H does.",
      },
      {
        question: "To move a state around the equator without changing its odds you need:",
        options: ["A phase gate", "RY with a larger angle", "A measurement"],
        answerIndex: 0,
        because: "RY changes latitude. Longitude is phase — the subject of the next unit.",
      },
    ],
  },

  "u1.n6": {
    notes: [
      "Rotation sets the odds; measurement reads them out. That is the whole single-qubit toolkit.",
      "RY reaches any point on the front half of the sphere.",
      "A Z-basis measurement cannot distinguish two states that differ only in phase.",
      "Everything in Unit 1 was one qubit. Everything interesting starts when there are two.",
    ],
    cards: [
      {
        question: "You need P(|1⟩) = 0.9. Which single gate reaches it from |0⟩?",
        options: ["RY with θ = 2·arcsin(√0.9)", "H", "X"],
        answerIndex: 0,
        because: "P(|1⟩) = sin²(θ/2), so θ = 2·arcsin(√0.9) ≈ 2.50 radians.",
      },
      {
        question: "Which of these leaves a Z-basis histogram completely unchanged?",
        options: ["S", "RY(π/4)", "X"],
        answerIndex: 0,
        because: "S is a phase gate. It moves the state around the equator without touching the odds.",
      },
    ],
  },

  /* ===== U2 — Phase ======================================================== */

  "u2.n1": {
    notes: [
      "Z multiplies the |1⟩ amplitude by −1 and leaves |0⟩ alone.",
      "On a state that is entirely |0⟩ or entirely |1⟩, that factor applies to everything.",
      "A factor applied to the whole state is a global phase.",
      "Probability is the squared magnitude, and squaring destroys the sign.",
      "Global phase is not hard to measure — it is not a physical property at all.",
      "The grader ignores it, because marking it would be marking notation rather than physics.",
      "The moment a state is split across |0⟩ and |1⟩, Z stops being invisible.",
    ],
    cards: [
      {
        question: "|1⟩ and −|1⟩ are:",
        options: [
          "One state written two ways",
          "Two states that are very hard to tell apart",
          "Orthogonal states",
        ],
        answerIndex: 0,
        because: "No experiment in any basis separates them. They are one physical state.",
      },
      {
        question: "Z applied to |0⟩ does:",
        options: ["Nothing at all", "Adds a global phase", "Flips it to |1⟩"],
        answerIndex: 0,
        because: "Z acts only on the |1⟩ amplitude, and |0⟩ has none to act on.",
      },
    ],
  },

  "u2.n2": {
    notes: [
      "|+⟩ has two positive amplitudes; |−⟩ carries a minus sign on the |1⟩ amplitude.",
      "Both read 50/50 in the Z basis, and no number of shots separates them.",
      "A sign on one amplitude and not the other is a relative phase.",
      "Apply H to |+⟩ and you get a certain |0⟩; apply H to |−⟩ and you get a certain |1⟩.",
      "Changing basis is not extracting hidden information — it is asking a different physical question.",
      "Same odds does not mean same state.",
    ],
    cards: [
      {
        question: "|+⟩ and |−⟩ are told apart by:",
        options: [
          "Applying H and then measuring",
          "Taking more shots in the Z basis",
          "Nothing — they are the same state",
        ],
        answerIndex: 0,
        because: "H rotates the measurement onto the axis where the sign becomes a certainty.",
      },
      {
        question: "A relative phase differs from a global phase because it:",
        options: [
          "Sits on one amplitude and not the other",
          "Is a larger angle",
          "Applies to the whole state at once",
        ],
        answerIndex: 0,
        because: "A factor on everything vanishes when you square. A factor on one component does not.",
      },
    ],
  },

  "u2.n3": {
    notes: [
      "Z is a half turn of phase (π), S a quarter (π/2), T an eighth (π/4).",
      "They compose by adding angles: T·T = S, S·S = Z, and Z·Z is the identity.",
      "Four T gates make a Z. Eight make nothing at all.",
      "H then S takes |0⟩ to (|0⟩ + i|1⟩)/√2.",
      "A phase gate moves the state around the equator without touching the odds.",
      "Phase is an angle and angles wrap, which is why this app draws it as a colour wheel.",
    ],
    cards: [
      {
        question: "S applied twice is equivalent to:",
        options: ["Z", "T", "The identity"],
        answerIndex: 0,
        because: "S is a quarter turn. Two quarters make a half turn, which is Z.",
      },
      {
        question: "Applying S to |+⟩ changes:",
        options: [
          "The phase only — the histogram is unchanged",
          "The odds, to 25/75",
          "Nothing at all",
        ],
        answerIndex: 0,
        because: "Both amplitudes keep their magnitude. Only the longitude moved.",
      },
    ],
  },

  "u2.n4": {
    notes: [
      "H, Z, H turns |0⟩ into a certain |1⟩.",
      "After the first H the state is |+⟩, reading 50/50.",
      "After the Z it is |−⟩, still reading 50/50 — nothing measurable has changed.",
      "The second H converts that unmeasurable phase into a certainty.",
      "Measuring in the middle would return no information and destroy the phase: the worst possible trade.",
      "Probabilities can only add. Amplitudes can cancel.",
      "Deutsch–Jozsa, Grover and Shor are all this shape — spread, mark with phase, interfere back.",
    ],
    cards: [
      {
        question: "Measuring between the two H gates would return:",
        options: [
          "50/50, whatever the phase is",
          "The phase, directly",
          "A certain answer",
        ],
        answerIndex: 0,
        because: "The phase is invisible in that basis, and taking the reading collapses what the second H needs.",
      },
      {
        question: "The general shape of a quantum algorithm is:",
        options: [
          "Spread into superposition, mark with phase, interfere back",
          "Try every answer in parallel and pick the best",
          "Repeat the circuit until the answer is correct",
        ],
        answerIndex: 0,
        because: "The wrong answers are arranged to cancel, so the right one is what survives.",
      },
    ],
  },

  "u2.n5": {
    notes: [
      "S turns one way around the equator; S† turns the other.",
      "With both, any point on the equator is a few gates away.",
      "Global phase is undetectable. Relative phase decides the answer.",
      "A Z-basis measurement separates |0⟩ from |1⟩, but never |+⟩ from |−⟩.",
      "That is Unit 2: a qubit can be put anywhere on the sphere.",
    ],
    cards: [
      {
        question: "To reach (|0⟩ − i|1⟩)/√2 from |+⟩ you apply:",
        options: ["S†", "S", "Z"],
        answerIndex: 0,
        because: "S adds a quarter turn one way round the equator; S† adds it the other.",
      },
      {
        question: "Two states differ only by a global phase. The number of shots needed to tell them apart is:",
        options: ["No number of shots will", "1024", "More than a relative phase needs"],
        answerIndex: 0,
        because: "Global phase has no observable consequence in any basis, at any number of shots.",
      },
    ],
  },

  /* ===== U3 — Two qubits =================================================== */

  "u3.n1": {
    notes: [
      "Two qubits have four outcomes. This platform writes them q₁q₀, so |10⟩ means q₁ = 1 and q₀ = 0.",
      "Bit order is a convention, not something to infer — it is printed on every axis.",
      "H on both wires gives all four outcomes at 25%.",
      "If two qubits are independent, each joint probability is the product of the individual ones.",
      "0.5 × 0.5 = 0.25 on every row, so the register factorises.",
      "Knowing q₀ still tells you nothing about q₁.",
    ],
    cards: [
      {
        question: "In this platform's notation, |10⟩ means:",
        options: ["q₁ = 1 and q₀ = 0", "q₀ = 1 and q₁ = 0", "Both qubits read 1"],
        answerIndex: 0,
        because: "Bitstrings are written q₁q₀. The convention is on every axis for exactly this reason.",
      },
      {
        question: "The factorisation test checks whether:",
        options: [
          "Each joint probability is the product of the individual ones",
          "All four outcomes are equally likely",
          "The circuit contains a two-qubit gate",
        ],
        answerIndex: 0,
        because: "A register that factorises is two separate stories that happen to be written side by side.",
      },
    ],
  },

  "u3.n2": {
    notes: [
      "CNOT flips the target when the control is 1, and leaves it alone when the control is 0.",
      "On definite inputs the whole gate is four rows of a truth table.",
      "It is drawn as a filled dot on the control joined to a circled plus on the target — never as a bare X.",
      "CNOT does not copy the control onto the target.",
      "If the target is already 1, a flip makes it 0 — the opposite of copying.",
      "On a definite control it copies a decision that has already been made. Nothing surprising has happened yet.",
    ],
    cards: [
      {
        question: "CNOT with control |1⟩ and target |1⟩ leaves the target at:",
        options: ["|0⟩", "|1⟩", "An even lean"],
        answerIndex: 0,
        because: "The control is 1, so the target flips. It was 1, so it becomes 0.",
      },
      {
        question: "The claim “CNOT copies the control onto the target” is:",
        options: [
          "Only true when the target starts at 0",
          "Always true",
          "Never true",
        ],
        answerIndex: 0,
        because: "It flips conditionally. Copying is what that happens to look like from one starting point.",
      },
    ],
  },

  "u3.n3": {
    notes: [
      "H on q₀ then CNOT gives 50% on |00⟩, 50% on |11⟩, and nothing on |01⟩ or |10⟩.",
      "Each qubit alone reads 50/50, so independence predicts 25% on every row.",
      "The register says 50/0/0/50. No pair of independent leans produces that table.",
      "Ordinary correlation — two coins glued together at the factory — also fails that test.",
      "What separates them is a change of basis: measure both in the X basis and the Bell pair still agrees, while glued coins scatter across all four outcomes.",
      "Nothing travels between the qubits. There were never two separate stories for a signal to cross.",
      "No message can be sent this way; the correlation appears only when the two result lists are compared.",
    ],
    cards: [
      {
        question: "The 50/0/0/50 histogram on its own proves:",
        options: [
          "The qubits are not independent",
          "The qubits are entangled",
          "Nothing whatsoever",
        ],
        answerIndex: 0,
        because: "Glued coins give the same table. Ruling out independence is not yet ruling out a shared classical answer.",
      },
      {
        question: "Measure both qubits of a Bell pair in the X basis. They:",
        options: [
          "Still agree",
          "Scatter across all four outcomes",
          "Read 50/50 independently of each other",
        ],
        answerIndex: 0,
        because: "A pre-agreed classical answer falls apart under a different question. The Bell pair has none to fall apart.",
      },
    ],
  },

  "u4.n1": {
    notes: [
      "|−⟩ is the one state a bit flip leaves alone, apart from an overall minus sign: X|−⟩ = −|−⟩.",
      "A CNOT onto |−⟩ therefore multiplies the control's |1⟩ branch by −1 and does nothing else.",
      "That sign is a relative phase on the control: |+⟩ becomes |−⟩, and one H reads it as 1.",
      "The target does not change at all. The information moved the other way, onto the control.",
      "This is phase kickback, and it is how every algorithm in this unit reads a function.",
    ],
    cards: [
      {
        question: "Why does a CNOT leave a |−⟩ target unchanged?",
        options: [
          "Flipping |−⟩ only multiplies it by −1",
          "A CNOT never acts on a superposition",
          "The control was |0⟩",
        ],
        answerIndex: 0,
        because: "X swaps |0⟩ and |1⟩, which turns |0⟩ − |1⟩ into |1⟩ − |0⟩: the same state times −1. The sign is all that is left, and it lands on the control.",
      },
      {
        question: "After kickback, where does the answer to the controlled question live?",
        options: [
          "In the phase of the control qubit",
          "In the target's measurement result",
          "Nowhere: the phase is global",
        ],
        answerIndex: 0,
        because: "The −1 attaches only to the control's |1⟩ branch, so it is a relative phase, and an H on the control makes it readable.",
      },
    ],
  },

  "u4.n2": {
    notes: [
      "The box computes |x⟩|y⟩ → |x⟩|y ⊕ f(x)⟩. With the helper in |−⟩, that is a phase (−1)^f(x) on the input.",
      "With the input in |+⟩, both f(0) and f(1) are written onto one qubit, as signs on its two halves.",
      "Equal signs (a constant f) leave |+⟩; opposite signs (a balanced f) make |−⟩.",
      "The final H turns |+⟩ into 0 and |−⟩ into 1, so one run tells constant from balanced.",
      "Neither f(0) nor f(1) is ever learned. Only whether they are equal survives the interference.",
      "A classical computer has to evaluate f twice to answer the same question.",
    ],
    cards: [
      {
        question: "For a constant f, the input qubit just before the last H is in:",
        options: ["|+⟩", "|−⟩", "|1⟩"],
        answerIndex: 0,
        because: "Both halves pick up the same sign, which is a global phase. The input stays |+⟩, and H sends it to 0.",
      },
      {
        question: "Why does the helper qubit start in |−⟩ rather than |0⟩?",
        options: [
          "So the box writes f(x) as a phase instead of a bit",
          "So the helper can be measured for the answer",
          "Because the box needs an empty wire",
        ],
        answerIndex: 0,
        because: "Starting in |0⟩, the box would write f(x) into the helper as a bit and entangle it. In |−⟩ the flip only adds a sign, which kicks back onto the input.",
      },
    ],
  },

  "u4.n3": {
    notes: [
      "H on both input wires puts all four inputs in equal superposition with one gate layer.",
      "The box writes (−1)^f(x) on each of the four branches in a single query.",
      "For a constant f every sign matches, and the last H's return exactly |00⟩.",
      "For a balanced f the signs cancel on |00⟩ completely, so 00 never appears.",
      "Classically, being certain can take 2ⁿ⁻¹ + 1 queries; a random-sampling classical check needs only a few for high confidence.",
      "Deutsch–Jozsa was a proof of principle, not a practical speedup: it separates quantum from deterministic classical computing.",
    ],
    cards: [
      {
        question: "For a balanced f on two bits, how likely is the result 00?",
        options: ["Never", "One time in four", "Half the time"],
        answerIndex: 0,
        because: "The amplitude of |00⟩ is the average of all the signs, and a balanced function has as many + as −. They cancel to exactly zero.",
      },
      {
        question: "Does Deutsch–Jozsa beat a classical computer allowed a small chance of error?",
        options: [
          "Not by much: a few random queries already give high confidence",
          "Yes, exponentially",
          "Yes, but only for two input bits",
        ],
        answerIndex: 0,
        because: "The exponential gap is against a classical method that must be certain. Allow sampling and a handful of calls suffices, which is why this is taught as a principle, not sold as a product.",
      },
    ],
  },

  "u4.n4": {
    notes: [
      "The box computes f(x) = s · x mod 2: the parity of the input bits where the secret s has a 1.",
      "Its oracle is one CNOT from each input wire where s has a 1, into the helper.",
      "After kickback the inputs carry the sign pattern (−1)^(s·x) across all eight inputs at once.",
      "H on every wire turns exactly that pattern into the single basis state |s⟩.",
      "The circuit is identical to Deutsch–Jozsa; only the question asked of the result changes.",
      "Classically, each query of f reveals at most one bit of s, so n bits need n queries.",
    ],
    cards: [
      {
        question: "In Bernstein–Vazirani, which gates build the box for the secret s = 101?",
        options: [
          "CNOTs from q0 and q2 into the helper",
          "CNOTs from q1 into the helper",
          "An X on q0 and q2",
        ],
        answerIndex: 0,
        because: "s · x counts the inputs where s has a 1, mod 2. q0 and q2 are those wires, so each needs one CNOT into the helper.",
      },
      {
        question: "Bernstein–Vazirani and Deutsch–Jozsa use:",
        options: ["The same circuit", "Different gates before the box", "Different numbers of queries"],
        answerIndex: 0,
        because: "H on every input, one query, H on every input. Deutsch–Jozsa asks whether the result is 00; Bernstein–Vazirani reads the result as s.",
      },
    ],
  },

  "u3.n4": {
    notes: [
      "Open the Bloch sphere on one qubit of a Bell pair and the arrow is a dot at the dead centre.",
      "Arrow length is purity. Zero length means there is no individual state to draw.",
      "The pair has one joint description, and it does not factorise into a story about each qubit.",
      "“What state is q₀ in?” has no answer — not an unknown answer, no answer.",
      "This platform computes the vector from the reduced density matrix, which is why it reports the centre.",
      "Taking the two amplitudes in front of q₀ and drawing them as a surface arrow looks fine and is physically wrong.",
      "The state-vector table still works: two qubits need four numbers, and a sphere holds one qubit's worth.",
    ],
    cards: [
      {
        question: "A Bloch vector of zero length means the qubit is:",
        options: [
          "Mixed — it has no state of its own",
          "In an even superposition",
          "At the origin because of a coordinate error",
        ],
        answerIndex: 0,
        because: "Length is purity. Zero length means no individual pure state exists to draw.",
      },
      {
        question: "A visualiser that always draws a surface arrow for one qubit of a Bell pair is:",
        options: [
          "Wrong, and quietly so",
          "Correct but imprecise",
          "Using a different convention",
        ],
        answerIndex: 0,
        because: "It is drawing a state that does not exist. A visualiser that never fails is not being careful.",
      },
    ],
  },

  "u3.n5": {
    notes: [
      "One H and two CNOTs give 50% on |000⟩ and 50% on |111⟩.",
      "Each CNOT ties another wire to a decision that has still not been made.",
      "Nothing in the construction is limited to three qubits.",
      "The state has exactly two branches: all-zeros and all-ones.",
      "Measuring any one qubit fixes all three, because learning which branch you are in fixes every wire in it.",
      "Nothing was sent. There were never separate values that had to be updated.",
    ],
    cards: [
      {
        question: "GHZ₃ has how many outcomes with non-zero probability?",
        options: ["Two", "Four", "Eight"],
        answerIndex: 0,
        because: "Only |000⟩ and |111⟩ carry any weight. The other six rows are empty.",
      },
      {
        question: "Measuring one qubit of GHZ₃ and getting |0⟩ leaves the other two:",
        options: ["Both |0⟩, with certainty", "Both still 50/50", "One |0⟩ and one |1⟩"],
        answerIndex: 0,
        because: "No branch mixes zeros and ones. Selecting a branch fixes every wire at once.",
      },
    ],
  },
};

/* -- Presentation -------------------------------------------------------------- */

/** FNV-1a. Small, stable across runs, and not a security boundary. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A prompt with its options in a stable but non-obvious order.
 *
 * Every authored prompt in this codebase writes the correct answer first. That
 * is the right way to AUTHOR them — a reviewer can check a block of questions
 * at a glance — and the wrong way to RENDER them, because "click the top
 * option" then scores full marks without reading anything.
 *
 * Shuffling on a hash of the question text fixes the tell without giving up the
 * authoring convention. It is deterministic, so a learner who meets the same
 * question again on the review bench sees the same layout rather than having to
 * re-read four options they have already dismissed once.
 */
export function presentPrompt(card: RetrievalPrompt): RetrievalPrompt {
  const order = card.options.map((_, i) => i);
  let seed = hash(card.question) || 1;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    question: card.question,
    options: order.map((i) => card.options[i]),
    answerIndex: order.indexOf(card.answerIndex),
    because: card.because,
  };
}

/* -- Accessors ---------------------------------------------------------------- */

export function notesFor(nodeId: string): string[] {
  return STUDY[nodeId]?.notes ?? [];
}

/**
 * The questions for the pass screen's optional check.
 *
 * Deliberately NOT including `node.retrieval`: the path already asks that one
 * on the way past, and putting the same question in front of a learner twice
 * inside a minute tests nothing.
 */
export function quizFor(nodeId: string): RetrievalPrompt[] {
  return STUDY[nodeId]?.cards ?? [];
}

/**
 * Every retrieval prompt for a node, canonical one first.
 *
 * `node.retrieval` stays the authored beat-7 question — it is what the path
 * asks on the way past and it is deliberately the one that names the node's
 * central claim. The study cards follow it.
 */
export function cardsFor(nodeId: string): RetrievalPrompt[] {
  const node = NODES_BY_ID.get(nodeId);
  if (!node) return [];
  return [node.retrieval, ...(STUDY[nodeId]?.cards ?? [])];
}

/**
 * Which card the review bench should ask this time.
 *
 * Rotating matters: a node that always asks the same question stops measuring
 * recall after the second visit and starts measuring memory of where the right
 * answer sat. Deriving the index from `intervalDays` keeps that rotation
 * stateless — the interval roughly doubles on each successful review, so its
 * log is a review counter that is already persisted. A miss halves it and
 * re-asks the previous card, which is the behaviour you want on a miss.
 */
export function cardForReview(nodeId: string, intervalDays: number): RetrievalPrompt | null {
  const pool = cardsFor(nodeId);
  if (pool.length === 0) return null;
  const reviews = Math.max(0, Math.round(Math.log2(Math.max(1, intervalDays))));
  return pool[reviews % pool.length];
}
