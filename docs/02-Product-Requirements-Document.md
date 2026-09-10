# Product Requirements Document
## Quriosity — AI-Based Interactive Quantum Algorithm Learning Platform

| Field | Value |
|---|---|
| PS ID | 26140 |
| Team | Logic Sorcerers |
| Version | 1.0 |
| Parent document | 01-Ideation-Document-v2.md |
| Child documents | 03-Design-Document.md, 04-Technical-Requirements-Document.md |
| Status | Baseline for build |

---

## 1. Product overview

### 1.1 Vision

Every learner who can write a `for` loop should be able to build, run and understand a quantum algorithm within one evening — and should never be left staring at a wrong probability distribution with no idea which gate caused it.

### 1.2 Product statement

Quriosity is a browser-based quantum workbench built around one canonical circuit representation. The same circuit object is a lesson, a runnable program across four SDKs, a graded challenge and a ranked match. An AI tutor that reads the circuit — not just the chat — localises errors to a specific gate on a specific wire.

### 1.3 Goals

| # | Goal | Measure |
|---|---|---|
| G1 | Close the intuition-to-code cliff | ≥40% of visual-mode learners submit a correct code-mode circuit within 14 days |
| G2 | Make failure diagnostic | Median failed-run → corrected-run time at most half the tutor-off control |
| G3 | Break vendor lock-in | Any saved circuit renders and executes correctly in ≥2 SDKs |
| G4 | Make repetition voluntary | ≥8 challenge attempts per active learner per week |
| G5 | Give instructors an instrument | Cohort misconception heatmap available and actionable within one class session |

### 1.4 Non-goals

- Quantum advantage, or simulation beyond ~22 qubits
- Access to real quantum hardware in v1 (optional enhancement only)
- Being a general-purpose IDE or replacing local Jupyter for production research
- A social network. There are no follows, feeds or DMs
- Hosting arbitrary long-running user compute
- Mobile-native applications in v1

### 1.5 Assumptions

| # | Assumption | If false |
|---|---|---|
| A1 | 20-qubit state-vector simulation runs in under 3s on the deployment host | Reduce the cap to 16 and note it in the UI |
| A2 | An LLM API is reachable during the demo | Rule engine covers the demo path; model calls degrade to cached responses |
| A3 | Learners have a keyboard and a screen ≥1024px for the workbench | Workbench is desktop-first; path and lessons work on mobile |
| A4 | Institutions will supply rosters via CSV, not SSO, in v1 | SSO deferred to v2 |

---

## 2. Personas

### P1 — Aarav, second-year CS undergraduate (primary)
Comfortable in Python, has never written a matrix by hand since school. Signed up because a placement JD mentioned quantum. Learns at 11pm, on a laptop, in 20-minute bursts. Quits the moment something feels like homework. **Needs:** immediate visible result, no installation, and to be told *why* his circuit is wrong, in one sentence.

### P2 — Dr Meera, postdoctoral researcher (credibility)
Writes PennyLane daily, reads papers implemented in Cirq. Has a local environment she likes. Will use a web tool only if it is faster than opening a notebook. **Needs:** paste code, run, compare under noise, share a link. Will close the tab if XP appears.

### P3 — Ravi, senior backend engineer at an IT services firm (impact)
Assigned to "evaluate quantum for the optimisation practice." Nine years of Java. Needs to reach a defensible opinion in six weeks of evenings, and needs something to show his manager. **Needs:** structured track, application framing, a credential.

### P4 — Prof. Sandeep, elective instructor (institutional)
Teaching quantum computing to 60 students with no lab. Marks by hand. Has no idea where the class is stuck until the midterm. **Needs:** assign, auto-grade, and see the cohort's dominant error before the next lecture.

### P5 — Nisha, department admin (operational)
Manages rosters, seats and reporting. Cares about access control and nothing else. **Needs:** bulk import, role assignment, usage report.

---

## 3. Jobs to be done

