# Design Document
## Quriosity — visual language, interaction design and screen specifications

| Field | Value |
|---|---|
| PS ID | 26140 |
| Team | Logic Sorcerers |
| Version | 1.0 |
| Parent documents | 01-Ideation-Document-v2.md, 02-Product-Requirements-Document.md |
| Scope | Brand, tokens, components, screens, interaction, motion, accessibility, copy |

---

## 1. Design brief

**Subject.** A quantum circuit workbench that teaches. The materials of this world are amplitude, phase, interference, time-ordering and measurement. The instruments are oscilloscopes, optical benches, Bloch spheres and gold-plated dilution refrigerators. The notation is Dirac's.

**Audience.** Three, with opposite tolerances. A second-year undergraduate who quits when something feels like homework. A postdoc who quits when something feels like a game. A senior engineer who needs to show a manager something.

**Primary job of the design.** Make a wrong circuit legible. Everything else — the path, the arena, the dashboards — is in service of the moment where a learner sees *which gate* is wrong and why.

**Constraint that shapes everything.** This interface displays real physics. Colour, position and motion in this product are carrying data, not decoration. That single constraint produces the design system below.

---

## 2. Design principles

**1. Colour is data.**
Saturated colour on screen means something physical: phase, probability, error, entanglement. Chrome — buttons, panels, navigation — is achromatic. This is the discipline that makes the product legible and, incidentally, makes it look unlike every other education app, which spends its colour budget on decoration.

**2. The state is never more than one glance away.**
Circuit, amplitude, Bloch sphere and histogram are co-visible and locked to the same time position. A learner should never have to remember what the state was.

**3. Show, then explain.**
Every instructional beat leads with the artefact — the target, the failing distribution, the degraded histogram — and follows with words. Never a paragraph before a picture.

**4. Failure is a first-class state.**
A wrong circuit is the product's central use case, not an error path. It gets the best-designed screen in the product, not a red toast.

**5. Two speeds, one product.**
The Guided surface is generous, animated and encouraging. The Workbench surface is dense, fast and silent. They share tokens and components; they do not share pacing. Building both is not a compromise, it is the thesis.

**6. Spend boldness once.**
The memorable moment is the time scrubber — drag across the circuit and watch the state evolve continuously beneath it. Everything around it stays quiet.

---

## 3. What we take from what works

An honest audit of interfaces that solved a problem we also have.

| Product | What it does well | What we take | What we deliberately reject |
|---|---|---|---|
| **Duolingo** | Streaks and a visible path make daily return feel automatic; lessons are three minutes | Short nodes, prerequisite path, streak, immediate correctness feedback | The mascot's guilt mechanics and celebration density. Our researchers will not tolerate it, and our students are adults |
| **Brilliant** | Interactive-first lessons; almost no prose; you manipulate before you read | The "hook before instruction" beat order; the discipline of a lesson screen with one interactive object and under 40 words | Purely conceptual endpoints. Brilliant never reaches executable code; that is our whole reason to exist |
| **Khan Academy** | Mastery gating and honest progress reporting | Mastery threshold before unlock; progress that means something | Dense list-shaped navigation |
| **Exercism / Codecademy** | Split-pane exercise and editor with instant test feedback | The two-pane rhythm and the "run → see judgement" loop | The generic IDE chrome; our second pane is a live physical state, not a terminal |
| **Replit** | Zero-setup execution in the browser feels magical | Zero install as a headline promise | General-purpose file trees. We have one artefact: a circuit |
| **Observable** | Reactive documents where changing a value updates everything downstream | The scrubber model: one time cursor, everything downstream recomputes | Notebook cell metaphor. Circuits already have a linear order |
| **Lichess** | Ranked play that is fast, honest and legible; server-authoritative results; clean rating display | Elo presentation, match result screen, the norm that the server decides | Chess-specific density. Our players are beginners at the notation itself |
| **Linear** | Keyboard-first speed; restraint; a dark theme that is actually designed | Command palette, keyboard grammar, the confidence to leave space empty | Its palette; ours is dictated by physics |
| **Figma / Excalidraw** | Canvas manipulation that feels physical; snapping that is forgiving | Snap-to-slot drag behaviour, marquee select, spatial undo | Infinite canvas. A circuit has a finite grid and that is a feature |
| **Quantum Country** | Spaced repetition embedded in the reading itself | Retrieval prompts scheduled into later lessons | Static prose as the primary medium |
| **Stripe docs** | Code samples that switch language in place without losing your position | The SDK toggle pattern, exactly | — |
| **IBM Quantum Composer** | The gate-on-wire grid is the correct spatial model and everyone already knows it | The grid model. Do not invent a new one out of vanity | Its lack of teaching, and its single-vendor framing |

**The synthesis.** Duolingo's return loop, Brilliant's lesson shape, Exercism's judgement rhythm, Observable's reactivity, Lichess's competitive honesty — over Composer's grid, in Linear's tempo.

---

## 4. Brand

### 4.1 Name

**Quriosity** — curiosity with the qubit's *q*. It reads correctly on first sight, which most quantum puns do not. Written in sentence case everywhere. Never "QuriOsity", never all caps.

