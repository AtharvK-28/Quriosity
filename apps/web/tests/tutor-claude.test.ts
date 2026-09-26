/**
 * The tutor route's Claude path, against a scripted stand-in for the SDK.
 *
 * With no key on a dev machine this path otherwise never runs. What it pins:
 * the request goes out shaped as the route documents, and every way the
 * service can fail still ends in an answer — the built-in guide's when nothing
 * had arrived yet, a note beside the partial text when something had.
 */

import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tutor/route";
import { emptyCircuit, type Circuit } from "@/lib/ir/types";
import { SYSTEM_PROMPT, TUTOR_MODEL } from "@/lib/tutor/prompt";
import type { TutorEvent } from "@/lib/tutor/protocol";

type Script = {
  deltas: string[];
  stopReason: string;
  failBefore?: Error;
  failAfter?: Error;
};

type SentParams = {
  model: string;
  fallbacks: unknown;
  betas: string[];
  output_config: unknown;
  system: unknown;
  messages: { role: string; content: string }[];
};

const fake = vi.hoisted(() => ({
  script: { deltas: [], stopReason: "end_turn" } as Script,
  calls: [] as unknown[],
  aborts: 0,
}));

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  // A subclass keeps the real error classes, which the route tells apart
  // with instanceof.
  class ScriptedAnthropic extends actual.default {
    override beta = {
      messages: {
        stream: (params: unknown) => {
          fake.calls.push(params);
          const s = fake.script;
          let aborted = false;
          return {
            async *[Symbol.asyncIterator]() {
              if (s.failBefore) throw s.failBefore;
              for (const text of s.deltas) {
                if (aborted) return;
                yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } };
              }
              if (s.failAfter) throw s.failAfter;
            },
            done: async () => {},
            abort: () => {
              aborted = true;
              fake.aborts += 1;
            },
            finalMessage: async () => ({ stop_reason: s.stopReason }),
          };
        },
      },
    } as unknown as InstanceType<typeof actual.default>["beta"];
  }
  return { ...actual, default: ScriptedAnthropic };
});

function bell(): Circuit {
  const c = emptyCircuit(2);
  c.gates.push({ id: "g1", type: "h", targets: [0], controls: [], params: [], column: 0 });
  c.gates.push({ id: "g2", type: "cx", targets: [1], controls: [0], params: [], column: 1 });
  return c;
}

// A fresh address per question, so the route's rate limiter never interferes.
let address = 0;

