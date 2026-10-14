"use client";

import { useFollowSystemTheme } from "./useTheme";

/** Keeps the page on the device's light or dark setting while no theme is chosen. */
export function ThemeBoot() {
  useFollowSystemTheme();
  return null;
}
