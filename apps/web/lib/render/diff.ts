/**
 * Which lines of generated code are new, or belong to particular gates.
 *
 * The renderers write code as a list of lines and keep no map from gate to
 * line, and five dialects each order things their own way. Diffing the text
 * works for all of them: the lines a gate owns are the lines that disappear
 * when the gate is removed, and the lines an edit wrote are the ones that
 * were not there before it.
 */

import type { Circuit } from "@/lib/ir/types";
import { render, type Sdk } from "./index";

/** 0-based indices of lines in `after` with no unmatched twin in `before`. */
export function addedLines(before: string, after: string): number[] {
  const pool = new Map<string, number>();
  for (const line of before.split("\n")) pool.set(line, (pool.get(line) ?? 0) + 1);
  const added: number[] = [];
  after.split("\n").forEach((line, i) => {
    const left = pool.get(line) ?? 0;
    if (left > 0) pool.set(line, left - 1);
    else if (line.trim() !== "") added.push(i);
  });
  return added;
}

/** 0-based indices of the lines in `circuit`'s code that `gateIds` wrote. */
export function linesForGates(circuit: Circuit, sdk: Sdk, gateIds: readonly string[]): number[] {
  if (gateIds.length === 0) return [];
  const ids = new Set(gateIds);
  if (!circuit.gates.some((g) => ids.has(g.id))) return [];
  const without: Circuit = { ...circuit, gates: circuit.gates.filter((g) => !ids.has(g.id)) };
  return addedLines(render(without, sdk), render(circuit, sdk));
}
