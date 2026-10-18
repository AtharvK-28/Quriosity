# Video Production Guide

**Quriosity · SIH 26140 · Quantum Latte**

Fourteen videos covering nineteen curriculum nodes, generated with NotebookLM
Video Overviews. This document is the complete brief pack: for each video, a
source brief to paste into NotebookLM as a source, and a steering prompt to
paste into the customise box.

Read §1 and §2 before generating anything. They are short and they are the
difference between fourteen usable videos and fourteen that teach the
misconceptions this platform exists to remove.

---

## 1. Where the video sits in a lesson

**Not first.** `lib/curriculum/nodes.ts` opens with an authoring rule that the
whole product is built on:

> INSTRUCTION COMES AFTER THE ATTEMPT. Productive failure (Kapur) only works if
> the struggle happens first, so `instruction` is never shown before a learner
> has tried.

A video that explains the concept before the learner builds is instruction
before the attempt. It would quietly delete the one thing that makes this
platform different from a YouTube playlist, and a judge who reads the README
and then watches the lesson flow will notice the contradiction.

So the placement is:

| Beat | Screen | Video? |
|---|---|---|
| 1 — hook | brief | No. The hook is one sentence and it must stay one sentence. |
| 2 — attempt | build | No. |
| 3 — diagnosis | build | No. The tutor's finding is the diagnosis. |
| 4 — instruction | pass | **Yes — collapsed, opt-in.** "Watch the 3-minute explanation." |
| 5 — completion | pass | — |
| 6 — build/retrieval | pass / path | Existing `retrieval` prompt. |

The video is the **expanded form of the `instruction` beat**. The learner has
already tried, already been diagnosed, already passed. Now they can go deeper if
they want to. That placement keeps productive failure intact and still gives you
the full video-course surface.

One exception worth honouring: **`u1.n6` and `u2.n5` get no video.** Their hooks
are "No hints on this one" and "Everything from Unit 2, no scaffolding." They
are deliberately unscaffolded consolidation nodes. Attaching an explainer to
them contradicts the node's own design.

### The quiz, the notes, the flashcards

- **Quiz** — you already have one. Every node carries a `retrieval` prompt
  (question, options, answerIndex, `because`). Do not build a second quiz
  system. Extend `RetrievalPrompt` to allow 2–3 questions per node and the
  "optional short quiz after the video" is done.
- **Flashcards** — must feed the *existing* spaced-repetition scheduler in
  `/review` (retention decay + SM-2), not a parallel one. Two competing
  schedulers is the classic way this feature rots.
- **Notes** — derive from the source brief in this document, never authored
  separately. Separately-authored notes drift from the video within one revision.
- **Transcript** — extract from the finished MP4 (Whisper or auto-captions).
  Do **not** assume the brief below is the transcript; NotebookLM paraphrases.
  The brief constrains *content*; the narration wording will differ.

---

## 2. Is NotebookLM the right tool?

**For this project: good enough for v1, with one real risk.**

What it's good at: it is grounded in the sources you give it, so a tight brief
produces a tight video. It is fast, it parallelises across your six Pro
accounts, and the output is a narrated slide deck — which is the correct format
for conceptual framing.

**The risk, and it is specific to you:** NotebookLM invents its own visuals.
Generic AI-generated quantum imagery gets things wrong in exactly the ways your
misconception list is built to fight. The three failures to watch for:

1. **Drawing a Bloch sphere for an entangled qubit.** This is misconception
   **M4**, which `u3.n4` exists to destroy. If a video shows an arrow on a
   sphere for one half of a Bell pair, that video teaches the opposite of your
   curriculum.
2. **Drawing CNOT as a bare "X".** Your README calls this out as a bug fixed
   once in `GateMark.tsx`; a video can reintroduce it. CNOT is a filled control
   dot joined to a ⊕ on the target.
3. **Flipping bit order.** M10 is "bitstring order is obvious." Your app is
   little-endian (`|q₁q₀⟩`) and prints the convention on every axis. A video
   using the opposite convention silently contradicts every histogram.

**Therefore: every video is watched end-to-end against this list before it
ships.** Budget ten minutes per video for that. It is not optional.

**The better-than-NotebookLM option, if you have time:** screen-record your own
workbench for the physics moments — the Bloch vector actually moving under
RY(θ), the histogram actually changing, the vector actually collapsing to the
centre — and use NotebookLM only for conceptual framing. Your app is the most
accurate visualiser you have access to. A hybrid cut is stronger than either
half and it also demos the product inside the teaching material.

**Practical notes**
- Video length tracks source length. A ~400-word brief lands near 3 minutes.
  Keep the briefs as written; do not pad them.
- Pick **one visual style and one format** and have all six members use the
  same. Fourteen videos in six styles reads as scraped, not authored.
- Generation is non-deterministic. If a take is wrong, regenerate rather than
  trying to fix it with prompt surgery.
- Outputs carry Google's invisible provenance watermarking. Fine for a
  hackathon; worth disclosing in your submission if asked about AI-generated
  assets.

### Delivery convention

Name files by node id so they wire up without a mapping table:

```
apps/web/public/video/u0.n3.mp4
apps/web/public/video/u0.n3.vtt      # transcript, extracted after
```

For shared videos (V04, V06, V11), name by the **first** node id and I'll alias
the second in the media manifest.

Fourteen MP4s is roughly 150 MB. The README promises a demo that works with the
network down, so they should be local — but `.gitignore` the directory and add a
one-line fetch script, or use git-lfs. Do not commit 150 MB to the repo.

---

## 3. House style block

**Paste this first, every time, before the per-video prompt.** Keep it in a
scratch file; all six members use the identical text.

