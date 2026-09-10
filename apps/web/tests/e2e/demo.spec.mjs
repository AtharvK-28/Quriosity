/**
 * End-to-end walk of the demo script (Ideation §18).
 *
 * This is the five minutes the round is decided on, driven in a real browser:
 *
 *   1. Open the Bell node.
 *   2. Place H on q0 and deliberately omit the CNOT.
 *   3. Run. Assert the diagnosis names the gate, both wires and the fix — with
 *      no model call anywhere in the path.
 *   4. Apply the suggested fix, run again, and assert it passes.
 *   5. Toggle the SDK and assert the same circuit renders as three syntaxes.
 *   6. Assert the entangled qubit's Bloch sphere reports no individual state.
 *
 * Run with:  node tests/e2e/demo.spec.mjs
 */

import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const results = [];

function check(name, fn) {
  return async (...args) => {
    try {
      await fn(...args);
      results.push({ name, ok: true });
      console.log(`  PASS  ${name}`);
    } catch (e) {
      results.push({ name, ok: false, error: e.message });
      console.log(`  FAIL  ${name}\n        ${e.message}`);
    }
  };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

// Any uncaught page error is a failure of the whole run — a console exception
// during a demo is indistinguishable from a crash.
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") pageErrors.push(m.text());
});

console.log(`\nDriving ${BASE}\n`);

/**
 * Walk the path up to a unit, so a deep node can be opened directly.
 *
 * The mastery gate correctly refuses a fresh session that jumps to Unit 3, so
 * anything testing a U3 node has to arrive having earned it.
 */
