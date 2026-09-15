"use client";

/**
 * The keyboard reference — PRD E2-S8 ("Documented in a shortcut sheet"),
 * Design Doc §11.2. Opened with `?`. Prints from the canvas's own grammar
 * table, so the sheet and the behaviour cannot disagree.
 */

import { Dialog } from "@/components/ui/Dialog";
import { KEYBOARD_GRAMMAR } from "@/components/circuit/CircuitCanvas";
import s from "./ShortcutSheet.module.css";

export const PAGE_SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: "⌘↵ / Ctrl+↵", action: "Run" },
  { keys: "⌘Z / Ctrl+Z", action: "Undo" },
  { keys: "⌘⇧Z / Ctrl+⇧Z", action: "Redo" },
  { keys: "⌘S / Ctrl+S", action: "Save the circuit" },
  { keys: "⌘/ / Ctrl+/", action: "Open or close the tutor" },
  { keys: "1 – 5", action: "Plot, Bloch, Table, Density, Code" },
  { keys: "?", action: "This sheet" },
];

export function ShortcutTable({ rows }: { rows: Array<{ keys: string; action: string }> }) {
  return (
    <table className={s.table}>
      <tbody>
        {rows.map((r) => (
          <tr key={r.keys}>
            <th scope="row"><kbd className={s.kbd}>{r.keys}</kbd></th>
            <td>{r.action}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Dialog open={open} title="Keyboard" onClose={onClose} wide>
      <div className={s.columns}>
        <section>
          <h3 className="label">On the circuit (click it or Tab to it first)</h3>
          <ShortcutTable rows={KEYBOARD_GRAMMAR} />
        </section>
        <section>
          <h3 className="label">Anywhere on the bench</h3>
          <ShortcutTable rows={PAGE_SHORTCUTS} />
        </section>
      </div>
    </Dialog>
  );
}
