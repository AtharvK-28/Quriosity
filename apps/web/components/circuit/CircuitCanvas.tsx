"use client";

/**
 * The circuit canvas.
 *
 * A fixed grid, not an infinite one — a circuit has a finite shape and that is
 * a feature. Time runs left to right; each wire is a qubit; a column is a time
 * step. This is the spatial model everyone in the field already reads, and
 * inventing a new one out of vanity would cost the learner their transfer to
 * every other tool.
 *
 * The canvas is a pure renderer over the IR in the store. It holds no circuit
 * state of its own — only transient interaction state (what is being dragged,
 * where the keyboard cursor sits).
 *
 * Keyboard operation is a full alternative to the mouse, not a shortcut layer
 * over it: every node in the curriculum can be completed without a pointer.
 * The grammar is Design Doc §11.2, and `KEYBOARD_GRAMMAR` below is the one
 * source the shortcut sheet and the docs page print from.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GATES, formatParam, isXTarget } from "@/lib/ir/gates";
import { circuitDepth, gateQubits, type Circuit, type Gate, type GateType } from "@/lib/ir/types";
import type { QubitState } from "@/lib/sim/analysis";
import { ParameterPopover } from "./ParameterPopover";
import styles from "./CircuitCanvas.module.css";

const WIRE_LABEL = 44;
const WIRE_GAP = 56;
const COL_PITCH = 64;
const TOP_PAD = 28;
/** Horizontal room per entangled-pair bracket at the end of the circuit. */
const PAIR_PITCH = 22;

/** Every key the canvas understands, for the shortcut sheet and /docs. */
export const KEYBOARD_GRAMMAR: Array<{ keys: string; action: string }> = [
  { keys: "← → ↑ ↓", action: "Move the placement cursor across columns and wires" },
  { keys: "H X Y Z S T", action: "Place that gate at the cursor" },
  { keys: "⇧S  ⇧T", action: "Place S† or T†" },
  { keys: "P", action: "Place a phase gate; the angle field opens" },
  { keys: "R then X / Y / Z", action: "Place a rotation; the angle field opens" },
  { keys: "I", action: "Place an identity (idle time)" },
  { keys: "M", action: "Measure the wire at the cursor" },
  { keys: "0", action: "Reset the wire at the cursor to |0⟩" },
  { keys: "C", action: "Begin a CNOT: control here, then arrows and Enter for the target" },
  { keys: "⇧C", action: "Begin a controlled-Z the same way" },
  { keys: "K", action: "Begin a Toffoli: two controls, then the target" },
  { keys: "W", action: "Begin a SWAP: this wire, then the other" },
  { keys: "B", action: "Begin a barrier: first wire here, Enter on the last" },
  { keys: "Enter", action: "Confirm the next wire of a gate being placed" },
  { keys: "Space", action: "Select the gate at the cursor (opens its angle, if it has one)" },
  { keys: "Alt + arrows", action: "Move the gate at the cursor" },
  { keys: "Delete / Backspace", action: "Remove the gate at the cursor" },
  { keys: "Esc", action: "Cancel a placement, or deselect" },
];

export interface CircuitCanvasProps {
  circuit: Circuit;
  /** Minimum columns to draw, so an empty circuit still looks like a circuit. */
  minColumns?: number;
  selectedGateId?: string | null;
  highlighted?: string[];
  /** Per-wire state, used only for the entanglement indicator on the wire. */
  qubitStates?: QubitState[];
  /**
   * Wire pairs entangled with each other and nothing else (PRD E5-S6). Drawn
   * as brackets past the last column, where the state they describe exists.
   */
  pairs?: Array<[number, number]>;
  /** Column the time cursor sits at. null means "the end of the circuit". */
  scrubColumn?: number | null;
  /** A gate picked up from the tray, awaiting a slot. */
  held?: { type: GateType; params: number[] } | null;
  /** A multi-wire gate with some wires chosen, awaiting the rest. */
  pendingControl?: { type: GateType; control: number; column: number; picked?: number[]; need?: number } | null;

  readOnly?: boolean;

