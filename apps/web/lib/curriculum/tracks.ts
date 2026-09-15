/**
 * Professional tracks — PRD E6-S6, persona P3.
 *
 * "Tracks show estimated hours, domain framing, and a completion record." A
 * track is not a second curriculum. It is the same nodes — the physics does not
 * change because the learner works in logistics — with each unit framed by why
 * it matters to a domain, a time box, and capstone challenges chosen for that
 * domain. That is decision D9 applied: U0–U3 deep, framed three ways, rather
 * than three shallow tracks with nothing under them.
 *
 * The framing is honest about scope. U0–U3 end at entanglement; none of these
 * tracks claims to teach QAOA, Shor or VQE, only the parts of them a learner
 * can now read.
 */

import { CHALLENGES_BY_ID } from "./challenges";
import { NODES, UNITS, nodesInUnit } from "./nodes";
import type { ChallengeProgress, NodeProgress } from "@/stores/sessionStore";

export interface TrackUnit {
  unitId: string;
  /** Why this unit matters in the track's domain. Two sentences at most. */
  framing: string;
}

export interface Track {
  id: string;
  title: string;
  domain: string;
  /** One sentence on the page header. */
  pitch: string;
  /** What a learner can defend at the end, in their manager's terms. */
  outcome: string;
  units: TrackUnit[];
  /** Challenges that close the track. All must be solved for the record. */
  capstones: string[];
}

/** Time budgeted per capstone, on top of the node estimates. */
const CAPSTONE_MINUTES = 12;
/** Nodes are timed at first attempt; evenings include the second and third. */
const REALISM = 2.5;

export const TRACKS: Track[] = [
  {
    id: "optimisation",
    title: "Optimisation",
    domain: "Scheduling, routing, portfolio",
    pitch: "The four ideas every quantum optimisation method is built from, framed by the problems your team already solves.",
    outcome: "Explain what a variational optimiser tunes, why its answer is a distribution rather than a value, and what entanglement buys a search over correlated choices.",
    units: [
      { unitId: "u0", framing: "A quantum optimiser returns samples, not an answer. Why a probabilistic readout is not a random one is the first thing to be able to say to a sceptic." },
      { unitId: "u1", framing: "Every variational method — QAOA, VQE — is a classical loop turning rotation angles. The dial in this unit is exactly the parameter those loops tune." },
      { unitId: "u2", framing: "QAOA writes the cost function into phase. This is the unit where phase stops being invisible and starts deciding outcomes." },
      { unitId: "u3", framing: "Constraints couple decisions: if truck A goes, truck B cannot. Entanglement is how a circuit represents choices that are not independent." },
    ],
    capstones: ["c.third", "g.bell", "c.ghz"],
  },
  {
    id: "cryptography",
    title: "Cryptography",
    domain: "Security, key exchange, compliance",
    pitch: "What quantum computing threatens, what it enables, and the physics behind both claims.",
    outcome: "Say why measurement disturbance makes eavesdropping detectable, why phase estimation is the engine of Shor's algorithm, and why entanglement does not send messages.",
    units: [
      { unitId: "u0", framing: "Quantum key distribution rests on one fact: a qubit is not a hidden value waiting to be read. This unit is that fact." },
      { unitId: "u1", framing: "Measuring decides the value and destroys the rest. An eavesdropper who measures leaves fingerprints — this is where you see why." },
      { unitId: "u2", framing: "Shor's algorithm factors by estimating a phase. Relative phase, invisible in one basis and decisive in another, is the whole mechanism." },
      { unitId: "u3", framing: "Entangled pairs underpin E91 key exchange. They correlate, and they do not communicate — the distinction every vendor pitch blurs." },
    ],
    capstones: ["c.minus", "b.measured", "c.antibell"],
  },
  {
    id: "simulation",
    title: "Simulation",
    domain: "Chemistry, materials, pharma",
    pitch: "Why simulating molecules is the application physicists expected first, and what a state has to hold to do it.",
    outcome: "Explain why a classical machine runs out of memory on quantum states, what an amplitude and a phase each encode, and why an entangled state has no parts.",
    units: [
      { unitId: "u0", framing: "Molecules are quantum systems. A simulator has to hold amplitudes, not probabilities — this unit is why those differ." },
      { unitId: "u1", framing: "Any single-qubit state is two angles on a sphere. Chemistry encodings start by mapping an orbital's occupation onto exactly this." },
      { unitId: "u2", framing: "Energy lives in phase: a state's phase winds at a rate set by its energy. Phase estimation reads it back out." },
      { unitId: "u3", framing: "Electrons in a bond are correlated in a way no product of single-qubit states can hold. Watch the Bloch sphere give up — that is the memory wall." },
    ],
    capstones: ["c.iplus", "c.w3", "c.ghz"],
  },
];

export const TRACKS_BY_ID = new Map(TRACKS.map((t) => [t.id, t]));

export function trackNodes(track: Track) {
  return track.units.flatMap((u) => nodesInUnit(u.unitId));
}

/** Estimated evenings of work, rounded to the half hour. */
export function trackHours(track: Track): number {
  const nodeMinutes = trackNodes(track).reduce((s, n) => s + n.estMinutes, 0);
  const minutes = nodeMinutes * REALISM + track.capstones.length * CAPSTONE_MINUTES;
  return Math.max(0.5, Math.round((minutes / 60) * 2) / 2);
}

export interface TrackProgress {
  nodesPassed: number;
  nodesTotal: number;
  capstonesSolved: number;
  capstonesTotal: number;
  /** Every node passed and every capstone solved. */
  complete: boolean;
  /** 0–1 across nodes and capstones together. */
  fraction: number;
}

export function trackProgress(
  track: Track,
  progress: Record<string, NodeProgress>,
  challenges: Record<string, ChallengeProgress>,
): TrackProgress {
  const nodes = trackNodes(track);
  const nodesPassed = nodes.filter((n) => progress[n.id]?.state === "passed").length;
  const capstonesSolved = track.capstones.filter((id) => challenges[id]?.solved).length;
  const total = nodes.length + track.capstones.length;
  return {
    nodesPassed,
    nodesTotal: nodes.length,
    capstonesSolved,
    capstonesTotal: track.capstones.length,
    complete: nodesPassed === nodes.length && capstonesSolved === track.capstones.length,
    fraction: total === 0 ? 0 : (nodesPassed + capstonesSolved) / total,
  };
}

/** Every capstone id resolves to a real challenge — asserted in the tests. */
export function capstoneChallenges(track: Track) {
  return track.capstones.map((id) => CHALLENGES_BY_ID.get(id)).filter((c) => c !== undefined);
}

export { NODES, UNITS };
