/**
 * Screenshots of every key surface, in the states that matter.
 *
 * Not a test — a way to look at the product without clicking through it, and to
 * check the density discipline is actually holding on screen rather than only
 * in the CSS.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SHOT_DIR ?? "shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 940 },
  deviceScaleFactor: 2,
});

async function shot(name, { full = false } = {}) {
  await page.waitForTimeout(350);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  console.log(`  ${file}`);
}

/* 1. Landing */
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("text=A wrong circuit should tell you");
await shot("01-landing");

/* 2. Mode selection */
await page.goto(`${BASE}/start`, { waitUntil: "networkidle" });
await shot("02-modes");

/* 3. The path */
await page.goto(`${BASE}/path`, { waitUntil: "networkidle" });
await shot("03-path", { full: true });

/* 4. Lesson — the brief beat. One claim, one target, no canvas. The mastery
   gate refuses a fresh session that jumps to Unit 3, so earn the way there. */
await page.goto(`${BASE}/path?seed=u3.n3`, { waitUntil: "networkidle" });
await page.waitForTimeout(250);
await page.goto(`${BASE}/lesson/u3.n3`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Build a pair that always agrees");
await shot("04-lesson-brief");

/* 5. Lesson — the money shot. H placed, CNOT omitted, diagnosis up. */
await page.getByRole("button", { name: "Build it" }).click();
await page.waitForSelector('[role="application"]');
await page.getByRole("button", { name: /^Hadamard ·/ }).click();
await page.getByRole("button", { name: "qubit 0, column 0, empty" }).click();
await page.getByRole("button", { name: /^Run/ }).click();
await page.waitForSelector("text=/still separable/i");
await shot("05-diagnosis");

/* 6. Lesson — the pass beat. */
await page.getByRole("button", { name: /Add CNOT/ }).click();
await page.getByRole("button", { name: /^Run/ }).click();
await page.waitForSelector("text=/The multiplication fails/i");
await shot("06-pass", { full: true });

/* 7. The bench, mid-scrub, with a Bell state on it. */
await page.goto(`${BASE}/build`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Hadamard ·/ }).click();
await page.getByRole("button", { name: "qubit 0, column 0, empty" }).click();
await page.getByRole("button", { name: /^CNOT ·/ }).click();
await page.getByRole("button", { name: "qubit 0, column 1, empty" }).click();
await page.getByRole("button", { name: /target of this CNOT on qubit 1/ }).click();
await page.getByRole("button", { name: /^Run/ }).click();
await page.waitForTimeout(500);
await shot("07-bench");

/* 8. The bench showing the Bloch view — entangled qubits at the centre. */
await page.getByRole("tab", { name: "Bloch" }).click();
await shot("08-bench-bloch");

/* 9. Gate reference */
await page.goto(`${BASE}/reference`, { waitUntil: "networkidle" });
await shot("09-reference");

/* 11. The tutor, docked beside the Bell state on the bench. */
await page.goto(`${BASE}/build`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Ask Ket/ }).click();
await page.getByLabel("Your question").fill("What does my circuit do?");
await page.keyboard.press("Enter");
await page.waitForSelector("text=/built-in guide|claude/i", { timeout: 30000 });
await page.waitForFunction(
  () => !document.querySelector('[aria-label="The tutor is thinking"]'),
  null,
  { timeout: 60000 },
);
await shot("11-tutor");
await page.keyboard.press("Control+/");

/* 12. The playground, after a Hadamard and a hundred fresh copies. */
await page.goto(`${BASE}/playground`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Apply Hadamard" }).click();
await page.getByRole("button", { name: "Measure 100 copies" }).click();
await shot("12-playground", { full: true });

/* 13. The same bench in the day theme, for comparison. */
await page.goto(`${BASE}/build`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Switch to day/ }).click();
await shot("13-bench-day");
await page.getByRole("button", { name: /Switch to night/ }).click();

/* 10. Mobile — the path and lessons work; the bench says so honestly. */
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await mobile.goto(`${BASE}/path`, { waitUntil: "networkidle" });
await mobile.waitForTimeout(350);
await mobile.screenshot({ path: path.join(OUT, "10-mobile-path.png"), fullPage: true });
console.log(`  ${path.join(OUT, "10-mobile-path.png")}`);

await browser.close();
console.log("\ndone");
