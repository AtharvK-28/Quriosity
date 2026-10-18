# Quriosity — context for Claude Code

SIH 26140 · team Quantum Latte · an AI-based interactive quantum-algorithm
learning platform. It's a circuit workbench that teaches: drag gates, watch the
Qiskit code write itself, run the circuit, and when it's wrong, get told which gate
on which wire is wrong and why.

This file is the handoff between chat sessions. **Update it when something
here stops being true**, especially "Status" and "What is left".

## Working agreements

- **The user makes the commits and pushes.** Don't commit, push or open PRs
  unless asked. Just build, test and report.
- Teammates suggest changes and the user relays them. The user often says "you
  decide". Give a recommendation and act on it.
- Don't let a change cost money without saying so (paid APIs, paid tiers).
- Secrets never go in the repo, in chat output or in any file except the
  git-ignored `.env.local`. If a key was pasted in chat, remind the user to rotate it.
- Keep the physics correct above everything else. `tests/golden.test.ts` is the
  blocking gate. If it fails, the product is showing wrong physics.

## Layout

npm workspaces monorepo:

| Path | What |
|---|---|
| `apps/web` | Next.js **16** App Router, React 19, Zustand, three.js. **Read `apps/web/AGENTS.md`**: Next 16 differs from training data, so check `node_modules/next/dist/docs/` before using a Next API |
| `apps/server` | Node + TypeScript (run by `tsx`, no build step): `node:http` + `ws`. Accounts, sync, classes, assignments, arena. Imports the web app's own IR/sim/grader |
| `docs/` | 00 README, 01 Ideation, 02 PRD, 03 Design, 04 TRD (**§0 "As built"** records every divergence from the design), 05 Video production guide |
| `UI Reference/` | Team prototype (the Night palette came from here) |

Key web folders: `lib/ir` (frozen IR, gate registry), `lib/sim` (state-vector
simulator, 16-qubit cap), `lib/grade` (fidelity grading), `lib/tutor` (rule
engine L01–L13 → misconceptions M1–M14, chat corpus, guard, claim check,
**physics firewall**), `lib/render` + `lib/io` (Qiskit/Cirq/PennyLane/Q#/QASM out,
QASM/Qiskit in, parsed and never executed), `lib/curriculum` (U0–U4, 23 nodes, oracle boxes, glossary,
tracks, cohort), `lib/sync`, `lib/arena`, `stores/`, `components/`,
`app/api/tutor/route.ts`.

Key server files: `src/index.ts` (env), `src/server.ts` (HTTP + WS),
`src/api/api.ts` (REST routes + RBAC), `src/auth/*`, `src/db/{db,schema.sql,repo}.ts`,
`src/arena/service.ts`.

## Commands

```bash
npm install
npm run dev            # web  → http://localhost:3000
npm run dev:server     # API  → http://localhost:4000 (PGlite in apps/server/data, nothing to install)
npm test               # web (vitest) then server (vitest)
npm run build && npm start   # production build; the only mode where the service worker runs
node apps/web/tests/e2e/demo.spec.mjs   # 60 browser checks, needs a running app (BASE_URL)
node apps/web/scripts/encode-videos.mjs # video-src/*.mp4 → public/video (ffmpeg, CRF 28)
```

Last known green (2026-09-29): web **883** tests, server **131**, e2e **60/60**,
`tsc --noEmit` clean in both apps. `next build` was last clean on 2026-09-26 and hasn't been rerun since.

On Windows, PowerShell 5.1 gotchas: `[IO.File]` calls ignore `cd`, so use
absolute paths. Inside `@(...)`, a comma binds tighter than `+`. A curly quote
inside a single-quoted string breaks parsing. Prefer the Edit tool.

On Windows, port 4000 is sometimes taken by another local app ("StockSense").
Check it before assuming the Quriosity server is up.

## Architecture decisions (don't undo without reason)

