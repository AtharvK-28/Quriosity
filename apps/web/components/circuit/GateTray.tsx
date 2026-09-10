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
 */

import { GATES, type GateSpec } from "@/lib/ir/gates";
import type { GateType } from "@/lib/ir/types";
import { UNITS } from "@/lib/curriculum/nodes";
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
  const unit = UNITS.find((u) => u.id === spec.unlocksIn);
  const title = locked
    ? `${spec.name} — opens in ${unit ? unit.title : spec.unlocksIn}`
    : `${spec.name} · ${spec.blurb}`;

  return (
    <button
      type="button"
      className={styles.item}
      data-held={held}
      data-locked={locked}
      disabled={locked}
      onClick={onPick}
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
  );
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
  pending: boolean;
}) {
  if (pending) {
    return (
      <p className={styles.hint}>
        Now pick the <b>target wire</b>. <b>Esc</b> cancels.
      </p>
    );
  }
  if (held) {
    const spec = GATES[held];
    if (spec.controlArity > 0) {
      return (
        <p className={styles.hint}>
          {spec.name}: click the <b>control wire</b> first, then the target.
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
      Pick a gate, then click a slot. Or use the keyboard: arrows to move, letter
      keys to place.
    </p>
  );
}