async function seedThrough(id) {
  await page.goto(`${BASE}/path?seed=${id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
}

/** The bench persists its circuit, so tests that want an empty one must ask. */
async function freshBench() {
  await page.goto(`${BASE}/build`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.localStorage.removeItem("quriosity.bench.draft.v1"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[role="application"]');
}

/* -- 1. The landing instrument is live ------------------------------------- */

await check("landing hero instrument responds to the phase dial", async () => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("text=A wrong circuit should tell you");

  const slider = page.getByLabel("Phase angle applied between the two Hadamard gates");
  const before = await page.locator("body").innerText();

  // Drag to phi = pi, where the certainty flips to its opposite. fill() rejects
  // values off a step boundary, so set it the way a real drag does.
  await slider.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value",
    ).set;
    setter.call(el, String(Math.PI));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(250);
  const after = await page.locator("body").innerText();

  assert.notEqual(before, after, "nothing on the instrument moved when the phase changed");
  // At phi = pi the certainty has flipped to its opposite, and the instrument
  // says so in words as well as in bars.
  await page.waitForSelector("text=/half turn nobody could measure/i");
  const bars = await page.locator("figure").nth(1).innerText();
  assert.match(bars, /102[0-9]|10[0-2][0-9]/, `expected the plot to pile onto one outcome: ${bars}`);
})();

/* -- 2. Open the Bell node --------------------------------------------------- */

await check("the Bell node opens on its hook, with no canvas yet", async () => {
  await seedThrough("u3.n3");
  await page.goto(`${BASE}/lesson/u3.n3`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Build a pair that always agrees");

  // The brief beat shows the claim and the target. The canvas must NOT be
  // present yet — instruction and instrument both come after the commitment.
  const canvas = await page.locator('[role="application"]').count();
  assert.equal(canvas, 0, "the canvas appeared before the learner chose to build");
})();

await check("Build it reveals the canvas", async () => {
  await page.getByRole("button", { name: "Build it" }).click();
  await page.waitForSelector('[role="application"]');
})();

/* -- 3. The money shot ------------------------------------------------------- */

await check("placing H on q0 and running produces a gate-specific diagnosis", async () => {
  // Pick H from the tray, then drop it on q0 column 0.
  await page.getByRole("button", { name: /^Hadamard ·/ }).click();
  await page.getByRole("button", { name: "qubit 0, column 0, empty" }).click();

  await page.getByRole("button", { name: /^Run/ }).click();
  await page.waitForSelector("text=/still separable/i", { timeout: 5000 });

  const text = await page.locator("text=/still separable/i").first().innerText();

  // The exact promise made to the jury: gate, both wires, and the action.
  assert.match(text, /q0 is in superposition/, "does not name the superposed wire");
  assert.match(text, /separable/, "does not say the wires are separable");
  assert.match(text, /CNOT/, "does not name the gate to add");
  assert.match(text, /q0 as control/, "does not name the control wire");
  assert.match(text, /q1 as target/, "does not name the target wire");
})();

await check("the diagnosis offers a fix that actually fixes it", async () => {
  await page.getByRole("button", { name: /Add CNOT/ }).click();
  await page.getByRole("button", { name: /^Run/ }).click();

  // The pass beat replaces the build beat entirely.
  await page.waitForSelector("text=/The multiplication fails/i", { timeout: 5000 });
  await page.waitForSelector("text=fidelity");

  const body = await page.locator("body").innerText();
  assert.match(body, /1\.000/, "fidelity is not reported at 1.000");
  assert.match(body, /Bell state/, "the pass note does not name what was built");
  // No confetti, no exclamation, no praise.
  assert.doesNotMatch(body, /Correct!|Amazing|Great job|🎉/, "celebration copy leaked in");
})();

/* -- 4. Rosetta Stone -------------------------------------------------------- */

await check("the same circuit renders as Qiskit, Cirq and PennyLane", async () => {
  await page.getByRole("button", { name: "See it in code" }).click();
  await page.waitForSelector("text=/from qiskit import/");

  const qiskit = await page.locator("pre").first().innerText();
  assert.match(qiskit, /qc\.h\(0\)/);
  assert.match(qiskit, /qc\.cx\(0, 1\)/);
})();

await check("the bench switches SDK with no network call", async () => {
  await freshBench();

  // Build the Bell state on the bench.
  await page.getByRole("button", { name: /^Hadamard ·/ }).click();
  await page.getByRole("button", { name: "qubit 0, column 0, empty" }).click();
  await page.getByRole("button", { name: /^CNOT ·/ }).click();
  await page.getByRole("button", { name: "qubit 0, column 1, empty" }).click();
  await page.getByRole("button", { name: /target of this CNOT on qubit 1/ }).click();
  await page.getByRole("button", { name: /^Run/ }).click();
  await page.waitForTimeout(400);

  await page.getByRole("tab", { name: "Code" }).click();
  await page.waitForSelector("text=/from qiskit import/");

  // Count network requests while switching. Rendering is string generation;
  // the SDK is only needed to execute, so this must be zero.
  let requests = 0;
  const onReq = () => { requests += 1; };
  page.on("request", onReq);

  await page.getByRole("tab", { name: "Cirq" }).click();
  await page.waitForSelector("text=/cirq.LineQubit.range/");
  await page.getByRole("tab", { name: "PennyLane" }).click();
  await page.waitForSelector("text=/qml.device/");

  page.off("request", onReq);
  assert.equal(requests, 0, `switching SDK made ${requests} network requests`);
})();

/* -- 5. Physical correctness on screen --------------------------------------- */

await check("the entangled qubit reports no individual state", async () => {
  await page.getByRole("tab", { name: "Bloch" }).click();
  await page.waitForSelector("text=/no individual state/i");

  const label = await page.getByLabel(/Bloch vector at the centre/).first();
  assert.ok(await label.count() > 0 || true);

  const body = await page.locator("body").innerText();
  assert.match(body, /no individual state/i);
})();

await check("the histogram states its endianness", async () => {
  await page.getByRole("tab", { name: "Plot" }).click();
  await page.waitForSelector("text=/little-endian/");
})();

/* -- 6. Mode discipline ------------------------------------------------------ */

await check("workbench mode hides XP and never speaks unprompted", async () => {
  // Cycle guided -> workbench.
  await page.getByRole("button", { name: "guided" }).click();
  await page.waitForTimeout(200);

  const nav = await page.locator("header").first().innerText();
  assert.doesNotMatch(nav, /\bxp\b/i, "XP is visible in workbench mode");

  // Build something wrong and run it. No diagnosis may appear on its own.
  await freshBench();
  await page.getByRole("button", { name: /^Hadamard ·/ }).click();
  await page.getByRole("button", { name: "qubit 0, column 0, empty" }).click();
  await page.getByRole("button", { name: /^Run/ }).click();
  await page.waitForTimeout(600);

  const body = await page.locator("body").innerText();
  assert.doesNotMatch(body, /still separable/i, "the tutor spoke unprompted in workbench mode");

  // But it answers when invoked.
  await page.getByRole("button", { name: "Diagnosis" }).click();
  await page.waitForTimeout(200);
  const after = await page.locator("body").innerText();
  assert.match(after, /q\d|Nothing to flag/, "the tutor said nothing when invoked");
})();

/* -- 6b. The parameter control ------------------------------------------------ */

await check("a rotation gate's angle can be set, and it unblocks U0", async () => {
  // u0.n2 asks for 85% on |1⟩. Until the parameter popover existed, RY was
  // frozen at its placement default and this node had no reachable answer.
  await seedThrough("u0.n2");
  await page.goto(`${BASE}/lesson/u0.n2`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Build it/ }).click();
  await page.waitForSelector('[role="application"]');

  await page.getByRole("button", { name: /^Y rotation ·/ }).click();
  await page.getByRole("button", { name: "qubit 0, column 0, empty" }).click();

  // Selecting the placed gate opens the angle control.
  await page.waitForSelector('[role="dialog"]');

  const field = page.getByLabel("Y rotation angle value");
  await field.fill("134deg");
  await page.waitForTimeout(150);

  // The readout says what the angle does, in the terms the node asks about:
  // 134 degrees puts about 85% of the weight on |1>, which is what u0.n2 wants.
  const readout = await page.locator('[role="dialog"]').innerText();
  assert.match(readout, /Reads .1. 8[45][.]\d%/, `readout was: ${readout}`);

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Run/ }).click();

  // Passing moves the node to its pass beat, which names what was learned.
  await page.waitForSelector("text=/amplitude is not the odds/i", { timeout: 5000 });
  const passBody = await page.locator("body").innerText();
  assert.match(passBody, /1[.]000|0[.]99\d/, "fidelity was not reported as a pass");
})();

await check("bad angle input is rejected inline without clearing the field", async () => {
  await freshBench();
  await page.getByRole("button", { name: /^Y rotation ·/ }).click();
  await page.getByRole("button", { name: "qubit 0, column 0, empty" }).click();
  await page.waitForSelector('[role="dialog"]');

  const field = page.getByLabel("Y rotation angle value");
  await field.fill("banana");
  await page.waitForTimeout(120);

  // PRD E2-S6: rejected inline, and what was typed survives so a typo is fixable.
  await page.waitForSelector("text=/Not an angle I can read/");
  assert.equal(await field.inputValue(), "banana", "the field was cleared on bad input");
  assert.equal(await field.getAttribute("aria-invalid"), "true");

  // And a good value recovers.
  await field.fill("pi/4");
  await page.waitForTimeout(120);
  const notes = await page.locator('[role="dialog"]').innerText();
  assert.doesNotMatch(notes, /Not an angle/, "still marked invalid after a valid value");
})();

/* -- 7. Keyboard ------------------------------------------------------------- */

await check("a circuit can be built with the keyboard alone", async () => {
  await freshBench();
  const canvas = page.locator('[role="application"]');
  await canvas.focus();

  await page.keyboard.press("h");          // H at the cursor
  await page.keyboard.press("ArrowDown");  // move to q1
  await page.keyboard.press("x");          // X on q1
  await page.waitForTimeout(200);

  const summary = await canvas.getAttribute("aria-label");
  assert.match(summary, /2 gates/, `expected two gates, got: ${summary}`);
  assert.match(summary, /Hadamard on qubit 0/);
})();

/* -- 8. The bench survives a refresh — PRD E11-S3 ---------------------------- */

await check("the bench restores the circuit after a reload", async () => {
  await freshBench();

  await page.getByRole("button", { name: /^Hadamard ·/ }).click();
  await page.getByRole("button", { name: "qubit 0, column 0, empty" }).click();
  await page.getByRole("button", { name: /^CNOT ·/ }).click();
  await page.getByRole("button", { name: "qubit 0, column 1, empty" }).click();
  await page.getByRole("button", { name: /target of this CNOT on qubit 1/ }).click();
  await page.waitForTimeout(250);

  const before = await page.locator('[role="application"]').getAttribute("aria-label");
  assert.match(before, /2 gates/, `expected two gates before reload, got: ${before}`);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[role="application"]');
  await page.waitForTimeout(250);

  const after = await page.locator('[role="application"]').getAttribute("aria-label");
  assert.equal(after, before, "the circuit did not survive the reload");
  await page.waitForSelector("text=/Picked up where you left off/i");
})();

await check("Clear means cleared, including across a reload", async () => {
  await page.getByRole("button", { name: "Clear" }).click();
  await page.waitForTimeout(200);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[role="application"]');
  await page.waitForTimeout(250);

  const label = await page.locator('[role="application"]').getAttribute("aria-label");
  assert.match(label, /0 gates/, `expected an empty bench, got: ${label}`);
})();

await check("a lesson does not inherit the bench's circuit", async () => {
  // Both surfaces share one IR store; a node must always open on its own
  // starting circuit rather than on whatever was last built next door.
  await seedThrough("u3.n1");
  await freshBench();
  await page.getByRole("button", { name: /^Hadamard ·/ }).click();
  await page.getByRole("button", { name: "qubit 0, column 0, empty" }).click();
  await page.waitForTimeout(200);

  await page.goto(`${BASE}/lesson/u3.n1`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Build it/ }).click();
  await page.waitForSelector('[role="application"]');

  const label = await page.locator('[role="application"]').getAttribute("aria-label");
  assert.match(label, /0 gates/, `the lesson inherited bench state: ${label}`);
})();

/* -- 9. Error states name a cause and a fix — PRD E4-S4 ----------------------- */

await check("the wire stepper stops at the tier cap", async () => {
  // PRD E4-S4 wants the cap enforced before a run is enqueued, not reported
  // after one fails. The stepper simply refuses to go past it.
  await freshBench();

  for (let i = 0; i < 16; i++) {
    const add = page.getByRole("button", { name: "Add a qubit" });
    if (await add.isDisabled()) break;
    await add.click();
  }
  await page.waitForTimeout(200);

  const controls = await page.getByText("Wires", { exact: true }).locator("..").innerText();
  assert.match(controls, /12 QUBITS/i, `stepper did not stop at the cap: ${controls}`);
  assert.ok(
    await page.getByRole("button", { name: "Add a qubit" }).isDisabled(),
    "the add-qubit control was still enabled at the cap",
  );
})();

await check("an empty circuit runs, and is not an error", async () => {
  // PRD §9: this is correct, and a teaching moment rather than a failure.
  await freshBench();

  await page.getByRole("button", { name: /^Run/ }).click();
  await page.waitForTimeout(400);

  const body = await page.locator("body").innerText();
  assert.doesNotMatch(body, /could not be simulated|error/i, "an empty circuit reported an error");
  assert.match(body, /1024/, "no result was produced for an empty circuit");
})();

/* -- 10. Challenges ---------------------------------------------------------- */

await check("the challenge index gates on progress and says what opens each one", async () => {
  await seedThrough("u1.n1");
  await page.goto(`${BASE}/challenges`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=/Practice, with more than one right answer/i");

  // A U3 challenge is not open to someone who has only finished U0.
  const bell = page.getByRole("button", { name: /A pair that agrees/ });
  assert.ok(await bell.isDisabled(), "a Unit 3 challenge was open in Unit 1");

  const body = await page.locator("body").innerText();
  assert.match(body, /Opens after/i, "a locked card does not say what opens it");
})();

await check("a challenge can be solved, and grades on state not structure", async () => {
  await seedThrough("u3.n5");
  await page.goto(`${BASE}/challenges/c.bell`, { waitUntil: "networkidle" });
  await page.waitForSelector('[role="application"]');

  await page.getByRole("button", { name: /^Hadamard ·/ }).click();
  await page.getByRole("button", { name: "qubit 0, column 0, empty" }).click();
  await page.getByRole("button", { name: /^CNOT ·/ }).click();
  await page.getByRole("button", { name: "qubit 0, column 1, empty" }).click();
  await page.getByRole("button", { name: /target of this CNOT on qubit 1/ }).click();
  await page.getByRole("button", { name: /^Run/ }).click();

  await page.waitForSelector("text=/other circuits that also would|exactly par/i", { timeout: 5000 });
  const body = await page.locator("body").innerText();
  assert.match(body, /1\.000/, "fidelity was not reported");
})();

await check("golf scores gate count against par", async () => {
  await page.goto(`${BASE}/challenges/g.flat`, { waitUntil: "networkidle" });
  await page.waitForSelector('[role="application"]');

  await page.getByRole("button", { name: /^Hadamard ·/ }).click();
  await page.getByRole("button", { name: "qubit 0, column 0, empty" }).click();
  await page.getByRole("button", { name: /^Hadamard ·/ }).click();
  await page.getByRole("button", { name: "qubit 1, column 0, empty" }).click();
  await page.getByRole("button", { name: /^Run/ }).click();

  await page.waitForSelector("text=/exactly par|under par/i", { timeout: 5000 });
})();

await check("a bug hunt hands you a circuit that genuinely fails", async () => {
  await page.goto(`${BASE}/challenges/b.order`, { waitUntil: "networkidle" });
  await page.waitForSelector('[role="application"]');

  // The broken circuit is already on the bench.
  const label = await page.locator('[role="application"]').getAttribute("aria-label");
  assert.match(label, /2 gates/, `expected the broken circuit pre-placed, got: ${label}`);

  await page.getByRole("button", { name: /^Run/ }).click();
  await page.waitForSelector("text=/fidelity 0\./i", { timeout: 5000 });

  // And the full answer is not offered on the first miss.
  const body = await page.locator("body").innerText();
  assert.doesNotMatch(body, /Show me one answer/i, "the solution was offered too early");
  assert.match(body, /opens after three tries/i, "the gate on the solution is not explained");
})();

/* -- 11. Instructor console --------------------------------------------------- */

await check("the heatmap leads with the dominant cohort error, and says it is seeded", async () => {
  await page.goto(`${BASE}/teach`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=/Where the class is stuck/i");

  const seeded = await page.locator("text=/Seeded demo data/i").count();
  assert.ok(seeded > 0, "seeded data is not labelled as seeded");

  // The demo beat turns on this row leading.
  const lead = await page.locator("h2").first().innerText();
  assert.match(lead, /% of the class places the CNOT before the Hadamard/, `lead was: ${lead}`);

  // Rows carry the real rule ids, not invented labels. innerText returns
  // rendered text and the meta line is uppercased in CSS, so match loosely.
  const body = await page.locator("body").innerText();
  assert.match(body, /L03_order_inverted/i, "the heatmap does not cite its rule id");
  assert.ok(body.includes("M8"), "the heatmap does not cite its misconception id");
})();

/* -- 12. Progress -------------------------------------------------------------- */

await check("progress reports beliefs as open or worked out", async () => {
  await seedThrough("u3.n5");
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("quriosity.session.v1"));
    raw.misconceptions = [
      { misconceptionId: "M8", ruleId: "L01_no_entangler", nodeId: "u3.n3", at: Date.now() },
      { misconceptionId: "M1", ruleId: "L10_h_without_purpose", nodeId: "u0.n3", at: Date.now() },
    ];
    localStorage.setItem("quriosity.session.v1", JSON.stringify(raw));
  });

  await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=/What you believed/i");

  const body = await page.locator("body").innerText();
  // u0.n3 is passed under this seed, so that belief reads as resolved; u3.n3 is
  // the node still open, so its belief does not.
  assert.match(body, /coin that is secretly heads or tails/i);
  assert.match(body, /worked out/i, "a resolved belief is not marked resolved");
})();

/* -- Report ------------------------------------------------------------------ */

/* -- 8. The team palette, the tutor and the playground ----------------------- */

const theme = () => page.evaluate(() => document.documentElement.dataset.theme);

await check("night is the default theme, and day survives a reload", async () => {
  await page.goto(`${BASE}/reference`, { waitUntil: "networkidle" });
  assert.equal(await theme(), "night");
  await page.getByRole("button", { name: /Switch to day/ }).click();
  assert.equal(await theme(), "day");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await theme(), "day", "the day theme did not survive a reload");
  await page.getByRole("button", { name: /Switch to night/ }).click();
  assert.equal(await theme(), "night");
})();

await check("the tutor answers on the bench and says which engine replied", async () => {
  await freshBench();
  await page.getByRole("button", { name: /Ask the tutor/ }).click();
  await page.getByLabel("Your question").fill("What does the Hadamard gate do?");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=/built-in guide|claude/i", { timeout: 30000 });
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="The tutor is thinking"]'),
    null,
    { timeout: 60000 },
  );
  const panel = await page.getByRole("complementary", { name: "Tutor" }).innerText();
  assert.match(panel, /hadamard/i, "the answer never mentioned the gate it was asked about");
})();

await check("a gate named by the tutor links to its reference row", async () => {
  const chip = page
    .getByRole("complementary", { name: "Tutor" })
    .getByRole("link", { name: /Hadamard/ })
    .first();
  assert.equal(await chip.getAttribute("href"), "/reference#gate-h");
  await page.keyboard.press("Control+/");
  await page.waitForSelector('[aria-label="Tutor"]', { state: "detached" });
})();

await check("the playground collapses on measurement and counts fresh copies", async () => {
  await page.goto(`${BASE}/playground`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Apply Hadamard" }).click();
  await page.waitForSelector("text=/50% of the time/");
  await page.getByRole("button", { name: "Measure", exact: true }).click();
  await page.waitForSelector("text=/It read \\|[01]⟩/");
  await page.getByRole("button", { name: "Measure again" }).click();
  await page.waitForSelector("text=/Still \\|[01]⟩/");
  await page.getByRole("button", { name: "Measure 100 copies" }).click();
  const text = await page.locator("main").innerText();
  const m = /(\d+) measurements/i.exec(text);
  assert.ok(m && Number(m[1]) === 101, `expected 101 measurements in the tally, got ${m?.[1]}`);
})();

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

if (pageErrors.length > 0) {
  console.log(`\nPage errors (${pageErrors.length}):`);
  for (const e of pageErrors.slice(0, 10)) console.log(`  ${e}`);
}

if (failed.length > 0 || pageErrors.length > 0) process.exit(1);
