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
 *   - mono is below the fold, so it is not preloaded
 *   - `latin-ext` is added only when the first non-English locale ships
 *
 * The CSS variable names carry a `-family` suffix because `globals.css` maps
 * them onto the Tailwind theme keys `--font-display` / `--font-sans` /
 * `--font-mono`, and a theme key cannot reference a variable of its own name.
 */

export const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display-family",
  display: "swap",
  preload: true,
});

export const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans-family",
  display: "swap",
  preload: true,
});

export const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-family",
  display: "swap",
  preload: false,
});

export const fontVariables = [
  display.variable,
  sans.variable,
  mono.variable,
].join(" ");
