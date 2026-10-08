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
export type TutorMode = "claude" | "gemini" | "guide";

/** The two checks that can withdraw a model's answer. */
export type TutorCheck = "claim" | "physics";

export type TutorEvent =
  | { t: "meta"; mode: TutorMode; sources: TutorSource[] }
  | { t: "text"; v: string }
  | { t: "note"; v: string }
  | { t: "error"; v: string }
  /**
   * A check withdrew the model's answer: "claim" when it contradicted the
   * simulator, "physics" when it broke a law. Sent before the replacement, so
   * the browser can count how often each check fires.
   */
  | { t: "check"; by: TutorCheck; law: string; misconception: string | null }
  /**
   * A model's answer finished and every sentence passed both checks. `claims`
   * is how many statements about this circuit were confirmed against its
   * simulation; the physics firewall read every sentence either way.
   */
  | { t: "verified"; claims: number }
  /** Withdraw everything sent so far: the claim check caught a contradiction. */
  | { t: "retract" }
  | { t: "done" };

/** Turns of history kept per request. Older turns are dropped, oldest first. */
export const MAX_TURNS = 12;
/** Longest question accepted. */
export const MAX_CHARS = 1500;
