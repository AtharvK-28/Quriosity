/** Two browser windows, one match. Design Doc §14 demo-readiness, for real. */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = process.argv[2];
const browser = await chromium.launch();

const ctxA = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
const errs = [];
for (const [n, p] of [["A", A], ["B", B]]) p.on("pageerror", (e) => errs.push(n + ": " + e.message));

// Seed the session directly rather than driving the settings form. The name
// there only commits on submit, and this test is about the arena — coupling it
// to another screen's markup just gives it a second way to fail.
async function setName(ctx, name) {
  await ctx.addInitScript((n) => {
    try {
      const key = "quriosity.session.v1";
      const cur = JSON.parse(localStorage.getItem(key) || "{}");
      cur.displayName = n;
      localStorage.setItem(key, JSON.stringify(cur));
    } catch { /* private mode; the match still runs, just unnamed */ }
  }, name);
}

const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("quriosity.session.v1") || "{}").displayName);

await setName(ctxA, "Ada");
await setName(ctxB, "Bo");
console.log("stored names:", await stored(A), "/", await stored(B));

await A.goto(BASE + "/arena", { waitUntil: "networkidle" });
await B.goto(BASE + "/arena", { waitUntil: "networkidle" });
await A.waitForTimeout(1000);

await A.getByRole("button", { name: /Queue for a match/i }).click();
await A.waitForTimeout(300);
await B.getByRole("button", { name: /Queue for a match/i }).click();

await A.waitForSelector("text=/First correct answer wins/i", { timeout: 10000 });
await B.waitForSelector("text=/First correct answer wins/i", { timeout: 10000 });
console.log("both matched");

const bar = async (page) => (await page.locator("[class*=matchBar]").innerText()).replace(/\n/g, " ");
console.log("A match bar:", await bar(A));
console.log("B match bar:", await bar(B));

const oppBar = async (page) => (await page.locator("[class*=opponentBar]").innerText()).replace(/\n/g, " ");
console.log("A opponent bar before:", await oppBar(A));

await A.screenshot({ path: OUT + "/pvp-match.png" });

// A places a gate; B should see the count, never the circuit.
await A.getByRole("button", { name: /^Hadamard/ }).click();
await A.getByRole("button", { name: "qubit 0, column 0, empty" }).click();
await A.waitForTimeout(1500);
console.log("B opponent bar after A placed a gate:", await oppBar(B));

// Wait past the anti-cheat floor, then submit.
await A.waitForTimeout(1600);
await A.getByRole("button", { name: /^Submit/ }).click();
await A.waitForTimeout(1500);

const verdict = (t) =>
  /You got there first/.test(t) ? "won"
  : /They got there first/.test(t) ? "lost"
  : /Not yet/.test(t) ? "submitted, graded wrong"
  : /waiting on the result/.test(t) ? "accepted, awaiting result"
  : "still playing";

console.log("A:", verdict(await A.locator("body").innerText()));
console.log("B:", verdict(await B.locator("body").innerText()));

await A.screenshot({ path: OUT + "/pvp-a.png" });
await B.screenshot({ path: OUT + "/pvp-b.png" });
console.log("page errors:", errs.length ? errs.slice(0, 3) : "none");
await browser.close();
