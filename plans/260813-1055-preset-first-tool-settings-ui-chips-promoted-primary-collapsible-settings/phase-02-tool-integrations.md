---
phase: 2
title: "Tool integrations"
status: complete
priority: P1
effort: "0.5-1d"
dependencies: [1]
---

# Phase 2: Tool integrations

## Overview

Both pages, both UI pieces, one phase — they share the column reorder and the
Reset decision, and splitting them is what let the first draft ship Reset
removed on one tool and kept on the other.

Neither UI piece is a new component. The disclosure reuses the accordion's CSS
technique; the chip row is the existing `PresetChips` widened by three lines of
type signature.

## Requirements

**Functional**
- Column order on both tools: chip row → primary + reason line → settings.
- Settings collapsed below `lg`, open at `≥lg`.
- Chip row's `disabled` is identical to `SettingsForm`'s: `flow === "idle" || locked`.
- Every path that changes what the job runs clears the active chip — `setValue`, `onChangeSetting`, **and** `onRunDegraded`.
- Reset stays on both tools, meaning "return to the default preset".

**Non-functional**
- No `matchMedia`, no `window.innerWidth`, and no JS knowledge of the breakpoint — because nothing now needs it.
- The primary's `aria-describedby` target stays outside the collapsible region.
- Collapsed content stays in the DOM.

## Architecture

### The disclosure is CSS, and only CSS

`globals.css:706-716` already defines the collapse used by the FAQ:

```css
.pz-acc-panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 150ms ease-out; }
.pz-acc-panel[data-state="open"] { grid-template-rows: 1fr; }
.pz-acc-panel > div { overflow: hidden; }
```

Content never leaves the layout, so it stays crawlable and stays in the served
HTML. Add one `lg:` rule forcing `1fr` regardless of `data-state`, and render
the toggle button `lg:hidden`. That is the whole mechanism. No effect, no
attribute, no breakpoint read.

**`hidden="until-found"` is deliberately not carried over from `accordion.tsx`.**
§5.12 mandates it so Chrome's find-in-page can reveal a collapsed FAQ *answer* —
prose that is the crawl surface. Settings labels are not that, and the attribute
is what made the first draft self-contradictory: it must be attached from JS,
JS was forbidden from knowing the breakpoint, and at `≥lg` it would have applied
`display:none` to a panel the CSS says is open. Dropping it removes the
contradiction and the `beforematch` state-correction handler along with it.

### The chip row is `PresetChips`, widened

The first draft justified a second component by claiming `preset-chips.tsx`
"carries `dimensions` on every chip and a legend describing a Discord surface".
Both halves are false: `dimensions` is already optional
(`preset-chip.tsx:27`) and `legend` is already a plain hand-written `string`
(`preset-chips.tsx:29-30`). Only three of its six props are Discord-typed.

Widen in place:

```ts
presets: readonly { id: string; dimensions?: string }[]
selected: string | null      // null renders no pressed chip — the custom state
onSelect(id: string): void
```

`discord-workbench.tsx:436` is the only existing caller; it moves its
`` `${width}×${height}` `` formatting to the call site. One component, one set of
a11y semantics, one `/dev/states` row.

### Reset, decided once

`GifWorkbench` renders Reset for all eight of its tools at `:734-737`, and the
compressor renders its own at `:691-698`. Removing it from one and not the other
would ship an inconsistency and leave `resetSettings` calling a setter with no
defined meaning. **It stays on both**, redefined as "select the default preset".

### `onRunDegraded`

`job-error.tsx`'s degraded path splices the engine's plan straight into the spec
(`gif-workbench.tsx:562-573`, `gif-compressor-tool.tsx:498-512`) and never calls
`setValue`, so nothing in it can clear a chip. Without a fix, a user who accepts
"Run at 320px, 10fps" keeps a pressed `Smoothest` chip and sliders reading
480/20 while the job runs 320/10 — the exact displayed-versus-executed
divergence this plan exists to prevent. Both call sites must set intent to
custom before running.

### Presets, resolved on the page

**gif-compressor** — `colours < 256` pins the encoder to `gifenc`
(`:153-155`), so Quality goes inert. Quality is still *returned*, at the value
`buildSpec` would use, so the disabled slider shows a true number.

| id | quality | colours | width | dropFrames |
|---|---|---|---|---|
| `smallest` | `80` (disabled, `qualityCappedPalette`) | `"128"` | `round(source × 0.75)` | `true` |
| `balanced` *(default)* | `80` | `"256"` | source width | `false` |
| `sharpest` | `95` | `"256"` | source width | `false` |

