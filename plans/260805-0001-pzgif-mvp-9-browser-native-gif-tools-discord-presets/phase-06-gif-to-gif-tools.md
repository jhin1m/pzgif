---
phase: 6
title: "GIF-to-GIF Tools"
status: pending
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

1. Should Resize GIF offer upscaling? It always looks bad on GIF, but users ask for it. **Recommend allowing it with a warning** rather than silently capping at 100% — a silent cap reads as a bug.
2. Does the crop overlay preview animate, or show a static first frame? Static is cheaper and matches the compressor. Animating helps users crop moving subjects. Recommend static at MVP with a "Play preview" opt-in, honouring `prefers-reduced-motion` per §7.4.
