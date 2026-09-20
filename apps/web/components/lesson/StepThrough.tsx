"use client";

/**
 * Step through what you built.
 *
 * Design Doc §3 calls the time scrubber "the memorable moment" and TRD T12's
 * acceptance test is a Bell circuit whose q0 vector "visibly rotates then
 * collapses to the centre". Both describe this.
 *
 * It lives on the PASS screen, and that placement is the whole point. The bench
 * has a scrubber, but a lesson switches to its pass beat the instant a run
 * grades — so on the one node where stepping matters most, u0.n3, a correct
 * H·H circuit passes and unmounts the build view before the learner can look at
 * anything. The state worth seeing is the one the end of the circuit has
 * already undone:
 *
 *   before → |0⟩        step 1 → |+⟩, on the equator        end → |0⟩
 *
 * The first and last frames are identical. Everything u0.n3 teaches is in the
 * middle one, and no end-state view can show it.
 *
 * The cursor is local state, not the shared store. The bench's scrubber drives
 * the whole page; this one drives only itself, so opening it cannot quietly
 * change what the histogram above it is reporting.
 */

import { useMemo, useState } from "react";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { BlochRow } from "@/components/viz/BlochSphere";
import { Slider } from "@/components/ui/primitives";
import { circuitDepth, type Circuit } from "@/lib/ir/types";
import { qubitState } from "@/lib/sim/analysis";
import { stateAtScrub, type RunOutput } from "@/stores/circuitStore";
import s from "./StepThrough.module.css";

export function StepThrough({ circuit, run }: { circuit: Circuit; run: RunOutput }) {
  const depth = circuitDepth(circuit) + 1;
  /** null is the end of the circuit; -1 is before anything has been applied. */
  const [column, setColumn] = useState<number | null>(null);

  const branches = useMemo(() => stateAtScrub(run, column), [run, column]);

  const states = useMemo(() => {
    if (!branches) return [];
    return Array.from({ length: run.result.qubits }, (_, q) =>
      qubitState(branches, run.result.qubits, q),
    );
  }, [branches, run.result.qubits]);

  const position =
    column === null ? "end" : column < 0 ? "before" : `step ${column + 1} of ${depth}`;

  return (
    <div className={s.wrap} data-instrument="step-through">
      <div className={s.stage}>
        <CircuitCanvas
          circuit={circuit}
          minColumns={Math.max(4, depth)}
          qubitStates={states}
          scrubColumn={column}
          readOnly
        />
      </div>

      <div className={s.scrubber}>
        <span className="label">Time</span>
        <span className={s.track}>
          <Slider
            value={column === null ? depth - 1 : column}
            min={-1}
            max={depth - 1}
            step={1}
            ariaLabel="Step through what you built"
            onChange={(v) => setColumn(v >= depth - 1 ? null : v)}
          />
        </span>
        <span className={s.position}>{position}</span>
      </div>

      <div className={s.state}>
        <BlochRow states={states} size={112} />
      </div>
    </div>
  );
}