### 4.2 Mark

A single wire crossed by one gate — the smallest complete circuit that does something. Rendered as a horizontal rule with a square gate glyph containing a lowercase **q**. At 16px the wire drops away and only the gate square remains. The mark is literally a piece of the product's own notation, which is the point: everything here is made of circuits, including the logo.

```
      ┌───┐
 ─────┤ q ├─────
      └───┘
```

### 4.3 Voice

Plain, specific, unhurried. The product knows more than the reader and does not perform it.

| Do | Don't |
|---|---|
| "q0 is in superposition, but q0 and q1 are still separable. Add a CNOT with q0 as control." | "Oops! Something's not quite right 😅" |
| "This circuit needed more than 15 seconds. Try fewer qubits or fewer shots." | "An unexpected error occurred." |
| "Both circuits reach the same state. There is more than one right answer here." | "Correct! 🎉 Amazing job!!" |
| "Grover's search is quadratically faster, not exponentially." | "Quantum computers are exponentially powerful!" |

Errors do not apologise and are never vague about what happened. Empty screens invite an action. Celebrations state what was achieved rather than how the learner should feel about it.

---

## 5. Design tokens

### 5.1 Colour

The palette has two layers with a hard boundary between them.

**Layer 1 — Chrome (achromatic).** Surfaces, text, borders, controls. Carries no meaning.

Dark theme, *Cryostat*:

| Token | Hex | Use |
|---|---|---|
| `--bg-base` | `#0F1320` | Application background |
| `--bg-panel` | `#161B2C` | Panels, cards, palette |
| `--bg-raised` | `#1E2438` | Menus, popovers, active rows |
| `--bg-inset` | `#0B0E18` | Editor gutter, code background, wells |
| `--line-subtle` | `#242B41` | Panel dividers, grid lines |
| `--line-strong` | `#39425E` | Focused borders, circuit wires |
| `--text-primary` | `#E8EBF4` | Headings, body |
| `--text-secondary` | `#9BA4C0` | Labels, metadata |
| `--text-muted` | `#5F6885` | Disabled, placeholders |

Light theme, *Bench*:

| Token | Hex | Use |
|---|---|---|
| `--bg-base` | `#F3F5F2` | Cool paper, faintly green — a plotter sheet, not a warm cream |
| `--bg-panel` | `#FFFFFF` | |
| `--bg-raised` | `#FAFBF9` | |
| `--bg-inset` | `#ECEFEA` | |
| `--line-subtle` | `#DDE1DA` | |
| `--line-strong` | `#A8AFA4` | |
| `--text-primary` | `#171C24` | |
| `--text-secondary` | `#525B66` | |
| `--text-muted` | `#8A93A0` | |

**Layer 2 — Physics (chromatic).** Every saturated colour in the interface is a quantity.

*Phase wheel.* Phase φ maps to hue directly: `hue = φ × 180/π`, saturation 70%, lightness 62% (dark) or 44% (light). Six named anchors for legends, icons and documentation:

| φ | Name | Dark | Light |
|---|---|---|---|
| 0 | `--phase-0` | `#E85C6B` | `#B32B3C` |
| π/3 | `--phase-60` | `#D69A3C` | `#96661B` |
| 2π/3 | `--phase-120` | `#5FBF6B` | `#2E8038` |
| π | `--phase-180` | `#3FB8C4` | `#177F89` |
| 4π/3 | `--phase-240` | `#6B87E0` | `#3550AD` |
| 5π/3 | `--phase-300` | `#C063C9` | `#8A2E93` |

The wheel is cyclic and perceptually smooth, which matters because 2π and 0 are the same physical phase and must be the same colour. This is the standard domain-colouring convention from complex analysis; a physicist reads it without a legend, and a student learns a convention they will meet again.

*Magnitude.* Amplitude magnitude drives opacity and bar height, never hue. `|amplitude|² → alpha` in the range 0.15–1.0, so a near-zero amplitude is visible but obviously small.

*Semantic physics colours* (fixed, outside the wheel):

| Token | Hex (dark) | Meaning |
|---|---|---|
| `--state-correct` | `#4FC98A` | Fidelity above threshold |
| `--state-incorrect` | `#F0705F` | Fidelity below threshold |
| `--state-partial` | `#E0A93F` | Close but failing |
| `--state-entangled` | `#8E7BF5` | Entanglement indicator on a wire pair |
| `--state-noise` | `#7A8299` | Noise-degraded overlay series |
| `--state-measured` | `#C9CEDC` | Classical register, post-measurement |

*Brand accent, used sparingly:* `--accent-gold #E0B36A`, drawn from the gold-plated wiring of a dilution refrigerator. It appears on exactly three things — streak, rank badge, and the primary call to action on the landing page. Nowhere else. Because chrome is achromatic and physics owns the spectrum, one warm metal is enough to make the product recognisable.

### 5.2 Typography