- **The circuit IR (TRD §4) is frozen.** Every surface is a function over it.
- Simulation, grading and the rule engine run **in the browser**. The learner path
  works with no server and no network. The server re-simulates arena submissions
  with the same code.
- Grading compares **states** (fidelity, global-phase invariant), never structure.
  Endianness lives in one place: little-endian, and q0 is the rightmost bit.
- Some lessons also require specific gates (`requires` in
  `lib/curriculum/nodes.ts`, e.g. u0.n3 needs 2×H) so a trivially equal state
  can't pass. `unmetRequirement()` drives the "right state · one step missing" card.
- **Tutor** (`POST /api/tutor`, NDJSON stream). The engine order is: Claude
  (`ANTHROPIC_API_KEY`, `claude-opus-5`, low effort, server-side fallback beta),
  then Gemini (`GEMINI_API_KEY`: `gemini-2.5-flash` → `gemini-3.5-flash-lite`,
  moving on at 404/429/503), then the built-in guide (rule engine + BM25 over its own
  corpus). Every engine's text goes through the same `guardedOutput`: LaTeX →
  plain notation, placeholder fill, the claim check against the simulator, the
  **physics firewall** (`lib/tutor/firewall.ts`: catalogued laws plus laws
  computed from the gate matrices), and a word cap. A withdrawn sentence is
  retracted and replaced with the true statement.
- **Workbench mode must never produce proactive tutor output.** That's a P1 defect,
  and the e2e suite asserts it. Pop-ups (`components/tutor/TutorPop`,
  `stores/popStore.ts`) are off in Workbench, off while the chat is open, and
  anchored on the right so they never cover the canvas.
- **Auth**: Argon2id; a 15-minute HS256 access token held in memory; a 30-day
  rotating refresh token in an httpOnly SameSite=Strict cookie, with family
  revocation on reuse; roles student / instructor / admin, checked per route.
- The web app reaches the API **same-origin** through the Next rewrite
  `/api/server/:path*` → `API_ORIGIN` (default `https://quriosity-1.onrender.com`),
  which keeps the cookie first-party. The arena WebSocket connects **directly**
  with `?token=` (`lib/arena/server.ts` picks the URL at runtime).
- **Sync**: the session document merges monotonically (XP is recomputed, never
  summed); the library is a union by id; signing out clears the browser.
- Service worker `public/sw.js` runs in production only. Dev unregisters it
  (`ServiceWorkerBoot`). It never caches `/api/*` or `/video/*`.
- Database: Postgres everywhere. Neon in production, PGlite locally and in tests.
  `schema.sql` is idempotent and runs on boot.

## Design rules

- "One instrument, one sentence, one action per screen." Extra detail goes
  behind a `Disclosure`.
- Colour is data: every saturated hue is a physical quantity, and gold means
  "the next thing to press". Tokens live in `styles/tokens.css`. There are two themes,
  Night (violet/gold) and Day (paper), both WCAG AA.
- **The theme follows the device's light/dark setting** (user's decision,
  2026-09-28: "keep the theme to whatever the system theme of the user is").
  `THEME_BOOT` applies it before paint, and `ThemeBoot` (in the layout)
  follows live changes. A choice from the top bar or Settings is saved and
  wins. Settings → "Match system" clears it. No page overrides the theme:
  lessons were briefly forced to Day, and that was reverted at the user's
  request. The server still renders Night. Headless Playwright reports a light
  device, so the e2e suite runs in Day.
- Instrument Serif for concepts only; Space Grotesk for UI (**16px floor**,
  prose 18px); JetBrains Mono for notation **only** (code, kets, axes, the
  circuit). Labels, buttons and nav use `--font-label` (Space Grotesk). Short
  labels may be uppercase at `--ls-label` 0.07em, but the nav is title case.
  Don't bring back letter-spaced mono capitals for labels: the 2026-09-28
  readability pass removed them from 90 rules in 28 files, after the user
  found the UI hard to read.
