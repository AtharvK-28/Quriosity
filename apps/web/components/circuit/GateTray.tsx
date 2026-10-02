"use client";

/**
 * The gate tray.
 *
 * In Guided mode the tray holds only the gates the current node allows, and
 * shows the rest ghosted with the unit that opens them. That is not artificial
 * scarcity — it is cognitive load management. A learner two nodes into U1 does
 * not benefit from twenty-two choices, and a locked gate that names its unlock
 * teaches the shape of the curriculum for free.
 *
 * In Workbench mode nothing is ever locked.
 *
 * A gate is placed two ways: drag it onto the canvas, or click it and then
 * click a slot (the keyboard has its own grammar on the canvas). A press
 * that moves a few pixels is a drag; one that does not is a click.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GATES, type GateSpec } from "@/lib/ir/gates";
import type { GateType } from "@/lib/ir/types";
import { NODES, UNITS } from "@/lib/curriculum/nodes";
import { useDrag } from "@/stores/dragStore";
import { GateMark } from "./GateMark";
import styles from "./GateTray.module.css";

export interface GateTrayProps {
  /** Gates this surface offers. Everything else is either hidden or ghosted. */
  available: GateType[];
  /** Gates to show ghosted rather than omit. Guided mode only. */
  locked?: GateType[];
  held?: GateType | null;
  orientation?: "horizontal" | "vertical";
  /**
   * Sort the tray into named families. Twenty-one identical squares is a
   * keyboard, not a palette — and the families are real (what changes odds,
   * what changes phase, what links wires), so the grouping teaches as well as
   * organises.
   */
  grouped?: boolean;
  onPick(type: GateType): void;
}

/** The families, in the order a learner meets them. */
const FAMILIES: Array<{ label: string; types: GateType[] }> = [
  { label: "Flip", types: ["x", "y", "z", "h", "i"] },
  { label: "Phase", types: ["s", "sdg", "t", "tdg", "p", "rz"] },
  { label: "Rotate", types: ["rx", "ry", "crx", "cry", "crz"] },
  { label: "Link two wires", types: ["cx", "cz", "swap", "ccx"] },
  { label: "Read & mark", types: ["measure", "reset", "barrier"] },
];

/** Which family a gate belongs to — its colour in the tray, wherever the tray is. */
export const FAMILY_OF: Partial<Record<GateType, string>> = Object.fromEntries(
  FAMILIES.flatMap((f, i) => f.types.map((t) => [t, ["flip", "phase", "rotate", "link", "read"][i]])),
);

export function GateTray({
  available,
  locked = [],
  held = null,
  orientation = "horizontal",
  grouped = false,
  onPick,
}: GateTrayProps) {
  if (grouped) {
    const offered = new Set(available);
    const families = FAMILIES.map((f) => ({
      label: f.label,
      types: f.types.filter((t) => offered.has(t)),
    })).filter((f) => f.types.length > 0);

    return (
      <div className={styles.families} role="toolbar" aria-label="Gates">
        {families.map((f) => (
          <div key={f.label} className={styles.family}>
            <span className={styles.familyLabel}>{f.label}</span>
            <div className={styles.row}>
              {f.types.map((type) => (
                <TrayItem
                  key={type}
                  spec={GATES[type]}
                  held={held === type}
                  onPick={() => onPick(type)}
                />
              ))}
            </div>
          </div>
        ))}
        {locked.length > 0 && (
          <div className={styles.family}>
            <span className={styles.familyLabel}>Later</span>
            <div className={styles.row}>
              {locked.map((type) => (
                <TrayItem key={type} spec={GATES[type]} locked />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.tray} data-orientation={orientation} role="toolbar" aria-label="Gates">
      {available.map((type) => (
        <TrayItem
          key={type}
          spec={GATES[type]}
          held={held === type}
          onPick={() => onPick(type)}
        />
      ))}
      {locked.map((type) => (
        <TrayItem key={type} spec={GATES[type]} locked />
      ))}
    </div>
  );
}

/** How far a press travels before it counts as a drag, in CSS pixels. */
const DRAG_SLOP = 5;

function TrayItem({
  spec,
  held = false,
  locked = false,
  onPick,
}: {
  spec: GateSpec;
  held?: boolean;
  locked?: boolean;
  onPick?(): void;
}) {
  const title = locked ? lockedTitle(spec) : `${spec.name} · ${spec.blurb}`;
  const press = useRef<{ x: number; y: number; id: number } | null>(null);
  /** Set when a press became a drag, so the click that follows is ignored. */
  const dragged = useRef(false);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (locked || e.button !== 0) return;
    press.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragged.current = false;
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.id) return;
      if (!dragged.current) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_SLOP) return;
        dragged.current = true;
        setDragging(true);
        useDrag.getState().begin(spec.type, e.clientX, e.clientY);
      }
      e.preventDefault();
      useDrag.getState().moveTo(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.id) return;
      press.current = null;
      if (dragged.current) {
        setDragging(false);
        useDrag.getState().end(e.clientX, e.clientY);
      }
    };
    const cancel = () => {
      if (!press.current) return;
      press.current = null;
      if (dragged.current) {
        setDragging(false);
        useDrag.getState().cancel();
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [spec.type]);

  return (
    <>
      <button
        type="button"
        className={styles.item}
        data-family={FAMILY_OF[spec.type] ?? "flip"}
        data-held={held}
        data-locked={locked}
        data-lifted={dragging || undefined}
        data-gate={spec.type}
        disabled={locked}
        onPointerDown={onPointerDown}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          onPick?.();
        }}
        title={title}
        aria-label={title}
      >
        {locked ? (
          <span className={styles.lock} aria-hidden>
            ◌
          </span>
        ) : (
          <GateMark spec={spec} />
        )}
      </button>
      {dragging && <DragGhost spec={spec} />}
    </>
  );
}

