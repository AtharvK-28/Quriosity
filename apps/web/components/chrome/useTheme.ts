"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_THEME, LIGHT_QUERY, THEME_KEY, type Theme } from "@/lib/theme";

function read(): Theme {
  return document.documentElement.getAttribute("data-theme") === "day" ? "day" : "night";
}

function subscribe(onChange: () => void): () => void {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

/**
 * The live theme. Anything that bakes colours into a canvas re-reads when it
 * changes; everything drawn with CSS custom properties follows by itself.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_THEME);
}

/** A theme the learner picks, or "system" to follow the device again. */
export type ThemeChoice = Theme | "system";

const CHOICE_EVENT = "quriosity:theme-choice";

function systemTheme(): Theme {
  return window.matchMedia(LIGHT_QUERY).matches ? "day" : "night";
}

/** The saved choice, or "system" when there is none. */
export function readChoice(): ThemeChoice {
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    return t === "day" || t === "night" ? t : "system";
  } catch {
    return "system";
  }
}

export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private mode or storage disabled: the choice holds for this page view.
  }
  document.documentElement.setAttribute("data-theme", choice === "system" ? systemTheme() : choice);
  window.dispatchEvent(new Event(CHOICE_EVENT));
}

/** The saved choice, live, for a control that offers "match system". */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(CHOICE_EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(CHOICE_EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    readChoice,
    () => "system" as ThemeChoice,
  );
}

/**
 * Follows the device while no choice is saved: a system that switches to
 * dark at sunset takes the page with it. Mounted once, in the root layout.
 */
export function useFollowSystemTheme(): void {
  useEffect(() => {
    const media = window.matchMedia(LIGHT_QUERY);
    const apply = () => {
      if (readChoice() === "system") document.documentElement.setAttribute("data-theme", systemTheme());
    };
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
}
