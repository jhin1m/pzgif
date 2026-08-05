---
phase: 1
title: "Benchmark Spike and Architecture Gate"
status: pending
priority: P1
effort: "6-9d"
dependencies: [2]
---

# Phase 1: Benchmark Spike and Architecture Gate

## Overview

Prove — with measured numbers on real devices — that the locked client pipeline can actually do the job, before any product code depends on it. This phase produces **numbers and a go/no-go decision**, not features. Everything in Phase 4 onward is blocked until it passes.

Research has already turned three of this phase's original questions into known facts. The spike's job is now narrower and sharper: **measure throughput, measure memory, and prove gifski-wasm does not deadlock.**

## Context — what research already settled

Read `plans/reports/research-260804-2343-client-pipeline-integration-apis-report.md` first. Established, do not re-derive:

| Fact | Consequence |
|---|---|
| `gifski-wasm` is **AGPL-3.0-or-later**; client-side use is conveyance | **Decided: the PZGIF client bundle ships under AGPL-3.0.** Compliance work lands in Phase 2 |
| `ImageDecoder` **does not exist in Safari**, any version (no `ImageDecoder.idl` in WebKit) | **Decided: use a pure-JS GIF decoder on every browser.** One code path, no Safari special case |
| `mp4-muxer` / `webm-muxer` deprecated by their author in favour of **mediabunny** (MPL-2.0), which also replaces `mp4box.js` | **Decided: mediabunny replaces mp4box.js + both muxers.** `docs/tech-stack.md` §4 must be amended (Phase 2) |
| iOS Safari page-crash threshold ≈ 100 MB (iPhone SE3) / 200 MB (iPad 8) | **Decided: device-class memory budgeting**, computed from `frames × w × h × 4`, not from input file size |
| gifski-wasm has **no progress callback**, is **synchronous/blocking**, needs **≥2 frames**, keeps **2× all frames** resident, and never shrinks its heap | Encode worker must be terminated and respawned per job. Progress strategy is an open item this phase must resolve |
| gifski-wasm open issue #5: encoder can **deadlock** ("channels and/or threads reach a deadlock and the program will not complete") | This is the highest technical risk in the product. Gate G1 below exists for it |
| Turbopack worker+WASM was broken ≤16.1, **fixed in 16.2** | Pin `next` ≥ 16.2 (target 16.3.0). Never pin below |

## Requirements

**Functional**
- A throwaway benchmark harness that runs the real pipeline end to end and emits machine-readable results
- Results captured on **desktop Chrome, desktop Safari, and a mid-range Android device** — real hardware, not emulation
- A calibration dataset that Phase 4's `estimate.ts` can consume to predict output size

**Non-functional**
- The harness lives at a dev-only route inside the real app and is excluded from production builds. Do **not** invest in making it a product component — but `downscale.ts`, the fixtures and `calibration.json` are promoted, not discarded
- Every number recorded with device, OS version, browser version, and fixture identity, or it is not a result

## Architecture

**Mount the harness inside the real app from Phase 2, at a dev-only `/__bench` route.** Do not scaffold a second Next.js project. Gate G5 exists to prove the worker + `.wasm` boot path works in production conditions — and the single most likely thing to break WASM instantiation is the **CSP**, which exists only in the real app, along with `proxy.ts`, `[locale]` routing and the `/wasm/*` cache headers. A spike in a bare scaffold would test none of them and would prove nothing.

```
src/app/__bench/page.tsx     run controls + results table (dev-only, noindex, excluded from sitemap)
src/workers/bench.worker.ts  the whole pipeline, in a worker
src/lib/bench/
  decode-gif.ts              modern-gif
  decode-video.ts            mediabunny Input + CanvasSink
  downscale.ts               the step-down chain — see below
  encode-gifski.ts           gifski-wasm single-thread
  encode-gifenc.ts           gifenc, for the quality/speed A-B
  measure.ts                 timing + memory sampling
e2e/fixtures/                see fixture matrix below — the SAME fixtures Phase 11 uses
bench-results/               one JSON per device run
```

Everything runs inside the worker. The main thread only starts jobs and renders results — mirroring production, so the INP characteristics measured here are meaningful.

### Measuring memory — NOT with `measureUserAgentSpecificMemory()`

`performance.measureUserAgentSpecificMemory()` **requires cross-origin isolation** — COOP + COEP, the exact headers this whole architecture forbids because they break ad serving. Without isolation it throws `SecurityError`; with isolation, gate G5's boot-path result would describe an app the product can never ship. The API is unusable here in both directions.

