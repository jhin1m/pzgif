---
phase: 7
title: "Cross-Format Tools"
status: complete
priority: P1
effort: "6-8d"
dependencies: [5]
---

# Phase 7: Cross-Format Tools

## Overview

Ship the four tools that cross format boundaries: **MP4 to GIF, GIF to MP4, Split GIF to Frames, WebP to GIF**. Each exercises a different part of the engine that the GIF→GIF tools never touch — video demux, video encode, ZIP output, and animated WebP decode.

This is the highest-risk tool phase. Independent of Phases 6 and 8.

## Requirements

| Route | Tool | New engine surface | Risk |
|---|---|---|---|
| `/mp4-to-gif` | MP4 to GIF | mediabunny demux + `VideoDecoder`, trim UI, live size estimate | Medium — the trim UI is bespoke |
| `/gif-to-mp4` | GIF to MP4 | `VideoEncoder` + mediabunny `Output` | Medium — codec probing, even dimensions |
| `/split-gif-into-frames` | Split GIF to Frames | `fflate` streaming ZIP, PNG per frame | Low — but frame-count caps matter |
| `/webp-to-gif` | WebP to GIF | Animated WebP decode | **High — no Safari path exists** |

## Architecture

### MP4 to GIF — the trim UI and the honest estimate

`docs/wireframe/tool-mp4-to-gif.html` is the full spec. Two things carry real weight:

**The trim control.** A dual-handle range over the clip duration, with numeric second inputs beside it. Handles are focusable and move with ←/→ (Shift for 1 s steps). The selected duration is shown live. Seeking to show the frame at a handle position requires decoding to the nearest keyframe and forward — do not decode the whole clip to scrub.

**The live estimate.** "Estimated output: ≈ 1.8 MB at the current settings" is the single most valuable element on the page — it is the honest answer to "will this be huge?", which is the main reason people abandon a video-to-GIF flow. It comes from `estimate.ts` and must recalculate as sliders move, in mono tabular-nums so it does not jitter. **Always labelled an estimate.** When the real number arrives, show it against the estimate as the wireframe does ("1.72 MB — under the 1.8 MB estimate").

Defaults from the wireframe: 15 fps, 480 px wide, quality 80, 256 colours, loop forever. Admission control may lower these on mobile — show the adjusted values as editable defaults, never silently.

**The limits caption must be computed at runtime from the device tier, never written as static copy.** The wireframe's "up to 150 MB · up to 60 seconds" is not the real constraint — decoded RGBA is — and on an iPhone the honest figure is a few seconds of output, not sixty seconds of input. Add a mobile default profile (10 fps, 320 px) so the refusal threshold lands in usable meme-length territory rather than under four seconds.

Over-limit input gets a one-click degraded run wherever any plan fits, and otherwise a message that stands on its own — trim it, use a smaller width, use a desktop browser. There is no Pro tier in MVP to route anyone to, so no message may imply one.

### GIF to MP4 — the traps are all in the encoder config

- Default codec **`avc1.4D402A`** (H.264 Main, Level 4.2) — universally playable in 2026. Always probe with `VideoEncoder.isConfigSupported()` and fall back down a chain; never hardcode a single string
- `avc: { format: 'avc' }` — length-prefixed with `avcC` in the container. `annexb` produces an unplayable MP4
- **Dimensions must be even.** H.264 yuv420p requires it, and GIFs are frequently odd-sized (499×281). Round down with `w & ~1`
- **Emit video-only. Do not add a silent audio track.** Every major platform already produces silent MP4s from GIF uploads, and a track-less MP4 autoplays fine when muted. Adding AAC pulls in a codec that is not universally available via WebCodecs, for zero benefit
- Safari cannot encode VP8/VP9 via WebCodecs as far as research could establish — probe rather than assume, and fall back to MP4 when WebM encode is unavailable

Surface the `<video autoplay muted loop playsinline>` snippet in the result UI. That is what users actually need to replace a GIF embed, and no competitor gives it to them.

### Split GIF to Frames — memory discipline is the whole tool

Stream frames into the ZIP; never build an array of all PNGs:

- `fflate` `Zip` + `ZipPassThrough` — **STORE, not deflate**. PNGs are already DEFLATE-compressed; re-deflating burns CPU for ~0% gain
- Accumulate `Blob` **parts**, not one growing `Uint8Array`, so the browser can back large output with disk rather than RAM
- Use `canvas.convertToBlob({ type: 'image/png' })` on the `OffscreenCanvas` — native, no WASM, already the right format
- **Cap frame count with an explicit message** (500 is a reasonable starting cap). A 60 s 30 fps GIF is 1800 PNGs and will kill a phone
- Offer a frame-range selector, as the homepage copy promises ("Pick a range if you need one")

