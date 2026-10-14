"use client";

/**
 * ⌘K — go anywhere by name (Design Doc §11.2). Pages, lessons, challenges,
 * glossary terms and gates, from `lib/palette.ts`. Mounted once in the layout,
 * so the shortcut works on every screen.
 */

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { searchPalette, type PaletteKind } from "@/lib/palette";
import { t, type MessageKey } from "@/lib/i18n";
import s from "./CommandPalette.module.css";

const KIND_LABEL: Record<PaletteKind, MessageKey> = {
  page: "palette.kind.page",
  lesson: "palette.kind.lesson",
  challenge: "palette.kind.challenge",
  term: "palette.kind.term",
  gate: "palette.kind.gate",
};

export function CommandPalette() {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
  }, [open]);

  const results = useMemo(() => searchPalette(query), [query]);
  useEffect(() => setActive(0), [query]);

  function go(index: number) {
    const hit = results[index];
    if (!hit) return;
    setOpen(false);
    router.push(hit.href);
  }

  return (
    <Dialog open={open} title={t("palette.title")} onClose={() => setOpen(false)}>
      <input
        className={s.input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter") { e.preventDefault(); go(active); }
        }}
        placeholder={t("palette.placeholder")}
        aria-label={t("palette.search")}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
      />
      {results.length === 0 ? (
        <p className={s.empty}>{t("palette.empty")}</p>
      ) : (
        <ul id={listId} role="listbox" className={s.list} aria-label={t("palette.results")}>
          {results.map((r, i) => (
            <li
              key={r.href}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={s.row}
              onPointerMove={() => setActive(i)}
              onClick={() => go(i)}
            >
              <span className={s.kind}>{t(KIND_LABEL[r.kind])}</span>
              <span className={s.title}>{r.title}</span>
              {r.detail && <span className={s.detail}>{r.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className={s.foot}>{t("palette.help")}</p>
    </Dialog>
  );
}