| Role | Family | Rationale |
|---|---|---|
| Display, headings, and all mathematics | **STIX Two Text** | The subject's native typography is mathematical. Using the same face for a heading and for ⟨ψ\|φ⟩ means Dirac notation can appear in a headline without a font switch. It also gives the product a scholarly voice that separates it from the rounded-sans look of consumer education apps |
| Interface and body | **Instrument Sans** | A grotesque with slightly narrow forms and a large x-height; holds up at 12px in dense panels and does not read as a system default |
| Code and numeric data | **JetBrains Mono** | Ligatures off, slashed zero on. Disambiguates `l1I` and `O0`, which matters when the difference is a qubit index |

Type scale, 1.200 minor third from a 16px base:

| Token | Size / line-height | Family | Use |
|---|---|---|---|
| `--type-display` | 44 / 48 | STIX Two Text | Landing hero, unit titles |
| `--type-h1` | 33 / 40 | STIX Two Text | Page titles |
| `--type-h2` | 27 / 34 | STIX Two Text | Section headings, lesson titles |
| `--type-h3` | 22 / 28 | Instrument Sans, 600 | Panel headings |
| `--type-body-lg` | 18 / 29 | Instrument Sans | Lesson prose |
| `--type-body` | 16 / 26 | Instrument Sans | Default |
| `--type-small` | 14 / 21 | Instrument Sans | Labels, metadata |
| `--type-micro` | 12 / 16 | Instrument Sans, 500 | Wire labels, axis ticks |
| `--type-code` | 14 / 22 | JetBrains Mono | Editor, IR view |
| `--type-data` | 13 / 18 | JetBrains Mono | Amplitude tables, ratings, timers |

Lesson prose is capped at 68 characters per line. Panels may go narrower; nothing goes wider.

### 5.3 Space, radius, elevation

4px base scale: `1, 2, 3, 4, 6, 8, 12, 16, 24` → `4, 8, 12, 16, 24, 32, 48, 64, 96`px.

Radius is hierarchical rather than uniform — a single radius on everything is the flattest possible signal:

| Token | Value | Applies to |
|---|---|---|
| `--r-gate` | 3px | Gate glyphs. Nearly square, because they are notation |
| `--r-control` | 6px | Buttons, inputs, chips |
| `--r-panel` | 10px | Panels and cards |
| `--r-modal` | 14px | Dialogs, popovers |
| `--r-full` | 999px | Avatars, rating pills, control dots |

Elevation is built from borders and background steps, not from shadow. Exactly two shadows exist in the system: `--shadow-pop` for popovers and menus, `--shadow-drag` for a gate held under the cursor. A gate being dragged is the only element in the product that casts a real shadow, which makes the drag read as physical.

### 5.4 Motion

| Token | Duration | Easing | Use |
|---|---|---|---|
| `--motion-instant` | 80ms | linear | Hover, focus |
| `--motion-quick` | 140ms | cubic-bezier(.2,0,0,1) | Gate snap, panel toggle, tooltip |
| `--motion-settle` | 240ms | cubic-bezier(.2,.8,.2,1) | Drawer, modal, result reveal |
| `--motion-evolve` | 420ms | cubic-bezier(.4,0,.2,1) | State transition between circuit steps |
| `--motion-celebrate` | 700ms | cubic-bezier(.34,1.4,.5,1) | Node pass. Used once per node, never twice |

Motion answers actions. There are no entrance animations on scroll, no hover transitions on cards, and no ambient background motion anywhere. `prefers-reduced-motion` collapses every token above 140ms to 0ms; the scrubber then jumps between discrete steps instead of tweening, which is still fully usable.

---

## 6. The gate glyph system

Gates are the product's alphabet. They need a system, not a set of icons.

| Class | Shape | Fill | Label |
|---|---|---|---|
| Single-qubit Pauli / Hadamard | Square, `--r-gate` | `--bg-raised` with `--line-strong` border | Letter in STIX Two Text, 15px |
| Phase gates (S, T, P) | Square with a hairline diagonal in the top-right corner | as above | Letter, with `†` superscript for adjoints |
| Rotation gates | Square with a small arc glyph beneath the label | as above | `RX` plus the parameter in `--type-micro` |
| Control point | Filled circle, 8px | `--line-strong` | none |
| Target (X-type) | Ring with crosshair, 16px | transparent | none |
| Target (Z-type / CZ) | Filled circle identical to control | `--line-strong` | none — symmetric, as the physics is |
| SWAP | Two × marks joined by the vertical | `--line-strong` | none |
| Measurement | Square containing a meter arc and needle | `--state-measured` tint | none |
| Barrier | Dashed vertical rule spanning selected wires | `--line-subtle` | none |

Rules that keep it readable:

- Gate width is fixed at 40px; the column pitch is 56px. A circuit is a grid, and a grid that stays a grid is scannable
- Multi-qubit gates draw one vertical connector at the column centre, always at full `--line-strong`, never dimmed
- Parameterised gates show the value below the glyph at `--type-micro`; when it is a clean fraction of π it renders as `π/4`, not `0.785`
- A gate the learner has not unlocked renders at 35% opacity with a lock glyph replacing its label
- The selected gate takes a 2px `--accent-gold` ring. This is the one place chrome uses the accent, because selection is not physics