| # | Job | Persona |
|---|---|---|
| J1 | "When my circuit gives the wrong distribution, tell me which gate is wrong so I can fix it and keep going" | P1 |
| J2 | "Show me the code for what I just built, so I learn syntax without having to produce it first" | P1 |
| J3 | "Let me practise until this is automatic, without it feeling like practice" | P1 |
| J4 | "Run this circuit on two backends and under noise without me rewriting it" | P2 |
| J5 | "Give me a link I can send a collaborator that opens exactly this circuit" | P2 |
| J6 | "Take me from zero to a defensible opinion about whether quantum applies to my problem" | P3 |
| J7 | "Prove to my manager that I did it" | P3 |
| J8 | "Tell me what my class got wrong this week" | P4 |
| J9 | "Get 60 students onto the platform in the right sections in ten minutes" | P5 |

---

## 4. Information architecture

```
/                          Landing (unauthenticated)
/auth/{signup,login,reset}
/onboarding                Mode selection, placement check
/path                      Learning path — the circuit-shaped curriculum map
  /path/:unitId
  /lesson/:nodeId          Lesson player
/build                     Workbench (canvas + code + state)
  /build/:circuitId        Saved circuit / permalink
/challenges                Challenge index
  /challenges/:id          Challenge runner
/arena                     Lobby, queue, rating
  /arena/match/:matchId    Live match
  /arena/leaderboard
/tracks                    Professional tracks
  /tracks/:trackId
/profile/:username         Public profile, rating, credentials
/settings                  Mode, theme, accessibility, account
/teach                     Instructor console
  /teach/cohorts/:id       Roster, progress, misconception heatmap
  /teach/assignments/:id
/admin                     Institution management
/docs                      IR schema, API, gate reference
```

**Mode-conditional navigation.** Guided mode surfaces Path, Build, Challenges, Arena. Workbench mode surfaces Build, Docs, and nothing else by default. Track mode surfaces Tracks, Build, Challenges. The routes all exist; the navigation differs.

---

## 5. Epics and user stories

Priority uses MoSCoW. **M** = MVP-blocking, **S** = v1, **C** = nice to have, **W** = out of scope.

### E1 — Accounts, roles and modes

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| E1-S1 | As a visitor I can sign up with email and password so I can save progress | M | Given a valid unused email and a password ≥8 chars, when I submit, then an account is created, a session is issued, and I land on onboarding. Duplicate email returns a non-enumerating error |
| E1-S2 | As a user I pick my mode at onboarding so the interface matches how I want to learn | M | Three cards: Guided, Workbench, Track. Selection persists to profile. Choosing Workbench hides all XP, streak and leaderboard UI on every subsequent screen |
| E1-S3 | As a user I can change my mode later without losing progress | S | Settings → Mode. Change takes effect on next navigation. Progress, saved circuits and rating are untouched |
| E1-S4 | As a returning user I resume where I stopped | M | Login lands on the last incomplete node, or on Path if none |
| E1-S5 | As an instructor I get an instructor role so I can see cohorts | S | Role is granted by an admin or by a signup code. Instructor sees /teach; students get 403 |
| E1-S6 | As a user I can try the workbench without an account | S | /build works unauthenticated with a 5-qubit cap and no save. Save prompts signup and preserves the circuit through the flow |
| E1-S7 | As a user I can delete my account and data | S | Deletion removes personal data within the session, anonymises match history, and confirms by email |

### E2 — Circuit builder (canvas)

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| E2-S1 | As a learner I drag a gate from the palette onto a wire | M | Drop lands on the nearest valid (wire, column) slot. Invalid drops return the gate to the palette with no state change. IR updates within one frame |
| E2-S2 | As a learner I place a two-qubit gate by choosing control and target | M | CNOT drop prompts for the second wire, or is placed by drag from control to target. Control and target render distinctly and are connected by a vertical line |
| E2-S3 | As a learner I can move, delete and undo | M | Drag to reposition; Delete/Backspace removes selected; Cmd/Ctrl+Z undoes the last IR mutation. Undo stack depth ≥50 |
| E2-S4 | As a learner I can add and remove qubit wires | M | Range 1–20 by tier. Removing a wire with gates on it asks for confirmation and deletes those gates |
| E2-S5 | As a learner I place measurements | M | Measurement is a gate type in the IR with a classical target. Mid-circuit measurement is allowed and marked |
| E2-S6 | As a learner I set parameters on rotation gates | M | RX/RY/RZ open an inline control accepting radians, degrees, or a π-expression (`pi/4`). Invalid input is rejected inline without clearing the field |
| E2-S7 | As a learner I insert barriers | S | Barrier spans selected wires; affects transpilation and visual grouping only |
| E2-S8 | As a learner I can build a circuit with only the keyboard | S | Arrow keys move a cursor across (wire, column); letter keys place gates; Enter confirms two-qubit targets. Documented in a shortcut sheet |
| E2-S9 | As a learner I see gates I am not yet allowed to use | S | Locked gates appear ghosted in the palette with the unlocking node named on hover |

