---
phase: 11
title: "QA Perf A11y and Launch"
status: pending
priority: P1
effort: "5-9d"
dependencies: [6, 7, 8, 9, 10]
---

# Phase 11: QA Perf A11y and Launch

## Overview

The gate that runs **once per ship**, not once at the end: cross-browser and real-device verification, accessibility passes performed by a human rather than asserted, performance budgets, a copy audit against unverified claims, and the launch checklist.

The recurring failure mode this phase exists to prevent is **shipping something that passes CI but does not work on a real phone**.

### Per-ship scaling

| Ship | What this gate covers |
|---|---|
| **Ship 0** (content, legal, SEO — week 1-2) | No engine exists yet. Run: CLS on every route with reserved unfilled ad slots, the consent-banner layout check at 375×667, keyboard and screen-reader passes on the chrome and the FAQ accordion (**including the Safari `hidden="until-found"` case**), Lighthouse, and the legal/About/Contact checklist. Skip everything device- and encoder-related |
| **Ship 1** (compressor + Discord hub) | The full matrix below, restricted to the shipped routes. This is the first ship where real-device testing and decoded-output assertions matter, and where the copy audit has real claims to check |
| **Ships 2-4** | Regression pass plus the new routes. The a11y and copy work is per-page, so it recurs; the device matrix mostly does not |

The launch checklist below is completed in full at Ship 1 and re-verified, not re-derived, afterwards.

## Requirements

**Functional**
- Every tool verified end to end on desktop Chrome, desktop Safari, and a real mid-range Android and iPhone
- Full E2E suite asserting on **decoded output**, never DOM state alone
- Visual regression on `/dev/states`
- Launch checklist completed and signed off

**Non-functional**
- CLS 0, INP ≤ 200 ms p75 during an encode, LCP ≤ 2.5 s on the dropzone
- WCAG 2.1 AA verified by keyboard-only and screen-reader passes

## Architecture

### The test matrix

| Surface | Chrome desktop | Safari desktop | Firefox desktop | Android Chrome | iOS Safari |
|---|---|---|---|---|---|
| 5 GIF→GIF tools | ✔ | ✔ | ✔ | ✔ | ✔ |
| MP4→GIF, GIF→MP4 | ✔ | ✔ | ✔ | ✔ | ✔ |
| Split to frames | ✔ | ✔ | ✔ | ✔ | ✔ (at the frame cap) |
| WebP→GIF | ✔ | **documented unsupported state** | ✔ (133+) | ✔ | **documented unsupported state** |
| 5 Discord routes | ✔ | ✔ | ✔ | ✔ | ✔ |

Firefox Android is out of scope for video tools — it has no `VideoDecoder`/`VideoEncoder` at all. Verify only that it shows the honest unsupported message.

**Playwright's WebKit is not Safari, and neither is iOS Safari.** They differ in codec availability, memory ceilings, and shipped API surface — precisely the dimensions this product depends on. Automated WebKit runs are a regression net, not evidence. Every ✔ in the Safari and iOS columns above requires a **manual pass on real Safari and a real iPhone**. Mark automated-only coverage as such in the results rather than letting a green CI run imply device coverage it never had.

Also verify explicitly on Safari: **an FAQ accordion item actually opens.** `hidden="until-found"` is unsupported there and fails closed, so a regression in the Phase 3 progressive-enhancement path would silently break the FAQ on every page.

### Accessibility — performed, not asserted

Automated checks catch a minority of real issues. Required manual passes:

1. **Keyboard-only** through the full compressor job flow: dropzone → settings → run → cancel → run → before/after slider → download. No trap, no unreachable control, visible focus at every step.
2. **VoiceOver (macOS/iOS)** and **NVDA (Windows)** on the same flow. Progress announcements arrive at 25% boundaries, not every tick; the visible percentage is not double-announced; completion announces the real numbers.
3. **200% zoom at 375px** — text reflows, nothing clipped, no horizontal scroll.
4. **320px width** — no horizontal scroll anywhere.
5. **Forced-colors mode** — focus rings survive (this is why `design-guidelines.md` §5 forbids shadow-only rings).
6. **`prefers-reduced-motion`** — the indeterminate progress shuttle becomes a static labelled track, the success bounce becomes an instant swap, the before/after drag is unaffected.

### Copy audit — the last chance to catch a claim we cannot back

**Work through the full 27-row claim table in `plans/reports/from-planner-to-red-team-pzgif-mvp-scope-and-business-review.md` §5.** Every row is production copy. Sign each off as kept, amended, or cut. The highlights:

**Dead links — in states whose entire design rule is "never a dead end"**
- `tool-compressor.html` state B points a rejected PNG at "**PNG to GIF**" — a tool that does not exist in the MVP. Point it somewhere real or change the message
- `discord-preset.html` related-tools card offers "**GIF for Slack**" — cut from scope. Remove
- Footer "GIF to WebP" and "GIF for Slack" appear in **all four** wireframe files, not just the homepage

**Unmeasured numeric claims** — each needs Phase 1 data, a hedge, or deletion
- "under ten seconds on a current laptop" (`tool-mp4-to-gif.html`) — unverified since bootstrap. Note "a current laptop" is unfalsifiable, so even a measured figure must carry the device class
- "Shrink file size **up to 80%**" (`index.html`), "**60-85%** is realistic" (`tool-compressor.html` ×2), "roughly **a tenth of the size**" for GIF→MP4 (`index.html`)
- "Save as WebP · **~210 KB** / MP4 · **~145 KB**" (`tool-compressor.html` state E) — estimator output rendered as concrete bytes with **no estimate label**, directly against the plan's own rule
- "Estimated output ≈ **1.8 MB**" — correctly labelled, but at the estimator's tolerance the implied precision misleads. Round to a range

**Claims the plan's own rules forbid**
- `discord-preset.html` FAQ states Nitro/Boost gating rules ("animated emoji slots depend on the server's boost level", "animated banners need Nitro"). Phase 8 bans stating any gating rule because two Discord articles contradict each other. **The FAQ is UI**
- "the presets on this page are **updated when they do**" — an unkeepable maintenance promise from a solo operator, on numbers that changed twice within two weeks of research
- "Discord expects GIF, PNG or JPEG there" — the emoji UI also accepts **WebP**

**Claims about capability that overstate**
- "covers **almost every** phone recording" for HEVC (`tool-mp4-to-gif.html`) — HEVC via WebCodecs is platform- and hardware-dependent. Gate on gate G7's measured coverage
- "Unusual containers fall back to a slower path that loads on demand" — the ffmpeg fallback is consent-gated, **never offered on iOS**, and may be deleted entirely if telemetry says under 2%
- "Turning off your connection after the page loads also works" — true only once the Phase 2 service worker ships. Verify it, or cut the sentence

**Comparative disparagement** — the weakest legal ground in the copy set
- "Most browser-based GIF tools use a naive encoder and **you can see it** — banding, dirty edges, dithering noise" and "Same size budget, **visibly better result**". Both are gated on gate G6. If G6 failed, these come out in the same commit as the repositioning

**Inherited from the preset-first settings work** (`plans/260813-1055-preset-first-tool-settings-ui-chips-promoted-primary-collapsible-settings/`)
- The **preset chip labels and legends** on `/gif-compressor` and `/mp4-to-gif` (`presetChips` in each content file) are production copy and belong in this sign-off. `tool-copy.test.ts` already asserts no label is shared between the two rows; what it cannot assert is whether each label describes what its preset actually does.
- The **settings disclosure** on those two routes joins the a11y sweep: passes 1, 3, 4 and 5 above now have a collapsed panel and a chip row to walk. Pass 2 must confirm the toggle announces as "Settings, button, collapsed/expanded" — it takes its name from the heading via `aria-labelledby` rather than a string of its own.
- **iOS Safari collapse/expand on real hardware is unverified.** WebKit in Playwright is not Mobile Safari, and that plan recorded the criterion as unverified rather than marking it passed. It is a real-device item here.
- That plan records a **pre-existing compressor defect**, not caused by it: the width slider can show a width the engine will not run, because the page never reads the device tier and `widthCapFor()` caps the job at 640 on desktop and 480 on every mobile tier. `plan.downgraded` cannot report it, because `wantedWidth` is already capped before the flag is computed. Either give the compressor a capabilities dependency or say so in the copy — but do not ship a slider that reads 1280 while the job runs 640.

**Structural checks**
- Mobile limits ("150 MB / 50 MB / 60 seconds") must be **runtime-computed per device tier**, never static copy — the binding constraint is decoded RGBA, not input size
- "Keep inputs under roughly 50 MB — iOS Safari runs out of memory above that" is factually wrong in a way a user can disprove
- Discord numbers must match `lib/presets/discord.ts`; `680×240` must appear nowhere
- The trust line "🔒 100% in your browser. Files never leave your device." must be **literally true**. It is at MVP. Make "no analytics event ever contains a filename or file content" an automated test, not a convention

### Performance budgets

| Metric | Budget | How measured |
|---|---|---|
| CLS | **0** on every route | Lighthouse + a Playwright layout-shift observer |
| INP | ≤ 200 ms p75, including during an encode | `web-vitals` field data; CI long-task assertion as the proxy |
| LCP | ≤ 2.5 s on the dropzone | Lighthouse, throttled |
| Lighthouse performance | ≥ 95 on a tool page | CI |
| Main client bundle | no `ffmpeg` string; gifski wasm loaded lazily from `public/wasm/` | CI bundle check |

