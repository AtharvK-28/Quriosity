# Quriosity

**SIH 26140 · Logic Sorcerers · AI-Based Interactive Quantum Algorithm Learning Platform**

A quantum circuit workbench that teaches. Drag a gate, watch the Qiskit write
itself, run it, and — when it is wrong — be told which gate on which wire, and
what to do about it.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 421 tests: physics, tutor, curriculum, import/export, optimiser, density, placement, media, offline
```

**Demo from a production build, not from `npm run dev`:**

```bash
npm run build && npm start
```

Two reasons. The offline shell only registers there — a service worker in front
of `next dev` fights hot reload and serves chunks that no longer exist. And dev
mode double-invokes every effect under Strict Mode, which has already produced
one visible bug (the fork banner announced itself as an ordinary draft restore,
because the effect consumed its own one-shot flag on the first pass).

No Docker, no database. The simulator, the grader and the tutor's rule engine
all run in the browser. An API key is optional — it switches the tutor chat
from the built-in guide to Claude:

```bash
cp apps/web/.env.example apps/web/.env.local   # then set ANTHROPIC_API_KEY
```

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
| Workbench — five state views, editable Qiskit and OpenQASM, import, export, save, share | `/build` | Built |
| **Shared circuit** — read-only, run on arrival, fork into your bench | `/build/[circuitId]` | Built |
| **Tutor chat** — docked beside the circuit on the bench, lessons and challenges | ⌘/ or "Ask the tutor" | Built |
| **Qubit playground** — θ and φ, six gates, measure and collapse, a hundred fresh copies | `/playground` | Built |
| **Instructor console** — misconception heatmap, cohort completion, CSV export | `/teach` | Built |
| **Challenge authoring** — build the answer, the target is derived from it | `/teach/author` | Built |
| **Tracks** — Optimisation, Cryptography, Simulation: framing, hours, capstones | `/tracks`, `/tracks/[trackId]` | Built |
| **Completion record** — shows whether it was edited, and says what it can't prove | `/record/[code]` | Built |
| **Progress** — units, beliefs held and resolved, challenge record, what next and why | `/profile` | Built |
| Review bench (retention decay + SM-2) | `/review` | Built |
| **Settings** — mode, name, theme, usage log on/off, export and delete your data | `/settings` | Built |
| **Docs** — IR schema, conventions, formats, keyboard, limits | `/docs` | Built |
| Gate reference | `/reference` | Built |

### The engine

| Module | What it does |
|---|---|
| `lib/ir/` | The frozen IR schema (TRD §4), gate registry with unitaries, the ten validation invariants, canonical hash, as-soon-as-possible column layout |
| `lib/sim/` | State-vector simulator, reduced density matrices for any subset of wires, Bloch vectors, purity, von Neumann entropy, pairwise links, separability, shot sampling, a noise model |
| `components/viz/` | Bloch sphere in WebGL (three.js) with an SVG peer view, probability histogram, state-vector table, density-matrix heatmap, pair links |
| `lib/grade/` | Fidelity grading — global-phase invariant, state-based, never structural |
| `lib/tutor/` | The deterministic rule engine, L01–L13, mapped to misconceptions M1–M14; the shorter-equivalent optimiser; and the chat around it: corpus, BM25 retrieval, server-built circuit context, sentence-level output guard, built-in guide |
| `app/api/tutor/` | Streams the tutor as NDJSON — Claude when a key is set, the built-in guide otherwise |
| `lib/render/` | Qiskit, Cirq, PennyLane, Q# and OpenQASM 3 renderers — pure `IR → str`, zero network; mid-circuit reads stay where they happen |
| `lib/io/` | OpenQASM 2/3 and Qiskit readers (no `eval`, located errors), Jupyter export, circuit-in-the-URL share links |
| `lib/curriculum/` | U0–U3 as data: 19 nodes, each with hook, task, target, instruction, pass note and a retrieval prompt; tracks, completion records, and the what-next recommender |
| `lib/analytics.ts` | PRD §8's event taxonomy, typed, logged pseudonymously to this browser |

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

## Offline

"Safe to give with the network down" used to mean only that nothing on the demo
path makes a network call. Now it means the app survives the network being gone:
`public/sw.js` precaches the shell and all nineteen lesson routes on install, so
a reload — or a first visit to a node nobody opened — works with the wifi off.

It installs, too. `app/manifest.ts` declares it, and the claim is honest rather
than decorative:

- there is no backend; execution, grading and the tutor's rule engine are all
  on the device
- `next/font` self-hosts the three typefaces at build time
- nothing in `app/`, `components/` or `lib/` requests anything off-origin

Two things are deliberately never cached. **`/api/*`**, because the tutor streams
NDJSON and a replayed stream is a wrong answer with a confident face. And
**`/video/*`**, because the lesson videos are ~20MB each — offline, a video
fails and the player falls back to its committed transcript, which is the same
content by another route.

Losing the network puts a chip in the top bar reading *offline · still works*.
It is measurement green, not error red, because nothing here has failed.

```
pull the wifi → reload → keep teaching
```

Verified by driving a real browser with the network cut: reload, an unvisited
lesson, a circuit built and run, and an uncached route producing a page that
names the cause instead of a browser error. `tests/offline.test.ts` holds the
precache list to the curriculum, so a twentieth node cannot quietly go missing.

Icons are generated, not drawn: `node scripts/make-icons.mjs` renders a Bloch
sphere and its state vector from the same tokens the app uses.

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
- The **path** draws the curriculum as gates on the learner's own wire, and
  every gate carries its title. An earlier pass captioned only the current node
  in the name of restraint, which turned twelve passed nodes into twelve
  identical ticks — a path you cannot read is a progress bar in costume. Naming
  them all and tightening the spacing took the page from 3,350px to 1,400px.
- The **landing** carries one claim, one instrument and one action above the
  fold.

- The **review bench** plots a forgetting curve per concept with a dot at where
  it stands now, grouped into due / this week / holding. A flat bar can say
  "retention is 0.62"; only the curve says how fast it is falling, which is the
  only reason the number is interesting.

Everything else is behind a `Disclosure`, or it is not on the screen.

One rule learned the hard way: **a multi-qubit gate can never be drawn as its
base letter.** `cx` carries X and `cz` carries Z in the registry, so rendering
the registry glyph puts a bare "X" beside Pauli-X and calls them different
things. `components/circuit/GateMark.tsx` is the single renderer for gates
outside the circuit grid, shared by the tray and the reference, so that bug
cannot come back in one place while being fixed in the other.

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

## The tutor chat

⌘/ (Ctrl+/ on Windows) or "Ask the tutor" on the bench, a lesson or a
challenge. It opens beside the circuit, not over it, and only when asked — in
every mode. If the rule engine already has a finding for the current run, it
sits at the top of an empty conversation, instantly and with no model call.

Two engines behind one wire format (`POST /api/tutor`, NDJSON):

| | With `ANTHROPIC_API_KEY` | Without |
|---|---|---|
| Answers from | Claude (`claude-opus-5`, low effort, streamed) | The built-in guide: the rule engine's finding, or the best passage from the platform's own lessons, gate registry and misconception list |
| Labelled | "Claude" | "Built-in guide" |

What keeps it honest:

- **The server never trusts the circuit it is sent.** It rebuilds the IR from
  known fields, validates it, re-simulates it, grades it against the node's own
  target (looked up server-side) and runs the rule engine. The model sees that
  summary, so any probability it quotes came out of the simulator.
- **Context travels as a mid-conversation system message**, after the
  question. The system prompt — instructions plus the whole curriculum as
  reference — stays byte-identical and is prompt-cached, and learner text
  cannot pose as platform context.
- **Every sentence is checked before it streams.** Gate references
  (`[[gate:h]]`, rendered as chips that link to the reference row) must name a
  registry gate; stray tags are stripped.
- **No solutions on lessons or challenges.** The context says when disclosure
  is not allowed; the bench is a sandbox and may get full circuits.
- **Failure degrades, it does not break.** A declined request is re-run
  server-side on Anthropic's recommended fallback model (`fallbacks:
  "default"`, beta `server-side-fallback-2026-07-01`). If the service is
  unreachable, rate-limiting or rejects the key before any text arrives, the
  guide answers instead and says why.
- Ten questions a minute per address, 1,500 characters a question, twelve
  turns of history. The limiter is in memory — one instance only.

The key lives in `apps/web/.env.local` (git-ignored), is read only in the route
handler, and never reaches the browser.

---

## Design system

Two themes, one structure (`styles/tokens.css`). Toggle in the top bar; the
choice persists and is applied before first paint.

**Night** is the default — the deep violet and gold of the team prototype
(`UI Reference/qurio-prototype (1).html`), which is also closer to the Design
Doc's original dark-and-gold direction.

```
page    #140a2b    paper #20123f    ink     #f5efff    frame #9d7fd6    action #f4c430
measure #46e6a8    phase #7cc4ff    error   #ff6b93    flag  #ff8a4c
```

Every text and control pair on the night ground passes WCAG AA. Three
prototype values did not and were lifted: dim text (4.3:1 → 6.2:1), input
hairlines (1.4:1 → 3.6:1) and wires (now 45% ink, 4.0:1). Phase moved from
indigo to sky blue — indigo on violet is 2.7:1 and would read as chrome — and
flag moved to coral so it cannot be mistaken for the gold.

**Day** is the UI reference's v2 "instrument direction" paper:

```
paper   #f7f4ec    page  #e3ded1    ink     #16150f
measure #00867a    phase #4a3fd4    error   #e8306f    flag #e8a33d
```

Colour is data. Every saturated hue means a physical quantity — measurement,
phase, deviation, attention. Gold is the one exception, with one job: the next
thing to press. Structure is ink on paper: shadows only on what floats over the
page (popovers, the tutor), radius 0–3px, 2px frames, a 24px graph grid,
registration crosses at the corners.

Instrument Serif carries conceptual statements only. Space Grotesk is every
piece of interface, 15px floor. JetBrains Mono is reserved for notation — gates,
kets, readouts, axis ticks.

---

## Mode matrix (PRD §6.3)

| | Guided | Workbench | Track |
|---|---|---|---|
| Lands on | `/path` | `/build`, code lane open | `/tracks` |
| Nav | Path, Challenges, Bench, Review, Progress | Bench, Docs | Tracks, Challenges, Bench, Review, Progress |
| XP, badges | Visible | **Hidden** | Hidden |
| Streak | Visible | **Hidden** | Visible |
| Tutor | Proactive on failure | **Only when invoked** | Curriculum-linked |
| Locked gates | Per node | No | Per track |
| Qubit cap | 12 | 16 | 12 |

Workbench mode producing any proactive tutor output is a P1 defect, not a
preference — it is asserted in the E2E suite. A shorter-equivalent suggestion
is never proactive in any mode: it waits behind "Diagnosis" on the bench and
appears on the lesson's pass screen, after the work is done.

The PRD asks for 20 qubits in Workbench. Assumption A1's fallback applies: the
browser simulator keeps the state after every column for the scrubber, and
2²⁰ amplitudes per column does not fit, so the cap is 16 and the bench says so
where the stepper stops.

---

## Code in, code out

The code panel edits **Qiskit** and **OpenQASM**; Cirq, PennyLane and Q# are
rendered. Applying an edit replaces the canvas as one undoable change. An edit
is never overwritten by a canvas change (E3-S6) — the notice holds both until
you pick one.

Reading code does not run it. The Qiskit reader accepts straight-line
construction: one `QuantumCircuit(n, m)`, one gate call per statement, angles
as numbers, π expressions or names bound to them. Loops, functions, registers,
`compose`, custom gates, modifiers and classical control are refused with the
line, the column and the construct named, because a skipped line is a
different circuit. Arbitrary Python still needs the sandbox in TRD §8.

Text has no columns, so imports are laid out as early as each gate can go.
Round-tripping any circuit through QASM or Qiskit gives back the same IR with
its gaps closed — asserted over every fixture and every challenge answer in
`tests/io.test.ts`. Rendering keeps mid-circuit measurements where they happen
in all five dialects; previously they were gathered at the end, which changes
the physics.

**Share** copies `/build/<circuit>`: the path segment is the circuit, encoded.
Nothing is uploaded, the link is validated like any other input, and the page
it opens is read-only with a fork button.

---

## Testing

```bash
npm test                            # 421 unit tests, blocking
node tests/e2e/demo.spec.mjs        # 54 browser checks (needs a running server)
node tests/e2e/shots.mjs            # screenshots of every surface
```

`tests/golden.test.ts` is the blocking physics gate from TRD §14 — ten
hand-verified circuits asserted to 1e-9, plus endianness, grading and Bloch
correctness. If it fails, the product is showing wrong physics.

`tests/optimise.test.ts` checks every suggested rewrite against random input
states, not only |0…0⟩, because a rewrite that only agrees on |0⟩ is not an
identity.

---

## What is left

Audited against the PRD epics. **M** = MVP-blocking in the PRD's own MoSCoW,
**S** = v1.

### Needs the backend

Nothing below can be honest without a server: FastAPI gateway, Postgres, Redis,
Celery, and the Docker sandbox (TRD §8).

| # | Gap | Where the frontend stands |
|---|---|---|
| E1 (M) | **Accounts**, progress across devices | Everything is local to one browser, and Settings says so |
| E3-S3 (M) | **Arbitrary Python** → IR | Straight-line Qiskit is read in the browser; anything needing execution is refused by name |
| E4-S1, S2, S6, S7 (M/S) | Queued, sandboxed execution on Aer/Cirq/PennyLane, result cache | Runs in the browser simulator |
| E9 (M) | **Arena** — matchmaking, Elo, server-decided winner | Not started; cannot be faked |
| E10-S1, S4, S5 | Roster import, assignments, a student's submission | Heatmap, completion and CSV export run on a seeded cohort, labelled as seeded |
| E8-S5, E8-S6, E11 | Signed records, publishing authored challenges, circuits across devices | Records are tamper-evident but unsigned; authored challenges and saved circuits stay in the browser that made them |
| SEC5 | Rate limits | Only the tutor's in-memory limiter |

### Not done, and not blocked

- **Internationalisation** (PRD §7.7). UI strings are still written in the
  components. Externalising them is a mechanical sweep across every screen and
  was left for its own pass.
- **Units U4–U8.** Content, not code, and decision D9 chose U0–U3 deep.
- **Grover rule L06** exists but cannot fire yet: there is no Grover content
  and no multi-controlled Z.
- **`tutor_feedback`** is in the event taxonomy but the dock has no
  helpful/not-helpful control.
- Design Doc keys **⌘K** (command palette), **[ ]** (collapse lanes) and
  **Space** (play the scrubber); the optional **placement check** at onboarding.
- The density-matrix grid draws up to four wires; wider registers offer single
  wires and pairs.

### Closed in the frontend completion pass

- **Code → canvas** (E3-S3 in the browser, E3-S6): editable Qiskit and
  OpenQASM, located parse errors, apply/discard, restricted to the node's gates
  in lessons and challenges.
- **Q# and OpenQASM in the SDK toggle** (E3-S2). Both renderers existed; neither
  was offered.
- **OpenQASM import and Jupyter export** (E3-S4, E3-S5).
- **Toffoli placement.** The bench collected one control and produced a CCX
  that failed validation. Multi-wire placement now collects every wire, which
  also gives **barriers a span** (E2-S7).
- **Keyboard grammar** (E2-S8): rotations, S†/T†, phase, reset, CZ, Toffoli,
  SWAP, barrier, select, move, and a `?` shortcut sheet.
- **Removing a wire asks first** (E2-S4); the qubit cap follows the mode.
- **Density matrix view** with purity and entropy on any subsystem (E5-S5), and
  **pairwise entanglement** as brackets on the canvas and a pair list (E5-S6).
- **Shorter equivalents** (E7-S6): cancellations, phase merges, rotation merges
  and H·X·H, each verified by simulation; offered after a pass, applied as one
  undoable edit.
- **What next, and why** (E7-S7) on the path and progress pages, from mastery
  gates, recurring misconceptions and retention.
- **Tracks and completion records** (E6-S6, E8-S5), **challenge authoring**
  (E8-S6), **cohort CSV export** with formula injection neutralised (E10-S6,
  SEC9).
- **Saved circuits and share links** (E11-S1, E11-S2).
- **Settings and Docs** routes; mode change (E1-S3), data export and deletion
  (§7.4).
- **Analytics** (§8): the typed taxonomy, including the S2, S3 and S4 events
  the PRD says to instrument first, logged locally and switchable off.
- Mid-circuit **measurements are marked** on the canvas (E2-S5); locked gates
  name the node that unlocks them (E2-S9); the top bar no longer overlaps
  itself on a phone.

### Closed in earlier passes

**The team palette.** Night (violet and gold, from the teammate's prototype) is
the default theme and the paper is Day. The colours were adopted; the
prototype's failing contrast values were not — see the design system above.

**The tutor chat** (E7-S3). Claude phrasing over the rule engine, grounded in a
server-side re-simulation of the learner's circuit and in the platform's own
curriculum, with a built-in guide that answers when there is no key or no
service. Covered by `tests/tutor-chat.test.ts` and `tests/tutor-claude.test.ts`.

**The qubit playground** (`/playground`), ported from the prototype with the
real 3D sphere, the registry's own gate matrices, and repeatable measurement.
Not ported: the prototype's sign-in forms, which could only pretend to create
an account.

**Challenges** (E8). Fourteen puzzles in three kinds. A hint is offered only
after a miss and only when asked; a full answer opens after three. Every
challenge carries a reference solution that `tests/solvable.test.ts` asserts.

**Instructor console** (E10). The heatmap leads, ranked by students affected,
with the real rule and misconception ids, labelled as seeded in the header.

**Progress** (`/profile`). Unit rings, and the belief record: every rule the
tutor fired on your circuits, and whether you have since worked it out.

**The bench survives a refresh** (E11-S3); **mastery is enforced** (E6-S3) with
a consolidation door for anyone below 80%; **run failures each name a cause and
a fix** (E4-S4), checked before the run wherever possible.

- Rotation gates had no parameter control, which left three nodes unsolvable.
- CNOT and CZ rendered as bare "X" and "Z" in the tray.
- The bench dropped CNOT entirely in Guided mode.
- The entanglement indicator dashed the whole wire, including before the gate
  that caused it.
