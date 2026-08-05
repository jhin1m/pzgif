---
phase: 4
title: "Media Engine Core"
status: pending
priority: P1
effort: "10-16d"
dependencies: [1]
---

# Phase 4: Media Engine Core

## Overview

Build the worker-resident media engine that every tool page drives. This is the heart of the product: decode → frame ops → encode, with real progress, real cancellation, hard memory admission control, and an error taxonomy that never dead-ends the user.

**Blocked by Phase 1.** Do not start until the benchmark gates pass and `calibration.json` exists.

Everything here runs **inside a Web Worker**. The main thread starts jobs and renders progress; it never touches a frame buffer.

## Requirements

**Functional**
- One `runJob(spec)` entry point that all 9 tools and 5 preset routes use
- Decode: animated GIF, video (MP4/MOV/WebM/MKV), animated WebP, still images
- Ops: resize, crop, rotate, speed, reverse, ping-pong, frame selection, frame dropping
- Encode: GIF (gifski), animated WebP, MP4/WebM, PNG frames + ZIP
- Real determinate progress; cooperative cancellation; admission control before decode
- Output-size estimation calibrated from Phase 1 data

**Non-functional**
- Never hold all full-resolution frames. Decode streams; only the final output-size RGBA frames accumulate
- Never OOM silently — refuse up front with an actionable message instead
- No `SharedArrayBuffer`, no `COOP`/`COEP`, no `@ffmpeg/core-mt`

## Architecture

### Library decisions (settled by research + user decisions)

| Job | Library | License | Note |
|---|---|---|---|
| Demux + video decode + mux | **`mediabunny@1.52.3`** | MPL-2.0 | Replaces `mp4box.js`, `mp4-muxer`, `webm-muxer` — the latter two are deprecated by their author. Covers MP4/MOV/MKV/WebM/Ogg/TS/HLS and AVC/HEVC/VP8/VP9/AV1 |
| Animated GIF decode | **`modern-gif@2.1.0`** on **every** browser | MIT | User decision: one code path. Safari has no `ImageDecoder` at all, and 6 of 9 tools take GIF input — a dual path would double the test surface on the product's highest-volume input |
| GIF encode | **vendored `gifski-wasm` fork**, single-thread | AGPL-3.0 | See the vendoring note below |
| Preview encode | `gifenc` | MIT | Live preview only. **Never** final export |
| Image codecs | `@jsquash/*` | Apache-2.0 | Still images only |
| ZIP | **`fflate@0.8.3`** | MIT | `ZipPassThrough` = STORE, no re-deflate. PNGs are already compressed |
| Exotic containers | `@ffmpeg/ffmpeg` 0.12.15 + `@ffmpeg/core` 0.12.10 single-thread | GPL-2.0-or-later | Lazy, consent-gated, **never on iOS** |

### Worker topology — two workers, not one

"One `runJob(spec)` entry point" is the **API** contract, not the process contract. The engine needs **two** workers:

- A **pipeline worker** (long-lived): probe, demux, decode, frame ops
- An **encode worker** (spawned and terminated per job): gifski's `WebAssembly.Memory` never shrinks, so a long-lived encode worker holds the high-water mark of the largest job forever

They must be connected by a `MessageChannel` so frames transfer **directly** between workers. Relaying through the main thread without transfer lists structured-clones hundreds of megabytes and would itself destroy INP — the exact failure the worker architecture exists to prevent.

The same rule governs Discord auto-fit: **each attempt spawns and terminates its own encode worker**, because releasing JS buffers does not release the WASM heap high-water mark. Five attempts in one worker grow monotonically toward the iOS ceiling. Budget the ~50-150 ms respawn-and-instantiate cost per attempt — which is itself an argument for seeding the search from the estimator rather than searching blind.

### Vendor the gifski fork — needed, but it needs an owner first

Upstream `gifski-wasm` is 18 months stale, pinned to gifski 1.32.0 against upstream 1.35.0, built on a fork whose own README says "not recommended for production use", and carries an **open, unresolved deadlock issue** the maintainer attributes to "hacks I implemented to get this to compile". It also exposes **no progress callback at all** and cannot be cancelled except by killing the worker.

