/**
 * The glossary, and the pop-ups that introduce it.
 *
 * The data rules keep a pop-up to one line per card and every term reachable.
 * The pop rules pin the one that is not a preference: the tutor never speaks
 * unprompted in Workbench mode (PRD E7-S5).
 */

import { afterEach, describe, expect, it } from "vitest";
import { GLOSSARY, gatesIntroducedIn, termsIntroducedIn } from "@/lib/curriculum/glossary";
import { NODES, NODES_BY_ID } from "@/lib/curriculum/nodes";
import { isGateType } from "@/lib/ir/gates";
import { usePop } from "@/stores/popStore";
import { useSession } from "@/stores/sessionStore";
import { useTutor } from "@/stores/tutorStore";

const words = (s: string) => s.trim().split(/\s+/).length;

describe("glossary data", () => {
  it("has unique ids", () => {
    const ids = GLOSSARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ties every term to a real node, and names only real gates", () => {
    for (const t of GLOSSARY) {
      if (t.introducedIn) expect(NODES_BY_ID.has(t.introducedIn), t.id).toBe(true);
      for (const g of t.gates ?? []) expect(isGateType(g), `${t.id}: ${g}`).toBe(true);
    }
  });

  it("keeps every short definition to one line of a pop-up", () => {
    for (const t of GLOSSARY) expect(words(t.short), t.id).toBeLessThanOrEqual(16);
  });

  it("introduces at most three words at any node", () => {
    for (const n of NODES) expect(termsIntroducedIn(n.id).length, n.id).toBeLessThanOrEqual(3);
  });

  it("introduces each gate at the first node that puts it in the tray", () => {
    expect(gatesIntroducedIn("u0.n1")).toEqual(["h", "x", "measure"]);
    expect(gatesIntroducedIn("u0.n2")).toEqual(["ry", "rx"]);
    expect(gatesIntroducedIn("u3.n2")).toEqual(["cx", "cz"]);
    // Every gate on the path is introduced exactly once.
    const all = NODES.flatMap((n) => gatesIntroducedIn(n.id));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("pop-ups", () => {
  afterEach(() => {
    usePop.getState().dismiss();
    useTutor.setState({ open: false });
  });

  it("appear in Guided mode, from a side", () => {
    useSession.setState({ mode: "guided" });
    expect(usePop.getState().show({ kind: "hint", title: "Not quite yet." })).toBe(true);
    expect(["right", "top", "bottom"]).toContain(usePop.getState().pop?.side);
  });

  it("never appear in Workbench mode", () => {
    useSession.setState({ mode: "workbench" });
    expect(usePop.getState().show({ kind: "win", title: "Nailed it!" })).toBe(false);
    expect(usePop.getState().pop).toBeNull();
  });

  it("never appear over an open tutor panel", () => {
    useSession.setState({ mode: "guided" });
    useTutor.setState({ open: true });
    expect(usePop.getState().show({ kind: "hint", title: "Not quite yet." })).toBe(false);
  });

  it("replace one another, and never come from the same side twice running", () => {
    useSession.setState({ mode: "track" });
    let side = null;
    for (let i = 0; i < 20; i++) {
      usePop.getState().show({ kind: "hint", title: `${i}` });
      const pop = usePop.getState().pop!;
      expect(pop.title).toBe(`${i}`);
      expect(pop.side).not.toBe(side);
      side = pop.side;
    }
  });
});
