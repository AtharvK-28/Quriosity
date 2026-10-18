# Ideation Document — v2
## Quriosity: AI-Based Interactive Quantum Algorithm Learning Platform

| Field | Value |
|---|---|
| Problem Statement ID | 26140 |
| Title | AI-Based Interactive Quantum Algorithm Learning Platform |
| Theme | Smart Education |
| Category | Software |
| Organisation | Egreen Quanta |
| Team | Quantum Latte |
| Product name | Quriosity |
| Document status | Internal ideation — parent document for the PRD, Design Doc and TRD |
| Version | 2.0 |

### Changelog from v1

| Added | Why |
|---|---|
| §3 Why now, with verified NQM figures | The national-relevance slide needs a number that survives a jury fact-check |
| §5 Learning-science foundation | Smart Education theme. A jury of educators will ask *why* this teaches better, not just *what* it does. v1 had no pedagogy |
| §6 Misconception catalogue | Turns "AI tutor" from a buzzword into a specification. This is the tutor's actual knowledge base |
| §9 Curriculum spine | v1 said "structured modules" without saying which. Content is the largest hidden cost in the build |
| §14 36-hour execution plan | Scope boundary existed; the hour-by-hour path to it did not |
| §17 Sustainability model | "How does it survive after SIH" is a standard finals question |
| §18 Demo script | The demo is the deliverable that decides the round |
| §19 Slide mapping | Compresses this document into the six slides without losing the argument |
| Answers to §20 open questions | Recommendations, not just questions |

---

## 1. One-line pitch

A browser-based quantum workbench where one circuit object is simultaneously a lesson, a runnable program across four SDKs, and a competitive match — so a learner's mistake produces an explanation instead of a stack trace.

**Thirty-second version.** Quantum computing education fails at two specific points: the linear algebra wall at the start, and the silent wrong answer in the middle. Quriosity fixes both. You drag gates, the Qiskit writes itself, the state renders live, and when your circuit is wrong an AI tutor that has actually read your circuit tells you which gate on which wire is the problem. Then it lets you race someone at your skill level to build the same circuit faster.

**Two-minute version.** Add: the single canonical circuit representation underneath, which is why the same object can be a lesson, four SDKs, a graded challenge and a ranked match without four codebases; the diagnostic layer, which is what no existing tool has; and the workforce argument, which is why this matters at national scale.

---

## 2. Problem framing

The problem statement names abstraction and lack of hands-on interaction. Underneath those sit four concrete failures in the tooling landscape.

**Gap 1 — The intuition-to-code cliff.**
Tools that build intuition (animated, gamified, visual) never get the learner to real code. Tools that teach real code assume the intuition already exists. Nothing bridges them, so learners who finish a visual course still cannot write a Qiskit program, and learners who start with Qiskit quit at the linear algebra. The two halves of the field are taught by two disjoint sets of tools.

**Gap 2 — The friction of failure.**
When a classical program fails, the error names the line. When a quantum circuit fails, the output is a probability distribution that is simply *wrong*, with no indication of which gate caused it. The failure is silent, numerical and un-localisable. Existing simulators report the result; none diagnose it. This is the single largest source of dropout in self-directed quantum learning, and it is the gap this product is built around.

**Gap 3 — Ecosystem fragmentation.**
Qiskit, Cirq, PennyLane and Q# express identical physics in incompatible syntax, with incompatible conventions — Qiskit orders bitstrings little-endian, Cirq big-endian, so the *same circuit* prints different answers in the two. A learner trained on one cannot read a paper implemented in another. Vendor-locked learning produces vendor-locked engineers, which is the opposite of what a national quantum workforce needs.

**Gap 4 — The instructor is blind.**
A lecturer running a quantum elective has no instrument for seeing where a cohort is stuck. Assessment is multiple-choice, which tests recall of the definition of superposition rather than the ability to construct a state. There is no equivalent of "38% of your class placed the CNOT before the Hadamard" — the one piece of information that would change next week's lecture.

---

## 3. Why now

| Signal | Detail |
|---|---|
| Public funding is committed | India's National Quantum Mission was approved by the Union Cabinet on 19 April 2023 with an outlay of ₹6,003.65 crore across 2023–24 to 2030–31, implemented by the Department of Science and Technology, targeting intermediate-scale machines of 50–1,000 physical qubits within eight years, coordinated through four thematic hubs |
| The binding constraint is people, not hardware | Four T-Hubs and a startup ecosystem create demand for quantum-literate engineers faster than any university pipeline currently supplies them |
| Curriculum is arriving before tooling | Quantum electives are entering AICTE-affiliated syllabi. Departments now need lab infrastructure they do not have and cannot afford |
| Simulation is finally free and good | Aer, Cirq and PennyLane all run 20+ qubits on a commodity laptop. Everything in an educational curriculum fits under that ceiling. No hardware access is needed for the core product |
| LLMs became good enough to diagnose, not just explain | A model given a structured circuit and a target state can now reliably localise the error. Two years ago it could not. This is the enabling change that makes Gap 2 solvable |
| No Indian-built platform occupies this space | The tools students use are all foreign, vendor-aligned and built for a different audience |

> Verify the outlay figure at dst.gov.in/national-quantum-mission-nqm on the day of submission and cite it there, not from a secondary source.

---

## 4. Target audience

Three segments, **three entry modes over one shared engine**. This is the coherence argument: we are not building three products. We are building one circuit representation and exposing three scaffolds on top of it. A student's puzzle, a researcher's scratchpad and a professional's certification exercise are the same object with different amounts of guidance switched on.

### 4.1 Students — primary segment

Undergraduate and postgraduate students in CS, physics, electronics and mathematics, usually meeting quantum computing in a single elective or through self-study.

