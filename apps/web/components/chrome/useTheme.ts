"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, THEME_KEY, type Theme } from "@/lib/theme";

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

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or storage disabled: the choice holds for this page view.
  }
}