### E3 — Code editor and Rosetta Stone

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| E3-S1 | As a learner the code panel renders my canvas circuit automatically | M | Any IR mutation re-renders the code within 100ms. Rendered code is syntactically valid and executable as-is |
| E3-S2 | As a learner I can switch the rendered SDK | M | Dropdown: Qiskit, Cirq, PennyLane, Q#. Circuit unchanged; only the rendering changes. Switching is instant (no server call) |
| E3-S3 | As a researcher I can write code and have the canvas follow | M | On Run, code is executed in a sandbox, the SDK's own circuit object is introspected, and IR is reconstructed. Canvas re-renders from that IR. Constructs outside the supported gate set produce a named, located error, not a silent failure |
| E3-S4 | As a user I can import and export OpenQASM 3 | S | Round-trip of a supported circuit yields identical IR |
| E3-S5 | As a researcher I can export to a Jupyter notebook | S | Download produces an `.ipynb` with imports, circuit construction, execution and plotting cells that run unmodified |
| E3-S6 | As a user, edits I make in the code panel are not silently lost when I touch the canvas | M | Unsynced code edits raise a non-blocking notice with "Apply to canvas" / "Discard". Never overwrite without asking |

### E4 — Execution

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| E4-S1 | As a learner I run my circuit and see results | M | Run enqueues a job; results stream back over WebSocket; p50 ≤1.2s and p95 ≤3s for ≤12 qubits, 1024 shots |
| E4-S2 | As a user I choose a backend | S | Aer, Cirq, PennyLane selectable. Results are normalised so the same circuit gives the same distribution regardless of backend |
| E4-S3 | As a user I set shot count | M | 1–8192, default 1024. Shots affect the histogram; the state vector is exact and shot-independent |
| E4-S4 | As a learner I get a clear error when execution fails | M | Timeout, memory cap, qubit cap and invalid-circuit each produce a distinct message naming the cause and the fix. No stack traces are shown to students |
| E4-S5 | As a researcher I run under a noise model | S | Noise slider sets thermal relaxation and gate-error magnitude. Noisy and ideal results are shown side by side |
| E4-S6 | As a user, repeated identical runs are instant | S | Cache keyed by hash of (IR, backend, shots, noise). Cache hit returns in <100ms and is labelled as cached |
| E4-S7 | As a platform I never execute user code outside a sandbox | M | Container has no network, read-only filesystem, non-root user, CPU and wall-clock limits, dropped capabilities. Verified by a test that attempts egress and fails |

### E5 — Visualisation

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| E5-S1 | As a learner I see a measurement probability histogram | M | Bars labelled with bitstrings in a stated endianness, sorted by value or by probability, with counts and percentages |
| E5-S2 | As a learner I see a Bloch sphere per qubit | M | Computed from the reduced density matrix. A qubit in a Bell pair renders at the centre of the sphere, not on its surface |
| E5-S3 | As a learner I can scrub through the circuit and watch the state evolve | M | A time cursor over the circuit columns; all state views update to that position. Scrubbing is continuous and does not re-enqueue a job |
| E5-S4 | As a learner I see the state vector with amplitudes and phases | S | Table of basis state, amplitude (a+bi), magnitude, phase, probability. Phase encoded by hue consistent with the rest of the UI |
| E5-S5 | As a researcher I can view the density matrix | C | Heatmap of real and imaginary parts, with purity and von Neumann entropy reported |
| E5-S6 | As a learner I can tell an entangled state from a product state at a glance | S | An entanglement indicator per qubit pair, derived from purity of the reduced state |

