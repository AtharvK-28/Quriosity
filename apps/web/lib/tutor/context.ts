/**
 * The learner's circuit, as the tutor is allowed to see it.
 *
 * Nothing here trusts the browser. The client sends its IR; the server
 * re-checks its shape, validates it against the same invariants the canvas
 * uses, re-simulates it, grades it against the node's own target (looked up
 * here, never taken from the request) and runs the rule engine. The model is
 * handed that summary and nothing else — so every number it quotes about the
 * learner's circuit came out of the simulator.
 */

import { CHALLENGES_BY_ID } from "@/lib/curriculum/challenges";
import { NODES_BY_ID } from "@/lib/curriculum/nodes";
import { grade, type GradeResult, type Target } from "@/lib/grade/fidelity";
import { GATES, formatParam, isGateType } from "@/lib/ir/gates";
import { SCHEMA_VERSION, type Circuit, type Gate } from "@/lib/ir/types";
import { inExecutionOrder, validate } from "@/lib/ir/validate";
import { allQubitStates } from "@/lib/sim/analysis";
import { bitstring, simulate } from "@/lib/sim/statevector";
import type { TutorWhere } from "./protocol";
import { primaryDiagnosis, type Finding } from "./rules";

/** Above this the summary lists the gates but does not simulate. */
const MAX_CONTEXT_QUBITS = 10;
const MAX_LISTED_GATES = 60;
const MAX_LISTED_OUTCOMES = 6;

export interface CircuitContext {
  /** The block handed to the model, as a mid-conversation system message. */
  text: string;
  hasCircuit: boolean;
  finding: Finding | null;
  grade: GradeResult | null;
  /** Most likely outcomes first. Empty when there was nothing to simulate. */
  outcomes: Array<{ bits: string; p: number }>;
  entangled: number[];
  task: string | null;
  solutionAllowed: boolean;
}

/* -- Shape check --------------------------------------------------------------
   Rebuilds a Circuit from untrusted JSON, keeping only known fields. Semantic
   rules (wires in range, no collisions) are validate()'s job, not this one's.
   ------------------------------------------------------------------------- */

function isIntArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.length <= 32 && v.every((n) => Number.isInteger(n));
}

function isNumArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.length <= 8 && v.every((n) => typeof n === "number" && Number.isFinite(n));
}

export function coerceCircuit(raw: unknown): Circuit | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Number.isInteger(r.qubits) || !Array.isArray(r.gates) || r.gates.length > 600) return null;

  const gates: Gate[] = [];
  for (const item of r.gates) {
    if (!item || typeof item !== "object") return null;
    const g = item as Record<string, unknown>;
    const controls = g.controls ?? [];
    const params = g.params ?? [];
    if (typeof g.id !== "string" || typeof g.type !== "string" || !isGateType(g.type)) return null;
    if (!isIntArray(g.targets) || !isIntArray(controls) || !isNumArray(params)) return null;
    if (!Number.isInteger(g.column)) return null;
    gates.push({
      id: g.id.slice(0, 40),
      type: g.type,
      targets: g.targets,
      controls,
      params,
      column: g.column as number,
      ...(Number.isInteger(g.clbit) ? { clbit: g.clbit as number } : {}),
    });
  }

  const qubits = r.qubits as number;
  return {
    schema_version: SCHEMA_VERSION,
    qubits,
    clbits: Number.isInteger(r.clbits) ? (r.clbits as number) : qubits,
    gates,
    metadata: {},
  };
}

/* -- Summary ------------------------------------------------------------------ */

function taskFor(where: TutorWhere): { target: Target | null; task: string | null } {
  if (where.surface === "lesson" && where.nodeId) {
    const node = NODES_BY_ID.get(where.nodeId);
    if (node) return { target: node.target, task: node.task };
  }
  if (where.surface === "challenge" && where.challengeId) {
    const challenge = CHALLENGES_BY_ID.get(where.challengeId);
    if (challenge) return { target: challenge.target, task: challenge.brief };
  }
  return { target: null, task: null };
}

const SURFACE_COPY: Record<TutorWhere["surface"], string> = {
  bench: "the free bench, where the learner builds whatever they like",
  lesson: "a lesson node on the learning path",
  challenge: "a challenge",
};

function wire(q: number): string {
  return `q${q}`;
}

function describeGate(g: Gate): string {
  const spec = GATES[g.type];
  const params = g.params.length > 0 ? `(${g.params.map(formatParam).join(", ")})` : "";
  const targets = g.targets.map(wire).join(", ");
  if (g.type === "measure") {
    return `column ${g.column}: measure ${targets}${g.clbit !== undefined ? ` into c${g.clbit}` : ""}`;
  }
  if (g.controls.length > 0) {
    return `column ${g.column}: ${spec.name}${params}, control ${g.controls.map(wire).join(", ")} → target ${targets}`;
  }
  return `column ${g.column}: ${spec.name}${params} on ${targets}`;
}