```
You are producing one episode in a 14-part series for Quriosity, an interactive
quantum computing course for undergraduate engineering students with no physics
background. Every episode must look and sound like the same series.

AUDIENCE AND MOMENT
The viewer has just built this circuit themselves in a browser workbench, run
it, and seen the result. They are not new to the exercise — they are here for
the explanation of what they just did. Never explain the task. Explain the
mechanism.

TONE
Precise, calm, declarative. No hype, no sales, no "imagine a world where". No
"in this video we will" and no outro. Start on the first real sentence and stop
on the last one. Assume intelligence; do not flatter.

BANNED — never say or show any of these, they are the exact misconceptions this
course removes:
- "tries every possibility at once" / "computes all answers in parallel"
- "0 and 1 at the same time" as a standalone explanation
- "spooky action at a distance", unless immediately labelled as a phrase
  physicists regret
- any suggestion that measuring one entangled qubit sends anything to the other
- "faster than light", "parallel universes", "quantum leap"
- any claim that quantum computers will replace classical computers

NOTATION — hold these exactly
- Dirac notation throughout: |0>, |1>, |+>, |->
- Probability is the SQUARE of the amplitude magnitude. Never conflate them.
- Bitstrings are little-endian, written |q1 q0>. So |10> means q1=1 and q0=0.
  Put the convention on screen the first time a two-qubit bitstring appears.
- A controlled gate is drawn as a filled dot on the control wire joined by a
  vertical line to the target symbol. CNOT's target is a circled plus. Never
  draw CNOT as a bare letter X.
- A Bloch sphere is only ever drawn for a SINGLE, UNENTANGLED qubit. If the
  episode involves entanglement, do not draw a Bloch arrow for an individual
  qubit unless the point being made is that it collapses to the centre.

FORMAT
Narrated slides. Diagrams over stock imagery. No decorative motion. Every visual
on screen must be a quantity or a circuit — if a slide is illustrative rather
than informative, cut it.

STRUCTURE — do not invent sections
Use exactly the visual beats listed in the episode prompt, in that order, and no
others. Do not add numbered chapter cards. Do not add a section that the prompt
did not ask for. Do not add a summary, a recap, or a "why this matters" segment.

THE ENDING — this is the most-violated rule, read it twice
The episode ends on the exact sentence the prompt specifies. That sentence is
the LAST thing spoken. After it: silence. Specifically banned after the closing
sentence, in narration or on screen:
- a rhetorical question to the viewer ("so what else might be hiding?", "what
  other assumptions should we question?")
- a recap, a "let's wrap up what we've uncovered", a bulleted summary
- a teaser for the next episode
- any sentence broadening the topic beyond quantum computing
Do not narrate section titles aloud. Do not open with "Welcome to this
explainer" or "let's dive right in" — begin on the first sentence of the brief.

NO FILLER SLIDES
Every slide must carry a label, a number, a formula or a circuit. The following
are banned outright, in any episode, because they carry no information:
- lightning bolts, glowing energy, sparks, explosions
- padlocks, keys, locks opening, doors, portals, barriers being passed through
- abstract spheres turning into cubes, or any shape-to-shape morph
- towers, stacks or piles of symbols
- generic dashboards, bar charts with unlabelled axes, scribbled grids
- atoms, orbitals or "quantum" iconography used as decoration
If you have narration to cover and no informative visual for it, hold the
previous informative slide. Do not invent imagery to fill time.

CIRCUIT DIAGRAMS — no gate that is not in the brief
Every circuit drawn must use only the gates named in the source brief, on the
number of wires the brief specifies. Never draw a control dot, a vertical
connector or a circled plus in a single-qubit episode. Never draw a circuit
whose input and output labels contradict the sentence above it. A decorative
"looks like a circuit" diagram is worse than no diagram.

LENGTH
Match the runtime target in the episode prompt. The source brief is already
written at the correct length for it — narrate it at a normal pace and stop.
Do not pad, repeat, or restate.

GROUNDING
Base the episode only on the provided source brief. Do not introduce examples,
analogies, numbers or history that are not in it. If the brief does not say it,
it does not go in.
```

---

## 4. The fourteen briefs

Each entry has **SOURCE** (paste into NotebookLM as a copied-text source) and
**PROMPT** (paste after the house style block).

---

### V01 — An honest coin
**Node:** `u0.n1` · **Runtime:** 2:30 · **Guards:** sets the trap for M1

**SOURCE**
```
A fair coin is unpredictable and completely lawful at the same time. You will
never call a single flip correctly on purpose. But flip it a thousand times and
the ratio holds at half and half. Unpredictable is not the same as lawless.

A qubit starts in a definite state, written |0>. Definite means that if you read
it, you get zero, every time, with no scatter at all. The Hadamard gate, written
H, takes that certainty and turns it into an even lean between |0> and |1>.

Lean is the word to hold on to. After H, the qubit is not zero and it is not
one. It is described by two amplitudes, one for each outcome, and both of them
are equal.

You cannot read a lean directly. A measurement returns a single bit: zero or
one, never "half". So to see the lean at all, you have to run the whole circuit
many times and count. This platform runs 1024 shots by default, and the
histogram it draws is the count of each outcome across those runs.

That histogram is the instrument. Two bars, both near 512. Not exactly 512 —
that would be the suspicious result, because genuine sampling always scatters.
Near half, with the scatter you would expect from a thousand honest flips.

Run the same circuit again and the bars move slightly. The ratio does not. The
ratio is the property of the state; the exact counts are the property of this
particular set of runs.

So far, everything here also describes a coin. The state is unpredictable per
reading, lawful in aggregate, and readable only by repetition. If you stopped
here you would conclude that a qubit is a coin that the computer flips for you.

That conclusion is wrong, and the reason it is wrong is not a detail. It is the
entire reason quantum computers are worth building. But nothing you have seen so
far rules it out. Hold the coin picture for now. It survives exactly two more
gates.
```

**PROMPT**
```
Episode 1 of 14. Title: An honest coin.

Focus: the difference between unpredictable and lawless, and how a histogram
over 1024 shots is the only way to read a state that is not definite.

Visual beats, in order:
1. A single |0> state, labelled "definite".
2. An H gate on one wire, output labelled "an even lean".
3. A two-bar histogram, both bars near 512 out of 1024, with the bars slightly
   unequal. Label the axis "shots".
4. The same histogram regenerated, bars at slightly different heights, ratio
   unchanged.

CRITICAL: This episode must NOT yet claim that a qubit is different from a coin.
It deliberately leaves the coin analogy standing so that episode 3 can break it.
Do not foreshadow interference beyond the closing lines.

Do not show a Bloch sphere. Do not show any gate other than H.

End on: "Hold the coin picture for now. It survives exactly two more gates."
```

---

### V02 — A lean, not an answer
**Node:** `u0.n2` · **Runtime:** 3:00 · **Guards:** amplitude/probability conflation

**SOURCE**
```
H gives you an even lean. But an even lean is one setting of a dial that goes
anywhere, and the gate that turns the dial is RY.

RY takes an angle. RY of theta rotates the qubit away from |0> and towards |1>,
and the probability of reading one comes out as sine squared of theta over two.
At theta equals zero you get |0> with certainty. At theta equals pi you get |1>
with certainty. Everything between is a lean you chose.

Here is the step almost everyone skips exactly once.

The state is not stored as probabilities. It is stored as amplitudes, and the
probability is the amplitude squared. For an even lean, the two amplitudes are
not 0.5 and 0.5. They are 0.707 and 0.707 — one over root two — and squaring
each gives 0.5.

This matters because the squaring is not bookkeeping. Amplitudes are the thing
the gates actually operate on, and amplitudes can be negative, or complex, where
probabilities never can. Probabilities can only pile up. Amplitudes can cancel.
Every quantum algorithm that beats a classical one lives in that gap, and none
of it is visible if you think the state holds probabilities.

So: to make one come up eighty-five percent of the time, you do not set a
probability. You choose an angle whose sine squared of half of it is 0.85 — and
the amplitude that angle produces is about 0.92, because 0.92 squared is 0.85.

Read those two numbers again. The amplitude is 0.92 and the probability is 0.85.
They are close enough to look like the same number and far enough apart to break
a circuit. An amplitude of 0.6 does not mean sixty percent. It means thirty-six.

The histogram only ever shows you the squared version. The amplitude table on
this platform shows you the real one. When they disagree, the amplitude table is
what the gates see.

You set a probability by choosing an angle. Every quantum algorithm is that move
repeated: arrange the amplitudes so the answer you want is the one that survives
squaring.
```

**PROMPT**
```
Episode 2 of 14. Title: A lean, not an answer.

Focus: probability is the square of the amplitude, and the two are different
numbers that look similar enough to be confused.

Visual beats, in order:
1. RY(theta) on a wire, with theta shown as a dial.
2. The formula P(|1>) = sin squared (theta / 2), written once, plainly.
3. A side-by-side table: amplitude column 0.707 / 0.707, probability column
   0.5 / 0.5. Make the squaring arrow between them explicit.
4. The 85% case: amplitude approximately 0.92, probability 0.85, shown in the
   same table format so the near-miss between the numbers is visible.
5. A one-line contrast card: "Probabilities pile up. Amplitudes can cancel."

Do not explain what cancellation means yet — that is episode 3. State it and
move on.

Do not show a Bloch sphere. Do not use a coin analogy in this episode.

End on: "Arrange the amplitudes so the answer you want is the one that survives
squaring."
```

