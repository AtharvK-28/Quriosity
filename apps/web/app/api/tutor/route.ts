/**
 * POST /api/tutor — the tutor, streamed as NDJSON.
 *
 * Three engines behind one wire format. With ANTHROPIC_API_KEY set, Claude
 * answers; failing that, with GEMINI_API_KEY set, Gemini does — both grounded
 * in a server-built summary of the learner's circuit. With no key, or when the
 * service fails before saying anything, the built-in guide answers from the
 * rule engine and the platform's own content. The learner is told which one
 * replied; none is passed off as another.
 *
 * Whichever model writes, its text goes through the same guarded output:
 * sentence-buffered, filled from the simulator, checked against the circuit
 * (claims.ts) and against physics (firewall.ts). The checks read text, so
 * they hold for any model.
 *
 * Keys are read here, on the server, and never reach the browser.
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildContext, type CircuitContext } from "@/lib/tutor/context";
import { SentenceBuffer } from "@/lib/tutor/guard";
import { ClaimChecker, fillPlaceholders, type Contradiction } from "@/lib/tutor/claims";
import { firewall, type Violation } from "@/lib/tutor/firewall";
import {
  guideAnswer,
  physicsAnswer,
  relatedSources,
  retractionAnswer,
  type GuideAnswer,
} from "@/lib/tutor/offline";
import { SYSTEM_PROMPT, TUTOR_MODEL } from "@/lib/tutor/prompt";
import {
  MAX_CHARS,
  MAX_TURNS,
  type TutorEvent,
  type TutorMode,
  type TutorRequest,
  type TutorSource,
  type TutorTurn,
  type TutorWhere,
} from "@/lib/tutor/protocol";

const MAX_BODY_BYTES = 64 * 1024;

/** A backstop above the prompt's own limit (TRD §11.3 G4). */
const MAX_WORDS = 170;

const WITHDRAWN =
  "The tutor's answer said something about your circuit that the simulator does not back up, so it was withdrawn. This is the simulator's and the rule engine's reading instead.";

const firewalled = (v: Violation) =>
  `The tutor's answer broke a rule of quantum physics (${v.name}), so the physics firewall withdrew it. This is what is true instead.`;

/* -- Rate limit ---------------------------------------------------------------
   Per address, in memory. Enough for one instance; a deployment with several
   needs a shared store instead.
   ------------------------------------------------------------------------- */

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 10;
const recent = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const times = (recent.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  const over = times.length >= RATE_LIMIT;
  if (!over) times.push(now);
  recent.set(ip, times);
  if (recent.size > 5000) {
    for (const [key, list] of recent) if (list.every((t) => now - t >= RATE_WINDOW_MS)) recent.delete(key);
  }
  return over;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

/* -- Request parsing ----------------------------------------------------------- */

const SURFACES = new Set<TutorWhere["surface"]>(["bench", "lesson", "challenge"]);
const ID = /^[a-z0-9_-]{1,64}$/i;

function parseWhere(raw: unknown): TutorWhere | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.surface !== "string" || !SURFACES.has(r.surface as TutorWhere["surface"])) return null;
  const where: TutorWhere = { surface: r.surface as TutorWhere["surface"] };
  if (typeof r.nodeId === "string" && ID.test(r.nodeId)) where.nodeId = r.nodeId;
  if (typeof r.challengeId === "string" && ID.test(r.challengeId)) where.challengeId = r.challengeId;
  return where;
}

/** History, merged so roles alternate and trimmed so it starts on a question. */
function parseTurns(raw: unknown): TutorTurn[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return "Ask a question first.";
  const turns: TutorTurn[] = [];
  for (const m of raw.slice(-MAX_TURNS * 2)) {
    if (!m || typeof m !== "object") continue;
    const { role, content } = m as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const text = content.trim().slice(0, MAX_CHARS * 2);
    if (!text) continue;
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) prev.content += `\n\n${text}`;
    else turns.push({ role, content: text });
  }
  const kept = turns.slice(-MAX_TURNS);
  while (kept.length > 0 && kept[0].role !== "user") kept.shift();
  const last = kept[kept.length - 1];
  if (!last || last.role !== "user") return "The last message has to be a question.";
  if (last.content.length > MAX_CHARS) return `Questions are capped at ${MAX_CHARS} characters.`;
  return kept;
}

