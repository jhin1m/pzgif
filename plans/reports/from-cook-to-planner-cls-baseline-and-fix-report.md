# Phase 1 — CLS baseline and fix

Plan: `plans/260805-2239-pzgif-homepage-soul-pass-.../phase-01-compressor-cls-regression-fix.md`
Date: 2026-08-05 · Branch: `main` · Commit at start: `d6e1332`

## 1. The red baseline, recorded before any change

`pnpm build && pnpm test:e2e` on a clean tree — 72 passed, **4 failed**:

| # | Engine | Test | Value |
|---|---|---|---|
| 1 | chromium | `component-states` › never scrolls horizontally at 320px | `/dev/states` overflows by 40px |
| 2 | chromium | `gif-compressor` › shifts nothing the user did not ask for | shift = **0.01501850125452782** |
| 3 | webkit | `component-states` › puts the skip link first in the tab order | focused `INPUT`, expected `A` |
| 4 | webkit | `component-states` › never scrolls horizontally at 320px | overflows by 40px |

The measured 0.015 matches parent `plan.md:259` exactly.

### Correction to the plan's expected baseline

Parent `plan.md` lists **four** non-CLS failures, including a *WebKit FAQ-panel
height* one. That test was **green** in this baseline run. It is not fixed — it
is **flaky**, and it fails deterministically when run in isolation:

```
[webkit] component-states › keeps FAQ answers reachable in every browser
  Expected: > 10   Received: 0   (and 8.23, 6.21, 6.79 on other runs)
```

Verified against a **stashed, clean tree**: it fails there too. The test reads
`getBoundingClientRect().height` immediately after `aria-expanded` flips, while
the 150ms `grid-template-rows: 0fr → 1fr` transition is still running. It passes
only when a warm parallel suite happens to delay the read. **Pre-existing, not
caused by this work, out of scope by the plan's own boundary** — but it is a
racing assertion, not an engine defect, and it will keep flapping.

## 2. The layout-shift sources, named

Instrumented `entry.sources[]` with tag, class, and the previous/current rects,
plus timestamped markers for each test action. **Three** distinct causes, not one:

| # | Value | Share | Source | Mechanism |
|---|---|---|---|---|
| A | 0.014721 | 98.0% | `div.ad-slot.ad-slot--rect` | `ResultPanel` grew 320px → 505px when the job finished, pushing the reserved ad slot and everything under it down 185px |
| B | 0.000275 | 1.8% | `p.mt-3.text-caption.text-fg-muted` | the elapsed-seconds row appears at t+1s and pushes the "keep this tab open" line down 29px |
| C | 0.0000139 | 0.1% | `span.tabular.min-w-[6ch]` ×2 | JetBrains Mono replaced the fallback and the `ch`-based min-width narrowed by ~7px |

A fourth surfaced only once A-C were closed and only under the parallel suite's
load, at **1.0e-5**: the `ProgressBar` readout. Two compounding causes, and it is
the most transferable finding in this report:

| | Cause | Why it shifts |
|---|---|---|
| D1 | `min-w-[4ch]` | `ch` is a font-relative unit, so the box resized on font swap — the same defect as C |
| D2 | `text-right` | a right-aligned readout pins its **trailing** edge, so `—` → `12%` moved the glyphs ~19px leftward. Chromium scores an element whose *start* edge moves, and a text node counts as an element |

D2 is the general rule this pass produced: **a variable-width number must be
left-aligned in a fixed box.** Right-aligned, every value change is a shift;
left-aligned, only the trailing edge grows and nothing shifts at all. It applied
to `progress-bar.tsx` and to `slider.tsx`, where the probe rewriting `1280 px` to
`480 px` is a value change on the engine's schedule rather than on a click.

This is also why the mono readout only misbehaved sometimes: the job has to run
slowly enough to paint a determinate percentage at all before `—` → `12%` can
happen.

### A refutes the plan's own premise

`phase-01.md`, `job-state.tsx:66-70` and the test's own comment all assert that
the result panel's growth "follows a click and is therefore excluded" as
`hadRecentInput`. **Measured: it is not.**

```
clicked   at 154ms
shift     at 1490ms      ← 1336ms later
result    at 1966ms
```

Chromium's input window is 500ms. The encoder takes longer than that, so the
growth scores as un-prompted CLS on every job that is not near-instant. The
comment was a plausible assumption that had never been measured.

## 3. The fixes

### A — reserve the result panel at the height it actually uses

Two changes, because one does not work without the other:

1. **`before-after-slider.tsx` gains a `fill` prop.** In fill mode the frame
   takes its parent's height instead of setting `aspect-ratio`, and both layers
   letterbox with `object-contain`. They letterbox identically — same source
   dimensions, same box — so the divider still aligns them pixel for pixel.
2. **`gif-compressor-tool.tsx` boxes the slider** in `h-60 md:h-72` and passes
   `fill`. `gif-workbench.tsx` already boxed its result image this way, with the
   comment "an aspect-ratio box would move the ad slot below it". The compressor
   was the outlier.
3. **`result-panel.tsx` reserves `min-h-120 md:min-h-128`** (480 / 512px),
   through one `RESERVED_HEIGHT` constant shared by both branches.

Why the media frame *had* to become fixed-height: an aspect ratio read off a
decoded frame cannot be reserved at all. At the compressor's 564px column a
480×270 GIF asks for 317px and a 720×1280 GIF asks for 1000px. Whichever moment
the panel learns the answer is the moment the page shifts — moving the
reservation to the probe just moves the shift to the probe.

Measured done-state heights that set the constants: **470px at 375×667** and
**504px at 1440×900**.

### B — reserve the elapsed row

The `<p>` is always rendered with `min-h-[1.45em]`, empty until the first second
elapses. Applied in both `gif-workbench.tsx` and `gif-compressor-tool.tsx`.

### C and D — font-independent, start-anchored numeric readouts

`slider.tsx`: `min-w-[6ch] text-right` → `w-16 whitespace-nowrap text-left`.
`progress-bar.tsx`: `min-w-[4ch] text-right` → `w-12 text-left`, and the
completion tick's box matched to `w-12 justify-start` so swapping `100%` for the
tick moves neither the glyphs nor the cancel button.

### Font loading — operator-approved design-system change

`fonts.ts`: all three faces move from `display: "swap"` to `display: "optional"`,
and mono gains `preload: true`.

Reproduced deterministically by holding the `*.woff2` responses back 700ms: with
fonts landing after first paint, the nav, the wordmark and the dropzone title all
reflow. `size-adjust` cannot close that — it corrects average metrics, not
per-glyph advances, and a monospace face against a proportional fallback differs
in exactly the per-glyph advances. `optional` gives the face a ~100ms window and
then commits to the fallback for that page load, so the swap cannot happen at
all.

This is not the `display: block` §3 forbids: there is no invisible-text period
beyond the block phase every value shares. What §3 wanted from mono — digits that
do not jitter — is carried by `font-variant-numeric: tabular-nums`, which applies
to the fallback too.

**Note:** the font change alone did **not** fix the residual — the same
`8.211212786136831e-06` survived it, which is what led to finding D. It is kept
because it closes a real class of shift on slow connections that the test
environment only samples occasionally.

## 4. Result

- `expect(shift).toBe(0)` — **unchanged**. No tolerance widened, no
  `hadRecentInput` exclusion added, no assertion deleted.
- **Zero recorded layout-shift entries across four consecutive full parallel
  suite runs**, then green in three more clean runs.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (186), `pnpm check:forbidden`,
  `pnpm build`, `pnpm check:static` — all green.

Suite now, stable across three runs — 72 passed, 4 failed, and every failure is
pre-existing and out of scope:

| Engine | Test | Status |
|---|---|---|
| chromium | `gif-compressor` › shifts nothing the user did not ask for | **red → green** |
| chromium | `component-states` › never scrolls horizontally at 320px | unchanged |
| webkit | `component-states` › never scrolls horizontally at 320px | unchanged |
| webkit | `component-states` › puts the skip link first in the tab order | unchanged |
| webkit | `component-states` › keeps FAQ answers reachable | now consistently red; **verified red on a stashed clean tree**, see §1 |

## 6. Known residual, recorded deliberately

`plan.downgraded` and `plan.truncated` notes are **not** reserved in
`ResultPanel`. They render in the same commit as the result so they cause no
second shift, but a job that triggers them overshoots the reserved box by ~50px
and shifts once. Reserving them costs 50px of permanent blank on every page load
to protect an exceptional path. Phase 3 should re-measure both constants when it
adds the check-pop, the primary download and the related-tools row.

## 7. Consequence for Phase 3

`phase-03.md`'s success criterion *"`min-h-80` is byte-identical between the
empty and filled branches"* is now *"`RESERVED_HEIGHT` is byte-identical between
them"*, and the value is 480/512px rather than 320px. The empty result panel is
therefore substantially taller than the plan assumed — which suits Phase 3's
designed empty state (checkerboard, personified mark, three "what appears here"
rows) better than a 320px box would have.