### E6 — Learning path and lessons

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| E6-S1 | As a learner I see my path with locked and unlocked nodes | M | Prerequisite DAG rendered; a node unlocks only when all parents are passed |
| E6-S2 | As a learner a node runs the hook → attempt → diagnosis → instruction → completion → build sequence | M | All six beats present for every MVP node. Instruction is never shown before the first attempt |
| E6-S3 | As a learner I must reach mastery before advancing | M | Pass threshold is 80% first-attempt accuracy across the node's checks. Below that, the node offers a variant rather than unlocking the next |
| E6-S4 | As a learner previously-passed concepts come back for retrieval practice | S | SM-2-style scheduling surfaces at most two recall prompts per session, drawn from passed nodes |
| E6-S5 | As a learner I can review a completed node without it affecting mastery stats | S | Review mode is labelled; attempts do not overwrite first-attempt accuracy |
| E6-S6 | As a professional I follow a time-boxed track with application framing | S | Tracks show estimated hours, domain framing, and a completion record |

### E7 — AI tutor

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| E7-S1 | As a learner, when my circuit fails a challenge, the tutor names the specific problem | M | Diagnosis names gate type, wire index and column, and states the corrective action. Generic advice ("check your circuit") is a defect |
| E7-S2 | As a learner the tutor reads my actual circuit | M | The tutor's context includes the current IR and the target state. Its answer references gates that exist in my circuit |
| E7-S3 | As a learner I can ask a free-text question about my circuit | S | Answer is grounded in retrieved documentation; sources are shown; when retrieval confidence is low the tutor says it is unsure rather than guessing |
| E7-S4 | As a learner common mistakes are caught without an LLM call | M | The rule engine covers at minimum: missing entangler, redundant adjacent self-inverse pair, gate order inverted, global-phase-only difference, measurement before required coherent operations, wrong Grover iteration count, control/target swapped, unused qubit, gate on a wire that is never measured |
| E7-S5 | As a researcher the tutor never interrupts me | M | In Workbench mode the tutor produces no proactive output. It responds only to explicit invocation |
| E7-S6 | As a learner the tutor suggests optimisations | S | Given a passing circuit, suggests a lower-gate-count equivalent and states the saving |
| E7-S7 | As a learner the tutor recommends what to do next | S | Recommendation is derived from mastery gaps and misconception history, and names the reason |
| E7-S8 | As a platform, tutor output that contradicts the simulator is suppressed | M | Any tutor claim about a measurement outcome is checked against the actual simulation result before display. Mismatch falls back to the rule-engine text |

### E8 — Assessment and challenges

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| E8-S1 | As a learner I am given a target state and must build a circuit that reaches it | M | Target shown as a Bloch state, a probability distribution, or a state-vector table |
| E8-S2 | As a learner any correct circuit passes, not one canonical answer | M | Grading is fidelity ≥ 1 − ε against the target, invariant to global phase. Two structurally different correct circuits both pass |
| E8-S3 | As a learner circuit-golf challenges score me on gate count | S | Score = gate count; a par value is shown; beating par is recorded |
| E8-S4 | As a learner I see partial credit and what was close | S | Fidelity is reported as a percentage with the dominant amplitude error named |
| E8-S5 | As a professional I receive a verifiable completion record | S | Record includes track, date, node list, and a verification URL |
| E8-S6 | As an instructor I can author a challenge | C | Target defined by supplying a reference circuit; the platform derives the target state |

### E9 — Arena

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| E9-S1 | As a learner I queue for a ranked match | M | Matchmaking pairs the closest available rating; the band widens over time in the queue. Timeout after 60s offers a bot or an unranked practice target |
| E9-S2 | As a learner both players get the identical problem | M | Same target, same starting circuit, same qubit count, delivered simultaneously |
| E9-S3 | As a learner the winner is decided by the server | M | Winner is the first *validated* submission by job-completion timestamp, not by click time. Two simultaneous submits produce one consistent winner for both clients |
| E9-S4 | As a learner I see my opponent's progress without seeing their circuit | S | Gate count and run count only. Never the opponent's IR |
| E9-S5 | As a learner my rating updates after the match | M | Elo with K=32 below 30 games, K=16 above. Rating and match record commit in one transaction |
| E9-S6 | As a learner I can play Circuit Golf and Bug Hunt | S | Golf scores by gate count with a time cap; Bug Hunt scores by first correct fix |
| E9-S7 | As a learner I see a leaderboard only after I have completed U3 | S | Before that, the arena entry point shows the unlock condition instead |
| E9-S8 | As a platform, submitted solutions are checked for copying | S | Exact-IR match against a known-solution table flags the match for review and withholds the rating change |
| E9-S9 | As a learner a disconnect does not lose my rating unfairly | S | Reconnect within 30s resumes. Beyond that the match is abandoned; the disconnecting player forfeits only if the opponent had a valid submission pending |