function parseRequest(body: string): TutorRequest | string {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return "The request was not valid JSON.";
  }
  if (!json || typeof json !== "object") return "The request was empty.";
  const r = json as Record<string, unknown>;
  const where = parseWhere(r.where);
  if (!where) return "The request did not say where the question was asked.";
  const messages = parseTurns(r.messages);
  if (typeof messages === "string") return messages;
  return { where, messages, circuit: r.circuit ?? null };
}

/* -- The two engines ------------------------------------------------------------ */

type Send = (event: TutorEvent) => void;

function answerFromGuide(
  send: Send,
  question: string,
  ctx: CircuitContext,
  note?: string,
  answer: GuideAnswer = guideAnswer(question, ctx),
): void {
  send({ t: "meta", mode: "guide", sources: answer.sources });
  send({ t: "text", v: answer.text });
  if (note) send({ t: "note", v: note });
  send({ t: "done" });
}

function describeFailure(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "the API key was rejected";
  if (err instanceof Anthropic.PermissionDeniedError) return "this key cannot use the tutor model";
  if (err instanceof Anthropic.RateLimitError) return "the service is rate-limiting requests";
  if (err instanceof Anthropic.APIConnectionError) return "the service could not be reached";
  if (err instanceof Anthropic.APIError) return `the service returned ${err.status ?? "an error"}`;
  return "an unexpected error";
}

/**
 * Model text on its way to the learner: sentence-buffered, filled from the
 * simulator, checked against the circuit and against physics, capped. One
 * implementation for every model, so a check added here holds for all of them.
 */
function guardedOutput(send: Send, ctx: CircuitContext, sources: TutorSource[], mode: TutorMode) {
  const buffer = new SentenceBuffer();
  const checker = new ClaimChecker(ctx);
  let started = false;
  let words = 0;
  let halt:
    | { kind: "contradiction"; bad: Contradiction }
    | { kind: "physics"; bad: Violation }
    | { kind: "length" }
    | null = null;

  const release = (chunk: string): boolean => {
    if (!chunk) return true;
    // Every released chunk is filled from the simulator, then checked against
    // it (PRD E7-S8) and against physics itself.
    const text = fillPlaceholders(chunk, ctx);
    const bad = checker.check(text);
    if (bad) {
      halt = { kind: "contradiction", bad };
      return false;
    }
    const broken = firewall(text);
    if (broken) {
      halt = { kind: "physics", bad: broken };
      return false;
    }
    if (!started) {
      started = true;
      send({ t: "meta", mode, sources });
    }
    send({ t: "text", v: text });
    words += text.trim() ? text.trim().split(/\s+/).length : 0;
    if (words > MAX_WORDS) {
      halt = { kind: "length" };
      return false;
    }
    return true;
  };

  return {
    get started() {
      return started;
    },
    get halted() {
      return halt !== null;
    },
    /** False once the generation must stop. */
    push: (delta: string) => release(buffer.push(delta)),
    finish: () => {
      if (!halt) release(buffer.flush());
    },
    /** Says the finished answer passed every check. Call before "done". */
    verified() {
      if (started && !halt) send({ t: "verified", claims: checker.checked });
    },
    /** Ends the answer if a check stopped it. True when it did. */
    concluded(question: string): boolean {
      const h = halt as typeof halt;
      if (!h) return false;
      if (h.kind === "contradiction") {
        console.warn(`[tutor] withdrew an answer that contradicts the simulator: "${h.bad.claim}" (${h.bad.actual})`);
        send({ t: "check", by: "claim", law: "simulator", misconception: null });
        if (started) send({ t: "retract" });
        answerFromGuide(send, question, ctx, WITHDRAWN, retractionAnswer(question, ctx));
      } else if (h.kind === "physics") {
        console.warn(`[tutor] physics firewall withdrew an answer (${h.bad.law}): "${h.bad.claim}"`);
        send({ t: "check", by: "physics", law: h.bad.law, misconception: h.bad.misconception });
        if (started) send({ t: "retract" });
        answerFromGuide(send, question, ctx, firewalled(h.bad), physicsAnswer(h.bad, question, ctx));
      } else {
        send({ t: "note", v: "The tutor keeps answers short. Ask for more if you want the rest." });
        send({ t: "done" });
      }
      return true;
    },
  };
}

