"use client";

/**
 * Pairwise entanglement at a glance — PRD E5-S6.
 *
 * "An entanglement indicator per qubit pair, derived from purity of the
 * reduced state." Every pair gets its joint purity and the mutual information
 * between its halves, and one of three words:
 *
 *   entangled with each other — pure as a pair, mixed apart
 *   correlated                — linked, and also tied to other wires
 *   independent               — a product; nothing to see
 *
 * Only linked pairs are listed. A 5-wire register has ten pairs, and a table
 * of ten "independent" rows hides the one that is not.
 */

import { useMemo } from "react";
import { pairLinks, type PairLink } from "@/lib/sim/density";
import type { Branch } from "@/lib/sim/statevector";
import s from "./PairLinks.module.css";

/** Above this, pairs are too many to be worth reading as a list. */
export const MAX_PAIR_WIRES = 8;

const WORDS: Record<PairLink["kind"], string> = {
  paired: "entangled with each other",
  correlated: "correlated, and tied to other wires too",
  independent: "independent",
};

export function PairLinks({ branches, qubits }: { branches: Branch[]; qubits: number }) {
  const links = useMemo(
    () => (qubits >= 2 && qubits <= MAX_PAIR_WIRES ? pairLinks(branches, qubits) : []),
    [branches, qubits],
  );

  if (qubits < 2) return null;
  if (qubits > MAX_PAIR_WIRES) {
    return <p className={s.empty}>Pairwise links are shown for up to {MAX_PAIR_WIRES} wires.</p>;
  }

  const linked = links.filter((l) => l.kind !== "independent").sort((a, b) => b.mutualInformation - a.mutualInformation);

  return (
    <div className={s.links}>
      <span className="label">Pairs</span>
      {linked.length === 0 ? (
        <p className={s.empty}>Every pair is independent — each wire could be described on its own.</p>
      ) : (
        <ul className={s.list}>
          {linked.map((l) => (
            <li key={`${l.a}-${l.b}`} className={s.row} data-kind={l.kind}>
              <span className={s.wires}>q{l.a} · q{l.b}</span>
              <span className={s.word}>{WORDS[l.kind]}</span>
              <span className={s.meta} title="Mutual information between the two wires, and the purity of their joint state">
                I {l.mutualInformation.toFixed(2)} bit{Math.abs(l.mutualInformation - 1) < 5e-3 ? "" : "s"} · Tr ρ² {l.purity.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