/** The gate under the pointer while it is carried to the canvas. */
function DragGhost({ spec }: { spec: GateSpec }) {
  const drag = useDrag((s) => s.drag);
  if (!drag || typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`${styles.item} ${styles.ghost}`}
      data-family={FAMILY_OF[spec.type] ?? "flip"}
      style={{ left: drag.x, top: drag.y }}
      aria-hidden
    >
      <GateMark spec={spec} />
    </div>,
    document.body,
  );
}

/**
 * PRD E2-S9: a locked gate names the node that unlocks it — "Toffoli unlocks
 * in Unit 4" when no node teaches it yet, the node itself when one does.
 */
function lockedTitle(spec: GateSpec): string {
  const node = NODES.find((n) => n.allowedGates.includes(spec.type));
  if (node) {
    const unit = UNITS.find((u) => u.id === node.unitId);
    return `${spec.name} unlocks at “${node.title}”${unit ? ` in Unit ${unit.ordinal}` : ""}`;
  }
  const unit = UNITS.find((u) => u.id === spec.unlocksIn);
  const ordinal = unit?.ordinal ?? parseInt(spec.unlocksIn.replace(/\D/g, ""), 10);
  return `${spec.name} unlocks in Unit ${Number.isFinite(ordinal) ? ordinal : spec.unlocksIn}`;
}

/**
 * The one line of instruction the tray needs, which changes with what the
 * learner is holding. Placement is two clicks, and saying so once is cheaper
 * than a tooltip they have to discover.
 */
export function TrayHint({
  held,
  pending,
}: {
  held: GateType | null;
  /** The gate being placed, with the wires already picked. */
  pending: boolean | { type: GateType; picked?: number[] } | null;
}) {
  if (pending) {
    const type = typeof pending === "object" ? pending.type : null;
    const picked = typeof pending === "object" ? pending.picked?.length ?? 1 : 1;
    const spec = type ? GATES[type] : null;
    const role =
      type === "barrier" ? "last wire it covers"
        : type === "swap" ? "other wire"
          : spec && picked < spec.controlArity ? "second control wire"
            : "target wire";
    return (
      <p className={styles.hint}>
        Now pick the <b>{role}</b>. <b>Esc</b> cancels.
      </p>
    );
  }
  if (held) {
    const spec = GATES[held];
    if (held === "barrier") {
      return (
        <p className={styles.hint}>
          Barrier: click the <b>first wire</b> it covers, then the last.
        </p>
      );
    }
    if (spec.controlArity > 1) {
      return (
        <p className={styles.hint}>
          {spec.name}: click <b>both control wires</b>, then the target.
        </p>
      );
    }
    if (spec.controlArity > 0) {
      return (
        <p className={styles.hint}>
          {spec.name}: click the <b>control wire</b> first, then the target.
        </p>
      );
    }
    if (spec.targetArity > 1) {
      return (
        <p className={styles.hint}>
          {spec.name}: click <b>one wire</b>, then the other.
        </p>
      );
    }
    return (
      <p className={styles.hint}>
        Click a slot on the wire to place <b>{spec.name}</b>.
      </p>
    );
  }
  return (
    <p className={styles.hint}>
      Drag a gate onto a wire, or click it and then a slot. Or use the keyboard:
      arrows to move, letter keys to place.
    </p>
  );
}