The fix is small and buys three things at once. In the vendored `lib.rs`, replace `&mut progress::NoProgress {}` with a struct implementing gifski's existing `ProgressReporter` trait that calls a `js_sys::Function` per written frame:

- **Real 0-100% progress** through the encode stage — without it, `design-guidelines.md` §1.2 forces us to show an indeterminate bar for the longest stage of every job
- **Cooperative cancellation** — `increase()` returning `false` is gifski's abort signal, which is strictly better UX than `worker.terminate()`
- **A place to fix the deadlock** if Phase 1 gate G1 exposes it

**The "roughly 20 lines of Rust" framing is dangerous and must not be taken at face value.** Before committing to the fork, the following have to be true, and none of them is in the plan today:

- **Someone owns Rust on this project.** Name them. A solo operator who does not write Rust is taking on a permanent maintenance surface, not an afternoon
- A toolchain exists in CI: `rustup`, the `wasm32-unknown-unknown` target, a `wasm-bindgen-cli` version matched to the crate, and a C toolchain for `imagequant`
- **`js_sys::Function` is `!Send`.** If any part of gifski's pipeline still crosses a thread through the very `crossbeam-channel` plumbing that causes the deadlock, the callback will not compile — and fixing that means restructuring gifski, not adding 20 lines
- `wasm-pack` output is **not byte-reproducible**. Decide build-vs-verify in CI and pin the toolchain
- GPLv3 §5(a) requires **prominent change notices** on modified AGPL source. Add them

Under the AGPL decision there is no licensing friction in modifying the code — we publish the client source anyway. The friction is entirely in skills and time.

**Decision (ratified 2026-08-05): the fork is deferred past launch.** Ship on the **unforked** encoder with the honest interim — determinate progress through decode, a distinctly labelled indeterminate stage for encode with an elapsed timer, and **no invented percentage** — and land the fork after launch as a dedicated, separately budgeted piece of work. Do not carry an unowned Rust dependency inside an already-stretched timeline. If gate G1 exposes a deadlock, the fork becomes mandatory and gets its own budget (1-2 days, plus contingency), not a line item.

### The encoder needs a kill switch

`plan.md` calls the gifski deadlock "existential", yet the *ad provider* gets a runtime switch and the encoder does not. Add `NEXT_PUBLIC_GIF_ENCODER=gifski|gifenc`, read by `capability.ts`, plus an automatic per-job fallback to `gifenc` after a watchdog-detected hang. Cost is near zero; it converts a production deadlock from an emergency redeploy into a config flip.

### Memory admission control — the governing equation

gifski cannot stream. It concatenates every frame into one buffer, then copies that buffer into the WASM heap:

```
peak_bytes ≈ 2 × frames × out_W × out_H × 4   (+ a small decode pool)
```

So the binding constraint is **decoded RGBA in flight**, not input file size. This is why `tech-stack.md`'s "150 MB desktop / 50 MB mobile" framing is being replaced.

| Tier | Detection | Frame budget | Max output width | Hard frame cap |
|---|---|---|---|---|
| Desktop | `!isMobile` | 500 MB | 640 px | 900 |
| Desktop, low RAM | `navigator.deviceMemory <= 4` | 200 MB | 480 px | 400 |
| Android mobile | mobile UA + `deviceMemory` | 120 MB | 480 px | 230 |
| **iOS / iPadOS** | `maxTouchPoints > 0 && /Mac\|iP/` — **`deviceMemory` does not exist in Safari** | **30 MB** | **480 px** | **57** |
| Desktop, unknown RAM | `deviceMemory` undefined + desktop UA — **also true of Firefox**, not just Safari | 200 MB | 480 px | 400 |

These are starting values from measured iOS crash thresholds (~100 MB page budget on an iPhone SE 3). **Phase 1 gate G4 replaces them with measured numbers.**

`planEncode()` picks the largest (fps, width) pair that fits the budget, tried in descending order. If nothing fits, the job is **refused before decoding** with an actionable message — never an OOM crash mid-job. The chosen fps/width become *editable defaults* in the UI with the budget enforced as slider ceilings, which turns a memory constraint into legible product behaviour.

**1080p GIF output is not offered.** 150 frames of 1080p RGBA is 1.24 GB before the 2× copy. Real GIFs are 320-640 px wide; make the width cap a feature, not a failure.

### Job spec and progress protocol

