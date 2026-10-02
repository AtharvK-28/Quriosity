/**
 * The command palette's index — Design Doc §11.2 `⌘K`.
 *
 * Everything a learner can go to by name: pages, every lesson, the
 * challenges, every glossary term and every gate. Built from the curriculum's
 * own data, so a new node or term is findable the moment it exists.
 */

import { NODES } from "@/lib/curriculum/nodes";
import { CHALLENGES } from "@/lib/curriculum/challenges";
import { GLOSSARY } from "@/lib/curriculum/glossary";
import { GATES, GATE_TYPES } from "@/lib/ir/gates";

export type PaletteKind = "page" | "lesson" | "challenge" | "term" | "gate";

export interface PaletteEntry {
  kind: PaletteKind;
  title: string;
  href: string;
  /** Shown beside the title: a node id, a gate's letter. */
  detail?: string;
  /** Extra words it answers to. */
  keywords?: string;
}

const PAGES: PaletteEntry[] = [
  { kind: "page", title: "Learning path", href: "/path", keywords: "home lessons units" },
  { kind: "page", title: "Bench", href: "/build", keywords: "workbench build circuit editor sandbox" },
  { kind: "page", title: "Challenges", href: "/challenges", keywords: "puzzles golf bug hunt" },
  { kind: "page", title: "Arena", href: "/arena", keywords: "match pvp ladder blitz ranked bot rank" },
  { kind: "page", title: "Daily puzzle", href: "/daily", keywords: "today streak quests puzzle leaderboard" },
  { kind: "page", title: "Review", href: "/review", keywords: "spaced repetition recall forgetting" },
  { kind: "page", title: "Progress", href: "/profile", keywords: "profile xp beliefs" },
  { kind: "page", title: "Glossary", href: "/reference", keywords: "reference terms gates dictionary" },
  { kind: "page", title: "Tracks", href: "/tracks", keywords: "optimisation cryptography simulation" },
  { kind: "page", title: "Qubit playground", href: "/playground", keywords: "bloch sphere theta phi" },
  { kind: "page", title: "Teach", href: "/teach", keywords: "instructor class cohort heatmap assignments" },
  { kind: "page", title: "Docs", href: "/docs", keywords: "ir schema formats keyboard limits" },
  { kind: "page", title: "Settings", href: "/settings", keywords: "account theme mode data" },
  { kind: "page", title: "Change mode", href: "/start", keywords: "guided workbench track start" },
];

let cache: PaletteEntry[] | null = null;

export function paletteEntries(): PaletteEntry[] {
  if (cache) return cache;
  cache = [
    ...PAGES,
    ...NODES.map((n): PaletteEntry => ({ kind: "lesson", title: n.title, href: `/lesson/${n.id}`, detail: n.id })),
    ...CHALLENGES.map((c): PaletteEntry => ({
      kind: "challenge",
      title: c.title,
      href: `/challenges/${c.id}`,
      detail: c.kind,
      keywords: c.brief,
    })),
    ...GLOSSARY.map((t): PaletteEntry => ({
      kind: "term",
      title: t.term,
      href: `/reference#term-${t.id}`,
      detail: t.symbol,
      keywords: t.short,
    })),
    ...GATE_TYPES.map((g): PaletteEntry => ({
      kind: "gate",
      title: GATES[g].name,
      href: `/reference#gate-${g}`,
      detail: g,
      keywords: `${g} gate ${Object.values(GATES[g].sdk ?? {}).join(" ")}`,
    })),
  ];
  return cache;
}

const KIND_ORDER: Record<PaletteKind, number> = { page: 0, lesson: 1, gate: 2, term: 3, challenge: 4 };

/**
 * Entries matching every word of the query. Titles that start with the query
 * come first, then titles that contain it, then matches on keywords alone.
 */
export function searchPalette(query: string, limit = 8): PaletteEntry[] {
  const q = query.trim().toLowerCase();
  const all = paletteEntries();
  if (!q) return all.filter((e) => e.kind === "page").slice(0, limit);

  const words = q.split(/\s+/);
  const scored: Array<[number, PaletteEntry]> = [];
  for (const e of all) {
    const title = e.title.toLowerCase();
    const hay = `${title} ${(e.detail ?? "").toLowerCase()} ${(e.keywords ?? "").toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const rank =
      title === q || e.detail?.toLowerCase() === q ? 0 : title.startsWith(q) ? 1 : title.includes(q) ? 2 : 3;
    scored.push([rank * 10 + KIND_ORDER[e.kind], e]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].title.localeCompare(b[1].title))
    .slice(0, limit)
    .map(([, e]) => e);
}
