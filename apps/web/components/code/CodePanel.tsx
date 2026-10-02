"use client";

/**
 * The code panel — PRD E3-S1, E3-S2, E3-S3, E3-S6.
 *
 * Rendered locally from the IR. Switching SDK makes no network call, because
 * rendering is string generation and the SDK is only needed to execute.
 *
 * Where a surface allows it, Qiskit and OpenQASM are also editable. An edit
 * does nothing to the canvas until the learner says so, and a canvas change
 * never overwrites an edit in progress (E3-S6: "Never overwrite without
 * asking") — the notice holds both until one is chosen. A parse failure keeps
 * the previous IR and marks the line.
 *
 * The lines an edit on the canvas just wrote flash once, so dropping a gate
 * visibly writes its line of code. The lines of any gate the tutor is
 * pointing at stay marked, so "column 2 is wrong" is also "this line".
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Segmented } from "@/components/ui/primitives";
import { GATES } from "@/lib/ir/gates";
import type { Circuit, GateType } from "@/lib/ir/types";
import { canonicalJson } from "@/lib/ir/hash";
import { render, SDK_LABELS, type Sdk } from "@/lib/render";
import { addedLines, linesForGates } from "@/lib/render/diff";
import { parseQasm } from "@/lib/io/qasm";
import { parseQiskit } from "@/lib/io/qiskit";
import type { ParseError } from "@/lib/io/parse";
import { track } from "@/lib/analytics";
import s from "./CodePanel.module.css";

const ALL_SDKS: Sdk[] = ["qiskit", "cirq", "pennylane", "qsharp", "qasm"];
/** Tab labels short enough for five to share a 380px lane. */
const TAB_LABELS: Record<Sdk, string> = { ...SDK_LABELS, qasm: "QASM" };
const EDITABLE: ReadonlySet<Sdk> = new Set(["qiskit", "qasm"]);

export interface CodePanelProps {
  circuit: Circuit;
  sdk: Sdk;
  onSdk?(s: Sdk): void;
  /**
   * Makes Qiskit and OpenQASM editable. Called with the parsed circuit when
   * the learner applies an edit.
   */
  onApply?(c: Circuit): void;
  /** Gates a lesson allows. An edit using anything else is refused by name. */
  allowedGates?: GateType[];
  /** A lesson's wire count is fixed; an edit that changes it is refused. */
  requiredQubits?: number;
  /** Gate ids the tutor is pointing at; their lines are marked. */
  highlighted?: readonly string[];
}

