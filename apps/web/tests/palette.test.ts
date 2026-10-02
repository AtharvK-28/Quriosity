/**
 * The ⌘K palette's index. Everything it lists must lead somewhere real, and
 * the obvious query must put the obvious thing first.
 */

import { describe, expect, it } from "vitest";
import { paletteEntries, searchPalette } from "@/lib/palette";
import { NODES } from "@/lib/curriculum/nodes";
import { GLOSSARY } from "@/lib/curriculum/glossary";

describe("the palette index", () => {
  it("lists every lesson and every glossary term", () => {
    const hrefs = new Set(paletteEntries().map((e) => e.href));
    for (const n of NODES) expect(hrefs.has(`/lesson/${n.id}`)).toBe(true);
    for (const t of GLOSSARY) expect(hrefs.has(`/reference#term-${t.id}`)).toBe(true);
  });

  it("has no two entries going to the same place", () => {
    const hrefs = paletteEntries().map((e) => e.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("offers the pages when nothing is typed", () => {
    expect(searchPalette("").every((e) => e.kind === "page")).toBe(true);
  });

  it("puts the exact name first", () => {
    expect(searchPalette("bench")[0].href).toBe("/build");
    expect(searchPalette("cnot")[0].href).toBe("/reference#gate-cx");
    expect(searchPalette("glossary")[0].href).toBe("/reference");
  });

  it("matches on every word, in any order, and on keywords", () => {
    expect(searchPalette("golf").some((e) => e.kind === "challenge" || e.href === "/challenges")).toBe(true);
    expect(searchPalette("zzzz-nothing")).toEqual([]);
  });
});
