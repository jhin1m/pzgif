---
phase: 6
title: "GIF-to-GIF Tools"
status: complete
priority: P1
effort: "4-6d"
dependencies: [5]
---

# Phase 6: GIF-to-GIF Tools

## Overview

Ship the four remaining tools that take a GIF in and produce a GIF out: **Resize GIF, Crop GIF, GIF Speed Changer, Reverse GIF**. All four reuse the Phase 4 engine and the Phase 5 framework unchanged — the work is per-tool settings UI, hand-written copy, and one genuinely new interactive control (the crop overlay).

Independent of Phases 7 and 8; all three can proceed in any order once Phase 5 lands.

## Requirements

**Functional**

| Route | Tool | Settings | New engineering |
|---|---|---|---|
| `/resize-gif` | Resize GIF | Exact px W/H, or scale %, aspect-ratio lock (on by default), resample quality | None — `ops/resize` exists |
| `/crop-gif` | Crop GIF | Draggable crop rectangle over the first frame, aspect presets (free / 1:1 / 16:9 / 4:3), numeric X/Y/W/H | **Crop overlay component** |
| `/gif-speed-changer` | GIF Speed Changer | Speed 0.25×-4×, and a "drop frames vs retime" choice | None — `ops/speed` exists |
| `/reverse-gif` | Reverse GIF | Reverse, or ping-pong (forward then back) | None — `ops/reverse` exists |

**Non-functional**
- Each page ships ≥400 words of hand-written explainer plus its own FAQ
- Each page's h1 is the exact-match target keyword
- No page reuses another page's prose

## Architecture

### The only new component: `CropOverlay`

Everything else is configuration. The crop overlay is a real build:

- Renders over the first decoded frame at display scale, mapping display coords to source pixels
- Eight resize handles + drag-to-move, `setPointerCapture`, `touch-action: none`
- Aspect-ratio presets that constrain the drag
- **Keyboard operable**: Tab to the rectangle, arrows move 1px, Shift+arrows 10px, Tab into each handle. `design-guidelines.md` §7.3's "no drag-only path" rule applies — there must be a numeric-entry route to the same outcome, so ship the X/Y/W/H number inputs as a first-class control, not a fallback
- Live pixel readout in mono tabular-nums
- **Output dimensions rounded to even** so a later GIF→MP4 of the same file does not fail H.264's yuv420p requirement

### Speed changer: two genuinely different operations

"Speed up" means one of two things and users mean different ones:

- **Retime** — keep every frame, change per-frame delays. Smooth, same file size. Correct default
- **Drop frames** — remove frames, keep delays. Smaller file, choppier

Expose both, default to retime, and explain the difference in the helper text. Note that GIF per-frame delays are stored in centiseconds, and browsers clamp delays of 0 and 1 up to 100 ms — so a 4× speed-up of an already-fast GIF may not render as fast as the maths suggests. Clamp and say so rather than producing a GIF that plays at an unexpected rate.

### Reverse and ping-pong

Reverse is a frame-array reversal with delays reversed alongside. Ping-pong appends the reversed sequence minus the duplicated end frames — **doubling frame count**, which doubles memory. Admission control must re-plan for ping-pong, and on iOS this will frequently mean a smaller output width. Surface that before the run, not after.

## Related Code Files

- Create: `src/app/[locale]/resize-gif/page.tsx`, `crop-gif/page.tsx`, `gif-speed-changer/page.tsx`, `reverse-gif/page.tsx`
- Create: `src/content/resize-gif.tsx`, `crop-gif.tsx`, `gif-speed-changer.tsx`, `reverse-gif.tsx`
- Create: `src/components/tool/crop-overlay.tsx`
- Create: `e2e/gif-to-gif-tools.spec.ts`
- Modify: `src/lib/tools/registry.ts` — related-tool links
- Modify: `src/lib/media/ops/speed.ts` — add the retime/drop distinction if Phase 4 shipped only one

## Implementation Steps