| Dimension | Detail |
|---|---|
| Entry state | Comfortable with programming, uncomfortable with complex linear algebra. Little to no physics background assumed |
| What they use today | YouTube lectures, IBM Quantum Composer, a course PDF. Abandonment is high |
| Core pain | Cannot tell whether a wrong output means a wrong circuit or a wrong understanding. No feedback loop |
| What we give them | Visual-first path, target-state puzzles, a tutor that reads the actual circuit before answering, and ranked matches that make repetition voluntary |
| Success looks like | Builds and explains a Bell state and Grover's search unaided, and can write the equivalent Qiskit by hand |

**Entry mode: Guided.** Canvas primary, code panel is a mirror that fills in automatically. Tutor is proactive — it interrupts on a detected mistake. Gamification fully on.

### 4.2 Researchers — credibility segment

Graduate researchers, PhD scholars and faculty in quantum information, quantum chemistry, optimisation and QML.

| Dimension | Detail |
|---|---|
| Entry state | Strong theory. Time-constrained. Already writes quantum code |
| What they use today | Local Jupyter with Qiskit or PennyLane, plus manual translation when reading work from another ecosystem |
| Core pain | Boilerplate, environment setup, cross-SDK translation. Comparing a circuit under different noise models means rewriting it |
| What we give them | Instant multi-backend execution of the same IR, a noise-model comparison view, shareable circuit permalinks, one-click export to a Jupyter notebook |
| Success looks like | Prototypes here rather than locally because it is faster, and shares the link with a collaborator |

**Entry mode: Workbench.** Code editor primary, canvas is a live visualisation. Tutor passive — available on request, never interrupts. Gamification hidden entirely. This segment abandons the product instantly if it feels like a game.

**Why this segment matters to the pitch:** researchers are the reason the platform is not merely courseware. Their presence forces the execution layer to be genuinely correct rather than illustrative, and a jury reads that as technical seriousness.

### 4.3 Professionals — impact segment

Working software engineers, data scientists and R&D staff in IT services, defence, pharma and finance who need quantum literacy for a role or a project.

| Dimension | Detail |
|---|---|
| Entry state | Senior in classical engineering, complete beginner in quantum. Learning evenings and weekends |
| What they use today | Vendor certification courses, conference talks, corporate LMS modules that go one level deep and stop |
| Core pain | No path from "I understand the hype" to "I can evaluate whether this applies to my problem." Needs credentialing, not just knowledge |
| What we give them | Time-boxed tracks framed by application domain, assessment with verifiable completion, manager dashboard for team rollout |
| Success looks like | Completes a track, holds a shareable credential, and can articulate whether a business problem is a quantum candidate |

**Entry mode: Track.** Curriculum-driven, application-framed, assessment-heavy. Gamification reduced to progress and streaks — no PvP, no leaderboards, which read as unprofessional to this segment.

### 4.4 Secondary users

| User | Need | Surface |
|---|---|---|
| Instructor | See where the cohort is stuck; assign and grade without hand-marking | Cohort dashboard, assignment builder, misconception heatmap |
| Department admin | Roster management, seat allocation, institutional leaderboard | Admin console |

### 4.5 Segment comparison

| | Students | Researchers | Professionals |
|---|---|---|---|
| Primary surface | Visual canvas | Code editor | Structured track |
| Tutor behaviour | Proactive | On-demand | Curriculum-linked |
| Gamification | Full | Off | Progress only |
| Key feature | Target-state puzzles, ranked play | Multi-backend + noise comparison | Assessment and credentialing |
| Retention driver | Competition and streaks | Speed and convenience | Credential and career relevance |
| Default qubit cap | 12 | 20 | 12 |

One account can switch modes. Onboarding asks once; the choice is reversible from settings.

---

## 5. Learning-science foundation

This is a Smart Education problem statement. The jury will ask why this teaches better, not only what it does. Every mechanic below is chosen from an established finding, not from a product analogy.

| Principle | What it says | How Quriosity implements it |
|---|---|---|
| **Cognitive load theory** (Sweller) | Novices fail when working memory is loaded with syntax *and* concept simultaneously | Guided mode removes syntax entirely at first. The code panel renders itself, so the learner sees correct Qiskit without having to produce it. Syntax is introduced only after the concept is stable |
| **Worked-example effect → completion problems → independent problems** | Fading scaffolds beats problem-solving from scratch for novices | Every lesson node runs the same three-beat structure: watch a completed circuit run, then fill in one missing gate, then build the whole thing unaided. The fade is explicit and per-node |
| **Dual coding** (Paivio, Mayer) | Paired verbal and visual representation is retained better than either alone | Circuit, state vector, Bloch sphere and probability histogram are always co-visible and always synchronised to the same scrub position. The learner never sees a number without its picture |
| **Mastery learning** (Bloom) | Advancing before mastery compounds failure | The curriculum is a prerequisite DAG. A node unlocks only when its parent is passed at ≥80% first-attempt accuracy. There is no "skip ahead" for students in Guided mode |
| **Retrieval practice and spaced repetition** | Testing beats re-reading; spacing beats massing | Concepts previously passed reappear as short recall prompts inside later lessons, scheduled on an SM-2-style interval. A Bell state built in Unit 3 comes back as a warm-up in Unit 5 |
| **Productive failure** (Kapur) | Struggling *before* instruction improves later transfer, if the struggle is resolved | Puzzle nodes present the target state before the explanation. The learner attempts, fails, and the tutor's diagnosis becomes the instruction. This is why the tutor triggers on failure rather than pre-empting it |
| **Immediate, specific, actionable feedback** (Hattie) | Feedback effect size collapses when feedback is delayed or generic | Target-state grading is instant and gate-localised. "Wrong" is never an acceptable output of the grader |
| **Multiple correct solutions** | Accepting one canonical answer teaches ritual, not understanding | Grading compares state-vector fidelity against the target, so any circuit reaching the state passes. Two different correct answers is itself a lesson about unitary equivalence |
| **Self-explanation effect** (Chi) | Learners who explain a worked step to themselves transfer better | "Explain this step" prompts at checkpoints; the tutor grades the learner's explanation rather than supplying it first |
| **Bloom progression** | Remember → understand → apply → analyse → evaluate → create | Node types map directly: recall prompt (remember), tooltip + visualisation (understand), completion problem (apply), bug hunt (analyse), circuit golf (evaluate), open build (create) |

