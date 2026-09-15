/**
 * Jupyter export — PRD E3-S5.
 *
 * "Download produces an .ipynb with imports, circuit construction, execution
 * and plotting cells that run unmodified." The construction cell is the Qiskit
 * renderer's own output, split at its seams, so the notebook can never disagree
 * with the code panel.
 */

import { gateCount, type Circuit } from "../ir/types";
import { renderQiskit } from "../render";

interface Cell {
  cell_type: "markdown" | "code";
  metadata: Record<string, never>;
  source: string[];
  execution_count?: null;
  outputs?: never[];
}

function source(text: string): string[] {
  const lines = text.split("\n");
  return lines.map((l, i) => (i < lines.length - 1 ? `${l}\n` : l));
}

const markdown = (text: string): Cell => ({ cell_type: "markdown", metadata: {}, source: source(text) });
const code = (text: string): Cell => ({
  cell_type: "code", metadata: {}, source: source(text), execution_count: null, outputs: [],
});

export function toNotebook(circuit: Circuit, opts: { shots?: number } = {}): string {
  const shots = opts.shots ?? 1024;
  const name = circuit.metadata.name ?? "Untitled circuit";
  const rendered = renderQiskit(circuit).split("\n");

  // The renderer emits: imports, a blank line, construction, a blank line,
  // then an execution tail. Take the parts it is made of rather than
  // regenerating them, so the two can never drift.
  const ctor = rendered.findIndex((l) => l.startsWith("qc = QuantumCircuit("));
  const tail = rendered.findIndex((l) => l.startsWith("from qiskit_aer import"));
  const imports = rendered.slice(0, ctor).filter((l) => l.trim());
  const construction = rendered.slice(ctor, tail < 0 ? undefined : tail).join("\n").trimEnd();

  const cells: Cell[] = [
    markdown(
      `# ${name}\n\n` +
      `${circuit.qubits} qubit${circuit.qubits === 1 ? "" : "s"}, ${gateCount(circuit)} gate${gateCount(circuit) === 1 ? "" : "s"}. ` +
      "Exported from Quriosity. Bitstrings read q_{n-1} … q_0 (little-endian, as Qiskit prints them).",
    ),
    code(
      "# Needs: pip install qiskit qiskit-aer matplotlib\n" +
      [...imports, "from qiskit_aer import AerSimulator", "from qiskit.visualization import plot_histogram"].join("\n"),
    ),
    code(`${construction}\n\nqc.draw()`),
    code(`result = AerSimulator().run(qc, shots=${shots}).result()\ncounts = result.get_counts()\ncounts`),
    code("plot_histogram(counts)"),
  ];

  const notebook = {
    cells,
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python" },
    },
    nbformat: 4,
    // 4.4, deliberately: 4.5 requires a unique id on every cell.
    nbformat_minor: 4,
  };
  return JSON.stringify(notebook, null, 1);
}

/** A filename that survives every OS: lowercase, dashes, no punctuation. */
export function fileSlug(name: string | undefined, fallback = "circuit"): string {
  const slug = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}
