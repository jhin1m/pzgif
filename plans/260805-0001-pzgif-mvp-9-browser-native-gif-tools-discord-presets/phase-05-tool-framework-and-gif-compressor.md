---
phase: 5
title: "Tool Framework and GIF Compressor"
status: complete
priority: P1
effort: "4-6d"
dependencies: [3, 4]
---

> **Status 2026-08-05 — complete.**
>
> The framework, the compressor page and its hand-written copy ship and pass
> typecheck, lint, build, 166 unit tests, `check:static` and `check:forbidden`.
> The tool produces a real file: **4.1 MB → 705 KB (−83%)**, valid `GIF89a`, all
> 48 frames, original 480×270, original 2,400 ms timing — asserted by decoding
> the downloaded bytes in a real browser with the service worker active. "Drop
> every second frame" decodes to 24 frames. Zero un-prompted layout shift across
> every transition.
>
> **A blocking defect was found and fixed on the way, and it was not in this
> phase.** The service worker cached Turbopack's shared worker bootstrap, whose
> per-worker identity lives entirely in the URL *fragment* — which the Cache API
> strips. The second worker to be requested (always the encode worker) received
> the first one's response, booted with no chunk list, and then sat silent until
> the hang watchdog fired. Shipped as-is, the media engine would have been dead
> for every repeat visitor of every tool, silently. Fixed in `public/sw.js`;
> locked by `src/lib/service-worker-policy.test.ts`.
>
> Deviations, the code-review outcome, the full isolation trail and what remains
> open:
> `plans/reports/from-cook-to-project-manager-phase-05-tool-framework-and-compressor-report.md`

# Phase 5: Tool Framework and GIF Compressor

## Overview

Build the shared tool-page framework and prove it end to end with the **GIF Compressor** — the flagship tool, the one `docs/wireframe/tool-compressor.html` specifies in full, and the one that shows off differentiator #1.

This is the vertical slice. Every subsequent tool is a configuration of what lands here. Get the framework wrong and Phases 6, 7 and 8 inherit the mistake nine times over.

## Requirements

**Functional**
- A `ToolPage` composition that assembles dropzone → settings → progress → result → ads → content → FAQ → related tools
- The six flow states from the wireframe (idle → drag → loaded → processing → result → error) inside one size-reserved container
- GIF Compressor fully working: quality, colours, lossy, width, drop-every-second-frame
- Before/after comparison with real byte counts on every result

**Non-functional**
- Dropzone fully visible at 375×667 with no scrolling — a hard acceptance criterion
- Zero layout shift across every state transition
- One primary button per viewport, ever

## Architecture

### The framework is composition, not a template engine

The temptation is a `<ToolPage config={...}/>` that renders everything from data. **Resist it for the content half.** Google's scaled-content-abuse policy penalises template-filled pages site-wide, and 14 near-identical pages generated from one config is precisely that shape.

The split:

| Layer | Shared? | Why |
|---|---|---|
| Chrome, dropzone, settings panel, progress, result panel, ad slots | **Shared components** | Identical mechanics; sharing is correct and DRY |
| Settings *schema* per tool | Per-tool config | Small, declarative, genuinely varies |
| h1, sub-head, explainer prose, FAQ, related-tool blurbs | **Hand-written per tool** | This is the SEO substance. Never generated |

`lib/tools/registry.ts` holds structure. `content/<slug>.mdx` holds prose. They never merge.

### State machine

One `useMediaJob` state machine drives all six wireframe states inside a single container whose height is reserved from first paint:

```
idle ──drop/browse/paste──► loaded ──run──► processing ──► result
  ▲                            │               │             │
  └──── invalid ───────────────┘           cancel        re-run/start-over
```

Rules from `design-guidelines.md` that are easy to violate here:

- **Settings render disabled, never hidden**, before a file arrives — hiding them makes the layout jump when a file loads
- **Disabled primary keeps `aria-disabled` and a visible reason** ("Add a GIF first"), rather than vanishing
- **After a result, the Compress button demotes to secondary** ("Re-compress") so Download is the only primary
- **The result panel's empty state reserves its height** — that is what makes the reveal shift-free
- Below `md`, the sticky action bar carries the single primary action and the inline button is hidden; the anchor ad is suppressed while the bar is visible

### Ad slot placement — binding, from `design-guidelines.md` §8

| Slot | Size | Position | Condition |
|---|---|---|---|
| `result-rect` | 300×250 | Below the result panel | Reserved from first paint, **fills only once a result exists** |
| `content-inline` | 336×280 | Inside the explainer, after ~150 words | Always |
| `rail` | 300×600 | Right rail | ≥1280px only; the grid column exists from first paint whether or not it fills |
| `anchor` | 320×50 | Bottom, mobile | **Only when the sticky action bar is absent** — mutually exclusive |

Never above the fold on a tool page. Never within 24px of a primary action. Never between the settings and the Compress button.

## Related Code Files

