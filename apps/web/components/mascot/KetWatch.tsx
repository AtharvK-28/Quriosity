"use client";

/**
 * Ket beside the canvas, showing one wire's state with its antenna.
 *
 * While you build, Ket's antenna is the Bloch vector of the wire it watches:
 * up for |0⟩, down after X, out to the side after H, a stub when the wire is
 * part-entangled and gone when it has no state of its own. It watches the
 * wire of the selected gate, or the one you pick.
 *
 * `live` simulates the circuit on every edit (bench, lessons). Without it
 * Ket shows `states`, the last run's, so a challenge is not answered for you
 * before you press Run.
 *
 * Shown only where the tutor may speak unasked (MODE.proactiveTutor): never
 * in Workbench mode.
 */

import { useMemo, useState, type ReactNode } from "react";
import { qubitState, type QubitState } from "@/lib/sim/analysis";
import { simulate } from "@/lib/sim/statevector";
import type { Circuit } from "@/lib/ir/types";
import { nameOf, type Vec3 } from "@/lib/ket/bloch";
import { MODE, useSession } from "@/stores/sessionStore";
import { Ket } from "./Ket";
import s from "./KetWatch.module.css";

/** Live simulation runs on every edit; past this it waits for Run. */
const LIVE_MAX_QUBITS = 10;

export function KetBeside({
  children,
  circuit,
  live = false,
  states,
  selectedGateId = null,
}: {
  children: ReactNode;
  circuit: Circuit;
  live?: boolean;
  states?: QubitState[];
  selectedGateId?: string | null;
}) {
  const { mode, hydrated } = useSession();
  if (!hydrated || !MODE[mode].proactiveTutor) return <>{children}</>;
  return (
    <div className={s.row}>
      <div className={s.main}>{children}</div>
      <KetWatch circuit={circuit} live={live} states={states} selectedGateId={selectedGateId} />
    </div>
  );
}

function KetWatch({
  circuit,
  live,
  states,
  selectedGateId,
}: {
  circuit: Circuit;
  live: boolean;
  states?: QubitState[];
  selectedGateId: string | null;
}) {
  const [picked, setPicked] = useState<number | null>(null);

  const liveStates = useMemo(() => {
    if (!live || circuit.qubits > LIVE_MAX_QUBITS) return null;
    try {
      const r = simulate(circuit);
      return Array.from({ length: circuit.qubits }, (_, q) => qubitState(r.branches, circuit.qubits, q));
    } catch {
      return null;
    }
  }, [live, circuit]);

  const shown = liveStates ?? states ?? null;
  const selectedWire = circuit.gates.find((g) => g.id === selectedGateId)?.targets[0];
  const wire = Math.min(circuit.qubits - 1, picked ?? selectedWire ?? 0);
  const st = shown?.[wire] ?? null;
  const measured = circuit.gates.some((g) => g.type === "measure");
  const words = st ? describe(st, measured) : null;

  return (
    <aside className={s.watch} aria-label={`Ket, watching q${wire}`}>
      <div className={s.stage}>
        {st ? (
          <Ket vector={[st.x, st.y, st.z]} mood={st.radius < 0.02 ? "curious" : "calm"} size={84} />
        ) : (
          <Ket mood="thinking" size={84} />
        )}
      </div>

      {circuit.qubits > 1 && (
        <div className={s.wires} role="group" aria-label="Wire Ket watches">
          {Array.from({ length: circuit.qubits }, (_, q) => (
            <button
              key={q}
              type="button"
              className={s.wire}
              aria-pressed={q === wire}
              onClick={() => setPicked(q)}
            >
              q{q}
            </button>
          ))}
        </div>
      )}

      <p className={s.words} role="status" aria-live="polite">
        {words ? (
          <>
            <b>{words.head}</b>
            {words.sub.split(" · ").map((line) => (
              <span key={line}>{line}</span>
            ))}
          </>
        ) : (
          <>
            <b>q{wire}</b>
            <span>{live ? "Too many wires to follow live" : "Run it and I'll show you"}</span>
          </>
        )}
      </p>
    </aside>
  );
}

/** What Ket says about the wire, in two short lines. */
function describe(st: QubitState, measured: boolean): { head: string; sub: string } {
  const p1 = `P(1) = ${Math.round(st.p1 * 100)}%`;
  const vec: Vec3 = [st.x, st.y, st.z];
  if (st.radius < 0.02) {
    return measured
      ? { head: "A coin toss", sub: `measured: no quantum state left · ${p1}` }
      : { head: "Entangled", sub: `no state of its own · ${p1}` };
  }
  if (st.entangled) {
    return { head: measured ? "Mixed" : "Partly entangled", sub: `vector length ${st.radius.toFixed(2)} · ${p1}` };
  }
  const name = nameOf(vec, 2e-3);
  if (name === "|0⟩") return { head: name, sub: "certain to read 0" };
  if (name === "|1⟩") return { head: name, sub: "certain to read 1" };
  if (name) return { head: name, sub: `an even lean · ${p1}` };
  return { head: `q${st.qubit}`, sub: p1 };
}