```
main thread                          worker
  runJob(spec)  ──────────────────►  plan (admission control)
                ◄───────  refused | accepted{fps, w, h, frames}
                ◄───────  progress{stage, determinate, value}   (throttled)
                ◄───────  preview{ImageBitmap}                  (first frame)
  cancel()      ──────────────────►  cooperative abort
                ◄───────  done{blob, stats} | error{code, recovery}
```

Progress model — a **stage weighting**, calibrated per job type from Phase 1 rather than guessed:

```
overall = w_probe·probe + w_decode·decode + w_encode·encode
```

The weights differ sharply by job type — a GIF→GIF compress is closer to 5/10/85 than the 5/55/40 that fits a video conversion — so they are a per-pipeline constant from `calibration.json`, not one global triple.

**This is not a violation of "never fake progress", and the distinction matters.** Each stage's own value derives from a real counter: a decoded-frame index, or an encoder callback. What is forbidden is *interpolation* — time-based ramps, simulated movement, or any value not backed by a counter. Weighting real sub-progress into an overall figure is a mapping, not a fabrication. State it this way in code comments so a later reviewer does not "fix" it.

Decode progress is exact — the denominator is known up front from `planEncode()` or the decoder's frame count. Throttle `postMessage` to ~10 Hz; a progress event per frame will itself hurt INP.

### Error taxonomy — every error names a next step

| Code | Message shape | Recovery |
|---|---|---|
| `unsupported-format` | "PNG isn't supported here." | **Always name a tool that actually exists in the MVP**, resolved from the registry. The wireframe currently points rejected PNGs at "PNG to GIF", which is not one of the nine tools — the dead end it was written to prevent |
| `too-large-for-device` | "This clip is too long for your device." | **Offer a one-click degraded run** — "Do it anyway at 320 px, 10 fps — about 6 s of GIF" — whenever any plan fits. A refusal with no action is a permanent exit for the highest-intent user in the funnel |
| `decode-failed` | "We couldn't read this file." | Offer the ffmpeg fallback (consent-gated) where available, then the report-it link |
| `encode-failed` | "Compression failed — try lowering Colors to 128." | Concrete setting change |
| `oom` | "Ran out of memory." | Smaller size, fewer frames — never a white screen |
| `cancelled` | silent | Restore the pre-job state |
| `browser-unsupported` | "Firefox for Android can't do video conversion yet." | Name a browser that works. Firefox Android has no `VideoDecoder`/`VideoEncoder` at all |

**No recovery string may mention "Pro".** The Pro tier is explicitly out of MVP scope, so routing a user there is routing them nowhere. Sweep every message — including the refusal copy inherited from the research snippet — and replace with concrete alternatives: trim it, use a smaller width, try a desktop browser. Add "no reference to Pro" to the Phase 11 copy audit.

Every error state also carries a **one-click "report this failed"** wired to the aggregate beacon, and the Contact address. Today a user whose job fails has no way to tell anyone and no reason to return.

## Related Code Files

- Create: `src/lib/media/worker/job.worker.ts` — the only worker entry
- Create: `src/lib/media/decode/gif.ts` (modern-gif), `video.ts` (mediabunny `CanvasSink`), `webp.ts`, `still.ts`
- Create: `src/lib/media/ops/` — `resize.ts`, `crop.ts`, `speed.ts`, `reverse.ts`, `frame-select.ts`
- Create: `src/lib/media/encode/gifski.ts`, `webp.ts`, `video.ts`, `png-zip.ts`, `preview.ts`
- Create: `src/lib/media/job-controller.ts`, `pipeline.ts`, `capability.ts`, `limits.ts`, `plan.ts`, `estimate.ts`, `errors.ts`
- Create: `src/lib/media/ffmpeg-fallback.ts` — the **only** file allowed to import `@ffmpeg/*`
- Create: `vendor/gifski-wasm/**` — the fork, with a build script
- Create: `src/hooks/use-media-job.ts` — the React binding
- Reference: `bench-results/calibration.json`; promote `src/lib/media/downscale.ts` from Phase 1 rather than rewriting it

## Implementation Steps