async function ask(question: string): Promise<TutorEvent[]> {
  address += 1;
  const res = await POST(
    new Request("http://localhost/api/tutor", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${address}` },
      body: JSON.stringify({
        where: { surface: "bench" },
        messages: [{ role: "user", content: question }],
        circuit: bell(),
      }),
    }),
  );
  expect(res.status).toBe(200);
  return (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as TutorEvent);
}

const textOf = (ev: TutorEvent[]) => ev.flatMap((e) => (e.t === "text" ? [e.v] : [])).join("");
const notesOf = (ev: TutorEvent[]) => ev.flatMap((e) => (e.t === "note" ? [e.v] : [])).join(" ");

describe("POST /api/tutor with a key", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    fake.calls.length = 0;
    fake.aborts = 0;
    // The route logs each failure; the assertions below are what matter.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  it("sends the request the route documents", async () => {
    fake.script = { deltas: ["Fine. "], stopReason: "end_turn" };
    await ask("What does my circuit do?");

    expect(fake.calls).toHaveLength(1);
    const sent = fake.calls[0] as SentParams;
    expect(sent.model).toBe(TUTOR_MODEL);
    expect(sent.fallbacks).toBe("default");
    expect(sent.betas).toContain("server-side-fallback-2026-07-01");
    expect(sent.output_config).toEqual({ effort: "low" });
    expect(sent.system).toEqual([{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
    // The circuit rides after the question, so the cached prefix never moves.
    const last = sent.messages[sent.messages.length - 1];
    expect(sent.messages[sent.messages.length - 2]).toEqual({ role: "user", content: "What does my circuit do?" });
    expect(last.role).toBe("system");
    expect(last.content).toContain("<circuit_context>");
  });

  it("streams Claude's answer, checked, and says Claude replied", async () => {
    fake.script = {
      deltas: ["The [[gate:h]] gate splits ", "q0 evenly. ", "Next, try [[gate:foo]]."],
      stopReason: "end_turn",
    };
    const ev = await ask("What does my circuit do?");

    expect(ev[0]).toMatchObject({ t: "meta", mode: "claude" });
    const text = textOf(ev);
    expect(text).toContain("The [[gate:h]] gate splits q0 evenly.");
    // An invented gate never becomes a chip.
    expect(text).not.toContain("[[gate:foo]]");
    expect(text).toContain("Next, try foo.");
    expect(notesOf(ev)).toBe("");
    expect(ev[ev.length - 1]).toEqual({ t: "done" });
  });

  it("answers from the guide, and says why, when the key is rejected before any text", async () => {
    fake.script = {
      deltas: [],
      stopReason: "end_turn",
      failBefore: Anthropic.APIError.generate(
        401,
        { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } },
        "invalid x-api-key",
        new Headers(),
      ),
    };
    const ev = await ask("What does the Hadamard gate do?");

    expect(ev[0]).toMatchObject({ t: "meta", mode: "guide" });
    expect(textOf(ev)).toContain("[[gate:h]]");
    expect(notesOf(ev)).toContain("the API key was rejected");
    expect(ev.some((e) => e.t === "error")).toBe(false);
    expect(ev[ev.length - 1]).toEqual({ t: "done" });
  });

  it("answers from the guide when Claude declines before saying anything", async () => {
    fake.script = { deltas: [], stopReason: "refusal" };
    const ev = await ask("What is superposition?");

    expect(ev[0]).toMatchObject({ t: "meta", mode: "guide" });
    expect(textOf(ev).length).toBeGreaterThan(0);
    expect(notesOf(ev)).toMatch(/Claude declined/);
  });

  it("keeps what arrived, and says the connection dropped, when it fails partway", async () => {
    fake.script = {
      deltas: ["Here is the first half. "],
      stopReason: "end_turn",
      failAfter: new Anthropic.APIConnectionError({ message: "socket hang up" }),
    };
    const ev = await ask("Explain entanglement.");

    expect(ev.filter((e) => e.t === "meta")).toEqual([expect.objectContaining({ mode: "claude" })]);
    expect(textOf(ev)).toBe("Here is the first half.");
    expect(notesOf(ev)).toMatch(/dropped partway/);
    expect(ev[ev.length - 1]).toEqual({ t: "done" });
  });

  it("notes a refusal that lands partway, without discarding the text before it", async () => {
    fake.script = { deltas: ["A partial answer. "], stopReason: "refusal" };
    const ev = await ask("Tell me more.");

    expect(ev[0]).toMatchObject({ t: "meta", mode: "claude" });
    // A normal end flushes the buffer, trailing space and all; the dock trims.
    expect(textOf(ev).trim()).toBe("A partial answer.");
    expect(notesOf(ev)).toMatch(/stopped partway/);
  });

  it("fills [[p:BITS]] from the simulator", async () => {
    fake.script = { deltas: ["Right now your circuit gives |00⟩ [[p:00]] of the time. "], stopReason: "end_turn" };
    const ev = await ask("What does my circuit do?");
    expect(textOf(ev)).toContain("|00⟩ 50% of the time");
    expect(textOf(ev)).not.toContain("[[p:");
  });

  it("withdraws an answer that contradicts the simulator, and shows the rule engine's reading", async () => {
    fake.script = {
      deltas: ["Your H on q0 is right. ", "Right now you get |01⟩ half the time. ", "More text that never arrives."],
      stopReason: "end_turn",
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ev = await ask("What does my circuit do?");
    const kinds = ev.map((e) => e.t);

    // The first sentence was true and went out; the second was not.
    expect(kinds.indexOf("retract")).toBeGreaterThan(kinds.indexOf("text"));
    const after = ev.slice(kinds.indexOf("retract") + 1);
    expect(after[0]).toMatchObject({ t: "meta", mode: "guide" });
    expect(textOf(after)).toMatch(/\|00⟩ 50% and \|11⟩ 50%/);
    expect(notesOf(ev)).toMatch(/withdrawn/);
    expect(textOf(ev)).not.toContain("never arrives");
    expect(fake.aborts).toBe(1);
  });

  it("withdraws an answer that puts a gate where there is none", async () => {
    fake.script = { deltas: ["The X on q1 is flipping it. "], stopReason: "end_turn" };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ev = await ask("Why is my circuit wrong?");

    // Nothing had gone out yet, so there is nothing to retract.
    expect(ev.some((e) => e.t === "retract")).toBe(false);
    expect(ev[0]).toMatchObject({ t: "meta", mode: "guide" });
    expect(notesOf(ev)).toMatch(/withdrawn/);
  });

  it("firewalls an answer that breaks physics, and answers with the law instead", async () => {
    fake.script = {
      deltas: [
        "Your circuit entangles q0 and q1. ",
        "That means measuring q0 lets you send a message to q1 faster than light. ",
        "More text that never arrives.",
      ],
      stopReason: "end_turn",
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ev = await ask("What can I do with this?");
    const kinds = ev.map((e) => e.t);

    expect(kinds).toContain("retract");
    const after = ev.slice(kinds.indexOf("retract") + 1);
    expect(after[0]).toMatchObject({ t: "meta", mode: "guide" });
    expect(textOf(after)).toMatch(/nothing travels faster than light/);
    expect(notesOf(ev)).toMatch(/physics firewall/);
    expect(notesOf(ev)).toMatch(/faster-than-light/);
    expect(textOf(ev)).not.toContain("never arrives");
    expect(fake.aborts).toBe(1);
  });

  it("firewalls a wrong gate action by working out the matrix", async () => {
    fake.script = { deltas: ["The [[gate:h]] gate maps |0⟩ to |1⟩, which is why. "], stopReason: "end_turn" };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ev = await ask("What does H do?");
    expect(textOf(ev)).toMatch(/Hadamard sends \|0⟩ to \|\+⟩, not \|1⟩/);
    expect(notesOf(ev)).toMatch(/gate algebra/);
  });

  it("stops a runaway answer at the word cap", async () => {
    fake.script = {
      deltas: Array.from({ length: 40 }, () => "This sentence has exactly seven words here. "),
      stopReason: "end_turn",
    };
    const ev = await ask("Tell me everything.");
    expect(textOf(ev).trim().split(/\s+/).length).toBeLessThanOrEqual(180);
    expect(notesOf(ev)).toMatch(/short/);
    expect(fake.aborts).toBe(1);
  });
});
