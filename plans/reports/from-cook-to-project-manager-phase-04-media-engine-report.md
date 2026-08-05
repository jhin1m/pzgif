# Phase 4 — Media Engine Core

**Date:** 2026-08-05 · **Deliverable of:** `phase-04-media-engine-core.md`
**Verification:** `typecheck`, `lint`, `test` (86), `build`, `check:forbidden`,
`check:static`, `check:heavy` — all green. **Browser suite written but unrun.**

## Verdict

The engine is code complete and every non-browser gate passes. One honest gap
dominates this report: **no Playwright test executed in this session**, because
no browser would launch — the same wedged macOS Mach bootstrap namespace the
Phase 1 report recorded as gap 3. `pnpm test:engine` in a fresh terminal closes
it. Until then, everything asserted below about *decoded output* is a written
assertion, not an observed one, and is marked as such.

## What was built

| Area | Files | Note |
|---|---|---|
| Contract | `types.ts`, `worker/protocol.ts` | Written first. Every tool is a `JobSpec`; every UI state is a `JobEvent` |
| Capability | `capability.ts` | Probes rather than version-sniffs. Owns the device tier, the iOS video decision and encoder routing |
| Admission | `plan.ts`, `limits.ts` | Refuses **before** decode, downgrades where it can, always offers a trimmed run |
| Input | `sniff.ts`, `decode/{index,gif,video,webp,still}.ts` | Magic-byte routing; the GIF path is Phase 1's O(n) streaming compositor, promoted |
| Ops | `ops/{geometry,frame-select,speed,reverse}.ts` | crop → rotate → resize, then selection, retiming and reordering |
| Encode | `encode/{gifski,gifenc,video,png-zip,preview}.ts` | Per-job worker; gifenc reports real per-frame progress, gifski cannot |
| Orchestration | `pipeline.ts`, `progress.ts`, `job-controller.ts`, `worker/{job,encode}.worker.ts` | Two workers, `MessageChannel`, watchdog on the page |
| Estimation | `estimate.ts`, `calibration.ts` | Two differenced sample encodes; curves distilled from `calibration.json` |
| React | `hooks/use-media-job.ts` | Progress in an external store, not React state |
| Guard | `scripts/check-heavy-deps.mjs` | Fails the build if ffmpeg ever reaches a client chunk |

Phase 1's decoders and encoders were **promoted, not rewritten**;
`src/lib/bench/*` are now thin adapters, so the harness and the product share one
implementation and cannot drift.

## The four decisions worth reviewing

### 1. The estimator measures instead of predicting — by differencing two samples

The calibration data made a settings-only model indefensible: **22× spread in
bytes-per-pixel at identical settings**, driven purely by content. So the primary
path encodes two strided samples (2 frames and 6) at the real settings with the
real encoder and reads the *marginal* cost of a frame off the difference:

```
bytesPerFrame = (bytes(6) - bytes(2)) / 4
```

Differencing is what makes a sample this small usable at all: a single 6-frame
sample is dominated by header and palette, amortised over 6 frames instead of
500, and would overshoot several-fold. Subtraction cancels every fixed cost.

The settings-only curve remains as the fallback, anchored on `flatPixelRatio`
between two measured points — and carries a **±45% band against the sampled
path's ±20%**, because it deserves less confidence. Its photographic anchor rests
on a single fixture, which the Phase 1 report already flagged.

### 2. Firefox defaults to `gifenc`

Not in the phase file, added on Phase 1's measurement: gifski's WASM ran 12-14×
slower under SpiderMonkey — 51.8 s against a 30 s viability floor — while
`gifenc` ran at parity on all three engines. The `gifenc` control makes a harness
artefact unlikely.

**This needs one confirmation run in release Firefox before launch.** The default
is set the safe way round meanwhile: a 52-second encode loses the user outright,
and the quality delta at matched bytes measured 3-9%.

### 3. The ZIP is written by hand, and checked against someone else's unzip

`fflate` was in the plan for exactly one property — `ZipPassThrough` stores
without re-deflating, because PNG is already compressed. With compression off,
ZIP is a local header, a payload, a central directory and an end record. That is
~100 lines, no dependency and no bundle cost.

The risk of hand-writing a container is a file that is *self-consistently wrong*:
this code reads it back happily and Finder refuses it. So `png-zip.test.ts`
builds an archive and hands it to **Python's `zipfile`**, which verifies CRCs,
names and payload lengths independently. That test is the reason this deviation
is defensible rather than merely cheaper.

(The environment had no registry access to install `fflate` either. The reasoning
above stands without that, but it is stated so the constraint is on the record.)

### 4. The code review found sixteen defects, and they are fixed

A `code-reviewer` pass over the whole engine traced the worker protocol,
admission control, progress and cancellation. It found real bugs, not style
notes. The four that would have shipped as user-visible failures:

- **Every iPhone would have been classified as a desktop.**
  `navigator.maxTouchPoints` is `[Exposed=Window]` — `WorkerNavigator` has no
  such member, so it reads `undefined` in the worker rather than throwing. Since
  that property is how iOS is identified (Safari implements no `deviceMemory`,
  and an iPad reports itself as a Mac), the worker would have handed every iPhone
  a **500 MB budget instead of 30 MB** and the tab would have died mid-decode —
  the precise outcome the whole engine exists to prevent. TypeScript could not
  catch it: the engine compiles against `lib.dom`. The page now detects the tier
  and posts it in as the worker's first message.
- **Every ping-pong job would have failed at the last step.** `applyDirection`
  deliberately *shares* the interior frames' buffers rather than copying pixels,
  and a `postMessage` transfer list containing the same `ArrayBuffer` twice
  throws `DataCloneError`. The protocol now carries deduplicated buffers plus an
  index map, which keeps the memory saving and makes the transfer legal.