- **Readability pass (2026-09-28), from research** (NN/g on polarity and font
  size; Mayer's coherence and signaling principles; 50–75 character lines;
  what Brilliant and Duolingo do):
  - Landing section titles use `.sectionTitle` (up to 50px, about 48rem wide,
    two lines rather than four), a gold eyebrow as the section marker, and a
    one-sentence `.lead`.
  - Body copy is `--ink-2`, and big numbers are bold display type.
  - The page grid is faint (the circuit canvas keeps the strong one).
  - Scrollbars are thin and themed globally.
  - Showcase code wraps instead of scrolling.
- **The lit layer (2026-09-26, at the user's request: "not boring, fun to
  learn").** The UI is no longer flat. Panels use `var(--surface)` (a sheen
  plus paper) and `var(--shadow-card)`; `--r-panel` is 16px, `--r-gate` 8px,
  `--frame-w` 1px. `.sheet::before` is a static nebula. Primary buttons are
  `--cta-grad` with `--cta-glow`. Chips and segmented controls are pills.
  Histogram bars are gradient-lit. Registration crosses (`.reg`) are hidden.
  Utilities: `.glow-text`, `.glow-text--cool`, `.lift`. Each unit has a colour,
  `--unit-0..3`, set as `--u` on path unit cards, the lesson brief and landing
  unit cards. Gate families have colours (tray and canvas, via
  `data-family` from `FAMILY_OF` in GateTray): flip violet, phase blue, rotate
  gold, link pink, read teal. The token is `--cta`; there is no `--action`.
  Ambient motion is allowed only for the path's "up next" beckon and the
  lesson orbit art, and both stop under reduced motion. The orbit art leans
  out of its column and is clipped by the lesson page (`overflowX: clip` on
  the sheet), never by `.brief`: clipping the column cut it in a hard line.
- **Ket, the mascot** (2026-09-28): `components/mascot/Ket.tsx`, the tutor's
  face. It's a Bloch sphere with a face, named for the ket |ψ⟩. The ring is
  the equator.
  - **The antenna is a state vector** (`vector` prop), drawn from the centre.
    Ket's camera faces it: z up, x to Ket's right, so the viewer is on −y.
    |0⟩ is up, |1⟩ down, |+⟩ right, |−⟩ left. |−i⟩ points at you, so the bob
    sits on the face; |+i⟩ points away, shown as a dashed "hidden" ring.
  - **Reach past the body = |r| (purity).** Half-entangled gives a stub; one
    half of a Bell pair has no antenna. Moods (`calm curious thinking happy
    sleepy cozy`) are a face plus a pose and claim nothing about a circuit.
  - **The maths is `lib/ket/bloch.ts`:** gates as Rodrigues rotations, `along()`
    for the true path, Born-rule `measure()`. `tests/ket.test.ts` checks it
    against the simulator (every gate, 100 random sequences).
  - **Where Ket appears.** Every one respects `MODE.proactiveTutor`, so never
    in Workbench:
    - **Tutor:** the pop-ups (mood per kind), the dock (header, greeting,
      "Ask Ket") and the landing close.
    - **`KetBeside`/`KetWatch`**, a column beside the canvas showing one wire's
      Bloch vector. It's live in lessons. Challenges show it only after Run,
      so a one-wire puzzle isn't answered for you. **Not on the bench**, and
      not the pointer either (the user's call: "we don't need Ket there"). An
      e2e check asserts this.
    - **CircuitCanvas `pointAt`:** on a failed run, a small Ket sits on the
      diagonal above-right of the diagnosed gate, in the gap between columns
      and wires. It goes on the next edit (run is cleared).
    - **The streak** (TodayPanel): happy when done today with the puzzle or
      all quests, calm when done, cozy (scarf) when a freeze covered
      yesterday, sleepy at risk, curious with no streak.
    - **Onboarding** (`components/onboarding/MeetKet.tsx`, the first visit to
      `/start`), in six scenes: hello, flip (drag X onto Ket), lean (H to
      |+⟩), look (Born-rule collapse), ten of me (ten *prepared*, never
      "copied", for no-cloning), and the twist (H·H returns ten out of ten
      to 0: interference). Gates can be dragged, clicked or typed (X/H), and
      Space looks. The antenna animates along the real rotation with a
      dotted trail, and it's instant under reduced motion. It uses the arena
      sfx and mute. `quriosity.met-ket.v1` sends return visits straight to
      the mode choice ("Meet Ket again" replays; `/start?intro` forces it).
  - Motion is one-shot, never a loop. The engine label (Claude / Gemini /
    Built-in guide) still shows on every tutor answer.
- **The theme follows the device's light/dark setting** (user's decision,
  2026-09-28: "keep the theme to whatever the system theme of the user is").
  `THEME_BOOT` applies it before paint, and `ThemeBoot` (in the layout)
  follows live changes. A choice from the top bar or Settings is saved and
  wins. Settings → "Match system" clears it. No page overrides the theme:
  lessons were briefly forced to Day, and that was reverted at the user's
  request. The server still renders Night. Headless Playwright reports a light
  device, so the e2e suite runs in Day.
