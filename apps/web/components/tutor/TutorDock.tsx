"use client";

/**
 * The tutor, docked.
 *
 * A launcher in the corner and a side sheet when opened — never a modal, so
 * the circuit stays in view and editable while the learner reads. It opens
 * only when asked (⌘/ or the launcher), in every mode: PRD E7-S5 forbids the
 * tutor speaking unprompted in Workbench, and a chat that pops open by itself
 * is exactly that.
 *
 * When the rule engine already has something to say about the current run, it
 * sits at the top of an empty conversation — instant, local, no model call —
 * with a one-tap follow-up that asks for the fuller explanation.
 *
 * The short-form tutor — a new word, a nudge, a cheer — is TutorPop, mounted
 * here so it exists wherever the dock does. The panel itself still never
 * opens on its own.
 */

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GateMark } from "@/components/circuit/GateMark";
import { GATES, isGateType } from "@/lib/ir/gates";
import type { GateType } from "@/lib/ir/types";
import type { TutorWhere } from "@/lib/tutor/protocol";
import { useCircuit } from "@/stores/circuitStore";
import { MODE, useSession } from "@/stores/sessionStore";
import { useTutor, type TutorMessage } from "@/stores/tutorStore";
import { TutorPop } from "./TutorPop";
import s from "./TutorDock.module.css";

const SUGGESTIONS: Record<TutorWhere["surface"], string[]> = {
  bench: ["What does my circuit do?", "Explain the Hadamard gate", "What is entanglement, really?"],
  lesson: ["Give me a hint for this one", "What is superposition?", "Why does phase matter?"],
  challenge: ["Give me a nudge, not the answer", "Which gate should I look at?", "What does CNOT do?"],
};

export const FOLLOW_UP = "Why is that wrong, and how do I fix it?";

export function TutorDock({ where }: { where: TutorWhere }) {
  const { open, busy, messages, setOpen, toggle, enter, ask, stop, clear } = useTutor();
  const finding = useCircuit((st) => st.run?.finding ?? null);
  // Where the mode already puts the diagnosis on the page, the dock offers to
  // explain it rather than printing it a second time beside itself.
  const diagnosisOnPage = MODE[useSession((st) => st.mode)].proactiveTutor;
  const [draft, setDraft] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    enter(where);
    // The place is its three fields, not the object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enter, where.surface, where.nodeId, where.challengeId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape" && panelRef.current?.contains(document.activeElement)) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, setOpen]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Lets the page make room for the sheet on wide screens (tokens.css).
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-tutor-open", open);
    return () => root.removeAttribute("data-tutor-open");
  }, [open]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function submit(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setDraft("");
    void ask(q);
  }

  if (!open) {
    return (
      <>
        <TutorPop />
        <button
          type="button"
          className={s.launcher}
          onClick={() => setOpen(true)}
          aria-keyshortcuts="Control+/ Meta+/"
        >
          <span className={s.launcherMark} aria-hidden>
            q
          </span>
          Ask the tutor
          <kbd className={s.kbd}>⌘/</kbd>
        </button>
      </>
    );
  }

  const last = messages[messages.length - 1];

  return (
    <aside className={s.panel} aria-label="Tutor" ref={panelRef}>
      <header className={s.head}>
        <span className="label label--ink">Tutor</span>
        <span className={s.headSpacer} />
        {messages.length > 0 && (
          <button type="button" className={s.headBtn} onClick={clear}>
            New chat
          </button>
        )}
        <button type="button" className={s.headBtn} onClick={() => setOpen(false)} aria-label="Close the tutor">
          ✕
        </button>
      </header>

      <div className={s.body} ref={bodyRef}>
        {messages.length === 0 && (
          <div className={s.intro}>
            {finding && !diagnosisOnPage && (
              <div className={s.noticed}>
                <span className="label">The tutor noticed · {finding.ruleId}</span>
                <p>{finding.message}</p>
                <button type="button" className={s.followUp} onClick={() => submit(FOLLOW_UP)}>
                  Explain this →
                </button>
              </div>
            )}
            <p className={s.introText}>
              Ask about a gate, an idea, or your circuit — the tutor can see it.
            </p>
            <div className={s.suggestions}>
              {finding && diagnosisOnPage && (
                <button type="button" className={s.suggestion} data-lead onClick={() => submit(FOLLOW_UP)}>
                  Explain the diagnosis on my last run
                </button>
              )}
              {SUGGESTIONS[where.surface].map((q) => (
                <button key={q} type="button" className={s.suggestion} onClick={() => submit(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}

        <p className="sr-only" aria-live="polite">
          {last && last.role === "assistant" && !last.streaming ? "The tutor replied." : ""}
        </p>
      </div>

      <form
        className={s.composer}
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <textarea
          ref={inputRef}
          className={s.input}
          value={draft}
          rows={2}
          maxLength={1500}
          placeholder="Ask anything about quantum circuits…"
          aria-label="Your question"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(draft);
            }
          }}
        />
        {busy ? (
          <button type="button" className={s.send} onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit" className={s.send} disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>
      <p className={s.disclaimer}>The tutor can be wrong. The simulator is not.</p>
    </aside>
  );
}

function Message({ m }: { m: TutorMessage }) {
  if (m.role === "user") return <div className={s.user}>{m.text}</div>;

  return (
    <div className={s.reply} data-failed={m.failed || undefined}>
      {m.mode && <span className={s.from}>{m.mode === "claude" ? "Claude" : m.mode === "gemini" ? "Gemini" : "Built-in guide"}</span>}
      {m.text ? (
        <RichText text={m.text} />
      ) : (
        m.streaming && (
          <span className={s.typing} role="status" aria-label="The tutor is thinking">
            ···
          </span>
        )
      )}
      {m.note && <p className={s.note}>{m.note}</p>}
      {!m.streaming && m.sources && m.sources.length > 0 && (
        <div className={s.sources}>
          <span className="label">Related</span>
          {m.sources.map((src) => (
            <Link key={src.href + src.title} href={src.href} className={s.source}>
              {src.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* -- The small amount of formatting the tutor is allowed ---------------------- */

const TOKEN = /(\[\[gate:[a-z]+\]\]|\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

function RichText({ text }: { text: string }) {
  return (
    <>
      {text
        .trim()
        .split(/\n{2,}/)
        .map((para, i) => (
          <p key={i} className={s.para}>
            {inline(para)}
          </p>
        ))}
    </>
  );
}

function inline(para: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of para.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(para.slice(last, at));
    const token = m[0];
    if (token.startsWith("[[")) {
      const id = token.slice(7, -2);
      out.push(isGateType(id) ? <GateChip key={key++} type={id} /> : id);
    } else if (token.startsWith("**")) {
      out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      out.push(
        <code key={key++} className={s.code}>
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = at + token.length;
  }
  if (last < para.length) out.push(para.slice(last));
  return out;
}

function GateChip({ type }: { type: GateType }) {
  const g = GATES[type];
  return (
    <Link href={`/reference#gate-${type}`} className={s.gateChip} title={g.blurb}>
      <span className={s.gateGlyph} aria-hidden>
        <GateMark spec={g} />
      </span>
      {g.name}
    </Link>
  );
}
