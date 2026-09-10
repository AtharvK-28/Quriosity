# Quriosity

**SIH 26140 · Logic Sorcerers · AI-Based Interactive Quantum Algorithm Learning Platform**

A quantum circuit workbench that teaches. Drag a gate, watch the Qiskit write
itself, run it, and — when it is wrong — be told which gate on which wire, and
what to do about it.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 161 tests: physics, tutor, curriculum, challenges, mastery, errors
```

No Docker, no database, no API key. The simulator, the grader and the tutor's
rule engine all run in the browser.

---

## What is built

This is a **runnable vertical slice**: the full learning loop end to end, with
real physics, on the frontend only. The FastAPI gateway in the TRD slots in
behind it later without moving anything — the client already treats execution as
a function over the IR.

| Surface | Route | State |
|---|---|---|
| Landing — live interference instrument, the loop, the Rosetta proof, the curriculum map | `/` | Built |
| Mode selection | `/start` | Built |
| Learning path, drawn as a circuit on the learner's wire | `/path` | Built |
| Lesson player, six beats, 19 nodes | `/lesson/[nodeId]` | Built |
| **Challenges** — 14 puzzles across reach, golf and bug hunt | `/challenges` | Built |
| **Challenge runner** — hints on ask, solutions after three misses | `/challenges/[id]` | Built |
| Workbench | `/build` | Built |
| **Instructor console** — misconception heatmap, cohort completion | `/teach` | Built |
| **Progress** — units, beliefs held and resolved, challenge record | `/profile` | Built |
| Review bench (retention decay + SM-2) | `/review` | Built |
| Gate reference | `/reference` | Built |

### The engine

| Module | What it does |
|---|---|
| `lib/ir/` | The frozen IR schema (TRD §4), gate registry with unitaries, the ten validation invariants, canonical hash |
| `lib/sim/` | State-vector simulator, reduced density matrices, Bloch vectors, purity, separability, shot sampling, a noise model |
| `components/viz/` | Bloch sphere in WebGL (three.js) with an SVG peer view, probability histogram, state-vector table |
| `lib/grade/` | Fidelity grading — global-phase invariant, state-based, never structural |
| `lib/tutor/` | The deterministic rule engine, L01–L13, mapped to misconceptions M1–M14 |
| `lib/render/` | Qiskit, Cirq, PennyLane, Q# and OpenQASM 3 renderers — pure `IR → str`, zero network |
| `lib/curriculum/` | U0–U3 as data: 19 nodes, each with hook, task, target, instruction, pass note and a retrieval prompt |

### What is genuinely correct, not approximated

- **Mid-circuit measurement** splits the state into a weighted ensemble of pure
  branches rather than being faked or ignored. Misconception M7 depends on it.
- **The Bloch sphere is computed from the reduced density matrix.** An entangled
  qubit renders at the centre, labelled "no individual state". The naive
  per-amplitude version is physically wrong and is what this avoids.
- **Endianness is handled in exactly one place** and printed on every axis.
- **Grading compares states, never structure.** Two different correct Bell
  circuits both pass; a global-phase-shifted state passes and is explained.

---

## The demo path

```
/path?seed=u3.n3          walk the path up to the Bell node
/lesson/u3.n3  →  Build it  →  place H on q0  →  Run
```

`?seed=` accepts a unit id (`u2`) or a node id (`u3.n3`, meaning everything
before it). It is the local stand-in for the seeded users in TRD §15 — the
mastery gate correctly refuses a fresh session that jumps to Unit 3, so a demo
has to arrive having earned it. It writes only to that browser's own storage.

> q0 is in superposition, but q0 and q1 are still separable — every outcome is
> independent. Add a CNOT with q0 as control and q1 as target.

No model call anywhere on that path. The rule engine is deterministic and runs
in well under its 200ms budget, which is what makes the demo safe to give with
the network down.

`node tests/e2e/demo.spec.mjs` drives that whole flow in a real browser,
including the SDK toggle making zero network requests and Workbench mode
producing zero proactive tutor output.

---

## Density

A teammate reviewed the UI reference and said it was too much on screen. They
were right — the reference bench carries eight simultaneous information regions
and the learn screen stacks six instruments plus margin notes on one page.

The rule applied throughout here is **one instrument, one sentence, one action
per screen**:

- The **lesson** shows one beat at a time. The canvas does not exist until the
  learner commits to building; the state views do not exist until there is a
  result; instruction is a disclosure on the pass screen, because productive
  failure only works if the struggle comes first.
- The **bench** has two lanes and a control bar. One state view at a time,
  switched — never four panels at once.
- The **path** captions only the node you are on. Labelling all nineteen turns
  the wire back into the list it exists to replace.
- The **landing** carries one claim, one instrument and one action above the
  fold.

Everything else is behind a `Disclosure`, or it is not on the screen.

---

## The 3D Bloch sphere

Three.js, per TRD §1.2 and task T11. 3D earns its place here because the sphere
IS the subject: a state has a direction in space, and a flat projection makes
you infer the third axis from a foreshortened ellipse. Drag to orbit,
double-click to reset.

Everything drawn is a quantity. The vector's **direction** is the state, its
**length** is purity — so an entangled qubit's collapses to a dot at the centre
— and its **colour** is the phase, from the same wheel the amplitude table uses.
There is no ambient rotation: the camera moves when you move it and at no other
time.

The SVG renderer is still there and is still a peer view, not a consolation
prize. It runs when WebGL2 is unavailable (PRD §7.8) and while the capability
check resolves. Three.js sits in its own 536KB chunk, loaded on demand and
absent from the initial HTML.

What 3D is deliberately *not* used for: ambient particles, parallax, decorative
depth. Design Doc §2 spends the colour budget on physics and §5.4 forbids
ambient motion; a floating background would break both and would make an
instrument look like a landing page.

---

## Design system

From the UI reference's v2 "instrument direction", which supersedes v1.

```
paper   #f7f4ec    page  #e3ded1    ink     #16150f
measure #00867a    phase #4a3fd4    error   #e8306f    flag #e8a33d
```

Colour is data. Every saturated hue means a physical quantity — measurement,
phase, deviation, attention. Structure is ink on paper: no shadows anywhere,
radius 0–3px, 2px frames, a 24px graph grid, registration crosses at the corners.

Instrument Serif carries conceptual statements only. Space Grotesk is every
piece of interface, 15px floor. JetBrains Mono is reserved for notation — gates,
kets, readouts, axis ticks.

Both themes are tokenised (`styles/tokens.css`); the dark "scope" surface is
defined and ready for the duel screen.

---

## Mode matrix (PRD §6.3)

| | Guided | Workbench | Track |
|---|---|---|---|
| Lands on | `/path` | `/build` | `/path` |
| XP, badges | Visible | **Hidden** | Hidden |
| Streak | Visible | **Hidden** | Visible |
| Tutor | Proactive on failure | **Only when invoked** | Curriculum-linked |
| Locked gates | Per node | No | Per track |

Workbench mode producing any proactive tutor output is a P1 defect, not a
preference — it is asserted in the E2E suite.

---

## Testing

```bash
npm test                            # 161 unit tests, blocking
node tests/e2e/demo.spec.mjs        # 24 browser checks (needs the dev server)
node tests/e2e/shots.mjs            # screenshots of every surface
```

`tests/golden.test.ts` is the blocking physics gate from TRD §14 — ten
hand-verified circuits asserted to 1e-9, plus endianness, grading and Bloch
correctness. If it fails, the product is showing wrong physics.

---

## What is left

Audited against the PRD epics, not from memory. **M** = MVP-blocking in the PRD's
own MoSCoW, **S** = v1.

### Blocking the loop (M)

| # | Gap | Why it matters |
|---|---|---|
| E1 | **No accounts.** Everything is anonymous and local. | Needed before progress can follow a learner across devices. Requires the backend. |
| E3-S3 | **Code → IR.** The editor renders but does not parse. | The researcher's entry path. TRD §5 requires executing in a sandbox and introspecting the SDK object, so it belongs with the backend. |

### The backend (M, and everything downstream of it)

Nothing below can be honest without a server: FastAPI gateway, Postgres, Redis,
Celery, and the Docker sandbox (TRD §8). These carry auth, persistence,
multi-SDK *execution* (as opposed to rendering, which is done), the execution
cache, and rate limits.

### Closed in this pass

**Challenges** (E8). Fourteen puzzles in three kinds — reach anything that gets
there, golf for the fewest gates, bug hunt on a circuit handed to you broken.
Cards preview the target shape so you pick one by recognition. A hint is
offered only after a miss and only when asked; a full answer opens after three,
per PRD §11.2. Every challenge carries a reference solution, which is what
`tests/solvable.test.ts` asserts against — brute forcing a five-gate answer out
of a hundred-move palette is a hang, not a test.

**Instructor console** (E10). The heatmap leads, ranked by students affected,
because an instructor has ninety seconds before class and the top row has to be
the thing that changes the lecture. Rule ids and misconception ids are the real
ones the engine emits, so swapping the seeded source for a query over
`misconception_events` keeps the shape. Labelled as seeded in the header rather
than when asked.

**Progress** (`/profile`). Unit rings carry completion on the arc and
first-attempt accuracy in the middle. The interesting half is the belief
record: every rule the tutor fired on your circuits, and whether the node it
fired on has since been passed — "worked out" versus "still open".

### v1 surfaces (S)

| Epic | Surface | Note |
|---|---|---|
| E9 | **Arena** — matchmaking, Elo, server-authoritative resolution | Needs a server to be authoritative. Cannot be faked. |
| E10 | Instructor console against **real** cohort data | The screen is built; it reads a seeded cohort until there is a database to query. |
| E11-S1/S2 | Saved circuits, permalinks, fork | |
| E5-S4/S6 | Density matrix view, per-pair entanglement indicator on the canvas | The wire-level indicator exists; the pairwise one does not. |
| E3-S4/S5 | QASM import, Jupyter export | QASM *export* is written; import is not. |
| — | **Units U4–U8** | The spine is authored as data; adding a unit is content, not code. |
| E7-S3/S6/S7 | LLM phrasing, RAG grounding, optimisation suggestions | The rule engine — the layer that matters — is complete and covers all 13 rules. The model was always specified as phrasing over it, never as the diagnostic. |

### Closed since the first pass

**The bench survives a refresh** (E11-S3). The working circuit, shot count and
noise level persist; a lesson deliberately does not restore, because a node has
to open on its own starting circuit. Clear means cleared, across reloads.

**Mastery is enforced** (E6-S3). A unit opens the next one at 80% first-attempt
accuracy — or, below that, once the missed nodes have been re-derived. The
second door matters: first-attempt accuracy is a fixed historical fact, so a
gate that only accepted the first would be permanently unwinnable for anyone who
had a bad night. Consolidation is labelled, is not scored again, and awards no
second XP. Fixing this exposed a bypass — the Up Next card was offering locked
nodes, because `currentNodeId` fell back to "the first unpassed node" regardless
of state. Lessons now refuse a locked node outright rather than trusting the
route.

**Run failures each name a cause and a fix** (E4-S4). A typed taxonomy —
`invalid`, `qubit_cap`, `gate_limit`, `too_large`, `timeout` — checked *before*
the run wherever it can be, so an oversized circuit is blocked rather than
freezing the tab and then reporting a timeout of our own making. No message ever
contains a stack trace, and a failed run never costs the circuit. An empty
circuit still runs, because |00…0⟩ at 100% is correct.

### Fixed earlier

- **Rotation gates had no parameter control at all.** `tests/solvable.test.ts`
  proved three nodes — u0.n2, u1.n5, u1.n6 — had no reachable answer, so a
  learner stalled at node 2 of 19. The dial and π-expression field now exist and
  every node is verified solvable with the dial alone.
- CNOT and CZ rendered as bare "X" and "Z" in the tray, indistinguishable from
  the Pauli gates beside them.
- The bench dropped CNOT entirely in Guided mode.
- The entanglement indicator dashed the whole wire, including before the gate
  that caused it.
