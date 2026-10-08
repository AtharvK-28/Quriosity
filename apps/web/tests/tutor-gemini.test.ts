/**
 * The tutor route's Gemini path, against a scripted stand-in for Google's
 * streaming endpoint — and the LaTeX rewrite that keeps any model's notation
 * inside what the physics firewall can read.
 *
 * What these pin: Gemini only answers when there is no Claude key; the circuit
 * rides in the system instruction, where learner text cannot pose as it; its
 * text goes through the same claim check and firewall as Claude's; an
 * overloaded model falls back to Flash-Lite before anything is said; and every
 * failure still ends in an answer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tutor/route";
import { plainMath } from "@/lib/tutor/guard";
import { emptyCircuit, type Circuit } from "@/lib/ir/types";
import type { TutorEvent } from "@/lib/tutor/protocol";

describe("LaTeX becomes plain notation", () => {
  it("rewrites kets, fractions, roots and Greek letters", () => {
    expect(plainMath("$|0\\rangle$ goes to $$\\frac{|0\\rangle + |1\\rangle}{\\sqrt{2}}$$"))
      .toBe("|0⟩ goes to (|0⟩ + |1⟩)/(√2)");
    expect(plainMath("$\\ket{+}$ and $\\bra{0}$")).toBe("|+⟩ and ⟨0|");
    expect(plainMath("a phase $e^{i\\phi}$ of $\\pi/4$, $\\theta$")).toBe("a phase e^{iφ} of π/4, θ");
    expect(plainMath("H$^\\dagger$ and $A \\otimes B$")).toBe("H^† and A ⊗ B");
  });

  it("leaves plain text alone", () => {
    const plain = "Your circuit gives |00⟩ half the time and |11⟩ the rest.";
    expect(plainMath(plain)).toBe(plain);
  });
});

/* -- The route, with Google's endpoint scripted ------------------------------ */

type Reply = { status: number; chunks?: string[]; finishReason?: string; body?: string };

const calls: Array<{ url: string; body: any }> = [];
let replies: Reply[] = [];

function sse(chunks: string[], finishReason = "STOP"): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const lines = chunks.map((text, i) =>
    `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }], role: "model" }, ...(i === chunks.length - 1 ? { finishReason } : {}) }] })}\r\n\r\n`,
  );
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(l));
      c.close();
    },
  });
}

function bell(): Circuit {
  const c = emptyCircuit(2);
  c.gates.push({ id: "g1", type: "h", targets: [0], controls: [], params: [], column: 0 });
  c.gates.push({ id: "g2", type: "cx", targets: [1], controls: [0], params: [], column: 1 });
  return c;
}

