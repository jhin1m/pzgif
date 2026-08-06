---
phase: 3
title: "Result and empty state moments"
status: complete
priority: P1
effort: "1-1.5d"
dependencies: [1, 2]
---

# Phase 3: Result and empty state moments

## Overview

The two moments the operator named. Turn job completion from a fade into a
statement with a next step, and turn the pre-file box from occupied space into an
explanation. Applies to all five live tool pages through one shared component.

## Requirements

- Functional: on completion the result panel shows a success mark, the size
  delta, a primary download action, and live related tools.
- Functional: before a file exists, the panel says what will appear there.
- Non-functional: `min-height` is unchanged in both states — the reservation is
  the only reason completion causes no shift (`result-panel.tsx:8-14`).
- Non-functional: no looping animation; the success mark plays once and stops.
- Non-functional: under `prefers-reduced-motion` the mark appears instantly and
  the meaning survives.

## Architecture

### The done state

Today `ResultPanel` is a box and each tool composes its own contents, so the
completion moment is whatever each page assembled. `gif-workbench.tsx` covers
four tools and `gif-compressor-tool.tsx` covers the fifth.

Add a `ResultSummary` composition to `result-panel.tsx` that both call:

```
┌────────────────────────────────────────────┐
│  ✓  2.4 MB  →  480 KB          [ −80% ]    │  ← check-pop 200ms, accent teal
│     You just cut 1.9 MB.                   │  ← one line, hand-written
│                                            │
│     [ ⬇ Download GIF ]                     │  ← primary button
│  ──────────────────────────────────────    │
│     Next?  [ Resize ]  [ Crop ]            │  ← relatedLiveRoutes(slug)
└────────────────────────────────────────────┘
```

Four decisions inside that box:

1. **The check mark reuses `pz-check-pop`.** The keyframe exists in
   `globals.css:630` and is used only in `progress-bar.tsx:95`. One 200ms
   micro-bounce, then static — `design-guidelines.md:457` is explicit that a
   looping success animation reads as "still working".
2. **Accent, not success-green, on the headline number and badge.** Per Phase 2's
   rule. Green stays reserved for status. The percentage is text as well as
   colour (`design-guidelines.md` §7.6 — never colour alone).
3. **Download becomes a primary button, not a link among links.** It is the
   conversion action of the entire page.
4. **Related tools come from `relatedLiveRoutes(slug)`**, never `relatedRoutes()`
   — `registry.ts:200-208` exists precisely so a `planned` route cannot be linked
   into a 404.

**Do not add a count-up on the byte numbers.** It is motion that carries no
information, it makes a real number look estimated, and `design-guidelines.md`
§6's list of permitted interactions does not include it.

### The empty state

`result-panel.tsx:33-48` is a dashed 320px box with one grey sentence. Replace
the contents, keep the box:

- `bg-checker` from Phase 2 — the surface now reads as "an image goes here"
- `LoopMark personified` at low opacity
- The existing short line
- Three "what will appear here" rows, hand-written per tool (Phase 5 supplies the
  strings; this phase supplies the slot)

> ⚠️ **Do not wire the live size estimate into this state.**
> `gif-compressor-tool.tsx:289-301` records that the estimate was removed because
> `downscale.ts` holds module-level scratch state and a concurrent estimate
> corrupted job output on the same page in the same minute. The empty state is an
> attractive place to put it and it would reintroduce a measured defect.

## Related Code Files

- Modify: `src/components/tool/result-panel.tsx` — `ResultSummary` composition,
  new empty state, `SizeDelta` recolour
- Modify: `src/components/tool/gif-workbench.tsx` — adopt `ResultSummary`
- Modify: `src/app/[locale]/gif-compressor/gif-compressor-tool.tsx` — adopt
  `ResultSummary`, keeping its bespoke before/after slider above it
- Modify: `src/lib/tools/content.ts` — `ToolContent.result.emptyRows: string[]`
  and `result.savedLine`
- Modify: `messages/en.json` — `tool.nextTools` label only; the per-tool strings
  are content, not UI messages
- Modify: `src/app/[locale]/dev/states/page.tsx` — both states rendered
- Create: `src/components/tool/result-panel.test.tsx` — reservation and
  reduced-motion assertions

## Implementation Steps

1. Extend `ToolContent` with the `result` block. Update all five content JSON
   files with placeholders; Phase 5 replaces them with final copy.
2. Build `ResultSummary` in `result-panel.tsx`. Keep `SizeDelta` as its own
   export — it is already tested and used.
3. Recolour the headline number and badge to accent. Confirm contrast against
   `--color-accent-700` (the text-safe teal, `globals.css:39`) in both themes.
4. Add the related-tools row using `relatedLiveRoutes(slug)`. When it returns
   fewer than two entries, render nothing rather than a lonely chip.
5. Rebuild the empty state with `bg-checker`, the personified mark and the rows.
   **Measure the box before and after** — `min-h-80` must not change.
6. Adopt `ResultSummary` in `gif-workbench.tsx` and the compressor. The
   compressor keeps its before/after slider; the summary sits under it.
7. Render both states on `/dev/states`.
8. Write `result-panel.test.tsx`: same `min-height` in both states; the check
   mark's animation class is present; the percentage appears as text.
9. Re-run the compressor CLS test from Phase 1. It must still assert `0`.

## Success Criteria

- [ ] Completion shows: check mark, delta, primary download, related live tools
- [ ] The success mark plays once and does not loop
- [ ] Under `prefers-reduced-motion` the mark appears instantly and the panel still reads as "done"
- [ ] The percentage is conveyed as text, not by colour alone
- [ ] Related tools never link a `planned` route
- [ ] Empty state shows the motif, the mark and three "what appears here" rows
- [ ] `min-h-80` is byte-identical between the empty and filled branches
- [ ] The Phase 1 CLS test still asserts `0` and still passes
- [ ] No live size estimate anywhere in either state
- [ ] All four `gif-workbench` tools and the compressor render the new summary
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` green (against the Phase 1 baseline)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The richer done state grows the panel and reintroduces CLS | The growth follows a click, so it is `hadRecentInput` — but verify, do not assume. Re-run the Phase 1 test as step 9 |
| Accent teal fails contrast on the delta badge | `--color-accent-700` is the token annotated "text-safe" in `globals.css:39`. Check both themes with a contrast tool, not by eye |
| `ResultSummary` becomes a configuration language the way `phase-05` warned about | It takes rendered values and children, never a config object. If a tool needs something it cannot express, that tool composes around it — the compressor already does this with its slider |
| Empty-state rows drift into templated copy | They are per-tool content in `src/content/`, covered by the Phase 5 similarity assertion |
