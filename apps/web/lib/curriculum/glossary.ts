/**
 * The glossary — every word a newcomer meets, defined once.
 *
 * Each term is tied to the node that first needs it. That tie does two jobs:
 * the glossary page groups terms by where they turn up, and the tutor pops a
 * term up the first time a learner opens that node. It pops the word, never
 * the answer — productive failure still needs the struggle to come first.
 *
 * Writing rule: `short` fits on one line of a pop-up (≤ 16 words). `more` is
 * one optional sentence for the glossary page. Anything longer belongs in a
 * lesson.
 */

import type { GateType } from "@/lib/ir/types";
import { NODES } from "./nodes";

/**
 * The specimen drawn beside a word when the tutor introduces it: a Bloch
 * vector, a gate on a wire, or a piece of notation. Show, then explain.
 */
export type TermMark =
  | { bloch: [number, number, number] }
  | { wire: GateType[] }
  | { text: string };

export interface Term {
  id: string;
  term: string;
  /** Notation, where the word has one. */
  symbol?: string;
  mark?: TermMark;
  short: string;
  more?: string;
  /** The node that first needs this word. Absent for reference-only terms. */
  introducedIn?: string;
  gates?: GateType[];
}

export const GLOSSARY: Term[] = [
  /* -- U0 ------------------------------------------------------------------- */
  {
    id: "qubit",
    term: "Qubit",
    mark: { bloch: [0, 0, 1] },
    short: "The quantum bit. It reads as 0 or 1, but can lean between them.",
    more: "Every wire on the canvas is one qubit, named q0, q1 and so on from the top.",
    introducedIn: "u0.n1",
  },
  {
    id: "circuit",
    term: "Circuit",
    mark: { wire: ["h", "measure"] },
    short: "A recipe for qubits: gates placed on wires, applied left to right.",
    more: "Nothing here is electrical. A circuit is a list of steps, drawn as a diagram.",
    introducedIn: "u0.n1",
  },
  {
    id: "ket",
    term: "Ket",
    mark: { text: "|0⟩" },
    symbol: "|0⟩",
    short: "How a quantum state is written. |0⟩ and |1⟩ are the two readable answers.",
    more: "Every qubit starts in |0⟩. Kets for several qubits, like |01⟩, read right to left.",
    introducedIn: "u0.n1",
  },
  {
    id: "superposition",
    term: "Superposition",
    mark: { bloch: [1, 0, 0] },
    short: "A state that leans between |0⟩ and |1⟩. Measuring it gives one answer, at set odds.",
    more: "It is not a hidden 0 or 1 you have not looked at yet. The lean is the whole state.",
    introducedIn: "u0.n2",
  },
  {
    id: "amplitude",
    term: "Amplitude",
    mark: { text: "α" },
    short: "The number behind the odds. Square its size to get the probability.",
    more: "Amplitudes can be negative or complex, which is what lets them cancel out.",
    introducedIn: "u0.n2",
  },
  {
    id: "shot",
    term: "Shot",
    mark: { text: "×1024" },
    short: "One run of the circuit, ending in one reading. The histogram counts many shots.",
    introducedIn: "u0.n3",
  },
  {
    id: "interference",
    term: "Interference",
    mark: { text: "+ −" },
    short: "Amplitudes adding up or cancelling out. It is how circuits make answers certain.",
    introducedIn: "u0.n3",
  },

  /* -- U1 ------------------------------------------------------------------- */
  {
    id: "gate",
    term: "Gate",
    mark: { wire: ["x"] },
    short: "One step that changes a qubit's state. Drag them from the tray onto a wire.",
    more: "Every gate except measurement and reset can be undone by another gate.",
    introducedIn: "u1.n1",
  },
  {
    id: "measurement",
    term: "Measurement",
    mark: { wire: ["measure"] },
    short: "Reading a qubit. It gives 0 or 1, and the lean collapses onto that answer.",
    introducedIn: "u1.n3",
    gates: ["measure"],
  },
  {
    id: "bloch-sphere",
    term: "Bloch sphere",
    mark: { bloch: [0.55, 0.35, 0.76] },
    short: "A globe for one qubit's state. |0⟩ is the north pole, |1⟩ the south.",
    more: "Points on the equator give 50/50 odds; where on the equator is the phase.",
    introducedIn: "u1.n4",
  },
  {
    id: "radian",
    term: "Angle θ",
    mark: { text: "θ" },
    symbol: "θ",
    short: "How far a rotation gate turns, in radians. π is a half turn.",
    more: "You can type 90deg or pi/2 — both mean a quarter turn.",
    introducedIn: "u1.n5",
    gates: ["rx", "ry", "rz"],
  },

  /* -- U2 ------------------------------------------------------------------- */
  {
    id: "phase",
    term: "Phase",
    mark: { bloch: [0, 1, 0] },
    short: "A turn on an amplitude. Invisible in the odds, decisive once gates combine paths.",
    introducedIn: "u2.n1",
    gates: ["z", "s", "t", "p"],
  },
  {
    id: "global-phase",
    term: "Global phase",
    mark: { text: "eⁱᵠ" },
    short: "The same turn on every amplitude at once. No measurement can ever detect it.",
    introducedIn: "u2.n1",
  },
  {
    id: "relative-phase",
    term: "Relative phase",
    mark: { bloch: [-1, 0, 0] },
    short: "A turn between amplitudes. |+⟩ and |−⟩ differ only by it, and H tells them apart.",
    introducedIn: "u2.n2",
  },

  /* -- U3 ------------------------------------------------------------------- */
  {
    id: "bitstring",
    term: "Bitstring",
    mark: { text: "01" },
    symbol: "01",
    short: "A reading of several qubits at once. q0 is the rightmost digit.",
    more: "So 01 means q0 read 1 and q1 read 0. Qiskit orders them the same way.",
    introducedIn: "u3.n1",
  },
  {
    id: "control-target",
    term: "Control and target",
    mark: { wire: ["cx"] },
    short: "A controlled gate acts on its target only when its control qubit is 1.",
    more: "The control is the dot on the canvas; the target is the other end of the line.",
    introducedIn: "u3.n2",
    gates: ["cx", "cz"],
  },
  {
    id: "entanglement",
    term: "Entanglement",
    mark: { bloch: [0, 0, 0] },
    short: "Qubits whose results are linked, so neither has a state of its own.",
    more: "The link shows up when results are compared. It cannot carry a message.",
    introducedIn: "u3.n3",
  },
  {
    id: "bell-state",
    term: "Bell state",
    mark: { text: "Φ⁺" },
    short: "Two qubits that always agree: |00⟩ half the time, |11⟩ the other half.",
    introducedIn: "u3.n3",
  },
  {
    id: "mixed-state",
    term: "Mixed state",
    mark: { bloch: [0.25, 0, 0.3] },
    short: "What one qubit of an entangled pair looks like alone. It sits inside the sphere.",
    introducedIn: "u3.n4",
  },
  {
    id: "ghz",
    term: "GHZ state",
    mark: { text: "GHZ" },
    short: "Three or more qubits that always agree. A Bell state, extended.",
    introducedIn: "u3.n5",
  },

  /* -- Reference only: words the interface uses ------------------------------ */
  {
    id: "fidelity",
    term: "Fidelity",
    mark: { text: "F" },
    short: "How close your state is to the target, from 0 to 1. Near 1 passes.",
    more: "It compares states, never gates — any circuit that gets there counts.",
  },
  {
    id: "state-vector",
    term: "State vector",
    mark: { text: "ψ" },
    short: "The full list of amplitudes, one per bitstring. The Table view shows it.",
  },
  {
    id: "depth",
    term: "Depth",
    mark: { text: "d" },
    short: "How many gate columns the circuit takes. Shallower circuits pick up less noise.",
  },
  {
    id: "noise",
    term: "Noise",
    mark: { text: "~" },
    short: "Small random errors real hardware adds at every gate. The bench can simulate it.",
  },
  {
    id: "no-cloning",
    term: "No-cloning",
    mark: { text: "⊘" },
    short: "No circuit can copy an unknown quantum state. CNOT entangles instead.",
  },
  {
    id: "qiskit",
    term: "Qiskit",
    mark: { text: "{ }" },
    short: "IBM's Python toolkit for quantum circuits. The code panel writes it for you.",
    more: "Cirq, PennyLane, Q# and OpenQASM are other ways to spell the same circuit.",
  },
];

export const TERMS_BY_ID = new Map(GLOSSARY.map((t) => [t.id, t]));

/** Words the tutor introduces when a learner first opens this node. */
export function termsIntroducedIn(nodeId: string): Term[] {
  return GLOSSARY.filter((t) => t.introducedIn === nodeId);
}

/**
 * Gates this node puts in the tray for the first time on the path. Derived,
 * not authored, so a node that changes its palette changes this with it.
 */
export function gatesIntroducedIn(nodeId: string): GateType[] {
  const seen = new Set<GateType>();
  for (const n of NODES) {
    if (n.id === nodeId) return n.allowedGates.filter((g) => !seen.has(g));
    n.allowedGates.forEach((g) => seen.add(g));
  }
  return [];
}