**Consequence for the pitch.** This table is the answer to "how is this different from a nicer IBM Composer." Composer is a sandbox. This is an instructional sequence with a diagnostic layer, and every mechanic traces to a finding.

---

## 6. Misconception catalogue

This is the tutor's specification, not a list of topics. Each row is a detectable state of the learner's circuit or answer, a rule that fires on it, and a scripted intervention. Detection is deterministic where possible; the model is used to phrase the intervention, not to decide it.

| # | Misconception | How it shows up | Detection rule | Intervention |
|---|---|---|---|---|
| M1 | A qubit is a coin that is secretly heads or tails (hidden variable) | Predicts measurement statistics correctly but cannot predict interference | Learner passes probability questions, fails H·H prediction | Run H then H on \|0⟩. A random coin flipped twice is still random; the qubit returns to \|0⟩ with certainty. Only amplitude cancellation explains this |
| M2 | Superposition means the computer tries all answers in parallel and returns them | Builds an oracle, expects the answer without a diffuser | Circuit has oracle, no amplitude amplification, learner reports "should give the answer" | Measurement returns one outcome. Show the flat histogram after the oracle alone; then show Grover's diffuser concentrating amplitude. Parallelism is necessary, interference is what makes it useful |
| M3 | Entanglement transmits information faster than light | Asserts that measuring q0 "sends" a value to q1 | Free-text answer classifier + explicit prompt in Unit 3 | Show the reduced state of q1 is maximally mixed regardless of what happens to q0. Correlation appears only when the two results are compared over a classical channel |
| M4 | The Bloch sphere works for two qubits | Confused when an entangled qubit's Bloch vector collapses to the origin | Bloch view opened on a qubit whose reduced density matrix has purity < 1 | The point at the centre is not a bug: it is the signature of entanglement. A maximally entangled qubit has no individual state. Switch to Q-sphere / state-vector view |
| M5 | Global phase matters | Adds Z gates to \|0⟩ and expects a visible change | Circuit differs from a passing solution only by a global phase | e^{iθ}\|ψ⟩ is physically identical to \|ψ⟩. Show identical measurement statistics. The grader accepts it — that is why fidelity is used, not amplitude equality |
| M6 | Relative phase does not matter (the inverse error) | Treats \|+⟩ and \|−⟩ as equivalent because both measure 50/50 | Learner submits \|−⟩ for a \|+⟩ target and disputes the grade | Both are 50/50 in the Z basis. Apply H to each and measure: one gives \|0⟩ with certainty, the other \|1⟩. Relative phase is real and measurable in the right basis |
| M7 | Measurement is just reading the value | Places a measurement mid-circuit and expects later interference to survive | Mid-circuit measurement followed by gates that assume coherence | Show the interference pattern before and after the mid-circuit measurement. Measurement destroys the superposition it observes |
| M8 | CNOT copies a qubit | Uses CNOT on \|+⟩ and \|0⟩ expecting two \|+⟩ qubits | CNOT with a superposed control, learner's stated intent is "copy" | CNOT on \|+⟩\|0⟩ gives a Bell state, not two independent \|+⟩. No-cloning theorem, demonstrated rather than asserted |
| M9 | A controlled gate does nothing to the control | Ignores phase kickback in Deutsch–Jozsa | Unit 4 nodes; controlled-U with an eigenstate target | The control picks up the eigenvalue phase. This *is* the mechanism of Deutsch–Jozsa, Bernstein–Vazirani and phase estimation; it is not a side effect |
| M10 | Bitstring order is obvious | Reads Aer output as big-endian and concludes the circuit is wrong | Cross-backend comparison mismatch that resolves under bit reversal | Qiskit is little-endian, Cirq is big-endian. The platform normalises and shows both labelled. Flag it explicitly rather than hiding it — this bites in every real project |
| M11 | More Grover iterations means a better answer | Loops the diffuser and gets worse results | Iteration count above the optimum for the search space | Amplitude amplification is a rotation. Past ⌊(π/4)√(N/M)⌋ it rotates past the target and success probability falls. Show the sinusoid |
| M12 | Grover is an exponential speedup | Claims quantum search is exponentially faster | Free-text / assessment answer | It is quadratic: O(√N) vs O(N). Show the two curves at N = 10⁶ |
| M13 | Noise is a bit flip added at the end | Optimises for gate count only after seeing noise, not before | Noise slider used, learner does not connect depth to fidelity | Decoherence accumulates with circuit depth and idle time. Show the same circuit degrade as depth rises at fixed noise |
| M14 | Quantum computers replace classical computers | Application-framing questions in professional track | Track assessment | Quantum advantage is problem-specific. Give three business problems, one of which is a genuine candidate; grade the discrimination |

**Why this matters to the build.** Nine of these fourteen are detectable by a deterministic rule over the circuit IR, with no model call. That is the design that keeps the tutor cheap, fast, and incapable of hallucinating physics on the most common failure paths. The model is a phrasing layer over a rule engine, not the diagnostic itself.

---

## 7. Core concept: the closed loop

