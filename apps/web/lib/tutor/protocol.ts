/**
 * The wire format between the tutor route and the dock.
 *
 * Responses are NDJSON: one JSON event per line, so the browser can render a
 * sentence as soon as the server has checked it.
 */

export type TutorSurface = "bench" | "lesson" | "challenge";

/** Where the question was asked. The server looks the task up from this. */
export interface TutorWhere {
  surface: TutorSurface;
  nodeId?: string;
  challengeId?: string;
}

export interface TutorTurn {
  role: "user" | "assistant";
  content: string;
}

export interface TutorRequest {
  where: TutorWhere;
  messages: TutorTurn[];
  /** The learner's IR, untrusted. Validated and re-simulated server-side. */
  circuit: unknown;
}

export interface TutorSource {
  title: string;
  href: string;
  kind: "lesson" | "gate" | "misconception";
}

/** Which engine answered. The learner is always told. */
export type TutorMode = "claude" | "guide";

export type TutorEvent =
  | { t: "meta"; mode: TutorMode; sources: TutorSource[] }
  | { t: "text"; v: string }
  | { t: "note"; v: string }
  | { t: "error"; v: string }
  | { t: "done" };

/** Turns of history kept per request. Older turns are dropped, oldest first. */
export const MAX_TURNS = 12;
/** Longest question accepted. */
export const MAX_CHARS = 1500;