---

### V03 — Where the coin analogy dies
**Node:** `u0.n3` · **Runtime:** 3:30 · **Guards:** M1

**SOURCE**
```
Flip a coin, then flip it again. It is still random. Nothing about the second
flip undoes the first.

Do the quantum equivalent — H, then H again, on a qubit that started at |0> —
and the randomness does not survive. You get |0> back, with certainty. A
thousand shots, a single bar, no scatter.

That result is impossible for a coin, and it is worth being precise about why.

Suppose the first H did what a coin flip does: it secretly picked zero or one
and hid the answer. Follow both cases. If it picked zero, the second H puts it
back on the fence: fifty-fifty. If it picked one, the second H also puts it on
the fence: fifty-fifty. Either way you end at fifty-fifty. A hidden value cannot
produce a certainty here, no matter which value was hidden.

But the machine produces a certainty. So there was no hidden value.

What actually happens is this. After the first H there are two amplitudes, both
positive. The second H sends each of them onto both outputs. Trace the paths to
|1>: one route arrives with a positive amplitude, the other arrives with a
negative one, and they are equal in size. They sum to zero. The outcome does not
become unlikely — it becomes unavailable.

Meanwhile both routes to |0> arrive with the same sign, so they reinforce, and
|0> takes the whole probability.

That is interference. Not a metaphor for it — the arithmetic of it, in two
gates. It requires amplitudes that can be negative, which is exactly what
probabilities cannot be, which is exactly why the coin model fails.

One thing to be careful about: H is its own inverse, so you could say "of course
you got |0> back, the second H undid the first." That is true and it is the
wrong explanation. It describes the arithmetic without naming the mechanism, and
it would predict the same result for a coin, which is false.

A hidden value cannot do this. That cancellation is the entire reason a quantum
computer is worth building, and you have now seen it in two gates.
```

**PROMPT**
```
Episode 3 of 14. Title: Where the coin analogy dies.

Focus: H followed by H returns |0> with certainty, and the hidden-value model
provably cannot produce that. This is the episode that kills misconception M1,
"a qubit is a coin that is secretly heads or tails."

Visual beats, in order:
1. Two coin flips, still random. Then H-H on a wire, output a SINGLE histogram
   bar at |0>, full height. The contrast between these two is the whole episode.
2. The refutation as a branching diagram: "suppose it secretly picked 0" leads
   to 50/50; "suppose it secretly picked 1" leads to 50/50. Both branches end at
   50/50. Mark the machine's actual result — certainty — as reachable by
   neither.
3. A path diagram: two routes arriving at |1>, one with a plus sign and one with
   a minus sign, summing to zero. Two routes arriving at |0>, both the same
   sign, reinforcing.
4. A card: "Unlikely is not the same as unavailable."

The refutation-by-cases in beat 2 is the most important thing in this episode.
Give it the most screen time. Do not rush it.

Do not say "H is its own inverse" as the explanation — the brief explicitly
rejects that framing. Mention it only as the trap it is.

End on: "A hidden value cannot do this."
```

---

### V04 — X, H, and two right answers
**Nodes:** `u1.n1`, `u1.n2` · **Runtime:** 2:30

**SOURCE**
```
X is the simplest gate there is. On a definite state it does exactly what NOT
does to a bit: |0> becomes |1>, |1> becomes |0>. One gate, one certainty. Worth
noticing, because it is easy to assume otherwise: not every quantum gate
produces uncertainty.

But "quantum NOT" is a nickname, not a definition. What X actually does is
exchange the two amplitudes. On a definite state, exchanging them looks like
flipping a bit. On a lean, it is a different operation wearing the same name —
and when the two amplitudes are equal, as they are after H, exchanging them
changes nothing at all. X applied to an even lean leaves the even lean exactly
where it was.

Now a second point, about what it means for an answer to be correct.

There is more than one way to reach |1> from |0>. A single X does it. So does H,
then Z, then H — three gates arriving at the same place. Those two circuits
share no structure. They are still the same operation.

This platform grades by comparing the state you produced against the state the
task asked for. It never compares your gate list to a reference gate list. Both
of those circuits pass, and that is not leniency — it is a fact about physics.
Two circuits that produce the same state are the same operation, written
differently.

The alternative is worth naming, because a lot of tools do it. If a platform
checks your gates against an expected sequence, it teaches ritual. It rejects
correct answers for being unfamiliar, and it trains the learner to guess what
the author had in mind instead of reasoning about the state. That is a worse
thing to learn than any single gate.

The grader also ignores global phase, for the same reason: a state and that
state multiplied by minus one are indistinguishable by any measurement in any
basis. Two answers that no experiment could tell apart are not two answers.

So: X exchanges amplitudes. Several routes reach the same state. The state is
what is graded, because the state is what is real.
```

**PROMPT**
```
Episode 4 of 14. Covers two lesson nodes. Title: X, H, and two right answers.

Focus: X exchanges amplitudes rather than "flipping a bit", and correctness is
judged on the state produced, never on the gate sequence.

Visual beats, in order:
1. X on |0> giving |1>, single certain bar. Label: "not every gate produces
   uncertainty."
2. X acting on an even lean: the two equal amplitudes swap places and the state
   is visibly unchanged. Show the amplitudes as labelled boxes exchanging.
3. Two circuits side by side: a single X, and H-Z-H. An arrow from each to the
   SAME resulting state. Both marked correct.
4. A short contrast card: grading on state versus grading on gate list, with
   "gate-list grading teaches ritual" as the caption.

Do not imply H-Z-H is the "proper" answer and X the shortcut, or vice versa.
The symmetry is the point.

Mention global phase in one line only. Episode 7 is the full treatment.

End on: "The state is what is graded, because the state is what is real."
```

---

### V05 — Measuring is deciding
**Node:** `u1.n3` · **Runtime:** 3:00 · **Guards:** M7

**SOURCE**
```
Here is a two-circuit experiment, and the only difference between them is one
measurement in the middle.

Circuit one: H, then H. You know this one. The paths to |1> cancel and you get
|0> with certainty.

Circuit two: H, measure, then H, then measure. Identical gates. One extra read
in the middle. The final result is fifty-fifty.

The middle measurement cost you the certainty. That is the whole lesson, and the
question is what exactly it took.

The intuitive story is that measuring is peeking — that the value was already
there and you looked at it, and looking is harmless. That story predicts the
certainty survives, because reading a value that already exists should not
change it. The experiment says otherwise. So measuring is not peeking.

What a measurement does is decide. Before it, the qubit has two amplitudes and
no value. After it, the qubit has a value and one amplitude — the state has
collapsed onto whichever outcome came up. The lean that the second H needed in
order to interfere is gone, because there is no longer anything for it to
interfere with. The second H now acts on a definite state and produces a fresh
even lean, which reads fifty-fifty.

You did not discover a value. You created one, and you destroyed the structure
that made the circuit work.

The same logic applies to reading the same qubit twice. Measure a leaning qubit
and get one; measure it again and you get one, with certainty. The second
reading tells you nothing new, because the first reading already made the
decision. There is no lean left to collapse.

This is why the practical rule in circuit design is what it is: anything that
has to survive to the end of the circuit stays unmeasured until then. A
measurement is not an observation you can slip in for free. It is an operation,
it is irreversible, and it removes the only thing a quantum computer has that a
classical one does not.

Observing and reading are different verbs here, and only one of them is
available.
```

