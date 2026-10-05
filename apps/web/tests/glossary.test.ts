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
    usePop.getState().clear();
    useTutor.setState({ open: false });
  });

  it("appear in Guided mode", () => {
    useSession.setState({ mode: "guided" });
    expect(usePop.getState().show({ kind: "hint", title: "Not quite yet." })).toBe(true);
    expect(usePop.getState().pop?.title).toBe("Not quite yet.");
  });

  it("never appear in Workbench mode, rewards included", () => {
    useSession.setState({ mode: "workbench" });
    expect(usePop.getState().show({ kind: "win", title: "Nailed it!" })).toBe(false);
    expect(usePop.getState().show({ kind: "reward", title: "Quest complete" })).toBe(false);
    expect(usePop.getState().pop).toBeNull();
  });

  it("never appear over an open tutor panel", () => {
    useSession.setState({ mode: "guided" });
    useTutor.setState({ open: true });
    expect(usePop.getState().show({ kind: "hint", title: "Not quite yet." })).toBe(false);
  });

  it("let a fresh hint or cheer replace a stale one", () => {
    useSession.setState({ mode: "track" });
    for (let i = 0; i < 5; i++) usePop.getState().show({ kind: "hint", title: `${i}` });
    usePop.getState().show({ kind: "win", title: "Nailed it!" });
    expect(usePop.getState().pop?.title).toBe("Nailed it!");
    expect(usePop.getState().queue).toHaveLength(0);
  });

  it("put the run's own cheer before what the run earned", () => {
    useSession.setState({ mode: "guided" });
    usePop.getState().show({ kind: "reward", title: "Day one of your streak" });
    usePop.getState().show({ kind: "win", title: "Nailed it!" });
    expect(usePop.getState().pop?.title).toBe("Nailed it!");
    usePop.getState().dismiss();
    expect(usePop.getState().pop?.title).toBe("Day one of your streak");
  });

  it("never throw away a new word: what comes after waits its turn", () => {
    useSession.setState({ mode: "guided" });
    usePop.getState().show({ kind: "new", title: "New words" });
    usePop.getState().show({ kind: "hint", title: "old hint" });
    usePop.getState().show({ kind: "hint", title: "fresh hint" });
    usePop.getState().show({ kind: "reward", title: "Quest complete" });
    expect(usePop.getState().pop?.kind).toBe("new");
    // The stale hint was dropped from the line; the fresh one and the reward wait.
    expect(usePop.getState().queue.map((p) => p.title)).toEqual(["fresh hint", "Quest complete"]);
    usePop.getState().dismiss();
    expect(usePop.getState().pop?.title).toBe("fresh hint");
    usePop.getState().dismiss();
    expect(usePop.getState().pop?.title).toBe("Quest complete");
  });
});