"use client";

/**
 * The parameter control for rotation gates — PRD E2-S6.
 *
 * Without this, every RX/RY/RZ sits frozen at its placement default and three
 * nodes in U0 and U1 have no reachable answer at all. `tests/solvable.test.ts`
 * is what caught that, and it now guards it.
 *
 * Two affordances, deliberately, because the curriculum uses both:
 *
 *   - A DIAL, because U0 asks the learner to "drag until the coin is fair".
 *     Direct manipulation is the point of that node; typing 1.5708 is not.
 *   - A FIELD, because U1 asks for a specific angle and π/3 is the honest way
 *     to write it. It accepts radians, degrees and π-expressions, and rejects
 *     bad input inline without clearing what was typed.
 *
 * The readout underneath shows what the angle DOES — P(|1⟩) for the rotations
 * that change odds, and the phase turn for the ones that do not. A learner
 * aiming at "85% of the time" should not have to invert sin²(θ/2) by hand.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GATES, formatParam, parseParam } from "@/lib/ir/gates";
import type { Gate } from "@/lib/ir/types";
import s from "./ParameterPopover.module.css";

export interface ParameterPopoverProps {
  gate: Gate;
  /** Viewport position of the gate glyph's centre. */
  x: number;
  y: number;
  /**
   * What this wire actually reads, simulated against the whole circuit. null
   * when the register is too large to re-simulate on every drag frame, in which
   * case the readout says so rather than guessing.
   */
  probabilityOne?: number | null;
  onChange(params: number[]): void;
  onClose(): void;
}

export function ParameterPopover({
  gate,
  x,
  y,
  probabilityOne = null,
  onChange,
  onClose,
}: ParameterPopoverProps) {
  const spec = GATES[gate.type];
  const theta = gate.params[0] ?? 0;

  const [draft, setDraft] = useState(() => formatParam(theta));
  const [invalid, setInvalid] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Flip above the gate when there is not room below it — a popover that runs
  // off the bottom of the window is the same as no popover at all.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8 && y - rect.height - 36 > 0) setFlipped(true);
  }, [y]);

  // Follow the gate when the value changes from the dial.
  useEffect(() => {
    setDraft(formatParam(theta));
    setInvalid(false);
  }, [theta]);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  // Dismiss on an outside click or Escape, the way a popover should.
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  function commit(text: string) {
    setDraft(text);
    const parsed = parseParam(text);
    if (parsed === null) {
      // Rejected inline. The field keeps what was typed so the learner can fix
      // a typo rather than retype the whole thing.
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange([parsed]);
  }

  // What this angle actually does, in the terms the lesson asks about.
  const changesOdds = gate.type === "rx" || gate.type === "ry" || gate.type === "crx" || gate.type === "cry";
  // Simulated against the real circuit. sin²(θ/2) is only right for a rotation
  // acting on |0⟩ with nothing in front of it, and u1.n5 opens H as well as RY.
  const p1 = probabilityOne;

  const body = (
    <div
      ref={rootRef}
      className={s.pop}
      data-flipped={flipped}
      style={{ left: x, top: y }}
      role="dialog"
      aria-label={`${spec.name} angle`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className={s.head}>
        <span className="label label--ink">{spec.name}</span>
        <span className="label">q{gate.targets[0]}</span>
      </div>

      {/* The dial. This is the instrument U0 asks the learner to drag. */}
      <input
        type="range"
        className={s.dial}
        min={0}
        max={Math.PI * 2}
        step={Math.PI / 180}
        value={theta}
        aria-label={`${spec.name} angle, in radians`}
        onChange={(e) => onChange([parseFloat(e.target.value)])}
      />
      <div className={s.ticks} aria-hidden>
        <span>0</span>
        <span>π</span>
        <span>2π</span>
      </div>

      <div className={s.row}>
        <input
          ref={inputRef}
          className={s.field}
          data-invalid={invalid}
          value={draft}
          spellCheck={false}
          aria-label={`${spec.name} angle value`}
          aria-invalid={invalid}
          onChange={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!invalid) onClose();
            }
          }}
        />
        <span className={s.unit}>rad</span>
      </div>

      {invalid ? (
        <p className={s.note} data-tone="error">
          Not an angle I can read. Try <b>pi/4</b>, <b>90deg</b>, or a number.
        </p>
      ) : changesOdds ? (
        p1 === null ? (
          <p className={s.note}>
            Too many wires to read the odds live. Run to see them.
          </p>
        ) : (
          <>
            <p className={s.note}>
              Reads |1⟩ <b>{(p1 * 100).toFixed(1)}%</b> of the time.
            </p>
            {/* The number, as a picture. Ideation §5 asks for both: a learner
                dialling toward "85%" should see the bar approach it, not
                arithmetic alone. It winds with the dial because it is the
                simulated circuit, not a formula. */}
            <span
              className={s.meter}
              role="img"
              aria-label={`Reads one ${(p1 * 100).toFixed(0)} percent of the time`}
            >
              <span className={s.meterFill} style={{ width: `${p1 * 100}%` }} />
            </span>
          </>
        )
      ) : (
        <p className={s.note}>
          Turns the phase of |1⟩ by <b>{formatParam(theta)}</b>. The odds do not move.
        </p>
      )}

      <p className={s.hint}>Accepts radians, 90deg, or pi/4.</p>
    </div>
  );

  // Portalled to the body: the canvas scrolls horizontally, and anything
  // rendered inside it gets clipped at the container edge.
  return typeof document === "undefined" ? body : createPortal(body, document.body);
}
