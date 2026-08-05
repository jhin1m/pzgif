---
title: "PZGIF MVP - 9 browser-native GIF tools + Discord presets"
description: "Ship pzgif.com MVP: 9 client-side GIF tools + a Discord preset cluster, on Next.js App Router with a WebCodecs to gifski-wasm pipeline that never requires cross-origin isolation."
status: in-progress
priority: P1
effort: "11-16 weeks solo (see timeline note)"
tags: [nextjs, webcodecs, wasm, seo, ads, mvp]
created: 2026-08-05
blockedBy: []
blocks: []
---

# PZGIF MVP — 9 browser-native GIF tools + Discord presets

## Overview

Build and launch the PZGIF MVP: a browser-native GIF toolset (ezgif competitor, global/English) where **every free-tier operation runs inside the user's tab** — no upload, no account, no server in the loop. Revenue is display ads first; Pro and API are explicitly out of scope.

Two documents are **approved and locked** and govern this plan. Where this plan and those documents disagree, those documents win:

- `docs/tech-stack.md` — architecture, library choices, rejected alternatives
- `docs/design-guidelines.md` — tokens, component states, ad-slot law, a11y

`docs/wireframe/*.html` is the **visual source of truth**, and the microcopy inside it is the **voice reference for production copy**. But **every number and factual claim in it is unverified until the Phase 11 copy audit clears it** — the wireframes contain at least four documented defects (two unbacked speed claims, cut tools in the footer, wrong Discord dimensions, and mobile limits contradicted by the memory model). An implementer who reuses the copy literally will ship all four.

### The single constraint that governs everything

**No page may be cross-origin isolated.** `COEP: require-corp` breaks Google ad serving; `COEP: credentialless` is unsupported in Safari. Multi-threaded WASM needs `SharedArrayBuffer`, which needs isolation — so it is out permanently.

> Any change that introduces `SharedArrayBuffer`, `COOP`, or `COEP` is breaking the revenue model. Reject it in review.

### Scope decisions taken at planning time (user-ratified 2026-08-05)

| Question | Decision |
|---|---|
| Discord route shape | **1 hub + 4 dedicated pages.** `/gif-for-discord` (chip picker, as wireframed) plus `/discord-emoji-gif`, `/discord-sticker-gif`, `/discord-banner-gif`, `/discord-avatar-gif`. Same engine and component, different default preset and hand-written copy. |
| Tool count | **Exactly 9 tools + the Discord cluster.** `GIF → WebP` and the Slack preset appear in the wireframe footer but are **cut**; the footer must be corrected. |
| Benchmark gate | **Scoped gate.** Phase 1 blocks all media-engine work (Phase 4 onward), but not the design system, content or legal work. It now runs *after* Phase 2 rather than beside it, because the harness must sit inside the real app — see the Phases note below. |
| Domain | **`pzgif.com` purchased 2026-08-05.** Phase 2 day 1 puts it on Cloudflare with a real holding page and verifies Search Console — a registered-but-parked domain earns no index age. |
| Ads | **Slots + CMP + legal pages ship in MVP; no ad network is activated at launch.** The user is *not committed to Ezoic* — and research then confirmed Ezoic has required **250,000+ monthly active users since 2026-02-19**, so it is unreachable regardless. The ad layer is a **swappable provider interface** launching with `provider = none`. |

### Decisions taken after research (user-ratified 2026-08-05)

Research surfaced four facts that the locked documents did not know. Each forced a decision:

| Finding | Decision |
|---|---|
| `gifski-wasm` is **AGPL-3.0-or-later**, and client-side delivery is *conveyance* — shipping it in a closed-source ad-supported bundle violates the licence | **Publish the PZGIF client bundle under AGPL-3.0.** The $950/yr commercial licence was rejected. Consequence: public repo, `LICENSE` + `NOTICE`, a "Source" link in the footer, and any future closed-source server tier must be a genuinely separate work. Side benefit: it also resolves `@ffmpeg/core`'s GPL-2.0-or-later obligation |
| **Safari has no `ImageDecoder`**, any version (confirmed absent from WebKit source), and Firefox only from 133 — while 6 of 9 tools take GIF input | **Use `modern-gif@2.1.0` (MIT) on every browser.** One decode path, no Safari special case. Trade-off: `modern-gif`'s performance is unbenchmarked, so Phase 1 must measure it |
| `mp4-muxer` and `webm-muxer` are **deprecated by their own author**; `webm-demuxer` does not exist on npm | **Adopt `mediabunny@1.52.3` (MPL-2.0)**, replacing `mp4box.js` + both muxers. Its `CanvasSink` also bounds decode memory for free. `docs/tech-stack.md` §4 is amended in Phase 2 |
| `tech-stack.md`'s "mobile: ~50 MB, up to 60 s" is wrong — the binding constraint is decoded RGBA, and gifski holds **2× all frames**. On an iPhone SE 3 that is ~57 frames at 480×270, i.e. **~3.8 s of GIF** | **Device-class frame-buffer budgeting** with admission control before decode, and honest copy. Limits are computed from `frames × w × h × 4`, never from input file size |

### Decisions taken after Phase 1 measurement (user-ratified 2026-08-05)

Gate G8 measured an **80% iOS refusal rate** against a pre-committed ~30%
escalation threshold — the trigger `phase-01` set specifically so this reached
the operator before Phase 5 rather than after launch. Everything that passes on
iOS is an existing small GIF; every video input is refused. Full numbers in
`plans/reports/from-bench-spike-to-planner-pipeline-measurements-report.md`.

| Finding | Decision |
|---|---|
| iOS refuses 80% of realistic inputs, all of them video | **On iOS, ship the GIF-input tools; do not ship video → GIF.** The alternative — pulling the server tier forward — was rejected: it contradicts the "every free-tier operation runs in the tab" premise the whole product is built on, and it is not a launch-scope change |

**This is broader than one tool.** `registry.ts` shows video input reaching six
routes, not one:

- `mp4-to-gif` — the dedicated tool, video-only input. **Unavailable on iOS.**
- `gif-for-discord` and all four dedicated Discord routes accept
  `gif, mp4, webm, mov`. **Their video path is unavailable on iOS; their GIF path
  works.** The Discord cluster is differentiator #2 and ships in Ship 1, so this
  is not a footnote.

The other eight tools take GIF or WebP input and are unaffected.

**What this obliges, by phase:**

| Phase | Obligation |
|---|---|
| 4 | `capability.ts` classifies the device *before* a file is accepted. An iOS visitor offering a video is refused up front with a real reason, never mid-job and never after a decode has started |
| 5 | The tool framework carries a per-tool availability state. "Unsupported on this device" is a designed state with copy, not a thrown error |
| 7 | `mp4-to-gif` ships knowing its iOS visitors cannot use it. The page must say so above the fold rather than letting them upload and fail |
| 8 | The Discord routes degrade to GIF-input-only on iOS instead of appearing broken |
| 11 | Copy audit: no page may imply video conversion works everywhere. The limits caption states the device truth |

**Do not let this become a silent failure.** A refused job with no explanation is
indistinguishable from a broken tool, and iOS Safari is a large share of the
mobile traffic a GIF utility attracts.

**Still unmeasured, and the reason this decision may be revisited:** the 30 MB
iOS budget is a research estimate carrying `measured: false`, and G3 has never
run — there is no iPhone. The direction is safe because the gap is 50 points
wide, but the *exact* boundary is not knowable until the hardware exists.

Gate G6 has **not** been decided — the blind-judging pack is generated and
pre-registered but unscored, so whether gifski is visibly better than `gifenc`
at matched bytes remains open, and with it whether the AGPL obligation buys
anything. Phase 4 proceeds with gifski on the pre-existing assumption; the
pre-committed reversal in `phase-01` stands if judging later fails.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 0 | **Core hypothesis (the falsifiable one):** long-tail GIF-utility queries can be won by a new domain on the strength of (i) visibly better output and (ii) platform-preset UX no competitor offers. Everything below is in service of testing this | P1 |
| 1 | Prove the WebCodecs → gifski-wasm pipeline on real devices before any product code depends on it | P1 |
| 2 | Ship 9 tool pages where each one actually works end-to-end, and still works on reload with the network off (service worker, Phase 2) | P1 |
| 3 | Ship the Discord preset cluster with the auto-fit size-budget UX — differentiator #2, no competitor equivalent | P1 |
| 4 | Zero cumulative layout shift with ad slots reserved from first paint (CLS < 0.1 is a ranking input) | P1 |
| 5 | WCAG 2.1 AA on every shipped page, verified by keyboard and screen-reader passes, not by assertion | P1 |
| 6 | Every page carries genuine hand-written explainer copy — never a template fill — to stay clear of Google's scaled-content-abuse policy | P1 |
| 7 | Ad slots, CMP and legal pages in place so a network can be switched on later without a layout rewrite | P2 |
| 8 | Prove gifski output quality visibly (before/after with real byte counts) on every compress/convert result | P2 |

