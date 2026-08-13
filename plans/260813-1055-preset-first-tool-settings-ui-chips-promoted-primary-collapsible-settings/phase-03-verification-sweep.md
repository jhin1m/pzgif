---
phase: 3
title: "Verification sweep"
status: complete
priority: P1
effort: "0.5d"
dependencies: [2]
---

# Phase 3: Verification sweep

## Overview

The claims Phase 2's functional tests do not cover: collapsed prose in the built
HTML, layout stability around ads, and the byte-identical anchor against a
fixture that can actually detect a width change.

Every check here is written so it can fail. The first draft's ad-rail check
could not, and that is the specific failure this phase is rewritten around.

## Requirements

- Every `plan.md` success criterion demonstrated by a command or a recorded measurement.
- Any criterion that cannot be mechanised is recorded as unverified, never quietly dropped.
- No check may pass by being skipped.

## Architecture

### 1. The ad-rail check must run with ads on

`ADS_ENABLED` is `process.env.NEXT_PUBLIC_ADS_ENABLED === "1"`, default off
(`site-config.ts:48-51`). With it off, `AdSlot` returns `null` before rendering
(`ad-slot.tsx:61-63`) and `ToolShell` does not declare the third grid track at
all (`tool-shell.tsx:49-51`) — so there is no rail to measure, and every
existing ad spec `test.skip`s (`e2e/lib/ads.ts:4-13`).

So: **build and run this spec with `NEXT_PUBLIC_ADS_ENABLED=1`**, and if the
rail element is absent, **fail** rather than skip. Measure at `xl`:

- Ad slot `x` and `width` identical before and after a disclosure toggle.
- `getComputedStyle(grid).gridTemplateColumns` track count identical.

### 2. Measure the breakpoint where content actually moves

At `xl` the settings column sits beside the stage and the toggle is `lg:hidden`,
so toggling there is a no-op — which is why the first draft's check was vacuous
twice over. The band where the collapse genuinely moves content is **below
`lg`**, where `ToolShell` is `grid-cols-1` and the settings panel sits above the
explainer, the FAQ, the related tools and the `result-rect` slot.

Measure there: toggle the disclosure at 768px and record what moves. A direct
click is inside Chromium's 500 ms input window so it does not score as CLS, but
the measurement is what proves that rather than an assumption.

### 3. The byte-identical anchor needs an off-rung fixture

`e2e/gif-compressor.spec.ts:18` uses `loop-small.gif` at **480×270** — already a
`WIDTH_LADDER` rung. Any width-transform regression that snaps to a rung is
invisible against it. Add a fixture whose width is not a rung (e.g. 500px) and
assert `output.width === source.width` on the untouched default path.

This is the check that would have caught the deleted ladder-snapping rule.

### 4. Collapsed prose in the built HTML

Against the **built** output, never the dev server:

```bash
pnpm build && pnpm check:static
```

then assert every control label and hint string from `src/content/` appears in
the prerendered HTML of both routes. `e2e/faq-crawlability.spec.ts:19-31` proves
the same property for the FAQ and is the pattern to copy.

Note the compressor swaps Quality's copy at runtime between `quality`,
`qualityCappedPalette` and `qualityPaletteEncoder` (`:302-306`). The static HTML
contains the **default-path** variant; assert that one, and assert the other two
exist in the content file rather than in the HTML.

### 5. Keyboard and iOS

- Tab reaches chip row → primary → disclosure toggle, in visual order.
- Space and Enter both toggle; `aria-expanded` tracks it.
- iOS Safari, on a real device: collapse and expand both routes. **WebKit in
  Playwright is not Mobile Safari and does not prove this.** If no device is
  available, record the criterion as unverified — do not mark it passed.

## Related Code Files

- Create: `e2e/tool-settings-disclosure.spec.ts`
- Reused instead of created: `e2e/fixtures/odd-dims.gif` is 499×281, already off every `WIDTH_LADDER` rung
- Read only: `e2e/faq-crawlability.spec.ts`, `e2e/result-panel-reservation.spec.ts`, `e2e/lib/ads.ts`

## Implementation Steps

1. Add the off-rung fixture and the width-preservation assertion to
   `e2e/gif-compressor.spec.ts`.
2. Write `e2e/tool-settings-disclosure.spec.ts` covering checks 1, 2, 4 and the
   keyboard half of 5, for both routes.
3. Run the full gate:
   ```bash
   pnpm typecheck && pnpm lint && pnpm test
   pnpm check:forbidden && pnpm build && pnpm check:static
   pnpm test:e2e
   NEXT_PUBLIC_ADS_ENABLED=1 pnpm build && NEXT_PUBLIC_ADS_ENABLED=1 pnpm test:e2e
   ```
4. Run the iOS check on a real device, or record it unverified.
5. Re-read `plan.md` and all three phase files; correct anything the
   implementation contradicted.
6. Update the MVP plan's Phase 11 to note that its copy audit and a11y sweep now
   cover the chip copy and the disclosure on these two routes, and that it
   inherits the pre-existing compressor width-cap defect recorded in `plan.md`.

## Success Criteria

- [x] Off-rung fixture: untouched default path preserves source width exactly
- [x] Ad-rail spec runs with `NEXT_PUBLIC_ADS_ENABLED=1` and fails if the rail is absent; with ads off it asserts the opposite invariant rather than skipping
- [x] Ad slot `x`/`width` unchanged across a disclosure toggle at `xl`
- [x] Grid track count unchanged
- [x] Below-`lg` toggle measured; the explainer moves and nothing shifts unprompted. Two pre-existing shifts surfaced and were fixed — `plan.md` → As built
- [x] Every control label and hint present in the prerendered HTML of both routes while collapsed
- [x] Tab order matches visual order on Chromium; Space and Enter both toggle on both engines — `plan.md` → As built #9
- [x] Full command gate green, with and without `NEXT_PUBLIC_ADS_ENABLED=1`
- [x] The collapsed panel is out of the tab order and out of the a11y tree, not merely clipped
- [x] All seven other `GifWorkbench` routes covered at 768px — see `plan.md` → As built
- [x] iOS Safari check **recorded as unverified** — no device available; `plan.md` and the MVP plan's Phase 11 both carry it
- [x] MVP plan Phase 11 updated

## Risk Assessment

| Risk | Mitigation |
|---|---|
| A check passes by skipping | Every gate here fails on a missing precondition; the ad spec asserts the rail exists before measuring it |
| WebKit passing is read as iOS Safari passing | Step 4 forces pass-or-unverified; the two are named separately in the criteria |
| The prose check runs against the dev server | Check 4 runs after `pnpm build`; `pnpm preview` (workerd) is the tiebreak if results disagree |
| Phases shipped differently from plan | Step 5 is the consistency sweep and is a success criterion, not a courtesy |