let address = 0;
async function ask(question: string): Promise<TutorEvent[]> {
  address += 1;
  const res = await POST(
    new Request("http://localhost/api/tutor", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.2.0.${address}` },
      body: JSON.stringify({ where: { surface: "bench" }, messages: [{ role: "user", content: question }], circuit: bell() }),
    }),
  );
  return (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as TutorEvent);
}

const textOf = (ev: TutorEvent[]) => ev.flatMap((e) => (e.t === "text" ? [e.v] : [])).join("");
const notesOf = (ev: TutorEvent[]) => ev.flatMap((e) => (e.t === "note" ? [e.v] : [])).join(" ");

describe("POST /api/tutor with a Gemini key", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.GEMINI_MODEL;
    calls.length = 0;
    replies = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      const r = replies.shift() ?? { status: 200, chunks: ["Fine."] };
      if (r.status !== 200) return new Response(r.body ?? "{}", { status: r.status });
      return new Response(sse(r.chunks ?? [], r.finishReason), { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.GEMINI_API_KEY;
    vi.restoreAllMocks();
  });

  it("streams Gemini's answer, says Gemini replied, and sends the key only in a header", async () => {
    replies = [{ status: 200, chunks: ["The [[gate:h]] gate spreads q0 evenly. ", "Then the CNOT links the pair."] }];
    const ev = await ask("What does my circuit do?");
    expect(ev[0]).toMatchObject({ t: "meta", mode: "gemini" });
    expect(textOf(ev)).toContain("[[gate:h]]");
    expect(calls[0].url).toContain("/gemini-2.5-flash:streamGenerateContent?alt=sse");
    expect(calls[0].url).not.toContain("test-gemini-key");
  });

  it("puts the circuit in the system instruction, not in the learner's turn", async () => {
    await ask("What does my circuit do?");
    const body = calls[0].body;
    expect(body.systemInstruction.parts[0].text).toContain("<circuit_context>");
    expect(JSON.stringify(body.contents)).not.toContain("<circuit_context>");
    expect(body.contents.at(-1)).toEqual({ role: "user", parts: [{ text: "What does my circuit do?" }] });
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it("firewalls a wrong law, even when Gemini writes it in LaTeX", async () => {
    replies = [{ status: 200, chunks: ["Your pair is entangled. ", "The $H$ gate maps $|0\\rangle$ to $|1\\rangle$, which is why. "] }];
    const ev = await ask("What does H do?");
    expect(ev.some((e) => e.t === "retract")).toBe(true);
    expect(textOf(ev.slice(ev.findIndex((e) => e.t === "retract") + 1))).toMatch(/Hadamard sends \|0⟩ to \|\+⟩, not \|1⟩/);
    expect(notesOf(ev)).toMatch(/physics firewall/);
  });

  it("withdraws a claim about the circuit that the simulator does not back", async () => {
    replies = [{ status: 200, chunks: ["Right now you get |01⟩ half the time. "] }];
    const ev = await ask("What does my circuit do?");
    expect(notesOf(ev)).toMatch(/withdrawn/);
  });

  it("says an answer passed, and how many of its claims the simulator confirmed", async () => {
    replies = [{ status: 200, chunks: ["Right now you get |00⟩ half the time ", "and |11⟩ half the time. "] }];
    const ev = await ask("What does my circuit do?");
    const verified = ev.find((e) => e.t === "verified");
    expect(verified).toEqual({ t: "verified", claims: 2 });
    expect(ev.findIndex((e) => e.t === "verified")).toBe(ev.length - 2);
    expect(ev.at(-1)).toEqual({ t: "done" });
  });

  it("still says so when the answer made no claim about the circuit, since the firewall read it", async () => {
    replies = [{ status: 200, chunks: ["A CNOT flips its target when its control is 1. "] }];
    expect((await ask("What is a CNOT?")).find((e) => e.t === "verified")).toEqual({ t: "verified", claims: 0 });
  });

  it("never says a withdrawn answer passed", async () => {
    replies = [{ status: 200, chunks: ["Right now you get |01⟩ half the time. "] }];
    expect((await ask("What does my circuit do?")).some((e) => e.t === "verified")).toBe(false);
  });

  it("falls back to Flash-Lite when the first model is overloaded", async () => {
    replies = [{ status: 503, body: '{"error":{"code":503}}' }, { status: 200, chunks: ["Fine from the fallback."] }];
    const ev = await ask("Explain the Hadamard gate");
    expect(calls.map((c) => c.url.match(/models\/([^:]+)/)![1])).toEqual(["gemini-2.5-flash", "gemini-3.5-flash-lite"]);
    expect(ev[0]).toMatchObject({ t: "meta", mode: "gemini" });
    // The lite model rejects a zero thinking budget, so it is sent without one.
    expect(calls[1].body.generationConfig.thinkingConfig).toBeUndefined();
  });

  it("moves on from a quota error or a withdrawn model too", async () => {
    replies = [{ status: 429, body: '{"error":{"code":429}}' }, { status: 200, chunks: ["Fine."] }];
    expect((await ask("Explain the Hadamard gate"))[0]).toMatchObject({ t: "meta", mode: "gemini" });
    calls.length = 0;
    replies = [{ status: 404, body: '{"error":{"code":404}}' }, { status: 200, chunks: ["Fine."] }];
    expect((await ask("Explain the Hadamard gate"))[0]).toMatchObject({ t: "meta", mode: "gemini" });
  });

  it("says so plainly when every model is over quota", async () => {
    replies = [{ status: 429, body: "{}" }, { status: 429, body: "{}" }];
    const ev = await ask("Explain the Hadamard gate");
    expect(ev[0]).toMatchObject({ t: "meta", mode: "guide" });
    expect(notesOf(ev)).toMatch(/over its per-minute quota/);
  });

  it("answers from the guide, and says why, when the key is rejected", async () => {
    replies = [{ status: 400, body: '{"error":{"message":"API key not valid."}}' }];
    const ev = await ask("Explain the Hadamard gate");
    expect(ev[0]).toMatchObject({ t: "meta", mode: "guide" });
    expect(notesOf(ev)).toMatch(/Gemini API key was rejected/);
  });

  it("answers from the guide when Gemini declines", async () => {
    replies = [{ status: 200, chunks: [""], finishReason: "SAFETY" }];
    const ev = await ask("Explain the Hadamard gate");
    expect(ev[0]).toMatchObject({ t: "meta", mode: "guide" });
    expect(notesOf(ev)).toMatch(/Gemini declined/);
  });

  it("honours GEMINI_MODEL", async () => {
    process.env.GEMINI_MODEL = "gemini-3.8-flash";
    await ask("Explain the Hadamard gate");
    expect(calls[0].url).toContain("/gemini-3.8-flash:");
  });

  it("prefers Claude when both keys are set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    // The Claude path uses the Anthropic SDK, not this fetch stub; all that
    // matters here is that Google is never called.
    await ask("Explain the Hadamard gate").catch(() => []);
    expect(calls.filter((c) => c.url.includes("googleapis"))).toHaveLength(0);
    delete process.env.ANTHROPIC_API_KEY;
  });
});