- Instrument Serif for concepts only; Space Grotesk for UI (**16px floor**,
  prose 18px); JetBrains Mono for notation **only** (code, kets, axes, the
  circuit). Labels, buttons and nav use `--font-label` (Space Grotesk). Short
  labels may be uppercase at `--ls-label` 0.07em, but the nav is title case.
  Don't bring back letter-spaced mono capitals for labels: the 2026-09-28
  readability pass removed them from 90 rules in 28 files, after the user
  found the UI hard to read.
- **Readability pass (2026-09-28), from research** (NN/g on polarity and font
  size; Mayer's coherence and signaling principles; 50–75 character lines;
  what Brilliant and Duolingo do):
  - Landing section titles use `.sectionTitle` (up to 50px, about 48rem wide,
    two lines rather than four), a gold eyebrow as the section marker, and a
    one-sentence `.lead`.
  - Body copy is `--ink-2`, and big numbers are bold display type.
  - The page grid is faint (the circuit canvas keeps the strong one).
  - Scrollbars are thin and themed globally.
  - Showcase code wraps instead of scrolling.
- **The lit layer (2026-09-26, at the user's request: "not boring, fun to
  learn").** The UI is no longer flat. Panels use `var(--surface)` (a sheen
  plus paper) and `var(--shadow-card)`; `--r-panel` is 16px, `--r-gate` 8px,
  `--frame-w` 1px. `.sheet::before` is a static nebula. Primary buttons are
  `--cta-grad` with `--cta-glow`. Chips and segmented controls are pills.
  Histogram bars are gradient-lit. Registration crosses (`.reg`) are hidden.
  Utilities: `.glow-text`, `.glow-text--cool`, `.lift`. Each unit has a colour,
  `--unit-0..3`, set as `--u` on path unit cards, the lesson brief and landing
  unit cards. Gate families have colours (tray and canvas, via
  `data-family` from `FAMILY_OF` in GateTray): flip violet, phase blue, rotate
  gold, link pink, read teal. The token is `--cta`; there is no `--action`.
  Ambient motion is allowed only for the path's "up next" beckon and the
  lesson orbit art, and both stop under reduced motion.
- **Ket, the mascot** (2026-09-28): `components/mascot/Ket.tsx`, the tutor's
  face. It's a Bloch sphere with a face, named for the ket |ψ⟩. The equator
  ring is phase, and the gold antenna is its state vector, so moods are states:
  `calm` |0⟩ (up), `curious` (tilted), `thinking` |+⟩ (equator), `happy` (one
  spin, a phase rotation). It's in the tutor pop-ups (mood per kind), the dock
  (header, greeting, the "Ask Ket" launcher) and the landing close. Motion is
  one-shot on a mood change, never a loop, and none under reduced motion. The
  engine label (Claude / Gemini / Built-in guide) still shows on every answer:
  Ket is the persona, not a claim about which engine answered.
