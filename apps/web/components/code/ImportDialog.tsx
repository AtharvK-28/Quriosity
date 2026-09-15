"use client";

/**
 * Import — PRD E3-S4 (`QasmImportDialog` in the Design Doc inventory).
 *
 * Paste or open an OpenQASM program, or straight-line Qiskit, and see what it
 * becomes before it touches the bench. The preview is the circuit summary a
 * screen reader gets, so what is shown is exactly what will be loaded. Loading
 * is one undoable edit.
 */

import { useMemo, useState } from "react";
import { Button, Segmented } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/Dialog";
import { gateCount, type Circuit } from "@/lib/ir/types";
import { parseQasm } from "@/lib/io/qasm";
import { parseQiskit } from "@/lib/io/qiskit";
import { circuitSummary } from "@/components/circuit/CircuitCanvas";
import s from "./ImportDialog.module.css";

type Format = "auto" | "qasm" | "qiskit";

/** OpenQASM announces itself; Qiskit mentions QuantumCircuit. */
export function detectFormat(text: string): "qasm" | "qiskit" {
  if (/^\s*(\/\/.*\n\s*)*OPENQASM\b/.test(text) || /\bqubit\s*\[|\bqreg\b/.test(text)) return "qasm";
  return "qiskit";
}

const MAX_BYTES = 200_000;

export function ImportDialog({
  open,
  onClose,
  onImport,
  maxQubits,
}: {
  open: boolean;
  onClose(): void;
  onImport(c: Circuit): void;
  /** The mode's tier cap. A larger circuit is refused here, not at Run. */
  maxQubits: number;
}) {
  const [text, setText] = useState("");
  const [format, setFormat] = useState<Format>("auto");
  const [fileError, setFileError] = useState<string | null>(null);

  const effective = format === "auto" ? detectFormat(text) : format;
  const result = useMemo(() => {
    if (!text.trim()) return null;
    return effective === "qasm" ? parseQasm(text) : parseQiskit(text);
  }, [text, effective]);

  const overCap = result?.ok && result.circuit.qubits > maxQubits;

  async function openFile(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setFileError(`That file is ${Math.round(file.size / 1024)} KB. The limit is ${MAX_BYTES / 1000} KB.`);
      return;
    }
    const body = await file.text();
    setText(body);
    if (/\.qasm$/i.test(file.name)) setFormat("qasm");
    else if (/\.py$/i.test(file.name)) setFormat("qiskit");
  }

  function close() {
    setFileError(null);
    onClose();
  }

  return (
    <Dialog open={open} title="Import a circuit" onClose={close} wide>
      <div className={s.body}>
        <div className={s.row}>
          <Segmented<Format>
            ariaLabel="Format"
            value={format}
            onChange={setFormat}
            options={[
              { value: "auto", label: `Detect${format === "auto" && text.trim() ? ` · ${effective === "qasm" ? "QASM" : "Qiskit"}` : ""}` },
              { value: "qasm", label: "OpenQASM" },
              { value: "qiskit", label: "Qiskit" },
            ]}
          />
          <label className={s.file}>
            <input type="file" accept=".qasm,.py,.txt,text/plain" onChange={(e) => void openFile(e.target.files?.[0])} />
            <span>Open a file…</span>
          </label>
        </div>

        <textarea
          className={s.source}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_BYTES))}
          placeholder={'OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[2] q;\nh q[0];\ncx q[0], q[1];'}
          spellCheck={false}
          rows={12}
          aria-label="Program to import"
        />

        {fileError && <p className={s.error} role="alert">{fileError}</p>}

        {result && !result.ok && (
          <p className={s.error} role="alert">
            <span className="label" style={{ color: "var(--error)" }}>
              line {result.error.line}{result.error.column > 1 ? `, col ${result.error.column}` : ""}
            </span>{" "}
            {result.error.message}
          </p>
        )}

        {result?.ok && (
          <div className={s.preview} role="status">
            <span className="label label--measure">
              {result.circuit.qubits} qubit{result.circuit.qubits === 1 ? "" : "s"} · {gateCount(result.circuit)} gate{gateCount(result.circuit) === 1 ? "" : "s"}
            </span>
            <p>{circuitSummary(result.circuit)}</p>
            {result.notes.length > 0 && <p className={s.note}>{result.notes.join(" ")}</p>}
            {overCap && (
              <p className={s.error}>
                This mode builds up to {maxQubits} qubits. Workbench mode goes further.
              </p>
            )}
          </div>
        )}

        <p className={s.scope}>
          Reads OpenQASM 2 and 3 with the standard gates, and Qiskit written one
          gate call per line. Loops, custom gates and classical control are
          refused by name rather than guessed at.
        </p>

        <div className={s.actions}>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!result?.ok || Boolean(overCap)}
            onClick={() => {
              if (result?.ok) {
                onImport(result.circuit);
                setText("");
                close();
              }
            }}
          >
            Replace the bench circuit
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
