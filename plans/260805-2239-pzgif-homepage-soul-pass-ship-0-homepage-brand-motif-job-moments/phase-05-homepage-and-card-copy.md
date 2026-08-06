---
phase: 5
title: "Homepage and card copy"
status: complete
priority: P1
effort: "1-1.5d"
dependencies: []
---

# Phase 5: Homepage and card copy

## Overview

Every word the homepage will say, written by hand, plus one benefit line per live
tool card and the per-tool strings Phase 3's states need. This is the only phase
gated on operator approval rather than on code, so it should start early.

## Requirements

- Functional: `src/content/home.json` carries the complete homepage copy against
  a typed schema.
- Functional: each of the five live tool content files gains a card benefit line
  and the Phase 3 result/empty strings.
- Non-functional: **no claim without a measurement.** No "80% smaller", no "10×
  faster", no tool count that `liveRoutes()` does not support.
- Non-functional: no two cards may differ only by substituted nouns — that is the
  exact failure mode Google's scaled-content-abuse policy penalises, and the
  penalty is site-wide.
- Non-functional: `src/content/` stays pure `.json`; the schema is code and lives
  in `src/lib/content/home.ts`.

## Architecture

### Schema placement

`content.ts:1-20` records the rule: `src/content/` is `LICENSE-CONTENT`
(all-rights-reserved) while the repository is AGPL-3.0, and keeping that
directory to data files makes the licence boundary visible in the file tree.
`HomeContent` therefore lives in `src/lib/content/home.ts` alongside a
`homeContent()` validator mirroring `toolContent()`.

```ts
export interface HomeContent {
  hero: { title: string; lead: string; dropzoneTitle: string;
          dropzoneCaption: string; reassurance: string };
  picker: { heading: string; unsupportedTitle: string;
            unsupportedBody: string; comingSoon: string };
  grid: { heading: string; subhead: string };
  why: readonly { heading: string; body: string; evidence?: string }[];
  discord: { heading: string; body: string; cta: string };
  meta: { title: string; description: string };
}
```

`ToolContent` gains:

```ts
card: { benefit: string };                    // one line, homepage grid
result: { savedLine: string; emptyRows: readonly string[] };  // Phase 3
```

### The three claims that need evidence

The "Why PZGIF" block is three tiles. Two write themselves from architecture; the
third is the product's whole positioning and is the one that can go wrong.

| Tile | Claim type | Source |
|---|---|---|
| Runs in your tab | Architectural fact | True by construction — no server exists in the free path |
| Nothing is uploaded | Architectural fact | Same. This is the trust line's expansion, not a new claim |
| Output quality | **Empirical** | `bench-results/` — 36 entries. **Gate G6 is unscored** (parent `plan.md:95-99`): whether gifski is *visibly* better than gifenc at matched bytes is still open |

**Consequence for the third tile:** it may state what the encoder is and what it
measurably produced on a named fixture. It may **not** claim it beats an
alternative until G6 is scored. If no `bench-results/` entry is quotable with its
hardware, the tile goes qualitative — describing the approach, not a number.

An invented number here is worse than no number: it is the exact defect the
parent plan's Phase 11 copy audit exists to catch, shipped deliberately.

### Forbidden borrowings from the wireframe

Parent `plan.md:24` documents four wireframe copy defects. This phase adds a
fifth. All five are banned:

| Wireframe text | Why it cannot ship |
|---|---|
| "Shrink file size up to 80% with gifski" | Unbacked. No measurement supports 80% as a general figure |
| "roughly a tenth of the size" (GIF→MP4) | Unbacked, and the tool is `planned` anyway |
| "up to 150 MB" | Contradicted by the memory model — the binding constraint is decoded RGBA, not file size |
| Footer listing GIF→WebP and Slack | Cut from scope |
| **"Nine tools. All of them run locally."** | **Five are live.** New defect, found while planning this phase |

The wireframe remains the **voice** reference. Borrow the rhythm — short
sentences, concrete nouns, second person, no exclamation marks — and none of the
numbers.

### Honest framing of the tool count

The grid renders `liveRoutes()`. The sub-head states the real count and says
plainly that more are coming, rather than implying the set is complete or
inflating it. Getting this right once matters beyond honesty: Ships 2-4 will add
cards, and a sub-head phrased around a fixed number needs rewriting each time.

## Related Code Files

- Create: `src/lib/content/home.ts` — `HomeContent` + `homeContent()` validator
- Create: `src/content/home.json`
- Modify: `src/lib/tools/content.ts` — `card` and `result` blocks on `ToolContent`
- Modify: `src/content/gif-compressor.json`, `resize-gif.json`, `crop-gif.json`,
  `gif-speed-changer.json`, `reverse-gif.json`
- Modify: `src/lib/tools/tool-copy.test.ts` — card-benefit assertions
- Create: `src/lib/content/home.test.ts` — schema and claim assertions

## Implementation Steps

1. Read `bench-results/` and list every figure that is quotable **with the
   hardware it was measured on**. Anything without recorded hardware is not
   quotable.
2. Write `home.ts`. Validator mirrors `toolContent()`: throws on a missing field
   rather than rendering a blank section.
3. Draft `home.json`. Hero first, then picker states, grid, why, Discord teaser,
   meta.
4. Write the five card benefit lines. Each names something true of that tool
   alone. A line that would still make sense with another tool's name swapped in
   is a failure and must be rewritten.
5. Write the per-tool `result.savedLine` and `result.emptyRows` for Phase 3.
6. Extend `tool-copy.test.ts`: every live route has a `card.benefit`; no two
   benefits share more than a threshold of tokens; no benefit contains a digit
   followed by `%` or `×` unless it is in an allow-list checked against
   `bench-results/`.
7. Write `home.test.ts`: the schema validates; the grid sub-head contains no
   integer that disagrees with `liveRoutes().length`; no banned wireframe string
   appears.
8. **Present the full copy to the operator for approval before Phase 6 merges.**

## Success Criteria

- [ ] `home.json` covers every homepage surface with hand-written prose
- [ ] All five tool files carry a card benefit and the Phase 3 result strings
- [ ] No numeric claim without a `bench-results/` entry naming its hardware
- [ ] The third "why" tile does not claim superiority over another encoder while G6 is unscored
- [ ] No banned wireframe string appears anywhere, asserted by test
- [ ] Grid sub-head is truthful about the live tool count and survives Ships 2-4 unedited
- [ ] No two card benefits are noun-swaps of each other, asserted by test
- [ ] `src/content/` contains only `.json`; no schema leaked into it
- [ ] Operator has approved the copy
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green

## Risk Assessment

| Risk | Mitigation |
|---|---|
| No `bench-results/` figure is quotable with hardware | Fall back to qualitative tiles. Recorded as an accepted outcome, not a blocker — step 1 decides this before any copy is drafted |
| Copy approval blocks Phase 6 | Phase 5 has no code dependencies and can start on day 1, in parallel with Phases 1, 2 and 4 |
| Similarity test is too strict and blocks legitimately similar tools (resize/crop) | Tune the threshold against the five real lines, not a guessed constant. The test's job is to catch noun-swaps, not to enforce artificial variety |
| A later ship adds a card and quietly reintroduces templated copy | The assertion runs over all live routes, so it tightens automatically as cards are added |