The architectural idea that makes three segments possible from one codebase is a **canonical circuit intermediate representation** — a versioned JSON schema describing qubit count, an ordered gate list with targets, controls and parameters, and measurement points.

Everything reads and writes this one object:

- The drag-and-drop canvas emits IR
- The code editor parses into IR
- The transpilers render IR out to Qiskit, Cirq, PennyLane and Q#
- The simulator consumes IR and returns a state vector
- The AI tutor receives IR as context, so it reasons about the student's actual circuit rather than about quantum computing in general
- The auto-grader diffs the resulting state against a target
- The arena compares two players' IRs against the same target
- The instructor heatmap aggregates IR diffs across a cohort to find the class-wide error

Without this, "drag a gate and watch the Qiskit update" becomes several disconnected features that drift apart. With it, adding Q# is one renderer function, and adding a game mode is a new comparison rule over an object that already exists.

**State it explicitly in the pitch:** the AI tutor is state-aware, not a chatbot in a sidebar. It can say *"you placed a Hadamard on q0 to create superposition, but q0 and q1 are still separable — you need a CNOT with q0 as control"* because it is reading the circuit, not the conversation.

---

## 8. Differentiation

| Platform | Strength | Where it stops |
|---|---|---|
| IBM Quantum Composer | Gold-standard visual builder with live state vector | A sandbox, not a teacher. No curriculum, no diagnosis of mistakes, single vendor |
| Q-CTRL Black Opal | Best-in-class visual pedagogy and 3D intuition | Abstracts so heavily that the transition to writing real code is unsupported |
| Microsoft Quantum Katas | Excellent auto-graded, code-first exercises | Q#-only, text-heavy, assumes intuition the beginner does not have |
| PennyLane Codebook | Strong sequenced exercises with real code | Framework-locked; no visual builder; no diagnosis of *why* an answer is wrong |
| Quirk | Instant in-browser simulation, very fast feedback | Dated UI, no structure, no guidance, no code path |
| qBraid | Genuine multi-SDK environment and hardware access | An environment, not a curriculum. Assumes you already know what to build |
| Classiq | Powerful high-level synthesis | Aimed at practitioners building real applications, not at learners |
| Quantum Odyssey | Highly visual, genuinely engaging puzzle framing | Its own visual metaphor, which does not transfer to Qiskit or to a paper |
| Brilliant | Best-in-class interactive lesson design | Conceptual only. No executable circuit, no code, no simulator |
| Quantum Country | Excellent spaced-repetition essay format | Static prose plus flashcards. No construction, no execution |

**Uniqueness statement (use verbatim on slide 2):**
> Existing tools each solve one third of the problem. Composer simulates but does not teach. Black Opal teaches but does not reach code. Katas reach code but assume intuition. No platform closes the loop from visual intuition to executable multi-SDK code with diagnostic feedback in between — and none treats a wrong circuit as a teaching moment rather than a failed run.

**The two-axis chart for the slide.** X axis: visual intuition → executable code. Y axis: sandbox → guided instruction. Every competitor sits on one axis. Quriosity is the only point that is high on both, and the diagnostic layer is the reason it can be.

---

## 9. Curriculum spine

Content is the largest hidden cost in this build and the thing most teams underestimate. The spine below is authored as structured data, not hard-coded, and the MVP ships U0–U3 complete rather than all units shallow.

| Unit | Title | Nodes | Terminal skill | In MVP |
|---|---|---|---|---|
| U0 | What a qubit is not | 3 | Distinguishes quantum from probabilistic behaviour (M1) | Yes |
| U1 | One qubit | 6 | Builds and reads any single-qubit state; X, Z, H, measurement, Bloch sphere | Yes |
| U2 | Phase | 5 | Distinguishes global from relative phase; S, T, RX, RY, RZ, basis changes (M5, M6) | Yes |
| U3 | Two qubits and entanglement | 6 | Builds Bell and GHZ states; explains why the Bloch sphere fails (M3, M4, M8) | Yes |
| U4 | Interference and phase kickback | 5 | Implements Deutsch, Deutsch–Jozsa, Bernstein–Vazirani (M9) | v1 |
| U5 | Amplitude amplification | 5 | Implements Grover with correct iteration count; explains over-rotation (M11, M12) | v1 |
| U6 | Periodicity | 5 | QFT, phase estimation, Shor at structural level | v1 |
| U7 | Noise and real hardware | 4 | Reads a noise-degraded result; optimises depth; understands transpilation | v1 |
| U8 | Applications | 6 | VQE, QAOA, QML framing; judges whether a problem is a quantum candidate (M14) | Professional track, v1 |

**Node anatomy** — every node, without exception:

1. **Hook** (10s) — the target state or the surprising result, shown before any explanation
2. **Attempt** — the learner tries. Productive failure is intended here
3. **Diagnosis** — grader plus tutor localise the error to a gate and a wire
4. **Instruction** (60–90s) — tooltip, animation, or worked example, delivered *after* the attempt
5. **Completion problem** — same circuit, one gate missing
6. **Independent build** — from scratch, graded on fidelity
7. **Retrieval hook** — one prompt scheduled to reappear in a later unit

Three to five minutes per node. Forty-five nodes total. Nineteen in the MVP.

---

## 10. Feature modules

