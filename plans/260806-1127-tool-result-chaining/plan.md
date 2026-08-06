---
title: "Result chaining — hand a finished file to the next tool"
description: "Wire the NextTools chip row into the existing pending-file handoff so a finished result moves to another tool without a download/re-upload round trip, filtered by format compatibility."
status: complete
priority: P2
effort: "~half a day"
tags: [tool-framework, handoff, registry, ux]
created: 2026-08-06
blockedBy: []
blocks: []
---

# Result chaining — hand a finished file to the next tool

## Overview

A finished result is a `Blob` living in the tab. Today, moving it to another
tool means downloading it and dragging it back — a round trip through disk for a
file that never left the JavaScript realm.

The `NextTools` chip row already sits in the result panel, and the
`pending-file` handoff already carries files from the homepage into tool pages.
This plan connects the two. **No new mechanism** — the same wire, with a second
sender.

Brainstorm: `plans/reports/from-brainstorm-to-planner-result-handoff-chaining-260806-1127-tool-result-chaining-report.md`

## What is deliberately not in scope

- **Multi-step pipeline builder.** A different product: needs a job queue in
  `JobController`, chain-building UI, and it breaks the one-page-one-tool model
  SEO depends on.
- **A "continuing from X" banner on the destination page.** `FileChip` already
  shows the name and size. Chrome for information already on screen.
- **Keeping the intermediate result recoverable.** Two 200 MB blobs alive at
  once on iOS is exactly what admission control exists to prevent, and it fights
  the clear-on-read property `pending-file.ts` is built around.
- **Filename normalisation.** Names accumulate suffixes
  (`loop-compressed-cropped.gif`). Truthful, and each tool already derives its
  own `downloadName` from `file.name`.

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Chain the result into the handoff](phase-01-chain-result-into-handoff.md) | complete |

One phase — the change is a registry helper, one component, and two call sites.

## The three standing rules

Unaffected, and must stay that way:

1. No `SharedArrayBuffer` / `COOP` / `COEP`. Nothing here touches isolation.
2. No fabricated progress. A chip is navigation, not a job.
3. No templated prose. The row label is shared chrome in `messages/`; chip
   labels are `route.name` from the registry. **No dependency on Phase 9.**

## Acceptance criteria

- [x] Finishing a job in `gif-compressor` and clicking a chip lands on the
      destination tool with the produced file already loaded and probed — no
      empty dropzone, correct name and size in the `FileChip`.
- [x] Same for the four tools served by `gif-workbench` (crop, resize, speed,
      reverse).
- [x] Chips only offer destinations whose `inputFormats` accept the format that
      was actually produced.
- [x] ⌘-click / Ctrl-click on a chip does not leave an armed handoff that a
      later navigation to a different tool consumes. **Widened during review:**
      the address alone does not cover a later navigation to the *same* tool, so
      the chip now stashes only on a plain left click.
- [x] A tool page reached by link, reload, or back button still renders its own
      dropzone — the cold path is unchanged.
- [x] `dev/states` gallery renders the row with no result and no crash.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass. `pnpm test:e2e` passes
      every spec this change touches; the three red tests in
      `e2e/component-states.spec.ts` are red at HEAD too (a typography specimen
      overflows `/dev/states` at 320px, plus a WebKit skip-link check) and are
      unrelated. Tracked separately.
- [x] `pnpm check:forbidden` and `pnpm check:static` pass.

## Open questions

- ~~Exact wording for the `tool.nextTools` label.~~ **Settled: "Send to".** The
  proposed "Send this to" broke `e2e/result-panel-reservation.spec.ts` — it
  wrapped `reverse-gif`'s chip row onto another line and overran the base and
  `min-[480px]` bands by 23px and 47px. The label shares a flex line with the
  chips, so its length is load-bearing; this is now recorded in
  `docs/design-guidelines.md`.
- Whether `planned` routes should appear as disabled chips. Currently filtered
  out by `isLive`. Not answerable until Phase 7 ships a route that produces a
  non-GIF.
