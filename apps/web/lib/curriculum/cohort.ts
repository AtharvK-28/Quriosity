/**
 * Seeded cohort data for the instructor console.
 *
 * PRD milestone M6 says the instructor console "can be demonstrated on seeded
 * data if time is short — but it must be labelled as seeded if asked". This
 * module is that seed, and the console labels it in the header rather than
 * waiting to be asked.
 *
 * Everything here is generated deterministically from a fixed seed, so the
 * heatmap is the same on every machine and in every rehearsal. The misconception
 * mix is not invented: it is drawn from the rules the engine actually detects,
 * weighted the way the catalogue in Ideation §6 says these errors actually
 * cluster — order-of-operations and the copy-a-qubit reading of CNOT dominate,
 * because they do.
 *
 * When a real backend lands, this file is replaced by one query over
 * `misconception_events` (TRD §9), which is already indexed for exactly it.
 */

import { NODES, type LessonNode } from "./nodes";
import type { MisconceptionId } from "@/lib/tutor/rules";

export interface CohortStudent {
  id: string;
  name: string;
  /** Node id → what this student has done with it. */
  progress: Record<string, "passed" | "attempted" | "locked">;
  /** Nodes they got right first time. Drives the cohort mastery figure. */
  firstTime: Set<string>;
  lastSeenDays: number;
  /** Rule-engine hits. Real cohorts only; the seeded one models them instead. */
  misconceptions?: Array<{ misconceptionId: string; ruleId: string; nodeId: string | null }>;
}

export interface MisconceptionRow {
  id: MisconceptionId;
  ruleId: string;
  /**
   * What the learner believes, as a lowercase third-person verb phrase, so
   * that "38% of the class ___" reads as one sentence. The heatmap
   * capitalises it for the row; the lead does not.
   */
  belief: string;
  students: number;
  /** The node where it shows up most. */
  node: LessonNode | undefined;
}

export interface Cohort {
  name: string;
  institution: string;
  students: CohortStudent[];
  seeded: boolean;
  /** Real cohorts: the code students join with. */
  joinCode?: string;
}

/* -- Deterministic noise ---------------------------------------------------- */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Aarav", "Meera", "Ravi", "Nisha", "Priya", "Kabir", "Ananya", "Rohan",
  "Diya", "Arjun", "Sana", "Vikram", "Ishaan", "Tara", "Dev", "Kavya",
  "Neel", "Riya", "Yash", "Aisha", "Karan", "Zoya", "Aditya", "Leela",
  "Farhan", "Nikhil", "Sara", "Omar", "Tanvi", "Rahul",
];
const LAST = [
  "Sharma", "Iyer", "Nair", "Bose", "Reddy", "Khan", "Patel", "Singh",
  "Menon", "Das", "Gupta", "Rao", "Joshi", "Verma", "Pillai", "Chowdhury",
];

/**
 * A class part-way through Unit 3 — the shape a real cohort has in week four,
 * with a long tail still finishing Unit 2 and a handful already past Bell.
 */
export function seedCohort(size = 58): Cohort {
  const rand = mulberry32(0x51_4d);
  const students: CohortStudent[] = [];

  for (let i = 0; i < size; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;

    // How far this student has got, as an index into the node order. Most of
    // the class is around Unit 2 to Unit 3; a few are ahead and a few behind.
    const skill = rand();
    const reached =
      skill > 0.82 ? NODES.length                      // finished the path
        : skill > 0.34 ? 15 + Math.floor(rand() * 4)   // working through U3
          : skill > 0.14 ? 10 + Math.floor(rand() * 5) // finishing U2
            : 4 + Math.floor(rand() * 6);              // still in U1

    const progress: Record<string, "passed" | "attempted" | "locked"> = {};
    const firstTime = new Set<string>();

    NODES.forEach((node, idx) => {
      if (idx < reached) {
        progress[node.id] = "passed";
        // Stronger students get more right first time, but nobody is perfect.
        if (rand() < 0.45 + skill * 0.45) firstTime.add(node.id);
      } else if (idx === reached) {
        progress[node.id] = "attempted";
      } else {
        progress[node.id] = "locked";
      }
    });

    students.push({
      id: `stu_${i.toString(36)}`,
      name,
      progress,
      firstTime,
      lastSeenDays: Math.floor(rand() * 6),
    });
  }

  return { name: "CS-402 Quantum Computing", institution: "Seeded demo data", students, seeded: true };
}