**PROMPT**
```
Episode 5 of 14. Title: Measuring is deciding.

Focus: a mid-circuit measurement destroys interference. This episode kills
misconception M7, "measurement is just reading the value."

Visual beats, in order:
1. Two circuits stacked vertically. Top: H-H, result one full bar at |0>.
   Bottom: H-measure-H-measure, result two bars at 50/50. Highlight the single
   added measurement as the only difference.
2. The "peeking" hypothesis stated on a card, then marked as refuted by the
   experiment above it. Be explicit that it is the experiment doing the
   refuting.
3. A collapse diagram: two amplitudes before the measurement, one amplitude and
   a committed value after it.
4. Measure-twice: first read gives 1, second read gives 1 with certainty, no
   scatter.

Do not use the word "observer" or anything that suggests consciousness plays a
role. Measurement here is an operation, not a witness.

Do not mention entanglement.

End on: "A measurement is an operation, it is irreversible, and it removes the
only thing a quantum computer has that a classical one does not."
```

---

### V06 — The sphere, and any odds you like
**Nodes:** `u1.n4`, `u1.n5` · **Runtime:** 3:30 · **Guards:** seeds M4

**SOURCE**
```
Every state one qubit can have on its own is a point on the surface of a sphere.
That is not an analogy — it is a complete description, and it is worth knowing
how to read it.

The north pole is |0>. The south pole is |1>. Height on the sphere is the odds:
at the poles you have certainties, at the equator you have an even lean, and
every latitude between is a lean you can choose. The state called |+>, which is
what H produces from |0>, sits on the equator pointing along positive X.

Position around the equator — the longitude — is phase. Phase does not change
the odds at all. Every point on the equator reads fifty-fifty when you measure
it in this basis. That is why phase is invisible here, and why the next unit
exists.

Two properties, two directions. Latitude is what you can measure. Longitude is
what you cannot, yet.

RY is the gate that moves you in latitude. RY of theta tilts the state away from
the north pole by theta, and the probability of reading one is sine squared of
theta over two. To land a quarter of the time on |1>, you need sine squared of
theta over two to equal 0.25, so theta over two is thirty degrees, so theta is
pi over three. The parameter field on this platform accepts pi-expressions, so
you can write what you mean instead of rounding it.

One more property, and it will matter more than it looks like it should. The
length of the arrow from the centre to the state is purity. For every state one
qubit can have by itself, that length is exactly one — the arrow reaches the
surface. A shorter arrow means the qubit is in a mixed state, and an arrow of
length zero, sitting at the dead centre, means something stranger still.

Nothing you can build with one qubit produces a short arrow. Hold on to that.
You can now reach any point on the front half of the sphere: the back half needs
phase, which is the next unit. And in unit three you will build a qubit whose
arrow has no length at all.
```

**PROMPT**
```
Episode 6 of 14. Covers two lesson nodes. Title: The sphere, and any odds you
like.

Focus: how to read a Bloch sphere — latitude is odds, longitude is phase,
arrow length is purity — and RY as the latitude control.

Visual beats, in order:
1. A clean Bloch sphere. |0> at the north pole, |1> at the south, |+> on the
   equator at +X. Label the axes.
2. Latitude highlighted as a horizontal band with "odds" as its label. Equator
   marked 50/50, poles marked as certainties.
3. Longitude highlighted as a ring with "phase — no effect on the odds" as its
   label.
4. RY(theta) tilting the arrow, with P(|1>) = sin squared (theta/2) beside it,
   and the worked case theta = pi/3 giving 25%.
5. Arrow length labelled "purity", at full length, touching the surface. One
   short shot of a shorter arrow, unexplained, marked "not yet".

This episode may and should show a Bloch sphere — it is a single unentangled
qubit throughout. Do NOT show two qubits or any entangled state here.

Beat 5 is a deliberate setup for episode 13. Do not explain it.

End on: "In unit three you will build a qubit whose arrow has no length at all."
```

---

### V07 — The gate that does nothing
**Node:** `u2.n1` · **Runtime:** 2:30 · **Guards:** M5

**SOURCE**
```
Put a Z gate on a qubit in state |0> and run it. Nothing happens. The histogram
is identical, the state is identical, the grader passes you. This is not a bug
and it is not a wasted gate. It is the cleanest demonstration of something that
confuses people for years.

Z multiplies the amplitude of |1> by minus one, and leaves |0> alone. So on a
qubit that is entirely |0>, there is no |1> amplitude to act on, and nothing
changes. Straightforward.

The interesting case is a qubit that is entirely |1>. Z turns that state into
minus |1>. The amplitude really did change sign. And no measurement, in any
basis, can detect that it did.

The reason is that probability is the squared magnitude of the amplitude, and
squaring destroys the sign. Minus one squared is one. If you multiply the entire
state by minus one — or by any complex number of magnitude one — every
probability in every basis comes out identical. Not similar: identical, exactly,
with no experiment able to separate them even in principle.

That is called global phase, and the correct statement is not "it is hard to
measure." It is that it is not a physical property. Two state vectors differing
only by a global phase are two descriptions of one state, in the way that
"three metres east of the door" and "three metres east of the door" written in a
different pen are one location.

This platform's grader ignores global phase for exactly that reason. A grader
that failed you for it would be marking the notation rather than the physics.

Now the qualification that makes the rest of this unit necessary. The factor was
invisible because it applied to the whole state. The moment the state is split
across |0> and |1>, Z multiplies only part of it by minus one — and a sign on
one amplitude and not the other is a completely different situation.

Global phase is real arithmetic with no observable consequence. Relative phase
is the next node, and it decides everything.
```

**PROMPT**
```
Episode 7 of 14. Title: The gate that does nothing.

Focus: global phase is not merely unmeasurable in practice, it is not a physical
property at all. This episode kills misconception M5, "global phase is
observable."

Visual beats, in order:
1. Z applied to |0>. Before and after states shown identical. Histogram
   unchanged.
2. Z applied to |1>, giving minus |1>. Show the sign appearing on the amplitude.
3. The squaring step: (-1) squared equals 1, so the probability is unchanged.
   Show this for the Z basis and then state it holds in every basis.
4. A card distinguishing "hard to measure" from "not a physical property" —
   mark the first as wrong and the second as right.
5. A one-line teaser: a state split across |0> and |1>, with Z hitting only one
   amplitude. Do not develop it.

The precision in beat 4 is the point of the episode. Do not soften "no
experiment even in principle" into "very difficult to detect."

Do not explain |+> and |-> — that is episode 8.

End on: "Relative phase is the next node, and it decides everything."
```

---

### V08 — The same odds, a different state
**Node:** `u2.n2` · **Runtime:** 3:00 · **Guards:** M5, M6

