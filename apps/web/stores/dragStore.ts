"use client";

/**
 * A gate being dragged out of the tray.
 *
 * The tray and the canvas are siblings on every page that has both, so the
 * drag lives here rather than in either of them. The tray starts it and moves
 * it; a canvas registers itself as a drop target and, while a drag is on,
 * previews where the gate would land. Releasing asks each registered target
 * in turn whether the point is theirs.
 *
 * Only the tray's gates are dragged through here. Moving a gate that is
 * already on the canvas is the canvas's own business.
 */

import { create } from "zustand";
import type { GateType } from "@/lib/ir/types";

export interface TrayDrag {
  type: GateType;
  /** Viewport coordinates of the pointer. */
  x: number;
  y: number;
}

/** Returns true when it took the drop. */
export type DropTarget = (type: GateType, x: number, y: number) => boolean;

interface DragState {
  drag: TrayDrag | null;
  targets: Set<DropTarget>;
  begin(type: GateType, x: number, y: number): void;
  moveTo(x: number, y: number): void;
  /** Ends the drag. Returns true when a target took it. */
  end(x: number, y: number): boolean;
  cancel(): void;
  register(target: DropTarget): () => void;
}

export const useDrag = create<DragState>((set, get) => ({
  drag: null,
  targets: new Set(),

  begin(type, x, y) {
    set({ drag: { type, x, y } });
  },

  moveTo(x, y) {
    const d = get().drag;
    if (d) set({ drag: { ...d, x, y } });
  },

  end(x, y) {
    const d = get().drag;
    set({ drag: null });
    if (!d) return false;
    for (const target of get().targets) {
      if (target(d.type, x, y)) return true;
    }
    return false;
  },

  cancel() {
    set({ drag: null });
  },

  register(target) {
    get().targets.add(target);
    return () => {
      get().targets.delete(target);
    };
  },
}));