## Phases

**Execution order is 2 → 1 → 4 → 5 → …, not the file numbering.** Phase 2 runs first: the benchmark harness must be mounted inside the *real* app at a dev-only route, not in a second scaffold. Gate G5 exists to prove the worker + `.wasm` boot path works — and the most likely thing to break WASM instantiation is the CSP, which only exists in the real app. A spike in a bare scaffold would prove nothing about production. File numbers are kept stable so links and task IDs do not churn.

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 2 | [Project Shell and Tooling](./phase-02-project-shell-and-tooling.md) | Code complete 2026-08-05 · infra pending | — |
| 1 | [Benchmark Spike and Architecture Gate](./phase-01-benchmark-spike-and-architecture-gate.md) | Desktop gates complete 2026-08-05 · G3 blocked on hardware · G6 awaiting judges | 2 |
| 3 | [Design System and Layout](./phase-03-design-system-and-layout.md) | Code complete 2026-08-05 · browser suite unrun | 2 (+ 1 for the before/after fallback threshold only) |
| 4 | [Media Engine Core](./phase-04-media-engine-core.md) | Code complete 2026-08-05 · browser suite unrun | 1 |
| 5 | [Tool Framework and GIF Compressor](./phase-05-tool-framework-and-gif-compressor.md) | Complete 2026-08-05 · output decoded and verified in-browser | 3, 4 |
| 6 | [GIF-to-GIF Tools](./phase-06-gif-to-gif-tools.md) | Pending | 5 |
| 7 | [Cross-Format Tools](./phase-07-cross-format-tools.md) | Pending | 5 |
| 8 | [Discord Preset Pages](./phase-08-discord-preset-pages.md) | Pending | 5 |
| 9 | [Content SEO and Legal](./phase-09-content-seo-and-legal.md) | Pending | 3 |
| 10 | [Ads Consent and Analytics](./phase-10-ads-consent-and-analytics.md) | Pending | 3, 9 |
| 11 | [QA Perf A11y and Launch](./phase-11-qa-perf-a11y-and-launch.md) | Pending | 6, 7, 8, 9, 10 |

Phases 6, 7 and 8 are **sequential in any order** once Phase 5 lands — they are not truly independent, because all three modify `lib/media/**` and `registry.ts`. For a solo developer that distinction is academic; it matters if the work is ever parallelised.

**File ownership, to stop two phases creating the same file:** shared content components (`faq-accordion`, `related-tools`) and *all* JSON-LD belong to Phase 9 (or Phase 3) and are consumed by Phases 5-8. Per-tool prose belongs to the phase that ships that tool. Phase 9 owns the homepage, the non-tool content pages, legal pages and the SEO machinery — not the tool pages' explainers.

## Architecture summary

```
app/                      SSG shells — no per-request data fetching; one edge rewrite (proxy.ts)
  (tools)/<slug>/         9 tool routes
  (presets)/              gif-for-discord hub + 4 dedicated preset routes
  (legal)/                terms · privacy · cookies · acceptable-use · about
components/
  ui/                     shadcn primitives (Radix)
  tool/                   Dropzone · FileChip · SettingsPanel · ProgressBar ·
                          ResultPanel · BeforeAfterSlider · StickyActionBar
  ads/                    AdSlot (visual) + provider interface (no network at MVP)
lib/
  media/                  THE ENGINE — all of it inside a Web Worker
    decode/               gif (modern-gif, all browsers) · video (mediabunny) · webp
    ops/                  resize · crop · speed · reverse · frame-select (OffscreenCanvas)
    encode/               gifski-wasm (vendored fork) · webp · video (mediabunny) · png-zip (fflate)
    job-controller.ts     progress protocol, cancel, error taxonomy
    estimate.ts           output-size prediction (drives the live "≈ 1.8 MB" readout)
    autofit.ts            Discord budget search
    capability.ts         runtime feature detection → fallback routing
  tools/registry.ts       ONE typed source for routes, nav, footer, related tools, sitemap
content/                  hand-written per-tool copy + FAQ (NOT generated from a template)
```