---

## 7. Layout system

### 7.1 Breakpoints

| Name | Width | Behaviour |
|---|---|---|
| `sm` | <640 | Path, lesson reading and profile only. Workbench shows a "build on a wider screen" state with the circuit rendered read-only |
| `md` | 640–1023 | Path, lessons, challenges. Workbench in stacked single-column mode: circuit, then state, then code in tabs |
| `lg` | 1024–1439 | Full workbench, two lanes |
| `xl` | ≥1440 | Full workbench, three lanes, side-by-side state views |

### 7.2 The three-lane bench

The workbench is not a generic IDE split. It is laid out the way a circuit is read: **time runs left to right, and the state readout sits directly below the moment that produced it.**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  q  Quriosity      Path   Build   Challenges   Arena        ⚡7   1420   ◐  ● │
├────────────┬──────────────────────────────────────────┬──────────────────────┤
│  PALETTE   │  BUILD LANE                              │   CODE               │
│            │                                          │  ┌─ Qiskit ▾ ──────┐ │
│  H  X  Y   │  q0 ──[H]──●────────────[M]──            │  │ qc = Quantum... │ │
│  Z  S  T   │             │                            │  │ qc.h(0)         │ │
│  RX RY RZ  │  q1 ────────⊕───────────[M]──            │  │ qc.cx(0, 1)     │ │
│  ● CX CZ   │                                          │  │ qc.measure_all()│ │
│  ⨯  M  ‖   │  ┌──────────────────────────────────┐    │  │                 │ │
│            │  │ TIME  ├──┬──┬──┬──┬──┬──┬──●──┤  │    │  └─────────────────┘ │
│  ── locked │  └──────────────────────────────────┘    │  ┌─ TUTOR ─────────┐ │
│  CCX  CRZ  │                                          │  │                 │ │
│            │  STATE LANE            step 3 of 4       │  │ q0 is in super- │ │
│            │  ┌────────┐ ┌────────┐ ┌─────────────┐   │  │ position, but   │ │
│            │  │  q0    │ │  q1    │ │ ▆         ▆ │   │  │ q0 and q1 are   │ │
│            │  │   ●    │ │   ●    │ │ 00       11 │   │  │ still separable │ │
│            │  │ centre │ │ centre │ │ 51%     49% │   │  │ — add a CNOT... │ │
│            │  └────────┘ └────────┘ └─────────────┘   │  │                 │ │
│            │   Bloch      Bloch      Probabilities    │  │  [Show me]      │ │
├────────────┴──────────────────────────────────────────┴──────────────────────┤
│  Aer ▾   1024 shots   noise ○──────   12 gates          [ Run ⌘↵ ]  [ Save ] │
└──────────────────────────────────────────────────────────────────────────────┘
```

The vertical alignment between the time cursor and the state lane is the design's central idea. The Bloch spheres beneath the circuit are not "the result" — they are *the state at the cursor's column*. Drag the cursor left and they wind backwards.

### 7.3 Lane behaviour

| Lane | Resizable | Collapsible | Notes |
|---|---|---|---|
| Palette | No, fixed 176px | Yes, to a 48px icon rail | Hidden entirely in Workbench mode until invoked by keyboard |
| Build | Yes, grows | No | Horizontal scroll when the circuit is longer than the viewport; wire labels stay pinned left |
| State | Yes | Yes | View selector: Bloch, probabilities, state vector, density matrix |
| Code | Yes, 320–640px | Yes | Guided mode opens it at 40% width; Workbench mode at 55% |

Layout preferences persist per user per mode.

---

## 8. Screen specifications

### 8.1 Onboarding — mode selection

One screen, three cards, no progress bar. The question is asked once and answered in one click.

```
                          How do you want to work?
             You can change this any time in settings.

  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
  │   ┌───┐            │  │  qc.h(0)           │  │  ▸ Optimisation    │
  │ ──┤ H ├──          │  │  qc.cx(0,1)        │  │  ▸ Cryptography    │
  │   └───┘            │  │                    │  │  ▸ Simulation      │
  │                    │  │                    │  │                    │
  │  Guided            │  │  Workbench         │  │  Track             │
  │  Build circuits by │  │  Write code, see   │  │  Structured paths  │
  │  dragging. Code    │  │  it run across     │  │  for applying      │
  │  writes itself.    │  │  four SDKs.        │  │  quantum at work.  │
  │                    │  │                    │  │                    │
  │  New to quantum    │  │  Already write     │  │  Evaluating it for │
  │                    │  │  Qiskit or Cirq    │  │  a project         │
  └────────────────────┘  └────────────────────┘  └────────────────────┘