**SOURCE**
```
Two states. |+> and |->. Measure either one and you get fifty-fifty. Identical
histograms, over any number of shots, with no statistical test able to separate
them.

They are not the same state, and one gate tells them apart.

|+> has two amplitudes, both positive, both one over root two. |-> has the same
two magnitudes with a minus sign on the |1> amplitude. That minus sign sits on
one amplitude and not the other — which is precisely what makes it a relative
phase rather than a global one. A global phase multiplies everything and
vanishes. A relative phase sits between the components and does not.

Here is how to see it. Apply H to |+> and you get |0>, with certainty — a single
bar. Apply H to |-> and you get |1>, with certainty — a single bar, the other
one. Same fifty-fifty in the Z basis, opposite certainties after a change of
basis.

Nothing was hidden and then revealed. The difference was always physical. It was
just not visible along the axis you happened to be measuring, and H rotated the
measurement onto the axis where it is.

This is the single most useful idea in the unit, so it is worth stating without
hedging. A relative phase is invisible to one measurement basis and decisive in
another. Changing basis is not a trick for extracting hidden information; it is
choosing which physical property you are asking about.

And it is the reason the "same odds means same state" assumption has to go. Two
states with identical measurement statistics in one basis can be completely
different states. On this platform the state-vector table shows you the
amplitudes with their signs, and the histogram shows you only the squares. When
they seem to disagree, the histogram is the one throwing information away.

Global phase is undetectable. Relative phase decides the answer. Every algorithm
that beats a classical one lives in that gap.
```

**PROMPT**
```
Episode 8 of 14. Title: The same odds, a different state.

Focus: relative phase is physical and measurable; a basis change converts it
into a certainty. Kills misconception M6, "relative phase does not matter",
while reinforcing M5 from the previous episode.

Visual beats, in order:
1. |+> and |-> written as amplitude pairs, side by side, with the minus sign on
   one component of |->. Make the sign visually prominent.
2. Their histograms, side by side, identical 50/50. Caption: "no measurement in
   this basis separates them."
3. H applied to each: |+> goes to a single bar at |0>, |-> goes to a single bar
   at |1>. Same layout as beat 2 so the contrast is immediate.
4. A card contrasting global phase (multiplies everything, vanishes) with
   relative phase (sits between components, survives).

Frame the basis change as asking a different physical question, NOT as
"revealing hidden information." The information was never hidden.

Do not introduce S or T gates — that is episode 9.

End on: "Global phase is undetectable. Relative phase decides the answer."
```

---

### V09 — Quarter turns
**Node:** `u2.n3` · **Runtime:** 2:30

**SOURCE**
```
Z is not a special gate. It is one setting of a dial, and the dial is an angle.

Z puts a half turn of phase on the |1> amplitude — a rotation of pi, which in a
sign is a minus. S puts a quarter turn, pi over two, which multiplies the |1>
amplitude by i. T puts an eighth turn, pi over four. They are the same operation
at three sizes.

Because they are angles, they add. Apply T twice and you have S. Apply S twice
and you have Z. Apply Z twice and you are back where you started, because a full
turn is no turn. Four T gates make a Z. Eight T gates make nothing at all.

That wrap-around is why phase is drawn on this platform as a colour wheel rather
than a bar. A bar has two ends; phase does not. The colour at zero and the
colour at two pi have to be the same colour, because they are the same phase,
and only a wheel can do that honestly.

Now build something with it. Start at |0>, apply H, and you are at |+> — on the
equator, both amplitudes positive. Apply S, and the |1> amplitude picks up a
factor of i. The state is |0> plus i|1>, over root two.

Look at what did and did not change. The magnitude of both amplitudes is still
one over root two, so the odds are still exactly fifty-fifty, and the histogram
is unchanged from |+>. What changed is the longitude: you moved a quarter of the
way around the equator without touching the latitude at all.

That is what a phase gate is for. It is the only control you have that moves the
state while leaving every measurement in this basis untouched — which sounds
useless and is the opposite. A property that a measurement cannot see is a
property a measurement cannot destroy, and it is still there at the end of the
circuit to be converted into an answer.

Phase is an angle, and angles wrap.
```

**PROMPT**
```
Episode 9 of 14. Title: Quarter turns.

Focus: Z, S and T are the same phase rotation at three sizes; they compose by
adding angles; and moving in phase changes the state without changing the odds.

Visual beats, in order:
1. A phase wheel with three marks: Z at pi (half turn), S at pi/2 (quarter),
   T at pi/4 (eighth). One diagram, three labels.
2. The composition ladder: T + T = S, S + S = Z, Z + Z = identity. Show it as
   arcs accumulating on the wheel, not as a list.
3. Why a wheel and not a bar: zero and two pi must be the same colour.
4. H then S on |0>, producing (|0> + i|1>)/root 2. Show the amplitude table
   before and after, with magnitudes unchanged and the i appearing.
5. The histogram before and after beat 4, identical. Caption: "the odds did not
   move. The state did."

Beat 5 is the payoff. Give the identical-histogram moment real emphasis.

A Bloch sphere is allowed here (single unentangled qubit). If shown, the arrow
must move along the equator only, with the latitude visibly fixed.

End on: "Phase is an angle, and angles wrap."
```

---

### V10 — Invisible, then decisive
**Node:** `u2.n4` · **Runtime:** 3:30 · **Guards:** M7

**SOURCE**
```
Three gates: H, then Z, then H. Starting from |0>, that circuit produces |1>
with certainty. This is the most important circuit in the course, and it is
worth going through slowly, because it is the shape of every quantum algorithm
that has ever beaten a classical one.

Stop after the first H. The qubit is at |+>, an even lean, fifty-fifty.

Now the Z. It puts a minus sign on the |1> amplitude, and the state becomes |->.
Check the histogram at this point and it is still fifty-fifty. Nothing you can
measure here has changed. If you were debugging this circuit by reading it
halfway through, you would conclude the Z did nothing.

Then the second H, and the output is |1>, certain, every shot.

So the Z did everything. It was unmeasurable in the middle and it decided the
final answer completely. That is not a paradox; it is the mechanism. The middle
state carried a relative phase, which no measurement in that basis can see, and
the second H converted that phase into a difference in the odds.

And here is the part that makes it sharp. Suppose you had measured in the
middle, just to check. The reading would have been fifty-fifty whether the Z was
there or not — so it would have told you nothing — and it would have collapsed
the state, destroying the phase the second H needed. The final answer would come
out fifty-fifty, and you would have broken the circuit with a measurement that
returned no information at all. The worst possible trade.

The general principle underneath: probabilities can only add. Amplitudes can
cancel. A classical randomised algorithm can only ever pile up the chances of
its outcomes. A quantum one arranges amplitudes so that the routes to the wrong
answers arrive with opposite signs and annihilate, leaving the right answer
holding what is left.

Deutsch-Jozsa, Grover and Shor are all this move. They differ in what sits in
the middle and how many qubits it acts on. The sandwich is the same: spread into
superposition, mark with phase, interfere back.

Interference, in three gates.
```

**PROMPT**
```
Episode 10 of 14. Title: Invisible, then decisive. This is the keystone episode
of the series.

Focus: H-Z-H turns an unmeasurable phase into a certain answer, and measuring
in the middle would learn nothing while destroying everything.

Visual beats, in order:
1. The three-gate circuit, whole, at the top. Then walk it left to right.
2. After the first H: state |+>, histogram 50/50.
3. After Z: state |->, histogram STILL 50/50. Put the two histograms adjacent
   and identical. Caption: "nothing measurable has changed."
4. After the second H: single full bar at |1>. The jump from beat 3 to beat 4 is
   the emotional centre of the series — hold on it.
5. The counterfactual: the same circuit with a measurement inserted after Z.
   Result 50/50. Caption: "no information gained, the circuit destroyed."
6. A closing card: "Probabilities can only add. Amplitudes can cancel."
7. Name Deutsch-Jozsa, Grover and Shor once as the same three-part shape:
   spread, mark with phase, interfere back. Do not explain any of them.

Beat 5 must be framed as the worst possible trade — zero information for total
destruction.

Do not claim Grover is an exponential speedup. Do not describe any algorithm as
searching all options at once.

End on: "Interference, in three gates."
```

