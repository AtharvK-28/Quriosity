# Technical Requirements Document
## Quriosity — architecture, contracts and build order

| Field | Value |
|---|---|
| PS ID | 26140 |
| Team | Logic Sorcerers |
| Version | 1.1 — adds §0, the as-built record |
| Parent documents | 01-Ideation-Document-v2.md, 02-Product-Requirements-Document.md, 03-Design-Document.md |
| Audience | Implementers, and Claude Code as an implementation agent |

> **The one rule.** The circuit IR schema in §4 is frozen before any other code is written. Every service in this system is a function over that object. Renegotiating it mid-build is the single failure mode most likely to cost the project.

---

## 0. As built

Sections 1–16 are the design. This section records where the build that exists took a different route, and why, so the document can be read against the code without surprises. The one rule held: the IR in §4 is unchanged, and every surface below is still a function over it.

### 0.1 Differences from the design

| Design (§) | As built | Why |
|---|---|---|
| Next.js 14, TanStack Query (§1.2) | Next.js 16 App Router; Zustand for all client state | Few server calls — sync, cohorts, arena — so a query cache added weight without a job |
| React Flow canvas (§1.2, T9) | Hand-built canvas (`components/circuit/CircuitCanvas.tsx`) on a fixed column grid | The fixed grid and the full keyboard grammar (Design §11.2) are the interaction; a free-form node editor had to be fought for both |
| Monaco editor (§1.2) | Code panel with its own rendering; Qiskit and OpenQASM 2/3 are **parsed**, never executed (`lib/io/`) | No user code runs anywhere, so there is nothing to sandbox and no 2MB editor to lazy-load |
| FastAPI gateway (§1, §7, T8) | Node/TypeScript server, `apps/server` — plain `node:http` + `ws` | It imports the web app's own IR validator, simulator and grader, so a server re-grade is identical to the client's by construction, not by a golden-parity test (§14, T10) |
| Celery + Docker sandbox + Aer/Cirq/PennyLane workers (§1, §6, §8) | In-browser state-vector simulator (`lib/sim/`, 16-qubit cap); the server re-simulates arena submissions with the same code | Nothing executes user code, which removes the attack surface §8 exists to contain. Renderers for Qiskit, Cirq, PennyLane, Q# and OpenQASM 3 exist; *execution* on those SDKs does not, so D4's Aer-versus-Cirq check is not yet demonstrable |
| PostgreSQL 16 (§9) | Postgres — Neon in production, PGlite (in-process Postgres) locally and in tests. Schema: `apps/server/src/db/schema.sql` | One dialect everywhere; no database to install to run or test the server |
| Redis: queue, cache, leaderboards (§1, §12.1, §13.1) | Not used. Matchmaking runs in the server process; the leaderboard is one indexed query | One server instance. A second instance needs a shared queue — this is the first thing to add at scale |
| Qdrant + RAG over SDK docs (§11.4) | BM25 over the platform's own corpus (lessons, gate registry, misconceptions); Claude answers from a server-built summary of the learner's circuit | Grounding in the platform's own content and the simulator result; retrieval over official SDK docs is still to do |
| LangChain + LLM API (§11) | Anthropic TypeScript SDK, `claude-opus-5`, streamed | Direct SDK; no orchestration layer needed for one call |
| Guardrails G1–G7 (§11.3) | G1 (probabilities checked against the simulator, placeholders filled from it), G2 (gate references validated), G3 (low-confidence refusal), G4 (length cap), G5 (no proactive output in Workbench), G7 (solution disclosure gated server-side) — plus a **physics firewall** that withdraws any answer breaking a law of quantum mechanics or misstating what a fixed gate does, checked against the gate matrices | G6 (per-response source tagging) is partial: the learner is told which engine answered |
| Arena anti-cheat (§12.4) | Impossible-solve-time and known-solution copy checks, both flagging and withholding rating; same-IP collusion check not built | |

### 0.2 What is built exactly as designed

Auth (§13.4): Argon2id at the stated parameters, 15-minute HS256 access tokens held in memory, 30-day refresh tokens in an httpOnly `SameSite=Strict` cookie, rotated on every use with family revocation on reuse; roles student / instructor / admin; RBAC decided per route on the server. Arena (§12): rating-band matchmaking widening to ±400, 60-second timeout, Elo with K=32/16 and a floor of 100, rating and match record in one transaction, server-clock ordering, one computation told to both players, 30-second reconnect grace; Blitz, Circuit golf and Bug hunt (E9-S6). Grading (§10): fidelity, global-phase invariant, partial credit. The rule engine: L01–L13 (§4.3).

### 0.3 Deployment as built

| Part | Where | Settings |
|---|---|---|
| Web app | Vercel | `ANTHROPIC_API_KEY` (optional — without it the built-in guide answers); `API_ORIGIN` (optional — defaults to the deployed server) |
| Server | Render | `DATABASE_URL` (Neon), `JWT_SECRET` (required — the server refuses to start in production without it), `INSTRUCTOR_CODE`, `ADMIN_EMAILS`, `CORS_ORIGIN` |
| Database | Neon Postgres | The schema applies itself on boot |

The web app reaches the server through its own origin (`/api/server/*` is rewritten to the server) so the refresh cookie is first-party. The arena's WebSocket connects to the server directly with the access token. Everything a learner does on the path, the bench and the challenges runs in the browser and works with the server down.

---

## 1. Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│  CLIENT — Next.js 14 (App Router), TypeScript, Zustand, TanStack Query │
│  React Flow (canvas) · Monaco (editor) · Three.js (Bloch) · D3 (charts)│
└───────────────┬────────────────────────────────┬───────────────────────┘
                │ REST (JSON)                    │ WebSocket
                ▼                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│  GATEWAY — FastAPI                                                     │
│  auth · circuits · curriculum · grading · tutor · arena · instructor   │
│  JWT (access 15m / refresh rotating) · RBAC · rate limits · OpenAPI    │
└───┬────────────┬─────────────┬──────────────┬────────────┬─────────────┘
    │            │             │              │            │
    ▼            ▼             ▼              ▼            ▼