### E10 — Instructor console

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| E10-S1 | As an instructor I create a cohort and import a roster | S | CSV of name and email; invitations sent; duplicates reported not silently merged |
| E10-S2 | As an instructor I see per-node completion across the cohort | S | Matrix of student × node with state (locked, attempted, passed) and first-attempt accuracy |
| E10-S3 | As an instructor I see the misconception heatmap | S | Aggregated rule-engine detections by misconception ID, ranked by frequency, with the count and percentage of the cohort |
| E10-S4 | As an instructor I assign a node or challenge with a deadline | S | Assignment appears on students' paths; submissions and grades roll up automatically |
| E10-S5 | As an instructor I can open a student's failed submission | S | Read-only view of the IR, the result, and the diagnosis issued |
| E10-S6 | As an instructor I export cohort results | C | CSV download |

### E11 — Sharing and persistence

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| E11-S1 | As a user I save a circuit with a name | M | Saved circuits list, rename, delete |
| E11-S2 | As a user I share a circuit by link | S | Permalink opens the exact circuit read-only; "Fork" copies it into my workspace |
| E11-S3 | As a user my work survives a refresh | M | Unsaved workbench state is restored from local storage on reload |

---

## 6. Functional requirement detail

### 6.1 Supported gate set (MVP)

| Gate | Symbol | Qubits | Parameters | Notes |
|---|---|---|---|---|
| Identity | I | 1 | — | Used for timing and idle-noise demonstrations |
| Pauli-X | X | 1 | — | |
| Pauli-Y | Y | 1 | — | |
| Pauli-Z | Z | 1 | — | |
| Hadamard | H | 1 | — | |
| Phase S | S | 1 | — | S† also available |
| Phase T | T | 1 | — | T† also available |
| Rotation | RX, RY, RZ | 1 | θ | Accepts radians, degrees, π-expressions |
| Phase | P | 1 | φ | |
| Controlled-NOT | CX | 2 | — | Control and target explicit in IR |
| Controlled-Z | CZ | 2 | — | |
| SWAP | SWAP | 2 | — | |
| Controlled-rotation | CRX, CRY, CRZ | 2 | θ | v1 |
| Toffoli | CCX | 3 | — | |
| Measurement | M | 1 | classical target | Mid-circuit allowed |
| Barrier | ‖ | n | — | Visual and transpilation hint only |
| Reset | R | 1 | — | v1 |

Any circuit using a gate outside this set is rejected at IR validation with the gate named.

### 6.2 Grading specification

- Grade by **state fidelity**: F = \|⟨ψ_target \| ψ_actual⟩\|². Pass when F ≥ 0.999
- Fidelity is **invariant to global phase** by construction. Two circuits differing only by e^{iθ} both pass, and misconception M5 fires as an explanation, not as a failure
- For mixed targets (noise exercises), use F = (Tr√(√ρ σ √ρ))²
- **Circuit golf** grades on gate count with a par value; correctness is a gate to scoring, not part of it
- Partial credit reports fidelity as a percentage plus the basis state with the largest amplitude error
- Grading never depends on gate *names* or ordering. It depends only on the resulting state

### 6.3 Mode behaviour matrix

| Behaviour | Guided | Workbench | Track |
|---|---|---|---|
| Default landing route | /path | /build | /tracks |
| Primary panel | Canvas | Code | Lesson |
| Tutor | Proactive on failure | Explicit invocation only | Curriculum-linked |
| XP, streaks, badges | Visible | Hidden | Streak only |
| Leaderboard | After U3 | Hidden | Hidden |
| Arena entry point | Visible | Hidden | Hidden |
| Default qubit cap | 12 | 20 | 12 |
| Default shots | 1024 | 4096 | 1024 |
| Locked gates | Yes, by node | No | Yes, by track |

### 6.4 Permissions matrix

