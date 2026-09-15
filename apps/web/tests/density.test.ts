/**
 * Density matrices and pairwise links — PRD E5-S5, E5-S6.
 *
 * Hand-derivable cases only: a product state, a Bell pair, GHZ, the W state
 * and a measurement ensemble, where the purity, entropy and mutual information
 * can be written down on paper first.
 */

import { describe, expect, it } from "vitest";
import { emptyCircuit, nextGateId, type Circuit, type Gate, type GateType } from "@/lib/ir/types";
import { simulate } from "@/lib/sim/statevector";
import { qubitState } from "@/lib/sim/analysis";
import { densityMatrix, eigenvalues, entropy, pairLinks, purity } from "@/lib/sim/density";

function circuit(qubits: number, gates: Array<Partial<Gate> & { type: GateType }>): Circuit {
  const c = emptyCircuit(qubits);
  c.gates = gates.map((g, i) => ({
    id: nextGateId(),
    type: g.type,
    targets: g.targets ?? [0],
    controls: g.controls ?? [],
    params: g.params ?? [],
    column: g.column ?? i,
    ...(g.type === "measure" ? { clbit: g.targets?.[0] ?? 0 } : {}),
  }));
  return c;
}

const bell = () => circuit(2, [{ type: "h" }, { type: "cx", controls: [0], targets: [1] }]);
const ghz = () => circuit(3, [{ type: "h" }, { type: "cx", controls: [0], targets: [1] }, { type: "cx", controls: [1], targets: [2] }]);

describe("the density matrix", () => {
  it("of a Bell pair has ½ in the four corners", () => {
    const r = simulate(bell());
    const rho = densityMatrix(r.branches, 2, [0, 1]);
    expect(rho.dim).toBe(4);
    const at = (i: number, j: number) => rho.re[i * 4 + j];
    expect(at(0, 0)).toBeCloseTo(0.5, 12);
    expect(at(0, 3)).toBeCloseTo(0.5, 12);
    expect(at(3, 0)).toBeCloseTo(0.5, 12);
    expect(at(3, 3)).toBeCloseTo(0.5, 12);
    expect(at(1, 1)).toBeCloseTo(0, 12);
    expect(purity(rho)).toBeCloseTo(1, 12);
    expect(entropy(rho)).toBeCloseTo(0, 9);
  });

  it("carries phase in the imaginary part: |0⟩ + i|1⟩", () => {
    const r = simulate(circuit(1, [{ type: "h" }, { type: "s" }]));
    const rho = densityMatrix(r.branches, 1, [0]);
    // ρ₀₁ = a₀ · conj(a₁) = (1/√2)(−i/√2) = −i/2
    expect(rho.re[1]).toBeCloseTo(0, 12);
    expect(rho.im[1]).toBeCloseTo(-0.5, 12);
    expect(rho.im[2]).toBeCloseTo(0.5, 12);
  });

  it("agrees with the single-qubit analysis used by the Bloch sphere", () => {
    const r = simulate(circuit(3, [
      { type: "ry", params: [0.7] }, { type: "cry", controls: [0], targets: [1], params: [1.1] },
      { type: "rz", targets: [2], params: [0.4], column: 0 }, { type: "h", targets: [2], column: 1 },
      { type: "cx", controls: [2], targets: [0] },
    ]));
    for (let q = 0; q < 3; q++) {
      const rho = densityMatrix(r.branches, 3, [q]);
      const s = qubitState(r.branches, 3, q);
      expect(purity(rho), `q${q} purity`).toBeCloseTo(s.purity, 10);
      expect(entropy(rho), `q${q} entropy`).toBeCloseTo(s.entropy, 8);
    }
  });

  it("of one half of a Bell pair is maximally mixed", () => {
    const r = simulate(bell());
    const rho = densityMatrix(r.branches, 2, [1]);
    expect(purity(rho)).toBeCloseTo(0.5, 12);
    expect(entropy(rho)).toBeCloseTo(1, 9);
    expect(eigenvalues(rho)).toEqual([expect.closeTo(0.5, 9), expect.closeTo(0.5, 9)]);
  });

  it("of a mid-circuit measurement ensemble is mixed even for the whole register", () => {
    const r = simulate(circuit(1, [{ type: "h" }, { type: "measure" }, { type: "h" }]));
    const rho = densityMatrix(r.branches, 1, [0]);
    expect(purity(rho)).toBeCloseTo(0.5, 9);
    expect(entropy(rho)).toBeCloseTo(1, 9);
  });

  it("has eigenvalues that sum to one and entropy bounded by log₂ d", () => {
    const r = simulate(circuit(4, [
      { type: "h" }, { type: "cx", controls: [0], targets: [1] },
      { type: "ry", targets: [2], params: [1.3], column: 0 }, { type: "crx", controls: [2], targets: [3], params: [0.9] },
      { type: "cz", controls: [1], targets: [2] }, { type: "t", targets: [3] },
    ]));
    for (const keep of [[0], [0, 1], [1, 2], [0, 2, 3], [0, 1, 2, 3]]) {
      const rho = densityMatrix(r.branches, 4, keep);
      const ev = eigenvalues(rho);
      expect(ev.reduce((s, x) => s + x, 0), `trace for ${keep}`).toBeCloseTo(1, 9);
      expect(entropy(rho)).toBeLessThanOrEqual(keep.length + 1e-9);
      // Tr ρ² from entries equals Σλ² from the spectrum.
      expect(ev.reduce((s, x) => s + x * x, 0)).toBeCloseTo(purity(rho), 8);
    }
  });

  it("refuses subsystems it cannot draw", () => {
    const r = simulate(circuit(1, []));
    expect(() => densityMatrix(r.branches, 1, [1])).toThrow(RangeError);
    expect(() => densityMatrix(r.branches, 1, [])).toThrow(RangeError);
  });
});