  onPlace?(type: GateType, qubit: number, column: number): void;
  onCompleteControlled?(target: number): void;
  onCancelPending?(): void;
  onSelect?(id: string | null): void;
  onMove?(id: string, qubit: number, column: number): void;
  onRemove?(id: string): void;
  /** Set the angle on a parameterised gate. Enables the parameter popover. */
  onParams?(id: string, params: number[]): void;
}

export function CircuitCanvas({
  circuit,
  minColumns = 4,
  selectedGateId = null,
  highlighted = [],
  qubitStates,
  pairs = [],
  scrubColumn = null,
  held = null,
  pendingControl = null,
  readOnly = false,
  onPlace,
  onCompleteControlled,
  onCancelPending,
  onSelect,
  onMove,
  onRemove,
  onParams,
}: CircuitCanvasProps) {
  const depth = circuitDepth(circuit);
  const columns = Math.max(minColumns, depth + 2);

  const [cursor, setCursor] = useState<{ q: number; c: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** `R` waits for an axis. */
  const [prefix, setPrefix] = useState<"r" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const pairColumns = pairs.length;
  const width = WIRE_LABEL + columns * COL_PITCH + (pairColumns > 0 ? pairColumns * PAIR_PITCH + 12 : 0);
  const height = TOP_PAD * 2 + circuit.qubits * WIRE_GAP;

  const x = (col: number) => WIRE_LABEL + col * COL_PITCH + COL_PITCH / 2;
  const y = (q: number) => TOP_PAD + q * WIRE_GAP + WIRE_GAP / 2;

  const highlightSet = useMemo(() => new Set(highlighted), [highlighted]);
  const interactive = !readOnly;

  /** Viewport position of a slot, for the portalled parameter popover. */
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  /** The selected gate, when it has an angle to set. */
  const editingGate = useMemo(() => {
    if (!onParams || !selectedGateId || readOnly) return null;
    const g = circuit.gates.find((x) => x.id === selectedGateId);
    return g && GATES[g.type].paramArity > 0 ? g : null;
  }, [onParams, selectedGateId, circuit.gates, readOnly]);

  /** The earliest column holding a gate that could correlate two wires. */
  const entanglingColumn = useMemo(() => {
    const cols = circuit.gates
      .filter((g) => gateQubits(g).length > 1 && g.type !== "barrier")
      .map((g) => g.column);
    return cols.length > 0 ? Math.min(...cols) : null;
  }, [circuit.gates]);

  /**
   * Measurements followed by coherent work on the same wire. PRD E2-S5: mid-
   * circuit measurement is allowed AND marked, because it changes what the
   * rest of the wire does (M7).
   */
  const midCircuit = useMemo(() => {
    const mid = new Set<string>();
    for (const g of circuit.gates) {
      if (g.type !== "measure") continue;
      const wire = g.targets[0];
      const later = circuit.gates.some(
        (o) => o.column > g.column && o.type !== "barrier" && o.type !== "measure" && gateQubits(o).includes(wire),
      );
      if (later) mid.add(g.id);
    }
    return mid;
  }, [circuit.gates]);

  const picked = pendingControl?.picked ?? (pendingControl ? [pendingControl.control] : []);

  /* -- Placement ------------------------------------------------------------ */

  const handleSlot = useCallback(
    (q: number, c: number) => {
      if (!interactive) return;
      if (pendingControl) {
        onCompleteControlled?.(q);
        return;
      }
      if (held) {
        onPlace?.(held.type, q, c);
        return;
      }
      setCursor({ q, c });
      onSelect?.(null);
    },
    [interactive, pendingControl, held, onCompleteControlled, onPlace, onSelect],
  );

  /* -- Keyboard grammar ----------------------------------------------------- */

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!interactive) return;
      if (e.metaKey || e.ctrlKey) return; // ⌘Z, ⌘↵ and friends belong to the page

      if (e.key === "Escape") {
        setPrefix(null);
        onCancelPending?.();
        onSelect?.(null);
        return;
      }

      const cur = cursor ?? { q: 0, c: 0 };
      const at = gateAtSlot(circuit, cur.q, cur.c);

      // Alt + arrows move the gate under the cursor, and the cursor with it.
      if (e.altKey && e.key.startsWith("Arrow")) {
        e.preventDefault();
        if (!at) return;
        const dq = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        const dc = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const lowest = Math.min(...gateQubits(at));
        const nq = lowest + dq;
        const nc = Math.max(0, at.column + dc);
        onMove?.(at.id, nq, nc);
        setCursor({ q: Math.max(0, Math.min(circuit.qubits - 1, cur.q + dq)), c: nc });
        return;
      }

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setCursor({ q: Math.max(0, cur.q - 1), c: cur.c });
          return;
        case "ArrowDown":
          e.preventDefault();
          setCursor({ q: Math.min(circuit.qubits - 1, cur.q + 1), c: cur.c });
          return;
        case "ArrowLeft":
          e.preventDefault();
          setCursor({ q: cur.q, c: Math.max(0, cur.c - 1) });
          return;
        case "ArrowRight":
          e.preventDefault();
          setCursor({ q: cur.q, c: Math.min(columns - 1, cur.c + 1) });
          return;
        case "Enter":
          e.preventDefault();
          // Confirms the next wire of a half-placed multi-wire gate.
          if (pendingControl) onCompleteControlled?.(cur.q);
          return;
        case " ":
          e.preventDefault();
          if (at) onSelect?.(at.id);
          return;
        case "Backspace":
        case "Delete": {
          e.preventDefault();
          if (at) onRemove?.(at.id);
          else if (selectedGateId) onRemove?.(selectedGateId);
          return;
        }
      }

      const key = e.key.toLowerCase();
      const shift = e.shiftKey;

      const placeHere = (type: GateType, advance = true) => {
        e.preventDefault();
        onPlace?.(type, cur.q, cur.c);
        if (advance) setCursor({ q: cur.q, c: Math.min(columns - 1, cur.c + 1) });
      };

      if (prefix === "r") {
        setPrefix(null);
        if (key === "x" || key === "y" || key === "z") placeHere(`r${key}` as GateType, false);
        return;
      }

      // Multi-wire gates start here; arrows and Enter pick the remaining wires.
      if (key === "c") return placeHere(shift ? "cz" : "cx", false);
      if (key === "k") return placeHere("ccx", false);
      if (key === "w") return placeHere("swap", false);
      if (key === "b") return placeHere("barrier", false);

      if (key === "r") { e.preventDefault(); setPrefix("r"); return; }
      if (key === "p") return placeHere("p", false);
      if (key === "0") return placeHere("reset");
      if (key === "s") return placeHere(shift ? "sdg" : "s");
      if (key === "t") return placeHere(shift ? "tdg" : "t");

      const single: Record<string, GateType> = { h: "h", x: "x", y: "y", z: "z", m: "measure", i: "i" };
      if (single[key]) placeHere(single[key]);
    },
    [
      interactive, cursor, circuit, columns, pendingControl, selectedGateId, prefix,
      onCancelPending, onSelect, onCompleteControlled, onRemove, onPlace, onMove,
    ],
  );

  /* -- Drag to move --------------------------------------------------------- */

  useEffect(() => {
    if (!dragging) return;

    const move = (e: PointerEvent) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const c = Math.max(0, Math.round((localX - WIRE_LABEL - COL_PITCH / 2) / COL_PITCH));
      const q = Math.max(
        0,
        Math.min(circuit.qubits - 1, Math.round((localY - TOP_PAD - WIRE_GAP / 2) / WIRE_GAP)),
      );
      onMove?.(dragging, q, c);
    };
    const up = () => setDragging(null);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, circuit.qubits, onMove]);

  useEffect(() => {
    if (!editingGate) {
      setAnchor(null);
      return;
    }
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({
        x: rect.left + x(editingGate.column),
        y: rect.top + y(editingGate.targets[0]),
      });
    };
    place();
    const scroller = rootRef.current?.parentElement;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    scroller?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      scroller?.removeEventListener("scroll", place);
    };
    // x and y are pure functions of the fixed grid metrics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingGate?.id, editingGate?.column, editingGate?.targets[0]]);

  /* -- Render --------------------------------------------------------------- */

  const cursorColumn = scrubColumn;
  const showCursor = cursorColumn !== null && cursorColumn >= 0;
  const pairsLeft = WIRE_LABEL + columns * COL_PITCH + 6;

  return (
    <div className={styles.wrap}>
      <div
        ref={rootRef}
        className={styles.canvas}
        style={{ width, height }}
        role="application"
        aria-label={circuitSummary(circuit)}
        aria-roledescription="circuit editor"
        tabIndex={interactive ? 0 : -1}
        onKeyDown={onKeyDown}
      >
        {/* Wires.

            A wire that ends up entangled is dashed — but only from the column
            where it could first have become entangled. Dashing the whole wire
            claims q0 had no state of its own before the CNOT ran, which is not
            what happened and not what the lesson is teaching. */}
        {Array.from({ length: circuit.qubits }, (_, q) => {
          const entangled = qubitStates?.[q]?.entangled ?? false;
          const from = entangled ? entanglingColumn : null;
          return (
            <div key={`w${q}`} className={styles.wireRow} style={{ top: y(q) }}>
              <span className={styles.wireLabel} aria-hidden>
                q{q}
                <span className={styles.wireOrigin}>|0⟩</span>
              </span>
              <span className={styles.wireLine} />
              {from !== null && (
                <span
                  className={styles.wireEntangled}
                  style={{ left: x(from) }}
                  aria-hidden
                />
              )}
            </div>
          );
        })}

        {/* Everything after the time cursor has not been applied yet. */}
        {showCursor && cursorColumn < depth && (
          <div
            className={styles.futureVeil}
            style={{ left: x(cursorColumn) + COL_PITCH / 2 }}
            aria-hidden
          />
        )}

        {/* Drop slots */}
        {interactive &&
          Array.from({ length: circuit.qubits }, (_, q) =>
            Array.from({ length: columns }, (_, c) => (
              <button
                key={`s${q}-${c}`}
                type="button"
                className={styles.slot}
                style={{ top: y(q), left: x(c) }}
                data-armed={Boolean(held || pendingControl)}
                data-cursor={cursor?.q === q && cursor?.c === c}
                onClick={() => handleSlot(q, c)}
                tabIndex={-1}
                aria-label={`qubit ${q}, column ${c}${gateAtSlot(circuit, q, c) ? ", occupied" : ", empty"}`}
              />
            )),
          )}

        {/* Wires eligible to receive the next wire of a half-placed gate */}
        {pendingControl &&
          Array.from({ length: circuit.qubits }, (_, q) => {
            const isBarrier = pendingControl.type === "barrier";
            if (!isBarrier && picked.includes(q)) return null;
            return (
              <div
                key={`p${q}`}
                className={styles.pendingWire}
                data-picked={picked.includes(q)}
                style={{ top: y(q) }}
                onClick={() => onCompleteControlled?.(q)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onCompleteControlled?.(q)}
                aria-label={pendingLabel(pendingControl, picked, q)}
              />
            );
          })}

        {/* The wires already chosen, marked where the gate will go. */}
        {pendingControl &&
          picked.map((q, i) => (
            <span
              key={`pk${q}-${i}`}
              className={styles.pickedMark}
              style={{ top: y(q), left: x(pendingControl.column) }}
              aria-hidden
            />
          ))}

        {(pendingControl || prefix) && (
          <span
            className={styles.pendingHint}
            style={{ top: y(circuit.qubits - 1) + 30, left: WIRE_LABEL }}
            role="status"
          >
            {prefix === "r" ? "Rotation · press X, Y or Z" : pendingHint(pendingControl!, picked)}
          </span>
        )}

        {/* Gates */}
        {circuit.gates.map((g) => (
          <GateGlyph
            key={g.id}
            gate={g}
            x={x}
            y={y}
            selected={selectedGateId === g.id}
            highlighted={highlightSet.has(g.id)}
            dragging={dragging === g.id}
            interactive={interactive}
            midCircuit={midCircuit.has(g.id)}
            onSelect={() => onSelect?.(g.id)}
            onDragStart={() => setDragging(g.id)}
          />
        ))}

        {/* Pairwise entanglement — E5-S6. One bracket per pair, past the end
            of the circuit, because that is where the state it describes is. */}
        {pairs.map(([a, b], i) => (
          <span
            key={`pair${a}-${b}`}
            className={styles.pairBracket}
            style={{
              left: pairsLeft + i * PAIR_PITCH,
              top: y(Math.min(a, b)),
              height: Math.abs(b - a) * WIRE_GAP,
            }}
            title={`q${a} and q${b} are entangled with each other`}
            aria-hidden
          />
        ))}
        {pairs.length > 0 && (
          <p className="sr-only">
            {pairs.map(([a, b]) => `q${a} and q${b} are entangled with each other.`).join(" ")}
          </p>
        )}

        {/* The time cursor */}
        {showCursor && (
          <div className={styles.timeCursor} style={{ left: x(cursorColumn) }} aria-hidden>
            <span className={styles.timeCursorCap} />
          </div>
        )}

        {/* Empty state — the wires are already there, because the qubits are. */}
        {circuit.gates.length === 0 && interactive && !pendingControl && (
          <span className={styles.emptyHint} style={{ top: y(0) - 34, left: x(0) - 22 }}>
            Drag a gate here, or press H
          </span>
        )}
      </div>

      {/* The angle control. Portalled, so it is anchored in viewport
          coordinates and cannot be clipped by the scroll container. */}
      {editingGate && onParams && anchor && (
        <ParameterPopover
          gate={editingGate}
          x={anchor.x}
          y={anchor.y}
          onChange={(params) => onParams(editingGate.id, params)}
          onClose={() => {
            onSelect?.(null);
            // Hand focus back to the grid, so a keyboard user carries on
            // building from where they were.
            rootRef.current?.focus();
          }}
        />
      )}

      {/* Screen readers get the circuit as a sentence, not as a grid to explore. */}
      <p className="sr-only">{circuitSummary(circuit)}</p>
    </div>
  );
}