async function answerFromClaude(
  send: Send,
  req: TutorRequest,
  ctx: CircuitContext,
  sources: TutorSource[],
  signal: AbortSignal,
  apiKey: string,
): Promise<void> {
  const question = req.messages[req.messages.length - 1].content;
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  const out = guardedOutput(send, ctx, sources, "claude");

  try {
    const stream = client.beta.messages.stream(
      {
        model: TUTOR_MODEL,
        // A ceiling, not a target — the prompt keeps answers short. It is set
        // high because thinking is on by default on this model and counts
        // against it; a low cap could spend itself before any text arrives.
        max_tokens: 16000,
        // A declined request is re-run server-side on Anthropic's recommended
        // fallback model instead of coming back as a refusal.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // Chat wants fast answers; low effort is strong on this model.
        output_config: { effort: "low" },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        // The circuit goes after the question as an operator message, so the
        // cached prefix (system prompt + earlier turns) stays byte-identical
        // and learner text cannot pose as platform context.
        messages: [...req.messages, { role: "system" as const, content: ctx.text }],
      },
      { signal },
    );
    // Marks the stream's failures as handled, so cutting it short (below, or
    // by the learner closing the tab) never surfaces as an unhandled
    // rejection. Failures still reach the loop and the catch.
    stream.done().catch(() => {});

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        if (!out.push(event.delta.text)) {
          stream.abort();
          break;
        }
      }
    }
    out.finish();
    if (out.concluded(question)) return;
    const final = await stream.finalMessage();

    if (!out.started) {
      const why = final.stop_reason === "refusal" ? "Claude declined this question" : "Claude returned no text";
      answerFromGuide(send, question, ctx, `${why}, so the built-in guide answered instead.`);
      return;
    }
    if (final.stop_reason === "refusal") {
      send({ t: "note", v: "The tutor stopped partway through this answer." });
    } else if (final.stop_reason === "max_tokens") {
      send({ t: "note", v: "The answer was cut short. Ask for the rest if you need it." });
    }
    out.verified();
    send({ t: "done" });
  } catch (err) {
    if (signal.aborted) return;
    const reason = describeFailure(err);
    console.error(`[tutor] ${reason}`);
    if (!out.started) {
      answerFromGuide(
        send,
        question,
        ctx,
        `Detailed explanation is unavailable right now (${reason}), so the built-in guide answered.`,
      );
      return;
    }
    send({ t: "note", v: "The connection to the tutor dropped partway through this answer." });
    send({ t: "done" });
  }
}

/* -- Gemini ---------------------------------------------------------------------
   Google's Generative Language API, streamed as server-sent events. Called
   with fetch rather than an SDK: it is one endpoint, and the guarded output
   above is where the care goes.
   ------------------------------------------------------------------------- */

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/**
 * Measured on this project's key (Sept 2026): 2.5 Flash answers in ~1.5s to
 * first word with thinking off, and 3.5 Flash-Lite in ~1.3s — both inside PRD
 * §7.1's 2.5s. The newer full flash models took 12–20s or were refusing
 * traffic. The second model answers when the first is overloaded (503),
 * over quota (429) or withdrawn (404): each model has its own quota, so the
 * chain also raises how many questions a free-tier key can take a minute.
 */
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
const GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite";

/** Worth trying the next model: this one is busy, rationed or gone. */
const NEXT_MODEL = new Set([404, 429, 503]);

/**
 * Thinking off where the model allows it. 2.5 models take a zero budget; the
 * 3.x lite models reject that setting and are fast with their default.
 */
function geminiThinking(model: string): Record<string, unknown> | undefined {
  return /^gemini-2\.5-/.test(model) ? { thinkingBudget: 0 } : undefined;
}

class GeminiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function describeGemini(err: unknown): string {
  if (err instanceof GeminiError) {
    if (err.status === 400 && /API key/i.test(err.message)) return "the Gemini API key was rejected";
    if (err.status === 401 || err.status === 403) return "this key cannot use the Gemini model";
    if (err.status === 429) return "the Gemini key is over its per-minute quota";
    if (err.status === 404) return "the Gemini model is not available to this key";
    if (err.status === 503) return "Gemini is overloaded right now";
    return `Gemini returned ${err.status}`;
  }
  return "Gemini could not be reached";
}

interface GeminiChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