**Key structural rule:** `lib/tools/registry.ts` owns *structure* (slugs, formats, relationships). It must never own *prose*. Prose lives in per-tool content modules and is written by hand, because template-filled copy across 14 near-identical pages is exactly what Google's scaled-content-abuse policy penalises — and that penalty is site-wide, not per-page.

## Success Criteria

- [ ] Phase 1 benchmark report exists with **measured** numbers on desktop Chrome, desktop Safari and a mid-range Android; the architecture is explicitly passed or failed against them
- [ ] All 9 tools + 5 Discord routes produce a correct downloadable output from a real fixture file, asserted in Playwright by **decoding the output**, not by checking the DOM
- [ ] No `SharedArrayBuffer`, `COOP` or `COEP` anywhere; a CI check greps for them and fails the build
- [ ] CLS = 0 on every route in a Lighthouse run with ad slots reserved and unfilled
- [ ] Keyboard-only pass and VoiceOver + NVDA pass on the compressor job flow; no horizontal scroll at 320px; readable at 200% zoom
- [ ] Every progress value derives from a real counter — a decoded-frame index or an encoder callback. Stage weighting is permitted and calibrated per job type; **time-based interpolation, simulated ramps and invented percentages are not.** A `ProgressBar` whose API cannot express an interpolated value, plus a test that the rendered width equals the passed value exactly
- [ ] A runtime encoder switch (`gifski` ↔ `gifenc`) exists, plus an automatic per-job fallback — so a production deadlock is a config flip, not a redeploy under pressure
- [ ] Every tool page ships at least 400 words of hand-written explainer plus a FAQ present in the SSG HTML and crawlable
- [ ] Legal pages (Terms, Privacy, Cookie, Acceptable Use, About) live, and a Google-certified CMP wired with Consent Mode v2
- [ ] Unverified speed claims are removed from copy or replaced with Phase 1's measured figures
- [ ] Lighthouse performance at least 95 on a tool page at first paint; INP under 200 ms while a job runs

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **gifski-wasm can deadlock** — open upstream issue #5, maintainer attributes it to "hacks I implemented to get this to compile" | **Existential** — the encoder hangs and the job never completes | Phase 1 gate G1 soak-tests 1000 consecutive encodes. Phase 4 vendors the fork, which is where a fix lands. A worker watchdog converts a hang into a reported error rather than a frozen tab |
| **A service worker can silently kill the whole media engine** (found and fixed in Phase 5, 2026-08-05) | **Was blocking** — no tool could produce a file, for repeat visitors only, with no error anywhere | Turbopack identifies each worker by URL *fragment*; the Cache API strips it, so the encode worker was served the pipeline worker's response and never booted. `public/sw.js` now bypasses `request.destination === "worker"`, and `service-worker-policy.test.ts` locks it. **The general lesson stands: any caching layer that keys on a stripped URL can break a fragment-identified worker.** Re-check whenever the bundler or the service worker changes |
| gifski output is not *visibly* better than `gifenc` at matched bytes | Differentiator #1 is fiction, and the AGPL obligation buys nothing | Phase 1 gate G6 judges it by eye on real fixtures. Escalate before Phase 4 if it fails |
| `modern-gif` decode is too slow or mishandles frame disposal | The product's highest-volume input path degrades everywhere | Chosen on maintenance grounds, unbenchmarked. Phase 1 measures it. Fallback is a dual path with `ImageDecoder`, which reintroduces the complexity the single-path decision avoided |
| gifski holds all frames resident (2× copy, cannot stream) | OOM on long or large GIFs, worst on iOS | Admission control refuses over-budget jobs **before** decoding, with concrete alternative settings. Never an OOM mid-job |
| Output-size estimator ("≈ 1.8 MB") is inaccurate | Erodes trust — it is a headline feature on 2 wireframes | Calibrate against Phase 1 fixture data; always label as an estimate; never state it as a promise |
| Auto-fit search runs up to 5 real encodes on mobile | Slow, battery-hungry, may OOM | Cap attempts by device class; start from a calibrated seed instead of a blind search; Cancel always available |
| 4-5 week realistic estimate vs the 2-4 week expectation | Timeline miss | Flagged below. Phases 6/7/8 are the natural cut line |
| No ad network activated at launch → zero revenue | Business | Accepted by the user. Slots and CMP ship so switching one on later is a config change |