| Capability | Guest | Student | Instructor | Admin |
|---|---|---|---|---|
| Build and run (5 qubits) | ✓ | ✓ | ✓ | ✓ |
| Build and run (tier cap) | — | ✓ | ✓ | ✓ |
| Save circuits | — | ✓ | ✓ | ✓ |
| Learning path | — | ✓ | ✓ | ✓ |
| Arena | — | ✓ | ✓ | — |
| Create cohort | — | — | ✓ | ✓ |
| View cohort analytics | — | — | Own cohorts | All |
| View a student's submission | — | Own only | Own cohorts | All |
| Author challenges | — | — | ✓ | ✓ |
| Manage roles | — | — | — | ✓ |
| Institution reporting | — | — | — | ✓ |

An instructor can never see a student's circuits outside their own cohort. This is enforced server-side on every read, not by hiding UI.

---

## 7. Non-functional requirements

### 7.1 Performance budgets

| Surface | Metric | Budget |
|---|---|---|
| Landing | Largest Contentful Paint | ≤2.0s on a 4G connection |
| Path | Time to interactive | ≤2.5s |
| Workbench | Time to interactive | ≤3.5s (Monaco and Three.js lazy-loaded) |
| Canvas | IR mutation → code panel update | ≤100ms |
| Canvas | Drag frame rate | ≥55fps with 20 gates on screen |
| Execution | p50 latency, ≤12 qubits, 1024 shots | ≤1.2s |
| Execution | p95 latency, ≤12 qubits | ≤3.0s |
| Execution | Hard timeout | 15s, then a named error |
| Tutor | Rule-engine diagnosis | ≤200ms |
| Tutor | LLM-phrased response, p95 | ≤2.5s, streamed |
| Arena | Submission → both clients see the result | ≤500ms after job completion |
| Bloch sphere | Render and update | ≥30fps for up to 6 spheres |

### 7.2 Scalability

- Target 500 concurrent learners and 50 concurrent executions on the demo deployment
- Execution workers scale horizontally and are stateless
- Cache hit rate on IR-hash lookups expected above 60% in a teaching context, because a cohort builds the same circuits
- Leaderboards read from Redis sorted sets, never from a Postgres aggregate query

### 7.3 Security

| # | Requirement |
|---|---|
| SEC1 | User code executes only in an ephemeral container: no network, read-only filesystem, non-root, dropped Linux capabilities, memory and CPU limits, hard wall-clock kill |
| SEC2 | Passwords stored with Argon2id. No password is ever logged |
| SEC3 | JWT access tokens ≤15min, refresh tokens rotated on use with reuse detection |
| SEC4 | All authorisation decisions are server-side. Hidden UI is not a control |
| SEC5 | Rate limits: execution 30/min/user, tutor 20/min/user, auth 10/min/IP |
| SEC6 | Input validation on the IR before it reaches any renderer or worker. Reject unknown gate types, out-of-range wire indices, non-finite parameters |
| SEC7 | Code rendered into the editor is never `eval`'d in the browser |
| SEC8 | Match results are computed server-side only; the client is never trusted for timing |
| SEC9 | Uploaded rosters are validated and size-capped; CSV formula injection is neutralised on export |
| SEC10 | Secrets in environment variables, never in the repository. Committed `.env.example` only |

### 7.4 Privacy and data protection

- Comply with India's Digital Personal Data Protection Act, 2023 principles: collect only what the product needs, state the purpose at collection, and honour deletion
- Personal data collected: email, display name, institution (optional), progress and submission records
- **Never collected:** date of birth beyond an over-13 attestation, phone number, location beyond timezone
- Learner circuit submissions are visible to the learner, and to instructors only for their own cohorts
- Analytics are event-level and pseudonymous; no third-party advertising trackers
- Data export and deletion available from settings; deletion anonymises rather than removes match history so opponents' ratings remain explicable

### 7.5 Accessibility — WCAG 2.2 AA

