/**
 * Output guard for streamed tutor text.
 *
 * The model's text is buffered to sentence boundaries and each chunk is
 * checked before it reaches the learner:
 *
 *   - [[gate:ID]] references must name a gate in the registry. Anything else
 *     is rewritten as plain text, so the dock never renders a chip for a gate
 *     this platform does not run.
 *   - Anything shaped like an XML tag is removed. The server's own context is
 *     tagged, and none of that markup belongs in an answer.
 *
 * Checking whole sentences rather than raw deltas means a reference is never
 * split across two checks, and the learner still sees text within a sentence
 * of the model producing it.
 */

import { isGateType } from "@/lib/ir/gates";

const GATE_REF = /\[\[\s*gate\s*:\s*([A-Za-z]+)\s*\]\]/g;
const TAG = /<\/?[A-Za-z_][\w:-]*(?:\s[^<>]*)?\/?>/g;

/**
 * LaTeX, rewritten as the plain notation the dock shows and the checks read.
 *
 * The prompt asks for plain kets, but models slip into `$|0\rangle$` — which
 * the dock cannot render, and which the physics firewall would not recognise
 * as a ket, so a wrong claim written in LaTeX would pass unchecked. Rewriting
 * before checking closes that: the firewall sees exactly what the learner sees.
 */
const LATEX: Array<[RegExp, string]> = [
  [/\\ket\{([^{}]*)\}/g, "|$1⟩"],
  [/\\bra\{([^{}]*)\}/g, "⟨$1|"],
  [/\\rangle/g, "⟩"],
  [/\\langle/g, "⟨"],
  [/\\sqrt\{([^{}]*)\}/g, "√$1"],
  [/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)"],
  [/\\text\{([^{}]*)\}/g, "$1"],
  [/\\(?:left|right)\s*/g, ""],
  [/\\dagger/g, "†"],
  [/\\otimes/g, "⊗"],
  [/\\cdot/g, "·"],
  [/\\times/g, "×"],
  [/\\approx/g, "≈"],
  [/\\pm/g, "±"],
  [/\\(?:var)?phi/g, "φ"],
  [/\\theta/g, "θ"],
  [/\\psi/g, "ψ"],
  [/\\pi\b/g, "π"],
  [/\\[,;!]/g, " "],
  [/\$\$?/g, ""],
];

export function plainMath(text: string): string {
  return LATEX.reduce((t, [re, to]) => t.replace(re, to), text);
}

export function cleanChunk(text: string): string {
  return plainMath(text)
    .replace(GATE_REF, (_match, id: string) => {
      const type = id.toLowerCase();
      return isGateType(type) ? `[[gate:${type}]]` : id;
    })
    .replace(TAG, "");
}

/**
 * The furthest point it is safe to release text up to: just past the last
 * sentence end or line break, and never inside a [[…]] or <…> that is still
 * open there.
 */
function safeCut(s: string): number {
  let cut = 0;
  const boundary = /[.!?:;](?=\s)|\n/g;
  for (let m = boundary.exec(s); m; m = boundary.exec(s)) cut = m.index + m[0].length;
  if (cut === 0) return 0;

  const head = s.slice(0, cut);
  const openRef = /\[\[[^\]]*$/.exec(head);
  if (openRef) cut = Math.min(cut, openRef.index);
  const openTag = /<\/?[A-Za-z_][^<>]*$/.exec(head);
  if (openTag) cut = Math.min(cut, openTag.index);
  return cut;
}

/** Accumulates deltas and releases checked text at safe boundaries only. */
export class SentenceBuffer {
  private pending = "";

  push(delta: string): string {
    this.pending += delta;
    const cut = safeCut(this.pending);
    if (cut <= 0) return "";
    const out = this.pending.slice(0, cut);
    this.pending = this.pending.slice(cut);
    return cleanChunk(out);
  }

  flush(): string {
    const out = this.pending;
    this.pending = "";
    return cleanChunk(out);
  }
}
