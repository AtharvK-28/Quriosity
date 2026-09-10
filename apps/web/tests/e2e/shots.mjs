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

/* 4. Lesson — the brief beat. One claim, one target, no canvas. */
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

/* 10. Mobile — the path and lessons work; the bench says so honestly. */
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await mobile.goto(`${BASE}/path`, { waitUntil: "networkidle" });
await mobile.waitForTimeout(350);
await mobile.screenshot({ path: path.join(OUT, "10-mobile-path.png"), fullPage: true });
console.log(`  ${path.join(OUT, "10-mobile-path.png")}`);

await browser.close();
console.log("\ndone");