┌────────┐  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌─────────┐
│  IR    │  │ GRADING │  │  TUTOR   │  │  ARENA    │  │ CURRIC. │
│ SERVICE│  │ SERVICE │  │  ENGINE  │  │  SERVICE  │  │ SERVICE │
│        │  │         │  │          │  │           │  │         │
│validate│  │fidelity │  │rules ⇒   │  │matchmake  │  │DAG,     │
│lint    │  │partial  │  │ RAG ⇒    │  │Elo        │  │mastery, │
│render  │  │credit   │  │ LLM      │  │authority  │  │SM-2     │
└───┬────┘  └────┬────┘  └────┬─────┘  └─────┬─────┘  └────┬────┘
    │            │            │              │             │
    └────────────┴────────────┴───────┬──────┴─────────────┘
                                      ▼
                     ┌────────────────────────────────┐
                     │  CELERY (broker: Redis)        │
                     └───────────────┬────────────────┘
                                     ▼
     ┌───────────────────────────────────────────────────────────┐
     │  EXECUTION WORKERS — one ephemeral container per job      │
     │  no network · read-only fs · non-root · rlimits · timeout │
     │  adapters: Aer │ Cirq │ PennyLane │ (qBraid)              │
     └───────────────────────────────────────────────────────────┘

     PostgreSQL 16   ·   Redis 7   ·   Qdrant   ·   Object store (exports)
```

### 1.1 Service responsibilities

| Service | Owns | Never does |
|---|---|---|
| Gateway | Auth, routing, RBAC, rate limits, WebSocket fanout | Physics |
| IR service | Schema validation, structural lint, transpilation to 4 SDKs, QASM import/export | Execution |
| Execution workers | Running circuits and user code in isolation, returning normalised results | Persistence, authorisation |
| Grading | Fidelity, partial credit, gate-count scoring | Deciding what to grade against |
| Tutor engine | Rule detection, retrieval, LLM phrasing, guardrails | Asserting a measurement outcome the simulator did not produce |
| Arena | Matchmaking, authoritative timing, Elo | Trusting client timestamps |
| Curriculum | Node DAG, mastery, unlocks, spaced repetition scheduling | Content authoring UI (v2) |

### 1.2 Stack decisions

| Layer | Choice | Why this and not the obvious alternative |
|---|---|---|
| Frontend | Next.js 14 App Router + TypeScript | SSR for the marketing and path surfaces, client rendering for the workbench, one deployment |
| Canvas | React Flow with a custom grid layer | Hand-rolled SVG is a week we do not have; React Flow gives drag, selection and viewport for free, and the grid constraint is a custom node type |
| Editor | Monaco | Only editor with credible Python IntelliSense in the browser. Lazy-loaded — it is ~2MB |
| 3D | Three.js | WebGL2 with a fallback path already specified |
| State | Zustand for IR, TanStack Query for server state | The IR store must be synchronous and fine-grained; a query cache is the wrong shape for it |
| API | FastAPI | Python end to end means the IR schema, the transpilers and the simulators share types. Pydantic v2 gives schema validation and OpenAPI in one definition |
| Queue | Celery on Redis | Redis is already needed for leaderboards and pub/sub. One dependency, three uses |
| Relational | PostgreSQL 16 | Elo update + match record must commit atomically |
| Vectors | Qdrant | Self-hostable, no managed dependency at demo time |
| Isolation | Docker, one container per job | Not negotiable. See §8 |

---

## 2. Repository layout

```
quriosity/
├── apps/
│   ├── web/                        Next.js
│   │   ├── app/                    routes
│   │   ├── components/             per §9 of the design doc
│   │   ├── lib/ir/                 TS mirror of the IR types + client validator
│   │   ├── lib/render/             client-side SDK renderers (no server call)
│   │   ├── stores/                 circuitStore, uiStore, sessionStore
│   │   └── styles/tokens.css       design tokens, one file, generated
│   └── api/                        FastAPI
│       ├── routers/
│       ├── services/
│       ├── models/                 SQLAlchemy
│       ├── schemas/                Pydantic
│       └── main.py
├── packages/
│   ├── ir/                         THE SCHEMA. Python source of truth
│   │   ├── schema.py               Pydantic models
│   │   ├── gates.py                gate registry + unitary matrices
│   │   ├── validate.py
│   │   ├── lint.py                 structural rules (feeds the tutor)
│   │   ├── hash.py                 canonical hash for caching
│   │   └── render/{qiskit,cirq,pennylane,qsharp,qasm}.py
│   ├── quantum/                    adapters + normalisation
│   │   ├── adapters/{aer,cirq,pennylane}.py
│   │   ├── normalise.py            endianness, ordering, phase
│   │   ├── analysis.py             partial trace, purity, Bloch vectors
│   │   └── noise.py
│   ├── tutor/
│   │   ├── rules/                  one module per misconception M1–M14
│   │   ├── retrieve.py
│   │   ├── prompt.py
│   │   └── guard.py                simulator cross-check, refusal path
│   └── curriculum/
│       ├── content/                YAML nodes — the authored curriculum
│       └── dag.py
├── workers/
│   ├── executor.py                 Celery task
│   └── Dockerfile.sandbox
├── infra/
│   ├── docker-compose.yml
│   └── docker-compose.demo.yml     seeded, cache-warmed
├── tests/
│   ├── golden/                     known state vectors, per §12
│   └── ...
└── docs/{ir-schema.md,api.md,gates.md}
```

`packages/ir` is imported by the API, the workers and the tests. The TypeScript mirror in `apps/web/lib/ir` is generated from the Pydantic models, not maintained by hand.

---

## 3. Data flow — the canonical path

```
User drags H onto q0
  → circuitStore.addGate({type:"h", targets:[0], column:0})
  → IR mutates in place, version++
  → renderers/qiskit.ts renders code locally (no network)   ~1ms
  → user presses Run
  → POST /api/v1/execute { ir, backend, shots, noise }
  → gateway validates IR (packages/ir), computes ir_hash
  → cache lookup on (ir_hash, backend, shots, noise)
      hit  → return immediately, flagged cached
      miss → enqueue Celery job, return { job_id }
  → worker container: adapter builds the native circuit from IR,
    simulates, returns { statevector, counts, per_step_states }
  → normalise.py fixes endianness and global phase convention
  → analysis.py computes reduced density matrices and Bloch vectors
  → result cached, pushed over WebSocket to the client
  → client renders histogram + Bloch + state vector at the scrub position
  → if this was a graded node: grading service computes fidelity
      pass → curriculum service records mastery, checks unlocks
      fail → tutor engine runs rules over (ir, target, result)
             → rule hit  → templated diagnosis, LLM phrasing (cached)
             → no hit    → RAG + LLM, guarded against the simulator result