/* -- Placement copy ---------------------------------------------------------- */

/** Which wire the next pick is for, in the gate's own terms. */
function nextRole(type: GateType, picked: number[]): string {
  const spec = GATES[type];
  if (type === "barrier") return "last wire";
  if (type === "swap") return "other wire";
  if (picked.length < spec.controlArity) return picked.length === 1 ? "second control" : "control";
  return "target";
}

function pendingLabel(p: { type: GateType }, picked: number[], q: number): string {
  const role = nextRole(p.type, picked);
  if (p.type === "barrier") return `End this barrier on qubit ${q}`;
  return `Put the ${role} of this ${GATES[p.type].name} on qubit ${q}`;
}

function pendingHint(p: { type: GateType }, picked: number[]): string {
  const role = nextRole(p.type, picked);
  return `Pick the ${role} · Esc cancels`;
}

/* -- Gate rendering ---------------------------------------------------------- */

function GateGlyph({
  gate,
  x,
  y,
  selected,
  highlighted,
  dragging,
  interactive,
  midCircuit,
  onSelect,
  onDragStart,
}: {
  gate: Gate;
  x: (c: number) => number;
  y: (q: number) => number;
  selected: boolean;
  highlighted: boolean;
  dragging: boolean;
  interactive: boolean;
  midCircuit: boolean;
  onSelect(): void;
  onDragStart(): void;
}) {
  const spec = GATES[gate.type];
  const wires = gateQubits(gate);
  const top = Math.min(...wires);
  const bottom = Math.max(...wires);
  const cx = x(gate.column);

  const pointer = (e: React.PointerEvent) => {
    if (!interactive) return;
    e.stopPropagation();
    onSelect();
    onDragStart();
  };

  const common = {
    onPointerDown: pointer,
    "data-highlighted": highlighted,
    "data-dragging": dragging,
  } as const;

  if (gate.type === "barrier") {
    return (
      <div
        className={styles.barrier}
        style={{
          left: cx,
          top: y(top) - 24,
          height: (bottom - top) * WIRE_GAP + 48,
        }}
        data-selected={selected}
        {...common}
        role="button"
        tabIndex={-1}
        aria-label={describeGate(gate)}
      />
    );
  }

  return (
    <>
      {/* One vertical connector at the column centre, at full weight. */}
      {bottom > top && (
        <div
          className={styles.connector}
          style={{ left: cx, top: y(top), height: (bottom - top) * WIRE_GAP }}
          data-highlighted={highlighted}
          aria-hidden
        />
      )}

      {/* Control dots */}
      {gate.controls.map((q) => (
        <div
          key={`c${q}`}
          className={styles.control}
          style={{ left: cx, top: y(q) }}
          {...common}
          aria-hidden
        />
      ))}

      {/* Targets */}
      {gate.type === "swap" ? (
        gate.targets.map((q) => (
          <div key={`sw${q}`} className={styles.swapMark} style={{ left: cx, top: y(q) }} {...common} aria-hidden />
        ))
      ) : isXTarget(gate.type) ? (
        <div
          className={styles.xTarget}
          style={{ left: cx, top: y(gate.targets[0]) }}
          {...common}
          data-selected={selected}
          role="button"
          tabIndex={interactive ? 0 : -1}
          aria-label={describeGate(gate)}
        />
      ) : (
        <div
          className={styles.gate}
          style={{ left: cx, top: y(gate.targets[0]) }}
          {...common}
          data-selected={selected}
          data-mid={midCircuit}
          role="button"
          tabIndex={interactive ? 0 : -1}
          aria-label={describeGate(gate) + (midCircuit ? ", mid-circuit" : "")}
        >
          {gate.type === "measure" ? (
            <MeterGlyph />
          ) : (
            <span>
              {spec.glyph.replace("†", "")}
              {spec.glyph.includes("†") && <span className={styles.gateSub}>†</span>}
            </span>
          )}
          {gate.params.length > 0 && (
            <span className={styles.gateParam}>{formatParam(gate.params[0])}</span>
          )}
          {midCircuit && <span className={styles.midTag} aria-hidden>mid</span>}
        </div>
      )}
    </>
  );
}