| # | Requirement |
|---|---|
| A11Y1 | Full keyboard operation of circuit building, including two-qubit gate placement |
| A11Y2 | Visible focus indicator on every interactive element, never removed |
| A11Y3 | Text contrast ≥4.5:1; UI component and graphical object contrast ≥3:1 |
| A11Y4 | Colour is never the sole carrier of meaning. Phase is encoded by hue **and** by an arrow angle; probability by height **and** by a printed value; gate identity by glyph **and** by label |
| A11Y5 | Every visualisation has a text-equivalent view — the state-vector table is the accessible alternative to the Bloch sphere and is a first-class view, not a fallback |
| A11Y6 | `prefers-reduced-motion` disables the state-evolution animation and the celebration sequence; scrubbing still works, it just does not tween |
| A11Y7 | Live regions announce run results and tutor diagnoses |
| A11Y8 | Target size ≥24×24px; gate drop targets ≥44×44px |
| A11Y9 | The palette is verified against deuteranopia, protanopia and tritanopia simulations |

### 7.6 Reliability

- Execution worker failure must not lose a job; jobs are acknowledged only on completion
- A failed run leaves the circuit intact. The user never loses work to a backend error
- Degraded mode: if the LLM is unreachable, the rule engine still diagnoses and the UI says the explanation is abbreviated
- Degraded mode: if Redis is unavailable, execution falls back to synchronous with a reduced qubit cap and the arena is disabled rather than made unfair

### 7.7 Internationalisation

- All UI strings externalised from day one; English at launch
- Curriculum content is a separate translatable layer from UI chrome
- Mathematical notation is not translated
- Number and date formatting locale-aware; Indian digit grouping supported

### 7.8 Browser support

Chrome, Edge and Firefox current and current−1; Safari 16+. WebGL2 required for the Bloch sphere, with the state-vector table as the automatic fallback where it is unavailable.

---

## 8. Analytics event taxonomy

Every event carries `user_id` (pseudonymous), `session_id`, `mode`, `timestamp`.

| Event | Properties | Feeds metric |
|---|---|---|
| `signup_completed` | method | Funnel |
| `mode_selected` | mode, is_change | Segment split |
| `node_started` | node_id, unit_id | S1 |
| `node_attempted` | node_id, attempt_index, is_first_attempt | S1, mastery |
| `node_passed` | node_id, attempts, first_attempt_accuracy | S1 |
| `circuit_run` | qubits, gate_count, backend, shots, noise, cached, duration_ms | Perf, cost |
| `run_failed` | error_type | Reliability |
| `challenge_submitted` | challenge_id, fidelity, passed, gate_count | S6 |
| `misconception_detected` | misconception_id, node_id | S3, heatmap |
| `tutor_invoked` | trigger (proactive/explicit), source (rule/llm), latency_ms | S4 |
| `tutor_feedback` | helpful (bool) | S4 |
| `tutor_suggestion_applied` | misconception_id, applied (bool) | **S4 — the real signal** |
| `corrected_after_failure` | node_id, seconds_since_failure, tutor_shown | **S3** |
| `code_mode_first_correct` | node_id, days_since_first_canvas_node | **S2 — headline metric** |
| `sdk_toggled` | from, to | Rosetta usage |
| `match_started` / `match_ended` | mode, rating_before, rating_after, result, duration | S6 |
| `streak_extended` | length | S5 |
| `session_end` | duration, nodes_touched | S5 |

Instrument S2, S3 and S4 before anything else. They are the metrics the product's central claim rests on.

---

## 9. Edge cases and error states

| Situation | Required behaviour |
|---|---|
| Circuit with zero gates, Run pressed | Run succeeds; result is \|00…0⟩ with 100% probability. This is correct and is a teaching moment, not an error |
| Qubit count exceeds tier cap | Blocked before enqueue; message names the cap and the mode that raises it |
| Circuit exceeds gate limit (500) | Blocked with the count shown |
| Execution timeout | "This circuit needed more than 15 seconds. Try fewer qubits or fewer shots." Circuit preserved |
| Code panel contains a syntax error | Inline marker at the line; canvas is not modified; previous IR retained |
| Code uses an unsupported construct | Named error: "`custom_gate` is not in the supported gate set" with a link to the gate reference |
| Two players submit within the same millisecond | Server orders by job completion timestamp then by job ID; both clients receive the identical result |
| Opponent disconnects mid-match | 30s reconnect grace, then the match resolves per E9-S9 |
| Tutor retrieval returns nothing relevant | Tutor says it cannot answer confidently and offers the rule-engine diagnosis or a documentation link. It does not improvise |
| Tutor claim contradicts the simulator | Suppressed; rule-engine text shown instead; logged as a defect |
| Learner submits a circuit that is correct but slower/longer than par in golf | Marked correct, scored below par, with the shorter solution offered after submission |
| Instructor opens a student outside their cohort | 403 from the API, not a filtered UI |
| Browser without WebGL2 | State-vector table replaces the Bloch sphere automatically with a one-line notice |
| Offline mid-session | Unsaved circuit persists locally; runs queue and report "waiting for connection" |