/* -- Aggregates -------------------------------------------------------------- */

/**
 * The heatmap. Ranked by how many students hit each misconception, because an
 * instructor with ninety seconds before class needs the top row to be the thing
 * that changes the lecture.
 */
export function misconceptionRows(cohort: Cohort): MisconceptionRow[] {
  if (!cohort.seeded) return realMisconceptionRows(cohort);
  const rand = mulberry32(0x9e_37);
  const nodeBy = (id: string) => NODES.find((n) => n.id === id);

  // Share of the class that has reached the node where each error lives —
  // nobody can hold a misconception about a node they have not opened.
  const reached = (nodeId: string) =>
    cohort.students.filter((s) => s.progress[nodeId] !== "locked").length;

  const catalogue: Array<{
    id: MisconceptionId;
    ruleId: string;
    belief: string;
    nodeId: string;
    rate: number;
  }> = [
    // The dominant Bell-state error by a clear margin, per the catalogue in
    // Ideation §6 and the cohort figure the demo script quotes. It has to lead
    // the heatmap, because it is the row that changes the next lecture.
    { id: "M8", ruleId: "L03_order_inverted", belief: "places the CNOT before the Hadamard", nodeId: "u3.n3", rate: 0.78 },
    { id: "M8", ruleId: "L01_no_entangler", belief: "expects two H gates to correlate the wires", nodeId: "u3.n3", rate: 0.44 },
    { id: "M6", ruleId: "L12_relative_phase_ignored", belief: "treats |+⟩ and |−⟩ as interchangeable", nodeId: "u2.n2", rate: 0.38 },
    { id: "M4", ruleId: "L11_reduced_state_mixed", belief: "reads an entangled Bloch sphere as an error", nodeId: "u3.n4", rate: 0.31 },
    { id: "M5", ruleId: "L04_global_phase_only", belief: "adds Z to |0⟩ and expects a change", nodeId: "u2.n1", rate: 0.27 },
    { id: "M7", ruleId: "L05_measure_then_coherent", belief: "measures mid-circuit and expects interference to survive", nodeId: "u2.n4", rate: 0.22 },
    { id: "M1", ruleId: "L10_h_without_purpose", belief: "treats a qubit as a coin that is secretly heads or tails", nodeId: "u0.n3", rate: 0.18 },
  ];

  return catalogue
    .map((m) => {
      const pool = reached(m.nodeId);
      // A little deterministic jitter so the numbers do not look manufactured.
      const students = Math.round(pool * m.rate * (0.92 + rand() * 0.16));
      return {
        id: m.id,
        ruleId: m.ruleId,
        belief: m.belief,
        students,
        node: nodeBy(m.nodeId),
      };
    })
    .filter((m) => m.students > 0)
    .sort((a, b) => b.students - a.students);
}

export interface NodeColumn {
  node: LessonNode;
  passed: number;
  attempting: number;
  locked: number;
  /** First-attempt accuracy among those who passed. */
  firstTimeRate: number | null;
}

export function nodeColumns(cohort: Cohort): NodeColumn[] {
  return NODES.map((node) => {
    let passed = 0;
    let attempting = 0;
    let locked = 0;
    let firstTime = 0;

    for (const s of cohort.students) {
      const state = s.progress[node.id];
      if (state === "passed") {
        passed += 1;
        if (s.firstTime.has(node.id)) firstTime += 1;
      } else if (state === "attempted") attempting += 1;
      else locked += 1;
    }

    return {
      node,
      passed,
      attempting,
      locked,
      firstTimeRate: passed > 0 ? firstTime / passed : null,
    };
  });
}