### WebP to GIF — the one with no clean answer

`@jsquash/webp` decodes **still images only**; it wraps libwebp's simple decode API, not `libwebpdemux`. `ImageDecoder` does decode animated WebP — but Safari has no `ImageDecoder` at all, so the same gap as GIF applies, and unlike GIF there is no maintained JS library to fall back on.

Options, ranked — **revised after red-team review**:

| Option | Assessment |
|---|---|
| **Hand-rolled RIFF/ANMF splitter feeding `@jsquash/webp` per frame** | **Recommended.** ~150 lines, no new dependency, exact frame durations. Requires implementing the ANMF blend and dispose bits. Roughly one afternoon, and it makes the page work everywhere |
| Descope Safari at MVP | Was the original recommendation; **rejected on review.** This is a *ranking* page. A user arriving from a SERP, uploading, and being told "not supported" pogo-sticks straight back to Google — the strongest negative engagement signal a zero-authority domain can generate, on a page whose only purpose is to rank. Shipping it broken is worse than not shipping it |
| Cut the page from MVP, ship it when the splitter is done | Acceptable second choice. Its keyword is the smallest in the set, so there is no urgency that justifies a broken page |
| `@ffmpeg/core` on Safari | 10 MB gzip to decode one WebP, and `ffmpeg.load()` alone is reported to OOM on iOS. Reject |
| Abandoned WebP wasm libraries | All pre-1.0, last published 2020-2023. Do not adopt |

**Do not ship this page in a knowingly-broken state.** Build the splitter, or hold the page back. Note also that the homepage hero routes a dropped `.webp` here — so a broken page is reachable from the front door, and that routing must be capability-gated if the splitter is not built.

## Related Code Files

- Create: `src/app/[locale]/mp4-to-gif/page.tsx`, `gif-to-mp4/page.tsx`, `split-gif-into-frames/page.tsx`, `webp-to-gif/page.tsx`
- Create: `src/content/mp4-to-gif.tsx`, `gif-to-mp4.tsx`, `split-gif-into-frames.tsx`, `webp-to-gif.tsx`
- Create: `src/components/tool/trim-range.tsx`, `frame-range-picker.tsx`, `video-embed-snippet.tsx`
- Create: `e2e/cross-format-tools.spec.ts`
- Modify: `src/lib/media/encode/video.ts`, `png-zip.ts`, `src/lib/media/decode/webp.ts`

## Implementation Steps

1. **MP4 to GIF** first — it is the highest-traffic tool of the four and exercises the most engine surface. Build `TrimRange` with keyboard support and numeric second inputs from the start.
2. Wire seek-preview: decode from the nearest keyframe to the handle position only. Cache the last decoded preview frame so dragging does not re-decode continuously.
3. Wire the live estimate (measured-sample model, per Phase 4) and verify it against real encodes on the Phase 1 fixtures across both photographic and flat-art content. Show it at a precision the model can actually support — a range, or a coarse figure — rather than the wireframe's "≈ 1.8 MB", which implies more accuracy than any estimator here will have. A visibly wrong estimate is worse than none.
4. **GIF to MP4**: implement the codec probe chain, even-dimension rounding, and video-only output. Add the embed-snippet component to the result panel.
5. **Split GIF to Frames**: implement the streaming ZIP with the frame cap and range picker. Test with a deliberately large GIF on a real phone — this is the tool most likely to kill a mobile tab.
6. **WebP to GIF**: implement the RIFF/ANMF splitter so the page works on every browser. If it is held back for time, **cut the page and its sitemap entry** rather than shipping a state that fails for a fifth of visitors — and capability-gate the homepage's `.webp` routing so the front door does not lead there.
7. Write four distinct sets of explainer copy and FAQ, reusing the wireframe copy for `mp4-to-gif` verbatim — **except** the "typically finishes in under ten seconds on a current laptop" sentence, which must carry Phase 1's measured figure or be cut. This claim was flagged at bootstrap and is still unverified.
8. E2E per tool, all asserting on decoded output: MP4→GIF produces a valid GIF of the trimmed duration at the requested fps; GIF→MP4 produces an MP4 that decodes and plays; split produces a ZIP whose entry count equals the frame count; WebP→GIF produces a valid GIF on a supported browser and the correct unsupported state on WebKit.

## Success Criteria

