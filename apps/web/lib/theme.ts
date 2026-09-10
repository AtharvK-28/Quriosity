/**
 * Theme — night (the team prototype's violet, the default) or day (the
 * original paper).
 *
 * Kept out of any "use client" module on purpose: the root layout is a server
 * component and needs the boot script as a plain string, not a client
 * reference.
 */

export type Theme = "night" | "day";

export const THEME_KEY = "quriosity.theme.v1";
export const DEFAULT_THEME: Theme = "night";

/**
 * Inlined into <head> so it runs before first paint. A reader who chose day
 * never sees a frame of violet on reload.
 */
export const THEME_BOOT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t==="day"||t==="night")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