export function CodePanel({ circuit, sdk, onSdk, onApply, allowedGates, requiredQubits, highlighted = [] }: CodePanelProps) {
  const rendered = useMemo(() => render(circuit, sdk), [circuit, sdk]);
  const flagged = useMemo(
    () => new Set(linesForGates(circuit, sdk, highlighted)),
    [circuit, sdk, highlighted],
  );

  /** Lines the last canvas edit wrote. `stamp` restarts the flash. */
  const [fresh, setFresh] = useState<{ lines: Set<number>; stamp: number }>({ lines: new Set(), stamp: 0 });
  const lastRef = useRef<{ sdk: Sdk; text: string } | null>(null);
  useEffect(() => {
    const last = lastRef.current;
    lastRef.current = { sdk, text: rendered };
    // A new dialect is not an edit; nor is the first render.
    if (!last || last.sdk !== sdk || last.text === rendered) return;
    const lines = addedLines(last.text, rendered);
    if (lines.length > 0) setFresh((f) => ({ lines: new Set(lines), stamp: f.stamp + 1 }));
  }, [rendered, sdk]);
  const editable = Boolean(onApply) && EDITABLE.has(sdk);

  /** Null while the panel simply shows the canvas. */
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<ParseError | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [blockedSwitch, setBlockedSwitch] = useState(false);
  /** The canvas the edit started from, to tell whether it moved underneath. */
  const baseRef = useRef<string | null>(null);
  const gutterRef = useRef<HTMLPreElement>(null);

  const dirty = draft !== null && draft !== rendered;
  const canvasMoved = dirty && baseRef.current !== null && baseRef.current !== canonicalJson(circuit);

  // A clean draft follows the canvas; a dirty one is left alone.
  useEffect(() => {
    if (draft !== null && !dirty) {
      setDraft(null);
      baseRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendered]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  const text = draft ?? rendered;
  const lineCount = text.split("\n").length;
  /** Marks for line i, which only describe the code while it is the canvas's. */
  const mark = (i: number) =>
    draft !== null
      ? {}
      : {
          "data-fresh": fresh.lines.has(i) || undefined,
          "data-flag": flagged.has(i) || undefined,
        };
  const lineKey = (i: number) => (fresh.lines.has(i) ? `${i}.${fresh.stamp}` : `${i}`);

  function switchSdk(next: Sdk) {
    if (next === sdk) return;
    if (dirty) {
      setBlockedSwitch(true);
      return;
    }
    track("sdk_toggled", { from: sdk, to: next });
    setDraft(null);
    setError(null);
    setNotes([]);
    setBlockedSwitch(false);
    onSdk?.(next);
  }

  function edit(value: string) {
    if (draft === null) baseRef.current = canonicalJson(circuit);
    setDraft(value);
    setError(null);
    setNotes([]);
  }

  function discard() {
    setDraft(null);
    setError(null);
    setNotes([]);
    setBlockedSwitch(false);
    baseRef.current = null;
  }

  /** Returns true when the edit reached the canvas. */
  function apply(): boolean {
    if (draft === null || !onApply) return true;
    const result = sdk === "qasm" ? parseQasm(draft) : parseQiskit(draft);
    if (!result.ok) {
      setError(result.error);
      return false;
    }

    const c = result.circuit;
    if (requiredQubits !== undefined && c.qubits !== requiredQubits) {
      setError({ line: 1, column: 1, message: `This node is built on ${requiredQubits} qubit${requiredQubits === 1 ? "" : "s"}; the code declares ${c.qubits}.` });
      return false;
    }
    if (allowedGates) {
      const allowed = new Set<GateType>([...allowedGates, "barrier"]);
      const outside = c.gates.find((g) => !allowed.has(g.type));
      if (outside) {
        setError({ line: 1, column: 1, message: `${GATES[outside.type].name} isn't open on this node yet. Use the gates in the tray.` });
        return false;
      }
    }

    onApply(c);
    setNotes(result.notes);
    setDraft(null);
    setError(null);
    setBlockedSwitch(false);
    baseRef.current = null;
    return true;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard blocked. The text is selectable, which is the fallback.
    }
  }

  return (
    <div className={s.panel}>
      <div className={s.bar}>
        {onSdk && (
          <Segmented<Sdk>
            ariaLabel="SDK"
            value={sdk}
            onChange={switchSdk}
            options={ALL_SDKS.map((k) => ({ value: k, label: TAB_LABELS[k] }))}
          />
        )}
        <button type="button" className={s.copy} onClick={copy}>
          {copied ? "copied" : "copy"}
        </button>
      </div>

      {editable ? (
        <div className={s.editor} data-error={Boolean(error)}>
          <pre ref={gutterRef} className={s.gutter} aria-hidden>
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={lineKey(i)} data-error={error?.line === i + 1} {...mark(i)}>{i + 1}{"\n"}</span>
            ))}
          </pre>
          <textarea
            className={s.code}
            value={text}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            rows={Math.min(22, Math.max(8, lineCount))}
            aria-label={`${SDK_LABELS[sdk]} code — editable`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "code-error" : undefined}
            onChange={(e) => edit(e.target.value)}
            onScroll={(e) => {
              if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onKeyDown={(e) => {
              // ⌘↵ applies the edit first, then lets the page run it. A
              // failed parse stops the run: running the stale circuit while
              // the code says something else is exactly the confusion to avoid.
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && dirty && !apply()) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          />
        </div>
      ) : (
        <pre className={s.readonly}>
          {rendered.split("\n").map((line, i) => (
            <span key={lineKey(i)} className={s.line} {...mark(i)}>{line || " "}</span>
          ))}
        </pre>
      )}

      {onApply && !EDITABLE.has(sdk) && (
        <p className={s.aside}>
          Edits are read from Qiskit and OpenQASM. Switch to either to write code here.
        </p>
      )}

      {error && (
        <p id="code-error" className={s.error} role="alert">
          <span className="label" style={{ color: "var(--error)" }}>
            line {error.line}{error.column > 1 ? `, col ${error.column}` : ""}
          </span>{" "}
          {error.message} <span className={s.kept}>The canvas is unchanged.</span>
        </p>
      )}

      {dirty && (
        <div className={s.sync} role="status">
          <p>
            {blockedSwitch
              ? "Apply or discard this edit before switching SDK."
              : canvasMoved
                ? "The canvas changed while you were editing. Applying replaces it with the code."
                : "You've edited the code. The canvas hasn't changed yet."}
          </p>
          <div className={s.syncActions}>
            <button type="button" className={s.apply} onClick={apply}>Apply to canvas</button>
            <button type="button" className={s.discard} onClick={discard}>Discard</button>
          </div>
        </div>
      )}

      {notes.length > 0 && !dirty && (
        <p className={s.aside}>{notes.join(" ")}</p>
      )}
    </div>
  );
}
