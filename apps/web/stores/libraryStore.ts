"use client";

/**
 * Saved circuits — PRD E11-S1: "Saved circuits list, rename, delete."
 *
 * Saved in this browser, and the UI says so. When accounts exist this becomes a
 * read-through cache of the server's list and nothing that uses it changes
 * shape. Every stored circuit is validated on the way back in; one that no
 * longer validates (a schema change, a hand-edited store) is dropped rather
 * than handed to the canvas half-broken.
 */

import { create } from "zustand";
import { validate } from "@/lib/ir/validate";
import { cloneCircuit, type Circuit } from "@/lib/ir/types";

export interface SavedCircuit {
  id: string;
  name: string;
  circuit: Circuit;
  savedAt: number;
  updatedAt: number;
}

interface LibraryState {
  hydrated: boolean;
  items: SavedCircuit[];
  hydrate(): void;
  /** Saves a new entry, or overwrites `id` when given. Returns the id. */
  save(circuit: Circuit, name: string, id?: string | null): string;
  rename(id: string, name: string): void;
  remove(id: string): void;
  get(id: string): SavedCircuit | undefined;
  /** Swap in a whole list — how the account's copy arrives on sign-in. */
  replaceAll(items: SavedCircuit[]): void;
}

const KEY = "quriosity.library.v1";
/** Enough for a semester; a list longer than this is not a library anyone reads. */
const MAX_ITEMS = 200;

function persist(items: SavedCircuit[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Quota or private mode. The list stays in memory for this session.
  }
}

function cleanName(name: string, fallback: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 80) || fallback;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  hydrated: false,
  items: [],

  hydrate() {
    if (get().hydrated) return;
    let items: SavedCircuit[] = [];
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        items = parsed.filter(
          (x): x is SavedCircuit =>
            x && typeof x.id === "string" && typeof x.name === "string" && x.circuit && validate(x.circuit).valid,
        );
      }
    } catch {
      items = [];
    }
    set({ hydrated: true, items });
  },

  save(circuit, name, id) {
    const now = Date.now();
    const items = [...get().items];
    const existing = id ? items.findIndex((x) => x.id === id) : -1;
    const stored = cloneCircuit(circuit);
    const title = cleanName(name, "Untitled circuit");
    stored.metadata = { ...stored.metadata, name: title };

    if (existing >= 0) {
      items[existing] = { ...items[existing], name: title, circuit: { ...stored, id: items[existing].id }, updatedAt: now };
      set({ items });
      persist(items);
      return items[existing].id;
    }

    const newId = `c_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const next = [{ id: newId, name: title, circuit: { ...stored, id: newId }, savedAt: now, updatedAt: now }, ...items].slice(0, MAX_ITEMS);
    set({ items: next });
    persist(next);
    return newId;
  },

  rename(id, name) {
    const items = get().items.map((x) =>
      x.id === id
        ? { ...x, name: cleanName(name, x.name), circuit: { ...x.circuit, metadata: { ...x.circuit.metadata, name: cleanName(name, x.name) } }, updatedAt: Date.now() }
        : x,
    );
    set({ items });
    persist(items);
  },

  remove(id) {
    const items = get().items.filter((x) => x.id !== id);
    set({ items });
    persist(items);
  },

  get(id) {
    return get().items.find((x) => x.id === id);
  },

  replaceAll(items) {
    const kept = items.filter((x) => x && x.circuit && validate(x.circuit).valid).slice(0, MAX_ITEMS);
    set({ hydrated: true, items: kept });
    persist(kept);
  },
}));
