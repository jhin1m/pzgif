# Phase 1 — pipeline measurements and architecture gate

**Date:** 2026-08-05 · **Deliverable of:** `phase-01-benchmark-spike-and-architecture-gate.md`
**Raw artefacts:** `bench-results/*.json` · **Harness:** `/__bench` + `e2e/bench/*.spec.ts`

## Verdict

**The architecture is viable on Chromium and WebKit and is NOT viable on Firefox as it stands.**
Phase 4 is unblocked for the Chromium/WebKit path. Two findings need an operator
decision before Phase 5, and one gate cannot be closed without hardware.

| Gate | Result | One line |
|---|---|---|
| G1 deadlock soak | **PASS (5 of 6 cells)** | 2,500 encodes, zero hangs, zero errors. One cell unrun — see gaps |
| G2 desktop throughput | **PASS in scope · Firefox breaches** | Chrome 3.96 s, Safari 5.98 s against 15 s / 25 s. Firefox 51.8 s vs a 30 s viability floor |
| G3 mobile survival | **NOT RUN** | No iPhone, no mid-range Android. Emulators are explicitly not a substitute |
| G4 memory ceiling | **PASS — no ceiling found** | All three engines completed a 732 MB frame buffer without dying |
| G5 boot path | **PASS** | Worker + `.wasm` instantiate in a production build on all three engines |
| G6 quality proof | **PACK READY — needs 3 human judges** | Cannot be decided by measurement; pre-registered pack generated |
| G7 containers + rotation | **PASS with one gap** | Rotation honoured everywhere. HEVC decode fails on Chromium and Firefox |
| G8 refusal rate | **FAIL — escalation triggered** | iOS refuses **80%** of a modelled corpus against a pre-committed ~30% threshold |

Machine for every number below: Apple Silicon, 8 cores, 16 GB. Chromium
151.0.7922.34, WebKit 26.5, Firefox 153.0 — all Playwright builds. Full
`context` block in every artefact.

---

## The four findings that change the plan

### 1. gifski's WASM is 12–14× slower on Firefox, and it is the WASM, not the browser

G2 on `screen-720p-10s.mp4` → 480 px, 15 fps:

| Engine | Median total | Decode | Encode | G2 target |
|---|---|---|---|---|
| Chromium | **3,955 ms** | 457 ms | 3,468 ms | 15,000 ms — pass |
| WebKit | **5,984 ms** | 2,464 ms | 3,515 ms | 25,000 ms — pass |
| Firefox | **51,792 ms** | 332 ms | **51,604 ms** | breaches the 30 s viability floor |

Firefox's *decode* is the fastest of the three. Only the encode is slow. A
controlled comparison across three more fixtures (`encoder-cross-engine.*.json`)
isolates it further — `gifenc`, pure JavaScript, runs at parity or faster on
Firefox while gifski does not:

| Fixture | gifski ms/megapixel | | | gifenc encode ms | | |
|---|---|---|---|---|---|---|
| | Chromium | WebKit | Firefox | Chromium | WebKit | Firefox |
| 48f @ 320px | 276 | 260 | **3,274** | 448 | 728 | 669 |
| 36f @ 320px | 160 | 153 | **2,030** | 115 | 130 | 88 |
| 30f @ 240px | 270 | 252 | **3,707** | 214 | 205 | 305 |

So this is specific to the gifski WASM module under SpiderMonkey. Firefox is
~3% of global traffic but a much larger share of the privacy-minded audience a
no-upload tool attracts, so it is not dismissible.

**Caveat that must be resolved before acting:** measured on Playwright's Firefox
153.0, which is a patched build. The `gifenc` control makes a harness artefact
unlikely — a harness problem would slow both encoders — but this needs one manual
run in release Firefox before any code is written against it.

**Recommendation:** the runtime encoder switch that `plan.md` already requires as
a deadlock escape hatch should also be *engine-aware*, defaulting Firefox to
`gifenc`. That is a routing rule in Phase 4, not new machinery.

### 2. The GIF decode path was O(n²) — found, fixed, verified