- [ ] All four tools produce correct output verified by decoding it, on Chrome and Safari (except the documented WebP-on-Safari limitation)
- [ ] Trim UI is keyboard operable with a numeric-entry path
- [ ] Live estimate tracks real output across **both** photographic and flat-art fixtures, and is displayed at a precision the model supports
- [ ] GIF→MP4 output plays in Safari, Chrome, Discord and iMessage — checked manually, not assumed
- [ ] Split produces a valid ZIP with correctly ordered, correctly named frames, and does not crash a mid-range phone at the frame cap
- [ ] WebP→GIF works on Safari via the ANMF splitter — **or the page is not shipped at all**. No knowingly-broken ranking page
- [ ] The mp4-to-gif FAQ contains no unverified speed claim
- [ ] Four distinct sets of hand-written copy with no shared paragraphs

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Trim + seek preview is slow enough to feel broken | Decode from the nearest keyframe only, cache the last frame, and debounce. If it still drags, ship numeric-only trim with a static first-frame preview rather than a laggy scrubber |
| Estimator inaccuracy undermines the page's headline feature | Validate against fixtures before shipping the readout. Show the real number the moment it exists |
| GIF→MP4 emits an unplayable file | The `avc` vs `annexb` and even-dimension traps cause exactly this. Test playback on real platforms, not just `<video>` in Chrome |
| Split GIF kills mobile tabs | Hard frame cap with an explicit message, streamed ZIP, Blob parts. Test on a real phone at the cap |
| WebP→GIF ships broken on Safari by accident | It ships *knowingly* limited with an explicit state. Add it to the launch checklist as a documented limitation, and to the post-launch backlog as the ANMF splitter |

## What was built, and where it departs from this document

Shipped 2026-08-10. All four routes are `status: "live"`, and
`e2e/cross-format-tools.spec.ts` asserts each by **decoding the produced file**
— 22 tests green on Chromium and WebKit.

| Decision | This document said | What shipped, and why |
|---|---|---|
| WebP decode | RIFF/ANMF splitter feeding `@jsquash/webp`, a new dependency with its own `.wasm` | **Splitter feeding `createImageBitmap()`, on every browser.** An animated WebP is a container of compressed *still* images, and every engine — Safari included — decodes those natively. No dependency, no second WASM through the CSP. It replaces the `ImageDecoder` path outright rather than sitting behind it, matching the ratified GIF decision: one path everywhere, because the least-exercised branch would otherwise ship to the engine that is hardest to debug |
| Trim | A frame-index range | **`TimingSpec.trimSec`, in seconds, honoured by seeking.** `sink.canvases(from, to)` starts the decoder at the keyframe before the cut, so a three-second selection out of a sixty-second clip costs three seconds of decode. Admission control sizes the job against the trimmed span, or a long source would be refused for frames it never reads |
| Seek preview | "decode to the nearest keyframe and forward" | A native `<video>` whose `currentTime` follows the handle. That *is* decode-from-the-nearest-keyframe, done by the browser, with no second decode path competing with the engine for memory |
| Embed snippet | "in the result UI" | **Above the explainer, in page flow.** The result panel's height is reserved against measured numbers at four breakpoints; a code block inside it would overshoot that reservation and return CLS. In page flow it is also crawlable static HTML, which the result panel's contents are not |
| Split slug | `/split-gif-into-frames` | `/split-gif-to-frames`, which is what `registry.ts` has always said |

## Open questions

1. ~~Should `mp4-to-gif` accept audio-bearing files silently?~~ **Resolved.** The
   dropzone caption says "audio is dropped, because GIF has no sound", and the
   FAQ covers it at length.
2. ~~What is the right frame cap for split?~~ **Resolved, and it was the wrong
   question.** There is no second cap to invent: admission control already
   refuses above `2 × frames × w × h × 4`, and the guess of 500 would have
   contradicted it in both directions. `affordableFrames()` in `limits.ts` is now
   the one function both the caption and `admit()` derive from, so the page
   cannot promise a number the engine then refuses.
3. ~~Is `webp-to-gif` worth shipping given it is broken on 20-30% of traffic?~~
   **Resolved — it is not broken on any traffic.** The splitter removed the
   Safari gap entirely, so the page ships whole and the `no-image-decoder`
   refusal was deleted from the taxonomy.
4. ~~**WebP compositing is under-tested.**~~ **Resolved 2026-08-10.**
   `webp-offset-dispose.webp` — three `webpmux`-authored frames isolating
   offsets, no-blend and dispose-to-background — is generated by
   `scripts/make-fixtures.mjs`, and `e2e/bench/webp-compositing.spec.ts` reads
   composited RGBA per frame on all three engines. The compositing in
   `decode/webp.ts` was correct; the test instead caught a transparency burn-in
   in the shared `downscale.ts`, invisible on every opaque fixture in the
   corpus. See open question 11 in `plan.md`.

### Still open

5. **`liveEstimate` has no automated guard against re-running.** The effect
   depends on `job.estimate` rather than on `job`, because `useMediaJob` returns
   a fresh object literal every render and depending on it produced an unbounded
   decode loop on an idle page. There is no jsdom in this project, so nothing
   fails if that dependency is widened again. A React test environment, or a
   counter the E2E can read, would close it.
