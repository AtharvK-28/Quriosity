/**
 * Analytics — PRD §8.
 *
 * The taxonomy is typed so an event cannot drift from the table it is defined
 * in, and every event carries user_id (pseudonymous), session_id, mode and
 * timestamp. "Instrument S2, S3 and S4 before anything else": those are
 * `code_mode_first_correct`, `corrected_after_failure` and
 * `tutor_suggestion_applied`, and all three are emitted.
 *
 * With no backend the sink is this browser: a bounded log in local storage
 * that the learner can read, download or clear from Settings, and switch off.
 * Nothing leaves the machine and there are no third-party trackers (PRD §7.4).
 * When an events endpoint exists, `flush` is the one function that changes.
 */

export type Mode = "guided" | "workbench" | "track";

type Scalar = string | number | boolean | null;

/** PRD §8, one entry per row. */
export interface EventProps {
  signup_completed: { method: string };
  mode_selected: { mode: Mode; is_change: boolean };
  node_started: { node_id: string; unit_id: string };
  node_attempted: { node_id: string; attempt_index: number; is_first_attempt: boolean };
  node_passed: { node_id: string; attempts: number; first_attempt_accuracy: number };
  circuit_run: { qubits: number; gate_count: number; backend: string; shots: number; noise: number; cached: boolean; duration_ms: number };
  run_failed: { error_type: string };
  challenge_submitted: { challenge_id: string; fidelity: number; passed: boolean; gate_count: number };
  misconception_detected: { misconception_id: string; node_id: string | null };
  tutor_invoked: { trigger: "proactive" | "explicit"; source: "rule" | "llm" | "guide"; latency_ms: number };
  tutor_feedback: { helpful: boolean };
  tutor_suggestion_applied: { misconception_id: string | null; applied: boolean };
  corrected_after_failure: { node_id: string; seconds_since_failure: number; tutor_shown: boolean };
  code_mode_first_correct: { node_id: string; days_since_first_canvas_node: number | null };
  sdk_toggled: { from: string; to: string };
  match_started: { mode: string; rating_before: number };
  match_ended: { mode: string; rating_before: number; rating_after: number; result: string; duration: number };
  streak_extended: { length: number };
  session_end: { duration: number; nodes_touched: number };
  /**
   * Post-PRD. Lesson videos are opt-in on the pass screen, so the open rate is
   * the only evidence that they earn the page weight they cost.
   */
  lesson_video_opened: { node_id: string; video_id: string };
}

export type EventName = keyof EventProps;

export interface AnalyticsEvent {
  name: EventName;
  props: Record<string, Scalar>;
  user_id: string;
  session_id: string;
  mode: Mode;
  timestamp: number;
}

const LOG_KEY = "quriosity.analytics.v1";
const USER_KEY = "quriosity.analytics.user";
const OPT_OUT_KEY = "quriosity.analytics.off";
const SESSION_KEY = "quriosity.analytics.session";
/** Enough for weeks of use; oldest events drop first. */
const MAX_EVENTS = 2000;

let mode: Mode = "guided";
let memory: AnalyticsEvent[] = [];
let sessionStart = Date.now();
const nodesTouched = new Set<string>();
let listening = false;

function storage(kind: "local" | "session"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function randomId(prefix: string): string {
  const bytes = new Uint8Array(9);
  globalThis.crypto?.getRandomValues?.(bytes);
  const body = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
  return `${prefix}_${body || Math.random().toString(36).slice(2, 16)}`;
}

/** Pseudonymous: random, stored locally, tied to nothing about the person. */
function userId(): string {
  const s = storage("local");
  let id = s?.getItem(USER_KEY) ?? null;
  if (!id) {
    id = randomId("u");
    try { s?.setItem(USER_KEY, id); } catch { /* memory only */ }
  }
  return id;
}

function sessionId(): string {
  const s = storage("session");
  let id = s?.getItem(SESSION_KEY) ?? null;
  if (!id) {
    id = randomId("s");
    try { s?.setItem(SESSION_KEY, id); } catch { /* memory only */ }
  }
  return id;
}

export function setAnalyticsMode(m: Mode): void {
  mode = m;
}

export function analyticsEnabled(): boolean {
  return storage("local")?.getItem(OPT_OUT_KEY) !== "1";
}

export function setAnalyticsEnabled(on: boolean): void {
  const s = storage("local");
  try {
    if (on) s?.removeItem(OPT_OUT_KEY);
    else {
      s?.setItem(OPT_OUT_KEY, "1");
      clearEvents();
    }
  } catch { /* nothing to do */ }
}

export function readEvents(): AnalyticsEvent[] {
  const raw = storage("local")?.getItem(LOG_KEY);
  if (!raw) return memory;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : memory;
  } catch {
    return memory;
  }
}

export function clearEvents(): void {
  memory = [];
  try { storage("local")?.removeItem(LOG_KEY); } catch { /* nothing to do */ }
}

function flush(events: AnalyticsEvent[]): void {
  memory = events;
  try {
    storage("local")?.setItem(LOG_KEY, JSON.stringify(events));
  } catch {
    // Quota or private mode. Keep the most recent half in memory.
    memory = events.slice(-MAX_EVENTS / 2);
  }
}

export function track<N extends EventName>(name: N, props: EventProps[N]): void {
  if (typeof window === "undefined" || !analyticsEnabled()) return;
  listenForSessionEnd();

  if (name === "node_started") nodesTouched.add((props as EventProps["node_started"]).node_id);

  const event: AnalyticsEvent = {
    name,
    props: props as unknown as Record<string, Scalar>,
    user_id: userId(),
    session_id: sessionId(),
    mode,
    timestamp: Date.now(),
  };
  flush([...readEvents(), event].slice(-MAX_EVENTS));
}

/** `session_end` fires when the page is hidden for good. */
function listenForSessionEnd(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  sessionStart = Date.now();
  window.addEventListener("pagehide", () => {
    track("session_end", {
      duration: Math.round((Date.now() - sessionStart) / 1000),
      nodes_touched: nodesTouched.size,
    });
  });
}

/** Has this event already been logged with these props? For once-only events. */
export function hasEvent<N extends EventName>(name: N, match: Partial<EventProps[N]>): boolean {
  return readEvents().some(
    (e) => e.name === name && Object.entries(match).every(([k, v]) => e.props[k] === v),
  );
}