/** The measurement glyph: a meter arc and a needle, not a letter. */
function MeterGlyph() {
  return (
    <svg className={styles.measureGlyph} viewBox="0 0 20 14" aria-hidden>
      <path d="M2 12 A8 8 0 0 1 18 12" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <line x1="10" y1="12" x2="15" y2="4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* -- Accessibility ----------------------------------------------------------- */

/** "Hadamard on qubit 0, column 1" — PRD A11Y / Design Doc §12 A5. */
export function describeGate(g: Gate): string {
  const spec = GATES[g.type];
  const param = g.params.length > 0 ? `, angle ${formatParam(g.params[0])}` : "";
  if (g.type === "barrier") {
    return g.targets.length > 1
      ? `Barrier across qubits ${Math.min(...g.targets)} to ${Math.max(...g.targets)}, column ${g.column}`
      : `Barrier on qubit ${g.targets[0]}, column ${g.column}`;
  }
  if (g.controls.length > 0) {
    return `${spec.name}, control on qubit ${g.controls.join(" and ")}, target on qubit ${g.targets.join(" and ")}, column ${g.column}${param}`;
  }
  return `${spec.name} on qubit ${g.targets.join(" and ")}, column ${g.column}${param}`;
}

/** "3 qubits, 4 gates, 2 measurements" plus the gate list, for screen readers. */
export function circuitSummary(c: Circuit): string {
  const measurements = c.gates.filter((g) => g.type === "measure").length;
  const operative = c.gates.filter((g) => g.type !== "barrier" && g.type !== "measure").length;
  const head = `Circuit with ${c.qubits} qubit${c.qubits === 1 ? "" : "s"}, ${operative} gate${operative === 1 ? "" : "s"}, ${measurements} measurement${measurements === 1 ? "" : "s"}.`;
  if (c.gates.length === 0) return `${head} Empty — every qubit is in state |0⟩.`;
  return `${head} ${c.gates.map(describeGate).join(". ")}.`;
}

function gateAtSlot(c: Circuit, q: number, col: number): Gate | undefined {
  return c.gates.find((g) => {
    if (g.column !== col) return false;
    if (g.type === "barrier") return q >= Math.min(...g.targets) && q <= Math.max(...g.targets);
    return gateQubits(g).includes(q);
  });
}