| # | Module | What it does | Serves | PS objective |
|---|---|---|---|---|
| M1 | Learning core | Structured modules, prerequisite DAG, progress tracking, role-based access | All three | Interactive web platform |
| M2 | Hybrid circuit builder | Drag-and-drop canvas plus code editor, two-way synced through the IR | All three | Graphical and code-based design |
| M3 | Multi-backend execution | Sandboxed workers routing IR to Aer, Cirq, PennyLane, qBraid | Students, Researchers | Real-time multi-backend simulation |
| M4 | Visualisation engine | 3D Bloch spheres, probability histograms, state vectors, step-through timeline | All three | State and outcome visualisation |
| M5 | AI tutor | Rule engine plus RAG-grounded explanation, error diagnosis, optimisation hints, adaptive path | All three | AI-assisted tutoring |
| M6 | Assessment engine | Target-state challenges, fidelity validation, credentialing | Students, Professionals | Assessment and progress tracking |
| M7 | Arena | Elo-rated PvP, circuit golf, bug hunt | Students | Beyond PS scope — the differentiator |
| M8 | Instructor console | Cohort analytics, misconception heatmap, assignments | Instructors | Instructor dashboards |

### 10.1 The Rosetta Stone view (M2 detail)

A dropdown above the code panel toggles the rendered syntax between Qiskit, Cirq, PennyLane and Q#. The circuit does not change; only its expression does. This directly addresses Gap 3 and is the cheapest high-visibility feature in the build, because it is pure IR rendering with no new backend work.

### 10.2 Noise slider (M3 detail)

A control injecting simulated thermal relaxation and gate error into execution. Teaches decoherence experientially — the learner watches their correct circuit degrade as noise rises, which is the argument for gate-count optimisation that no amount of text conveys. Density-matrix simulation is 4ⁿ, so this view is capped lower than the state-vector cap; use trajectory sampling above the cap.

### 10.3 Delivery table (expected deliverables)

| # | Module | Expected deliverable | Core features and functionality | Committed stack |
|---|---|---|---|---|
| D1 | Core platform and LMS | Interactive web application with role-based portals | Authentication with student, instructor and admin roles. Three entry modes. Prerequisite-gated learning paths, progress tracking, instructor dashboard with cohort analytics | Next.js 14, React, TypeScript, FastAPI, PostgreSQL, JWT with refresh rotation |
| D2 | Circuit IR service | Canonical circuit representation and transpiler set | Versioned JSON schema for qubits, ordered gates, controls, parameters and measurements. Schema validation, structural linting, renderers emitting Qiskit, Cirq, PennyLane and Q#. OpenQASM 3 import and export | Python, Pydantic schema, per-target renderer modules |
| D3 | Hybrid circuit builder | Drag-and-drop canvas and integrated code editor, two-way synced | Gate palette H, X, Y, Z, S, T, RX, RY, RZ, CNOT, CZ, SWAP, Toffoli. Multi-qubit wires, barriers, measurement placement. Live syntax rendering with SDK toggle. Code-to-IR via sandboxed introspection of the SDK's own circuit object | React Flow, Monaco Editor, shared IR store |
| D4 | Execution and simulation engine | Multi-backend quantum gateway with sandboxed workers | Unified adapter per backend, normalised results including endianness correction. Job queue with per-job timeout, CPU cap, no network. Configurable noise models. Result caching keyed by IR hash | Qiskit Aer, Cirq, PennyLane, qBraid; Celery on Redis; Docker-isolated workers |
| D5 | Visualisation engine | Dynamic quantum state visualiser | Interactive 3D Bloch sphere per qubit, measurement histograms, state vector and density matrix views, step-through timeline showing gate-by-gate evolution | Three.js and WebGL, D3.js |
| D6 | AI intelligent tutor | Context-aware assistant grounded in the user's circuit | Receives circuit IR as context, not just chat history. Concept explanation, error diagnosis naming the specific gate and wire, optimisation suggestions, boilerplate generation, adaptive recommendation. Deterministic rule engine handles the fourteen catalogued misconceptions without a model call | LangChain, LLM API, Qdrant vector store, RAG over official SDK documentation |
| D7 | Assessment and challenges | Auto-graded quantum exercise engine | Target-state challenges validated by state-vector fidelity, so multiple correct solutions are accepted. Gate-count scoring for optimisation exercises. Progress analytics, verifiable completion records | Sandboxed execution reused from D4, fidelity-based grading service |
| D8 | Competitive arena | Elo-rated multiplayer circuit building | Matchmaking pool, server-authoritative Elo, Blitz, Circuit Golf and Bug Hunt modes, live opponent progress, global and institutional leaderboards | WebSockets over FastAPI, Redis sorted sets, PostgreSQL match history |
| D9 | Documentation and deployment | Architecture and deployment assets | Source repository, architecture diagrams, OpenAPI specification, IR schema specification, containerised deployment guide, seeded demo dataset | GitHub, Docker Compose, Swagger UI, Markdown |

### 10.4 Acceptance criteria

Each deliverable is complete only when demonstrable. Run these before submission:

- **D2** — the same circuit renders to valid, executable code in at least two SDKs and round-trips back to identical IR
- **D3** — a gate dragged onto the canvas appears in the code panel within one frame; a gate typed into the code panel appears on the canvas on run
- **D4** — a three-qubit GHZ state returns the same measurement distribution from Aer and from Cirq, with endianness reconciled
- **D5** — the Bloch sphere for a qubit in an entangled pair correctly shows a mixed state at the centre rather than a point on the surface. This is the check that catches a naive single-qubit visualisation
- **D6** — given a circuit with a Hadamard but no entangling gate where the target is a Bell state, the tutor names the missing CNOT and its wires
- **D7** — two structurally different circuits producing the same target state both grade as correct
- **D8** — two clients submitting simultaneously receive a consistent winner determined server-side

### 10.5 Mapping to PS objectives

| PS objective | Deliverables |
|---|---|
| Interactive web platform for quantum learning | D1, D9 |
| Graphical and code-based circuit design | D2, D3 |
| Real-time multi-backend execution | D2, D4 |
| AI-assisted tutoring, debugging, personalisation | D6 |
| State, Bloch sphere and outcome visualisation | D5 |
| Assessment, challenges, progress, instructor dashboards | D1, D7 |
| Collaborative and modular learning | D8 |