---

### V11 — Two stories, and a gate between them
**Nodes:** `u3.n1`, `u3.n2` · **Runtime:** 3:00 · **Guards:** seeds M8, states endianness

**SOURCE**
```
Two qubits have four possible outcomes: 00, 01, 10 and 11. Written the way this
platform writes them, the left digit is q1 and the right digit is q0, so |10>
means q1 is one and q0 is zero. Bit order is a convention, it is not obvious,
and getting it backwards is one of the most common sources of a circuit that
looks correct and is not.

Put H on both qubits and all four outcomes come up equally, twenty-five percent
each. Here is the test that matters, and it will do real work in a moment.

If the two qubits are independent, then the probability of any joint outcome is
the product of the individual ones. P of 00 is P of q0 being zero times P of q1
being zero: one half times one half, which is one quarter. Same for all four
rows. The multiplication works, every row checks out, and the register
factorises — it is genuinely two separate stories that happen to be written side
by side. Knowing q0 tells you nothing about q1.

Remember that test. It is about to fail, and the failure is the concept.

Now the gate that connects two wires. CNOT has a control and a target: if the
control is one, flip the target; if the control is zero, leave it alone. On
definite inputs that is four boring rows of a truth table. Control zero, target
one: nothing happens. Control one, target one: the target flips to zero.

Notice what CNOT does not do. It does not copy the control onto the target — it
flips the target conditionally, and on a target that was already one, a flip
makes it zero, which is the opposite of copying. The copying picture happens to
work when the target starts at zero and fails everywhere else, which is what
makes it such a durable bad habit.

On a definite control, CNOT copies a decision that has already been made, and it
never needed to look at the target to do it. Nothing surprising has happened
yet. Feed the control a lean instead of a decision, and the same gate stops
being bookkeeping.
```

**PROMPT**
```
Episode 11 of 14. Covers two lesson nodes. Title: Two stories, and a gate
between them.

Focus: the factorisation test for independence, and CNOT's truth table on
definite inputs. Both are setup for episode 12.

Visual beats, in order:
1. Bit order convention, on screen, explicitly: |q1 q0>, so |10> means q1=1,
   q0=0. This must appear before any two-qubit bitstring.
2. H on both wires. Four-bar histogram, all at 25%.
3. The factorisation test as a worked table: four rows, each showing
   P(joint) = P(q0) x P(q1), each arriving at 0.25. Mark it "all four rows
   check out."
4. CNOT drawn correctly: filled dot on the control, circled plus on the target,
   joined by a vertical line. Never a bare X.
5. CNOT truth table, four rows, definite inputs only.
6. A card: "CNOT does not copy. It flips conditionally." Show the case where
   the target starts at 1 and a flip makes it 0 — the case where the copying
   picture breaks.

Beat 3 must be presented as a reusable TEST, not a one-off observation. Episode
12 depends on the viewer remembering it.

Do not mention entanglement, Bell states, or superposed controls.

End on: "Feed the control a lean instead of a decision, and the same gate stops
being bookkeeping."
```

---

### V12 — Two coins, one answer
**Node:** `u3.n3` · **Runtime:** 4:00 · **Guards:** M3, M8

**SOURCE**
```
Two gates: H on q0, then CNOT with q0 as control and q1 as target. Run it, and
the histogram has two bars. Fifty percent on 00, fifty percent on 11, and
nothing at all on 01 or 10. The two qubits always agree, and neither of them
decided first.

Run the factorisation test on it.

Each qubit on its own reads fifty-fifty — look at q0 alone and it is an even
lean, look at q1 alone and it is an even lean. Independence therefore predicts
one quarter on every row. The register says fifty, zero, zero, fifty. The
multiplication fails, and it does not fail by a little. Two rows that
independence requires to be a quarter each are empty.

No pair of independent leans can produce that table. So these two qubits are not
two stories. They are one.

Now the objection you should have, because it is the right objection, and
because it is the one a physicist will raise.

Two coins glued together at the factory, so that they always land the same way,
would also produce fifty, zero, zero, fifty. That is ordinary correlation with a
shared cause, and it fails the independence test too. So the histogram alone
does not prove anything quantum. It rules out independence. It does not rule out
a shared answer agreed in advance.

What rules that out is changing the basis. Put an H on both qubits before
measuring — asking a different question of the same state — and the Bell pair
still agrees, perfectly. The glued coins do not; they scatter across all four
outcomes. A pre-agreed answer is an answer to one specific question, and it
falls apart when you ask a different one. The Bell pair has no pre-agreed answer
to fall apart.

And nothing travels between the qubits when you measure. It cannot, and it does
not need to. There were never two separate stories for a signal to pass between
— there was one joint description the entire time. You cannot send a message
this way, and the correlation shows up only when the two result lists are
brought back together and compared.

That is a Bell state. Entanglement is not the correlation. It is the failure of
every separate-stories explanation that would otherwise account for it.
```

**PROMPT**
```
Episode 12 of 14. Title: Two coins, one answer. This is the episode most likely
to be questioned by an expert — the objection must be handled on screen.

Focus: the Bell state fails the factorisation test; ordinary correlation also
fails it; what separates them is that the Bell correlation survives a change of
basis.

Visual beats, in order:
1. The two-gate circuit: H on q0, then CNOT (filled dot on q0, circled plus on
   q1). Bit order label still visible.
2. Four-bar histogram with two bars at 50% and two bars at ZERO. Make the empty
   bars visually loud — they are the result.
3. The factorisation test from episode 11, re-run: predicted 25/25/25/25 above,
   actual 50/0/0/50 below. Mark the mismatch.
4. The glued-coins objection, stated fairly and given real screen time. Show
   that glued coins produce the SAME histogram.
5. The resolution: H on both qubits before measuring. Bell pair still agrees
   perfectly; glued coins scatter across all four outcomes. Two histograms side
   by side.
6. A card: nothing travels between the qubits; no message can be sent; the
   correlation is only visible when the two result lists are compared.

Beats 4 and 5 are mandatory and must not be compressed. An episode that claims
the 50/0/0/50 histogram alone proves entanglement is wrong and will be caught.

Do NOT draw a Bloch sphere anywhere in this episode. Do not say "spooky action
at a distance." Do not suggest measurement of one qubit influences the other.

End on: "Entanglement is not the correlation. It is the failure of every
separate-stories explanation that would otherwise account for it."
```

---

### V13 — Where the sphere runs out
**Node:** `u3.n4` · **Runtime:** 3:00 · **Guards:** M4