The obvious streaming API, `modern-gif`'s `decodeFrame(source, index)`, is
internally `decodeFrames(range: [0, index])`: it re-decodes every preceding frame
on every call. Six of nine MVP tools take GIF input, so this was the product's
highest-volume path.

| Frames | Before, ms/frame | After, ms/frame |
|---|---|---|
| 10 | 73 | 16.2 |
| 50 | 304 | 15.0 |
| 100 | 662 | 16.8 |
| 200 | **1,261** | **15.1** |

200 frames: **252,254 ms → 3,015 ms, an 84× speedup**, and per-frame cost is now
flat. The fix composites frames by hand from `decodeUndisposedFrame()`, giving
O(n) time *and* O(1) memory — better than both library helpers, since
`decodeFrames()` would hold 384 MB of source-size RGBA for `loop-large.gif`.

That moves GIF disposal handling into our code, so it is verified rather than
assumed: `gif-compositing.spec.ts` compares the streaming compositor against
`modern-gif`'s own `decodeFrames()` pixel for pixel across five fixtures on all
three engines. **Zero mismatched pixels.**

This was caught because a G4 number did not fit the G2 numbers. It would not have
been visible in any single measurement.

### 3. iOS refuses 80% of realistic inputs — the pre-committed escalation fires

G8 ran `planEncode()` over 30 modelled input shapes at each tier:

| Tier | Budget | Refused | Downgraded | Budget status |
|---|---|---|---|---|
| Desktop | 500 MB | **0%** | 63% | estimate |
| Desktop low-RAM | 200 MB | **10%** | 90% | estimate |
| Android mobile | 120 MB | **23%** | 77% | estimate |
| **iOS** | **30 MB** | **80%** | 20% | estimate |

`phase-01` G8 pre-commits: *"If iOS refusal exceeds ~30%, that is a product
decision — accept it, or pull the server tier forward — and it must reach the
operator before Phase 5."* At 80% it is not marginal.

The refusal list is not arbitrary. **Everything that passes on iOS is an existing
small GIF**; everything refused is video. Phone video, screen recordings, game
clips and 4K all fail. In product terms: **on iOS the GIF-input tools work and
video-to-GIF essentially does not.**

Two caveats, both load-bearing: the 30 MB iOS budget is an unmeasured research
estimate (`measured: false` in `limits.ts`), and the corpus is modelled rather
than observed. But the gap is 50 points wide — G3 on real hardware would have to
move the budget by more than 2× to change the conclusion.

### 4. HEVC decode fails on Chromium and Firefox

G7, real decode rather than demux — every container demuxed everywhere, but:

| Fixture | Chromium | WebKit | Firefox |
|---|---|---|---|
| `screen-720p-10s.mp4` (H.264) | ok | ok | ok |
| `phone-1080p-5s.mov` (HEVC) | **FAIL** | ok | **FAIL** |
| `clip-vp9-5s.webm` (VP9) | ok | ok | ok |
| `portrait-rotated.mp4` | ok | ok | ok |

HEVC is what an iPhone actually uploads. Playwright's Chromium ships without
proprietary codecs, so release Chrome may well differ — this specific row needs a
real-browser check. Firefox's limitation is likely genuine.

The actionable part is engine-independent: mediabunny's own error says *"Make
sure to check decodability before using a track."* Phase 4 must **probe
decodability before accepting a job**, and refuse with a real message rather than
failing mid-encode.

---

## Gate detail

### G1 — deadlock soak

2,500 encodes across 5 fixtures, both worker lifetimes. **Zero hangs, zero
errors.** Watchdog calibrated per fixture at 10× a measured warm-up median.

| Engine | long-lived | worker-per-job |
|---|---|---|
| Chromium | 500 runs, 0 hangs | 500 runs, 0 hangs |
| WebKit | 500 runs, 0 hangs | 500 runs, 0 hangs |
| Firefox | 500 runs, 0 hangs | **not run — see gaps** |