```

Each card previews its own primary surface, so the choice is made by recognition rather than by reading. Selection navigates immediately — no confirm step.

Optional next step for Guided: a three-question placement check ("Which of these is in superposition?") that skips U0 if answered correctly. Skippable, and skipping costs nothing.

### 8.2 Path — the circuit-shaped curriculum

The learning path renders as a circuit acting on the learner's own wire. Completed nodes are filled gate glyphs; the current node is the active gate; locked nodes are ghosted. Prerequisites are time-ordering, which is exactly what a circuit encodes — the metaphor is structural, not ornamental.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Your path                                     ⚡ 7-day streak    1,240 XP    │
│                                                                              │
│  Unit 1 · One qubit                                            6 of 6 ✓      │
│                                                                              │
│   you ──[✓]──[✓]──[✓]──[✓]──[✓]──[✓]──┐                                      │
│                                        │                                     │
│  Unit 2 · Phase                        │                       3 of 5        │
│                                        │                                     │
│       ────────────────────────[✓]──[✓]─┴─[✓]──[ ▶ ]──[ 🔒 ]                  │
│                                              Relative    Basis               │
│                                              phase       changes             │
│                                              3 min                           │
│                                                                              │
│  Unit 3 · Two qubits                                            🔒 locked    │
│       Finish "Basis changes" to unlock                                       │
│       ───[🔒]──[🔒]──[🔒]──[🔒]──[🔒]──[🔒]                                    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Warm-up · from Unit 1                                                 │  │
│  │  What does H·H do to |0⟩?          [ answer ]                          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

The retrieval-practice prompt sits inline on the path, not in a separate section — it is a warm-up on the way to the next node, and framing it that way is what stops it feeling like a test.

### 8.3 Lesson node

Six beats, one screen. The screen changes shape as the beats progress rather than navigating.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Unit 3 · Entanglement                                     node 4 of 6     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Build a state that is 50% |00⟩ and 50% |11⟩ — and never |01⟩ or |10⟩.       │
│                                                                              │
│  ┌────────────────────────┐        ┌────────────────────────┐                │
│  │  TARGET                │        │  YOURS                 │                │
│  │  ▆                  ▆  │        │  ▆     ▆     ▆     ▆   │                │
│  │  00   01   10   11     │        │  00   01   10   11     │                │
│  │  50%  0%   0%   50%    │        │  25%  25%  25%  25%    │                │
│  └────────────────────────┘        └────────────────────────┘                │
│                                                                              │
│   q0 ──[H]──                                        fidelity 0.71            │
│   q1 ──[H]──                                                                 │
│                                     [ palette ]     [ Run ⌘↵ ]               │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │  Both qubits are in superposition, but they are independent — every   │   │
│  │  outcome is equally likely. A Bell state needs the two qubits linked, │   │
│  │  not just each one spread out. Replace the H on q1 with a CNOT        │   │
│  │  controlled by q0.                              [ Show me on canvas ] │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Design decisions in this screen:**

- Target and attempt histograms sit side by side at identical scale. The comparison is visual before it is numerical
- Fidelity is shown as a number *and* as the visual gap. A learner at 0.71 can see what 0.71 means
- The tutor's panel appears only after a failed run, and it appears in place at the bottom rather than in a sidebar that has to be noticed
- "Show me on canvas" highlights the exact gate position rather than doing it for the learner
- The instruction beat has not appeared yet. It appears *after* the correction, framed as "why that worked"

### 8.4 Result and pass state

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│   fidelity 1.000                                     │
│   ┌────────────────────────────┐                     │
│   │  ▆                      ▆  │                     │
│   │  00   01   10   11         │                     │
│   └────────────────────────────┘                     │
│                                                      │
│   This is a Bell state. The two qubits no longer     │
│   have individual states — open the Bloch sphere     │
│   for q0 and you'll find it at the centre.           │
│                                                      │
│   [ Look at the Bloch sphere ]   [ Next node → ]     │
│                                                      │
│   Someone solved this with 2 gates. You used 2.      │
└──────────────────────────────────────────────────────┘
```

The pass screen teaches. It states what was built, names the surprising consequence, and offers the exploration. There is no confetti; there is a fact the learner did not have thirty seconds ago. The gate-count line is the golf hook, delivered without pressure.