`balanced` reproduces today's `DEFAULT_VALUES` exactly. `colours` is a **string**
— `:151` reads it through `stringValue`.

**mp4-to-gif** — resolved on the page, where `budget` already exists
(`:156-157`). `trim` is `kind:"custom"` and no preset returns `trimFrom`/`trimTo`;
because values are merged into existing state rather than replacing it, a chosen
span survives a chip click.

| id | Desktop `{480,15}` | Mobile `{320,10}` |
|---|---|---|
| `smallest` | 320 / 10 / q70 | 240 / 8 / q70 |
| `balanced` *(default)* | 480 / 15 / q80 | 320 / 10 / q80 |
| `smoothest` | 480 / 20 / q90 | 320 / 15 / q90 |

`smoothest` does not raise width — the engine never upscales and `defaultMaxWidth`
caps it, so a wider value would only be reduced. It trades fps and quality.

## Related Code Files

- Modify: `src/components/tool/preset-chips.tsx` — widen the three prop types
- Modify: `src/components/tool/discord-workbench.tsx` — `:436`, move dimension formatting to the call site
- Modify: `src/app/globals.css` — one `lg:` rule on `.pz-acc-panel`
- Modify: `src/components/tool/settings-panel.tsx` — the collapsible wrapper + toggle
- Modify: `src/components/tool/gif-workbench.tsx` — column order, chip row, `onRunDegraded`, Reset semantics
- Modify: `src/app/[locale]/gif-compressor/gif-compressor-tool.tsx` — same, plus consume `use-tool-intent`, plus the probe write at `:209-219`
- Modify: `src/app/[locale]/mp4-to-gif/mp4-to-gif-tool.tsx` — pass resolved presets
- Modify: `src/content/` — chip labels for both tools
- Modify: `src/app/[locale]/dev/states/page.dev.tsx` — collapsed/expanded states

## Implementation Steps

**Tests first — Playwright, because all of this is stateful.**

1. `e2e/gif-compressor.spec.ts`: at 768×1024, the primary's bounding box is
   above the first control's. Click each chip, assert the sliders' displayed
   values change to the table's numbers. Drag a slider, assert zero chips pressed.
2. The probe race, both directions: (a) click a chip immediately on drop, let
   the probe land, assert the preset's width holds; (b) drag the width slider
   before the probe lands, assert the dragged value holds.
3. `startOver`: load file A, edit a control, choose a different file B, assert
   B's controls are sized to B.
4. Mid-job: start a job, assert the chip row is disabled while `processing`.
5. Degraded recovery: force a refusal, accept the degraded offer, assert zero
   chips pressed and that the sliders match the executed plan.
6. `e2e/cross-format-tools.spec.ts`: set a trim span, click a chip, assert the
   span is unchanged.
7. `e2e/discord-presets.spec.ts` must pass **unedited** after `PresetChips` is
   widened — that is the widening's regression proof.
8. Run. Red.

**Then implement.** Widen `PresetChips` → `globals.css` rule → `SettingsPanel`
wrapper → compressor (reorder, `use-tool-intent`, probe write, `onRunDegraded`,
Reset) → `mp4-to-gif` → content.

**Resolve open question 1 here**: final English chip names, recorded in the
content file's header comment.

## Success Criteria

- [x] At 768×1024 the primary sits above the controls on both tools
- [x] With no interaction, both tools produce byte-identical output to the pre-change build
- [x] Five of the six green on Chromium and WebKit; the degraded-recovery case was not written — see `plan.md` → As built #10
- [x] `e2e/discord-presets.spec.ts` passes unedited
- [x] No second chip component and no second disclosure component exist
- [x] Grep finds no `matchMedia`, no `window.innerWidth` and no `until-found` in the settings path
- [x] `aria-describedby` on each primary resolves to a node outside the collapsible region
- [x] Reset present and meaningful on both tools
- [x] `tool-copy.test.ts` green with the new chip copy, plus a new assertion that no label appears on both rows

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Widening `PresetChips` breaks the 4 Discord routes | Step 7 makes their unedited spec the gate; the change is a type widening plus one call-site move |
| The `lg:` CSS rule loses to `.pz-acc-panel`'s specificity | Both are single-class author rules; assert computed `grid-template-rows` at `xl` in Phase 3 rather than assuming |
| The compressor's copy of the intent logic drifts from the workbench's | Both consume `use-tool-intent.ts` from Phase 1; a second implementation is a review stop signal |
| Chip labels read as generic and trip `tool-copy.test.ts` | Write against each tool's own levers, run the copy test before finishing |