**SOURCE**
```
Build the Bell state again, then open the Bloch sphere on q0 alone. The arrow is
not on the surface. It is not anywhere on the surface. It is a dot at the dead
centre, with no direction at all.

That is the correct answer, and it is worth knowing why, because the alternative
is a mistake that survives in a lot of teaching material.

Recall what the length of the Bloch arrow means: purity. Full length means the
qubit has a definite state of its own — a point on the surface, a direction in
space. Zero length means there is no individual state to draw.

And there genuinely is not one. A Bell pair has one joint description, four
amplitudes across the two qubits together, and that description does not
factorise into a story about q0 and a story about q1. If you ask "what state is
q0 in", the honest answer is that the question has no answer. Not that the
answer is unknown — that there is no individual state for the question to be
about. The sphere holds every state one qubit can have on its own, and this
qubit does not have one.

Here is the mistake to avoid. If you take the two amplitudes sitting in front of
the q0 slot and draw them on a sphere as though they were a single-qubit state,
you get an arrow on the surface, and it looks fine, and it is physically wrong.
This platform computes the Bloch vector from the reduced density matrix instead
— the mathematically correct way to ask what one part of a larger system looks
like on its own — which is exactly why it renders a dot at the centre and
labels it "no individual state" rather than quietly drawing something plausible.

A visualiser that never fails is not being careful, it is being silent. The
centre is the sphere telling you the truth about its own limits.

The state-vector table still works here, which is why this platform treats it as
a peer view rather than a fallback. Two qubits need four numbers. A sphere has
room for one qubit's worth, and no amount of rendering can change that.
```

**PROMPT**
```
Episode 13 of 14. Title: Where the sphere runs out.

Focus: an entangled qubit has no individual state, the Bloch vector collapses to
the centre, and drawing an arrow there instead would be physically wrong. Kills
misconception M4.

Visual beats, in order:
1. The Bell circuit, then a Bloch sphere for q0 with a DOT AT THE CENTRE and no
   arrow. Label it "no individual state".
2. Arrow length as purity, recalled from episode 6: full length on the surface
   equals a state of its own; zero length equals none.
3. A card distinguishing "the answer is unknown" from "there is no individual
   state for the question to be about." Mark the first as wrong.
4. The mistake: naively drawing the q0 amplitudes as a surface arrow. Show it,
   then mark it WRONG with a clear cross. This is the only time in the series an
   incorrect visual appears, and it must be unambiguously labelled.
5. The state-vector table with four amplitudes, working fine, beside the silent
   sphere.

THE MOST IMPORTANT CONSTRAINT IN THE SERIES: at no point may this episode show
a Bloch arrow on the surface for an entangled qubit except in beat 4, where it
is explicitly marked as the error. If the generated video shows an entangled
qubit as a surface arrow anywhere else, discard the take and regenerate.

End on: "A sphere has room for one qubit's worth, and no amount of rendering can
change that."
```

---

### V14 — Three that agree
**Node:** `u3.n5` · **Runtime:** 2:30 · **Guards:** M3, M8

**SOURCE**
```
Two qubits that always agree. Now do three.

One H on the first wire, then a CNOT from the first to the second, then a CNOT
from the first to the third. Three gates. The result is fifty percent on 000 and
fifty percent on 111, and nothing on the other six outcomes. That is a GHZ
state.

Read the construction as what it actually is. The H creates a decision that has
not been made. Each CNOT ties one more wire to that undecided thing — not to a
value, because there is no value yet, but to the decision itself. The
entanglement chains outward, and nothing in the construction is limited to three
qubits. Add a fourth CNOT and you have four.

Now measure any one of the three and suppose you get one. The other two are now
both one, with certainty. Not likely — certain. The state had exactly two
branches, all-zeros and all-ones, and learning which branch you are in fixes
every wire in it at once. There is no branch where the first qubit is one and
the second is zero, so once you know the first, there is nothing left to
determine.

That last point is the one to be careful with, because it is where the bad
intuition lives. Nothing was sent to the other two qubits. They were never
carrying separate values that had to be updated. There was one description of
all three wires, it had two branches, and a measurement selected a branch. No
influence travelled anywhere, and no message can be sent this way.

This is the whole of unit three. You can build entangled registers of two or
three qubits. You have the factorisation test that shows why they are entangled
and the basis change that separates them from ordinary correlation. And you can
explain why the Bloch sphere goes quiet when you point it at one of them,
which is a thing most people who can define entanglement cannot actually do.

One H, and every wire after it agrees.
```

**PROMPT**
```
Episode 14 of 14. Title: Three that agree.

Focus: GHZ as an entanglement chain, and measuring one qubit fixing all three
without anything travelling.

Visual beats, in order:
1. The three-gate circuit on three wires: H on q0, CNOT q0 to q1, CNOT q0 to q2.
   Controls as filled dots, targets as circled pluses.
2. An eight-bar histogram with bars ONLY on 000 and 111, each at 50%, and six
   visibly empty slots.
3. The two branches drawn as exactly two rows: all-zeros and all-ones. Nothing
   else exists.
4. A measurement on one wire returning 1, and the other two wires resolving to
   1. Show it as a branch being SELECTED from the two, not as a signal
   propagating between wires.
5. A card: nothing was sent; there were never separate values to update.

Beat 4's framing is critical. If the animation shows anything moving from one
qubit to another, discard the take and regenerate. Selection, not transmission.

Do not draw a Bloch sphere anywhere in this episode.

Close by naming the three capabilities of unit three: build entangled registers,
run the factorisation test, explain why the Bloch sphere goes quiet.

End on: "One H, and every wire after it agrees."
```

---

## 5. Review checklist

Watch every video once, start to finish, against this list before it ships. A
video that fails any row is regenerated, not patched.

| # | Check | Fails if |
|---|---|---|
| 1 | Bloch sphere only for single unentangled qubits | An arrow is drawn on the surface for a Bell or GHZ qubit (except V13 beat 4, marked wrong) |
| 2 | CNOT drawn as dot + circled plus | CNOT appears as a bare X or a labelled box |
| 3 | Bit order stated and consistent | Any two-qubit bitstring appears without the convention having been shown |
| 4 | Amplitude vs probability kept distinct | An amplitude is described as a percentage, or 0.5/0.5 is given as the amplitudes of an even lean |
| 5 | No parallel-universe framing | "Tries all answers at once", "parallel universes", or similar appears |
| 6 | No signalling language | Measuring one entangled qubit is described as affecting, updating or informing another |
| 7 | Ends on the specified sentence | An outro, a call to action, or a "thanks for watching" appears |
| 8 | Runtime within 30s of target | Padding, repetition, or a recap section |
| 9 | No filler slides | Any slide with no label, number, formula or circuit on it — see the banned-imagery list in §3 |
| 10 | No invented sections | A numbered chapter card or segment that the episode prompt did not ask for |
| 11 | Circuits use only briefed gates | A control dot, vertical connector or circled plus in a single-qubit episode; a circuit whose labels contradict the sentence above it |

Log results in a shared sheet: video id, generator, take number, pass/fail, and
which row failed. Fourteen videos across six people will otherwise lose track of
which take is current.

---

## 6. Batch 1 review — V01 to V04

Reviewed 2026-09-16. Visuals checked by extracting keyframes at 15-second
intervals; narration checked against the WebVTT transcripts in
`apps/web/public/video/*.vtt`. Both halves of §5 now verified.

| Video | Node | Runtime / target | Visuals | Narration | Verdict |
|---|---|---|---|---|---|
| V01 An honest coin | `u0.n1` | 5:10 / 2:30 | Pass | Pass | **Ship** |
| V02 A lean, not an answer | `u0.n2` | 4:16 / 3:00 | ~80s filler | Pass | **Ship, regenerate if time** |
| V03 Where the coin analogy dies | `u0.n3` | 5:17 / 3:30 | Pass | Outro | **Ship** — best of the four |
| V04 X, H, and two right answers | `u1.n1` | 5:46 / 2:30 | One bad slide | Recap + outro | **Ship** |