**A pass here is a ceiling, not an absence.** Zero hangs in 2,500 runs bounds the
failure rate at roughly 0.12% with 95% confidence. Roughly one job in eight
hundred is not a rate to ship knowingly, so the two Phase 4 safeguards remain
mandatory rather than optional: a worker watchdog that converts a hang into a
reported, retryable failure, and automatic per-job fallback to `gifenc`.

Wired into nightly CI at `.github/workflows/nightly-soak.yml`, all three engines,
200 runs per fixture per mode, artefacts retained 30 days.

### G4 — memory ceiling

No ceiling was found. All three engines completed every step:

| Step | Frame buffer | Chromium | WebKit | Firefox |
|---|---|---|---|---|
| 320px × 50f | 29 MB | 1.5 s | 1.1 s | 9.9 s |
| 480px × 100f | 132 MB | 4.2 s | 3.3 s | 39.7 s |
| 640px × 200f | 469 MB | 12.4 s | 11.4 s | 132 s |
| 800px × 200f | **732 MB** | 12.6 s | 11.0 s | 142 s |

So the desktop ceiling is **≥ 732 MB**, and `limits.ts`'s 500 MB desktop budget
is conservative — the safe direction. The probe should be extended upward in
Phase 4 to find the actual number.

CDP `Performance.getMetrics` reported a 4.1 MB peak JS heap, which is expected
and worth stating plainly: the frame buffers live in the worker and in the WASM
heap, neither of which the main-thread JS heap metric sees. **The empirical probe
is the instrument that matters here**, exactly as `phase-01` anticipated.
`measureUserAgentSpecificMemory()` was not used — it requires cross-origin
isolation, which this project cannot have.

### G5 — boot path

| Engine | Cold init | Warm | Console errors |
|---|---|---|---|
| Chromium | 9 ms | 0 ms | none |
| WebKit | 12 ms | 0 ms | none |
| Firefox | 38 ms | 0 ms | none |

`.wasm` served at 292,735 B as `application/wasm` with
`public, max-age=31536000, immutable`. `crossOriginIsolated === false` asserted
on every engine. Verified **in a production build**, behind the real CSP.

This also answers two open questions from the phase file:

- **`require.resolve('gifski-wasm/pkg/...')` is refused** with
  `ERR_PACKAGE_PATH_NOT_EXPORTED` — the package's `exports` map omits `pkg/`.
  Resolving the entry point and walking to `../pkg/` works and is what
  `scripts/copy-wasm.mjs` now does; it is also correct under pnpm's symlinked
  store, which a hardcoded `node_modules/` path is not.
- **The worker does not need serving from `public/`.**
  `new Worker(new URL('./bench.worker.ts', import.meta.url), {type:'module'})`
  works under Turbopack in dev *and* in an optimised production build.

### G6 — quality proof, awaiting judges

**This gate cannot be closed by measurement and has not been.** The pack is
generated and pre-registered; three humans have to look at it.

`bench-results/g6-pack/` — three unlabelled pairs, a `TALLY-SHEET.md`, and
`g6-answer-key.json` which must not be opened until judging is done. One decode
per pair feeds both encoders, so nothing but the encoding differs.

| Pair | Fixture | gifski | gifenc (tuned to match) | Δ |
|---|---|---|---|---|
| 1 | `photo-grain.gif` | 4,234,306 B | 4,105,976 B @ 256 colours | −3.0% |
| 2 | `flat-art.gif` | 158,824 B | 149,993 B @ 12 colours | −5.6% |
| 3 | `screen-720p-10s.mp4` | 1,158,772 B | 1,050,364 B @ 64 colours | −9.4% |

Pre-committed threshold: **≥ 7 of 9 correct identifications**. Pre-committed
consequence of failure, unchanged: drop gifski, drop the AGPL obligation,
reposition on presets, privacy and the size-budget UX, and cut every "visibly
better" claim from the copy in the same commit.

Worth noting for whoever runs it: gifenc needed only **12 colours** to match
gifski's bytes on `flat-art.gif` and 64 on the screen recording. If gifski wins,
that is where it should be most visible.

### G7 — rotation