- Multi-qubit gates are never drawn as their base letter. Use
  `components/circuit/GateMark.tsx`.
- Check phone width: `minmax(0,1fr)` in grids, no horizontal scroll.

## Deployment

| Part | Where | Settings |
|---|---|---|
| Web | Vercel, public at **https://quriosity-livid.vercel.app** | `GEMINI_API_KEY` (and/or `ANTHROPIC_API_KEY`), optional `GEMINI_MODEL`, `API_ORIGIN`, `NEXT_PUBLIC_ARENA_URL` |
| API | Render web service, **https://quriosity-1.onrender.com** | Root dir empty; build `npm install --include=dev`; start `npm run start --workspace=apps/server`; health `/health`; env `DATABASE_URL` (Neon), `JWT_SECRET` (required, refuses to boot without it), `INSTRUCTOR_CODE`, `ADMIN_EMAILS`, `CORS_ORIGIN`, `NODE_VERSION=22`. `NODE_ENV` isn't needed: Render's own `RENDER` variable already puts the server in production mode, and `tsx` is a devDependency, which is why the build uses `--include=dev` |
| DB | Neon Postgres | Schema self-applies |

Known noise: per-deployment **preview** URLs (`quriosity-<hash>-…vercel.app`)
sit behind Vercel Deployment Protection. The manifest fetch gets redirected to
`vercel.com/sso-api`, and the service worker logs "offline and uncached". It's
harmless, and it doesn't happen on the public domain. The Render free tier sleeps,
so the first request takes ~30–50 s.

## Status (2026-09-26)

Built and deployed: the full learning loop (landing, path, 19 lessons, 14
challenges, bench, playground, review, progress, tracks, records, settings,
docs, the glossary at `/reference`), the tutor chat with Gemini live, the physics
firewall, the tutor pop-ups (new terms, hints, wins), accounts, sync, classes,
assignments, attempt review, the arena (Blitz / Circuit golf / Bug hunt, Elo,
copy check), and videos V01–V04 on Vercel. Everything up to commit `8ab042b` is pushed.

Built on 2026-09-26, **not yet committed**:
- **Firewall coverage for all 14 misconceptions.** New laws: entangled-no-own-state
  (M4), relative-phase (M6), kickback (M9), noise-everywhere and
  noise-grows-with-depth (M13), quantum-alongside-classical (M14). It also
  checks CNOT/CZ/SWAP/Toffoli claims on basis states, accepting either bit order.
- **Tutor metrics.** A `check` NDJSON event (sent before `retract`), the
  `tutor_answer_withdrawn` analytics event, and Settings → Tutor checks. Each
  answer has a helpful/not-helpful control (`tutor_feedback`), and a corrected
  answer is labelled in the dock.
- **`sw.js` hardening.** The manifest isn't intercepted, redirected responses
  aren't cached, and an uncached failure returns `Response.error()` instead of
  throwing.
- **Keyboard.** ⌘K palette (`lib/palette.ts`, `components/chrome/CommandPalette`,
  mounted in the layout). On the bench, Space plays the scrubber (there is also
  a Play button) and `[`/`]` fold the state lane.
- **i18n foundation.** `lib/i18n` (`t()`, `formatCount` with en-IN grouping,
  `formatDate`, catalogue `en.ts`). The top bar, tutor dock and palette are
  migrated; `tests/i18n.test.ts` checks keys.
- **Signed records** (server `src/records/sign.ts`, `POST /records/sign`,
  `GET /records/verify`, `GET /records/key`). TrackView issues signed records
  when signed in, and RecordView verifies them. The record code is
  `body.sum[.sig]`.