## Related Code Files

- Create: `e2e/**` — full suite
- Create: `e2e/fixtures/**` — promoted from the Phase 1 spike, same names
- Create: `e2e/visual/states.spec.ts`
- Create: `docs/launch-checklist.md`
- Modify: `.github/workflows/ci.yml` — add visual regression and Lighthouse CI

## Implementation Steps

1. Consolidate the per-phase E2E specs into one suite with shared fixtures. Every test that produces a file must **decode the output and assert on its properties** — dimensions, frame count, duration, byte size — not on the DOM.
2. Add visual regression on `/dev/states` so component drift is caught mechanically.
3. Run the full matrix on real devices. Emulators do not tell the truth about memory, which is the constraint that governs this product.
4. Run all six accessibility passes. Fix what they find; do not defer a11y bugs past launch.
5. Run the copy audit above. Every unbacked claim is cut or replaced.
6. Measure CLS, INP and LCP on every route. Investigate any non-zero CLS rather than accepting a "small" value — the design principle is zero.
7. Add Lighthouse CI with the budgets above as failing thresholds.
8b. Write `docs/post-launch-operations.md`. Launch week is currently the plan's terminal state, which is how a site goes quiet in month two. Cover: weekly Search Console review; **monthly Discord limit re-verification** (the config already carries source URLs and dates, and four articles changed within two weeks of the research); one content page per week for the first eight weeks; a Sentry alert when the job-failure rate exceeds 2%; and the Product Hunt / Reddit decision made **before** launch rather than after.
9. Write `docs/launch-checklist.md` and complete it:
   - Domain, DNS and TLS confirmed live (purchased back in Phase 2, not here)
   - Production deploy on the named hosting tier, `metadataBase` pointing at the real domain
   - Search Console verified, sitemap submitted
   - Legal pages live; About names a real operator
   - AGPL `LICENSE`, `NOTICE`, public repo, working footer source link
   - CSP live and correct, including `'wasm-unsafe-eval'`
   - `.wasm` served as `application/wasm` with immutable caching — assert with `curl -I` in CI
   - Sentry receiving events, with content and PII scrubbed
   - Consent banner functional; no analytics before consent
   - `NEXT_PUBLIC_AD_PROVIDER=none` confirmed in production
   - A Boosted Discord server is available for sticker and banner verification (Boost L1 for stickers, L2 for the 960×540 server banner)
   - Every tool and preset page confirmed to carry ≥400 words of page-specific prose and its own FAQ
   - No string anywhere in the product mentions "Pro"
   - Known limitations documented: Firefox Android video tools, and WebP→GIF only if it shipped without the ANMF splitter
9. Smoke-test production after deploy on all five target browsers before announcing anything.

## Success Criteria

- [ ] Every tool produces correct output on all target browsers and on real Android and iPhone hardware
- [ ] E2E suite asserts on decoded output for every tool; the suite fails if an encoder silently produces an invalid file
- [ ] Six accessibility passes completed by a human, with findings fixed
- [ ] CLS 0 on every route; LCP ≤ 2.5 s; no main-thread task over 200 ms during an encode
- [ ] Lighthouse performance ≥ 95 on a tool page
- [ ] Copy audit complete: no unverified speed claim, mobile limits match the real budgets, `680×240` absent, trust line literally true
- [ ] Launch checklist complete and signed off
- [ ] Production smoke test passed on all five browsers
- [ ] Known limitations documented publicly rather than hidden

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Real-device testing skipped under time pressure | It is the single highest-value activity in this phase. Memory behaviour — the product's binding constraint — cannot be verified any other way |
| A11y issues found late and deferred | The per-phase criteria already require keyboard passes. This phase should confirm, not discover. If it discovers a lot, the earlier phases skipped their gates |
| CLS non-zero once an ad script is eventually added | Slots are reserved and measured now. When a network is activated post-launch, re-measure before leaving it on |
| Domain registered but never served, so index age never accrues | `pzgif.com` is bought (2026-08-05). Phase 2 day 1 puts a real holding page on it and verifies Search Console — a parked domain earns nothing |

## Open questions

1. Which real Android and iPhone models are available for testing? The budgets in Phase 4 assume an iPhone SE 3 class floor; testing only on a recent flagship would validate nothing.
2. Should launch be announced anywhere, or should the site simply go live and accumulate index coverage quietly? The SEO strategy is a 12-18 month compounding play, so a launch announcement buys little — but a Product Hunt or Reddit post can seed the first backlinks. Decide before the checklist closes.
