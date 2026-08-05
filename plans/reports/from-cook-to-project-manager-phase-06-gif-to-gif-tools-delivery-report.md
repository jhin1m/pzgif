# Phase 6 delivery — GIF-to-GIF tools (resize, crop, speed, reverse)

**Date:** 2026-08-05 · **Branch:** `main` · **Mode:** `/ak:cook --auto`
**Plan:** `plans/260805-0001-pzgif-mvp-9-browser-native-gif-tools-discord-presets/plan.md`
**Status:** complete · 26/26 new E2E pass on Chromium and WebKit

## What shipped

Four live routes — `/resize-gif`, `/crop-gif`, `/gif-speed-changer`,
`/reverse-gif` — flipped to `status: "live"` in `registry.ts`, so they are now in
the sitemap and in the related-tools blocks.

### New files

| File | Purpose |
|---|---|
| `src/components/tool/gif-workbench.tsx` | The GIF-in/GIF-out job flow, shared by the four tools. Parameterised by a control schema, a `JobSpec` builder, a download suffix and two optional render slots |
| `src/components/tool/crop-rect.ts` (+ test) | Clamping, minimum size, even-pixel rounding, aspect anchoring, handle resize. Pure functions — the single implementation all three crop input methods route through |
| `src/components/tool/crop-overlay.tsx` | Eight handles + drag-to-move, pointer capture, arrow keys (1 px / 10 px with Shift), percent-based geometry, dim scrim, live readout |
| `src/components/tool/crop-fields.tsx` | X/Y/W/H number inputs and the shape presets — the numeric path, in the settings panel, not a fallback |
| `src/hooks/use-first-frame.ts` | `createImageBitmap` → canvas → blob URL. One frame, no worker round trip |
| `src/lib/tools/metadata.ts` | Shared `<head>` shape; every word still comes from the page's own content file |
| `src/content/{resize-gif,crop-gif,gif-speed-changer,reverse-gif}.json` | Hand-written copy, 400+ explainer words and 6 FAQ entries each |
| `src/lib/tools/tool-copy.test.ts` | Site-wide copy invariants — the ones that are invisible when a page is inspected alone |
| `e2e/gif-to-gif-tools.spec.ts`, `e2e/lib/pixel-probe.ts` | Decoded-output E2E, including pixel evidence where structure cannot distinguish outcomes |

Plus the four `page.tsx` + `<slug>-tool.tsx` pairs.

### Changed files

- `registry.ts` — four routes live; related lists rebalanced to three live-ish siblings each
- `content.ts` — one optional `labels` field (progress-bar name, image alt text). Additive; the compressor's content file is untouched
- `messages/en.json` — `tool.outputMeta/outputSize/speedPlan*/speedFloorNotice/direction*` and a new `crop` namespace (handle labels, field labels, readout)
- `registry.test.ts` — the hardcoded "only `gif-compressor` is live" list replaced with a filesystem check that every live slug has a `page.tsx`. The old assertion had to be edited in the same commit as any mistake it was guarding against

## Decisions worth knowing about

**The compressor was not refactored onto the workbench.** Its Colours control
selects the encoder, which makes Quality inert with a visible reason, and its
before/after slider is only honest at matched dimensions. Generalising until the
workbench could express that would turn it into a configuration language — the
failure `phase-05` explicitly named. Recorded as phase-06 open question 3: if a
third variant appears in Phase 7 or 8, fold the compressor in rather than adding
a third implementation.

**Admission control now runs on the page for the reverse tool.** Ping-pong turns
n frames into 2n − 2, and the phase requires that re-plan be surfaced *before*
the run. `admit()` is a pure function of the probe, the spec and the device
tier — no canvas, no WASM, no worker — so calling it from the page is the same
function the pipeline calls with the same arguments, not a second
implementation. Cost: `plan.ts` and its small dependency set are now in a client
chunk. `check-heavy-deps.mjs`'s markers (`@ffmpeg/`, `createFFmpegCore`) do not
appear in that graph.

**No engine change was needed for retime vs drop-frames.** The phase anticipated
possibly extending `ops/speed.ts`; `TimingSpec` already distinguishes `speed`
(retime) from `keepEveryNth` (drop), so the page picks exactly one.

Four requirement deviations — no aspect-ratio *unlock*, no resample-quality dial,
no 1× speed option, drop-frames only at whole-number speeds ≥ 2 — are tabulated
with reasons in the phase file. Each one avoids shipping a control with no lever
behind it.

## Verification

| Gate | Result |
|---|---|
| `pnpm typecheck` · `pnpm lint` | pass |
| `pnpm test` | pass — 24 files, 186 tests (13 new crop-rect, 7 new copy invariants) |
| `pnpm check:forbidden` | pass — 192 files scanned |
| `pnpm build` | pass — four new routes prerendered SSG |
| `pnpm check:static` | pass — 8/8 static |
| `pnpm check:heavy` | pass — 31 client chunks clean |
| `e2e/gif-to-gif-tools.spec.ts` | **26/26 on Chromium and WebKit** |

The pixel thresholds and the Radix-select selector — both flagged as unproven in
the first draft of this report — held on the first run without calibration.

## What the E2E caught, and it was worth writing

**Two product bugs, neither visible without running a job end to end.**

1. **A late probe reverted the user's settings.** The probe is a worker round
   trip; when it landed after the user had already typed, `valuesForProbe` reset
   the controls to file-derived defaults and threw the input away. Instrumented
   and reproduced on `/crop-gif`: the typed value survived two renders, then was
   stomped back to the whole frame. Fixed in `gif-workbench.tsx` — the probe now
   seeds the controls only while every one still holds its mounted value.
   This class of bug applied to the width slider too, not only the crop rect.

2. **Drop-frames mode did not actually speed the GIF up.** `keepEveryNth` alone
   is frame *thinning*: `decode/gif.ts` carries a dropped frame's delay into the
   next kept one on purpose, so 2× drop produced 24 frames at 100 ms — still
   2.4 s long. Correct for the compressor's thinning toggle, wrong for a speed
   changer. Drop mode now sets the stride *and* retimes by the same factor.
   Caught only because the test asserts the per-frame delay rather than just the
   frame count.

One failure was the test's own fault: `loadFixture` waited for `480×270`, which
the crop readout also contains from first paint. It now waits for the frame
count, which only the probe can produce.

## Inherited failures — not from this phase

Five tests fail on `main`. Each was re-run against a `git stash`ed tree (i.e.
before this phase) and fails identically:

| Test | Owner |
|---|---|
| `/dev/states` overflows 40 px at 320 px — both engines | Phase 3 |
| WebKit skip-link tab order | Phase 3 |
| WebKit FAQ-panel height | Phase 3 |
| Compressor CLS 0.015 on Chromium | Phase 5 |

Added to `plan.md` as open question 10. The CLS one deserves attention before
Ship 1 rather than at Phase 11: the plan's own success criterion is CLS = 0 on
every route, and tool pages are the ranking surface.

## Unresolved questions

1. What causes the compressor's 0.015 CLS? It is small but non-zero, and the
   same workbench shape now underpins four more pages — so whatever it is has
   probably been inherited rather than avoided.
2. The homepage still links every registry route, including the five that remain
   unbuilt — four fewer 404s than before this phase, but not zero. Phase 9 owns
   the homepage; worth confirming it filters on `isLive` when it does.
