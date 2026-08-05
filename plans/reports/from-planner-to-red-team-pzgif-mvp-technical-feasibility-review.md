# Red-team review — PZGIF MVP plan (260805-0001)

Reviewer posture: hostile. Target: `plans/260805-0001-pzgif-mvp-9-browser-native-gif-tools-discord-presets/`.
Cross-checked against `docs/tech-stack.md`, `docs/design-guidelines.md`, both `research-260804-2343-*` reports, and the wireframes.
Ratified decisions (AGPL, `modern-gif` everywhere, mediabunny, device budgets, 9+5 routes, scoped gate, ads-off) are treated as fixed; only their **execution** is attacked.

Repo state at review time: **no code exists.** `docs/` + `plans/` only. Every estimate below is greenfield.

---

## Severity summary

| # | Finding | Sev |
|---|---|---|
| C1 | "4-5 weeks solo" arithmetic requires parallelism a solo dev cannot exercise | Critical |
| C2 | Phase 1 memory instrumentation (`measureUserAgentSpecificMemory`) requires cross-origin isolation — the one thing the architecture forbids | Critical |
| C3 | `estimate.ts` ±25% is not achievable from settings alone; it silently gates Phase 7 headline UI and Phase 8 auto-fit | Critical |
| C4 | Gate G1 cannot prove what the plan says it proves, and there is no runtime degradation path when it is wrong | Critical |
| C5 | The "~20 lines of Rust" vendored gifski fork is the plan's largest under-estimate and has no owner, no toolchain, no fallback | Critical |
| H1 | Phase 1 must emit `calibration.json` for "settings ranges the UI exposes" — those ranges are defined in Phases 5-8. Circular | High |
| H2 | Phase 9, 10 success criteria are unsatisfiable given their declared dependencies | High |
| H3 | Phase 3 declares `dependencies: [2]` but two components are explicitly blocked on Phase 1 numbers | High |
| H4 | Video rotation metadata is not handled anywhere → sideways GIFs from every portrait phone video | High |
| H5 | `hidden="until-found"` is unsupported in Safari → FAQ answers permanently hidden on ~20-30% of traffic | High |
| H6 | Progress protocol violates the very design principle the plan's success criterion tests for | High |
| H7 | "One worker entry point" contradicts terminate-per-encode and the research's mandatory two-worker split | High |
| H8 | Playwright "decode the output and assert" has no planned Node-side decode toolchain; Playwright cannot cover Safari/iOS at all | High |
| H9 | AGPL source offer points at a moving repo, not the deployed revision; public repo + CI secrets unaddressed | High |
| H10 | Vercel Hobby ToS explicitly prohibits ad-carrying sites; tech-stack and research both say "free on Hobby" | High |
| M1 | iOS budget makes the flagship tool refuse a majority of realistic inputs; no refusal-rate measurement anywhere | Med |
| M2 | Spike scaffolds a second Next app; G5 therefore proves nothing about the real app's CSP/proxy/i18n boot path | Med |
| M3 | Strict CSP + inline theme script + full SSG is unresolved (nonce impossible, hash unmentioned) | Med |
| M4 | Goal 2 promises "offline-capable after first load"; no phase builds a service worker | Med |
| M5 | Phases 5/6/7/8/9 have overlapping file ownership while claimed independent | Med |
| M6 | `decode-failed` recovery offers "Pro", which the plan says does not exist | Med |
| M7 | Auto-fit "release buffers between attempts" is insufficient given gifski's non-shrinking heap | Med |
| M8 | Downscale quality path (`CanvasSink` / `drawImage`) undermines differentiator #1 and is never specified | Med |
| M9 | Sticker upload verification requires a Boost-level-1 Discord server | Med |
| M10 | No kill-switch / feature flag for the encoder; ads get one | Med |
| M11 | Wireframe "reuse microcopy verbatim" is contradicted by the plan in ≥4 places | Med |
| L1-L6 | See table at end | Low |

---

## Critical

### C1 — The timeline arithmetic assumes parallelism a solo developer does not have

`plan.md` line 138: *"Serial effort across the 11 phases estimates at roughly 31 working days; with Phases 1/2/3/9 overlapping, **4-5 weeks solo** is the realistic figure."*

4-5 weeks = 20-25 working days. 31 serial days > 25. **The only way the number closes is overlap, and one person cannot overlap.** Overlap buys a solo dev nothing except during genuine blocking waits (the G1 soak running unattended, an ad-network review). Phase 1 is hands-on measurement; Phase 2/3 are hands-on building. They are not concurrent for one human.

Worse, the 31-day serial figure is itself optimistic. My estimates:

| Phase | Plan | Mine | Why |
|---|---|---|---|
| 1 Benchmark | 2-3d | **6-9d** | Scaffold a Next app; implement 4 decode/encode paths twice (gifski + gifenc); **author 8 fixtures** (source public-domain media, ffmpeg-generate, verify frame counts/delays); build measure.ts + OOM probe; deploy to a preview URL; manual runs on real iPhone + Android; soak; **combinatorial calibration sweep** (see H1 — 8 fixtures × widths × fps × quality × colours is thousands of encodes = hours of machine time plus harness work); write the report. The fixture authoring alone is 1d. |
| 2 Shell | 1-2d | **2-4d** | Tailwind v4 three-block token port of the **entire** `design-guidelines` §2.1+§2.2 palette; `next-intl@4.13.5` published the day before with an unexercised Next 16 `proxy.ts` path (plan's own risk table); 5-step CI; CSP incl. the unsolved inline-script hash (M3); AGPL surface; two doc amendments; CLAUDE.md. |
| 3 Design system | 3d | **6-8d** | Not 12 components — **18**: 12 specs + Header/Footer/TrustLine/StickyActionBar/ThemeToggle/SkipLink, plus `/dev/states`, plus unit tests, plus a full a11y pass. 3d = ~1.3h each including tests, both themes, forced-colors, 200% zoom. `BeforeAfterSlider` alone (pointer capture, `role="slider"` keyboard matrix, A-B flip, reduced-motion, static fallback) is 1-1.5d. `Dropzone` with drag + click + document paste + announcements is 0.5-1d. Fantasy. |
| 4 Engine | 4-5d | **10-16d** | 4 decode paths, 5 ops, 4 encode paths, controller, capability, limits, plan, estimate, errors, React hook, Vitest — **plus vendoring and patching a Rust/wasm crate** (C5). Even excluding the Rust, 8-12d. This is the single largest under-estimate. |
| 5 Framework+compressor | 3d | **4-6d** | Includes building the E2E decode harness (H8) that nothing has built yet. |
| 6 GIF→GIF ×4 | 3d | **4-6d** | `CropOverlay` with 8 handles + pointer capture + full keyboard + numeric parity ≈ 1.5d. 1,600 words of genuinely distinct researched copy ≈ 0.5-1d. |
| 7 Cross-format ×4 | 4d | **6-8d** | Trim UI + keyframe-seek preview + codec probe chain + streaming ZIP + WebP dual-state + manual playback verification on Discord/iMessage. |
| 8 Discord ×5 | 3d | **4-6d** | Auto-fit search, budget bar, preview, manual override with per-preset constraints, 2,000 words, doc corrections, **manual sticker-upload verification (M9)**. |
| 9 Content+legal | 3d | **4-6d** | Five legal pages that actually describe the product (not boilerplate) is 1.5-2d on its own. |
| 10 Ads/consent | 2d | **3-4d** | Consent Mode v2 ordering, GA4, Sentry scrubbing, web-vitals attribution, provider interface, hydration-safe slot, Playwright long-task harness. |
| 11 QA/launch | 3d | **5-9d** | Six manual a11y passes + full real-device matrix + visual regression + Lighthouse CI + copy audit **and fixing everything they find**. There is zero buffer for defects discovered here, which is the entire point of the phase. |
| **Total serial** | **31d** | **54-82d** | |

**Fix:** restate the estimate as **11-16 weeks solo**, or cut scope now. The plan's own suggested cut (Phase 6 → 2 tools, defer two Phase 7 tools) removes ~4d of 31 — roughly 13%. That does not bridge a 2× gap. The honest cut lines are: (a) drop the vendored Rust fork to post-launch and ship indeterminate encode; (b) drop the Discord dedicated pages to the hub alone (−3-5d); (c) drop `webp-to-gif` and `split-gif-into-frames` entirely (−2-3d). State which, and get the user to ratify, before Phase 1 starts.

---

### C2 — The Phase 1 memory measurement API cannot run under the plan's own architecture

`phase-01` step 6: *"`performance.measureUserAgentSpecificMemory()` where available"*.

`measureUserAgentSpecificMemory()` **requires the document to be cross-origin isolated** (MDN: "Secure Context **and** Cross-Origin Isolated"; throws `SecurityError` otherwise). Cross-origin isolation requires `COOP` + `COEP` — the exact headers `plan.md` line 28-30 declares are *"breaking the revenue model. Reject it in review."*

So Phase 1 either:
- runs the harness **without** COI → the API throws, and G4 (the memory ceiling, described as the phase's real deliverable) has **no instrument on Chromium**; or
- runs the harness **with** COI → measures a process/memory topology that does not match production, and G5's boot-path finding is invalidated too.

And neither branch helps on iOS, which is the binding constraint and where no memory API exists at all.

**Fix:** delete `measureUserAgentSpecificMemory` from the plan. Use (a) CDP `Performance.getMetrics` sampled on a timer for Chromium desktop — as the research actually recommended — and (b) the empirical OOM probe (step 6's second half) as the *only* instrument for iOS/Safari. Rewrite G4 to say explicitly: "the ceiling is derived from the crash point, not from a memory API." Add a line to `phase-01` noting the harness must NOT be served with COI, so G5 remains meaningful.

---

### C3 — The estimator is under-specified and structurally cannot hit ±25%

`estimate.ts` gets **one implementation step** (`phase-04` step 11) and one calibration input. It then drives:
- the compressor's live readout (`phase-05` step 5),
- `mp4-to-gif`'s *"single most valuable element on the page"* (`phase-07`),
- the Discord budget bar's re-estimate on every settings change **without re-encoding** (`phase-08`),
- the auto-fit **seed** that the plan relies on to keep iOS to 1-2 encodes instead of 5 (`phase-08`).

The declared input tuple is `(width, fps, quality, colours, frames)`. **GIF output size is dominated by content, not settings.** Flat vector art at 32 colours and photographic grain at 32 colours, same dimensions, same frame count, differ by 5-10×. The plan's own fixture matrix acknowledges this — it deliberately includes `photo-grain.gif` and `flat-art.gif` as best/worst cases — and then builds a model with no content feature to distinguish them. An 8-fixture lookup table interpolated over settings will be wildly wrong on arbitrary user input. ±25% is not a stretch target; it is unreachable by this design.

Cascade when it misses: Phase 7's headline readout is visibly wrong on the page whose whole pitch is honesty → Phase 8's auto-fit seed is wrong → the search degrades to blind → 5 real encodes on iOS at a 30 MB budget → the exact crash the plan lists as a risk it has mitigated.

**Fix (specific):** make the estimate **measurement-based, not model-based**. At probe time, encode a strided sample of N frames (e.g. 5 frames evenly spaced) with the *same* gifski settings, measure bytes, and extrapolate `bytes ≈ sample_bytes × (total_frames / N) × interframe_correction`. `calibration.json` then calibrates only the correction factor, which *is* a low-dimensional function of settings — that is what the fixtures can legitimately teach. Cost: one extra sub-second encode per settings change (debounced). Budget 1-2d for this in Phase 4 and say so. Alternatively: drop the numeric readout to a **range** ("≈ 1.5-2.3 MB") and drop the ±25% criterion, which is the KISS answer and still beats every competitor.

Also note `phase-07` step 3 says *"If it is consistently off by more than ±25%, fix the model before shipping the readout"* — with zero days allocated to "fix the model", in a phase already estimated at 4d for four tools.

---

### C4 — G1 is not the proof the plan thinks it is, and there is no production fallback

Three separate problems.

**(a) Statistics.** Zero hangs in 1,000 trials gives a 95% upper bound on the hang rate of ≈ 3/1000 = **0.3%** (rule of three). It does not establish absence. At 0.3%, 5,000 jobs/month is up to 15 hangs/month; 100k jobs is up to 300. For a *race condition* the rate is also not stationary — it depends on device speed, scheduler pressure, and input shape, none of which a single fixture on one desktop varies. Passing G1 licenses "ship it with a watchdog", not "the deadlock is not real."

**(b) Coverage.** The plan runs G1 on **one fixture** (`loop-small.gif`) and does not name browsers or devices (`phase-01` step 7: *"Run it long"*). The research specified **Chrome + Firefox + WebKit** and *"run this in CI nightly forever"* — the plan drops both. It also drops the research's "fresh worker each 50 runs" in favour of respawn-per-job, which is production-correct but **removes the long-lived-worker case entirely**, so a leak- or state-accumulation-driven hang would never appear. And 1,000 encodes × ~2s ≈ 35 min per browser; on a real iPhone that is 1-2 hours of a screen-on, foreground tab fighting iOS throttling — practically infeasible, meaning **the deadlock is never soaked on the device class most likely to expose timing races.**

**(c) No degradation path.** The plan's answer to "it hangs on run 4000 in production" is `phase-04` risk row: *"A wall-clock watchdog in the worker converts a hang into a reported error rather than a frozen tab."* That converts a hang into a **failed job**. There is no retry, no encoder fallback, and no way to switch encoders without a redeploy (see M10).

**Fix:**
1. Restate G1's threshold honestly: *"establishes a 95% upper bound of 0.3% on the hang rate."* Run it on ≥3 fixtures (small/large/photographic) × 3 desktop engines, and a reduced 200-run soak on each real mobile device.
2. Add the nightly CI soak the research demanded. `phase-02` CI already runs Playwright; add a scheduled workflow.
3. Ship the runtime ladder regardless of G1's outcome: watchdog fires → terminate → **retry once on a fresh worker** → still hanging → **fall back to `gifenc`** for that job with a one-line honest note, and emit a telemetry event. `gifenc` is already a dependency for preview. This is ~half a day and it is the difference between "one user's job failed" and "the product works."
4. Keep both encoder paths behind a runtime flag (M10).

---

### C5 — "roughly 20 lines of Rust plus a wasm-pack step" is the plan's most dangerous sentence

`phase-04` line 59. What that sentence does not say:

| Omission | Consequence |
|---|---|
| No Rust toolchain is anywhere in the plan | `rustup`, `wasm32-unknown-unknown` target, `wasm-pack`, `wasm-bindgen-cli` **version-matched to the crate's `wasm-bindgen` dependency** (a classic hard-fail), plus a C toolchain — `imagequant` and gifski's PNG path build C. Not in `phase-02`'s CI, not in the versions table. |
| No skills statement | Nowhere does the plan say who writes Rust. A solo dev who does not will spend days, not hours, on a `!Send` lifetime error inside someone else's fork. |
| `js_sys::Function` is `!Send` | `ProgressReporter::increase()` is invoked from inside gifski's writer pipeline. Upstream gifski runs that pipeline across `crossbeam-channel`-connected threads. `gifski-lite` "hacked" that to compile to wasm — nobody has read *how*. If any part still executes off the calling thread, a `js_sys::Function` callback **will not compile**, and making it compile means restructuring gifski's pipeline. That is not 20 lines. |
| The deadlock and the progress patch touch the same machinery | `phase-04` open question 1 asks whether the progress patch also fixes the deadlock. The likelier truth is the inverse: **both live in the same channel plumbing, so the patch either fixes it or makes it worse**, and you find out only after learning the code. |
| "reproducible" is asserted, not designed | `phase-04` step 7: *"Add the `wasm-pack` build to CI so the vendored `.wasm` is reproducible."* `wasm-pack` output is not byte-reproducible across rustc/wasm-bindgen versions. The plan never decides whether CI **builds** the wasm (adds a Rust toolchain + 5-15 min + cache config to every run) or **verifies a committed artifact**. Under AGPL you must ship the source either way. |
| GPLv3 §5(a) change notices | Modifying AGPL source requires prominent notices stating you changed it and the date. `NOTICE` in `phase-02` lists licences, not modifications. |
| No decision point | The plan's only escape is *"If Phase 1 deferred the fork, ship the interim honestly."* There is no timebox and no owner for the decision. |

**Fix:** timebox the fork to **2 days, in Phase 1, not Phase 4** — it is a spike-class unknown, and Phase 1 already gates the engine. Deliverable is binary: a `.wasm` that builds in CI and calls a JS callback, or a written "deferred to post-launch." Add `rust-toolchain.toml` (pinned rustc), pinned `wasm-pack`/`wasm-bindgen-cli` versions, and a `Cargo.lock` to `phase-02`'s versions table. Decide now: **commit the built `.wasm` under `public/wasm/v1/` and run the Rust build as a separate, non-blocking CI job that diffs against the committed artifact.** Add the change-notice requirement to the AGPL checklist.

---

## High

### H1 — Phase 1's calibration deliverable depends on Phases 5-8

`phase-01` success criterion: *"`calibration.json` exists and covers every fixture across **the settings ranges the UI exposes**."*

The UI's settings ranges are defined in `phase-05` step 4 (Quality 1-100, Colors 256/128/64/32, Lossy 0-100, Width), `phase-06` (speed 0.25×-4×), `phase-07` (trim, fps, width), `phase-08` (per-preset). **Phase 1 cannot know them.** Either Phase 1 guesses and the calibration is incomplete when the real ranges land, or Phase 1 blocks on Phase 5 — which blocks on Phase 4 — which blocks on Phase 1.

Also, taken literally the sweep is enormous: 8 fixtures × 5 widths × 5 fps × (say) 5 quality × 4 colour counts = 4,000 encodes. At ~2s each that is >2 hours of machine time per device, before analysis.

**Fix:** freeze the settings ranges **now**, in the plan, as a small table in `phase-01` (they are already implicit in the wireframes). Reduce the sweep to a designed grid — 3 widths × 3 fps × 3 quality × 4 colour counts × 8 fixtures = 864 encodes — and state that explicitly. If C3's sampling approach is adopted, the sweep shrinks to calibrating one correction factor and gets much smaller.

### H2 — Phase 9 and Phase 10 declare success criteria their dependencies cannot satisfy

| Phase | Declared deps | Unsatisfiable criterion | Why |
|---|---|---|---|
| 9 | `[3]` | *"Every tool and preset page carries ≥400 words … plus its own FAQ"* | Those 14 pages are created in Phases 5, 6, 7, 8. |
| 9 | `[3]` | *"Every route statically prerendered"* | Most routes do not exist. |
| 9 | `[3]` | *"Footer lists exactly the 9 shipped tools + the Discord cluster"* | Also owned by `phase-03` step 8. Duplicate ownership. |
| 10 | `[3, 9]` | *"CLS is exactly 0 on **every route** with slots reserved"* | Routes come from 5-8. |
| 10 | *"Playwright asserts no main-thread task over 200 ms **during a real encode**"* | Requires the engine (4) and a working tool page (5). |

**Fix:** split. Phase 9 owns homepage + legal + SEO machinery + the FAQ/prose *authoring convention*; per-tool prose is a deliverable of the phase that ships the tool (which Phases 6/7/8 already state, redundantly). Change Phase 10's deps to `[3, 5, 9]` and move the CLS-on-every-route and long-task assertions into Phase 11 where the routes exist. Both files currently assert completion states that will be checked off dishonestly.

### H3 — Phase 3 has an undeclared dependency on Phase 1

`phase-03` frontmatter: `dependencies: [2]`. `phase-03` open question 1: *"`BeforeAfterSlider` fallback threshold for very large GIFs — **needs Phase 1 numbers**."* Risk table: *"Build the static side-by-side fallback in this phase, not later. **Set the threshold from Phase 1 data.**"*

So the plan's headline claim — *"Phase 1 blocks all media-engine work (Phase 4 onward). Shell, design system, content and legal proceed in parallel"* — is false for Phase 3.

Separately, `phase-03` step 5 says *"Test with a real large GIF, not a placeholder image."* That is satisfiable with two pre-made GIF files, so the component is buildable; only the **threshold** is blocked. `ProgressBar` is genuinely buildable with no engine — its whole design is to be a dumb function of props — so that half of the question is fine.

**Fix:** declare `dependencies: [2]`, `soft-dependencies: [1]` and explicitly defer only the threshold constant to a follow-up commit after Phase 1 reports. Ship the fallback code path with a placeholder constant and a `TODO` linked to the gate.

### H4 — Video rotation metadata is never handled

`grep -rn "rotat" plans/…` returns exactly two hits, both meaning "rotate the image as a user-facing op." **Nothing anywhere handles a container rotation matrix.**

Portrait video shot on a phone is stored landscape with a 90° display matrix. Ignore it and `mp4-to-gif` emits a **sideways GIF from every portrait phone upload** — which, for a GIF site, is a large fraction of video input. The research flagged this explicitly and specified fixture `f10-rotated.mp4` as a regression guard ("a classic silent-sideways-output bug"). The plan's fixture matrix **drops both f10 and f9** (`499×281`, the odd-dimension guard for the H.264 yuv420p trap that `phase-04` step 9 and `phase-07` both depend on).

**Fix:** add both fixtures to `phase-01`'s matrix. Add to `phase-04` step 5: read mediabunny's rotation and apply it in the sink/ops chain before resize; add a Vitest/E2E assertion that the rotated fixture produces portrait output. Add an odd-dimension E2E assertion in Phase 7.

### H5 — `hidden="until-found"` is unsupported in Safari and fails closed

`design-guidelines` §5.12 mandates it; the plan repeats it in Phase 3 (component), Phase 5 (FAQ), and Phase 9 (crawlability criterion). Per caniuse/web-features as of Aug 2026: **Safari and Safari iOS do not support it** (landed only in Safari Technology Preview); Firefox has it from 139.

`hidden` is an enumerated attribute whose **invalid-value default is the hidden state**. On a browser that does not implement `until-found`, `hidden="until-found"` therefore means plain `hidden` → `display: none`. Consequences on ~20-30% of traffic:
- FAQ answers are `display:none` and the `grid-template-rows: 0fr → 1fr` animation animates a non-rendered box;
- unless the accordion's open handler explicitly **removes** the attribute, answers cannot be opened at all — a functional break on the content that Phase 9 calls load-bearing for SEO;
- find-in-page does not reveal them, so the stated a11y/SEO benefit is Chromium-only anyway.

**Fix:** in `phase-03`, the Accordion must toggle the attribute imperatively on open/close (remove on open, restore on close) and feature-detect: `'onbeforematch' in document.body`. Where unsupported, fall back to `hidden` toggled by the same handler. Add "FAQ answers open on Safari" to the Phase 11 matrix. Update `design-guidelines` §5.12 with the support caveat rather than leaving a spec that fails on WebKit.

### H6 — The progress protocol violates the principle whose test the plan promises

`plan.md` success criterion: *"Progress bars map 1:1 to worker callbacks — verified by **a test asserting no progress value is synthesised**."*
`design-guidelines` §1.2: *"Progress width maps 1:1 to worker callbacks."*
`phase-04`: `overall = 0.05·probe + 0.55·decode + 0.40·encode`.

The composite **is** a synthesis. The weights are a model of relative cost, not a callback. Phase 3's unit test (*"rendered width equals the passed value exactly"*) tests the component, not the controller, so it cannot detect this. The criterion as written is untestable and will be checked off falsely.

Worse, the weights are almost certainly wrong per job type:
- **GIF→GIF compress**: no demux, LZW decode is cheap, gifski dominates → closer to 5/10/85.
- **MP4→GIF**: hardware-accelerated decode, gifski still dominates → closer to 5/20/75.

A 55/40 split means the bar sprints to 60% and then crawls — the classic "fake-feeling" progress the design principle exists to prevent. And if the fork lands late, **40% of every job is indeterminate**, which the `ProgressBar` API (`{determinate,value} | {determinate:false,label}`) can only express by switching modes mid-job — a transition nobody specified, and which visually reads as the bar resetting.

**Fix:**
1. Restate the criterion: *"no progress value is invented from a timer; every value is a monotone function of counted worker events."* Test that, plus **monotonicity** (progress never decreases) — that is the property users actually perceive.
2. Derive the weights per `(jobKind, deviceTier)` from `calibration.json`, not as one global constant. Put the table in `limits.ts` next to the budgets.
3. Specify the interim UI explicitly: decode fills the bar to its weighted ceiling, then the bar **stays at that value** while a separate labelled stage line shows "Encoding GIF (highest quality) · 0:07" with an elapsed timer. Do not switch the same bar to a shuttle.

### H7 — "One worker entry point" contradicts the encode-worker lifecycle and the research architecture

`phase-04` success criterion: *"One worker entry point serves every job type; no tool bypasses it."* Related files list exactly one: `worker/job.worker.ts`.
`phase-04` step 8: *"**Terminate and respawn the encode worker** after each job — the module's `WebAssembly.Memory` never shrinks."*
Research §C10: *"**Architecture (2 workers, not 1)**"*, because `gifski.encode()` is one synchronous blocking WASM call and because terminate is the only way to reclaim the heap.

If there is one worker, terminating it after encode also destroys the decode context and any cached frames — which directly collides with `phase-05` open question 2 (*"Does 'Re-compress' reuse the decoded frames?"*). If there are two, the plan has to say how frames cross worker→worker: `postMessage` between two workers requires a `MessageChannel` port handed to both, or a main-thread relay. **A main-thread relay without transfer lists structured-clones the entire frame array** — hundreds of MB — which is precisely the failure the research warns blows the iOS budget.

**Fix:** state the worker topology explicitly in `phase-04`: worker A (decode+ops), worker B (gifski encode, terminated per job), connected by a `MessageChannel` established at job start, with a hard rule that every frame payload crosses as a transfer list. Change the success criterion to *"one `runJob()` entry point"* — the API is what should be singular, not the thread. Add the code-review rule the research asked for: *no `postMessage` of a typed array without a second argument.*

### H8 — "Decode the output and assert" is real infrastructure the plan never builds

This phrase appears in `plan.md` success criteria and in Phases 5, 6, 7, 8, 11. Nowhere is there a Node-side decode dependency, helper module, or budget.

What it actually requires, in the Playwright **Node** context:
- **GIF**: a pure-JS parser to read dimensions, frame count and per-frame delays. `modern-gif` targets the browser (worker/OffscreenCanvas); the realistic Node choices are `omggif` (2019) or `sharp`/libvips. Neither is in any phase's dependency list.
- **MP4**: `ffprobe` (a system binary — must be installed on the CI runner) or a JS demuxer. Verifying "plays in Discord and iMessage" is inherently manual, which Phase 7 admits.
- **ZIP**: `fflate` works in Node. Fine.
- **Animated WebP**: no Node decoder in the stack.

Second problem: **Playwright's WebKit is not Safari and is definitively not iOS Safari** — the research says so in bold. Yet `phase-11`'s matrix shows ✔ for Safari desktop and iOS Safari across every surface, which reads as automated coverage. It cannot be.

Third: the Phase 2 CI runs `pnpm playwright test` on every push. Real gifski encodes on GitHub Actions runners will make that step minutes long and flaky under runner CPU variance. Nothing budgets for it.

**Fix:** create `e2e/assert/decode.ts` as an explicit Phase 5 deliverable with named deps (`omggif` for GIF, `fflate` for ZIP, `ffprobe` via `@ffprobe-installer/ffprobe` for MP4). Split CI into a fast suite (DOM + one small encode) on every push and a heavy suite nightly. Relabel the Phase 11 matrix into **automated** vs **manual (real device)** columns — the current matrix will be read as a green tick that never existed.

### H9 — AGPL execution gaps beyond "add a LICENSE and a footer link"

The licence choice is ratified. Its execution is not thought through.

| Gap | Why it bites | Fix |
|---|---|---|
| The footer "Source" link points at *the repository* | GPLv3 §6 requires the Corresponding Source **for the object code you conveyed**. `main` moves; a visitor on Tuesday's deploy cannot get Tuesday's source from Thursday's `main`. | Link to the exact revision: read `VERCEL_GIT_COMMIT_SHA` into `NEXT_PUBLIC_SOURCE_COMMIT` at build time and render `…/tree/{sha}`. One line, removes the whole ambiguity, and dissolves `phase-02` open question 1. |
| The vendored fork's modifications carry no change notices | GPLv3 §5(a). | Add `vendor/gifski-wasm/CHANGES.md` with dated modification notes to the Phase 2/4 AGPL checklist. |
| Corresponding Source must include the build scripts and toolchain config | A public repo whose `.wasm` is committed but whose Rust build inputs are not pinned is arguably incomplete. | Ties to C5: commit `rust-toolchain.toml`, `Cargo.lock`, and the wasm-pack invocation. |
| **Public repo + CI secrets** | `phase-02` says only *"do not commit any `.env`, key, or credential."* It does not address the actual new attack surface: fork PRs, `pull_request_target`, and any deploy/Sentry/analytics token in GitHub Actions secrets. A public repo means any stranger can open a PR that runs your workflow. | Add to `phase-02` step 9: workflows triggered by `pull_request` must not have access to secrets; never use `pull_request_target` with a checkout of untrusted code; require approval for first-time contributor workflow runs; disable Vercel preview deploys from forks. |
| Font licences | Self-hosting Space Grotesk / Hanken Grotesk / JetBrains Mono means conveying OFL/Apache-licensed binaries. | Add to `NOTICE`. |

Legal sign-off is deferred in `phase-02` open question 1 to *"confirm with a lawyer if this ever becomes contentious."* The research said *"Get a lawyer's sign-off on option B if you choose it."* Contentious is too late; the whole point of pre-launch review is that relicensing after conveyance is not possible. Flagging as a decision the user should make consciously, not a defect.

### H10 — Vercel Hobby prohibits ad-carrying sites; both the locked doc and the research say "free on Hobby"

`tech-stack.md` §7: *"Vercel (Hobby → Pro). Static-heavy site fits the free tier."*
Research B.9 comparison table: *"Cost: Free on Hobby for this workload."*

Vercel's Hobby terms restrict it to non-commercial personal use, and their own guidance names **carrying ads such as Google AdSense** as commercial usage. The site's entire business model is display ads. At launch with `provider = none` this is arguably survivable; **the moment an ad renders, the deployment is in breach**, and enforcement against the only production surface would take the whole product down.

The plan's `phase-11` launch checklist says *"Vercel production deploy"* with no plan tier. `phase-10`'s "activation is later an env-var change" is therefore incomplete — it is an env-var change **plus a paid plan**.

**Fix:** add to `phase-10`'s ad-activation checklist: "Vercel Pro (≈$20/mo) active before `NEXT_PUBLIC_AD_PROVIDER` leaves `none`." Add the correction to the `tech-stack.md` §7 amendment already scheduled in Phase 2, alongside the eslint change.

---

## Medium

| # | Finding | Evidence | Fix |
|---|---|---|---|
| **M1** | The iOS budget makes the flagship tool refuse most realistic input, and nothing measures how often | `phase-04`: iOS = 30 MB → **57 frames at 480×270 ≈ 3.8 s**. `plan.md` line 50 states this openly. Real GIFs people compress are routinely 5-15 s. Downgrading to 320×180 buys 130 frames ≈ 8.7 s — still short, and at a width the "quality" positioning cannot survive. Mobile is the majority of search traffic. No gate, criterion, or telemetry anywhere estimates the refusal rate. | Add to Phase 1: run `planEncode()` over a corpus of ~30 real-world GIFs/clips at each tier and **report the refusal and downgrade rates as a number in the benchmark report**. If iOS refusal is >30%, that is a product decision (accept, or bring the server tier forward) that must reach the user before Phase 5, not after launch. Add refusal telemetry to `phase-04` step 14, which currently logs only container/codec. |
| **M2** | The spike scaffolds a *second* Next app, so G5 proves nothing about the real one | `phase-01` architecture creates `spikes/bench/app/…` on Next 16.3; `phase-02` creates the real app with `proxy.ts`, `[locale]` routing, a CSP with `'wasm-unsafe-eval'`, and `Cache-Control` on `/wasm/*`. **G5 ("worker + `.wasm` loads under Turbopack") is tested in an app that has none of those.** The CSP alone is the most likely thing to break WASM instantiation, and it is absent from the spike. The research's own recommended order was shell **first**, then spike inside it. | Invert: run Phase 2 first (or at least `create-next-app` + CSP + proxy), then mount the harness at a dev-only `/__bench` route inside the real app, as the research specified. This also deletes a whole duplicate scaffold from Phase 1's 2-3d estimate and makes the promoted `scripts/copy-wasm.mjs` a non-event. |
| **M3** | Strict CSP + inline theme script + 100% SSG is unresolved | `phase-02` step 5 adds an inline theme-init script before first paint; step 12 adds a CSP. Nonces require per-request rendering, which contradicts *"Every route statically prerenderable; a non-static tool page is a build failure."* | Use a **SHA-256 hash** of the inline script in `script-src`, generated at build time, and say so in `phase-02`. Otherwise either the CSP has `'unsafe-inline'` (defeating it) or FOUC returns. |
| **M4** | Goal 2 promises offline capability that no phase builds | `plan.md` Goal 2: *"9 tool pages where each one actually works end-to-end, **offline-capable after first load**"*. `grep` for service worker / PWA / `sw.ts` across all 12 plan files: **zero hits.** | Delete the claim, or add a Phase 10/11 task for a minimal Workbox/`next-pwa` precache of the shell + `.wasm`. Do not ship a goal nobody implements — it will also end up in marketing copy. |
| **M5** | Phases claimed independent share files | Phase 5 and Phase 9 **both** list `src/components/content/faq-accordion.tsx` and `related-tools.tsx` as *Create*. Phase 5 creates `src/components/seo/tool-jsonld.tsx`; Phase 9 creates `src/lib/seo/jsonld.ts` — two JSON-LD implementations. Phases 6, 7 and 8 all *Modify* `src/lib/media/**` and `registry.ts` while `plan.md` line 81 says they *"are independent of each other."* | Assign single ownership: `faq-accordion`, `related-tools`, all JSON-LD → Phase 9 (or Phase 3), consumed by 5-8. Change "independent" to "sequential, in any order" — accurate for a solo dev and prevents a future team run from colliding. |
| **M6** | The error taxonomy routes users to a product that does not exist | `phase-04` error table: `decode-failed` → *"Offer the ffmpeg fallback (consent-gated), **or Pro**."* `plan.md` line 17: *"Pro and API are explicitly out of scope."* `phase-07` even calls this out for a different message: *"the Pro upsell it was meant to route to does not exist in MVP."* Also `phase-04`'s `planEncode()` refusal copy inherited from research says *"use PZGIF Pro."* | Sweep every recovery string for "Pro". Replace with the concrete alternatives Phase 7 already worked out (trim it, smaller width, desktop browser). Add "no reference to Pro" to the Phase 11 copy audit. |
| **M7** | Auto-fit's memory story contradicts Phase 4's own rule | `phase-08` risk: *"Each attempt must release its buffers before the next."* `phase-04` step 8: gifski's *"`WebAssembly.Memory` never shrinks"* → terminate and respawn per job. Releasing JS buffers does **not** release the WASM heap high-water mark, so 5 attempts in one worker monotonically grows toward the iOS ceiling. | Restate: each auto-fit attempt spawns and terminates its own encode worker. Note the ~50-150 ms respawn + instantiate cost per attempt in the UX budget, and let it argue for the estimator seed (C3) rather than a blind search. |
| **M8** | The downscale path is unspecified, and it is where differentiator #1 dies | `phase-04` step 5 downscales *"inside the sink"*; step 8 says pre-downscale on the JS side. Neither specifies **how**. A single `drawImage` from 1080p to 480px is a low-quality box-ish filter in most engines; aliasing and shimmer on a downscaled GIF will visibly beat any palette-quality advantage gifski provides. G6 compares gifski vs gifenc **on the same frames**, so it cannot detect this. | Specify: `imageSmoothingQuality: 'high'` plus a step-down chain (halve until within 2× of target, then final draw) for ratios >2×. Add it to Phase 1 so G6's frames are produced the way production will produce them — otherwise G6 validates an encoder the product will never feed correctly. |
| **M9** | Verifying the sticker preset needs a Boosted Discord server | `phase-08` success criterion: *"A real GIF sticker upload to Discord has been tested manually before launch."* Custom stickers require server Boost level 1. | Note the prerequisite in `phase-08` (one month of Nitro/Boost, ~$5) and put it on the Phase 11 checklist so it is not discovered in launch week. Same for verifying the 960×540 server banner, which also requires Boost. |
| **M10** | The ad provider gets a runtime switch; the encoder — the actual existential risk — does not | `phase-10`: `NEXT_PUBLIC_AD_PROVIDER=none|adsense`. Nothing equivalent for gifski↔gifenc, despite `plan.md` naming the gifski deadlock **"Existential"**. | Add `NEXT_PUBLIC_GIF_ENCODER=gifski|gifenc` read by `capability.ts`, plus the per-job automatic fallback from C4. Cost: near zero. Value: turns a production deadlock from a redeploy-under-pressure into a config flip. |
| **M11** | "Reuse the wireframe microcopy verbatim" is contradicted by the plan four times | `plan.md` line 24 says microcopy is production copy, *"reuse it verbatim"*. The plan then overrides it for: the two speed claims (Phase 1/5/7), the footer's cut tools (Phase 3/9), `680×240` and the byte limits (Phase 8), and the "150 MB / 50 MB / 60 s" limits (Phase 11). | Downgrade the blanket instruction to *"the wireframe is the voice reference; every number and claim in it is unverified until the Phase 11 copy audit clears it."* As written, an implementer following line 24 literally will ship all four defects. |

---

## Low

| # | Finding | Fix |
|---|---|---|
| L1 | `plan.md` architecture summary says *"SSG shells only — **zero server work at request time**"*, but `proxy.ts` (next-intl `as-needed`) runs on every matched request at the edge. | Reword to "no per-request data fetching; one edge rewrite." |
| L2 | Plan G1 watchdog is 5× median; research specified 10×. Plan G6 is "by eye, one human"; research specified SSIM/butteraugli **plus a 3-person blind test against native gifski 1.35**. Plan's main-thread budget is 200 ms; research gate G7 was **<50 ms**. All three weaken the research without stating why. | Either adopt the research thresholds or record the justification. The 50→200 ms weakening is the one that matters: 200 ms is the INP *failure* threshold, not a task budget. |
| L3 | `navigator.deviceMemory` is absent in Firefox as well as Safari, so Firefox desktop users fall into the 500 MB "Desktop" tier by default. | Treat "deviceMemory undefined + desktop UA" as the 200 MB conservative tier. |
| L4 | `design-guidelines` §5.10's `.ad-slot::before` uses `position:absolute` but `.ad-slot` declares no `position: relative`. The label will position against the nearest positioned ancestor. | Add `position: relative` when porting in Phase 3. |
| L5 | No input sniffing: a file renamed `.gif` that is actually MP4 reaches `modern-gif` and throws into the generic `decode-failed` bucket. | Read magic bytes in the dropzone/probe stage and route to the correct tool via the registry — the plan's own "never a dead end" rule already implies it. |
| L6 | `pzgif.com` unpurchased; `phase-11` risk note jokes about domain availability. `metadataBase` and every canonical/sitemap URL depend on it. | Buy it in week 1. $12. It is the cheapest risk in the plan to close. |

---

## Direct contradictions, collected

| Contradiction | Where |
|---|---|
| No COOP/COEP anywhere ↔ Phase 1 uses an API requiring cross-origin isolation | `plan.md` L28-30 vs `phase-01` step 6 |
| 31 serial days ↔ "4-5 weeks solo" (20-25 days) with no parallel capacity | `plan.md` L138 |
| "Phase 1 blocks only Phase 4 onward" ↔ Phase 3's threshold needs Phase 1 numbers | `plan.md` L38 vs `phase-03` OQ1 / risk table |
| Phase 1 calibrates "the settings ranges the UI exposes" ↔ ranges defined in Phases 5-8 | `phase-01` SC vs `phase-05..08` |
| "One worker entry point" ↔ "terminate and respawn the **encode worker** per job" ↔ research's mandatory two-worker split | `phase-04` SC vs step 8 vs research §C10 |
| "No progress value is synthesised" ↔ a weighted 0.05/0.55/0.40 composite | `plan.md` SC vs `phase-04` |
| Pro is out of scope ↔ two error recoveries route to Pro | `plan.md` L17 vs `phase-04` error table |
| "Reuse wireframe microcopy verbatim" ↔ four documented corrections to that microcopy | `plan.md` L24 vs Phases 1/3/8/9/11 |
| Phase 9 deps `[3]` ↔ criteria requiring pages built in 5-8 | `phase-09` |
| Phase 10 deps `[3,9]` ↔ criteria requiring a real encode and all routes | `phase-10` |
| `faq-accordion.tsx` / `related-tools.tsx` created by both Phase 5 and Phase 9 | `phase-05` / `phase-09` file lists |
| Auto-fit "release buffers between attempts" ↔ "WASM memory never shrinks, terminate per job" | `phase-08` risk vs `phase-04` step 8 |
| Goal 2 "offline-capable after first load" ↔ no service worker in any phase | `plan.md` Goals |
| `tech-stack.md` §7 "free tier" + research "free on Hobby" ↔ Vercel Hobby bans ad-carrying sites | `tech-stack.md` / research B.9 |
| Research G7 <50 ms main-thread ↔ plan's 200 ms | research §D vs `phase-10`/`phase-11` |
| Research G3 "Chrome + Firefox + WebKit, nightly in CI forever" ↔ plan G1 unspecified browsers, no nightly | research §D vs `phase-01` G1 |
| Research fixtures f9 (odd dims) + f10 (rotated) ↔ absent from the plan's matrix | research §D vs `phase-01` |
| `design-guidelines` §5.12 mandates `hidden="until-found"` ↔ unsupported in Safari, fails closed | §5.12 vs caniuse |

---

## What I could not fault

The gate structure is real: G1/G6 are correctly identified as the two findings that can invalidate the architecture and the AGPL cost respectively, and both are placed before any dependent code. The memory model is right — reasoning from `frames × w × h × 4` rather than input file size, with admission control before decode rather than an OOM catch after, is the correct inversion and it is applied consistently across Phases 4, 6, 7 and 8. The scaled-content defence (structure in `registry.ts`, prose hand-written per tool, no merging) is a genuine architectural constraint rather than a slogan, and the refusal to emit `FAQPage` or a fabricated `aggregateRating` is the right call for a site whose only channel is organic search. The Discord preset corrections, the per-preset budgets with no shared `MAX_BYTES`, and the refusal to print undocumented limits as facts are all better than the locked documents they replace. Launching at `provider = none` is correct and honestly reasoned.

---

## Unresolved questions

1. **Who writes the Rust?** C5 has no owner. If the answer is "nobody, yet", the fork must move to post-launch and Phase 4 must ship the interim progress model as the plan of record, not the fallback.
2. **What is the actual timeline ceiling?** C1 says 11-16 weeks solo against a stated 4-5. If a hard ceiling exists, which of (fork / Discord dedicated pages / `webp-to-gif` + `split-gif-into-frames`) is cut? This needs a user decision before Phase 1.
3. **Estimator: measured-sample or accept a range?** C3. The answer changes Phase 4's scope, Phase 8's auto-fit reliability, and whether the ±25% criterion survives at all.
4. **What iOS refusal rate is acceptable?** M1. If `planEncode()` refuses >30% of realistic mobile inputs, that is a product-shape question (accept it and say so in copy, or pull the server tier forward), not an engineering one.
5. **Does `modern-gif` composite disposal methods, and does it run inside a worker without DOM?** Both assumed. The research verified neither and explicitly listed it as unresolved (#10). If it returns un-composited sub-rectangles, a `compositeFrames()` implementation is unbudgeted work on the product's highest-volume input path — and the same compositor would be needed for the WebP ANMF path.
6. **Does the AGPL decision get legal sign-off before conveyance?** The research asked for it; the plan defers it to "if this ever becomes contentious."
7. **Which real Android and iPhone models exist for testing?** `phase-11` OQ1 already asks. Phase 1's G3/G4 depend on the answer and Phase 1 starts first.