- Create: `src/components/tool/tool-page.tsx`, `tool-shell.tsx`, `job-state.tsx`
- Create: `src/components/tool/settings/` — schema-driven controls
- Create: `src/app/[locale]/gif-compressor/page.tsx`
- Create: `src/content/gif-compressor.mdx` — hand-written prose + FAQ (content, not a `.tsx` module — see the licence split in Phase 2)
- **Consume, do not create:** `faq-accordion`, `related-tools`, `seo-section` and all JSON-LD are owned by Phase 3/9. Two phases creating the same file is how a project ends up with two JSON-LD implementations
- Create: `e2e/gif-compressor.spec.ts`
- Create: `e2e/lib/decode-output.ts` — Node-side output decoding, see below
- Reference: `docs/wireframe/tool-compressor.html` — **microcopy here is production copy**

## Implementation Steps

1. Build `ToolShell`: the responsive grid that becomes 1-column, then 2-column at `lg` (preview `1fr` + settings `320px`), then 3-column at `xl` with the 300×600 rail. **The rail column is declared at all widths ≥1280 whether or not an ad fills it** — late injection is what causes shift.
2. Build the schema-driven settings panel. A tool declares controls (`slider`, `select`, `toggle`, `number`) with labels, ranges, defaults and helper text; the panel renders them with the Phase 3 components. Helper text is per-tool copy from the wireframe, not generic.
3. Wire `useMediaJob` to the six states. Verify each transition against `states.html`. Measure CLS across every transition — the target is exactly zero, not "small".
4. Build the GIF Compressor settings per the wireframe: Quality 1-100 (default 80), Colors (256/128/64/32 with the wireframe's exact labels), Lossy 0-100 (default 30), Width in px, and the "Drop every second frame" toggle.
5. Wire the live preview: first frame rendered while settings are tuned, plus the live estimate from `estimate.ts`. Label it an estimate.
6. Wire the result panel: `BeforeAfterSlider` with real byte counts, the size-delta line (`2.4 MB → 480 KB`, `−80%` pill), Download, "Re-compress" (secondary), "Start over" (ghost), and the "Also save as WebP / MP4" secondary row.
7. Add the SEO layer: `generateMetadata`, self-referential canonical, `BreadcrumbList` + `WebApplication` JSON-LD via `ToolJsonLd`. **Do not emit `FAQPage`** — FAQ rich results were removed from Google Search on 2026-05-07 and the docs deleted 2026-06-15. Keep the FAQ UI, which still earns long-tail impressions and feeds AI answer surfaces.
8. Write the compressor's explainer and FAQ into `content/gif-compressor.mdx`, reusing the wireframe copy verbatim — **except** the FAQ's unverified speed claim, which must carry Phase 1's measured figure or be cut.
9. Place the four ad slots reserved and unfilled, per the table above. Confirm 24px clearance from every primary action.
10. Full accessibility pass on the job flow: keyboard-only from dropzone to download; live-region announcements throttled to 25% boundaries with the visible percentage `aria-hidden`; Cancel reachable with one Tab from the progress bar.
11. **Build the output-decoding test infrastructure first — it is real work the plan repeats in six places without ever creating it.** Playwright runs in Node, which cannot decode a GIF or an MP4 out of the box. Add a small `e2e/lib/decode-output.ts` with explicit dependencies for parsing GIF headers and frame counts, and for probing MP4 (ffprobe via a dev-only dependency is acceptable in tests — it never ships to the browser). Without this, every "assert on decoded output" criterion in Phases 5-8 and 11 silently degrades to a DOM check.
12. Write `e2e/gif-compressor.spec.ts`: load a real fixture GIF, run a compression, download the output, and **decode the downloaded bytes to assert it is a valid, smaller GIF with the expected frame count and timing**.

## Success Criteria

- [ ] The compressor works end to end in Chrome, Safari and on a real mobile device
- [ ] Downloaded output is a valid GIF, smaller than the input, and plays with the original timing — asserted by decoding it in the E2E test
- [ ] Dropzone fully visible at 375×667 with no scrolling
- [ ] CLS is exactly 0 across all six state transitions, measured
- [ ] Only one primary button visible per viewport in every state
- [ ] Keyboard-only pass from dropzone to download, and a screen-reader pass on the job flow
- [ ] Before/after slider shows real measured byte counts, never estimates
- [ ] No `FAQPage` JSON-LD anywhere; `BreadcrumbList` + `WebApplication` present and valid
- [ ] The FAQ contains no unverified speed claim
- [ ] Framework proven reusable — a second tool can be added without touching `tool-shell.tsx`

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Framework over-abstracts and content becomes templated | Enforce the structure/prose split. Code review rejects any page whose explainer is generated from config |
| Framework under-abstracts and Phases 6-8 copy-paste | The acceptance bar is literally "add tool #2 without editing the shell". Test it before closing the phase |
| Ad slots introduce shift once a network fills them | Slots are reserved with `contain: layout size` and fixed `min-height`. Phase 10 measures with a live script; the layout must not change to accommodate it |
| Settings schema too rigid for the crop and trim UIs | Crop (Phase 6) and trim (Phase 7) need bespoke interactive controls. Design the schema with an `escape hatch` for a custom control from the start rather than retrofitting |

## Open questions

1. Does the "Also save as WebP / MP4" row re-encode on click, or pre-encode speculatively? Pre-encoding burns battery on mobile for an option most users ignore. **Recommend on-demand**, with the estimated size shown from `estimate.ts` until then.
2. Does "Re-compress" reuse the decoded frames or decode again? Reusing is much faster but holds the frame buffer alive, which fights the iOS memory budget. Decide with Phase 1's memory numbers.