Measure instead with:
- **Chrome DevTools Protocol `Performance.getMetrics`** driven from Playwright, for JS heap and renderer totals
- **The empirical OOM probe** — step frame count up until the tab dies. This is the number that actually matters, and it is the only one available on iOS at all
- `performance.memory` where present, as a rough cross-check only

State explicitly in the harness README that it must **not** be served cross-origin isolated.

### Downscaling — specify it here, because it is where differentiator #1 quietly dies

A single `drawImage` from 1080p to 480px is a low-quality near-box filter in most engines. Aliasing and shimmer on a downscaled GIF will visibly beat any palette advantage gifski provides — and gate G6 compares gifski against `gifenc` **on the same frames**, so it cannot detect the problem.

Specify and use, in the spike and in production: `imageSmoothingQuality: 'high'`, plus a **step-down chain** — halve repeatedly until within 2× of the target, then a final draw — for any ratio above 2×. G6's frames must be produced the way production will produce them, or G6 validates an encoder the product never feeds correctly.

### Fixture matrix

Small, deliberately chosen, checked into the repo. These same fixtures become the Playwright fixtures in Phase 11, so name them stably.

| Fixture | Spec | Exercises |
|---|---|---|
| `screen-720p-10s.mp4` | H.264, 720p, 30 fps, 10 s | The headline case from `tech-stack.md` §Unresolved 1 |
| `phone-1080p-5s.mov` | HEVC, 1080p, 5 s | HEVC decode + the memory ceiling |
| `clip-vp9-5s.webm` | VP9, 720p | WebM demux path |
| `loop-small.gif` | 480×270, 48 frames, 20 fps, ~2.4 MB | The wireframe's canonical compressor example |
| `loop-large.gif` | 800×600, 200 frames | Memory ceiling + deadlock stress |
| `photo-grain.gif` | photographic, heavy grain | Worst case for palette quality |
| `flat-art.gif` | flat colour, few shades | Best case; validates the "32 colours" advice in copy |
| `anim.webp` | animated WebP | Gates the `webp-to-gif` tool |
| `odd-dims.gif` | **499×281** — deliberately odd | The even-dimension guard that GIF→MP4 depends on. H.264 yuv420p rejects odd dimensions and GIFs are frequently odd-sized |
| `portrait-rotated.mp4` | phone video with **rotation metadata** | **Without honouring container rotation, every portrait phone upload produces a sideways GIF.** This is the single most common real-world video input and the plan would otherwise never test it |

## Gates — the phase passes only if all of these pass

| ID | Gate | Threshold | If it fails |
|---|---|---|---|
| **G1** | **Deadlock soak**: 1000+ encodes across **all fixtures** (not one), on **Chrome, Firefox and WebKit**, both worker-per-job and long-lived-worker modes, wired into nightly CI | **Zero hangs.** Watchdog at **10× median** (the research threshold), not 5× | Vendor and patch the fork, or fall back to `gifenc` and cut the quality claim from all copy |
| **G2** | **Desktop throughput**: `screen-720p-10s.mp4` → 480px-wide GIF at 15 fps | ≤ 15 s on desktop Chrome, ≤ 25 s on desktop Safari | **Pre-committed floor:** if desktop cannot reach 30 s, the architecture is not viable client-side — escalate rather than tuning defaults indefinitely |
| **G3** | **Mobile survival**: `loop-small.gif` compress on a mid-range Android and on an iPhone | Completes without a tab crash; ≤ 30 s | **Pre-committed floor, chosen before measuring:** if the mobile clamp lands below **N frames of usable output at ≥320 px**, mobile video conversion leaves the MVP and the copy, limits caption and tool grid say so. Fix N now so it cannot be rationalised afterwards |
| **G4** | **Memory ceiling**: measure peak during `loop-large.gif` | Derive the real `frames × w × h × 4` ceiling per device class | The measured number becomes the clamp in `lib/media/limits.ts`. There is no failure mode here — only a number |
| **G5** | **Boot path**: worker + `.wasm` from `public/wasm/` loads under Next 16.3 Turbopack, in dev **and** in a production build | Loads on all three devices; `.wasm` served as `application/wasm` | Fall back to `next build --webpack`, or serve the worker itself from `public/` |
| **G6** | **Quality proof**: gifski vs `gifenc` on `photo-grain.gif` and `flat-art.gif` at matched output size | gifski is **visibly** better at equal bytes | If not visibly better, differentiator #1 is fiction — escalate before Phase 4, because the whole positioning rests on it |
| **G7** | **Container coverage**: which of the fixtures mediabunny cannot demux, **and whether container rotation metadata is honoured** | Record the list. A portrait fixture must produce an upright GIF | Determines whether the `@ffmpeg/core` fallback is worth building at MVP at all |
| **G8** | **Refusal rate**: run `planEncode()` over a corpus of ~30 real-world GIFs and clips at each device tier | Report **refusal and downgrade rates as numbers** | If iOS refusal exceeds ~30%, that is a product decision — accept it, or pull the server tier forward — and it must reach the operator **before Phase 5**, not after launch |