describe("pairwise links — E5-S6", () => {
  it("a Bell pair is paired, with two bits of mutual information", () => {
    const [link] = pairLinks(simulate(bell()).branches, 2);
    expect(link.kind).toBe("paired");
    expect(link.mutualInformation).toBeCloseTo(2, 9);
    expect(link.purity).toBeCloseTo(1, 9);
  });

  it("a product state is independent on every pair", () => {
    const r = simulate(circuit(3, [{ type: "h" }, { type: "ry", targets: [1], params: [0.4], column: 0 }, { type: "x", targets: [2], column: 0 }]));
    expect(pairLinks(r.branches, 3).every((l) => l.kind === "independent")).toBe(true);
  });

  it("GHZ pairs are correlated through the third wire, never paired", () => {
    const links = pairLinks(simulate(ghz()).branches, 3);
    expect(links).toHaveLength(3);
    for (const l of links) {
      expect(l.kind).toBe("correlated");
      expect(l.purity).toBeCloseTo(0.5, 9);
      expect(l.mutualInformation).toBeCloseTo(1, 9);
    }
  });

  it("a Bell pair beside an idle wire links only the pair", () => {
    const links = pairLinks(simulate(circuit(3, [{ type: "h" }, { type: "cx", controls: [0], targets: [1] }])).branches, 3);
    expect(links.find((l) => l.a === 0 && l.b === 1)!.kind).toBe("paired");
    expect(links.filter((l) => l.b === 2).every((l) => l.kind === "independent")).toBe(true);
  });

  it("the W state's pairs are correlated, with the textbook purity", () => {
    // |W⟩ = (|001⟩ + |010⟩ + |100⟩)/√3. Tracing out one wire leaves
    // ρ = ⅓|00⟩⟨00| + ⅔|Ψ⁺⟩⟨Ψ⁺|, so Tr ρ² = 1/9 + 4/9 = 5/9.
    const c = emptyCircuit(3);
    const r = simulate(c);
    const s = 1 / Math.sqrt(3);
    const amps = new Float64Array(16);
    for (const k of [1, 2, 4]) amps[2 * k] = s;
    r.branches = [{ weight: 1, amps }];
    for (const l of pairLinks(r.branches, 3)) {
      expect(l.kind).toBe("correlated");
      expect(l.purity).toBeCloseTo(5 / 9, 9);
    }
  });
});