/** Where the class as a whole currently sits. */
export function cohortSummary(cohort: Cohort) {
  const cols = nodeColumns(cohort);
  const total = cohort.students.length;

  // The node the largest number of people are stuck on right now.
  const stuck = [...cols].sort((a, b) => b.attempting - a.attempting)[0];

  const passedCounts = cohort.students.map(
    (s) => Object.values(s.progress).filter((v) => v === "passed").length,
  );
  const median = [...passedCounts].sort((a, b) => a - b)[Math.floor(total / 2)] ?? 0;

  const active = cohort.students.filter((s) => s.lastSeenDays <= 2).length;

  return { total, median, stuck, active };
}

/* -- Real cohorts --------------------------------------------------------------- */

/**
 * What each rule says a learner believes, phrased to finish the sentence
 * "38% of the class ___". Written per rule rather than per misconception,
 * because the rule is what actually fired on the circuit.
 */
const BELIEFS: Record<string, string> = {
  L01_no_entangler: "expects wires to correlate without an entangling gate",
  L02_redundant_pair: "leaves gate pairs that cancel each other out",
  L03_order_inverted: "puts gates in the wrong order",
  L04_global_phase_only: "adds a global phase and expects a change",
  L05_measure_then_coherent: "measures mid-circuit and expects interference to survive",
  L06_grover_iterations: "runs the wrong number of Grover iterations",
  L07_control_target_swapped: "swaps a controlled gate's control and target",
  L08_idle_qubit: "leaves a qubit doing nothing",
  L09_unmeasured_result: "forgets to measure the result",
  L10_h_without_purpose: "treats a qubit as a coin that is secretly heads or tails",
  L11_reduced_state_mixed: "reads an entangled Bloch sphere as an error",
  L12_relative_phase_ignored: "treats |+⟩ and |−⟩ as interchangeable",
  L13_depth_vs_noise: "builds circuits deeper than the noise allows",
};

/** Counted, not modelled: distinct students per rule, from their own hits. */
function realMisconceptionRows(cohort: Cohort): MisconceptionRow[] {
  const byRule = new Map<string, { id: MisconceptionId; students: Set<string>; nodes: Map<string, number> }>();
  for (const st of cohort.students) {
    for (const e of st.misconceptions ?? []) {
      const key = e.ruleId;
      const entry = byRule.get(key) ?? { id: e.misconceptionId as MisconceptionId, students: new Set(), nodes: new Map() };
      entry.students.add(st.id);
      if (e.nodeId) entry.nodes.set(e.nodeId, (entry.nodes.get(e.nodeId) ?? 0) + 1);
      byRule.set(key, entry);
    }
  }
  return [...byRule.entries()]
    .map(([ruleId, e]) => {
      const topNode = [...e.nodes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return {
        id: e.id,
        ruleId,
        belief: BELIEFS[ruleId] ?? "trips the rule engine",
        students: e.students.size,
        node: topNode ? NODES.find((n) => n.id === topNode) : undefined,
      };
    })
    .sort((a, b) => b.students - a.students);
}

/** The server's report for one cohort — only what the console reads. */
export interface CohortReport {
  cohort: { id: string; name: string; joinCode: string };
  students: Array<{
    id: string;
    name: string;
    progress: Record<string, { state?: string; firstAttemptCorrect?: boolean | null }>;
    misconceptions: Array<{ misconceptionId: string; ruleId: string; nodeId: string | null }>;
    updatedAt: number | null;
  }>;
}

export function cohortFromReport(report: CohortReport, now = Date.now()): Cohort {
  return {
    name: report.cohort.name,
    institution: "Live cohort",
    joinCode: report.cohort.joinCode,
    seeded: false,
    students: report.students.map((st) => {
      const progress: CohortStudent["progress"] = {};
      const firstTime = new Set<string>();
      for (const node of NODES) {
        const p = st.progress[node.id];
        // "available" is not yet reached, which the console counts as locked.
        progress[node.id] = p?.state === "passed" ? "passed" : p?.state === "attempted" ? "attempted" : "locked";
        if (p?.state === "passed" && p.firstAttemptCorrect) firstTime.add(node.id);
      }
      return {
        id: st.id,
        name: st.name,
        progress,
        firstTime,
        lastSeenDays: st.updatedAt === null ? 99 : Math.max(0, Math.floor((now - st.updatedAt) / 86_400_000)),
        misconceptions: st.misconceptions,
      };
    }),
  };
}
