"use client";

import { useId, useState, type ReactNode } from "react";
import s from "./primitives.module.css";

/* -- Button ------------------------------------------------------------------- */

export function Button({
  variant = "secondary",
  size = "md",
  children,
  ...rest
}: {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [s.btn, s[variant], size === "sm" ? s.sm : size === "lg" ? s.lg : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

/* -- Panel -------------------------------------------------------------------- */

export function Panel({
  framed = false,
  inset = false,
  flush = false,
  className = "",
  children,
  ...rest
}: {
  framed?: boolean;
  inset?: boolean;
  flush?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  const cls = [s.panel, framed && s.framed, inset && s.inset, flush && s.flush, className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}

export function PanelHead({ children }: { children: ReactNode }) {
  return <div className={s.panelHead}>{children}</div>;
}

/* -- Label -------------------------------------------------------------------- */

export function Label({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "ink" | "measure";
}) {
  const cls = ["label", tone === "ink" && "label--ink", tone === "measure" && "label--measure"]
    .filter(Boolean)
    .join(" ");
  return <span className={cls}>{children}</span>;
}

/* -- Chip --------------------------------------------------------------------- */

export function Chip({
  tone,
  dot = false,
  children,
}: {
  tone?: "measure" | "error" | "flag" | "phase" | "solid";
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={s.chip} data-tone={tone}>
      {dot && <span className={s.dot} aria-hidden />}
      {children}
    </span>
  );
}

/* -- Readout ------------------------------------------------------------------ */

export function Readout({
  value,
  label,
  tone,
}: {
  value: ReactNode;
  label: string;
  tone?: "measure" | "error" | "flag";
}) {
  const colour =
    tone === "measure" ? "var(--measure)" : tone === "error" ? "var(--error)" : tone === "flag" ? "var(--flag)" : undefined;
  return (
    <span className={s.readout}>
      <span className={s.readoutValue} style={colour ? { color: colour } : undefined}>
        {value}
      </span>
      <span className={s.readoutLabel}>{label}</span>
    </span>
  );
}

/* -- Disclosure ---------------------------------------------------------------
   The density discipline made mechanical. Anything that is not the one thing a
   screen is for goes in here, closed.
   ------------------------------------------------------------------------- */

export function Disclosure({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className={s.disclosure}>
      <button
        type="button"
        className={s.disclosureBtn}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={s.caret} data-open={open} aria-hidden>
          ▶
        </span>
        {label}
      </button>
      {open && (
        <div id={id} className={s.disclosureBody}>
          {children}
        </div>
      )}
    </div>
  );
}

/* -- Segmented control --------------------------------------------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange(v: T): void;
  ariaLabel: string;
}) {
  return (
    <div className={s.segmented} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={s.segment}
          data-active={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* -- Margin note ---------------------------------------------------------------
   One plain sentence about what just happened. Appears after an action.
   ------------------------------------------------------------------------- */

export function MarginNote({
  label = "Margin",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <aside className={s.margin}>
      <span className={s.marginLabel}>{label}</span>
      {children}
    </aside>
  );
}

/* -- Slider -------------------------------------------------------------------- */

export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  ariaLabel,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange(v: number): void;
  ariaLabel: string;
}) {
  return (
    <input
      type="range"
      className={s.slider}
      value={value}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  );
}

/* -- Input --------------------------------------------------------------------- */

export function Input({
  invalid = false,
  ...rest
}: { invalid?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={s.input} data-invalid={invalid} {...rest} />;
}

/* -- Registration crosses -------------------------------------------------------
   The corner marks on a plotter sheet. The only ornament the system permits,
   and structural rather than decorative — they say "this is a printed
   instrument", which is the whole visual thesis.
   ------------------------------------------------------------------------- */

export function Registration() {
  return (
    <>
      <span className="reg" style={{ top: -5, left: -5 }} aria-hidden />
      <span className="reg" style={{ top: -5, right: -5 }} aria-hidden />
      <span className="reg" style={{ bottom: -5, left: -5 }} aria-hidden />
      <span className="reg" style={{ bottom: -5, right: -5 }} aria-hidden />
    </>
  );
}
