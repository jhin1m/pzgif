# PZGIF — Design Guidelines

Status: **v1.0** (2026-08-04) · Build-ready
Implements `plans/reports/research-260804-2230-visual-design-direction-and-ad-safe-layout-report.md`. Constrained by `docs/tech-stack.md`.
Reference wireframes: `docs/wireframe/*.html`.

> **This document is the source of truth for tokens, states and ad-slot rules.** If a component in code disagrees with this file, the code is wrong.

---

## 1. Brand voice & design principles

**Voice:** plain-English, second-person, quantitative. Say "2.4 MB → 480 KB (−80%)", never "amazing results". Never promise a speed we have not benchmarked (tech-stack.md §Unresolved #1). No exclamation marks in UI copy. No emoji outside the single 🔒 trust-line lock.

Five principles, each a rule you can fail a design review against:

1. **The dropzone is the page.** On any tool page, the primary dropzone must be fully visible at 375×667 without scrolling, and must be the largest interactive target above the fold. Anything that pushes it down — banner, cookie strip, hero image, ad — is rejected.
2. **Never fake progress.** Progress width maps 1:1 to worker callbacks. No CSS transition on the fill's width, no simulated ramps, no indeterminate bar where a determinate number exists. If we do not know progress, we say "Preparing…" and show an indeterminate track — we do not invent a percentage.
3. **Ads must be visibly not-us.** Every ad container carries the quarantine treatment in §8 (6px radius, flat neutral fill, 1px border, no shadow, "Advertisement" label, 24px clearance). If a screenshot reviewer cannot tell an ad slot from a product card in under one second, the layout fails.
4. **Prove the quality, don't claim it.** gifski output is differentiator #1. Every compress/convert result must ship a before/after comparison with real byte counts. A result screen without measurable evidence is incomplete.
5. **Reserve every box before it fills.** Ad slots, result panels, preview canvases and file chips all declare their size in CSS in the initial static HTML. Zero layout shift is a hard acceptance criterion, not an optimisation.

---

## 2. Color tokens

Palette is fixed by the design-direction report §3. Values below are `oklch()` (Tailwind v4 native) with the source hex as a comment. Do not introduce new hues.

### 2.1 Primitive palette

```css
@theme {
  /* ── brand ─────────────────────────────────────────────── */
  --color-primary-400:  oklch(68.0% 0.168 268.8);  /* #6E90FF */
  --color-primary-500:  oklch(63.6% 0.177 267.2);  /* #5B82F5 */
  --color-primary-600:  oklch(55.5% 0.243 268.8);  /* #3D5AFE */
  --color-primary-700:  oklch(53.5% 0.216 265.4);  /* #2F5DE8 */
  --color-primary-800:  oklch(47.7% 0.220 266.1);  /* #2348D6 */
  --color-primary-900:  oklch(41.2% 0.191 266.2);  /* #1B39B0 */

  /* ── accent (speed / progress ONLY, <5% of surface) ─────── */
  --color-accent-300:   oklch(78.5% 0.132 182.5);  /* #2DD4C0 */
  --color-accent-500:   oklch(62.5% 0.107 187.5);  /* #0E9C93 */
  --color-accent-700:   oklch(52.3% 0.089 187.7);  /* #0B7A73 — text-safe teal, added */

  /* ── status ────────────────────────────────────────────── */
  --color-success-300:  oklch(80.0% 0.182 151.7);  /* #4ADE80 */
  --color-success-500:  oklch(62.7% 0.170 149.2);  /* #16A34A */
  --color-success-700:  oklch(52.7% 0.137 150.1);  /* #15803D */
  --color-warning-300:  oklch(83.7% 0.164 84.4);   /* #FBBF24 */
  --color-warning-500:  oklch(76.9% 0.165 70.1);   /* #F59E0B */
  --color-warning-700:  oklch(55.5% 0.146 49.0);   /* #B45309 */
  --color-danger-300:   oklch(71.1% 0.166 22.2);   /* #F87171 */
  --color-danger-500:   oklch(57.7% 0.215 27.3);   /* #DC2626 */

  /* ── neutrals ──────────────────────────────────────────── */
  --color-neutral-0:    oklch(100%  0     0);      /* #FFFFFF */
  --color-neutral-50:   oklch(98.2% 0.003 264.5);  /* #F8F9FB */
  --color-neutral-100:  oklch(95.9% 0.005 275.0);  /* #F0F1F5 */
  --color-neutral-200:  oklch(91.8% 0.009 264.5);  /* #E1E4EA */
  --color-neutral-300:  oklch(84.4% 0.015 264.5);  /* #C7CCD6 */
  --color-neutral-400:  oklch(70.8% 0.023 265.7);  /* #9AA1B0 */
  --color-neutral-500:  oklch(55.1% 0.023 264.4);  /* #6B7280 */
  --color-neutral-600:  oklch(44.6% 0.026 256.8);  /* #4B5563 */
  --color-neutral-700:  oklch(37.3% 0.031 259.7);  /* #374151 */
  --color-neutral-800:  oklch(27.8% 0.030 256.8);  /* #1F2937 */
  --color-neutral-900:  oklch(21.0% 0.032 264.7);  /* #111827 */
  --color-neutral-950:  oklch(16.4% 0.018 263.9);  /* #0A0E16 */
  --color-canvas-dark:  oklch(15.9% 0.011 268.0);  /* #0B0D12 — page bg, dark */
  --color-surface-dark: oklch(20.5% 0.017 268.8);  /* #14171F — surface-1, dark */
  --color-inset-dark:   oklch(23.1% 0.018 266.2);  /* #191D26 — surface-2, dark */
}
```

### 2.2 Semantic tokens (these are what components consume)

Never reference a primitive directly in a component. Always go through a semantic token so dark mode works for free.

```css
:root {
  --bg:              var(--color-neutral-0);
  --surface-1:       var(--color-neutral-50);    /* tool panel, card */
  --surface-2:       var(--color-neutral-100);   /* dropzone, inset, progress track */
  --surface-ad:      var(--color-neutral-50);    /* ad slot fill — flat, never gradient */
  --surface-raised:  var(--color-neutral-0);     /* popover, toast, sticky bar */

  --text:            var(--color-neutral-900);
  --text-secondary:  var(--color-neutral-700);
  --text-muted:      var(--color-neutral-600);
  --text-disabled:   var(--color-neutral-400);
  --text-on-primary: var(--color-neutral-0);
  --text-ad-label:   var(--color-neutral-500);   /* NOT neutral-400 — see §7.1 */

  --border:          var(--color-neutral-200);   /* decorative dividers, card edge */
  --border-control:  var(--color-neutral-500);   /* input/select/checkbox edge — 3:1 required */
  --border-ad:       var(--color-neutral-200);

  --primary:            var(--color-primary-700);   /* links, brand */
  --primary-fill:       var(--color-primary-800);   /* button fill */
  --primary-fill-hover: var(--color-primary-900);   /* button fill on hover — must keep white ≥4.5:1 */
  --primary-hover:      var(--color-primary-900);   /* link / ghost TEXT hover */
  --primary-subtle:     color-mix(in oklch, var(--color-primary-700) 6%, transparent);

  --accent:          var(--color-accent-500);    /* progress fill only */
  --accent-text:     var(--color-accent-700);    /* teal text/badges */
  --success:         var(--color-success-500);
  --success-text:    var(--color-success-700);
  --warning:         var(--color-warning-500);
  --warning-text:    var(--color-warning-700);
  --danger:          var(--color-danger-500);
  --danger-text:     var(--color-danger-500);

  --focus-ring:      var(--color-primary-700);
  --overlay:         oklch(21% 0.032 264.7 / 0.55);
}

[data-theme="dark"] {
  --bg:              var(--color-canvas-dark);
  --surface-1:       var(--color-surface-dark);
  --surface-2:       var(--color-inset-dark);
  --surface-ad:      var(--color-neutral-900);
  --surface-raised:  var(--color-surface-dark);

  --text:            var(--color-neutral-50);
  --text-secondary:  var(--color-neutral-200);
  --text-muted:      var(--color-neutral-300);
  --text-disabled:   var(--color-neutral-500);
  --text-on-primary: var(--color-neutral-0);
  --text-ad-label:   var(--color-neutral-400);

  --border:          var(--color-neutral-800);
  --border-control:  var(--color-neutral-500);
  --border-ad:       var(--color-neutral-800);

  --primary:            var(--color-primary-500);
  --primary-fill:       var(--color-primary-600);
  --primary-fill-hover: var(--color-primary-700);   /* DARKENS on hover — see §7.1 note 3 */
  --primary-hover:      var(--color-primary-400);   /* text-only hover; never a button fill */
  --primary-subtle:     color-mix(in oklch, var(--color-primary-500) 14%, transparent);

  --accent:          var(--color-accent-300);
  --accent-text:     var(--color-accent-300);
  --success:         var(--color-success-300);
  --success-text:    var(--color-success-300);
  --warning:         var(--color-warning-300);
  --warning-text:    var(--color-warning-300);
  --danger:          var(--color-danger-300);
  --danger-text:     var(--color-danger-300);

  --focus-ring:      var(--color-primary-500);
  --overlay:         oklch(10% 0.01 264 / 0.7);
}
```

Wire `@theme` to semantics so Tailwind utilities resolve correctly:

```css
@theme inline {
  --color-bg: var(--bg);
  --color-surface-1: var(--surface-1);
  --color-surface-2: var(--surface-2);
  --color-surface-ad: var(--surface-ad);
  --color-fg: var(--text);
  --color-fg-muted: var(--text-muted);
  --color-brand: var(--primary);
  /* …etc */
}
```

Dark mode ships as `data-theme` on `<html>` (no `class` strategy — avoids the FOUC dance with a `prefers-color-scheme` default and a localStorage override, set by a tiny inline script before paint).

---

## 3. Typography

Pairing is fixed: **Space Grotesk** (display) + **Hanken Grotesk** (body/UI) + **JetBrains Mono** (numbers/dimensions).

| Role | Family | Weights | Notes |
|---|---|---|---|
| Display / h1–h3 | Space Grotesk | 500, 700 | `letter-spacing: -0.02em` at ≥1.75rem. Never below 0.875rem. |
| Body / UI / labels / buttons | Hanken Grotesk (variable 300–900) | 400, 500, 600, 700 | Default family. Vietnamese + Cyrillic-ext coverage hedges future i18n. |
| Numbers, file sizes, px/fps/KB readouts, code | JetBrains Mono | 400, 500 | `font-variant-numeric: tabular-nums` mandatory — stops jitter as a live size readout ticks. |

### 3.1 `next/font/google` usage

```ts
// app/fonts.ts
import { Space_Grotesk, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";

export const display = Space_Grotesk({
  subsets: ["latin"], weight: ["500", "700"],
  variable: "--font-display", display: "swap", preload: true,
});
export const sans = Hanken_Grotesk({
  subsets: ["latin"], weight: ["400", "500", "600", "700"],
  variable: "--font-sans", display: "swap", preload: true,
});
export const mono = JetBrains_Mono({
  subsets: ["latin"], weight: ["400", "500"],
  variable: "--font-mono", display: "swap", preload: false, // below-fold usage is fine
});
```

Rules: self-hosted only (tech-stack.md) — no `<link>` to fonts.googleapis.com in the product. Add `latin-ext` subset only when the first non-English locale ships; adding it now costs bytes for zero benefit. Never `display: block` (invisible-text FOUT is worse than a swap for a utility page).

### 3.2 Type scale (rem, 16px root)

| Token | Size | Line-height | Weight / family | Used for |
|---|---|---|---|---|
| `--text-display` | `clamp(2rem, 1.6rem + 1.8vw, 2.75rem)` | 1.08 | 700 display | Homepage h1 |
| `--text-h1` | `clamp(1.75rem, 1.5rem + 1.1vw, 2.25rem)` | 1.15 | 700 display | Tool page h1 |
| `--text-h2` | `1.5rem` | 1.25 | 700 display | Section headings, SEO copy |
| `--text-h3` | `1.1875rem` | 1.35 | 500 display | Card titles, FAQ questions |
| `--text-h4` | `1.0625rem` | 1.4 | 600 sans | Panel sub-headers |
| `--text-lead` | `1.125rem` | 1.55 | 400 sans | Sub-heading under h1 |
| `--text-body` | `1rem` | 1.6 | 400 sans | Prose, FAQ answers |
| `--text-sm` | `0.875rem` | 1.55 | 400 sans | Helper text, secondary UI |
| `--text-label` | `0.8125rem` | 1.4 | 600 sans | Control labels, `+0.01em` |
| `--text-caption` | `0.75rem` | 1.45 | 500 sans | Meta, limits, hints |
| `--text-micro` | `0.6875rem` | 1.3 | 600 sans | "Advertisement" label, `+0.06em`, uppercase |

Prose measure caps at `68ch`. Body text never smaller than `--text-sm`; `--text-caption`/`--text-micro` are for non-essential meta only.

---

## 4. Spacing, radius, shadow, z-index

### 4.1 Spacing — 4px base

`0 · 1(4) · 2(8) · 3(12) · 4(16) · 5(20) · 6(24) · 8(32) · 10(40) · 12(48) · 16(64) · 20(80) · 24(96)`

Fixed vertical rhythm: control→label 8 · control→control 16 · group→group 24 · section→section 48 (mobile) / 64 (desktop). **Ad slot → nearest button ≥ 24px, non-negotiable (§8).**

### 4.2 Radius — encodes the ad quarantine

| Token | Value | Allowed on | Forbidden on |
|---|---|---|---|
| `--radius-ad` | **6px** (`rounded-md`) | **Ad slots only** | Everything else. No product element may use 6px. |
| `--radius-xs` | 4px | Progress bar, tags, tooltip | — |
| `--radius-control` | 8px | Buttons, inputs, selects, toggles | — |
| `--radius-panel` | 12px | Sub-panels, toast, popover | — |
| `--radius-card` | **16px** (`rounded-2xl`) | Tool panel, dropzone, tool card, result panel | Ad slots |
| `--radius-pill` | 9999px | File chip, preset chip, badge | — |

The 6px-vs-16px mismatch is a deliberate subconscious "this is not app UI" signal. Treat 6px as a reserved word.

### 4.3 Shadow

| Token | Value | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 2px oklch(21% .03 265 / .06), 0 1px 3px oklch(21% .03 265 / .08)` | Cards, tool panel, result panel |
| `--shadow-md` | `0 4px 10px -2px oklch(21% .03 265 / .08), 0 2px 4px -2px oklch(21% .03 265 / .06)` | Popover, select menu, sticky action bar (upward) |
| `--shadow-lg` | `0 14px 32px -8px oklch(21% .03 265 / .16)` | Toast, modal |
| `--shadow-none` | `none` | **Ad slots — enforced.** |

Dark mode: halve nothing — instead swap to `--shadow-*` with a 1px `--border` outline, since shadows read poorly on `#0B0D12`.

### 4.4 Z-index

| Layer | z |
|---|---|
| Page content, **ad slots** | 0 |
| Sticky header (56px) | 10 |
| Sticky bottom action bar (mobile, 64px) | 20 |
| Select/dropdown popover | 30 |
| Tooltip | 40 |
| Modal + overlay | 50 |
| Toast region | 60 |
| Skip-to-content link (on focus) | 70 |

Ad slots are pinned to z-0 and must never be `position: sticky/fixed` outside the single permitted mobile anchor unit (§8).

---

## 5. Component specs

Shared rules for every interactive element:

- **Focus-visible:** `outline: 2px solid var(--focus-ring); outline-offset: 2px;` — never removed, never replaced by a shadow-only ring (shadows vanish in forced-colors mode). Add `box-shadow: 0 0 0 4px var(--primary-subtle)` as an *additional* halo, not a replacement.
- **Hit target:** ≥44×44px on touch. Small visual controls get invisible padding, not a bigger box.
- **Disabled:** `opacity: .55; cursor: not-allowed; pointer-events: none` on the visual, but keep the element focusable with `aria-disabled="true"` when the user needs to learn *why* (e.g. Compress before a file is loaded → tooltip "Add a GIF first").
- **Loading:** the control keeps its rendered width (`min-width` frozen) so the layout never shifts when the label swaps to a spinner.

### 5.1 Button

| Variant | Default | Hover | Active | Focus-visible | Disabled | Loading |
|---|---|---|---|---|---|---|
| **Primary** | `--primary-fill` bg, `--text-on-primary`, 600, radius 8, no border, `--shadow-sm` | bg `--primary-fill-hover`, 120ms ease-out | bg `--primary-fill-hover`, `translateY(1px)`, shadow none | + focus ring | bg `--neutral-300`, text `--text-disabled`, no shadow | spinner (16px, 0.8s linear) replaces icon, label → "Compressing…", width frozen, `aria-busy="true"` |
| **Secondary** | `--surface-2` bg, `--text` , 1px `--border-control`, radius 8 | bg `--surface-1` → `--neutral-200`, border `--neutral-600` | `translateY(1px)` | + focus ring | opacity .55 | same as primary |
| **Ghost** | transparent, `--text-secondary`, no border | bg `--primary-subtle`, text `--primary` | bg stronger 10% | + focus ring | opacity .5 | rarely; use spinner-only |
| **Danger** | transparent bg, `--danger-text`, 1px `--danger` | bg `color-mix(--danger 8%)` | `translateY(1px)` | ring uses `--danger` | opacity .5 | n/a — Cancel is instant |

Sizes: `sm` 32px h / 12px x-pad / `--text-sm` · `md` 40px / 16px / `--text-sm` · `lg` 48px / 24px / `--text-body` (primary CTA) · `xl` 56px (mobile sticky bar, full width).
Only **one** primary button may be visible per viewport on a tool page. Download and Compress never coexist as primaries — after a result, Compress demotes to secondary ("Re-compress").

### 5.2 Dropzone

Sizes: desktop 280px min-height, mobile 176px. `--radius-card`, 2px dashed border. **Never changes size on drag** (report §7).

| State | Spec |
|---|---|
| **Idle** | bg `--surface-2`, border `2px dashed color-mix(--primary 40%, transparent)`, inline SVG loop mark (120px, `--neutral-300` stroke + one `--accent` dot), "Drop your GIF here or click to browse", caption "or paste from clipboard · max 150 MB · .gif" |
| **Hover / keyboard focus** | border `color-mix(--primary 65%)`, bg `--primary-subtle`, cursor pointer. Focus adds the standard 2px outline **outside** the dashed border (`outline-offset: 4px`). |
| **Drag-over** | border `2px solid var(--primary)`, bg `--primary-subtle`, `transform: scale(1.01)` over 100ms ease-out, mark tints `--primary`, copy → "Release to load". No box resize. |
| **Invalid file** | border `2px solid var(--danger)`, bg `color-mix(--danger 6%)`, alert icon, message "PNG isn't supported here. Try the **PNG to GIF** tool." (always name the right tool, never a dead end). Announced via `role="alert"`. Auto-clears on next interaction, never on a timer. |
| **Loaded** | Dropzone collapses to a FileChip row (§5.3) + settings panel. Collapse animates 150ms ease-out slide+fade 8px. Keep a "Choose a different file" ghost button. |

**Keyboard operation (mandatory):** the dropzone is a real `<button>` wrapping a visually-hidden `<input type="file">`, so Tab reaches it and Enter/Space opens the picker. `aria-describedby` points at the limits caption. Paste is bound at document level (`paste` → read `clipboardData.files`) and the caption tells the user it exists.

### 5.3 FileChip

Pill, 36px tall, `--surface-1` bg, 1px `--border`, `--radius-pill`, 12px x-pad. Content: 20px format icon · truncated name (`max-width: 22ch`, middle-ellipsis) · mono size badge (`2.4 MB`) · 24px remove button (×).

| State | Spec |
|---|---|
| Default | as above |
| Hover (on chip) | border `--neutral-300`; the × goes `--text-muted` → `--text` |
| Focus-visible (on ×) | 2px ring around the × only |
| Removing | 120ms fade + width collapse; announce "file removed" politely |
| Error | border `--danger`, size badge replaced by "Couldn't read this file" |

### 5.4 Slider (quality / lossy / speed)

Track 6px, `--surface-2` fill, `--radius-xs`, 1px inset `--border`. Filled portion `--primary`. Thumb 20px circle, `--bg` fill, 2px `--primary` border, `--shadow-sm`. Value readout to the right in JetBrains Mono, tabular-nums, fixed-width container so it never reflows.

| State | Spec |
|---|---|
| Default | as above |
| Hover | thumb scales to 22px (transform only), track filled portion +6% lightness |
| Active / dragging | thumb 22px + `--shadow-md`; **no transition on the thumb position** |
| Focus-visible | 2px ring + 4px `--primary-subtle` halo around the thumb |
| Disabled | thumb `--neutral-300` border, track `--surface-2`, readout `--text-disabled` |

Native `<input type="range">` only — free keyboard support (←/→ = 1 step, PgUp/PgDn = 10, Home/End = bounds). Always ships with a paired number input for exact entry on desktop.

### 5.5 Select

40px h, `--radius-control`, `--surface-1` bg, 1px `--border-control`, chevron 16px `--text-muted`, 12px x-pad.
Hover: border `--neutral-600`. Open: border `--primary`, 2px ring; menu = `--surface-raised`, `--radius-panel`, `--shadow-md`, 4px padding, items 36px, hover bg `--primary-subtle`, selected item shows a check + `--primary` text. Disabled: bg `--surface-2`, text `--text-disabled`.
Radix Select (shadcn) — do not roll a custom listbox; typeahead, roving focus and Escape semantics come free.

### 5.6 Toggle (switch)

44×24 track, `--radius-pill`. Off: `--neutral-400` track (dark: `--neutral-600`), knob `--bg` 20px. On: `--primary-fill` track, knob right. 150ms ease-out on `transform` + `background-color` only.
Hover: track lightens 6%. Focus-visible: 2px ring, offset 3px. Disabled: opacity .5.
Always paired with a `<label>`; state is announced by the native `role="switch"` + `aria-checked`. Never label a toggle with only an icon.

### 5.7 ProgressBar

Track 8px, `--surface-2`, `--radius-xs`, 1px inset `--border`. Fill `--accent` (this is the only large use of teal in the product).

| State | Spec |
|---|---|
| Indeterminate ("Preparing…") | 40%-width shuttle, 1.4s ease-in-out alternate; **stops** under `prefers-reduced-motion` and becomes a static 100% track at 30% opacity with the text label carrying the meaning |
| Determinate | `width: {n}%` with **`transition: none`** — width must equal real worker progress |
| Complete | fill → `--success`, 200ms; single checkmark micro-bounce 200ms, then static forever |
| Error | fill → `--danger`, label "Compression failed — try lowering Colors to 128" |

Markup: `role="progressbar" aria-valuenow aria-valuemin="0" aria-valuemax="100" aria-labelledby`. Percentage text in mono tabular-nums. Cancel button (Danger, sm) sits 16px to the right and is focusable at all times during a job.

### 5.8 BeforeAfterSlider

Two stacked layers in a `--radius-card` frame with `overflow: hidden`; the "after" layer is clipped by `clip-path: inset(0 0 0 var(--pos))`. Divider: 2px `--bg` line + 32px circular grab handle (`--bg` fill, 1px `--border-control`, `--shadow-md`, ⟷ glyph). Corner labels: "Before · 2.4 MB" left, "After · 480 KB (−80%)" right, `--text-micro` uppercase on a 70%-opacity `--neutral-950` plate so they stay legible over any frame.

| State | Spec |
|---|---|
| Default | divider at 50% |
| Hover | handle scales 1.06 (transform only), cursor `ew-resize` |
| Dragging | **no transition** — pointer-tracked, `setPointerCapture`, `touch-action: none` |
| Focus-visible | 2px ring around the handle; the frame gets a 1px `--primary` inner outline so the focused region is obvious |
| Reduced motion | handle scale disabled; drag still instant |
| Fallback (huge GIF) | if canvas diff is too expensive, render a static side-by-side pair with the same labels and drop the divider entirely — never ship a laggy slider (open eng question, report §Unresolved 2) |

**Keyboard operation (mandatory):** the handle is `role="slider"` `tabindex="0"` `aria-label="Compare before and after"` `aria-valuenow` 0–100 `aria-valuetext="After image 62% visible"`. ← / → move 1%, Shift+← / → 10%, Home 0%, End 100%, Enter toggles a 0%/100% A-B flip for a fast side-by-side check.

### 5.9 ResultPanel

`--surface-1`, `--radius-card`, `--shadow-sm`, 1px `--border`, 24px pad. Contains: BeforeAfterSlider · size delta line (`480 KB` mono + `−80%` success pill) · Download (Primary, lg, full-width on mobile) · "Start over" (Ghost) · "Also save as WebP / MP4" secondary row.
Reveal: 180ms ease-out, translateY 8px + fade. The container's `min-height` is reserved in the static HTML so the reveal causes no shift.
Empty state before a run: same box, dashed `--border`, centred `--text-muted` "Your compressed GIF will appear here." — this is what reserves the space.
Announce completion in the live region (§7.5): "Done. 2.4 megabytes reduced to 480 kilobytes, 80 percent smaller."

### 5.10 AdSlot

See §8 for placement law. Visual spec:

```css
.ad-slot{
  background: var(--surface-ad);        /* flat, no gradient */
  border: 1px solid var(--border-ad);
  border-radius: 6px;                   /* --radius-ad, reserved word */
  box-shadow: none;                     /* enforced */
  contain: layout size;
  margin-block: 24px;                   /* clearance, both sides */
  display: grid; place-items: center;
  overflow: hidden;
}
.ad-slot::before{                        /* label, top-left, always present */
  content: "Advertisement";
  position: absolute; inset-block-start: 6px; inset-inline-start: 8px;
  font-size: .6875rem; font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: var(--text-ad-label);
}
.ad-slot--rect   { min-height: 250px; aspect-ratio: 300/250; max-width: 300px; }
.ad-slot--inline { min-height: 280px; aspect-ratio: 336/280; max-width: 336px; }
.ad-slot--rail   { min-height: 600px; width: 300px; }
```

States: **reserved/unfilled** — empty box, label only, no spinner, no "loading ad" text. **Filled** — creative fills the box; no entrance animation, ever. **Blocked/failed** — the box collapses to `0` height *only* on a resize-safe boundary (after the next user interaction), never mid-scroll.

### 5.11 Toast

`--surface-raised`, `--radius-panel`, `--shadow-lg`, 1px `--border`, 4px leading status stripe (`--success` / `--danger` / `--warning`), 16px pad, max-width 380px. Bottom-right desktop; on mobile top-centre (bottom is occupied by the action bar).
Enter 180ms ease-out slide 8px + fade. Exit 120ms fade. Auto-dismiss 6s for success, **never** for errors. Always has a visible close button (44px target). Hovering or focusing pauses the timer.
Region: `<div role="status" aria-live="polite">` for success, `role="alert"` for errors.

### 5.12 Accordion (FAQ)

Header = `<button>` full-width, 56px min, `--text-h3`, chevron rotates 180° over 150ms ease-out. 1px `--border` bottom divider between items; no border on the last.
Hover: bg `--surface-1`. Open: header text `--text`, chevron `--primary`, panel `--text-body` with 68ch measure, 16px top / 24px bottom pad. Focus-visible: 2px ring inset 2px so it doesn't clip against the divider.
Panel height animates via `grid-template-rows: 0fr → 1fr` (no JS height math, no CLS). **Every FAQ answer is present in the SSG HTML and is not `display:none`-hidden from crawlers** — use `hidden="until-found"` so Chrome's find-in-page can reveal it and the content stays indexable.

---

## 6. Motion

| Interaction | Duration / easing | Rule |
|---|---|---|
| Button / control hover, press | 100–150ms `ease-out` | `background-color`, `opacity`, `transform` only. Never width/height/margin. |
| Dropzone drag-over | 100ms `ease-out`; border + bg tint; max `scale(1.01)` | Never resize the dropzone box on drag. |
| Panel / result reveal | 150–200ms `ease-out`, slide 8px + fade | Space already reserved. |
| Progress bar fill | **no transition** | Must map 1:1 to real worker callbacks. Never simulate. |
| Before/after drag | instant, pointer-tracked | Any lag kills the quality-proof moment. |
| Success checkmark | one 200ms micro-bounce, then static | Never loop — repeated motion reads as "still working". |
| Accordion | 150ms `ease-out` on `grid-template-rows` | |
| Toast | in 180ms, out 120ms | |
| Theme switch | `--bg`/`--text` 120ms `ease` | Suppress on first paint. |
| **Never animate** | — | ad slot appearance or fill · page-level scroll effects · parallax · anything that runs on a loop · route-transition curtains |

Perceived-speed lever: `next/link` prefetch on hover across the 9 tool pages. Structural speed, not decorative.

```css
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{
    animation-duration:.01ms!important; animation-iteration-count:1!important;
    transition-duration:.01ms!important; scroll-behavior:auto!important;
  }
}
```
Under reduced motion, meaning must survive: the indeterminate progress shuttle becomes a static track + text label; the success bounce becomes an instant icon swap; the before/after drag is unaffected (it is direct manipulation, not animation).

---

## 7. Accessibility

Target: **WCAG 2.1 AA**, with WCAG 2.2 focus-appearance applied where cheap.

### 7.1 Measured contrast (computed, not estimated)

Light theme, against `#FFFFFF` unless noted:

| Pair | Ratio | Verdict |
|---|---|---|
| `--text` #111827 on bg | **17.74:1** | AAA |
| `--text-secondary` #374151 | **10.31:1** | AAA |
| `--text-muted` #4B5563 | **7.56:1** | AAA |
| `--primary` #2F5DE8 link text | **5.45:1** | AA |
| white on `--primary-fill` #2348D6 | **7.07:1** | AAA |
| white on `--primary-hover` #1B39B0 | **9.30:1** | AAA |
| `--success-text` #15803D | **5.02:1** | AA |
| `--warning-text` #B45309 | **5.02:1** | AA |
| `--danger` #DC2626 | **4.83:1** | AA |
| `--accent-text` #0B7A73 | **5.19:1** | AA |
| `--accent` #0E9C93 fill vs `--surface-2` #F0F1F5 track | **3.00:1** | AA non-text (exactly at threshold — do not lighten the track past `#F0F1F5`) |
| `--border-control` #6B7280 vs bg | **4.83:1** | AA non-text |
| `--text-ad-label` #6B7280 on `--surface-ad` #F8F9FB | **4.59:1** | AA |

Dark theme, against `#0B0D12`:

| Pair | Ratio | Verdict |
|---|---|---|
| `--text` #F8F9FB | **18.45:1** | AAA |
| `--text-muted` #C7CCD6 | **12.06:1** | AAA |
| `--primary` #5B82F5 link | **5.51:1** | AA |
| `--primary-hover` #6E90FF link hover | **6.57:1** | AA |
| white on `--primary-fill` #3D5AFE | **5.13:1** | AA |
| white on `--primary-fill-hover` #2F5DE8 | **5.45:1** | AA |
| `--accent` #2DD4C0 | **10.45:1** | AAA |
| `--success` #4ADE80 | **11.15:1** | AAA |
| `--danger` #F87171 | **7.03:1** | AA |
| `--border-control` #6B7280 vs `--surface-2` #191D26 | **3.49:1** | AA non-text |

**Two deliberate deviations from the design-direction report §3, both to pass AA:**
1. The report specified a `neutral-400` "Advertisement" label. `#9AA1B0` on `#F8F9FB` measures **2.46:1** — fails AA and would also weaken the disclosure that keeps us Better-Ads-compliant. Raised to `neutral-500` (**4.59:1**). Still visually recessive, now legible and legally sound.
2. The report's teal `#0E9C93` measures **3.39:1** on white — fine as a progress *fill* (non-text) but failing as text. Added `--accent-700` `#0B7A73` (**5.19:1**) for the "instant, in-browser" badge text. Same hue family, no new colour identity.
3. The report's dark `primary-hover` `#6E90FF` works as a **link/ghost text** hover on a dark background (6.57:1) but fails badly as a **button fill**: white on `#6E90FF` measures **2.96:1**. Splitting the token fixes it — `--primary-fill-hover` *darkens* in dark mode (`#3D5AFE` → `#2F5DE8`, white stays at 5.45:1) while `--primary-hover` keeps the report's lighter value for text. Darkening a filled button on hover in dark mode is standard practice; lightening it here is simply not reachable at AA.

Non-negotiable: `--text-disabled` never carries information that exists nowhere else. Disabled state is always paired with a reason in adjacent text or a tooltip.

### 7.2 Focus

Visible on every interactive element, including the dropzone, the before/after handle and the sticky-bar buttons. `:focus-visible` only (no mouse-click rings), 2px solid `--focus-ring`, 2px offset, plus a 4px `--primary-subtle` halo. Focus ring contrast vs adjacent surfaces: **5.45:1** on white, **4.83:1** on `--surface-2`, **5.51:1** on dark bg — all above the 3:1 requirement.
Skip-to-content link is the first tabbable node, visible on focus at z-70.
Focus order follows DOM order. **Ad iframes are the last tabbable content in their region** — they must never sit between the settings panel and the Compress button in the tab order.

### 7.3 Keyboard operation

| Component | Keys |
|---|---|
| Dropzone | Tab to reach · Enter/Space opens the file picker · Ctrl/Cmd+V pastes anywhere on the page |
| Before/after slider | Tab to handle · ←/→ 1% · Shift+←/→ 10% · Home/End 0/100% · Enter flips A↔B |
| Slider controls | native range keys (←/→, PgUp/PgDn, Home/End) |
| Select | Radix defaults: Enter/Space open, ↑/↓ navigate, typeahead, Esc close, Tab commits |
| Accordion | Tab between headers, Enter/Space toggle |
| Toast | Esc dismisses the newest; F6 jumps to the toast region |
| Cancel during a job | always reachable with a single Tab from the progress bar |

Everything is operable without a pointer. There is no drag-only path: drag-and-drop, click-to-browse and paste are three routes to the same outcome.

### 7.4 Reduced motion

See §6. Additionally: no auto-playing preview loop unless the user opts in — animated GIF previews respect `prefers-reduced-motion` by rendering the first frame with a "Play preview" button overlay.

### 7.5 Live regions

A single polite live region per tool page, owned by the job controller:

```html
<div id="job-status" role="status" aria-live="polite" aria-atomic="true" class="sr-only"></div>
```

Announce on **state change only**, never on every progress tick (throttle to 25% boundaries, max one message per 2s):
`"Compressing. 25 percent."` → `"Compressing. 50 percent."` → `"Done. 2.4 megabytes reduced to 480 kilobytes, 80 percent smaller. Download button is now available."`
Errors go to a separate `role="alert"` node. The visible progress percentage carries `aria-hidden="true"` so the number is not double-announced.

### 7.6 Other

- Every image/canvas has a meaningful `alt`; decorative SVG marks get `aria-hidden="true"`.
- Form controls have real `<label for>`; placeholder is never the only label.
- `lang` set on `<html>`, ready for next-intl.
- Colour is never the only signal: the size-delta pill carries "−80%" text, not just green; errors carry an icon + text, not just red.
- Test matrix per release: keyboard-only pass on the compressor page, VoiceOver + NVDA pass on the job flow, 200% zoom at 375px with no horizontal scroll, forced-colors mode sanity check.

---

## 8. Ad slot rules (binding)

Taken from the design-direction report §5 and tech-stack.md §6. These are policy, not preference.

1. **Never above the fold on a tool page.** The dropzone is the conversion action; an ad competing with it above the fold hurts conversion and risks CLS because ad fill timing is unpredictable. Matches Google's own guidance to place uncertain-size slots lower.
2. **CSS reservation, not JS-computed.** Render the slot `<div>` in the initial SSG HTML with explicit `min-height`/`aspect-ratio` set via breakpoint-specific CSS: `.ad-slot{min-height:250px;aspect-ratio:300/250;contain:layout size;background:var(--surface-ad)}`. **Never inject the container node after hydration** — only the ad script fills it.
3. **Minimum 24px / one button-height clearance** between any ad slot and the Compress/Download button. Non-negotiable; flagged in tech-stack.md as an AdSense-approval risk.
4. **Mobile ad density < 30%** of the visible viewport (Better Ads 2026 update, effective 2026-05-15). With a sticky bottom action bar *and* a bottom anchor ad, budget carefully: **prefer in-content over anchor on tool pages** so the anchor slot stays free for the action bar.
5. **Prohibited outright:** pop-ups · prestitial/poststitial with countdown · auto-play video with sound · full-screen scroll-over · large sticky ads (mobile or desktop).
6. **Visual quarantine** (§5.10) is itself an ad-safety measure — Better Ads flags "ads disguised as content"; a mismatched radius, absent shadow and explicit label make accidental clicks and later policy violations far less likely.

### 8.1 Approved slot map

| Page type | Slot | Size | Position | Condition |
|---|---|---|---|---|
| Tool | `result-rect` | 300×250 | Below the result panel | Rendered reserved from first paint; **fills only once a result exists** |
| Tool | `content-inline` | 336×280 | Inside the SEO explainer, after ≈150 words | Always |
| Tool (≥1280px) | `rail` | 300×600 | Right rail, CSS-grid column declared from first paint | Viewport ≥1280px only. No late injection — the grid column exists at all widths ≥1280 whether or not the ad fills. |
| Tool (mobile) | `anchor` | 320×50 | Bottom anchor, dismissible, height-capped | **Only when the sticky action bar is absent** (i.e. no job in flight, no result). Mutually exclusive with the action bar. |
| Homepage | `below-grid` | 336×280 | Below the 9-tool grid | Always |
| Content/blog | `content-inline` ×2 | 336×280 | After ~150 and ~600 words | Always |

Never place an ad: between a label and its control · inside a tool panel · between the settings and the Compress button · above the fold on any tool page · within 24px of a primary action.

---

## 9. Responsive

| Breakpoint | Width | What changes |
|---|---|---|
| **base** | 375–639 | Single column, 16px gutters. Dropzone 176px tall. Settings stack full-width. **Sticky bottom action bar (64px, `--surface-raised` + 1px top `--border` + `--shadow-md` upward)** carries the single primary action; it appears once a file is loaded and replaces the inline button. Anchor ad suppressed while the bar is visible. Tool grid 1 column. Before/after slider full-bleed to the gutters. |
| **sm** | 640–767 | 24px gutters. Tool grid 2 columns. Settings go 2-up where labels are short. |
| **md** | 768–1023 | Content max-width 720px. Dropzone 240px. Sticky action bar retires; the primary button returns inline under the settings. Tool grid 3 columns. First ad (300×250) becomes centred below the result. |
| **lg** | 1024–1279 | Two-column tool layout: preview/result left (`1fr`), settings panel right (`320px`), 32px gap. Dropzone 280px. Content max-width 1040px. Header nav expands from the ≡ menu to inline links. |
| **xl** | 1280–1535 | Adds the 300×600 right rail as a third grid column (`1fr 320px 300px`), reserved from first paint. Content max-width 1280px. |
| **2xl** | ≥1536 | No new structure — max-width caps at 1280px and centres. Deliberately no wider layout: a utility tool that stretches to 1900px reads as unfinished. |

Hard rules: no horizontal scroll at 320px · touch targets ≥44px below `md` · the dropzone must be fully visible at 375×667 without scrolling on every tool page · text reflows without loss at 200% zoom · `contain: layout size` on every reserved box so a late fill cannot reflow the page.

---

## 10. Page archetypes

**Homepage** — h1 + one-line value prop · trust line · hero dropzone (routes to the right tool by detected file type) · 9-tool grid (`--radius-card` cards, icon + name + one-line benefit) · "Why PZGIF" three-up (in-browser / private / gifski quality) · Discord presets teaser · ad below the grid · footer with the full tool list for internal linking.

**Tool page** — h1 (exact-match keyword) · trust line 🔒 immediately under it · dropzone · settings + preview · progress · result panel · **ad** · SEO explainer (≥400 words, H2/H3 structure) · **inline ad** after ~150 words · FAQ accordion (schema.org `FAQPage`) · related tools · footer.

**Preset page (Discord/Slack)** — same skeleton, but the settings panel is replaced by a **constraint UI**: preset chips (Emoji 128×128 / Sticker 320×320 / Banner 680×240 / Avatar 128×128), a live "target size" readout that must land under 256 KB, and an auto-tuning quality search rather than manual sliders. The success criterion is explicit and binary: "Fits Discord's 256 KB limit ✓".

---

## 11. Trust line

Exact string, one per page, immediately below the h1 (tool pages) or below the sub-head (homepage), never in a corner or the footer:

> 🔒 **100% in your browser.** Files never leave your device.

`--text-sm`, `--text-secondary`, lock glyph in `--accent-text`. On mobile it stays above the dropzone. It is the only emoji permitted in the product UI. On pages where a server-side Pro path exists (Phase 2+), the wording must change rather than disappear — a false privacy claim is worse than no claim.

---

## Open questions

1. Ezoic's "Ad Tester" may override manual placements; the slot map in §8.1 assumes manual control holds. Verify before launch (report §Unresolved 1).
2. Before/after slider fallback threshold for very large GIFs is not set — needs an eng benchmark (report §Unresolved 2).
3. Logo/mark does not exist yet; wireframes use a placeholder loop mark built from the brief in report §6. Final favicon legibility at 32px is untested.
4. No real CLS measurement exists for the ad + dropzone coexistence layout — this is original synthesis with no competitor precedent (report §Unresolved 3). Measure once the ad script is live.
5. Mobile anchor ad vs sticky action bar are specified as mutually exclusive; whether Ezoic can be configured to respect that conditional suppression is unverified.
