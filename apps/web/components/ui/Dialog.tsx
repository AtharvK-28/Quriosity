"use client";

/**
 * Dialog and Menu — Design Doc §9 primitives.
 *
 * The dialog is for tasks that need the whole of a learner's attention for a
 * moment — pasting a program in, reading the shortcut sheet — and nothing
 * else. The tutor is never one of these (§11.3). Escape and the backdrop both
 * close it, focus moves in when it opens and back out when it closes.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import s from "./Dialog.module.css";

export function Dialog({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  // Held in a ref so a parent passing a fresh closure each render does not
  // re-run the focus effect and yank the caret out of a field mid-typing.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onClose = () => closeRef.current();
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("textarea, input, select, button:not([data-close])");
    (first ?? panel)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      // Keep Tab inside the dialog.
      if (e.key === "Tab" && panel) {
        const focusable = [...panel.querySelectorAll<HTMLElement>("a, button, textarea, input, select, [tabindex]:not([tabindex='-1'])")]
          .filter((el) => !el.hasAttribute("disabled"));
        if (focusable.length === 0) return;
        const [head, tail] = [focusable[0], focusable[focusable.length - 1]];
        if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); }
        else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className={s.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        className={s.panel}
        data-wide={wide}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <div className={s.head}>
          <h2 id={id} className={s.title}>{title}</h2>
          <button type="button" className={s.close} onClick={onClose} data-close aria-label="Close">
            esc
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export interface MenuItem {
  label: string;
  hint?: string;
  onSelect(): void;
  disabled?: boolean;
}

export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const buttons = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)") ?? [])];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "ArrowDown" ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    rootRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={s.menuRoot}>
      <button
        type="button"
        className={s.menuButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {label} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div id={id} role="menu" className={s.menu}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={s.menuItem}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.hint && <span className={s.menuHint}>{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
