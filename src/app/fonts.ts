import {
  Hanken_Grotesk,
  JetBrains_Mono,
  Space_Grotesk,
} from "next/font/google";

/**
 * Font pairing is fixed by design-guidelines.md §3: Space Grotesk (display),
 * Hanken Grotesk (body/UI), JetBrains Mono (numbers and dimensions).
 *
 * Rules carried over from that section:
 *   - self-hosted only; no <link> to fonts.googleapis.com in the product
 *   - never `display: block` — invisible-text FOUT is worse than a swap here
 *   - `latin-ext` is added only when the first non-English locale ships
 *
 * ── Two departures from §3, both measured ──────────────────────────────────
 *
 * **Mono is preloaded.** §3 says it sits below the fold. Not in this product:
 * every page is a tool page, and a tool page puts the slider readouts and the
 * size delta — all `.tabular`, all mono — inside the first viewport.
 *
 * **`display: optional`, not `swap`.** A swap that lands after first paint
 * reflows every line whose wrapping the new metrics change; measured on
 * /gif-compressor with the woff2 responses held back 700ms, the nav, the
 * wordmark and the dropzone title all moved, and the same effect surfaced as a
 * residual 8.2e-6 under a loaded parallel test run. `size-adjust` cannot close
 * it — a size-adjusted fallback corrects average metrics, not per-glyph
 * advances, and a monospace face against a proportional fallback differs in
 * exactly the per-glyph advances.
 *
 * `optional` gives the face a ~100ms window and then commits to the fallback
 * for that page load rather than swapping later, so the shift cannot happen at
 * all. This is not the `display: block` the rule above forbids: there is no
 * invisible-text period beyond the block phase every value shares, and text is
 * readable throughout. What §3 wanted from mono — digits that do not jitter — is
 * carried by `font-variant-numeric: tabular-nums` in `globals.css`, which
 * applies to the fallback too.
 *
 * The CSS variable names carry a `-family` suffix because `globals.css` maps
 * them onto the Tailwind theme keys `--font-display` / `--font-sans` /
 * `--font-mono`, and a theme key cannot reference a variable of its own name.
 */

export const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display-family",
  display: "optional",
  preload: true,
});

export const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans-family",
  display: "optional",
  preload: true,
});

export const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-family",
  display: "optional",
  preload: true,
});

export const fontVariables = [
  display.variable,
  sans.variable,
  mono.variable,
].join(" ");