1. Define the job spec and message protocol types first. Every tool is a spec; if a tool needs a new message shape later, the protocol was wrong.
2. Implement `capability.ts`: probe `VideoDecoder` / `VideoEncoder` / `OffscreenCanvas` / WASM at boot, and classify the device tier. Firefox Android reports no video codec support — surface an honest unsupported message rather than a 10 MB ffmpeg download on mobile data.
3. Implement `limits.ts` + `plan.ts` with the measured budgets from Phase 1. Admission control runs **before** any decode.
4. Implement GIF decode with `modern-gif`. Verify frame count, per-frame delays and **disposal-method compositing** against the Phase 1 fixtures — decoded timings must round-trip exactly. Clamp GCE delays of 0 and 1 up to 100 ms, matching how browsers render the input.
5. Implement video decode with mediabunny `Input` + `CanvasSink` at `poolSize: 1`, downscaling to the **final GIF size inside the sink**. Never materialise a full-resolution frame. Sort decoded frames by `timestamp` unconditionally — Safari below 26.4 can emit H.264 out of order.

    **Pass `rotation: await track.getRotation()` to the sink.** Container rotation metadata is how portrait phone video is stored; ignoring it turns every portrait upload into a sideways GIF, and portrait phone video is the single most common real-world input. Fixture `portrait-rotated.mp4` exists to catch this.
6. Implement the frame ops on `OffscreenCanvas`. Order matters: crop → rotate → resize → speed/frame-select. Doing resize before crop loses pixels you needed.

    Downscaling uses the **step-down chain** specified in Phase 1 — `imageSmoothingQuality: 'high'` plus repeated halving until within 2× of target, then a final draw. A single large-ratio `drawImage` is a near-box filter whose aliasing will visibly outweigh any palette advantage gifski provides. This is where differentiator #1 dies quietly if nobody specifies it.
6b. Add magic-byte sniffing at the probe stage. A file renamed `.gif` that is actually an MP4 must route to the right tool via the registry, not fall into the generic `decode-failed` bucket — the "never a dead end" rule already implies it.
7. Vendor and patch `gifski-wasm` per the section above. Add the `wasm-pack` build to CI so the vendored `.wasm` is reproducible.
8. Implement `encode/gifski.ts` with the known traps guarded: **≥2 frames** (single-frame GIF must route elsewhere); `fps` XOR `frameDurations`, never both, never neither; **omit `repeat` for an infinite loop** — `repeat: 0` means play once; pre-downscale on the JS side because gifski's own `resizeWidth` runs after the full buffer is already in the heap and saves nothing. Terminate and respawn the encode worker after each job — the module's `WebAssembly.Memory` never shrinks.
9. Implement `encode/video.ts` with mediabunny `Output`. Default codec `avc1.4D402A` (Main 4.2, universally playable), always probed via `VideoEncoder.isConfigSupported()` with a fallback chain. **Round dimensions down to even** (`w & ~1`) — H.264 yuv420p requires it and GIFs are frequently odd-sized. **Emit video-only; do not add a silent audio track** — every major platform already produces silent MP4s from GIFs, and a track-less MP4 autoplays fine when muted.
10. Implement `encode/png-zip.ts` with `fflate` `ZipPassThrough` (STORE). Accumulate `Blob` **parts**, never one growing `Uint8Array`, so the browser can back large output with disk. Cap frame count with an explicit UI message — a 60 s 30 fps GIF is 1800 PNGs.
11. Implement `estimate.ts`. **A model keyed only on `(width, fps, quality, colours, frames)` cannot work** — GIF size is dominated by *content*, which is exactly what `photo-grain.gif` and `flat-art.gif` exist to demonstrate. Two files with identical settings differ by multiples.

    Use a **measured sample instead of a pure formula**: encode a strided 5-frame sample at the real settings, measure it, and extrapolate against the calibration curve. It costs a fraction of a full encode and is the only approach that sees the content. Fall back to the settings-only curve only when even a sample is too expensive.

    This matters beyond one readout: the estimate seeds the Discord auto-fit search. A bad estimate means a blind search, which means five real encodes on iOS against a 30 MB budget — the crash the plan claims to have designed out.

    **Always label it an estimate**, and near a hard limit show a **range** ("≈ 200-260 KB") rather than a point value. Never state it as a promise.