Every objective is covered. D8 is the only deliverable beyond the statement.

---

## 11. Gamification layer

Applies to the student segment; hidden for researchers, reduced for professionals.

**The learning path is drawn as a circuit.** Rather than a generic node map, the curriculum renders left-to-right as gates acting on the learner's own wire — completed nodes are filled gate glyphs, the current node is the active gate, locked nodes are ghosted. The metaphor is not decorative: prerequisites *are* time-ordering, and the learner reads their own progress in the notation they are learning.

**Target-state puzzles.** Instead of multiple choice, the challenge shows a target state on the Bloch sphere or as a probability distribution, and the learner builds a circuit matching it. The grader compares state vectors mathematically, so there are multiple valid solutions — which is itself a lesson.

**Ranked arena with Elo.** Two players receive the same target. Matchmaking pairs similar ratings; standard Elo applies, so beating a stronger opponent moves the rating more. Three modes:

- *Blitz* — first valid matching circuit wins
- *Circuit golf* — both players receive a bloated circuit and must reproduce its output with the fewest gates. Directly rewards the optimisation instinct real hardware demands
- *Bug hunt* — both receive a broken implementation of a known algorithm and race to find and fix the flaw

Fairness requires server authority: both submissions run through the same job queue, and the timestamp that counts is when the job returns, not when the button was clicked. Anti-cheat: identical-IR detection against a known-solution table, per-match rate limits, and rating changes applied only after both jobs settle.

**Streaks and progression.** Daily streak counter, XP per solved circuit, unlockable Bloch sphere and interface themes.

**A deliberate restraint.** No leaderboard visible before the learner completes U3. Ranking a beginner against strangers before they can build a Bell state is demotivating, and the retention literature is consistent on this.

**Stretch mechanics (design only, not in build scope).** Co-operative algorithm raids where three or four players build separate subroutines of Shor's algorithm against a timer; seasonal inter-college leagues.

---

## 12. Technical approach

Summary only — the full specification is in the TRD.

- **Client** — Next.js and React. React Flow for the circuit canvas, Monaco for the editor, Three.js for Bloch spheres, D3 for histograms
- **Gateway** — FastAPI. REST for CRUD, WebSockets for live execution results and match state, JWT with student/instructor/admin roles
- **Circuit IR service** — schema validation, gate-level checks, transpilation to each target SDK
- **Execution core** — Celery on Redis; ephemeral Docker workers with timeouts and no network execute user code and return state vectors
- **AI tutor engine** — deterministic rule engine first, LangChain plus LLM API second, Qdrant vector store over chunked official SDK documentation for RAG grounding
- **Gameplay service** — Elo, matchmaking pool, XP and streaks, auto-grading
- **Data** — PostgreSQL for users, progress, saved circuits and match history; Redis for cache, pub/sub and leaderboard sorted sets; Qdrant for vectors

### Choices worth defending

*Why a queue rather than synchronous requests.* Simulating twelve or more qubits, or applying a noise model, takes seconds, and the code is arbitrary user Python. A queue with sandboxed workers gives isolation, timeouts and fair match timing in one decision.

*Why a rule engine in front of the LLM.* Nine of fourteen catalogued misconceptions are detectable deterministically over the IR. Running those without a model call makes the tutor faster, cheaper, and structurally unable to hallucinate physics on the most common failure paths. The model phrases the intervention; it does not decide it.

*Why RAG for the rest.* An ungrounded model invents gate semantics with confidence. Retrieval over official documentation constrains the tutor's claims and turns hallucination into a bounded risk.

*Why Postgres and not only MongoDB.* Progress, matches, Elo history and assessment records are relational and need transactional integrity — an Elo update and a match record must commit together.

*Why Redis sorted sets.* Leaderboards and the matchmaking pool are the exact workload they are designed for, at no additional infrastructure cost.

---

## 13. Feasibility and risk

### 13.1 What makes this feasible

- Every simulator in scope is open source and runs locally. No quantum hardware is required for the core product; IBM Quantum's free tier is an optional enhancement, not a dependency
- Simulation up to roughly 20 qubits on commodity hardware covers every algorithm in an educational curriculum. We are not attempting quantum advantage. A 20-qubit state vector is about 16 MB of complex amplitudes
- The IR abstraction makes multi-SDK support a rendering problem, not four integrations
- The frontend stack is already familiar to the team

### 13.2 Risk register

| # | Risk | Severity | Early warning sign | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Arbitrary user Python is a remote-execution surface | High | Any code path that runs user input outside a container | Sandboxed containers, no network, hard CPU and wall-clock limits, read-only filesystem, non-root, dropped capabilities. Non-negotiable in v1 | Backend |
| R2 | AI tutor hallucinates incorrect physics | High | Tutor answers a question the rule engine did not classify | Rule engine handles the catalogued fourteen with no model call; RAG grounding over official docs for the rest; answers scoped to the submitted IR; a refusal path when retrieval confidence is low | AI |
| R3 | Simulation cost grows exponentially | Medium | p95 job latency rising | Cap qubits by tier and mode, queue with timeouts, cache results keyed by IR hash — identical circuits are extremely common in teaching | Backend |
| R4 | Scope exceeds the build window | Medium | Day 1 ends without canvas → run → histogram working | Explicit MVP boundary in §14; arena and multi-SDK staged after the core loop | Lead |
| R5 | Canvas-to-code synchronisation drifts | Medium | Any code that translates canvas directly to text | Single source of truth in the IR; both surfaces are pure renderers over it. Never allow direct canvas-to-code translation | Frontend |
| R6 | Content authoring is underestimated | Medium | Fewer than 10 nodes authored by mid-build | Curriculum as structured data; ship U0–U3 complete rather than U0–U8 shallow. One person owns content full-time | Content |
| R7 | LLM API cost or latency at demo time | Low | Tutor response above 3s | Rule engine covers the common cases; response caching by concept; a pre-warmed cache for the exact demo circuits | AI |
| R8 | Endianness bug produces visibly wrong physics on stage | Medium | Cross-backend GHZ mismatch | Normalisation at the adapter boundary with a golden-vector test suite in CI | Backend |
| R9 | Live PvP fails under conference wifi | Medium | WebSocket drops in rehearsal | Local-network fallback, two-device rehearsal, recorded backup segment | Lead |
| R10 | Bloch sphere shows a pure state for an entangled qubit | Medium | Any Bloch implementation that reads amplitudes rather than the reduced density matrix | Compute the partial trace; assert purity < 1 renders inside the sphere. Covered by an explicit test | Frontend |