```

Note what is *not* on this path: no server round trip to render code, and no LLM call for a rule-detected error class beyond phrasing. Both are deliberate latency decisions.

---

## 4. The circuit IR

### 4.1 Schema, version 1

```jsonc
{
  "schema_version": "1.0",
  "id": "cir_9f2a...",            // optional; assigned on save
  "qubits": 3,
  "clbits": 3,                     // defaults to qubits
  "gates": [
    {
      "id": "g_01",                // stable across edits, used by the tutor to point at a gate
      "type": "h",                 // lowercase, from the registry in §4.2
      "targets": [0],              // qubit indices, ordered
      "controls": [],              // qubit indices; empty for single-qubit gates
      "params": [],                // floats, radians; length fixed per gate type
      "column": 0                  // integer time slot; multiple gates may share a column
                                   // iff their qubit sets are disjoint
    },
    { "id": "g_02", "type": "cx", "targets": [1], "controls": [0], "params": [], "column": 1 },
    { "id": "g_03", "type": "measure", "targets": [0], "controls": [], "params": [],
      "column": 2, "clbit": 0 }
  ],
  "metadata": {
    "name": "Bell state",
    "created_by": "usr_...",
    "sdk_origin": "canvas"         // canvas | qiskit | cirq | pennylane | qasm
  }
}
```

**Invariants, enforced by the validator:**

1. `1 ≤ qubits ≤ 24`; the effective cap is per-tier and applied at the gateway, not here
2. Every index in `targets` and `controls` is in `[0, qubits)`
3. `targets` and `controls` are disjoint within a gate
4. `len(params)` equals the arity declared in the gate registry
5. All params are finite floats
6. Gate `type` exists in the registry
7. Within one `column`, no two gates share a qubit
8. `column` values are non-negative; gaps are permitted and are rendered as identity
9. `id` is unique within the circuit
10. `measure` gates carry a `clbit` in `[0, clbits)`

**Versioning.** `schema_version` is checked on load. A migration function per version bump lives in `packages/ir/migrate.py`. Saved circuits are stored with the version they were written under and migrated on read, never in place.

**Canonical hash.** `ir_hash = sha256(canonical_json)` where canonical JSON drops `id`, `metadata` and all gate `id`s, sorts gates by `(column, min(targets ∪ controls))`, and rounds params to 9dp. Two circuits that are physically identical must hash identically, or the cache is useless.

### 4.2 Gate registry

| `type` | Name | Targets | Controls | Params | Unitary |
|---|---|---|---|---|---|
| `i` | Identity | 1 | 0 | 0 | `[[1,0],[0,1]]` |
| `x` | Pauli-X | 1 | 0 | 0 | `[[0,1],[1,0]]` |
| `y` | Pauli-Y | 1 | 0 | 0 | `[[0,-i],[i,0]]` |
| `z` | Pauli-Z | 1 | 0 | 0 | `[[1,0],[0,-1]]` |
| `h` | Hadamard | 1 | 0 | 0 | `(1/√2)[[1,1],[1,-1]]` |
| `s` | Phase S | 1 | 0 | 0 | `[[1,0],[0,i]]` |
| `sdg` | S dagger | 1 | 0 | 0 | `[[1,0],[0,-i]]` |
| `t` | Phase T | 1 | 0 | 0 | `[[1,0],[0,e^{iπ/4}]]` |
| `tdg` | T dagger | 1 | 0 | 0 | `[[1,0],[0,e^{-iπ/4}]]` |
| `rx` | X rotation | 1 | 0 | 1 (θ) | `[[cos(θ/2), -i·sin(θ/2)],[-i·sin(θ/2), cos(θ/2)]]` |
| `ry` | Y rotation | 1 | 0 | 1 (θ) | `[[cos(θ/2), -sin(θ/2)],[sin(θ/2), cos(θ/2)]]` |
| `rz` | Z rotation | 1 | 0 | 1 (θ) | `[[e^{-iθ/2},0],[0,e^{iθ/2}]]` |
| `p` | Phase | 1 | 0 | 1 (φ) | `[[1,0],[0,e^{iφ}]]` |
| `cx` | CNOT | 1 | 1 | 0 | controlled-X |
| `cz` | Controlled-Z | 1 | 1 | 0 | controlled-Z |
| `swap` | SWAP | 2 | 0 | 0 | standard |
| `crx`,`cry`,`crz` | Controlled rotations | 1 | 1 | 1 (θ) | controlled-R |
| `ccx` | Toffoli | 1 | 2 | 0 | doubly-controlled X |
| `measure` | Measurement | 1 | 0 | 0 | — (carries `clbit`) |
| `reset` | Reset | 1 | 0 | 0 | — |
| `barrier` | Barrier | n | 0 | 0 | — (no physical effect) |

The registry is the single definition of arity, matrix and rendering name per SDK. Adding a gate is one entry plus one line per renderer.

### 4.3 Structural lint rules

These run on every validate call. They are the tutor's deterministic layer, and they are also useful on their own.

| Rule ID | Detects | Misconception |
|---|---|---|
| `L01_no_entangler` | Target state is entangled; circuit contains no multi-qubit gate | M8 |
| `L02_redundant_pair` | Two adjacent identical self-inverse gates on the same wire with nothing between | — |
| `L03_order_inverted` | Circuit matches a known solution under a transposition of two adjacent columns | — |
| `L04_global_phase_only` | Fidelity ≥ threshold but amplitudes differ by a constant phase | M5 |
| `L05_measure_then_coherent` | A coherent gate follows a measurement on the same wire | M7 |
| `L06_grover_iterations` | Grover structure detected with iteration count ≠ `floor(π/4·√(N/M))` | M11 |
| `L07_control_target_swapped` | Circuit passes when a specific gate's control and target are exchanged | — |
| `L08_idle_qubit` | A declared qubit has no gates and is not measured | — |
| `L09_unmeasured_result` | A qubit carrying the answer is never measured | — |
| `L10_h_without_purpose` | H applied then immediately undone by H with no intervening operation | M1 |
| `L11_reduced_state_mixed` | Bloch view requested on a qubit whose reduced state has purity < 1 − 1e-9 | M4 |
| `L12_relative_phase_ignored` | Submitted \|−⟩ where \|+⟩ was the target, or vice versa | M6 |
| `L13_depth_vs_noise` | Under noise, fidelity < 0.9 and depth exceeds a shorter equivalent | M13 |

Each rule returns `{rule_id, misconception_id, gate_ids: [], qubits: [], columns: [], suggested_fix: {...}}`. The `gate_ids` are what let the interface highlight the exact glyph.

---

## 5. Transpilation

One renderer per target. Each is a pure function `IR → str`. No renderer imports its SDK — rendering is string generation, and the SDK is only needed at execution time.

**Qiskit**
```python
qc = QuantumCircuit(3, 3)
qc.h(0)
qc.cx(0, 1)
qc.measure([0, 1, 2], [0, 1, 2])
```

**Cirq**
```python
q = cirq.LineQubit.range(3)
circuit = cirq.Circuit([
    cirq.H(q[0]),
    cirq.CNOT(q[0], q[1]),
    cirq.measure(*q, key='m'),
])
```

**PennyLane**
```python
dev = qml.device("default.qubit", wires=3)

