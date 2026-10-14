/**
 * Theme: night (the team prototype's violet) or day (the original paper).
 * The device's light or dark setting picks one until the learner does; a
 * choice made in the top bar or Settings is saved and wins from then on.
 * Night is what the server renders, before the boot script can ask.
 *
 * Kept out of any "use client" module on purpose: the root layout is a server
 * component and needs the boot script as a plain string, not a client
 * reference.
 */

export type Theme = "night" | "day";

export const THEME_KEY = "quriosity.theme.v1";
export const DEFAULT_THEME: Theme = "night";

/** Matches when the device asks for a light appearance. */
export const LIGHT_QUERY = "(prefers-color-scheme: light)";

/**
 * Inlined into <head> so it runs before first paint. A saved choice wins;
 * without one the page follows the device's light or dark setting, so a
 * reader on a light system never sees a frame of violet first.
 */
export const THEME_BOOT = `(function(){try{var d=document.documentElement,t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t!=="day"&&t!=="night")t=matchMedia(${JSON.stringify(LIGHT_QUERY)}).matches?"day":"night";d.setAttribute("data-theme",t);}catch(e){}})();`;