function topOutcomes(probs: Float64Array, n: number): { shown: Array<{ bits: string; p: number }>; total: number } {
  const idx: number[] = [];
  for (let i = 0; i < probs.length; i++) if (probs[i] > 1e-6) idx.push(i);
  idx.sort((a, b) => probs[b] - probs[a] || a - b);
  return {
    shown: idx.slice(0, MAX_LISTED_OUTCOMES).map((i) => ({ bits: bitstring(i, n), p: probs[i] })),
    total: idx.length,
  };
}

export function buildContext(where: TutorWhere, raw: unknown): CircuitContext {
  const { target, task } = taskFor(where);
  const solutionAllowed = where.surface === "bench";

  const ctx: CircuitContext = {
    text: "",
    hasCircuit: false,
    finding: null,
    grade: null,
    outcomes: [],
    entangled: [],
    task,
    solutionAllowed,
  };

  const lines: string[] = [`Surface: ${SURFACE_COPY[where.surface]}.`];
  if (task) lines.push(`Task on screen: ${task}`);
  if (target?.label) lines.push(`Target state: ${target.label}`);
  lines.push(
    solutionAllowed
      ? "Solution disclosure: allowed — this is the free bench."
      : "Solution disclosure: NOT allowed — give the next single step or a leading question, never the whole circuit.",
  );

  const done = () => {
    ctx.text = `<circuit_context>\n${lines.join("\n")}\n</circuit_context>`;
    return ctx;
  };

  if (raw === null || raw === undefined) {
    lines.push("No circuit is open.");
    return done();
  }

  const circuit = coerceCircuit(raw);
  if (!circuit) {
    lines.push("The circuit sent with this question could not be read.");
    return done();
  }

  const validation = validate(circuit);
  if (!validation.valid) {
    lines.push(`The circuit is invalid and will not run: ${validation.errors[0].message}`);
    return done();
  }

  ctx.hasCircuit = true;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  lines.push(`Circuit: ${plural(circuit.qubits, "qubit")}, ${plural(circuit.gates.length, "gate")}.`);

  const ordered = inExecutionOrder(circuit.gates);
  if (ordered.length === 0) {
    lines.push("Gates: none yet — every wire is still |0⟩.");
  } else {
    lines.push("Gates in execution order:");
    for (const g of ordered.slice(0, MAX_LISTED_GATES)) lines.push(`  ${describeGate(g)}`);
    if (ordered.length > MAX_LISTED_GATES) lines.push(`  …and ${ordered.length - MAX_LISTED_GATES} more`);
  }

  if (circuit.qubits > MAX_CONTEXT_QUBITS) {
    lines.push("Too many qubits to summarise the simulation here; talk about structure, not numbers.");
    return done();
  }

  let result;
  try {
    result = simulate(circuit);
  } catch {
    lines.push("The simulator could not run this circuit, so there are no numbers to report.");
    return done();
  }

  const { shown, total } = topOutcomes(result.probabilities, circuit.qubits);
  ctx.outcomes = shown;
  lines.push(
    "Exact outcome probabilities (ideal simulator, no noise; bitstrings are little-endian, q0 is the rightmost character): " +
      shown.map((o) => `P(${o.bits}) = ${o.p.toFixed(3)}`).join(", ") +
      (total > shown.length ? `, and ${total - shown.length} smaller outcomes` : "") +
      ".",
  );

  ctx.entangled = allQubitStates(result).filter((q) => q.entangled).map((q) => q.qubit);
  if (ctx.entangled.length > 0) {
    lines.push(`Wires with no individual state (entangled): ${ctx.entangled.map(wire).join(", ")}.`);
  }
  if (result.mixed) lines.push("A mid-circuit measurement or reset left the state mixed.");

  if (target) {
    ctx.grade = grade(result, target);
    lines.push(
      `Against the target: fidelity ${ctx.grade.fidelity.toFixed(3)}, ${ctx.grade.passed ? "passing" : "not yet passing"}` +
        (ctx.grade.globalPhaseOnly ? " (differs only by a global phase)" : "") +
        ".",
    );
  }

  ctx.finding = primaryDiagnosis({
    circuit,
    result,
    target: target ?? undefined,
    grade: ctx.grade ?? undefined,
  });
  lines.push(
    ctx.finding
      ? `Rule engine finding ${ctx.finding.ruleId}${ctx.finding.misconception ? ` (misconception ${ctx.finding.misconception})` : ""}: ${ctx.finding.message}` +
          (ctx.finding.fix ? ` Suggested fix: ${ctx.finding.fix.label}.` : "")
      : "Rule engine: nothing to flag.",
  );

  return done();
}