async function answerFromGemini(
  send: Send,
  req: TutorRequest,
  ctx: CircuitContext,
  sources: TutorSource[],
  signal: AbortSignal,
  apiKey: string,
): Promise<void> {
  const question = req.messages[req.messages.length - 1].content;
  const out = guardedOutput(send, ctx, sources, "gemini");
  const stop = new AbortController();
  signal.addEventListener("abort", () => stop.abort(), { once: true });

  const primary = process.env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL;
  const models = primary === GEMINI_FALLBACK_MODEL ? [primary] : [primary, GEMINI_FALLBACK_MODEL];

  const bodyFor = (model: string) => {
    const thinkingConfig = geminiThinking(model);
    return JSON.stringify({
      // Gemini has no mid-conversation operator role, so the circuit summary
      // rides in the system instruction: learner text cannot pose as it there.
      systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n\n${ctx.text}` }] },
      contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.3,
        // Thinking off where allowed: a sixty-word chat answer does not need
        // it, and on 2.5 Flash it is the difference between 1.5s and 12s.
        ...(thinkingConfig ? { thinkingConfig } : {}),
      },
    });
  };

  let finishReason: string | undefined;
  let blocked: string | undefined;

  try {
    let res: Response | null = null;
    for (const model of models) {
      res = await fetch(`${GEMINI_ENDPOINT}/${model}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: bodyFor(model),
        signal: stop.signal,
      });
      if (res.ok) break;
      const detail = await res.text().catch(() => "");
      // Busy, over quota or withdrawn: nothing has been said yet, so the next
      // model can answer instead. Anything else (a bad key, a bad request)
      // would fail the same way on every model.
      if (NEXT_MODEL.has(res.status) && model !== models[models.length - 1]) continue;
      throw new GeminiError(res.status, detail.slice(0, 300));
    }
    if (!res?.ok || !res.body) throw new GeminiError(res?.status ?? 0, "no response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    read: for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      for (let nl = pending.indexOf("\n"); nl !== -1; nl = pending.indexOf("\n")) {
        const line = pending.slice(0, nl).trim();
        pending = pending.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        let chunk: GeminiChunk;
        try {
          chunk = JSON.parse(line.slice(5));
        } catch {
          continue;
        }
        blocked ??= chunk.promptFeedback?.blockReason;
        const cand = chunk.candidates?.[0];
        if (cand?.finishReason) finishReason = cand.finishReason;
        for (const part of cand?.content?.parts ?? []) {
          if (part.thought || !part.text) continue;
          if (!out.push(part.text)) {
            stop.abort();
            break read;
          }
        }
      }
    }
    out.finish();
    if (out.concluded(question)) return;

    if (!out.started) {
      const why = blocked || finishReason === "SAFETY" ? "Gemini declined this question" : "Gemini returned no text";
      answerFromGuide(send, question, ctx, `${why}, so the built-in guide answered instead.`);
      return;
    }
    if (finishReason === "SAFETY" || finishReason === "RECITATION") {
      send({ t: "note", v: "The tutor stopped partway through this answer." });
    } else if (finishReason === "MAX_TOKENS") {
      send({ t: "note", v: "The answer was cut short. Ask for the rest if you need it." });
    }
    out.verified();
    send({ t: "done" });
  } catch (err) {
    if (signal.aborted) return;
    if (out.halted && out.concluded(question)) return;
    const reason = describeGemini(err);
    console.error(`[tutor] ${reason}`);
    if (!out.started) {
      answerFromGuide(
        send,
        question,
        ctx,
        `Detailed explanation is unavailable right now (${reason}), so the built-in guide answered.`,
      );
      return;
    }
    send({ t: "note", v: "The connection to the tutor dropped partway through this answer." });
    send({ t: "done" });
  }
}

/* -- Handler ------------------------------------------------------------------- */

export async function POST(request: Request): Promise<Response> {
  if (limited(clientIp(request))) {
    return Response.json(
      { error: "That's a lot of questions in a minute. Give it a moment, then ask again." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return Response.json({ error: "That request is too large." }, { status: 413 });
  }
  const req = parseRequest(body);
  if (typeof req === "string") return Response.json({ error: req }, { status: 400 });

  const question = req.messages[req.messages.length - 1].content;
  const ctx = buildContext(req.where, req.circuit);
  const sources = relatedSources(question, ctx);
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: Send = (event) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The reader has gone; nothing left to tell.
        }
      };
      try {
        if (apiKey) await answerFromClaude(send, req, ctx, sources, abort.signal, apiKey);
        else if (geminiKey) await answerFromGemini(send, req, ctx, sources, abort.signal, geminiKey);
        else answerFromGuide(send, question, ctx);
      } catch (err) {
        console.error("[tutor] unexpected:", err instanceof Error ? err.message : String(err));
        send({ t: "error", v: "The tutor hit an unexpected problem. Your circuit is untouched." });
        send({ t: "done" });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a cancelled reader.
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
