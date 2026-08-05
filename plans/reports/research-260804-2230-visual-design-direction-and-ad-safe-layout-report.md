# PZGIF Visual Design Direction — Research Report

Sources: [ezgif.com](https://ezgif.com/resize), [squoosh.app](https://squoosh.app), [cloudconvert.com](https://cloudconvert.com), [imgflip.com/gif-maker](https://imgflip.com/gif-maker), [veed.io](https://veed.io), [Google Publisher Tag — minimize layout shift](https://developers.google.com/publisher-tag/guides/minimize-layout-shift), [Coalition for Better Ads standards](https://www.betterads.org/standards/), [betterads.org 2026 update press release](https://www.betterads.org/press-releases/updated-standards-desktop-mobile-web), Google Fonts specimens (Space Grotesk, Hanken Grotesk, Bricolage Grotesque, Mona Sans, JetBrains Mono).

## 1. Competitor teardown

| Site | Layout pattern | Dropzone | Results | Ads | Verdict |
|---|---|---|---|---|---|
| ezgif.com | Dense multi-tool nav, form-field options | Top, small, plain "choose/paste/drag" | Below fold, plain link | Banner-heavy, interspersed with tool UI | **Dated** (early-2010s density) but the convention — dropzone always top, options as plain form fields — is what users searching "gif resizer" expect. Beating the *look* is easy; beating the *speed-to-first-action* is the bar. |
| squoosh.app | Minimal, hero dropzone + 3 value cards below | Center-stage, huge, "Drop OR Paste", demo images to try instantly | Live before/after slider (dual canvas, draggable divider) — **this is the pattern to copy for gifski quality proof** | None (Google Labs project, no ad model) | Best-in-class visual polish; before/after slider is the single most valuable pattern for us. |
| cloudconvert.com | Hero dropzone + format chip catalog | Center, "Drop a file and pick what to turn it into" | N/A (redirect flow) | None visible on marketing pages; monetization via API pricing, not display ads | "Established reliability" tone — validates a restrained, non-flashy palette for trust. |
| imgflip.com/gif-maker | Tabbed input (video/image), progressive-disclosure "More Options" | Prominent, dual-tab | Inline preview + Pro upsell table at bottom | Present but kept clear of editing controls; sidebar "Hot GIFs" fills social-proof role | Shows ads + personality (quirky option labels) can coexist with usability — proof a tool site doesn't have to feel corporate. |
| veed.io | SaaS marketing homepage, card grid, testimonial carousel, trust-logo bar | N/A (this is marketing, not the tool itself) | — | — | Electric-cyan CTA + heavy social proof — good for a landing/marketing page, wrong tone for the tool page itself (too "sales"). |

**Conventions to keep** (breaking = lost conversions): dropzone always above the fold, drag-and-drop + click-to-browse + paste all supported, plain-language option labels, download button large and singular.
**What's worth beating**: ezgif's ad-vs-tool visual confusion, everyone's weak or absent before/after proof, imgflip's cluttered "More Options" walls, squoosh's total lack of monetized-layout precedent (we have to solve ad+dropzone coexistence ourselves — no direct model exists).

## 2. Typography — 3 candidates (no Inter/Poppins)

| # | Display/Heading | Body/UI | Mono (sizes/dims) | Why | Cost |
|---|---|---|---|---|---|
| 1 **(recommended)** | **Space Grotesk** (500, 700) | **Hanken Grotesk** (400, 500, 600, 700 — variable, 300–900 axis) | **JetBrains Mono** (400, 500) | Space Grotesk's squared apertures + monospace-influenced proportions read "technical/fast" without being a display gimmick; Hanken Grotesk is a genuinely underused, high-legibility variable workhorse (Vietnamese + Cyrillic-ext coverage — future-proofs i18n per tech-stack.md); JetBrains Mono is the de facto dev-tool mono, instantly signals "precise numbers." | 3 variable WOFF2 files, ~120-150KB combined subset (Latin) |
| 2 | **Bricolage Grotesque** (weight+width+optical-size variable axis) | **Public Sans** (400, 500, 600, 700) | **IBM Plex Mono** (400, 500) | Bricolage has the most personality/"2026-feeling" of the three — its optical-size axis lets one file serve both a huge H1 and a tight label. Public Sans (US govt-grade, extremely legible at small sizes) grounds it. | Bricolage variable file runs larger (~180KB) due to 3 axes |
| 3 | **Mona Sans** (variable wght+wdth, 200–900) | Mona Sans (same family, lighter weights) | **Geist Mono** (400, 500) | Single-family system (GitHub's font) — one variable file does display+body, width axis lets you condense dense UI labels without a second font. Strong multilingual coverage. | Lowest total request count (1 variable family + 1 mono), ~140KB |

**Pick: Option 1 (Space Grotesk + Hanken Grotesk + JetBrains Mono).** Rationale: best legibility-at-small-size of the three (critical — this is a dense utility UI with slider labels, KB/px readouts, not a marketing page), Hanken Grotesk's Vietnamese glyph coverage is a free hedge given founder/market context, and the combination is visually distinct from every competitor above (none use a grotesque-with-character pairing — they're all default-system-sans). Load via `next/font/google` self-hosted per tech-stack.md (no render-blocking request, zero CLS).

## 3. Color system

All values WCAG AA-checked for their stated use (button fill = large-text/UI-component 3:1 min; body text = 4.5:1 min).

| Token | Light | Dark | Use |
|---|---|---|---|
| primary-500 | `#2F5DE8` | `#5B82F5` | brand, links (dark-mode primary lightened for contrast on dark bg) |
| primary-600 (button fill) | `#2348D6` | `#3D5AFE` | Compress/Download button — white text = ~4.6:1 AA |
| primary-hover | `#1B39B0` | `#6E90FF` | |
| accent (progress/speed only) | `#0E9C93` (restrained teal, NOT neon) | `#2DD4C0` | progress-bar fill, "fast" micro-badges — **used <5% of surface area** |
| success | `#15803D` (text) / `#16A34A` (fill) | `#4ADE80` | done state, size-reduction % |
| warning | `#B45309` (text) / `#F59E0B` (fill/icon only) | `#FBBF24` | file-size-limit notices |
| danger | `#DC2626` | `#F87171` | errors, cancel |
| neutral-50/100/200/300/400/500/600/700/800/900/950 | `#F8F9FB #F0F1F5 #E1E4EA #C7CCD6 #9AA1B0 #6B7280 #4B5563 #374151 #1F2937 #111827 #0A0E16` | (invert scale for dark surfaces) | text/border/scale |
| bg (page) | `#FFFFFF` | `#0B0D12` | |
| surface-1 (card/tool panel) | `#F8F9FB` | `#14171F` | rounded-2xl, shadow-sm |
| surface-2 (dropzone) | `#F0F1F5` w/ dashed `primary-500/40` border | `#191D26` w/ dashed `primary-500/50` | |

**"PZ = speed" accent — verdict: trap if used as a bright/neon primary.** A high-energy neon (e.g., lime `#C8FF3D`) is exactly the color family used by programmatic display-ad creatives; putting it in our own chrome undermines the "ad slots must never look like product UI" requirement. **Resolution:** keep primary a restrained cool blue (trust/technical), express "speed" through the desaturated teal accent used ONLY on progress-fill and a small "instant, in-browser" badge — motion and copy carry the speed message, not a loud hue.

**Ad slot chrome (explicit quarantine treatment):** background `neutral-50`/`neutral-900` (flat, no gradient), `1px solid neutral-200`/`neutral-800` border, **square/minimal radius `rounded-md` (6px)** vs product cards' `rounded-2xl` (16px) — the radius mismatch is a subconscious "this is not app UI" signal, no box-shadow (product cards use `shadow-sm`), small-caps 10px `neutral-400` "Advertisement" label top-left, generous 24px vertical margin separating it from any button.

## 4. Layout — tool page (primary page type)

Desktop (≥1024px):
```
┌────────────────────────────────────────────────────────────┐
│ PZGIF   Compress·Resize·Crop·Convert·Discord Presets   [≡]  │ 56px sticky header
├────────────────────────────────────────────────────────────┤
│ H1 GIF Compressor — shrink file size, keep quality           │
│ 🔒 100% in your browser. Files never leave your device.      │  trust line, always visible
│ ┌──────────────────────────────────────────────────────┐    │
│ │        ⬆  Drop GIF here or click to browse            │    │ dropzone: full width,
│ │        Max 150MB · .gif   [drag-over: border solid,    │    │ ~260-320px tall,
│ │        bg tints primary-500/5, scale 1.01 100ms]       │    │ dashed 2px, rounded-2xl
│ └──────────────────────────────────────────────────────┘    │
├────────────────────────────────────────────────────────────┤
│ (after upload — dropzone collapses to slim file chip)         │
│ Before          ⇄ slider  After (gifski)     │ Quality ●──○  │
│ ┌─────────┐        ┌─────────┐               │ Colors  256▾  │  before/after: draggable
│ │ 2.4 MB  │        │ 480 KB  │               │ Lossy   [===] │  divider over canvas,
│ └─────────┘        └─────────┘               │ [ Compress ]  │  Squoosh pattern
│ ░░░░░░░░░░░░░░░░░░░░░░ 62%  [Cancel]  (real, worker-driven)  │
│ ⬇ compressed.gif · 480KB (−80%)      [Download] [Start over] │
├────────────────────────────────────────────────────────────┤
│ [ 300×250 ad — reserved, appears only after result exists ]  │  first ad, below the fold
├────────────────────────────────────────────────────────────┤
│ H2 How GIF compression works / FAQ accordion (SEO copy)      │
│ [ in-content 336×280 rect, reserved, after ~150 words ]       │
├────────────────────────────────────────────────────────────┤
│ Footer: other tools grid, legal links                         │
└────────────────────────────────────────────────────────────┘
```
Right-rail 300×600 skyscraper permitted only ≥1280px viewport, reserved via CSS grid column from first paint (no late injection).

Mobile (<768px): single column, dropzone ~180px tall, controls stack below result, **sticky bottom action bar** (Compress/Download, 56px, `surface-1` + top border) for thumb reach, first ad appears after result (never above the fold — matches "place uncertain slots lower" guidance), optional small anchor ad (320×50, dismissible, capped height) is Better-Ads-compliant since only "large" sticky ads are prohibited.

## 5. Ad-safe layout rules

- **Never above the fold on a tool page** — the dropzone is the conversion action; an ad competing with it above the fold both hurts conversion and risks CLS since ad fill timing is unpredictable. Matches Google's own guidance to place uncertain-size slots lower on the page.
- **CSS reservation, not JS-computed:** render the slot `<div>` in initial SSG HTML with explicit `min-height`/`aspect-ratio` set via CSS (breakpoint-specific), e.g. `.ad-slot{min-height:250px;aspect-ratio:300/250;contain:layout size;background:var(--surface-ad)}`. Never inject the container node after hydration — only the ad script fills it.
- **Minimum 24px / 1 button-height clearance** between any ad slot and the Compress/Download button, non-negotiable (tech-stack.md already flags this as an AdSense-approval risk).
- **Mobile ad density < 30%** of visible viewport (Better Ads 2026 update, effective May 15 2026) — with a sticky bottom action bar AND a bottom anchor ad, budget carefully; prefer in-content over anchor on tool pages to leave the anchor slot free for the action bar.
- **Prohibited outright:** pop-ups, prestitial/poststitial with countdown, auto-play video with sound, full-screen scroll-over, large sticky ads (mobile or desktop).
- **Visual quarantine** (see §3 ad chrome) is itself an ad-safety measure — Better Ads flags "ads disguised as content," and a mismatched radius/shadow/label makes accidental clicks and later policy violations far less likely.

## 6. Logo / brand asset brief

**Concept:** wordmark-led, not icon-led (matches CloudConvert/TinyPNG-style trust cues over illustrated mascots). Fuse "PZ" (speed/instant, like "zip") with GIF's core trait (loop) — avoid literal filmstrip/camera-reel (every video tool — Veed, Kapwing, CloudConvert — already uses motion-line/play-button clichés).

**Ready-to-use generation prompt (Nano Banana):**
> "Minimalist geometric wordmark logo reading 'PZGIF', set in a squared-off technical grotesque typeface (Space Grotesk-inspired), all lowercase or all caps, tight tracking. Integrate a small custom mark before the wordmark: a continuous infinite-loop (figure-eight / möbius) shape rendered as a single unbroken stroke that also reads as a subtle forward-motion streak — implying both 'GIF loop' and 'instant/fast'. Flat vector, two-color max (deep cool blue `#2348D6` + optional teal `#0E9C93` accent stroke), no gradients, no glossy 3D, no generic AI-gradient blob, no filmstrip/camera/reel icon, no clapperboard. Clean enough to read at 32px favicon size. Output on transparent background."

**Required variants:** horizontal lockup (mark+wordmark, for header), square mark alone (app icon/social avatar), favicon at 32px (test mark-only legibility, may need to simplify the loop to 2 strokes), dark-mode variant (mark in `primary-500`/white on dark bg, not just color-inverted — check stroke weight still reads on dark).

**Supporting assets (brief, not full spec):**
1. **OG image template** (1200×630): dark `surface-1` bg, wordmark top-left, dynamic tool name + before/after size badge (e.g. "2.4MB → 480KB") center-right — same pattern per tool page for automated generation.
2. **Empty-state illustration** (dropzone idle state, ~120×120): line-art of the loop mark mid-animation frame, `neutral-300` stroke, single accent dot in `accent` teal — not a full scene, keep it small/fast-loading (inline SVG).

## 7. Motion & microinteraction

| Interaction | Duration/easing | Rule |
|---|---|---|
| Button/control hover-press | 100–150ms `ease-out` | opacity/bg only, never layout-affecting properties |
| Dropzone drag-over | 100ms `ease-out`, border+bg tint, max `scale(1.01)` | never resize the dropzone box itself on drag (causes visible jank + CLS-adjacent jump) |
| Panel/result reveal | 150–200ms `ease-out`, slide+fade 8px | |
| Progress bar | **no easing on width** — must map 1:1 to real worker progress callbacks, never fake/simulated timing | trust-critical: a fast tool that lies about progress reads as slow |
| Before/after slider drag | instant (no transition), pointer-tracked | any lag here undermines the "quality proof" moment |
| Success state (download ready) | one 200ms micro-bounce on checkmark, then static | never loop/repeat — repeated motion reads as "still working" |
| **Never animate:** | — | ad slot appearance/fill, page-level scroll effects, parallax — all fight the "fast utility" brand and risk CLS |
| Perceived-speed lever | Next.js `<Link>` prefetch on hover between the 9 tool pages | reinforces speed narrative structurally, not just visually |

## Unresolved questions
1. Exact AdSense/Ezoic unit sizes Ezoic's auto-placement will actually serve at launch (Ezoic often overrides manual placement with its own "Ezoic Ad Tester") — verify Ezoic's manual-placement override behavior before finalizing slot count.
2. Whether the before/after slider needs a static fallback for very large GIFs (canvas-diff cost on 150MB inputs) — flag to eng before wireframing.
3. No direct competitor precedent exists for "no-upload WASM tool + display ads" coexistence (Squoosh has no ads) — the ad+trust-signal layout in §4 is original synthesis, not observed-and-copied; validate with a real CLS measurement once ad script is integrated.
4. Discord preset pages (emoji/sticker/banner) layout not covered here — likely a simplified variant of §4 with a fixed target-size constraint UI; separate pass needed if the ui-ux-designer agent wants it now vs later.