- **The estimator pulled gifski's WASM heap into the long-lived worker.**
  `pipeline.ts` → `estimate.ts` → `encode/gifski.ts` was a static import chain, so
  one estimate would instantiate the never-shrinking heap in the one thread that
  is never terminated — undoing the entire reason the encode worker is
  disposable. `estimateFromSample` now takes an injected sample encoder that
  routes through that disposable worker.
- **`plan.frames` meant two different things.** It is the *output* count, and it
  was being handed to the decoder as a *decode* cap. On the truncated offer
  attached to an iOS refusal, ping-pong would then have decoded twice the
  budgeted frames — on the device that had just refused the job. `AcceptedPlan`
  now carries `decodeFrames` alongside `frames`, solved from the output ceiling
  rather than the other way round.

Also fixed: cancel landing in the encoder-handover window could let a job finish
and emit `done` minutes later; a cancelled job surfaced in the *error* state
rather than idle; the retry double-banked the decode weight and pinned the bar at
100% while the retry was still decoding; `CanvasSource.add()` was not awaited, so
encoder backpressure was discarded; the chosen codec's container was ignored, so
a VP9 fallback would have been labelled `video/mp4`; video frame durations were a
constant derived from the *target* fps rather than the real inter-frame gap, and
the sample clock fell permanently behind on variable-frame-rate input; the stride
op dropped frames without redistributing their delay, so "keep 1 in 3" played
three times faster; unclassified throws during decode surfaced as
`encode-failed` ("try lowering Colors"), a setting change that cannot help a file
we could not read; a failed sample encode returned an estimate of **0 bytes**;
handler entries leaked for every probe and estimate; and MPEG-TS sniffing
classified any file starting with the letter "G" as video.

Three of these — the tier, the ping-pong transfer, the frame-count semantics —
now have unit tests. The rest are covered by the written browser suite.

### 5. Two bugs found by reading the concurrency, not by a test

Neither would have surfaced without a browser, and both were live:

- **Cancel during encode hung the job forever.** The controller terminated the
  encode worker but nothing rejected the pipeline's pending promise, so the job
  sat at "encoding" with no path out. The controller now sends `encoder-failed`
  alongside the termination.
- **Stats reported zero frames.** The frame array is emptied when its buffers are
  transferred to the encode worker — deliberately, so nothing is held twice — and
  the stats were read from it afterwards. The count is now taken first.

## Deviations, in one place

1. **The Rust fork is not vendored** — already ratified as deferred in `plan.md`
   OQ5. Encode shows a labelled indeterminate stage and an elapsed timer, never
   an invented percentage.
2. **`fflate` → hand-written STORE writer** (above).
3. **`@jsquash/*` dropped** — no MVP tool takes a still image as input;
   `createImageBitmap` identifies one natively so the refusal can name it.
4. **Animated WebP encode not built** — no registry route outputs WebP.
   `GIF → WebP` was cut at planning; WebP is input-only.
5. **`ops/resize.ts` + `ops/crop.ts` → one `ops/geometry.ts`** — the load-bearing
   rule is the order, and split across two files it would live in neither.
6. **ffmpeg is runtime-loaded, not an npm dependency**, and its binaries are not
   vendored yet, so `isFfmpegAvailable()` is false and the recovery is not
   offered. `pnpm check:heavy` asserts by construction that it never reaches a
   client chunk.
7. **Firefox → `gifenc`** (above).

## Gaps — stated plainly

1. **No browser test ran.** `e2e/bench/engine-pipeline.spec.ts` (15 cases) and
   `engine-estimate.spec.ts` are written and unexecuted. Everything about decoded
   output, rotation, cancellation timing and estimator accuracy is unverified in
   practice. Run `pnpm test:engine` in a fresh terminal.
2. **The estimator's spread is an argument, not a measurement.**
   `SAMPLED_ESTIMATE_SPREAD = 0.2` should be set from
   `bench-results/engine-estimate-accuracy.*.json` once the spec runs.
3. **The GIF-input + gifski stage weight is interpolated**, not measured —
   `stage-split.spec.ts` still has not run (Phase 1 gap 4). It biases the bar, not
   any stage's own counter.
4. **iOS is unmeasured.** The 30 MB budget still carries `measured: false` and G3
   has never run. The engine refuses iOS video at the capability gate on that
   estimate; the exact boundary is not knowable without the hardware.
5. **The animated-WebP decode path has no Safari answer.** It reports
   `browser-unsupported` there, which is honest. Phase 7 decides whether to build
   the RIFF/ANMF splitter or cut the page.
6. **The review's fixes are themselves unverified in a browser.** Sixteen
   defects were found by reading and fixed; the three most consequential now have
   unit tests, but the concurrency ones — cancel timing, the encoder handover
   window, the deduplicated transfer — can only be observed with a running
   browser. This raises the value of the unrun suite rather than lowering it.
7. **The hang watchdog has never fired in anger.** G1 found zero hangs in 2,500
   runs; the fallback path is therefore exercised by construction and by reading,
   not by observation. A fault-injection test would be worth an hour in Phase 11.

## Unresolved questions for the operator

1. **Does Firefox get `gifenc` by default?** Shipped as yes. One manual run in
   release Firefox either confirms it or reverts one line.
2. **Should the ffmpeg binaries be vendored for Ship 1?** The concrete gap is
   HEVC — what an iPhone records — failing to decode on Chromium and Firefox,
   which reaches the Discord routes' video path. Ship 1 works without it; those
   users get a named refusal instead of a conversion.
3. **When does `SAMPLED_ESTIMATE_SPREAD` get its real number?** It gates how the
   Discord auto-fit search is seeded, so it is worth doing before Phase 8 rather
   than at the Phase 11 audit.