**The narration is accurate in all four.** No banned phrase appears anywhere —
no parallel universes, no "tries every answer at once", no signalling language.
Every technical claim traces back to its brief. The physics is sound.

**V03 is the benchmark.** It does the refutation-by-cases properly ("Machine
produces a certainty, which is reachable by neither branch"), carries the
path/sign table (To |1>: Pos + Neg → Zero; To |0>: Pos + Pos → Reinforce), lands
"Unlikely is not the same as unavailable", and handles the inverse trap exactly
as briefed ("Describes arithmetic, not mechanism"). Whatever that generation run
did, repeat it.

**V02 is better than the visuals suggest.** The amplitude/probability tables are
exact (0.707 → 0.5, ~0.92 → 0.85, and 0.6 → 0.36). The invented "4 · The Quantum
Gap" section *sounds* right — "probabilities can only pile up, but amplitudes can
cancel; every quantum algorithm that beats a classical one lives exactly in that
gap" is almost verbatim from the brief. Only the pictures over it are empty: a
sphere morphing into a cube, unlabelled bar charts, a tower of plus signs, a
lightning bolt through a barrier, an unlocking padlock. So do **not** trim it —
that would cut correct narration. Ship as-is, or regenerate for better visuals.

**V04's one bad slide** sits at about 3:25–3:42. The sentence is correct
("Circuits producing the same state are the same operation") but the diagram
under it is `|0> — H — ⊕ — (atom) — ▷ — ⊕ — H — |0>` with a phantom second wire:
two-qubit notation two units before CNOT exists, and it starts and ends at |0>
when the whole point is that both routes reach |1>. It carries a green tick.

**Systemic, all four:**
1. **Every video ran 40–130% over target.** `u1.n1` has `estMinutes: 2` and its
   video is 5:46 — nearly three times the lesson node it belongs to.
2. **NotebookLM invents numbered chapter cards** ("3 · The 85% Case", "4 · The
   Quantum Gap", "3 · Reality vs Ritual"). The invented sections are where all
   the filler and hype appeared. None of the briefed content was wrong.
3. **A "Gemini Notebook" watermark** sits bottom-right of every frame. Fine for
   a hackathon, but disclose AI-generated assets if the submission asks.
4. **The two longest videos grew outros.** V03 reaches its specified closing
   line — "A hidden value cannot do this" — and then keeps talking for another
   twenty seconds, ending on "what other classical assumptions is quantum
   mechanics waiting to break?" V04 adds a full recap and then ends on "what
   other rigid rituals in technology and learning are we blindly following
   today?" Both are engagement-bait outros, and V04's drifts off quantum
   computing entirely. V01 and V02 stop correctly.
5. **Section titles are narrated aloud** ("Section 1: The RY Gate"), and V04
   mixes "Section" and "Part" in the same video.
6. **All four open with "Welcome to this explainer."**

§3 and §5 have been hardened against all of the above. Use the updated house
style block for V05 onward — the ENDING sub-block is there because points 4 and
6 survived the first version of the rule.

### Transcripts

Gemini returns them already in WebVTT with sensible cue boundaries, so they need
no conversion — save straight to `apps/web/public/video/<nodeId>.vtt`. All four
end within three seconds of the probed video duration, which is a good sanity
check that you got a transcription rather than a summary. Unlike the MP4s these
are small and belong in git.

---

## 7. Adding a video to the app

The player is built. Adding one is four files and a manifest row — no component
work.

**1. The MP4.** Drop the NotebookLM export in `apps/web/video-src/` named for
the first node it covers, e.g. `u2.n1.mp4` — that folder is gitignored, so the
~20MB master stays local. Then make the web copy:

```bash
cd apps/web && node scripts/encode-videos.mjs
```

It writes `public/video/u2.n1.mp4` at about a fifth of the size (≈4MB,
visually identical — SSIM ≈ 0.996) with the index at the front so playback
starts immediately. That copy **is** committed, and deploys with the site.

**2. The poster.** A black rectangle where the player should be reads as broken,
so every video needs a still. Two seconds in is the title card:

```bash
ffmpeg -ss 2 -i u2.n1.mp4 -frames:v 1 -vf "scale=960:-1" -q:v 4 u2.n1.jpg
```

**3. The transcript.** Upload the MP4 to Gemini and ask for a verbatim
transcript — it returns WebVTT already, so save it straight to `u2.n1.vtt`. Read
it against §5 rows 5 and 7 before committing; the narration is where the outros
hide.

**4. The manifest row** in `apps/web/lib/curriculum/media.ts`:

```ts
{ id: "u2.n1", title: "The gate that does nothing", seconds: 174, covers: ["u2.n1"] },
```

`seconds` comes from `ffprobe -v error -show_entries format=duration -of csv=p=0`.
For a shared video, list every node in `covers`, in curriculum order, with the
file named for the first — `videoFor()` resolves the others to it.

**5. `npm test`.** `tests/media.test.ts` checks that every `covers` id is a real
node, that nothing is covered twice, that the poster and transcript both exist,
and that the VTT parses. A missing file fails there rather than in front of a
learner.

The web `.mp4`, `.jpg` and `.vtt` are all committed; only the master in
`video-src/` is not. The player still falls back to the poster, the title and
the full transcript when a video fails to load — offline, for instance, where
the service worker deliberately does not cache video.

## 8. Notes, cards and the check

Built, in `apps/web/lib/curriculum/study.ts`. One pack per node, all nineteen,
derived from the SOURCE briefs above so the page and the narration cannot drift.

**A flashcard here is a `RetrievalPrompt` and nothing else.** There is no second
type, no second store and no second scheduler — the review bench's SM-2 already
schedules by node; the cards just give it more than one question to ask.

| Surface | What it uses | Writes to the scheduler? |
|---|---|---|
| Pass screen — "Why that worked" | `notesFor()`, inside the existing instruction disclosure | — |
| Pass screen — "Check yourself" | `quizFor()` — the study cards only | **No.** See below |
| Review bench | `cardForReview()` — the node's own prompt plus the study cards, rotating | Yes, as before |
| Path warm-up | `node.retrieval` | Yes, as before |

Three decisions worth knowing about:

1. **The pass-screen check writes nothing to the scheduler.** The node was
   passed seconds earlier. Letting a correct answer there grow the review
   interval would schedule on the strength of short-term memory, which is the
   exact failure spaced repetition exists to prevent.
2. **The review bench rotates questions.** A node that always asks the same one
   stops measuring recall after the second visit and starts measuring where the
   right answer sat. The rotation index is derived from the stored
   `intervalDays`, so nothing new had to be persisted.
3. **Options are shuffled at render.** Every prompt in this codebase is authored
   answer-first — good for reviewing a block of questions at a glance, fatal to
   render, because "click the top option" then scores full marks across the
   whole curriculum. `presentPrompt()` shuffles on a hash of the question text,
   so the layout is stable per question but the answer is not always first. It
   is applied on all three surfaces.

Adding a card is one entry in `STUDY[nodeId].cards`. `tests/study.test.ts`
checks that every node has a pack, that no question is duplicated anywhere in
the curriculum, that `answerIndex` is in range, that the pass-screen check never
repeats the question the path already asks, and that shuffling preserves the
correct answer.
