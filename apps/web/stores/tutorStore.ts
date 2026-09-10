/**
 * The tutor conversation.
 *
 * One conversation per place: moving from the bench to a lesson starts a new
 * one, because the context the tutor sees has changed underneath it. Coming
 * back to the same place picks the old one up.
 */

import { create } from "zustand";
import {
  MAX_TURNS,
  type TutorEvent,
  type TutorMode,
  type TutorSource,
  type TutorTurn,
  type TutorWhere,
} from "@/lib/tutor/protocol";
import { useCircuit } from "./circuitStore";

export interface TutorMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  mode?: TutorMode;
  sources?: TutorSource[];
  note?: string;
  streaming?: boolean;
  failed?: boolean;
}

interface TutorState {
  open: boolean;
  busy: boolean;
  where: TutorWhere | null;
  messages: TutorMessage[];

  setOpen(open: boolean): void;
  toggle(): void;
  /** Called by the dock on each surface. */
  enter(where: TutorWhere): void;
  ask(question: string): Promise<void>;
  stop(): void;
  clear(): void;
}

let seq = 0;
let inflight: AbortController | null = null;

function samePlace(a: TutorWhere | null, b: TutorWhere): boolean {
  return a !== null && a.surface === b.surface && a.nodeId === b.nodeId && a.challengeId === b.challengeId;
}

export const useTutor = create<TutorState>((set, get) => ({
  open: false,
  busy: false,
  where: null,
  messages: [],

  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),

  enter: (where) => {
    if (samePlace(get().where, where)) return;
    inflight?.abort();
    set({ where, messages: [], busy: false });
  },

  clear: () => {
    inflight?.abort();
    set({ messages: [], busy: false });
  },

  stop: () => inflight?.abort(),

  ask: async (question) => {
    const q = question.trim();
    const { where, busy, messages } = get();
    if (!q || busy || !where) return;

    const history: TutorTurn[] = messages
      .filter((m) => !m.failed && m.text)
      .map((m) => ({ role: m.role, content: m.text }));
    const reply: TutorMessage = { id: ++seq, role: "assistant", text: "", streaming: true };
    set((s) => ({
      open: true,
      busy: true,
      messages: [...s.messages, { id: ++seq, role: "user", text: q }, reply],
    }));

    const patch = (fn: (m: TutorMessage) => TutorMessage) =>
      set((s) => ({ messages: s.messages.map((m) => (m.id === reply.id ? fn(m) : m)) }));

    const apply = (e: TutorEvent) => {
      if (e.t === "meta") patch((m) => ({ ...m, mode: e.mode, sources: e.sources }));
      else if (e.t === "text") patch((m) => ({ ...m, text: m.text + e.v }));
      else if (e.t === "note") patch((m) => ({ ...m, note: e.v }));
      else if (e.t === "error") patch((m) => ({ ...m, text: m.text || e.v, failed: !m.text }));
      else if (e.t === "retract") patch((m) => ({ ...m, text: "", sources: [], mode: undefined, note: undefined }));
      else if (e.t === "done") patch((m) => ({ ...m, streaming: false }));
    };

    const controller = new AbortController();
    inflight = controller;
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          where,
          messages: [...history, { role: "user", content: q }].slice(-MAX_TURNS),
          circuit: useCircuit.getState().circuit,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const error = await res
          .json()
          .then((j: { error?: string }) => j.error)
          .catch(() => undefined);
        patch((m) => ({ ...m, text: error ?? `The tutor could not answer (${res.status}).`, failed: true }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        for (let nl = pending.indexOf("\n"); nl !== -1; nl = pending.indexOf("\n")) {
          const line = pending.slice(0, nl).trim();
          pending = pending.slice(nl + 1);
          if (!line) continue;
          try {
            apply(JSON.parse(line) as TutorEvent);
          } catch {
            // A malformed line is skipped rather than ending the answer.
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        patch((m) => ({ ...m, note: m.text ? "Stopped." : undefined, failed: !m.text, text: m.text || "Stopped." }));
      } else {
        patch((m) => ({
          ...m,
          text: m.text || "The tutor could not be reached. Check your connection and try again.",
          failed: !m.text,
        }));
      }
    } finally {
      patch((m) => ({ ...m, streaming: false }));
      if (inflight === controller) inflight = null;
      set({ busy: false });
    }
  },
}));