@qml.qnode(dev)
def circuit():
    qml.Hadamard(wires=0)
    qml.CNOT(wires=[0, 1])
    return qml.probs(wires=[0, 1, 2])
```

**Q#**
```qsharp
operation Run() : Result[] {
    use q = Qubit[3];
    H(q[0]);
    CNOT(q[0], q[1]);
    return ForEach(MResetZ, q);
}
```

**Round-trip requirement.** `parse(render(ir)) == ir` for every circuit in the golden test set, for Qiskit and Cirq at minimum. Parsing is done by executing the rendered code in a sandbox and introspecting the SDK's own circuit object — not by parsing text. Text parsing of Python is a trap; the SDK already has a structured representation and it is authoritative.

---

## 6. Execution adapters

### 6.1 Interface

```python
class Backend(Protocol):
    name: str
    max_qubits: int
    supports_noise: bool

    def run(self, ir: Circuit, shots: int,
            noise: NoiseSpec | None) -> RawResult: ...
```

```python
@dataclass
class RawResult:
    statevector: np.ndarray        # complex128, length 2**n, backend-native ordering
    counts: dict[str, int]         # backend-native bitstring convention
    per_step_states: list[np.ndarray] | None   # for the scrubber; None above 14 qubits
    endianness: Literal["little", "big"]
    duration_ms: int
```

### 6.2 Normalisation — the endianness contract

This is the most common source of "the physics is wrong" bugs and it must be handled at exactly one place.

**Platform convention: little-endian, matching Qiskit.** Basis state index `k` has bit `j` (value `(k >> j) & 1`) equal to the state of qubit `j`. Bitstrings are printed as `q_{n-1} … q_1 q_0`, and the axis label always states this.

- Aer returns little-endian → pass through
- Cirq returns big-endian → reverse the bit order of every index: `psi_normalised[k] = psi_cirq[reverse_bits(k, n)]`
- PennyLane `qml.state()` is big-endian in wire order → same reversal

**Global phase convention.** Normalise so the first amplitude with magnitude > 1e-9 is real and positive. This makes cross-backend comparison exact and makes the state-vector table stable between runs. It does not change any physics — and when a learner asks why, that is misconception M5's teaching moment.

**CI enforcement.** A golden test set of ten circuits with hand-verified state vectors runs against every adapter. Any adapter disagreeing with the golden vector to 1e-9 fails the build. This test is the reason the demo does not show wrong physics on stage.

### 6.3 Noise

```python
@dataclass
class NoiseSpec:
    t1_us: float = 50.0
    t2_us: float = 70.0
    gate_error_1q: float = 0.001
    gate_error_2q: float = 0.01
    readout_error: float = 0.02
    model: Literal["density_matrix", "trajectory"] = "density_matrix"
```

Density-matrix simulation is `4^n` in memory: about 16MB at 10 qubits, 268MB at 12. **Noise is capped at 12 qubits with the density-matrix model**; above that, switch to trajectory sampling with `shots` trajectories and say so in the UI.

### 6.4 Resource ceilings

| n qubits | State vector (complex128) | Verdict |
|---|---|---|
| 12 | 65 KB | Instant |
| 16 | 1 MB | Fast |
| 20 | 16 MB | Default researcher cap |
| 22 | 67 MB | Allowed with a warning |
| 24 | 268 MB | Hard ceiling; blocked at the gateway |

`per_step_states` multiplies by circuit depth. Capture it only when `n ≤ 14 and depth ≤ 40`; beyond that the scrubber recomputes on demand for the requested column only.

---

## 7. API contract

Base: `/api/v1`. All responses `application/json`. Errors follow RFC 9457 problem details with a `code` field the client switches on.

### 7.1 REST

| Method | Path | Auth | Body / params | Returns |
|---|---|---|---|---|
| POST | `/auth/signup` | — | `{email, password, display_name}` | `{access, refresh, user}` |
| POST | `/auth/login` | — | `{email, password}` | `{access, refresh, user}` |
| POST | `/auth/refresh` | refresh | `{refresh}` | `{access, refresh}` — rotated |
| POST | `/auth/logout` | ✓ | — | `204` |
| GET | `/me` | ✓ | — | user, mode, tier, rating, streak |
| PATCH | `/me` | ✓ | `{mode?, theme?, display_name?}` | user |
| DELETE | `/me` | ✓ | — | `202`, deletion queued |
| POST | `/ir/validate` | ✓ | `{ir}` | `{valid, errors[], lint[]}` |
| POST | `/ir/render` | ✓ | `{ir, target}` | `{code, language}` |
| POST | `/ir/parse` | ✓ | `{code, sdk}` | `{ir}` or a located error |
| POST | `/ir/qasm/import` | ✓ | `{qasm}` | `{ir}` |
| GET | `/ir/qasm/export/:circuitId` | ✓ | — | `{qasm}` |
| POST | `/execute` | ✓ | `{ir, backend, shots, noise?, capture_steps?}` | `{job_id}` or `{result, cached:true}` |
| GET | `/execute/:jobId` | ✓ | — | `{status, result?}` — polling fallback |
| POST | `/grade` | ✓ | `{ir, challenge_id}` | `{passed, fidelity, partial, diagnosis?}` |
| GET | `/circuits` | ✓ | `?page` | saved circuits |
| POST | `/circuits` | ✓ | `{ir, name}` | circuit |
| GET | `/circuits/:id` | public if shared | — | circuit |
| POST | `/circuits/:id/fork` | ✓ | — | circuit |
| DELETE | `/circuits/:id` | owner | — | `204` |
| GET | `/curriculum` | ✓ | — | unit and node DAG with lock state |
| GET | `/curriculum/nodes/:id` | ✓ | — | node content |
| POST | `/curriculum/nodes/:id/attempt` | ✓ | `{ir, elapsed_ms}` | `{passed, fidelity, mastery, unlocked[]}` |
| GET | `/curriculum/review` | ✓ | — | scheduled retrieval prompts |
| POST | `/tutor/diagnose` | ✓ | `{ir, target_id?, result?}` | `{source, misconception_id?, message, gate_ids[], fix?}` |
| POST | `/tutor/ask` | ✓ | `{ir, question, history[]}` | streamed message + citations |
| POST | `/arena/queue` | ✓ | `{mode}` | `{queued:true, estimated_wait_s}` |
| DELETE | `/arena/queue` | ✓ | — | `204` |
| POST | `/arena/matches/:id/submit` | ✓ | `{ir}` | `{accepted, job_id}` |
| GET | `/arena/leaderboard` | ✓ | `?scope=global\|institution` | ranked list |
| GET | `/teach/cohorts` | instructor | — | cohorts |
| POST | `/teach/cohorts` | instructor | `{name, roster_csv}` | cohort |
| GET | `/teach/cohorts/:id/progress` | instructor, own | — | student × node matrix |
| GET | `/teach/cohorts/:id/misconceptions` | instructor, own | — | ranked detections with counts |
| GET | `/teach/submissions/:id` | instructor, own | — | IR, result, diagnosis |

### 7.2 WebSocket

Endpoint `/ws?token=…`. All frames `{type, payload, ts}`.

Server → client:

| `type` | Payload |
|---|---|
| `job.queued` | `{job_id, position}` |
| `job.started` | `{job_id}` |
| `job.result` | `{job_id, counts, statevector_summary, bloch[], fidelity?, duration_ms, cached}` |
| `job.error` | `{job_id, code, message}` |
| `match.found` | `{match_id, mode, target, qubits, opponent:{name, rating}}` |
| `match.opponent_progress` | `{gate_count, run_count}` — never the IR |
| `match.result` | `{winner_id, your_rating, delta, opponent_rating}` |
| `match.abandoned` | `{reason}` |
| `tutor.token` | `{text}` — streaming |
| `tutor.done` | `{citations[]}` |

Client → server:

| `type` | Payload |
|---|---|
| `subscribe` | `{job_id}` |
| `match.heartbeat` | `{}` — every 5s; 30s without one starts the abandon clock |
| `match.progress` | `{gate_count, run_count}` — advisory only, never used for scoring |

**The arena's trust boundary.** Nothing a client sends over the socket affects the outcome of a match. Winners are decided by `submitted_at` from the server clock, ordered by job completion, tie-broken by job ID.

---

## 8. Sandbox design

The highest-severity risk in the project. These are requirements, not suggestions.

```
docker run \
  --network=none \
  --read-only \
  --tmpfs /tmp:size=64m,noexec \
  --user 65534:65534 \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --pids-limit=64 \
  --memory=512m --memory-swap=512m \
  --cpus=1.0 \
  quriosity/sandbox:pinned