---

## 10. Release plan

| Milestone | Contents | Exit criterion |
|---|---|---|
| **M0 — Skeleton** | Repo, Compose, IR schema frozen, auth, empty shells | `docker compose up` serves both apps; IR schema committed |
| **M1 — The loop** | Canvas → IR → Aer → histogram + Bloch | Drag H, press Run, see 50/50 and a correct Bloch vector |
| **M2 — Two surfaces** | Monaco rendering Qiskit, SDK toggle, code → IR on run | A Bell state built on canvas produces runnable Qiskit; typed Qiskit reproduces the canvas |
| **M3 — Judgement** | Grading service, 19 nodes of U0–U3, mastery gating | Two different correct Bell circuits both pass; a cold user reaches a graded Bell state unaided |
| **M4 — Diagnosis** | Rule engine (9 misconceptions), LLM phrasing layer, tutor UI | Missing-CNOT circuit produces a gate-and-wire-specific diagnosis in ≤2.5s |
| **M5 — Arena** | Matchmaking, Blitz, server-authoritative result, Elo | Two clients, one winner, ratings committed transactionally |
| **M6 — Institution** | Instructor console, cohort import, misconception heatmap | Heatmap shows the dominant cohort error on seeded data |
| **M7 — Demo hardening** | Seeded data, cache warming, fallback recording, rehearsal | Full 5-minute demo executed twice, back to back, with no reset |

M0–M4 is the hackathon MVP. M5 is the differentiator and should ship if M4 lands early. M6 is the institutional argument and can be demonstrated on seeded data if time is short — but it must be labelled as seeded if asked.

---

## 11. Dependencies

| Dependency | Used for | Risk if unavailable |
|---|---|---|
| Qiskit + Aer | Primary simulator | Blocking. No fallback |
| Cirq, PennyLane | Cross-backend claim | Degrades Rosetta to rendering-only |
| LLM API | Tutor phrasing | Degrades to rule-engine text |
| Vector store | RAG grounding | Free-text tutor disabled; rule engine unaffected |
| Redis | Queue, cache, leaderboard | Arena disabled; synchronous execution fallback |
| PostgreSQL | All persistent state | Blocking |
| Docker | Sandbox | Blocking — do not ship without it |

---

## 12. Decision log

| # | Decision | Alternative rejected | Reason |
|---|---|---|---|
| D1 | One canonical IR as the single source of truth | Direct canvas↔code translation | Translation drifts; IR makes each new SDK one renderer |
| D2 | Fidelity grading, not structural matching | Compare against a reference circuit | Structural matching teaches ritual and rejects valid answers |
| D3 | Deterministic rule engine in front of the LLM | LLM-only tutor | Faster, cheaper, and cannot hallucinate on the common paths |
| D4 | Queue with sandboxed workers | Synchronous execution in the API process | Isolation, timeouts and fair match timing in one decision |
| D5 | Bloch sphere from the reduced density matrix | Per-qubit amplitudes | The naive version is physically wrong for entangled states and would be caught on stage |
| D6 | Ask the mode question at onboarding | Infer from behaviour | Inference is wrong often enough to alienate researchers |
| D7 | Postgres for relational state, Redis for ephemeral | Single document store | Elo updates and match records must commit together |
| D8 | Leaderboard locked until U3 | Leaderboard from day one | Ranking beginners against strangers suppresses retention |
| D9 | Ship U0–U3 deep rather than U0–U8 shallow | Broad coverage | A complete path to a Bell state demonstrates the loop; eight shallow units demonstrate nothing |
| D10 | Desktop-first workbench, responsive path | Full mobile parity | Circuit building needs pointer precision and screen width; lessons do not |