### G1 proves less than it sounds like

Zero hangs in 1000 runs gives a 95% confidence upper bound of roughly **0.3%** — that is a low ceiling on the failure rate, not proof of absence. Treat G1 as necessary, not sufficient, and pair it with two production safeguards built in Phase 4:

- A **worker watchdog** that converts a hang into a reported, retryable failure rather than a frozen tab
- An **automatic per-job fallback to `gifenc`** after a hang, plus a runtime encoder switch — so a deadlock discovered on run 4000 in production is a config flip, not an emergency redeploy

Note also that on a real iPhone, 1000 encodes is one to two hours of foreground tab time — practically infeasible. The device class most likely to expose a race is therefore the one least likely to be soaked. Say so in the report rather than implying iOS was covered.

### G6 deserves emphasis — and must be pre-registered

`tech-stack.md` calls gifski output quality "differentiator #1" and `design-guidelines.md` §1.4 makes proving it a design principle. We are now paying for that claim with an AGPL obligation on the whole client bundle. **If G6 does not show a visible difference at matched bytes, the licensing cost buys nothing** and `gifenc` (MIT, no obligations) becomes the better choice.

Judging "is it visibly better" by eye, alone, when you need the answer to be yes, is not a test. **Pre-register it before running it:**

- **3 blind judges**, forced choice, shown gifski and `gifenc` output at matched byte counts without labels
- **3 fixtures** spanning the range: `photo-grain.gif`, `flat-art.gif`, and a screen recording
- **Pre-committed threshold: ≥7 of 9 correct identifications** of the higher-quality file
- Record screenshots and the raw judgements

And pre-commit the decision tree, so a failure is a plan rather than a crisis:

> **G6 fails ⇒ drop gifski ⇒ drop the AGPL obligation ⇒ the repository stays private ⇒ reposition on Discord presets, the size-budget UX and privacy ⇒ cut every "visibly better" and "you can see it" claim from the copy in the same commit.**

Note separately that even if G6 passes, a user **cannot perceive the difference on a tool page** — the `BeforeAfterSlider` compares their input to their output, never gifski against a competitor. The only surface where differentiator #1 is legible to a stranger is the side-by-side comparison content page in Phase 9. Build it.

## Related Code Files

- Create: `src/app/__bench/**`, `src/workers/bench.worker.ts`, `src/lib/bench/**` — dev-only, inside the real app
- Create: `src/lib/media/downscale.ts` — **promoted straight into production**, not a spike artefact
- Create: `e2e/fixtures/**` — the same fixtures Phase 11 uses
- Create: `plans/reports/from-bench-spike-to-planner-pipeline-measurements-report.md` — **the deliverable**
- Create: `bench-results/calibration.json` — feeds Phase 4 `estimate.ts`
- Modify (Phase 2 consumes these findings): `docs/tech-stack.md` §4

## Implementation Steps