```

Inside the container, additionally:

- `resource.setrlimit(RLIMIT_CPU, 15)` and `RLIMIT_AS` at 512MB
- Wall-clock kill at 15s from the parent, independent of the in-container limit
- `builtins` restricted for the parse path: no `open`, `__import__` limited to an allowlist (`qiskit`, `cirq`, `pennylane`, `numpy`, `math`)
- stdout captured and size-capped at 64KB; anything longer is truncated with a notice
- Image is pinned by digest, not by tag
- Container is destroyed after every job. No reuse, ever

**Verification test that must exist in CI:** a job that attempts `socket.create_connection(("1.1.1.1", 53))`, a job that attempts to write to `/`, and a job that spins forever. All three must fail in the expected way, and the test asserts the failure mode.

**What is not sandboxed:** IR-only execution (circuit built from validated IR, no user Python) still runs in the same container. There is no fast path that skips isolation, because a fast path that skips isolation is the vulnerability.

---

## 9. Database schema

```sql
CREATE TYPE user_role AS ENUM ('student','instructor','admin');
CREATE TYPE user_mode AS ENUM ('guided','workbench','track');

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,                  -- argon2id
  display_name    TEXT NOT NULL,
  role            user_role NOT NULL DEFAULT 'student',
  mode            user_mode NOT NULL DEFAULT 'guided',
  institution_id  UUID REFERENCES institutions(id),
  rating          INTEGER NOT NULL DEFAULT 1200,
  games_played    INTEGER NOT NULL DEFAULT 0,
  xp              INTEGER NOT NULL DEFAULT 0,
  streak_days     INTEGER NOT NULL DEFAULT 0,
  streak_last_day DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE circuits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  ir           JSONB NOT NULL,
  ir_hash      CHAR(64) NOT NULL,
  schema_version TEXT NOT NULL,
  is_shared    BOOLEAN NOT NULL DEFAULT false,
  forked_from  UUID REFERENCES circuits(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON circuits (owner_id, updated_at DESC);
CREATE INDEX ON circuits (ir_hash);

CREATE TABLE curriculum_nodes (
  id            TEXT PRIMARY KEY,            -- 'u3.n4'
  unit_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  ordinal       INTEGER NOT NULL,
  prerequisites TEXT[] NOT NULL DEFAULT '{}',
  content       JSONB NOT NULL,              -- authored YAML, compiled
  target_state  JSONB,                       -- amplitudes, or a reference circuit
  est_minutes   INTEGER NOT NULL DEFAULT 4
);

CREATE TABLE node_progress (
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id                TEXT NOT NULL REFERENCES curriculum_nodes(id),
  state                  TEXT NOT NULL,       -- locked|available|attempted|passed
  attempts               INTEGER NOT NULL DEFAULT 0,
  first_attempt_correct  BOOLEAN,
  best_fidelity          DOUBLE PRECISION,
  passed_at              TIMESTAMPTZ,
  next_review_at         TIMESTAMPTZ,         -- SM-2
  review_interval_days   INTEGER NOT NULL DEFAULT 0,
  ease_factor            DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  PRIMARY KEY (user_id, node_id)
);
CREATE INDEX ON node_progress (user_id, next_review_at) WHERE next_review_at IS NOT NULL;

CREATE TABLE submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id       TEXT REFERENCES curriculum_nodes(id),
  match_id      UUID,
  ir            JSONB NOT NULL,
  ir_hash       CHAR(64) NOT NULL,
  fidelity      DOUBLE PRECISION,
  passed        BOOLEAN NOT NULL,
  gate_count    INTEGER NOT NULL,
  elapsed_ms    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON submissions (user_id, created_at DESC);
CREATE INDEX ON submissions (node_id, passed);

CREATE TABLE misconception_events (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id    UUID REFERENCES submissions(id) ON DELETE CASCADE,
  node_id          TEXT,
  misconception_id TEXT NOT NULL,     -- 'M8'
  rule_id          TEXT NOT NULL,     -- 'L01_no_entangler'
  resolved         BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON misconception_events (node_id, misconception_id);
-- this index is what makes the instructor heatmap a single fast query

CREATE TABLE matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode          TEXT NOT NULL,             -- blitz|golf|bughunt
  challenge     JSONB NOT NULL,
  player_a      UUID NOT NULL REFERENCES users(id),
  player_b      UUID NOT NULL REFERENCES users(id),
  rating_a_before INTEGER NOT NULL,
  rating_b_before INTEGER NOT NULL,
  winner_id     UUID REFERENCES users(id),
  rating_a_after  INTEGER,
  rating_b_after  INTEGER,
  flagged       BOOLEAN NOT NULL DEFAULT false,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ
);
CREATE INDEX ON matches (player_a, started_at DESC);
CREATE INDEX ON matches (player_b, started_at DESC);

CREATE TABLE institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cohorts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  instructor_id  UUID NOT NULL REFERENCES users(id),
  name           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cohort_members (
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (cohort_id, user_id)
);

CREATE TABLE execution_cache (
  cache_key  CHAR(64) PRIMARY KEY,   -- sha256(ir_hash|backend|shots|noise)
  result     JSONB NOT NULL,
  hits       INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Redis keys:

| Key | Type | Use |
|---|---|---|
| `lb:global` | ZSET | Global ratings |
| `lb:inst:{id}` | ZSET | Institution leaderboard |
| `queue:arena:{mode}` | ZSET | Matchmaking pool, scored by rating |
| `cache:exec:{key}` | STRING | Hot execution cache in front of Postgres |
| `cache:tutor:{misconception}:{hash}` | STRING | Phrased explanations |
| `match:{id}:state` | HASH | Live match state |
| `rl:{scope}:{user}` | STRING | Rate-limit counters |

---

## 10. Grading service

```python
def grade(actual: np.ndarray, target: np.ndarray,
          epsilon: float = 1e-3) -> GradeResult:
    # both normalised
    fidelity = abs(np.vdot(target, actual)) ** 2      # global-phase invariant by construction
    passed = fidelity >= 1.0 - epsilon
    ...
```

- **Pure states:** `F = |⟨ψ_target|ψ_actual⟩|²`. Because the inner product is inside an absolute value, a global phase difference cancels. This is not a convenience — it is the physics, and it is why misconception M5 resolves to an explanation rather than a failure
- **Mixed targets (noise exercises):** `F = (Tr √(√ρ σ √ρ))²`
- **Pass threshold:** `F ≥ 0.999`. Simulator floating-point error is well below this; it is a real tolerance, not a fudge
- **Partial credit:** report `F` as a percentage, plus `argmax|target_k − actual_k|` as the basis state with the largest amplitude error — that is what the lesson screen highlights
- **Golf:** correctness gates scoring; the score is `gate_count`, compared to a stored `par`
- **Never grade on gate names, gate count or ordering** unless the challenge is explicitly a golf challenge. Grading on structure is how a platform teaches ritual instead of understanding

---

## 11. Tutor engine

### 11.1 Pipeline

```
(ir, target, result, node_id, user_history)
   │
   ├─ 1. LINT      packages/ir/lint.py  →  rule hits, deterministic, <5ms
   │        hit ──────────────────────────────┐
   │                                          │
   ├─ 2. RETRIEVE  Qdrant top-k over official docs + curriculum notes
   │                                          │
   ├─ 3. GENERATE  LLM with a structured prompt (§11.2)
   │                                          │
   ├─ 4. GUARD     cross-check every factual claim about measurement
   │                outcomes against the actual simulator result
   │                mismatch → discard, fall back to the rule template
   │                                          │
   └─ 5. CACHE     key = (misconception_id, ir_shape_hash)  ◄──────┘
```

**Rule hits skip retrieval and generation entirely when a cached phrasing exists.** In practice this covers the majority of student failures, at zero model cost and sub-200ms latency. This is what makes the tutor demo-safe.

### 11.2 Prompt structure

```
SYSTEM
You are a quantum computing tutor inside a circuit builder. You are given a
learner's actual circuit and the actual simulation result. Every claim you make
must be checkable against them.

Rules:
- Name specific gates by type, qubit index and column. Never say "your circuit".
- Never state a measurement probability that is not in the RESULT block.
- If the retrieved documentation does not support a claim, say you are unsure.
- One correction at a time. Do not list every problem.
- Do not give the full solution unless the learner has failed three times.
- 60 words maximum.

CONTEXT
  circuit_ir:      {ir}
  target_state:    {target}
  result:          {counts, fidelity}
  lint_findings:   {rule hits with gate_ids}
  learner_history: {misconception ids seen before, attempts on this node}
  retrieved_docs:  {chunks with sources}

USER
  {question or "diagnose this failure"}
```

### 11.3 Guardrails

| # | Guardrail |
|---|---|
| G1 | Any numeric probability in the output is checked against `result.counts`. Mismatch → discard the generation |
| G2 | Any gate reference must correspond to a `gate_id` present in the IR. Hallucinated gates → discard |
| G3 | Retrieval score below threshold → refusal path: "I'm not confident enough to answer that", plus a documentation link |
| G4 | Output is capped at 60 words. Long explanations are a smell that the model is reasoning rather than diagnosing |
| G5 | Workbench mode disables proactive invocation at the router, not in the UI |
| G6 | Every response records `source: rule | rag | fallback` for the analytics event |
| G7 | Solution disclosure is gated on attempt count, enforced server-side |

### 11.4 RAG corpus

| Source | Chunking | Notes |
|---|---|---|
| Qiskit docs (gates, circuits, Aer) | Per section, 400 tokens, 60 overlap | |
| Cirq docs | Same | |
| PennyLane docs and Codebook | Same | |
| OpenQASM 3 spec | Per clause | |
| Own curriculum notes | Per node | Highest retrieval priority — it is written for this learner |
| Gate reference (§4.2) | Per gate | Deterministic answers to "what does T do" |

Embed with a small, fast model; store in Qdrant with metadata `{source, url, version, section}`. Every tutor answer displays its citations. Re-index is a scripted job, not a manual step.

---

## 12. Arena mechanics

### 12.1 Matchmaking

```
on queue(user, mode):
    ZADD queue:arena:{mode} rating user_id
    band = 50
    every 2s:
        candidates = ZRANGEBYSCORE(rating - band, rating + band)
        if candidate found and not self:
            atomically ZREM both, create match, emit match.found to both
        band = min(band + 50, 400)
    after 60s: offer practice target or bot
```

### 12.2 Elo

```
E_a = 1 / (1 + 10 ** ((R_b - R_a) / 400))
R_a' = round(R_a + K * (S_a - E_a))
K = 32 if games_played < 30 else 16
```

Rating floor 100. The rating update and the match record commit in one transaction — an Elo change without a match record is unexplainable, and an unexplained rating change destroys trust in a ranked ladder faster than any bug.

### 12.3 Authoritative resolution

1. Both submissions enter the same Celery queue with equal priority
2. Grading runs; `submitted_at` is the server-side job completion timestamp
3. The winner is the first *passing* submission by that timestamp; ties break on job UUID
4. `match.result` is emitted to both sockets from a single computation — the two clients are told the same thing by construction, not by agreement
5. Client-reported progress (`match.progress`) is advisory display only and never enters scoring

### 12.4 Anti-cheat

| Check | Action |
|---|---|
| Submitted IR hash matches a stored canonical solution exactly, on first attempt, faster than a floor time | Flag the match, withhold the rating change, queue for review |
| More than N submissions per second | Rate-limited at the gateway |
| Two accounts repeatedly matched from the same IP with one always winning | Flag for review |
| Impossible solve time (below the time to physically place the gates) | Flag |

Flagged matches are recorded, not silently reversed. Ratings that change without explanation are worse than ratings that change late.

---

## 13. Cross-cutting concerns

### 13.1 Caching

| Layer | Key | TTL | Expected hit rate |
|---|---|---|---|
| Execution | `sha256(ir_hash|backend|shots|noise)` | 24h in Redis, permanent in Postgres | >60% in a cohort context — a class builds the same circuits |
| Rendered code | Client-side only | session | 100%, it never leaves the browser |
| Tutor phrasing | `(misconception_id, ir_shape_hash)` | 7d | High on the top misconceptions |
| Curriculum DAG | Per user | 5m, invalidated on node pass | — |
| Leaderboard | Redis ZSET | Live | — |

Warm the execution cache for the demo circuits in `docker-compose.demo.yml`. A cached run returns in under 100ms and is labelled as cached — cache the demo, do not fake it.

### 13.2 Rate limits

| Scope | Limit |
|---|---|
| `POST /execute` | 30/min/user, 300/hour |
| `POST /tutor/*` | 20/min/user |
| `POST /auth/*` | 10/min/IP |
| WebSocket frames | 60/min/connection |
| Arena submissions | 10/min/user |

### 13.3 Observability

- Structured JSON logs with `request_id`, `user_id`, `ir_hash`. Never log an IR body at info level; log its hash
- Metrics: job queue depth, p50/p95/p99 execution latency by qubit count, cache hit rate, tutor source split (rule/rag/fallback), guardrail rejection rate, match resolution latency, WebSocket disconnect rate
- The guardrail rejection rate is the tutor's quality signal. If it climbs, the model or the retrieval has drifted
- Health endpoints: `/healthz` (liveness), `/readyz` (DB, Redis, one worker responsive)

### 13.4 Auth

- Argon2id, `time_cost=3, memory_cost=64MB, parallelism=4`
- Access JWT 15 min, refresh 30 days, rotated on every use with reuse detection — a replayed refresh token revokes the whole family
- Refresh tokens in httpOnly, Secure, SameSite=Strict cookies. Access token in memory only, never in `localStorage`
- RBAC enforced by a FastAPI dependency on every route. There is no route where authorisation is implied by the UI

---

## 14. Testing strategy

| Layer | What | Tooling |
|---|---|---|
| **Golden physics** | 10 circuits with hand-verified state vectors: \|0⟩, H\|0⟩, Bell, GHZ-3, W-3, QFT-3, Grover-2 (1 iteration), phase kickback, T-sequence, a deliberately mixed reduced state. Asserted to 1e-9 across every adapter | pytest + numpy |
| IR round-trip | `parse(render(ir)) == ir` for the golden set, Qiskit and Cirq | pytest |
| Endianness | Asymmetric circuit (X on q0 only) produces the same normalised bitstring from every backend | pytest |
| Lint rules | One fixture per rule L01–L13, positive and negative | pytest |
| Grading | Two structurally different Bell circuits both pass; a global-phase-shifted state passes and reports M5; a 0.99 fidelity state fails | pytest |
| Bloch correctness | Reduced density matrix of a Bell qubit has purity 0.5 and a zero Bloch vector | pytest |
| Sandbox | Network attempt fails; filesystem write fails; infinite loop is killed at 15s | pytest + docker |
| Tutor guardrails | Injected hallucinated probability is rejected by G1; injected fake gate reference is rejected by G2 | pytest |
| Arena determinism | 100 simulated simultaneous submissions produce one consistent winner every time | pytest |
| API contract | Schemathesis against the OpenAPI spec | schemathesis |
| Component | Canvas drag, keyboard placement, SDK toggle, scrubber | Vitest + Testing Library |
| E2E | Signup → onboarding → U1 node → failed Bell → tutor diagnosis → pass → arena match | Playwright |
| Accessibility | axe on every route; keyboard-only completion of one full node | axe-core + Playwright |
| Performance | Lighthouse budgets from PRD §7.1 enforced in CI | Lighthouse CI |

**CI gate:** the golden physics suite and the sandbox suite are blocking. Nothing merges if either fails. Everything else reports.

---

## 15. Deployment

`docker compose up` brings up: `web`, `api`, `worker` (×2), `postgres`, `redis`, `qdrant`. `docker-compose.demo.yml` overrides with seeded users, seeded cohort data for the instructor heatmap, and a warmed execution cache.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres |
| `REDIS_URL` | Broker, cache, leaderboards |
| `QDRANT_URL` | Vector store |
| `LLM_API_KEY`, `LLM_MODEL` | Tutor generation |
| `EMBED_MODEL` | Retrieval |
| `JWT_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | Auth |
| `SANDBOX_IMAGE` | Pinned by digest |
| `MAX_QUBITS_GUIDED`, `MAX_QUBITS_WORKBENCH` | Tier caps |
| `EXEC_TIMEOUT_S` | Default 15 |
| `TUTOR_ENABLED` | Kill switch — set false to rehearse the rule-engine-only demo |

`TUTOR_ENABLED=false` must produce a working product with rule-engine diagnoses. Rehearse the demo at least once in that state.

---

## 16. Build order for Claude Code

Sequenced so that each task is independently verifiable and nothing is blocked on an unfinished dependency. Give one task per session, with its definition of done, and do not begin the next until the previous passes.

| # | Task | Prompt shape | Definition of done |
|---|---|---|---|
| **T1** | Freeze the IR | "Implement `packages/ir/schema.py` as Pydantic v2 models matching TRD §4.1 exactly, with the gate registry from §4.2 including unitary matrices as numpy arrays, and `validate.py` enforcing invariants 1–10. Write pytest cases for each invariant, both passing and failing." | All ten invariants have a failing-case test. Registry has a matrix for every unitary gate |
| **T2** | Canonical hash | "Implement `packages/ir/hash.py` per TRD §4.1. Two IRs that differ only in gate ids, metadata, or gate ordering within a column must hash identically." | Property test over shuffled equivalent circuits |
| **T3** | Renderers | "Implement `packages/ir/render/{qiskit,cirq,pennylane,qsharp}.py` as pure `IR → str`. No SDK imports. Match the samples in TRD §5." | Rendered Qiskit and Cirq for the golden set execute without error in the worker image |
| **T4** | Adapters and normalisation | "Implement `packages/quantum/adapters/aer.py` and `cirq.py` against the `Backend` protocol in TRD §6.1, and `normalise.py` implementing the little-endian and global-phase conventions in §6.2." | The endianness test in §14 passes: X on q0 gives the same bitstring from both backends |
| **T5** | Golden physics suite | "Create `tests/golden/` with the ten circuits from TRD §14, hand-verified state vectors as fixtures, and a parametrised test asserting every adapter to 1e-9." | Suite green, and it is wired as a blocking CI gate |
| **T6** | Analysis | "Implement `packages/quantum/analysis.py`: partial trace, reduced density matrix, purity, Bloch vector `(⟨X⟩,⟨Y⟩,⟨Z⟩)`." | A Bell qubit's reduced state has purity 0.5 and Bloch vector (0,0,0) |
| **T7** | Sandbox worker | "Implement `workers/executor.py` as a Celery task and `Dockerfile.sandbox` with every flag in TRD §8. Add the three verification tests." | Network, filesystem and infinite-loop tests all fail in the expected way |
| **T8** | Gateway skeleton | "Implement FastAPI app with auth (§13.4), `/ir/validate`, `/ir/render`, `/execute`, and the WebSocket in §7.2. RBAC as a dependency on every route." | OpenAPI spec generated; schemathesis passes |
| **T9** | Canvas | "Implement `CircuitCanvas` in `apps/web` on React Flow with a fixed 56px column grid, 40px gates, and the drag behaviour in Design Doc §11.1. IR is held in a Zustand store; the canvas is a pure renderer over it." | Drag H onto q0, IR mutates, undo works, 55fps with 20 gates |
| **T10** | Client renderers | "Port the Qiskit, Cirq and PennyLane renderers to TypeScript in `apps/web/lib/render`, generated to match the Python output byte-for-byte on the golden set. The SDK toggle must make no network call." | Golden-set parity test between Python and TypeScript renderers |
| **T11** | Visualisation | "Implement `ProbabilityHistogram` (D3) and `BlochSphere` (Three.js) to Design Doc §10. The Bloch sphere takes a reduced density matrix, not amplitudes." | An entangled qubit renders at the sphere centre with the mixed-state label |
| **T12** | Scrubber | "Implement `TimeScrubber` aligned column-for-column with the canvas. Stepping updates all state views; the transition tweens over 420ms and collapses to 0 under `prefers-reduced-motion`." | Scrub across a Bell circuit; the q0 Bloch vector visibly rotates then collapses to the centre |
| **T13** | Grading | "Implement the grading service per TRD §10, including global-phase invariance and partial credit." | Two different correct Bell circuits pass; a global-phase-shifted state passes and reports M5 |
| **T14** | Lint rules | "Implement `packages/ir/lint.py` rules L01–L13 from TRD §4.3, each returning gate_ids, qubits, columns and a suggested fix. One positive and one negative fixture per rule." | All thirteen rules have both fixtures green |
| **T15** | Curriculum | "Implement the node DAG, mastery gating at 80% first-attempt accuracy, unlock computation, and SM-2 review scheduling per the PRD. Author U0–U3 as YAML in `packages/curriculum/content`." | 19 nodes load; a passed node unlocks its children; a review prompt is scheduled |
| **T16** | Tutor | "Implement the pipeline in TRD §11: lint first, then retrieval and generation, with guardrails G1–G7 and the cache key from §13.1." | With `TUTOR_ENABLED=false`, a missing-CNOT circuit still produces a gate-and-wire diagnosis in under 200ms |
| **T17** | Lesson UI | "Implement the lesson screen from Design Doc §8.3: target and attempt histograms at identical scale, fidelity, in-place tutor panel after a failed run, and the pass screen from §8.4." | A cold user completes a node end to end without instruction |
| **T18** | Path UI | "Implement `PathCircuit` from Design Doc §8.2 — the curriculum rendered as gates on the learner's wire, with locked, current and completed states, and the inline retrieval prompt." | Locked nodes name their unlocking prerequisite |
| **T19** | Arena | "Implement matchmaking, the authoritative resolution in TRD §12.3, Elo in §12.2, and the match UI in Design Doc §8.5. Rating and match record commit in one transaction." | 100 simulated simultaneous submissions produce one consistent winner every time |
| **T20** | Instructor console | "Implement the cohort progress matrix and the misconception heatmap from Design Doc §8.6, backed by a single query over `misconception_events`." | Heatmap renders the ranked cohort errors on seeded data |
| **T21** | Demo hardening | "Create `docker-compose.demo.yml` with seeded users, a seeded cohort, and a warmed execution cache for the demo circuits. Verify the full §18 demo script runs twice with no reset." | Demo script executed twice, back to back, once with `TUTOR_ENABLED=false` |

**Instructions to give Claude Code alongside every task:**

- The IR schema is frozen. If a task seems to require changing it, stop and say so rather than changing it
- Every physics-touching change runs the golden suite before it is considered done
- No user code path may skip the sandbox, including "fast paths" for IR-only execution
- Colour tokens come from Design Doc §5.1. Do not introduce a colour that is not in the token file
- Grading compares states, never structure, unless the challenge is explicitly golf
- The tutor may never assert a measurement outcome that is not present in the simulator result

---

## 17. Traceability

| PS objective | PRD epics | TRD sections |
|---|---|---|
| Interactive web platform | E1, E6 | §1, §2, §7 |
| Graphical and code-based design | E2, E3 | §4, §5 |
| Multi-backend real-time execution | E4 | §6, §8 |
| AI-assisted tutoring and debugging | E7 | §11 |
| State and Bloch visualisation | E5 | §6.2, §14 (golden), Design §10 |
| Assessment, progress, dashboards | E8, E10 | §9, §10 |
| Collaborative and modular learning | E9, E11 | §12 |