12. Implement `ffmpeg-fallback.ts`: dynamic `import()` only, core served from `public/ffmpeg/` (not a CDN), consent-gated behind an explicit "this needs an extra 10 MB decoder — download?" prompt, and **never offered on iOS** where `ffmpeg.load()` alone is reported to OOM. Add a CI bundle check asserting no `ffmpeg` string in the main client chunk.
13. Add `use-media-job.ts`: subscribe to worker progress, throttle React state updates, expose cancel. Progress updates must not re-render the whole page — this is a real INP risk.
14. Instrument from day one: log `{container, codec, path: 'native'|'fallback'|'unsupported'}`. The fallback rate is estimated at ~1-3% blended and is currently a guess; if 30 days of traffic says under 2%, deleting the ffmpeg fallback entirely is the YAGNI-correct outcome.
15. Vitest coverage for `plan.ts`, `estimate.ts`, `errors.ts` and the decoders against fixtures. Decoder tests assert frame counts and durations, not just "did not throw".

## Success Criteria

- [ ] One `runJob(spec)` API serves every job type; underneath it, a long-lived pipeline worker and a per-job encode worker connected by `MessageChannel`, with frames transferred and never structured-cloned through the main thread
- [ ] Portrait video with rotation metadata produces an upright GIF
- [ ] The downscale step-down chain is used everywhere, not a single `drawImage`
- [ ] `NEXT_PUBLIC_GIF_ENCODER` switches encoders at runtime, and a watchdog-detected hang falls back to `gifenc` automatically for that job
- [ ] No recovery message anywhere mentions "Pro"; every error offers a concrete action plus a report link
- [ ] A refusal offers a one-click degraded run whenever any plan fits
- [ ] GIF, MP4, MOV, WebM and animated WebP all decode correctly to frames with correct per-frame durations, verified against fixtures
- [ ] gifski encode produces a valid GIF that a browser renders with the original timing
- [ ] Admission control refuses over-budget jobs **before** decoding, with an actionable message and concrete alternative settings
- [ ] Determinate progress across decode; determinate across encode too once the fork lands. No synthesised values anywhere
- [ ] Cancel aborts within 500 ms and leaves the UI in a clean pre-job state
- [ ] Peak memory measured on a real iPhone stays inside the tier budget for the worst-case fixture
- [ ] Every error code produces a message naming a concrete next step; no dead ends
- [ ] Main client bundle contains no `@ffmpeg` reference, asserted in CI
- [ ] `estimate.ts` uses a measured sample, not a settings-only formula, and reports a **range** when within 20% of a hard limit
- [ ] Instrumentation reports refusal rate per device tier, not just container and codec

## Risk Assessment

| Risk | Mitigation |
|---|---|
| gifski deadlock (open issue #5) surfaces in production | Phase 1 gate G1 soak-tests it. The vendored fork is where a fix lands. A wall-clock watchdog in the worker converts a hang into a reported error rather than a frozen tab |
| `modern-gif` decode is too slow or mishandles disposal | Unbenchmarked — it was chosen on maintenance grounds (only 2026-published option). Phase 1 must measure it. Fallback is a dual path with `ImageDecoder`, which reintroduces the complexity the user's decision avoided — so measure early |
| Estimator inaccurate → the headline "≈ 1.8 MB" readout misleads | Calibrate from real fixture data, label as an estimate, show the real number the moment it exists |
| Memory budgets too optimistic → iOS tab crashes | Budgets are deliberately conservative. Wrap the encode in try/catch and surface "ran out of memory — try a smaller size" rather than a white screen |
| Progress `postMessage` per frame tanks INP | Throttle to ~10 Hz in the worker, and keep progress state out of any component that re-renders the tool panel |

## Open questions

1. Does the vendored fork's progress patch also resolve the deadlock, or is the deadlock elsewhere in `crossbeam-channel`? Only Phase 1's soak can tell.
2. Animated WebP on Safari: `ImageDecoder` is absent there too. Options are a hand-rolled RIFF/ANMF splitter feeding `@jsquash/webp` per frame (~150 lines) or descoping `webp→gif` on Safari with a clear message. **Recommend descoping at MVP** — animated WebP input is low volume — and revisiting with traffic data. Decided in Phase 7.
3. Whether Safari 26.x can encode VP8/VP9 via WebCodecs — assumed decode-only. Probe with `isConfigSupported`; never hardcode.
