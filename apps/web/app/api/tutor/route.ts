/**
 * POST /api/tutor — the tutor, streamed as NDJSON.
 *
 * Two engines behind one wire format. With ANTHROPIC_API_KEY set, Claude
 * answers, grounded in a server-built summary of the learner's circuit. With
 * no key, or when the service fails before saying anything, the built-in
 * guide answers from the rule engine and the platform's own content. The
 * learner is told which one replied; neither is passed off as the other.
 *
 * The key is read here, on the server, and never reaches the browser.
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildContext, type CircuitContext } from "@/lib/tutor/context";
import { SentenceBuffer } from "@/lib/tutor/guard";
import { ClaimChecker, fillPlaceholders, type Contradiction } from "@/lib/tutor/claims";
import { guideAnswer, relatedSources, retractionAnswer, type GuideAnswer } from "@/lib/tutor/offline";
import { SYSTEM_PROMPT, TUTOR_MODEL } from "@/lib/tutor/prompt";
import {
  MAX_CHARS,
  MAX_TURNS,
  type TutorEvent,
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
  const buffer = new SentenceBuffer();
  let started = false;

  const emit = (text: string) => {
    if (!text) return;
    if (!started) {
      started = true;
      send({ t: "meta", mode: "claude", sources });
    }
    send({ t: "text", v: text });
  };

  // Every released chunk is filled from the simulator, then checked against
  // it (PRD E7-S8). A contradiction or a runaway length ends the generation.
  const checker = new ClaimChecker(ctx);
  const halt: {
    reason: { kind: "contradiction"; bad: Contradiction } | { kind: "length" } | null;
  } = { reason: null };
  let words = 0;
  const release = (chunk: string): boolean => {
    if (!chunk) return true;
    const text = fillPlaceholders(chunk, ctx);
    const bad = checker.check(text);
    if (bad) {
      halt.reason = { kind: "contradiction", bad };
      return false;
    }
    emit(text);
    words += text.trim() ? text.trim().split(/\s+/).length : 0;
    if (words > MAX_WORDS) {
      halt.reason = { kind: "length" };
      return false;
    }
    return true;
  };

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
        if (!release(buffer.push(event.delta.text))) {
          stream.abort();
          break;
        }
      }
    }
    if (!halt.reason) release(buffer.flush());

    if (halt.reason?.kind === "contradiction") {
      const { bad } = halt.reason;
      console.warn(`[tutor] withdrew an answer that contradicts the simulator: "${bad.claim}" (${bad.actual})`);
      if (started) send({ t: "retract" });
      answerFromGuide(send, question, ctx, WITHDRAWN, retractionAnswer(question, ctx));
      return;
    }
    if (halt.reason?.kind === "length") {
      send({ t: "note", v: "The tutor keeps answers short. Ask for more if you want the rest." });
      send({ t: "done" });
      return;
    }
    const final = await stream.finalMessage();

    if (!started) {
      const why = final.stop_reason === "refusal" ? "Claude declined this question" : "Claude returned no text";
      answerFromGuide(send, question, ctx, `${why}, so the built-in guide answered instead.`);
      return;
    }
    if (final.stop_reason === "refusal") {
      send({ t: "note", v: "The tutor stopped partway through this answer." });
    } else if (final.stop_reason === "max_tokens") {
      send({ t: "note", v: "The answer was cut short. Ask for the rest if you need it." });
    }
    send({ t: "done" });
  } catch (err) {
    if (signal.aborted) return;
    const reason = describeFailure(err);
    console.error(`[tutor] ${reason}`);
    if (!started) {
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