1. **Resize GIF** first — it is pure configuration and proves the Phase 5 acceptance criterion that a tool can be added without touching the shell. If this requires shell edits, fix the shell before continuing.
2. Add the aspect-ratio lock with correct rounding: locked height follows width, rounded to even, with the computed value shown live.
3. **Crop GIF**: build `CropOverlay`. Do the keyboard path and the numeric inputs at the same time as the pointer path, not after — retrofitting keyboard support into a drag UI is where accessibility debt comes from.
4. **GIF Speed Changer**: implement retime and drop-frames as distinct operations with the delay clamping described above.
5. **Reverse GIF**: implement reverse and ping-pong. Re-run admission control for ping-pong's doubled frame count and surface the adjusted plan before the job starts.
6. Write four distinct sets of explainer copy and FAQ. Each must answer questions specific to its tool — resize covers aspect ratio and quality loss; crop covers per-frame cropping and dead space; speed covers the delay-clamping trap; reverse covers ping-pong and why reversed GIFs sometimes look wrong with certain disposal methods. **Generic filler here is the exact failure mode Google's scaled-content policy punishes, and the penalty is site-wide.**
7. Wire related-tool links through the registry so each page points at three genuinely relevant siblings.
8. E2E per tool: real fixture in, download out, decode the output and assert the transformation actually happened — resized dimensions match, cropped region matches, frame count halved, frame order reversed. Not DOM checks.

## Success Criteria

- [ ] All four tools produce correct, downloadable output verified by decoding it in E2E tests
- [ ] No shell or framework file needed modification to add Resize GIF
- [ ] `CropOverlay` is fully keyboard operable and has a numeric-entry path to the same result
- [ ] Ping-pong re-plans for doubled frames and refuses or downsizes gracefully on iOS
- [ ] Speed changer's delay clamping is implemented and explained in the UI
- [ ] Four distinct sets of hand-written copy, each ≥400 words, with no shared paragraphs
- [ ] Each page's h1 is its exact-match target keyword
- [ ] CLS 0 and keyboard pass on each page

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Copy across four similar tools drifts into templated filler | Write each page's copy in one sitting with the wireframe's voice rules in hand: plain English, second person, quantitative, no exclamation marks. Review all four side by side before shipping — that is when duplication becomes visible |
| `CropOverlay` accessibility retrofitted | Build keyboard + numeric entry in the same commit as pointer dragging |
| Ping-pong OOMs on mobile | Re-plan before the job; the doubled frame count is known up front, so there is no excuse for a mid-job failure |
| Four pages launched at once trips a content-quality review | The bootstrap guidance is to launch programmatic pages in batches of 20-50 and watch Search Console. Four hand-written pages is well inside that, but still verify indexing before Phase 7 adds four more |

## Open questions

1. ~~Should Resize GIF offer upscaling?~~ **Resolved 2026-08-05: no, and the slider stops at the source width rather than accepting a larger number and capping it.** The engine cannot upscale at all — `FrameGeometry` clamps the target to `rotatedWidth` — so "allow it with a warning" would have meant an engine change to add a path whose only output is a larger, softer file. The recommendation's actual concern was the *silent* cap, and a slider whose maximum is the source width is not silent: the control visibly stops, and both the hint and a FAQ entry say why. Recorded as a deviation below.
2. ~~Does the crop overlay preview animate?~~ **Resolved 2026-08-05: static by default, with a "Play the preview" toggle**, as recommended. The still comes from `createImageBitmap(file)` — one frame, no worker round trip, every supported browser — and falls back to the animated file when that fails.
3. **New, and unresolved: does the shared workbench and the compressor's bespoke page stay two files?** Four tools now share `components/tool/gif-workbench.tsx`; the compressor did not move onto it, because its Colours control selects the encoder and greys out Quality, and its before/after slider is only honest at matched dimensions. That is a defensible split today. It stops being defensible if Phase 7 or 8 needs a third variant — at which point the compressor's differences should be expressed as workbench props rather than as a second implementation of the job flow.

## Delivery (2026-08-05)

**Shipped.** Four routes, live in `registry.ts` and therefore in the sitemap:
`/resize-gif`, `/crop-gif`, `/gif-speed-changer`, `/reverse-gif`.

| Built | Where |
|---|---|
| Shared job flow for GIF→GIF tools | `src/components/tool/gif-workbench.tsx` |
| Crop rectangle arithmetic (pure, unit-tested) | `src/components/tool/crop-rect.ts` + `.test.ts` |
| Crop overlay — pointer, keyboard, 8 handles | `src/components/tool/crop-overlay.tsx` |
| Numeric crop entry + shape presets | `src/components/tool/crop-fields.tsx` |
| First-frame still for the crop preview | `src/hooks/use-first-frame.ts` |
| Four hand-written content files, 400+ explainer words each | `src/content/{resize-gif,crop-gif,gif-speed-changer,reverse-gif}.json` |
| Cross-page copy invariants, including paragraph uniqueness across all five tool pages | `src/lib/tools/tool-copy.test.ts` |
| Decoded-output E2E for all four tools | `e2e/gif-to-gif-tools.spec.ts`, `e2e/lib/pixel-probe.ts` |

