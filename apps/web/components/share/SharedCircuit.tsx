"use client";

/**
 * A circuit opened from a link — PRD E11-S2.
 *
 * "Permalink opens the exact circuit read-only; Fork copies it into my
 * workspace." Read-only means the canvas takes no edits; it does not mean the
 * circuit cannot be looked at properly, so it is run on arrival and every state
 * view is available. Forking puts a copy on the bench, and says first if that
 * would replace something already there.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { CodePanel } from "@/components/code/CodePanel";
import { Histogram, probabilityMap } from "@/components/viz/Histogram";
import { BlochRow } from "@/components/viz/BlochSphere";
import { StateTable } from "@/components/viz/StateTable";
import { DensityMatrix } from "@/components/viz/DensityMatrix";
import { Button, Chip, Registration, Segmented } from "@/components/ui/primitives";
import { circuitDepth, gateCount } from "@/lib/ir/types";
import { FORK_FLAG, decodeCircuit } from "@/lib/io/share";
import { allQubitStates } from "@/lib/sim/analysis";
import { simulate, MAX_SIM_QUBITS } from "@/lib/sim/statevector";
import type { Sdk } from "@/lib/render";
import { useCircuit } from "@/stores/circuitStore";
import s from "./SharedCircuit.module.css";

type View = "plot" | "bloch" | "table" | "density" | "code";

const DRAFT_KEY = "quriosity.bench.draft.v1";

export function SharedCircuit({ code }: { code: string }) {
  const router = useRouter();
  const circuit = useMemo(() => decodeCircuit(code), [code]);
  const [view, setView] = useState<View>("plot");
  const [sdk, setSdk] = useState<Sdk>("qiskit");
  const [benchBusy, setBenchBusy] = useState(false);

  const result = useMemo(() => {
    if (!circuit || circuit.qubits > MAX_SIM_QUBITS) return null;
    try {
      return simulate(circuit);
    } catch {
      return null;
    }
  }, [circuit]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      const draft = raw ? JSON.parse(raw) : null;
      setBenchBusy(Boolean(draft?.circuit?.gates?.length));
    } catch {
      setBenchBusy(false);
    }
  }, []);

  if (!circuit) {
    return (
      <main className={s.main}>
        <h1 className="statement statement--s">This link doesn&apos;t open a circuit.</h1>
        <p className="prose" style={{ marginTop: "var(--s-4)" }}>
          It may have been cut short when it was copied. A share link carries the
          whole circuit, so every character of it matters. Ask for it again, or
          build something of your own.
        </p>
        <div style={{ marginTop: "var(--s-5)" }}>
          <Link href="/build">Open the bench →</Link>
        </div>
      </main>
    );
  }

  function fork() {
    const store = useCircuit.getState();
    store.setCircuit(circuit!);
    store.saveDraft();
    try { window.sessionStorage.setItem(FORK_FLAG, "1"); } catch { /* no session storage */ }
    router.push("/build");
  }

  const states = result ? allQubitStates(result) : [];

  return (
    <main className={s.main}>
      <header className={s.head}>
        <div>
          <span className="label">Shared circuit · read-only</span>
          <h1 className={s.name}>{circuit.metadata.name ?? "Untitled circuit"}</h1>
        </div>
        <div className={s.actions}>
          <Chip>{circuit.qubits} qubits</Chip>
          <Chip>{gateCount(circuit)} gates</Chip>
          <Chip>depth {circuitDepth(circuit) + 1}</Chip>
          <Button variant="primary" onClick={fork}>Fork into my bench</Button>
        </div>
      </header>

      {benchBusy && (
        <p className={s.note}>
          Your bench already has a circuit on it. Forking replaces it — save that one
          first if you want to keep it.
        </p>
      )}

      <div className={s.stage}>
        <Registration />
        <CircuitCanvas circuit={circuit} minColumns={4} qubitStates={states} readOnly />
      </div>

      <div className={s.panel}>
        <div className={s.panelHead}>
          <span className="label">{view === "code" ? "Code" : "What it does"}</span>
          <Segmented<View>
            ariaLabel="View"
            value={view}
            onChange={setView}
            options={[
              { value: "plot", label: "Plot" },
              { value: "bloch", label: "Bloch" },
              { value: "table", label: "Table" },
              { value: "density", label: "Density" },
              { value: "code", label: "Code" },
            ]}
          />
        </div>

        {view === "code" ? (
          <CodePanel circuit={circuit} sdk={sdk} onSdk={setSdk} />
        ) : !result ? (
          <p className={s.note}>
            {circuit.qubits} qubits is past what this browser simulates ({MAX_SIM_QUBITS}). The code view still works.
          </p>
        ) : (
          <>
            {view === "plot" && (
              <Histogram
                qubits={result.qubits}
                actual={probabilityMap(result.probabilities, result.qubits)}
                height={170}
                dense={result.qubits <= 3}
              />
            )}
            {view === "bloch" && <BlochRow states={states} size={130} />}
            {view === "table" && <StateTable result={result} />}
            {view === "density" && (
              <DensityMatrix branches={result.branches} qubits={result.qubits} mixedRegister={result.mixed} />
            )}
          </>
        )}
      </div>

      <p className={s.footnote}>
        This link carries the circuit itself. Nothing was uploaded to open it, and
        nobody can change what it shows.
      </p>
    </main>
  );
}