## Honest timeline note

The 2-4 week expectation recorded at bootstrap is **wrong by a wide margin**, and the first version of this plan's own "4-5 weeks" was wrong too — it assumed a solo developer could overlap hands-on measurement with hands-on building, which one person cannot do.

Adversarial re-estimation puts the serial total at **54-82 working days, i.e. 11-16 weeks solo**:

| Phase | Estimate | Why more than first thought |
|---|---|---|
| 2 Shell | 2-4d | Domain, CSP, licences, service worker, CI |
| 1 Spike | 6-9d | Fixture authoring is a day on its own; the calibration sweep is thousands of encodes |
| 3 Design system | 6-8d | It is 18 components with full state matrices, not 12. `BeforeAfterSlider` alone is 1-1.5d |
| 4 Engine | 10-16d | Four decoders, four encoders, worker protocol, admission control, estimator, plus the Rust fork |
| 5 Framework + compressor | 4-6d | |
| 6 GIF→GIF ×4 | 4-6d | |
| 7 Cross-format ×4 | 6-8d | Trim UI and the WebP gap |
| 8 Discord ×5 | 4-6d | |
| 9 Content + SEO + legal | 4-6d | Now includes 6-10 non-tool content pages |
| 10 Ads + consent + analytics | 3-4d | |
| 11 QA + launch | 5-9d | Currently carries zero buffer for the defects it exists to find |

## Delivery: incremental ships, not one launch (ratified 2026-08-05)

A single 14-page launch at week 11-16 wastes the thing that actually compounds — index age — and contradicts this plan's own advice to launch in batches and watch Search Console. The work ships in stages instead.

The key realisation: **the content, legal and SEO layer needs no media engine at all.** It can go live in week 1 while the engine is still being built, which starts the index clock months earlier than the engine could.

| Ship | When | Contents | Why this grouping |
|---|---|---|---|
| **Ship 0** | **Week 1-2** | Domain live · 6-10 non-tool content pages · all legal + About + Contact · SEO machinery · reserved ad slots · consent · page chrome | Starts index age immediately, builds the AdSense evidence pack, and makes the gifski comparison page exist before anything depends on it. Phase 2 + Phase 9 + the chrome half of Phase 3 + Phase 10 |
| **Ship 1** | **~Week 7-9** | GIF Compressor · Discord hub · Discord emoji page | The first real test of the core hypothesis: visibly better output, plus preset UX. Phases 1, 3, 4, 5, and the hub half of 8 |
| **Ship 2** | +1-2 weeks | Resize · Crop · Speed · Reverse | Phase 6 |
| **Ship 3** | +1-2 weeks | The four dedicated Discord pages | Rest of Phase 8 |
| **Ship 4** | +2 weeks | MP4→GIF · GIF→MP4 · Split to frames · WebP→GIF | Phase 7, the heaviest and least certain |

Be honest about Ship 1's date: Phases 2+1+3+4+5 total 28-43 working days before a single tool page can exist. The business review's "Ship 1 at week 4-5" assumed a lighter engine than the one the technical review priced. **Ship 0 at week 1-2 is what delivers the early-indexing benefit** — Ship 1 arriving at week 7-9 is simply what the engine costs.

Phase 11's QA and launch gate **runs once per ship**, scaled to what that ship contains — not once at the end.