**No engine file was modified.** `ops/speed.ts` was left alone: the retime/drop
distinction the phase anticipated needing new code is already expressible —
`timing.speed` retimes, `timing.keepEveryNth` drops — so the page picks one and
never both. `plan.ts` is now *imported* by the reverse page to run admission
control before the job, but not changed.

**No shell or framework file was modified either**, which was step 1's test.
`content.ts` gained one optional `labels` field (progress-bar name and image alt
text, per tool) — a content schema addition, additive, and the compressor's
content file was untouched.

### Deviations from this phase's requirements, and why

| Asked for | Shipped | Reason |
|---|---|---|
| Resize: "exact px W/H, aspect-ratio lock (on by default)" | Width only; the ratio is stated and the computed height shown live | There is no stretch path in the engine — `FrameGeometry` derives height from width. An unlockable lock would have been a control whose unlocked state does nothing, which is the class of dishonesty that got the compressor's Lossy slider cut. Changing a GIF's shape is the crop tool's job, and the copy routes people there |
| Resize: "resample quality" | Not shipped | One resampler exists (`drawDownscaled`'s step-down). A dial with no lever behind it is the same defect |
| Speed: 0.25×–4× | 0.25, 0.5, 0.75, 1.5, 2, 3, 4 — no 1× | 1× is "no change" on a tool whose purpose is change |
| Speed: "drop frames vs retime" choice | Both, with drop offered only at whole-number speeds ≥ 2 | `keepEveryNth` is a stride; a stride of 1.5 is not a thing, and frames cannot be removed to slow a GIF down. The control stays visible and says why (§5.1) rather than disappearing |

### Verification status

| Gate | Result |
|---|---|
| `pnpm typecheck` · `pnpm lint` | pass |
| `pnpm test` | pass — 24 files, 186 tests |
| `pnpm check:forbidden` | pass — 192 files, no `SharedArrayBuffer`/COOP/COEP |
| `pnpm build` | pass — all four routes prerendered as SSG |
| `pnpm check:static` | pass — 8/8 routes static |
| `pnpm check:heavy` | pass — no heavyweight decoder in 31 client chunks |
| `e2e/gif-to-gif-tools.spec.ts` | **26/26 pass on Chromium and WebKit** |

### Two real defects the E2E caught on its first run

Both were product bugs, not test bugs, and neither is visible without running a
job end to end.

**1. A late probe silently reverted the user's settings.** A probe is a worker
round trip; on a large GIF it lands after the page is interactive. When it did,
`valuesForProbe` reset the controls to their file-derived defaults — throwing
away a crop rectangle or a width the user had already typed. Reproduced on
`/crop-gif`: a typed value held for two renders and was then stomped back to the
whole frame. Fixed in `gif-workbench.tsx` — seeding from the probe now applies
only while every control still holds its mounted value.

**2. Drop-frames mode did not speed the GIF up.** `keepEveryNth` on its own is
*frame thinning*, not a speed change: `decode/gif.ts` deliberately carries a
dropped frame's delay into the next kept one, so "keep 1 in 2" produced 24
frames at 100 ms — still 2.4 seconds long. That behaviour is correct for the
compressor's thinning toggle and wrong for a speed changer. Drop mode now sets
the stride *and* retimes by the same factor, giving 24 frames at the original
50 ms and half the duration. The E2E asserts the per-frame delay, not just the
frame count, which is the assertion that distinguishes the two.

A third failure was a defect in the test itself: `loadFixture` waited for
`480×270`, which the crop overlay's own readout contains from first paint
because the fallback bounds match this fixture. It now waits for the frame
count, which only the probe can produce.

### Inherited failures, confirmed not caused by this phase

Five tests fail on `main`. Each was re-run against a `git stash`ed working tree —
i.e. the tree as it was before this phase — and fails identically there:

| Test | Owner |
|---|---|
| `component-states` › never scrolls horizontally at 320px (both engines, 40 px overflow on `/dev/states`) | Phase 3 |
| `component-states` › puts the skip link first in the tab order (WebKit) | Phase 3 |
| `component-states` › keeps FAQ answers reachable in every browser (WebKit) | Phase 3 |
| `gif-compressor` › shifts nothing the user did not ask for (Chromium, CLS 0.015) | Phase 5 |

They are Phase 3's and Phase 5's unrun browser suites arriving late, and they are
Phase 11's to close — but the CLS one is worth reading now rather than at launch,
because a non-zero CLS on a tool page is a stated success criterion of this plan.