---

## 14. Scope boundary and execution plan

### 14.1 Scope

| MVP (demo-critical) | v1 (post-selection) | Designed, not built |
|---|---|---|
| Canvas → IR → Aer → histogram and Bloch sphere | Cirq, PennyLane, qBraid backends | Co-op algorithm raids |
| Monaco editor with two-way IR sync | Noise model slider | Seasonal inter-college leagues |
| Qiskit code rendering | Full path U4–U8 | Real hardware submission |
| Rule-based circuit diagnostics (9 of 14 misconceptions) | RAG tutor over full documentation set | LMS / LTI integration |
| Target-state grading, U0–U3 nodes (19 nodes) | Instructor dashboard and misconception heatmap | Mobile application |
| Auth with three roles | Ranked arena with Elo | Credential verification registry |

**Guidance for the pitch:** slide 2 promises MVP plus v1. The stretch column stays out of the six slides entirely. A jury reads an over-promise as a team that has not estimated its own work.

### 14.2 36-hour hackathon plan

| Window | Target | Definition of done |
|---|---|---|
| H0–H3 | Repo, Docker Compose, IR schema frozen, auth stub | `docker compose up` serves frontend and API; IR schema file committed and not renegotiated after this point |
| H3–H9 | Canvas emits IR; Aer worker returns a state vector | Drag H onto q0, press Run, get a 50/50 histogram |
| H9–H14 | Monaco panel renders Qiskit from IR; Bloch sphere live | Bell state shows two bars and two centred Bloch spheres |
| H14–H18 | Grading service; three challenge nodes seeded | Two different correct Bell circuits both pass |
| H18–H22 | Rule engine: missing-entangler, redundant-pair, wrong-order, global-phase | Tutor names the missing CNOT and its wires |
| H22–H26 | LLM phrasing layer over the rule engine, cached | Explanation returns in under 2s |
| H26–H30 | Path UI, progress, streak, remaining U0–U3 nodes | A cold user can go from signup to a graded Bell state without help |
| H30–H33 | Arena: two-client Blitz with server-authoritative winner | Two laptops, one winner, consistent |
| H33–H35 | Seed data, demo rehearsal, backup recording | Full demo run twice end-to-end without a reset |
| H35–H36 | Freeze. No new features | Tag the commit. Nothing merges after this |

**The rule that saves the project:** the IR schema is frozen at H3. Everything downstream depends on it, and renegotiating it at H20 costs the build.

---

## 15. Impact and benefits

**For students.** Removes the two dropout points — the linear algebra wall at the start and the silent failure in the middle. Zero installation means a laptop and a browser are the entire requirement, which matters across the range of institutional infrastructure in India.

**For researchers.** Cuts prototyping and cross-SDK translation time. Shareable circuit permalinks make collaboration and reproducibility cheaper.

**For professionals.** A credentialed reskilling path framed by application domain rather than physics curriculum, letting employers upskill teams without vendor lock-in.

**For instructors.** The misconception heatmap answers a question no current tool answers: which specific error is my cohort making this week. That is actionable at the level of the next lecture, not the next semester.

**Institutional.** Departments can run a quantum elective without lab infrastructure.

**National.** The National Quantum Mission commits ₹6,003.65 crore across 2023–24 to 2030–31 and targets 50–1,000 physical qubits within eight years, coordinated through four thematic hubs. The binding constraint on that investment is trained people rather than hardware, and there is no widely adopted Indian-built platform training that workforce.

---

## 16. Success metrics

| # | Metric | Why it matters | How measured | Target |
|---|---|---|---|---|
| S1 | Completion rate, basis states → working Bell state | The intuition gap | Node completion events | ≥60% of signups |
| S2 | Share of visual-mode learners who later write a correct circuit in code mode | **The cliff. The metric the product exists to move** | First correct code-mode submission after ≥1 canvas node | ≥40% within 14 days |
| S3 | Median time from failed run to corrected run | The diagnostic layer's actual value | Timestamp delta, A/B with tutor off | ≤50% of the tutor-off control |
| S4 | Tutor diagnosis acceptance rate | Whether diagnoses are correct and useful | Thumbs signal plus whether the next submission applies the suggestion | ≥70% applied |
| S5 | D7 / D30 return rate by segment | Retention | Session events | D7 ≥35% students |
| S6 | Challenges attempted per active learner per week | Engagement depth | Submission events | ≥8 |
| S7 | Instructor heatmap → syllabus change | Institutional value | Qualitative interview | ≥2 pilot instructors report a lecture changed |
| S8 | Cross-backend agreement rate | Correctness of the execution layer | CI golden-vector suite | 100% |

S2 is the headline. Everything else supports it.

---

## 17. Sustainability model

