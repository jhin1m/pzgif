---
title: "PZGIF homepage soul pass - Ship 0 homepage, brand motif, job moments"
description: "Build the Ship 0 homepage with a routing dropzone, establish a repeated visual motif, and turn the result and empty states into designed moments across the 5 live tool pages."
status: complete
priority: P1
effort: "4-6 days solo"
tags: [homepage, design-system, content, seo, ship-0]
created: 2026-08-05
blockedBy: []
blocks: [260805-0001-pzgif-mvp-9-browser-native-gif-tools-discord-presets]
---

# PZGIF homepage soul pass

## Overview

The site works and feels like nothing. Three causes, all identified in
`plans/reports/from-brainstormer-to-planner-homepage-soul-and-brand-motif-report.md`
and ratified by the operator as **Option A**:

1. `src/app/[locale]/page.tsx:29-55` is a holding page — `h1` + trust line +
   bare link boxes. No hero, no dropzone, no icons, no descriptions.
2. No repeated visual device anywhere. `LoopMark` exists and is used in exactly
   one place; primary blue appears almost only on buttons; accent teal is
   reserved by the token layer and assigned to no meaning.
3. Job completion is a 180ms fade plus a badge. The pre-file state is a 320px
   dashed box with one grey sentence taking half the viewport.

**This is a plan arrear, not a plan deviation.** The parent plan's
`plan.md:220` defines **Ship 0 (week 1-2)** as Phase 2 + Phase 9 + the chrome
half of Phase 3 + Phase 10. Ship 0 was skipped; the engine shipped first. This
plan executes the homepage slice of Ship 0 and the design polish that the tool
pages should have carried out of Phase 3.

## Relationship to the parent plan

`260805-0001-pzgif-mvp-...` remains the governing plan. This one is a slice that
cuts across three of its phases, which is why it is a separate directory rather
than an edit to any single phase file:

| Parent phase | What this plan takes from it |
|---|---|
| Phase 3 — Design System and Layout | The motif, surface depth, and the ResultPanel state work that Phase 3 specified but shipped thin |
| Phase 5 — Tool Framework | The compressor CLS defect logged at parent `plan.md:259` |
| Phase 9 — Content SEO and Legal | The homepage only. **Legal pages, the non-tool content pages and the SEO machinery stay in parent Phase 9** and are not touched here |

On completion, parent Phase 9 shrinks to "legal + non-tool content + SEO
machinery" and parent `plan.md:259`'s CLS item is struck.

## The finding that reshaped the hero

`docs/wireframe/index.html:86` promises *"We pick the right tool for your file."*

**It cannot.** `src/lib/media/sniff.ts` decides what the *bytes* are; it says
nothing about *intent*. And the registry makes this concrete: all five live
routes declare `inputFormats: ["gif"]`. A dropped GIF is valid input for
compressor, resize, crop, speed **and** reverse. Auto-routing guesses wrong four
times in five.

**Resolution — the drop does not navigate. It offers.**

```
drop / paste / browse
        │
        ▼
   sniff bytes  ──►  "GIF · 2.4 MB · 48 frames · 480×270"
        │
        ▼
   chips filtered from registry.inputFormats ∩ liveRoutes()
   [ Compress ] [ Resize ] [ Crop ] [ Speed ] [ Reverse ]
        │
        ▼
   client-side nav, file carried in a module singleton
```

ezgif forces tool-selection before upload. PZGIF accepts the file first and asks
second. That is differentiator #3 and it costs one small module.

## Answers to the brainstorm's open questions

The report closed with three unresolved questions. Two are decided by the
codebase; one was decided by the operator.

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Fold the compressor CLS fix in, or keep it separate? | **Folded in as Phase 1**, a hard prerequisite | Operator directive. Phase 3 edits `result-panel.tsx`, the same component the failing test measures |
| 2 | What happens when a dropped file has no live tool? | **Accept the drop, sniff it, then refuse with a named reason and a "not built yet" state.** Never silently do nothing | `registry.ts:26-31` warns that linking `planned` routes yields 404s. `sniff.ts:1-10` establishes the "never a dead end" rule this follows |
| 3 | Can `capability.ts` run on the homepage without dragging the worker bundle into the landing path? | **Question is moot — do not call it.** Every live route is GIF-only, so no video routing exists to gate. Revisit when parent Phase 7 ships `mp4-to-gif` | `registry.ts` — `mp4-to-gif`, `gif-to-mp4`, `webp-to-gif`, `split-gif-to-frames` and all five preset routes carry no `status`, i.e. `planned` |

## A copy constraint that follows from question 2

**The homepage may not claim "nine tools".** Five are live. The wireframe's
"Nine tools. All of them run locally." is false today and would be the fifth
documented wireframe copy defect. The grid renders `liveRoutes()` only, and the
sub-head states the true count with an honest forward-looking line.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Homepage stops being a holding page: hero, working dropzone, action picker, tool grid, why-block, Discord teaser | P1 |
| 2 | A file dropped on the homepage arrives at the chosen tool already loaded — no second file selection | P1 |
| 3 | One repeated visual motif makes the product recognisable at a glance and carries meaning rather than decoration | P1 |
| 4 | Job completion reads as an accomplishment with a next step, not a fade | P1 |
| 5 | The pre-file state tells the visitor what will happen instead of occupying space | P2 |
| 6 | Zero CLS regression, and the pre-existing compressor CLS defect closed | P1 |
| 7 | Every new word is hand-written, per-surface, and carries no unmeasured claim | P1 |

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Compressor CLS regression fix](./phase-01-compressor-cls-regression-fix.md) | Complete | — |
| 2 | [Brand motif and surface depth](./phase-02-brand-motif-and-surface-depth.md) | Complete | — |
| 3 | [Result and empty state moments](./phase-03-result-and-empty-state-moments.md) | Complete | 1, 2 |
| 4 | [Homepage file handoff](./phase-04-homepage-file-handoff.md) | Complete | — |
| 5 | [Homepage and card copy](./phase-05-homepage-and-card-copy.md) | Complete | — |
| 6 | [Homepage assembly](./phase-06-homepage-assembly.md) | Complete | 2, 4, 5 |
| 7 | [Verification and launch gate](./phase-07-verification-and-launch-gate.md) | Complete | 1-6 |

