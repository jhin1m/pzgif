/**
 * The theme boot script, as a single string.
 *
 * It runs synchronously in <head> before first paint so the page never flashes
 * the wrong theme. It is injected inline by `src/app/[locale]/layout.tsx` and by
 * `src/app/not-found.tsx`.
 *
 * It is NOT hashed into the CSP. A hash in `script-src` makes browsers ignore
 * `'unsafe-inline'`, which blocks Next's own inline RSC payload scripts and stops
 * the page hydrating. The full reasoning is in `next.config.ts`.
 *
 * Keep it dependency-free and side-effect-minimal. It also clears the
 * `data-theme-booting` attribute, which suppresses the colour transition on the
 * very first paint (design-guidelines.md §6).
 */
export const THEME_STORAGE_KEY = "pzgif-theme";

export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement;try{var s=localStorage.getItem("${THEME_STORAGE_KEY}");var t=s==="light"||s==="dark"?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");d.setAttribute("data-theme",t)}catch(e){d.setAttribute("data-theme","light")}d.removeAttribute("data-theme-booting")})()`;
