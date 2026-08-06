---
phase: 7
title: "Verification and launch gate"
status: complete
priority: P1
effort: "1d"
dependencies: [1, 2, 3, 4, 5, 6]
---

# Phase 7: Verification and launch gate

## Overview

Prove the whole pass, not each part. New E2E coverage for the homepage flow,
accessibility and CLS checks on the new surface, and a documentation sweep so the
parent plan stops describing work that is now done.

## Requirements

- Functional: the homepage drop → pick → tool flow is asserted end to end,
  including the reload fallback.
- Non-functional: no regression against the Phase 1 red baseline.
- Non-functional: every rule this plan promised to respect is checked
  mechanically where a check is possible, and by review where it is not.

## Architecture

### The three E2E cases that matter

1. **Handoff works.** Drop a fixture GIF on `/`, click the Compress chip, assert
   the compressor shows the loaded file **without** a second file input.
2. **Reload degrades.** Repeat, then `page.reload()`, and assert the empty
   dropzone with no error toast.
3. **Refusal names the format.** Feed a file whose bytes disagree with its
   extension and assert the refusal names the real format. `e2e/fixtures/`
   already backs the existing suites; a mislabelled fixture may need adding.

### CLS on the new surface

Reuse the observer from `e2e/gif-compressor.spec.ts:212-243` verbatim against
`/`, including the `hadRecentInput` exclusion. Two runs: idle, and after a drop,
because the picker appearing is the shift risk this plan introduced.

### Bundle assertions

Two rules made in earlier phases need a mechanical check, or they will erode:

- The landing chunk imports nothing from `src/lib/media/worker/**` and does not
  reference `capability.ts`
- `src/lib/handoff/pending-file.ts` appears in no server bundle

A build-output grep is enough. It belongs next to `check:forbidden`, which
already establishes the pattern of a mechanical guard for a rule that a reviewer
would otherwise have to remember.

### Accessibility

`design-guidelines.md` §7 and the parent plan's WCAG 2.1 AA goal:

- Keyboard-only pass on drop → pick → tool. Chips are links, so they must be
  tabbable, activatable with Enter, and carry a visible focus ring
- The picker appearing must be announced — it is a state change following a user
  action, and a sighted user sees it. Reuse the `JobAnnouncer` live-region
  pattern rather than inventing a second one
- 200% zoom at 375px with no horizontal scroll
- `prefers-reduced-motion`: the check-pop appears instantly; nothing else in this
  plan animates
- Forced-colors sanity check on the checkerboard motif and the new result state

### Documentation sweep

| File | Change |
|---|---|
| Parent `plan.md` | Phase 9 scope narrows to legal + non-tool content + SEO; strike the CLS item from open question 10; note the homepage slice shipped here |
| Parent `phase-09-content-seo-and-legal.md` | Remove homepage ownership, keep everything else |
| `docs/design-guidelines.md` | Add the motif and the accent-role rule. §6 is **not** amended — nothing in this plan needed it, which is worth recording explicitly |
| `docs/journals/` | One entry for the pass |
| `CLAUDE.md` | Only if the layout section is now wrong |

## Related Code Files

- Create: `e2e/homepage.spec.ts`
- Create: `scripts/check-landing-bundle.mjs` (or extend the existing forbidden check)
- Modify: `package.json` — wire the new check
- Modify: `plans/260805-0001-*/plan.md`, `plans/260805-0001-*/phase-09-*.md`
- Modify: `docs/design-guidelines.md`
- Create: `docs/journals/2026-XX-XX-homepage-soul-pass.md`
- Create: `plans/reports/from-cook-to-project-manager-homepage-soul-pass-delivery-report.md`

## Implementation Steps

1. Write `e2e/homepage.spec.ts` with the three cases plus the two CLS runs.
2. Add the mislabelled fixture if `e2e/fixtures/` lacks one.
3. Write the bundle check and wire it into `package.json`.
4. Full run: `pnpm typecheck && pnpm lint && pnpm test && pnpm check:forbidden &&
   pnpm build && pnpm check:static && pnpm test:e2e`.
5. Compare against the Phase 1 red baseline. The compressor CLS test must have
   moved from red to green; the four known failures unchanged; nothing new red.
6. Keyboard-only and screen-reader pass on the homepage flow.
7. 320px, 375×667, 200%-zoom and forced-colors checks.
8. Documentation sweep.
9. Delivery report: what shipped, what did not, and the exact test baseline.

## Success Criteria

- [ ] Three homepage E2E cases pass on Chromium and WebKit
- [ ] Homepage CLS is 0 both idle and after a drop
- [ ] Landing chunk imports no worker, no WASM loader, no `capability.ts` — asserted mechanically
- [ ] `pending-file.ts` is in no server bundle — asserted mechanically
- [ ] Keyboard-only pass completes the whole homepage flow
- [ ] The picker's appearance is announced to assistive technology
- [ ] No horizontal scroll at 320px; readable at 200% zoom
- [ ] Reduced-motion and forced-colors checks pass
- [ ] Suite matches the Phase 1 baseline minus the CLS failure, with nothing new red
- [ ] Parent plan and Phase 9 updated so neither still claims the homepage
- [ ] `design-guidelines.md` records the motif and the accent rule; §6 unchanged
- [ ] Journal entry and delivery report written

## Risk Assessment

| Risk | Mitigation |
|---|---|
| WebKit fails a homepage case for the same reason it fails the existing skip-link test | Diagnose separately. If it is the same root cause, say so in the report and escalate — do not fix a known-red Phase 3 defect inside this gate without the operator agreeing to widen scope |
| CLS after a drop is non-zero because the picker was under-reserved | Fix in Phase 6's component, not by excluding the entry from the observer. Weakening the assertion defeats the check |
| Documentation sweep silently narrows parent Phase 9 too far | Only the homepage moves. Legal, non-tool content and SEO machinery stay. Diff the phase file and confirm nothing else was removed |
| A green gate hides that copy was never operator-approved | Phase 5's approval is a success criterion there and is re-checked here before the delivery report is written |