### 8.5 Arena — match

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Blitz                                                              0:47     │
│  you  1420  ──────────────────────────────────────────  1455  aditya_k       │
│              6 gates · 3 runs                    4 gates · 5 runs            │
├──────────────────────────────────────────────────────────────────────────────┤
│  Reach this state:                                                           │
│      ▆         ▆                                                             │
│     000       111                                                            │
│     50%       50%                                                            │
│                                                                              │
│   q0 ──[H]──●──────                                                          │
│   q1 ────────⊕──●───                                                         │
│   q2 ───────────⊕───                                                         │
│                                                                              │
│  [ palette ]                                             [ Submit ⌘↵ ]       │
└──────────────────────────────────────────────────────────────────────────────┘
```

The opponent bar shows gate count and run count only — never their circuit. That is enough for tension and not enough to copy. The timer is the only element that moves; everything else stays still, because the player's attention belongs on their own wires.

### 8.6 Instructor cohort view

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  CS-402 Quantum Computing · 58 students                    week of 12 Mar    │
├──────────────────────────────────────────────────────────────────────────────┤
│  Where the class is stuck                                                    │
│                                                                              │
│  CNOT placed before the Hadamard                    22 students   38%  ████▌ │
│  Expects |+⟩ and |−⟩ to be interchangeable          14 students   24%  ███   │
│  Reads an entangled Bloch sphere as an error         9 students   16%  ██    │
│  Adds Z to |0⟩ and expects a change                  5 students    9%  █     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  38% of your class is building the Bell state with the CNOT first.     │  │
│  │  They are treating gate order as unimportant.       [ open examples ]  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Node completion                                                             │
│              U1·1  U1·2  U1·3  U2·1  U2·2  U3·1  U3·2                        │
│  passed       58    58    56    51    44    31    12                         │
│  attempting    0     0     2     5     9    18    24                         │
│  locked        0     0     0     2     5     9    22                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

The heatmap leads, the completion table follows. An instructor has ninety seconds before class; the first thing on the screen must be the thing that changes the lecture.

### 8.7 Empty, loading and error states

| State | Treatment |
|---|---|
| Empty canvas | Wire lines drawn, one hint at the first slot: "Drag a gate here, or press H." The wires are already there because the qubits already exist — an empty circuit is a valid circuit |
| Loading a run | The Run button becomes a determinate progress arc; the state lane dims to 40% and holds the previous result rather than clearing. Never show a spinner over a result the user is still reading |
| Queued behind other jobs | "Waiting for a worker · 3rd in queue." Give the position; a number is calmer than a spinner |
| Execution timeout | Inline in the state lane: "This circuit needed more than 15 seconds. Try fewer qubits or fewer shots." Circuit untouched |
| Backend unavailable | "Aer is unavailable. Cirq gives the same result for this circuit." Offer the alternative, do not just report the failure |
| Tutor unavailable | The rule-engine diagnosis still shows, with "Detailed explanation is unavailable right now." Never a blank tutor panel |
| No saved circuits | "Circuits you save appear here. Everything you build in the workbench can be saved and shared by link." |
| No cohort data yet | "No submissions yet. The heatmap fills in as students attempt nodes." |
| Offline | Persistent bar: "Offline — your circuit is saved locally and will run when you reconnect." |

---

## 9. Component inventory

| Group | Components |
|---|---|
| Circuit | `CircuitCanvas`, `QubitWire`, `GateGlyph`, `ControlPoint`, `TargetGlyph`, `GateConnector`, `MeasurementGlyph`, `BarrierGlyph`, `GatePalette`, `PaletteItem`, `ParameterPopover`, `TimeScrubber`, `ColumnCursor`, `SelectionMarquee`, `CircuitToolbar` |
| State views | `BlochSphere`, `BlochLegend`, `ProbabilityHistogram`, `StateVectorTable`, `AmplitudeCell`, `PhaseSwatch`, `DensityMatrixHeatmap`, `EntanglementIndicator`, `FidelityMeter`, `StateViewSwitcher`, `NoiseOverlaySeries` |
| Code | `CodeEditor` (Monaco wrapper), `SdkToggle`, `CodeDiffMarker`, `SyncNotice`, `ExportMenu`, `QasmImportDialog` |
| Learning | `PathCircuit`, `PathNode`, `UnitHeader`, `LessonShell`, `HookPanel`, `TargetComparison`, `InstructionCard`, `RetrievalPrompt`, `MasteryBadge`, `NodeResult`, `StreakChip`, `XpCounter` |
| Tutor | `TutorPanel`, `DiagnosisCard`, `GateReference` (inline chip naming a gate and wire), `TutorChat`, `SourceCitation`, `ConfidenceNotice`, `SuggestionAction` |
| Arena | `MatchHeader`, `OpponentBar`, `MatchTimer`, `RatingDelta`, `QueuePanel`, `LeaderboardTable`, `RankBadge`, `MatchResultCard` |
| Instructor | `MisconceptionHeatmap`, `CohortMatrix`, `AssignmentBuilder`, `SubmissionViewer`, `RosterImport` |
| Primitives | `Button` (primary/secondary/ghost/danger), `IconButton`, `Input`, `NumberInput`, `Select`, `Slider`, `Toggle`, `Tabs`, `Tooltip`, `Popover`, `Dialog`, `Toast`, `Banner`, `Card`, `EmptyState`, `Skeleton`, `ProgressArc`, `CommandPalette`, `KeyboardHint`, `ThemeSwitch` |

Every interactive primitive ships five states: default, hover, focus-visible, active, disabled. Focus-visible is a 2px `--accent-gold` outline at 2px offset, on every component, never removed.

---

## 10. Data visualisation specifications

### 10.1 Bloch sphere

- **Derived from the reduced density matrix**, never from raw amplitudes. Bloch vector components are the expectation values of X, Y and Z on the single-qubit reduced state
- A pure state renders as a point on the surface with a vector from the origin. A mixed state renders inside the sphere, with the vector length equal to the purity radius
- **An entangled qubit therefore renders at the centre**, and this is labelled: "no individual state — entangled with q1". Getting this right is the difference between a physics tool and a toy, and it is checked in tests
- Wireframe: three great circles at `--line-subtle`, X/Y/Z axes at `--line-strong`, pole labels |0⟩ and |1⟩ in STIX Two Text
- The vector is coloured by the state's phase from the phase wheel, so a learner sees phase in the Bloch view and the state-vector table in the same hue
- Orbit on drag; double-click resets to the canonical view. Camera position persists per session
- Maximum six spheres rendered simultaneously; beyond that, the view switches to the state-vector table with a notice

### 10.2 Probability histogram

- X axis: basis states as bitstrings, in a **stated endianness**, with the convention printed at the axis: "q2q1q0 · little-endian (Qiskit)". This is not a footnote; misconception M10 lives here
- Y axis: probability 0–1, fixed scale. Never auto-scale, because auto-scaling makes a 4% outcome look large and that is a lie
- Bars in `--text-secondary` by default. When a target is present, the target renders as an outlined ghost bar behind the actual, so the gap is the visual
- Values printed above bars when there are ≤16 outcomes; on hover beyond that
- Noise comparison draws the ideal result as an outline and the noisy result as fill, in the same axes — never in two separate charts

### 10.3 State vector table

The accessible primary, not a fallback.

| Column | Format |
|---|---|
| Basis state | `\|011⟩` in STIX Two Text |
| Amplitude | `0.7071 + 0.0000i` in JetBrains Mono, fixed 4dp |
| Magnitude | 4dp, with a proportional inline bar |
| Phase | value in radians as a π-fraction where clean, plus a swatch and an arrow at the phase angle |
| Probability | percentage |

Rows with magnitude below 1e-9 are collapsed into "and 12 zero amplitudes", expandable. Sorting by probability descending is the default in lesson contexts; by basis state ascending in the workbench.

### 10.4 Time scrubber

The product's signature interaction. A horizontal control aligned column-for-column with the circuit above it. Dragging moves a cursor through circuit columns; every state view recomputes to that position. Stepping is discrete (columns), but the transition tweens over `--motion-evolve` so the Bloch vector visibly rotates rather than jumping — the rotation *is* the gate, which is the single most useful thing an animation can teach here.

Keyboard: `←`/`→` step, `Home`/`End` jump, `Space` plays through at 1 column per 400ms.

---

## 11. Interaction specifications

### 11.1 Drag and drop

| Phase | Behaviour |
|---|---|
| Pick up | Gate lifts with `--shadow-drag`, scales to 1.04, cursor is `grabbing`. The palette slot leaves a ghost outline |
| Drag over the canvas | The nearest valid slot shows a dashed insertion outline. Snap radius is 28px — generous, because precision is not the skill being taught |
| Invalid target | No insertion outline; the cursor takes `not-allowed`. No red flash, no shake. Silence is a sufficient signal |
| Two-qubit gate | Dropping a CNOT places the control and enters target-selection: valid wires highlight, a connector follows the cursor, `Esc` cancels the whole placement |
| Drop | Gate snaps over `--motion-quick`, the code panel updates within the same frame budget |
| Reposition | Dragging an existing gate moves it; dragging it off the canvas deletes it with an undo toast |
| Occupied slot | The circuit inserts a new column rather than rejecting the drop. Never make the learner make room by hand |

### 11.2 Keyboard grammar

| Key | Action |
|---|---|
| `←` `→` `↑` `↓` | Move the placement cursor across columns and wires |
| `H` `X` `Y` `Z` `S` `T` `M` | Place that gate at the cursor |
| `C` | Begin a controlled gate: control at the cursor, then `↑`/`↓` to the target, `Enter` to confirm |
| `R` then `X`/`Y`/`Z` | Rotation gate; opens the parameter field focused |
| `Delete` / `Backspace` | Remove the gate at the cursor |
| `⌘Z` / `⌘⇧Z` | Undo / redo |
| `⌘↵` | Run |
| `⌘S` | Save |
| `⌘K` | Command palette |
| `⌘/` | Toggle the tutor |
| `[` `]` | Collapse or expand side lanes |
| `1`–`4` | Switch the state view |
| `?` | Keyboard reference |

The keyboard path is a full alternative to the mouse, not a shortcut layer over it. A learner using only a keyboard can complete every node.

### 11.3 Tutor invocation

| Mode | Trigger |
|---|---|
| Guided | Automatically after a failed run, in place beneath the circuit. Never mid-build, never on a passing run |
| Workbench | `⌘/` or the tutor button only. No proactive output of any kind. If this is ever violated, it is a P1 defect |
| Track | After a failed assessment attempt and at the end of each module |

The tutor never blocks the interface. It is a panel, never a modal, and the learner can keep editing while it is open.

---

## 12. Accessibility specification

| # | Requirement | Implementation |
|---|---|---|
| A1 | Full keyboard circuit building | §11.2 grammar; focus order follows visual order; the canvas is a single composite widget with `role="application"` and documented keys |
| A2 | Colour never sole carrier | Phase carries hue **and** an arrow angle **and** a numeric value. Probability carries height **and** a printed percentage. Correct/incorrect carries colour **and** a glyph **and** a word |
| A3 | Contrast | Text ≥4.5:1; wires, gate borders and axis lines ≥3:1 against their surface. Verified per theme in CI |
| A4 | Colour-vision safety | The phase wheel is checked under deuteranope, protanope and tritanope simulation. Because phase is cyclic, adjacent-hue confusion degrades gracefully — and the arrow glyph carries the value regardless |
| A5 | Screen reader for the circuit | Each gate announces "Hadamard on qubit 0, column 1". The circuit exposes a text summary: "3 qubits, 4 gates, 2 measurements" |
| A6 | Screen reader for results | Live region on run completion: "Run complete. Two outcomes: 0 0 at 51 percent, 1 1 at 49 percent. Fidelity 1.000, passed" |
| A7 | Bloch alternative | The state-vector table is a peer view reachable in one keystroke, not a degraded fallback |
| A8 | Reduced motion | Tokens above 140ms collapse to 0; scrub steps jump; the pass sequence becomes a static state change |
| A9 | Targets | Interactive targets ≥24px; gate drop targets ≥44px |
| A10 | Zoom | Usable to 200% without horizontal scrolling on the path and lesson surfaces |
| A11 | Timers | Arena match timers are the one timed surface; the mode is optional and clearly labelled, and no learning content is ever timed |

---

## 13. Responsive behaviour

| Surface | sm | md | lg / xl |
|---|---|---|---|
| Path | Full, vertically stacked units | Full | Full |
| Lesson | Target above, circuit below, palette as a bottom sheet | Two column | Two column with the state lane |
| Workbench | Read-only circuit and a "build on a wider screen" notice | Tabbed: Circuit / State / Code | Three lanes |
| Arena | Not available; shows rating and history | Available in reduced layout | Full |
| Instructor | Heatmap only | Heatmap plus a scrollable matrix | Full |

Building a circuit on a 375px screen is a bad experience that no layout fixes; saying so honestly is better than shipping a cramped canvas.

---

## 14. Microcopy library

| Context | String |
|---|---|
| Empty canvas | Drag a gate here, or press H. |
| Run button | Run · ⌘↵ |
| Running | Running on Aer… |
| Queued | Waiting for a worker · 3rd in queue |
| Passed | Fidelity 1.000. This is a Bell state. |
| Failed, close | Fidelity 0.87. The 01 and 10 outcomes should be zero. |
| Failed, far | Fidelity 0.25. Every outcome is equally likely — the qubits aren't linked yet. |
| Alternative solution accepted | Different circuit, same state. Both are correct. |
| Global phase difference | Your state differs by a global phase, which is physically undetectable. It passes. |
| Locked node | Finish "Basis changes" to unlock this. |
| Locked gate | Toffoli unlocks in Unit 4. |
| Qubit cap | Guided mode simulates up to 12 qubits. Workbench mode goes to 20. |
| Timeout | This circuit needed more than 15 seconds. Try fewer qubits or fewer shots. |
| Unsupported construct | `custom_gate` isn't in the supported gate set. See the gate reference. |
| Unsynced code | You've edited the code since the last run. [Apply to canvas] [Discard] |
| Tutor low confidence | I'm not confident enough to answer that. Here's the gate reference for CRZ. |
| Leaderboard locked | Rankings open after Unit 3. Build a Bell state first. |
| Match won | You won. 1420 → 1436. |
| Match lost | aditya_k got there in 4 gates. 1420 → 1404. |
| Disconnect | Reconnecting… the match is paused for 30 seconds. |
| Instructor empty | No submissions yet. The heatmap fills in as students attempt nodes. |
| Offline | Offline — your circuit is saved locally and will run when you reconnect. |

Every string above is sentence case, active voice, and says what happened or what to do. None apologise.

---

## 15. Design QA checklist

Run before any demo or submission.

**Correctness**
- [ ] An entangled qubit's Bloch sphere renders at the centre, labelled
- [ ] Histogram endianness is printed on the axis and matches the backend in use
- [ ] π-fraction parameters render as `π/4`, not `0.7853981`
- [ ] Global-phase-different solutions pass and are explained, not failed
- [ ] Fidelity is displayed to 3dp everywhere it appears

**System integrity**
- [ ] No saturated colour appears anywhere it is not carrying a physical quantity, except the three permitted accent uses
- [ ] Radius follows the hierarchy; no component uses an undeclared radius
- [ ] Only two shadows exist in the built CSS
- [ ] Every interactive element has a visible focus ring
- [ ] Both themes pass contrast in CI

**Behaviour**
- [ ] Workbench mode produces zero proactive tutor output, zero XP, zero streak, zero leaderboard
- [ ] `prefers-reduced-motion` produces no animation above 140ms anywhere
- [ ] A full node can be completed with the keyboard alone
- [ ] Every empty state names an action
- [ ] Every error names a cause and a fix
- [ ] The scrubber updates all state views within one frame of a step

**Demo readiness**
- [ ] The Bell-state failure path produces the gate-and-wire diagnosis with the LLM disabled
- [ ] SDK toggle switches Qiskit → Cirq → PennyLane without a server call
- [ ] Two browser windows, one match, one consistent winner
