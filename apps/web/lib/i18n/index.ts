/**
 * Internationalisation — PRD §7.7.
 *
 *   - UI strings live in a catalogue, keyed, not in components. English at
 *     launch; a second language is a second catalogue with the same keys.
 *   - Curriculum content is already its own layer (`lib/curriculum/`), separate
 *     from this chrome.
 *   - Mathematical notation is never translated: kets, gate letters and
 *     fidelities are formatted where they are drawn, not here.
 *   - Counts use the locale's grouping — Indian by default, so 1,23,456.
 *
 * The chrome every screen shares (top bar, tutor dock, command palette) reads
 * from here. Screens move over one at a time; `tests/i18n.test.ts` fails if a
 * key used in code is missing from the catalogue.
 */

import { EN, type MessageKey } from "./en";

export type { MessageKey };

export const LOCALE = "en-IN";

const CATALOGUES: Record<string, Record<MessageKey, string>> = { "en-IN": EN, en: EN };

/** The string for a key, with `{name}` placeholders filled in. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template = (CATALOGUES[LOCALE] ?? EN)[key] ?? EN[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

const counts = new Intl.NumberFormat(LOCALE);

/** A whole-number count in the locale's grouping: 123456 → "1,23,456". */
export function formatCount(n: number): string {
  return counts.format(Math.round(n));
}

/** A calendar date, short: "26 Sept". */
export function formatDate(at: number | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat(LOCALE, opts).format(at);
}