- **Class challenges.** The `class_challenges` table, `/cohorts/:id/challenges`
  and `/me/challenges`. There is a Publish control on `/teach/author` and a
  "From your classes" section on `/challenges`; the store is
  `stores/classChallengesStore.ts`.
- **Guest save** now offers sign-up (PRD E1-S6's intent). The 5-qubit guest cap
  was **decided against**: see README "Decided against".
- The server tsconfig adds the `DOM` lib (types only), because it now imports
  web `tracks.ts`.
- README, TRD §0 and the stale e2e engine-label regex are updated.

Also built on 2026-09-26 (engagement pass), **not yet committed**:
- **Arena as a game.** Server changes: `src/arena/bots.ts` (an unrated bot after
  15s, or at once on request; it always finishes a race, and may stall only in golf).
  `service.ts` adds `countdownMs` (3s in the server, 0 by default so tests can
  time submissions), emotes (a fixed set, rate-limited), resign, rematch (both
  within 30s), and a `review` in `match.result`, which reveals the opponent's
  circuit only after the match. `repo.ts` adds `rated` on matches (a migration
  ALTER in `schema.sql`), `profile()` and `weekly()`. New endpoints are
  `/arena/profile` (bearer) and `/leaderboard?period=week`. Client:
  `lib/arena/tiers.ts` (Novice→Quantum, III/II/I, start 1200 = Bronze II),
  `components/arena/TierBadge`, and a rewritten `stores/arenaStore.ts` and
  `app/arena/page.tsx`.
- **Daily loop.** `lib/daily.ts` is shared with the server: the UTC-day puzzle,
  quests, `extendStreak` with freezes, `liveStreak` and `shareLine`. The session
  store gains `daily`, `streakFreezes`, `bestStreak`, `activeDays`,
  `frozenDays`, `logDaily`, `recordPuzzle` and `recordArena`; `merge.ts` merges
  them. The server has `daily_results` and `/daily/start|submit|leaderboard`.
  UI: `/daily`, `components/daily/TodayPanel` (on /path, /arena and /daily), and
  a top-bar streak link with at-risk and puzzle-waiting states.
- **Notifications.** `stores/popStore.ts` is now a queue: new words are never
  dropped, the latest run's hint or cheer replaces older ones and goes ahead of
  rewards, and rewards close themselves. `TutorPop` is mounted once in the
  layout as a speech bubble with flashcards, medallions and a burst.
  `lib/rewards.ts` is the event bus from stores to UI.
- **The colour token is `--cta`, not `--action`.** Earlier CSS used the
  non-existent `--action`, and it is fixed everywhere.
- Tests: web 782, server 130, e2e 54/54.

Also built on 2026-09-27 (arena "make it a game" pass), **not yet committed**:
- Server: a `match.opponent_event` play-by-play frame (a miss with its
  fidelity, or a golf score; never the circuit), bots that sometimes "miss",
  `arena.stats()` and a public `GET /arena/stats` (online, queued, live, today,
  weekEndsAt), and `repo.countSince`.
- Client: `components/arena/Game.tsx` + `Game.module.css` provide VersusSplash
  (cards, VS, Elo win odds, 3-2-1-GO), PowerHud (your best-run power bar
  against their progress to par), Feed, VictoryBanner (letters, confetti, a
  count-up rating, badges unlocked), BadgeShelf, Podium, SeasonBanner,
  LiveStats and SoundToggle. `lib/arena/sfx.ts` synthesises Web Audio sounds,
  with a mute key. `lib/arena/badges.ts` defines 12 badges; `badgesFor` is
  pure, and "one shot" needs a real solve. The session has `badges` and
  `awardBadges`, merged as a union, and they are announced as `badge` rewards.
  The arena store adds `feed`, `submits`, `missAt` (board shake),
  `wasRematch`, `earned`, `stats` and `loadStats`. The arena page gets a
  shiny PLAY button, coloured mode tiles, a rank halo and a podium on the
  ladder.
- Local note: walkthroughs created test accounts (Ada, Bo…) in
  `apps/server/data` (a git-ignored PGlite database). Delete that folder for a
  clean local ladder.
- Tests: web 792, server 131, e2e 54/54.

Also built on 2026-09-28 (checked against the launch video in
`DemoVideo/Long-Video`, whose `scenes.js` is the script), **not yet committed**:
- **Drag and drop.** Tray gates drag onto the canvas (`stores/dragStore.ts`
  holds the drag; the canvas registers as a drop target and previews the
  landing span). A press under 5px is still a click, so pick-then-click and the
  keyboard grammar are unchanged. A dropped multi-wire gate lands whole
  (`lib/ir/drop.ts` `dropWires`: the dropped wire first, then down, else up, so a
  CNOT dropped on the bottom wire is upside down, as in the video).
  `circuitStore.dropGate` / `rewireGate`: dragging one end of a multi-wire gate
  re-wires only that end, and onto another of its own wires swaps roles (a
  dragged control dot flips a CNOT). The connector line moves the whole gate.
  `moveGate` no longer records no-op moves (it used to add an undo entry per
  pointer move). Canvas props: `onDrop`, `onRewire`, wired in all five hosts.
- **The code writes itself.** `CodePanel` flashes the lines a canvas edit
  wrote and marks the lines of tutor-highlighted gates (`highlighted` prop;
  `lib/render/diff.ts` finds lines by text diff, so all five dialects work).
- `next.config.ts` has `allowedDevOrigins: ["*.trycloudflare.com"]` so
  `next dev` can be shared through a Cloudflare quick tunnel. To share the
  arena too, tunnel port 4000 as well and start the web app with
  `NEXT_PUBLIC_ARENA_URL=wss://<api-tunnel>`.
- **The rest of the launch-video gaps.**
  - `lib/sim/describe.ts` `describeState`: a state as a ket, global phase
    dropped, the common factor pulled out ("(|00⟩ + |11⟩) / √2"), and named when
    it has a name (|±⟩, |±i⟩, the four Bell pairs, GHZ, W, even superposition,
    basis states). The author page shows it above the target histogram
    ("Bell pair |Φ⁺⟩, worked out from your circuit."), and palette gates the
    answer doesn't use are tagged "decoy".
  - `lib/tutor/replay.ts` `attemptHighlights`: re-runs the simulator and rules
    on a stored attempt (preferring the stored `ruleId`), so the teacher's
    attempt viewer rings the same gate the learner saw.
  - Tutor `verified` NDJSON event (`{ t: "verified", claims }`), sent before
    `done` when a model answer passed both checks. `ClaimChecker.checked`
    counts the confirmed claims. The dock shows "✓ N claims checked against
    the simulator", or "✓ passed the physics firewall" when there were none.
    Guide answers don't get it, because they aren't model text.
- **Digital library, "Coming soon"** section on the landing page (journals,
  video references, sources gathered in one place), at a teammate's request
  for the pitch. It's planned, not built: dashed cards, no links except the
  existing glossary. No journal is named, because that would imply
  partnerships we don't have.
- Landing page: the hero instrument's glow no longer causes sideways scroll
  below 1000px (it did at every phone width).
- Team name corrected to **Quantum Latte** everywhere (the app footer, README,
  docs 00–05).
- Tests: web 830 (`drag`, `describe`, `replay`, `ket` and new tutor-gemini
  cases), e2e 59/59 (checks for drag, Ket watching (lesson) and pointing, no
  Ket on the bench, Meet Ket, and the system theme).

Built on 2026-09-29, **not yet committed** (the start of the roadmap from the
competitor research: algorithms first):
- **Unit 4 "Interference computes"** (`lib/curriculum/nodes.ts`):
  - u4.n1 kickback.
  - u4.n2 Deutsch.
  - u4.n3 Deutsch–Jozsa (2 bits).
  - u4.n4 Bernstein–Vazirani (3-bit secret, 4 qubits).
  - Four glossary terms: phase kickback, oracle, query, balanced function.
  - Study packs, track framings, precached offline (`sw.js` VERSION v2).
  - Its own colour, `--unit-4`; unit colours now cycle `% 5`.
  - Toffoli moves to "unlocks in u6", CRX/CRY/CRZ to u7.
- **The oracle box** (`lib/curriculum/oracle.ts`), with **no IR change**:
  - The box's contents are ordinary gates with `oracle:` ids; a lesson's own
    gates (the helper's X,H) are `fixed:`. `isLocked()` covers both, and
    `circuitStore` refuses to move, remove, rewire or re-parameterise them.
  - The store's `reserved` columns (set by LessonPlayer, cleared by
    setCircuit) keep learner gates out of the box: `slotOpen`/`nextOpenColumn`
    in `lib/ir/drop.ts`. A gate dropped or typed inside lands after the box.
  - **A node passes only if one circuit is right for every variant (f₁–f₄):**
    `oracleResults`/`oracleMiss`, with the card "right for this f · not for
    all".
  - The canvas draws the box sealed (`box` prop); its screen-reader summary
    says the box is sealed too.
  - The lesson shows the f₁–f₄ chips with ✓/✗ from each run, and the pass
    screen shows "What the box hid".
  - Locked nodes hide code apply and the single-function "shorter circuit"
    advice. Par and records count only learner gates (`learnerGateCount`).
  - The tutor drops findings that name a locked gate.
- Tests:
  - `tests/algorithms.test.ts` checks the physics from first principles:
    Deutsch over all 4 functions, Deutsch–Jozsa over all 8 two-bit
    constant/balanced functions, Bernstein–Vazirani over all 8 secrets, and
    each box's truth table against its reveal.
  - `solvable.test.ts` searches oracle nodes across every split around the
    box and all variants. Nodes with par > 4 must carry a `reference`, which
    is verified at its real columns.
  - Whole-path tests seed through the last unit, not "u3".
  - Totals: web 883, server 131, e2e 60/60.

## What is left

The roadmap order (the user's call: "you decide"):
1. **More algorithms:** U5 protocols (superdense coding, teleportation, done
   by deferred measurement since the IR has no classical control) and U6
   Grover (the Toffoli and multi-controlled Z; this lets rule L06 fire).
   Consider a "build the box" node, where the learner writes the oracle.
2. **Live classroom mode** (Kahoot/Quizlet Live/Desmos): join code, teacher
   pacing and pause, anonymised projection, team race. Reuse the arena's WS.
3. **Predict before you run** (Ket asks) and **partly-built circuits to finish**
   (faded worked examples) inside lessons.
4. **"Run on a real quantum computer"** with the learner's own free IBM Open
   Plan token (10 min / 28 days), comparing hardware with the simulator.
5. **Friends and friend streaks**, then **Hindi via Bhashini**. The physics
   firewall is English-only, so translated tutor text needs a plan.

Also buildable:
- i18n: move the remaining screens onto `t()`, one at a time.
- The optional onboarding placement check. The density grid is limited to 4 wires.
- The seeded demo cohort on `/teach` has no per-student attempts to open (the
  video's "Aarav, attempt 3"); the attempt viewer needs a live class.

Needs people or outside services:
- Videos **V05–V14** (NotebookLM exports → `video-src/` → encode script). See docs/05.
- Roster CSV import with emailed invites (needs an email service).
- SDK-backed execution (Aer/Cirq/PennyLane sandbox), RAG over SDK docs, Redis
  for more than one server instance.

Ops for the user: rotate the Gemini key that was pasted in chat; confirm the
Vercel and Render env vars are set as above.