Phases 1, 2, 4 and 5 are genuinely independent and could run in any order.
Phase 5 (copy) should start early regardless of build order — it is the only
phase gated on operator approval rather than on code.

## Architecture

```
src/
  app/[locale]/page.tsx          ── rewritten: server shell, renders <HomeHero/>
  components/
    home/
      home-hero.tsx              ── NEW client: dropzone → sniff → picker
      tool-picker.tsx            ── NEW client: chips from registry ∩ liveRoutes
      tool-grid.tsx              ── NEW server: cards, icon + name + benefit
      why-pzgif.tsx              ── NEW server: 3-up, measured numbers only
      discord-teaser.tsx         ── NEW server: preset chips, planned-safe
      tool-icons.tsx             ── NEW: slug → lucide icon, unmapped = type error
    tool/
      result-panel.tsx           ── MODIFIED: done-state composition + empty state
    brand/marks.tsx              ── MODIFIED: optional eyes on LoopMark
  lib/
    handoff/pending-file.ts      ── NEW: module singleton, set/take/clear
    content/home.ts              ── NEW: HomeContent schema (code)
    tools/content.ts             ── MODIFIED: ToolContent gains `card.benefit`
  content/
    home.json                    ── NEW: hand-written homepage prose
    <5 existing tool>.json       ── MODIFIED: one benefit line each
  app/globals.css                ── MODIFIED: checkerboard motif utility
```

**Boundary that must not blur:** `src/content/` is `LICENSE-CONTENT`
(all-rights-reserved) and stays pure `.json`. Schemas are code and live in
`src/lib/`. `src/content/README.md:1-16` states this; `content.ts:1-20` explains
why the schema is not in there.

## Success Criteria

- [ ] Homepage renders hero + working dropzone + action picker + tool grid + why-block + Discord teaser
- [ ] Dropping a GIF on the homepage and clicking a tool chip lands on that tool **with the file already loaded**
- [ ] Hard-reloading a tool page reached that way degrades to its own empty dropzone with no error
- [ ] Dropping a file no live tool accepts produces a named refusal, never a dead end
- [ ] Homepage claims no tool count that `liveRoutes()` does not support
- [ ] Every tool-card benefit line is hand-written and lives in `src/content/`, never in `registry.ts`
- [ ] No speed, size or percentage claim anywhere without a `bench-results/` measurement behind it
- [ ] Checkerboard motif renders correctly in both themes and never sits behind body text
- [ ] ResultPanel on completion: check-pop + delta + primary download + related tools
- [ ] Empty ResultPanel keeps its current `min-height`; the compressor CLS test asserts `0` and passes
- [ ] No new looping animation, parallax, scroll effect or route transition anywhere
- [ ] Every new motion is suppressed under `prefers-reduced-motion` with meaning preserved
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check:forbidden`, `pnpm build`, `pnpm check:static` all green
- [ ] Keyboard-only pass on the homepage drop → pick → tool flow; no horizontal scroll at 320px

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Module-singleton handoff breaks if a future link becomes a hard navigation | The homepage's core promise fails silently | The tool page always accepts a missing handoff and shows its own dropzone. E2E asserts both the handoff path and the reload path |
| New homepage sections ship unreserved boxes → CLS on the ranking surface | CLS is a ranking input; parent plan sets CLS = 0 per route | Reserve every box in static HTML. Extend the existing `layout-shift` observer pattern from `e2e/gif-compressor.spec.ts:212-243` to the homepage |
| Benefit lines drift into templated copy across 9 cards | Site-wide scaled-content-abuse penalty | Lines live in `src/content/`; extend `tool-copy.test.ts` with a cross-page similarity assertion |
| Checkerboard motif reads as noise | Regression in the opposite direction | Low opacity, and only behind *empty* or *media* surfaces — never behind text. Reviewed on `/dev/states` before it reaches product pages |
| Four other browser tests are already red on `main` | New failures get attributed to this work | Phase 1 records the exact red baseline before touching anything. Those four stay out of scope by operator decision |
| Homepage becomes a second engine entry point and bloats the landing bundle | Lighthouse ≥ 95 target at first paint | `sniff.ts` only — no worker, no WASM, no `capability.ts` on the homepage. Phase 7 asserts the landing chunk does not import `lib/media/worker/**` |

## Out of scope

Real logo, favicon set and OG images · full mascot (available as a separate
track on request) · parent Phase 7 cross-format tools · parent Phase 8 Discord
cluster · legal pages and SEO machinery (stay in parent Phase 9) · the four
non-CLS browser failures from parent `plan.md:259` · reviving the live size
estimate (`gif-compressor-tool.tsx:289-301` records why it was removed)

## Open questions

1. Operator must approve the homepage copy before Phase 6 merges — rule #3
   requires every word hand-written, and the tool-card benefit lines set the
   voice for the nine-card grid that Ships 2-4 will fill.
2. The "Why PZGIF" tiles need three real numbers. `bench-results/` has 36
   entries; Phase 5 must confirm which are quotable and on what hardware, or the
   tiles carry qualitative statements instead. **A tile with an invented number
   is worse than a tile with none.**

<!-- slug: pzgif-homepage-soul-pass-ship-0-homepage-brand-motif-job-moments -->