1. Add the `/__bench` route to the app Phase 2 built — dev-only, `noindex`, excluded from the sitemap and from production builds. The `.wasm` is already in `public/wasm/` from Phase 2's copy script; initialise with an explicit origin-anchored URL, never a bundler-resolved one. Confirm it loads **behind the real CSP**, which is the thing most likely to break WASM instantiation.
2. Wire the worker: `new Worker(new URL('./bench.worker.ts', import.meta.url), { type: 'module' })`. Confirm G5 in dev and in a production build before writing any measurement code.
3. Implement the pure-JS GIF decoder path (library choice per the research report's §B7) and verify frame count, per-frame delays and disposal handling against `loop-small.gif` — decoded frame timings must round-trip exactly.
4. Implement mediabunny demux + decode with `CanvasSink`, streaming frames rather than collecting them. Sort decoded frames by `timestamp` unconditionally — Safari below 26.4 can emit H.264 frames out of order.
5. Implement the gifski encode call. Guard the known traps: ≥2 frames; `fps` XOR `frameDurations`; **omit `repeat` for an infinite loop** (`repeat: 0` means play once); pre-downscale on the JS side because `resizeWidth` does not save memory.
6. Add `measure.ts`: wall-clock per stage (demux / decode / ops / encode), memory via **CDP `Performance.getMetrics`** driven from Playwright, and a deliberate OOM probe that steps frame count up until the tab dies — the empirical probe is the number that matters and the only one available on iOS. **Do not use `performance.measureUserAgentSpecificMemory()`**, for the reasons above.
7. Run G1, the deadlock soak. Run it long. This is the gate most likely to fail and the most expensive to discover late.
8. Run the full matrix on all three devices. Record every result as JSON under `results/`.
9. Produce `calibration.json`: for each fixture and each (width, fps, quality, colours) combination, the actual output byte count — **plus per-fixture content descriptors** (palette entropy, mean inter-frame delta, flat-vs-photographic classification). GIF size is dominated by *content*, which is why `photo-grain.gif` and `flat-art.gif` are in the matrix at all; an estimator keyed only on settings ignores the dominant variable and cannot be accurate. Settle the estimator's input features here, before Phase 4 builds it.

   Pin down the settings ranges to sweep **in this phase**, from the wireframes rather than from Phases 5-8 — otherwise the calibration deliverable depends on phases that depend on it. The wireframes already fix them: quality 1-100, colours {256, 128, 64, 32}, lossy 0-100, width 240-640, fps 8-24.
10. Write the report. State each gate as passed or failed with the numbers behind it. Include the G6 screenshots.
11. **Copy-risk resolution**: check the measured desktop timing against the two unverified speed claims in the wireframes — `tool-compressor.html` FAQ and `tool-mp4-to-gif.html` ("typically finishes in under ten seconds on a current laptop"). Either replace them with a measured figure that holds with margin, or delete the sentence. Record the decision in the report.

## Success Criteria

- [ ] G1 through G8 each recorded as pass or fail with supporting numbers
- [ ] Memory measured **without** cross-origin isolation, via CDP metrics and the empirical OOM probe
- [ ] The harness ran inside the real app, behind the real CSP — not in a separate scaffold
- [ ] Portrait video with rotation metadata produces an **upright** GIF
- [ ] The downscale step-down chain is implemented and used for G6's frames
- [ ] Refusal and downgrade rates reported per device tier from a ~30-file real-world corpus
- [ ] Results captured on desktop Chrome, desktop Safari and a real mid-range Android — three devices, no substitutions
- [ ] `calibration.json` exists and covers every fixture across the settings ranges the UI exposes
- [ ] Per-device-class memory ceilings written as concrete numbers ready to paste into `lib/media/limits.ts`
- [ ] A written verdict on the two unverified speed claims: replaced with measured figures, or cut
- [ ] G6 screenshots exist and a human has judged them
- [ ] Report written to `plans/reports/from-bench-spike-to-planner-pipeline-measurements-report.md`

## Risk Assessment

| Risk | Mitigation |
|---|---|
| G1 fails — the encoder deadlocks | Most likely failure. Budget a day to vendor and patch `gifski-lite`. If unpatchable, `gifenc` is the fallback and the quality positioning must be rewritten before any copy ships |
| No mid-range Android available | Do not substitute an emulator for G3/G4 — memory behaviour is the thing being measured and emulators lie. Borrow a device or buy a used mid-range handset; it is cheaper than shipping wrong limits |
| The `/__bench` route leaks into production | Gate it on `NODE_ENV`, `noindex` it, exclude it from the sitemap, and assert its absence from the production build in CI |
| Measuring only the happy path | Include `loop-large.gif` and the OOM probe. The ceiling is the deliverable, not the average |

## Open questions

1. **Progress strategy for gifski.** It exposes no callback and blocks the worker. Options: chunk the encode into segments and report per-segment; vendor the fork and add a real callback; or report determinate progress for decode and go indeterminate during encode. **Resolve in this phase and record the choice** — `design-guidelines.md` §1.2 forbids inventing a percentage, so the answer shapes the Phase 4 progress protocol.
2. Does `require.resolve('gifski-wasm/pkg/...')` work given the package's `exports` map omits `pkg/`? If not, check the `.wasm` into `public/wasm/` with the version pinned in a comment.
3. Whether the worker itself (not just the `.wasm`) needs to be served from `public/` under Turbopack.