Between ships: watch Search Console, verify indexing, and let real traffic reorder the remaining ships. If Ship 2's four tools show no impressions after three weeks, that is information about whether Ships 3 and 4 are worth building as planned.

## Corrections to the locked documents

Research proved several statements in the approved documents factually wrong. These are amended, with dated changelog entries, inside the phases that own them — not silently accommodated.

| Doc | Says | Reality | Fixed in |
|---|---|---|---|
| `design-guidelines.md` §10 | Preset "Banner 680×240" | **Matches no Discord surface.** Server banner is 960×540; profile banner ~600×240 (community, undocumented) | Phase 8 |
| `design-guidelines.md` §10 | All presets target "under 256 KB" | 256 KB is **emoji only**. Sticker is 512 KB; Slack emoji 128 KB; banners/avatars have no published limit | Phase 8 |
| `design-guidelines.md` §10 | (omits) | Sticker also caps at **5 s** and **60 FPS**; both are hard rejection criteria | Phase 8 |
| `design-guidelines.md` §10 | "FAQ accordion (schema.org `FAQPage`)" | FAQ rich results were **removed from Search on 2026-05-07**, docs deleted 2026-06-15. Keep the FAQ UI, drop the JSON-LD | Phase 9 |
| `tech-stack.md` §6 | "Ezoic accepts new/small tool sites" | Ezoic has required **250,000+ MAU since 2026-02-19**. The launch monetisation premise is void | Phase 10 |
| `tech-stack.md` §4 | `mp4box.js` + WebM demuxer + muxer; `ImageDecoder` for GIF; 150 MB/50 MB limits | Replaced by `mediabunny`; `modern-gif` everywhere; frame-buffer budgets | Phase 2 |
| `tech-stack.md` §7 | CI `typecheck → lint → …` via build | Next 16 **removed `next lint`**; CI needs an explicit `eslint` step | Phase 2 |

## Open questions

Tracked live at the end of each phase file. Blocking ones at plan time:

1. **Does the gifski single-thread path deadlock?** Unverified — upstream issue #5 concerns "channels and/or threads", and gifski uses `crossbeam-channel` even without rayon. **Blocks Phase 4.** Gate G1 answers it
2. **Is gifski visibly better than `gifenc` at matched bytes?** The entire positioning and the AGPL obligation rest on yes. **Blocks Phase 4.** Gate G6 answers it
3. **How fast is `modern-gif`?** Unbenchmarked; it was chosen for maintenance, not measured speed. Phase 1 answers it
4. **Animated WebP on Safari** has no maintained library and no `ImageDecoder`. Phase 7 resolves it by building a ~150-line RIFF/ANMF splitter so the page works everywhere. **A knowingly-broken ranking page is not an option** — if the splitter is not built, the page and its sitemap entry are cut instead (it is in Ship 4, the last and most cuttable)
5. **The gifski Rust fork is deferred past launch** (ratified 2026-08-05). MVP ships the unforked encoder with honest progress — determinate through decode, a clearly labelled encode stage with an elapsed timer, no invented percentage. Revisit after launch with real data, or immediately if gate G1 exposes a deadlock, in which case it gets its own budget rather than being absorbed into Phase 4
6. **If G6 fails, does the project continue?** The pre-registered decision tree in Phase 1 says reposition on presets, privacy and the size-budget UX. **Still open** — the judging pack is generated and pre-registered but unscored, so Phase 4 proceeds on the assumption gifski wins while already paying the AGPL cost for it
7. Who is the named operator on the About page? Required before any ad-network application, the Contact page, GDPR controller identification, and a DMCA agent if one is ever needed
8. Which real devices exist for gates G3/G4? The whole memory model rests on an iPhone SE 3-class floor. Without that hardware the budgets are unvalidated fiction. **Still open and now more urgent:** G4 ran on desktop only and found no ceiling below 732 MB; G3 never ran. The iOS scope decision above was taken on an *estimated* budget, so the hardware decides where the boundary falls, not whether there is one
9. Does Journey by Mediavine work on Next.js? It is the only fallback if AdSense rejects. One email, and it should be sent in week 1

<!-- slug: pzgif-mvp-9-browser-native-gif-tools-discord-presets -->
