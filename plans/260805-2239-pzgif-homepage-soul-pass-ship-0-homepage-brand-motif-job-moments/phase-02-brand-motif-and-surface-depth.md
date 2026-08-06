---
phase: 2
title: "Brand motif and surface depth"
status: complete
priority: P1
effort: "1d"
dependencies: []
---

# Phase 2: Brand motif and surface depth

## Overview

Give the product a repeated visual device that carries meaning, and assign the
already-reserved accent colour a single consistent job. This is the layer every
later phase composes with, which is why it lands before the homepage.

## Requirements

- Functional: a checkerboard alpha motif available as one token-driven utility,
  usable behind any media or empty surface, correct in both themes.
- Functional: `LoopMark` gains an optional personified variant for empty and 404
  states.
- Functional: accent teal is applied to exactly one semantic role and nowhere
  else.
- Non-functional: zero new looping animation. Zero added network bytes. No
  change to `design-guidelines.md` §6.
- Non-functional: the motif must never sit behind body text.

## Architecture

### 1. The checkerboard motif

A checkerboard is the universal signifier for image transparency — anyone who has
opened an image editor reads it instantly. It is not decoration here: it marks
*this is where an image will appear*, which is exactly what the dropzone and the
empty result panel mean.

Implemented as a utility in `globals.css`, built from
`repeating-conic-gradient` against semantic tokens so it inverts with the theme
automatically:

```css
/* Motif — the checkerboard that marks a media surface.
   Not decoration: it means "an image belongs here". Kept below text at all
   times, and below the contrast floor so it never competes with content. */
@utility bg-checker {
  background-image: repeating-conic-gradient(
    var(--checker-tint) 0% 25%,
    transparent 0% 50%
  );
  background-size: 16px 16px;
}
```

`--checker-tint` is a new semantic token: a low-alpha neutral in light theme, a
low-alpha lift in dark. It belongs in the `:root` / `[data-theme]` block (plain
CSS variables, block 4), **not** inside `@theme` — `globals.css:14-16` records
why: values inside `@theme` are snapshotted at build time and stop responding to
theme changes.

Applied in this phase to `dropzone.tsx` (idle state) only. Phase 3 applies it to
the empty result panel. The homepage picks it up in Phase 6.

### 2. LoopMark as a recurring device

`marks.tsx:34` already exports a 96px `LoopMark` used in exactly one place. Add
an optional `personified` prop that renders two small eye dots on the left lobe.
Same SVG, same viewBox, no new asset, no new request.

Used in: the empty result panel (Phase 3), `not-found.tsx`, and as a faint
watermark behind the homepage hero dropzone (Phase 6).

This is the operator's mascot request, delivered at the cost the brainstorm
report justified — the full multi-pose mascot stays out of scope.

### 3. Accent gets one job

`globals.css:36-39` reserves three teal steps and `design-guidelines.md` caps
accent at under 5% of surface. Today it is spent on the trust-line lock glyph and
little else.

**Assign it one meaning: teal is the winning number.** Specifically the
post-operation size and the delta badge — the evidence that the product did what
it claimed. Nothing else in the product may use accent as a fill.

`SizeDelta` in `result-panel.tsx:69-90` currently renders the "after" value in
`text-fg` and the badge as `variant="success"` (green). Green already means
"status: ok" on `JobError` and the progress checkmark; using it for the headline
number spends a status colour on a non-status. Phase 3 makes the swap; this phase
only records the rule and adds the token alias.

## Related Code Files

- Modify: `src/app/globals.css` — `--checker-tint` semantic token (both themes),
  `@utility bg-checker`, accent-role comment
- Modify: `src/components/brand/marks.tsx` — `personified` prop on `LoopMark`
- Modify: `src/components/tool/dropzone.tsx` — apply `bg-checker` to the idle box
- Modify: `src/app/[locale]/dev/states/page.tsx` — add the motif and the
  personified mark so both are reviewable before they reach product pages
- Modify: `src/components/theme-tokens.test.ts` — assert `--checker-tint`
  resolves in both themes

## Implementation Steps

1. Add `--checker-tint` to the `:root` and `[data-theme="dark"]` blocks. Place it
   with the other semantic tokens, in block 4 — never inside `@theme`.
2. Add the `bg-checker` utility. Verify the tile size reads as a checkerboard and
   not as noise at 320px and at 200% zoom.
3. Apply it to the `dropzone.tsx` idle box, under the existing border and
   background. Confirm the drag-over state still tints correctly on top of it.
4. Add `personified` to `LoopMark`. Eyes are two `<circle>` elements; the mark
   stays `aria-hidden` because the surrounding copy carries the meaning.
5. Render both on `/dev/states` and review side by side in light and dark.
6. Extend `theme-tokens.test.ts`.
7. Add the accent-role comment to `globals.css` next to the accent primitives, so
   the next person who reaches for teal knows what it is reserved for.

## Success Criteria

- [ ] `bg-checker` renders correctly in light and dark without a per-theme override at the call site
- [ ] The motif is visible on the idle dropzone and does not interfere with the drag-over or invalid states
- [ ] The motif appears behind no body text on any surface
- [ ] `LoopMark personified` renders and stays `aria-hidden`
- [ ] `/dev/states` shows both additions
- [ ] `--checker-tint` is in the plain-CSS block, not `@theme`; `theme-tokens.test.ts` asserts it
- [ ] No new keyframes, no new animation, `globals.css` §6 block untouched
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green
- [ ] `/dev/states` does not regress the existing 320px overflow failure — it must not get worse

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Checkerboard reads as visual noise rather than a signifier | Review on `/dev/states` at 320px, 1440px and 200% zoom before it reaches product pages. If it reads as noise at low opacity, the tile is too small — raise to 20-24px rather than raising opacity |
| The motif fails forced-colors mode | `design-guidelines.md:565` requires a forced-colors sanity check. A background image is dropped in forced-colors, which is correct — the surface still has its border |
| `bg-checker` gets used behind text by a later phase | Stated as a rule in the utility's own comment, and re-checked in Phase 7's review |
| Personified mark pushes the tone toward playful and away from privacy-serious | Two dots only. If review says it undercuts the trust line, drop the eyes and keep the plain mark — the motif carries the phase on its own |
