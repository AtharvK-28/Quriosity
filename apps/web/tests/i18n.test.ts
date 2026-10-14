/**
 * PRD §7.7. Every key the code asks for exists in the catalogue, placeholders
 * are filled, and counts group the Indian way.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCount, t } from "@/lib/i18n";
import { EN } from "@/lib/i18n/en";

const ROOT = path.resolve(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("the catalogue", () => {
  it("has every key the code uses", () => {
    const used = new Set<string>();
    for (const file of ["app", "components", "lib"].flatMap((d) => sources(path.join(ROOT, d)))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\bt\("([a-z]+\.[\w.]+)"/g)) used.add(m[1]);
      for (const m of text.matchAll(/[:,(]\s*"((?:nav|topbar|tutor|palette)\.[\w.]+)"/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(20);
    const missing = [...used].filter((k) => !(k in EN));
    expect(missing).toEqual([]);
  });

  it("fills placeholders and leaves unknown ones visible", () => {
    expect(t("topbar.xp", { xp: 40 })).toBe("40 xp");
    expect(t("topbar.themeLabel", { theme: "night" })).toBe("Theme: night. Switch to {other}.");
  });
});

describe("locale formatting", () => {
  it("groups counts the Indian way", () => {
    expect(formatCount(123456)).toBe("1,23,456");
    expect(formatCount(1000)).toBe("1,000");
    expect(formatCount(12.6)).toBe("13");
  });
});