`portrait-rotated.mp4` has 1920×1080 coded frames with a 90° display matrix.
Output on all three engines: **240×427 — upright.** mediabunny's `CanvasSink`
defaults `rotation` to the container's metadata, so this works by not overriding
it. The pass condition is a dimension check, not an eyeball.

---

## Deliverables produced

- **`bench-results/calibration.json`** — 115 measured rows plus content
  descriptors for 7 fixtures.
- **`src/lib/media/downscale.ts`** — promoted to production. `imageSmoothingQuality: 'high'` plus a halving step-down chain above 2:1. Firefox ignores the former outright, which is why the chain is not optional.
- **`src/lib/media/limits.ts`** — promoted. Frame-buffer budgeting, `planEncode()` admission control, tier detection. Every tier still carries `measured: false`.
- **`e2e/fixtures/`** — 10 fixtures, ~27 MB, regenerable via `pnpm fixtures`.
- **`/__bench`** — harness inside the real app, excluded from ordinary builds structurally (`page.dev.tsx` is only a page extension when `PZGIF_ENABLE_BENCH=1`). `e2e/app-shell.spec.ts` asserts the 404.

### The estimator's input features are settled

The calibration data proves the point the phase file made in the abstract. At
**identical settings** (480 px, quality 80, gifski), bytes-per-pixel across
fixtures:

| Fixture | B/px | Entropy | Flat ratio | Class |
|---|---|---|---|---|
| `flat-art.gif` | **0.046** | 3.24 b | 94% | flat |
| `clip-vp9-5s.webm` | 0.060 | 5.00 b | 91% | flat |
| `loop-large.gif` | 0.075 | 3.64 b | 92% | flat |
| `screen-720p-10s.mp4` | 0.076 | 3.66 b | 92% | flat |
| `odd-dims.gif` | 0.092 | 4.06 b | 90% | flat |
| `loop-small.gif` | 0.113 | 3.87 b | 84% | flat |
| `photo-grain.gif` | **1.035** | 12.64 b | 4% | photographic |

**A 22× spread driven purely by content.** An estimator keyed only on
(width, fps, quality, colours) cannot predict within an order of magnitude, and
the "≈ 1.8 MB" readout is a headline feature on two wireframes. Phase 4's
`estimate.ts` must take `paletteEntropyBits`, `flatPixelRatio`,
`meanInterFrameDelta` and `distinctColours` as inputs. These are computed by
`computeDescriptors()` and correlate cleanly with the outcome.

**Limitation:** only 1 of 7 fixtures is photographic, so the estimator will be
poorly calibrated exactly where it matters most. Phase 4 should add photographic
fixtures before fitting.

### Open question 1 resolved: the progress protocol

The research report proposed a fixed `0.05 probe + 0.55 decode + 0.40 encode`.
**Measurement says a single fixed weighting is wrong**, because the split depends
on input kind and encoder:

| Job | Probe | Decode | Encode |
|---|---|---|---|
| video → GIF, gifski, Chromium | 0.0% | 11.8% | **87.9%** |
| video → GIF, gifski, WebKit | 0.1% | 39.7% | 60.1% |
| video → GIF, gifski, Firefox | 0.0% | 0.6% | **99.3%** |
| GIF → GIF, gifenc, Chromium | — | **~79%** | ~21% |

`phase-01`'s success criteria already permit exactly this: *"Stage weighting is
permitted and calibrated per job type."*

**Decision for MVP** (the gifski fork stays deferred, per `plan.md` open question
5): determinate progress through decode from a real frame index, then a clearly
labelled indeterminate encode stage with an elapsed timer. No invented
percentage. Weights per job type from the table above, re-measured per device
class in Phase 4.

The GIF-input + gifski split is the one cell still missing — see gaps.

---

## Copy-risk resolution

`phase-01` step 11 requires a verdict on the unverified speed claims.

**1. `tool-mp4-to-gif.html:356` — "A three-second clip at 480 px wide typically
finishes in under ten seconds on a current laptop."**

Measured, scaled from G2's 10-second clip at the same width:

| Engine | ~3 s clip, 480 px | Claim holds? |
|---|---|---|
| Chromium | ~1.2 s | yes, wide margin |
| WebKit | ~1.8 s | yes, wide margin |
| Firefox | **~15.5 s** | **no** |

**Verdict: cut the sentence.** It is true on two engines out of three and the
copy cannot know which one the reader is using. If Firefox is routed to `gifenc`
in Phase 4 the claim becomes defensible everywhere and can be reinstated with a
measured figure — but not before, and not on a "current laptop" framing that
implies hardware is the variable when the engine is.

**2. `states.html:522` — badge "Instant · in-browser".**

**Verdict: cut "Instant".** The fastest measured full job is 3.96 s and the
slowest is 51.8 s. Nothing here is instant. "In-browser" is accurate and is the
part that carries the actual differentiator; "No upload · in-browser" says the
true thing.

**3. `tool-mp4-to-gif.html:391` — "up to 150 MB and 60 seconds".**

Not a speed claim, but contradicted by the same measurements: a 60-second clip is
refused on every tier except desktop, and refused on iOS regardless. This is the
mobile-limits defect `CLAUDE.md` already flags. **Phase 11's copy audit must
replace input-size limits with frame-budget language**, since input file size does
not predict what the device can do.

---

## Gaps — what is not measured, stated plainly

1. **G3 has not been run at all.** No iPhone, no mid-range Android. Emulators are
   explicitly excluded because memory behaviour is the thing being measured. This
   is a **procurement blocker**, and the entire mobile memory model — including
   G8's 80% — rests on an unmeasured iPhone SE 3-class floor.
2. **G6 has no verdict.** The pack exists; three humans have not looked at it.
   Nothing about gifski's value is settled until they do.
3. **G1 Firefox `worker-per-job` did not run.** 5 of 6 cells passed. The run
   failed on a Playwright launch error, then the shell session's macOS Mach
   bootstrap namespace was left wedged by process cleanup, so no browser could be
   launched afterwards. **A fresh terminal session clears it.** Re-run with:
   `PZGIF_SOAK_RUNS=100 pnpm exec playwright test -c playwright.bench.config.ts g1-soak --project=firefox -g "worker-per-job"`
4. **`stage-split.spec.ts` did not run** for the same reason. The video-input
   numbers above are derived from G2's recorded per-stage timings, which are
   measurements; the GIF-input + gifski cell is the one genuinely missing figure.
   Re-run: `pnpm exec playwright test -c playwright.bench.config.ts stage-split`
5. **Firefox and HEVC results are from Playwright builds.** Both need one manual
   confirmation run in release browsers before code is written against them.
6. **The e2e suite has not been re-run since the `/__bench` 404 assertion was
   added**, for the same wedged-session reason. The exclusion is verified
   structurally — `pnpm build` emits no `/__bench` route — but the assertion
   protecting it is unexecuted. `pnpm test:e2e` in a fresh shell closes this.
   Everything that does not need a browser was re-run and is green:
   `check:forbidden`, `typecheck`, `lint`, `test` (14 passing), `build`,
   `check:static`.
7. **No 1000-encode soak on any mobile device**, and none is practical — on a real
   iPhone that is one to two hours of foreground tab time. The device class most
   likely to expose a race is the one least likely to be soaked. iOS is not
   covered by G1 and should not be described as if it were.

## Unresolved questions for the operator

1. **G8 at 80% iOS refusal — accept, or pull the server tier forward?** The
   pre-registered trigger has fired and this must be answered before Phase 5. The
   narrower framing the data supports: *on iOS, ship the GIF-input tools and do
   not ship video-to-GIF.*
2. **Does Firefox get `gifenc` by default?** Recommended, pending one manual
   confirmation in release Firefox.
3. **Who are the three G6 judges, and when?** Phase 4 should not start on the
   assumption that gifski wins — the AGPL obligation is already being paid.
4. **When does the mobile hardware arrive?** G3, G4-mobile and the real G8 are
   all blocked on it, and `limits.ts` ships fiction until then.