| Stream | Who pays | What they get | Notes |
|---|---|---|---|
| Free tier | Nobody | Full student curriculum, 12-qubit simulation, ranked arena | Permanently free. This is the workforce argument and the growth engine |
| Institutional licence | Department, per seat per year | Instructor dashboards, cohort analytics, assignments, private leaderboards, roster SSO | The realistic revenue line in India |
| Professional credential | Individual or employer | Track completion, proctored assessment, verifiable credential | Needs a credible issuing partner to carry weight |
| Sponsored tracks | Quantum vendors and hubs | A branded application track authored to their SDK | Only viable because the core is vendor-neutral |
| Open core | — | IR schema and transpilers published open source | Costs nothing, buys ecosystem trust, and makes the neutrality claim verifiable |

Marginal cost per learner is simulation compute plus tutor calls. The rule engine and IR-hash cache are what keep that number small enough for the free tier to be honest.

---

## 18. Demo script — five minutes

Rehearse this until it runs without a reset. The demo is the deliverable that decides the round.

| Time | Beat | What the jury sees | What it proves |
|---|---|---|---|
| 0:00–0:30 | The claim | One sentence: mistakes should produce explanations, not stack traces | Framing |
| 0:30–1:15 | Build | Drag H onto q0. The Qiskit writes itself in the panel beside it. Run. Two bars, 50/50 | Canvas → IR → execution, live |
| 1:15–2:15 | **The money shot** | Attempt a Bell state, deliberately omit the CNOT. Grader fails it. Tutor says: *"q0 is in superposition, but q0 and q1 are still separable — add a CNOT with q0 as control and q1 as target."* Add it. Pass | Gap 2, closed. This is the moment that wins the round |
| 2:15–2:45 | Rosetta | Toggle the SDK dropdown: Qiskit → Cirq → PennyLane. Same circuit, three syntaxes | Gap 3, closed |
| 2:45–3:15 | Bloch | Open the Bloch sphere on the entangled qubit. It sits at the centre. Say why | Physical correctness, not a toy |
| 3:15–3:45 | Alternate solution | Submit a structurally different circuit reaching the same state. It also passes | Fidelity grading, multiple correct answers |
| 3:45–4:30 | Arena | Two laptops, one Blitz match, server picks the winner | Retention mechanic, and it is real |
| 4:30–5:00 | Instructor | Heatmap: 38% of the cohort placed the CNOT before the Hadamard | Gap 4, and the institutional sale |

**Failure drills.** If wifi drops, the recorded arena segment plays. If the LLM is slow, the rule-engine diagnosis (which is local and deterministic) still fires — rehearse the demo with the model disabled at least once.

---

## 19. Mapping to the six-slide idea PPT

| Slide | Content | Sourced from |
|---|---|---|
| 1 | Title, team, PS ID, one-line pitch | §1 |
| 2 | Idea and uniqueness — the closed loop diagram, uniqueness statement verbatim, MVP + v1 scope | §7, §8, §14.1 |
| 3 | Technical approach — layer diagram, IR at the centre, stack table | §12 |
| 4 | Feasibility and viability — risk table (top four rows only), why no hardware is needed | §13 |
| 5 | Impact and benefits — three segments, NQM figure, instructor heatmap | §15 |
| 6 | Research and references — verified links only | §21 |

Slide 2 is where the diagram must be. If a juror understands only one thing, it should be that a single circuit object is a lesson, a program and a match.

---

## 20. Open questions — with recommendations

| # | Question | Recommendation | Rationale |
|---|---|---|---|
| 1 | Does onboarding ask the segment question or infer it? | Ask once, in one screen, three cards. Make it reversible in settings and change nothing else about the account | Inference is wrong often enough to be insulting, and a researcher shown XP animations leaves immediately |
| 2 | Is the professional credential self-issued? | Self-issued for the hackathon, framed explicitly as "pending institutional partner." Do not claim accreditation you do not have | A jury will ask, and an honest answer is stronger than an overclaim |
| 3 | Live PvP in the demo, or recorded? | Live on two laptops on a local network, with a recorded fallback cued and ready | Live is worth the risk; unprepared live is not |
| 4 | Which algorithm is the demo centrepiece? | **Bell state.** Grover appears as a thirty-second pre-built showcase at the end if time allows | Bell is buildable live inside two minutes and demonstrates every claim. Grover live is a failure mode |
| 5 | Who owns curriculum authoring? | One team member full-time from H0, authoring U0–U3 only | This is the most commonly underestimated task in the build |
| 6 | Where does Vaishali's research work land? | The competitor table (§8) and misconception catalogue (§6) are the research outputs. Both are directly reusable on slides 2 and 6 | Ties the survey work to a shipped artefact |

---

## 21. Research and references

Open and check every link before it goes on slide 6. A dead reference is the cheapest possible way to lose credibility.

**Primary technical**
- Qiskit documentation and Qiskit Aer simulator reference
- PennyLane documentation and PennyLane Codebook
- Cirq documentation
- OpenQASM 3 specification
- Nielsen and Chuang, *Quantum Computation and Quantum Information* — standard reference for gate semantics and algorithm formulations

**Competitive landscape**
- IBM Quantum Composer and IBM Quantum Learning
- Q-CTRL Black Opal
- Microsoft Quantum Katas
- Quirk
- qBraid, Classiq, Quantum Odyssey, Quantum Country

**Policy**
- National Quantum Mission, Department of Science and Technology — dst.gov.in/national-quantum-mission-nqm. Cabinet approval 19 April 2023; outlay ₹6,003.65 crore; period 2023–24 to 2030–31; 50–1,000 physical qubits targeted within eight years; four thematic hubs

**Education research** — cite two, not ten, and read them
- Quantum computing education literature on documented misconception patterns (supports §6)
- Sweller on cognitive load; Kapur on productive failure; Bloom on mastery learning (support §5)
