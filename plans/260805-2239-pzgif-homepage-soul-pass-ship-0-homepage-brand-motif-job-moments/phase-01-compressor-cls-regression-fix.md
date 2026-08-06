---
phase: 1
title: "Compressor CLS regression fix"
status: complete
priority: P1
effort: "0.5-1d"
dependencies: []
---

# Phase 1: Compressor CLS regression fix

## Overview

Close the CLS defect logged at parent `plan.md:259` before Phase 3 edits the same
component. Also record the exact red baseline of the browser suite, so failures
introduced by this plan are distinguishable from the four that already exist.

## Why this is first

`e2e/gif-compressor.spec.ts:212-243` asserts total layout shift is **exactly 0**,
excluding entries with `hadRecentInput`. The parent plan records a measured
**0.015 on Chromium**. Phase 3 rewrites `result-panel.tsx` — the component most
likely to be the cause. Fixing after would make it impossible to tell whether the
fix worked or the rewrite masked it.

## Requirements

- Functional: the compressor page produces zero un-inputted layout shift on a
  full job run at 1440×900.
- Non-functional: the fix must not be achieved by widening the test's tolerance,
  by adding `hadRecentInput` exclusions, or by deleting the assertion.

## Architecture

The test's own comment states the intended contract: the result panel growing to
a decoded frame's aspect ratio follows a click and is therefore excluded. What
must be zero is *everything else* — "slots appearing late, settings unhiding, a
rail column materialising when an ad fills it".

Diagnosis order, cheapest first:

1. **Ad slots.** `src/components/ads/ad-slot.tsx` — a slot that reserves its box
   only after hydration shifts the page once. `provider = none` at MVP, so an
   unreserved-at-SSR slot is the prime suspect.
2. **The rail column.** `tool-shell.tsx` — a grid whose second column appears at a
   breakpoint or on hydration.
3. **Sticky action bar.** `action-bar-context.tsx` warns about exactly this
   failure mode (`tool-page.tsx:26-33`): registering visibility from an effect
   renders the anchor slot into static HTML and removes it on hydration.
4. **Font swap.** `src/app/fonts.ts` — a display face swapping in without
   `size-adjust` shifts the `h1` block.
5. **ResultPanel/ProgressBar.** The progress row appearing when a job starts —
   but that follows a click, so it should already be excluded.

**Do not guess.** Instrument first: log each `layout-shift` entry's `sources[]`
node in the observer, run the failing test, read which element moved.

## Related Code Files

- Modify: whichever single file the instrumented run names. Expected candidates:
  `src/components/ads/ad-slot.tsx`, `src/components/tool/tool-shell.tsx`,
  `src/app/fonts.ts`
- Modify (temporarily, for diagnosis only): `e2e/gif-compressor.spec.ts` — revert
  the instrumentation before merge
- Create: `plans/reports/from-cook-to-planner-cls-baseline-and-fix-report.md`

## Implementation Steps

1. Run `pnpm build && pnpm test:e2e` on a clean tree. Record every failing test
   by name and engine. This is the red baseline; it goes in the report.
2. Confirm the four known non-CLS failures match parent `plan.md:259`
   (`/dev/states` 40px overflow at 320px on both engines; WebKit skip-link tab
   order; WebKit FAQ-panel height). Anything else is new information and must be
   reported before proceeding.
3. Extend the observer in the CLS test to capture `entry.sources[0].node`'s tag,
   id and class list. Run it. Read the output.
4. Fix the named cause. One change, one reason.
5. Re-run the CLS test on Chromium until it asserts `0`.
6. Re-run the full suite. Confirm the red baseline shrank by exactly one and
   nothing new went red.
7. Revert the test instrumentation. Write the report.

## Success Criteria

- [ ] Red baseline of the browser suite recorded in a report before any change
- [ ] The layout-shift source is *named* in the report, not inferred
- [ ] `e2e/gif-compressor.spec.ts` "shifts nothing the user did not ask for" passes on Chromium
- [ ] The test's assertion is still `expect(shift).toBe(0)` — unchanged
- [ ] No new failures in the suite; the four known non-CLS failures are unchanged
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The shift source is the font swap, which is expensive to fix properly | If so, stop and report before attempting `size-adjust` tuning — that is a design-system change, not a bug fix, and it affects every route |
| The cause is the ad slot, and fixing it changes the ad-slot contract | `design-guidelines.md:430` fixes that contract precisely (reserved/unfilled = empty box, label only). Any fix must stay inside it |
| Instrumentation left in the merged test | Explicit revert step, and the diff is reviewed before merge |
