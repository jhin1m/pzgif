---
phase: 1
title: "Preset tables and touched tracking"
status: complete
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Preset tables and touched tracking

## Overview

The preset value tables, and the intent-tracking change that lets a chip click
survive a probe. No visual change ships here. This is the phase that touches
code all nine tools run through, so its whole job is to reach today's code path
for the seven that pass no preset table.

## Requirements

**Functional**
- A preset resolves to a **complete** `ControlValues`: every control id the tool renders, with the runtime type that control's reader expects.
- Intent is explicit: a preset id, or custom.
- Any `setValue` marks intent custom.
- A probe landing re-resolves the active preset; with custom intent it does not touch values.
- `startOver` restores the default preset so the next file is sized.
- `resetSettings` selects the default preset. The Reset button stays on both tools.
- Tools passing no preset table reach today's `valuesForProbe` line unchanged.

**Non-functional**
- `values` stays in `useState` with its functional updater. No derived-in-render.
- No new dependency, no test-harness change, no engine change, no `JobSpec` change.
- `GifWorkbench` gains no device knowledge.

## Architecture

### Intent lives in a ref, values stay in state

```ts
// As built. `{kind:"auto", presetId: null}` is the state of the seven tools
// with no table: the page still owns the values, and there is no preset to
// re-resolve — which is what routes them to today's `valuesForProbe` line.
type ToolIntent =
  | { kind: "auto"; presetId: string | null }
  | { kind: "custom" };
const intentRef = useRef<ToolIntent>({ kind: "auto", presetId: defaultPresetId });
```

**Why a ref and not state.** The probe callback is handed to `job.probe()` when
the file is dropped and is never recreated (`gif-workbench.tsx:306-329`, deps
`[defaultValues, job, valuesForProbe]`). A state value read inside it is the
value from drop time. Today's guard is race-free precisely because it evaluates
`untouched(current, …)` *inside* the functional updater, where `current` is
whatever React holds at execution. A ref preserves that property for intent.

The chip's pressed state is separate `useState` — refs do not re-render. One
helper writes both so they cannot drift:

```ts
const setIntent = useCallback((next: ToolIntent) => {
  intentRef.current = next;
  setPresetId(next.kind === "auto" ? next.presetId : null);
}, []);
```

### The four write sites

| Line | Site | Change |
|---|---|---|
| `:293` | `setValue` | keep `setValues(current => ({...current,[id]:value}))`; add `setIntent({kind:"custom"})` |
| `:323` | probe callback | decision moves inside the updater, reading `intentRef.current` |
| `:340` | `startOver` | `setIntent({kind:"preset", id: defaultPresetId})` before `setValues(defaultValues)` |
| `:355` | `resetSettings` | same, then resolve the default preset if one exists |

`gif-compressor-tool.tsx` is not a `GifWorkbench` consumer and needs the same
four behaviours. To avoid two copies of the state machine (red team finding 15),
extract them into `src/components/tool/use-tool-intent.ts` and consume it from
both. The hook owns `intentRef`, `presetId`, `setIntent`, and the probe-guard
helper; it owns no `values` state, which stays with each caller.

### Preset completeness is the honesty rule here

`SettingsForm` renders a slider as `value={numberValue(values, control.id,
control.min)}` (`settings-form.tsx:105`) while `buildSpec` reads
`numberValue(current, "quality", 80)` (`gif-compressor-tool.tsx:174`). A missing
key therefore shows **1** and runs **80**. And `colours` is read as a string —
`Number(stringValue(values, "colours", "256"))` (`:151`) — so a numeric `128`
fails the type guard and silently falls back to 256, disabling the preset
entirely.

So: **a preset returns every control id, correctly typed.** Inertness is
expressed through `ControlDef.disabled` plus the existing
`qualityCappedPalette` copy, which is already how the page says it. An absent
key is not a UI state.

### No ladder snapping

The first draft required `resolve()` to snap to `WIDTH_LADDER`/`FPS_LADDER`,
justified by "admission control silently reduces anything off-ladder". That is
not what the engine does — `plan.ts:222-224` puts the requested width first and
only walks rungs strictly below it, so an off-ladder width that fits the budget
is honoured verbatim:

```ts
const widthOptions = spec.geometry.pinWidth
  ? [wantedWidth]
  : [wantedWidth, ...WIDTH_LADDER.filter((value) => value < wantedWidth)];
```

Snapping would have downscaled a 500px GIF to 480 on the compressor's default
path. The rule is deleted. `mp4-to-gif`'s table happens to sit on ladder values
because its own sliders already do; that is a property of the table, not a
contract on `resolve()`.

## Related Code Files

- Create: `src/lib/presets/tool-presets.ts` — the two tables + `resolve`
- Create: `src/lib/presets/tool-presets.test.ts`
- Create: `src/components/tool/use-tool-intent.ts`
- Modify: `src/components/tool/gif-workbench.tsx` — `:89-96` (delete `untouched`), `:282-293`, `:323-325`, `:335-341`, `:353-360`
- Read only: `src/components/tool/settings/settings-form.tsx`, `src/lib/media/plan.ts`, `src/lib/media/limits.ts`

## Implementation Steps

**Tests first — vitest, pure logic only** (see `plan.md` → Testing approach for
why nothing stateful is unit-tested here).

1. `tool-presets.test.ts`: for each preset of each tool, assert the resolved
   record's key set **equals** that tool's control-id set, and assert each
   value's `typeof` matches what the tool's reader uses (`colours` string,
   `quality`/`width`/`fps` number, `dropFrames` boolean).
2. Assert `balanced.resolve()` reproduces today's `DEFAULT_VALUES` for a given
   probe, on both tools — this is the byte-identical anchor.
3. Assert no two presets of the same tool resolve identically.
4. Assert `resolve()` degrades on `probe: null` rather than throwing.
5. Run. Red.

**Then implement.**

6. Write `tool-presets.ts` with both tables. Compressor widths are factors of
   the source; `mp4-to-gif` values come from the caller's already-resolved
   `TierBudget`.
7. Write `use-tool-intent.ts`.
8. Rewire `gif-workbench.tsx`'s four write sites. Delete `untouched()`.
9. Confirm the `currentFileRef.current !== next` guard at `:313` is untouched —
   under any intent model a stale probe must still be dropped.

## Success Criteria

- [x] `tool-presets.test.ts` green, including key-set equality and per-key `typeof`
- [x] `untouched()` no longer exists; the four write sites each have named behaviour
- [x] `use-tool-intent.ts` is consumed by `gif-workbench.tsx` (the compressor follows in Phase 2)
- [x] `presetById(...)` is `undefined` for all 7 preset-less tools, reaching today's `valuesForProbe` line
- [x] `pnpm typecheck && pnpm lint && pnpm test` green
- [x] All existing tool E2E specs pass with no edits; `faq-crawlability.spec.ts` was rescoped — see `plan.md` → As built #8
- [x] No visual diff on any route from this phase

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The ref/state pair drifts | One `setIntent` helper writes both; nothing else may touch `intentRef` |
| A preset table drifts from its tool's control list | Step 1 asserts key-set **equality**, not superset — adding a control without updating the presets fails the test |
| The 7 preset-less tools regress | Their path is "reach the same line", verified by unedited E2E; a diff in those specs is a stop signal |
| `startOver` still leaves stale intent | Explicit step 8 line item plus a Phase 3 drop-two-files E2E case |
