# Phase 1 — Chain the result into the handoff

**Status:** complete · **Depends on:** nothing

## Context

Read before starting:

- `src/lib/handoff/pending-file.ts` — the whole design rationale is in its
  header comment, including the ⌘-click hazard this phase adds a second
  trigger for. Do not re-derive it; do not "improve" the isolation with shared
  storage.
- `src/hooks/use-handoff-file.ts` — the consumer. **Unchanged by this phase.**
- `src/components/tool/next-tools.tsx` — the component being extended. Its
  header explains why the row caps at 2 and why it hides under 2. Step 3 changes
  the second of those two rules and must update the comment with the reason.
- `src/lib/tools/registry.ts` — `relatedLiveRoutes()` at the end of the file is
  the sibling to model the new helper on.

## Requirements

Clicking a chip in the result panel stashes the produced file into the
`pending-file` handoff addressed to that chip's route, then navigates. The
destination page's existing `useHandoffFile(slug, handleFile)` picks it up. No
tool page's intake logic changes.

Chips must only offer destinations that can actually decode what was produced.

## Files

**Modify**

| File | Change |
|---|---|
| `src/lib/tools/registry.ts` | Add `chainTargets(slug, produced)` |
| `src/lib/tools/registry.test.ts` | Cover the new helper |
| `src/components/tool/next-tools.tsx` | `"use client"`, `result` prop, `onClick`, drop min-2 to min-1 |
| `src/components/tool/gif-workbench.tsx` (~line 496) | Pass `result` |
| `src/app/[locale]/gif-compressor/gif-compressor-tool.tsx` (~line 606) | Pass `result` |
| `messages/en.json` (line 83, `tool.nextTools`) | Relabel |

**Create**

| File | Purpose |
|---|---|
| `src/components/tool/next-tools.test.tsx` | Click stashes the right file at the right address |
| `e2e/tool-chaining.spec.ts` | One real chain, end to end |

**Do not modify**

`src/lib/handoff/pending-file.ts` — it already does everything needed, including
addressing the handoff to a named destination. `src/hooks/use-handoff-file.ts`.
Any tool page's `handleFile`. `src/app/[locale]/dev/states/page.tsx` — it calls
`NextTools` without a result and must keep working via the optional prop.

## Steps

### 1. `chainTargets()` in `registry.ts`

Add beside `relatedLiveRoutes()`:

```ts
export function chainTargets(
  slug: string,
  produced: MediaFormat,
): readonly ToolDefinition[]
```

Take `relatedLiveRoutes(slug)` and keep only routes whose `inputFormats`
includes `produced`. Author order is preserved — `related` is a deliberate
editorial sequence, not an alphabetical accident.

Comment must say **why** the filter exists, not what it does: today every live
route is GIF→GIF so the filter is a no-op, and its entire value is Phase 7 —
without it a chip would hand a `.zip` from `split-gif-to-frames` to `crop-gif`,
which dies as `decode-failed`, the generic bucket the "never a dead end" rule
exists to keep files out of.

Keep `relatedLiveRoutes()` as-is. The foot-of-page related grid is for a reader
who is still browsing and has no file in hand; it must not be format-filtered.

### 2. `chainTargets()` tests in `registry.test.ts`

- Drops a related route whose `inputFormats` excludes the produced format.
- Preserves author order from `related`.
- Excludes `planned` routes.
- Returns `[]` for an unknown slug.
- Never returns the source slug itself.

### 3. `NextTools` carries the file

Add `"use client"` — the component now has an event handler.

New optional prop:

```ts
result?: { blob: Blob; name: string; format: MediaFormat } | null;
```

`format` is **explicit, never inferred.** `outputFormats` can hold more than one
entry (`split-gif-to-frames`: `png` | `zip`) and `blob.type` is a second source
of truth for the same fact. The page knows exactly what it just produced.

Route selection: `chainTargets(slug, result.format)` when a result is present,
`relatedLiveRoutes(slug)` when it is not — so the state gallery and any
result-less render keep today's behaviour exactly.

`onClick` (only when `result` is present):

```ts
setPendingFile(new File([result.blob], result.name, { type: result.blob.type }), route.slug)
```

Let `Link` navigate normally afterwards. Do not `preventDefault`, do not push
the route manually — the ⌘-click case is already handled on the receiving side
by `takePendingFile(slug)` matching the address, and that test already exists.

**Change the minimum from 2 chips to 1.** Update the header comment: the "one
lonely chip reads as a broken list" reasoning holds for a *suggestion list*, but
a chip carrying a file is an *action*. After format filtering, `gif-to-mp4` has
exactly one valid destination (`mp4-to-gif`); hiding the row there removes the
feature's main value. **The cap of 2 stays** — its reasoning (panel height is
reserved before the content exists, and a third chip wraps to a third 44px line
at 375px) is untouched.

### 4. Relabel the row

`messages/en.json` → `tool.nextTools`. `"Next?"` describes navigation; the row
now moves a file. Proposed: **`"Send this to"`**. Shared chrome, not per-tool
prose, so no Phase 9 dependency — but confirm the string before merging.

### 5. Wire the two call sites

`gif-workbench.tsx` (~496) and `gif-compressor-tool.tsx` (~606). Both already
have `resultBlob` and `downloadName` in scope at that point:

```tsx
next={
  <NextTools
    slug={SLUG}
    label={t("nextTools")}
    result={resultBlob ? { blob: resultBlob, name: downloadName, format: "gif" } : null}
  />
}
```

`"gif"` is a literal at both sites today — both produce GIF and nothing else.

### 6. Component test

`next-tools.test.tsx`:

- Click stashes a file `takePendingFile(destinationSlug)` then returns, with the
  expected name.
- The stash is addressed to the clicked route, not the source:
  `takePendingFile(sourceSlug)` returns `null`.
- With `result` omitted, clicking stashes nothing (gallery path).
- Renders one chip when only one destination survives the format filter.

### 7. E2E

`e2e/tool-chaining.spec.ts` — one chain, `gif-compressor` → `crop-gif`:

Load `e2e/fixtures/loop-small.gif`, run the compressor, wait for the result
panel, click the Crop chip, then assert on `/crop-gif` that the file chip shows
the compressed file's name and a non-zero size and that no empty dropzone is
rendered.

Follow the existing timeout convention in `e2e/gif-to-gif-tools.spec.ts` — an
encode is seconds on V8 and slower under WebKit.

One chain only. The mechanism is shared; a second spec re-measures the same
handoff for triple the wall clock.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm check:forbidden
pnpm build && pnpm check:static
pnpm test:e2e
```

`check:static` matters here: `NextTools` gains `"use client"`, and a client
boundary that accidentally pulls a dynamic API into a page turns the route
dynamic.

## Risks

| Risk | Mitigation |
|---|---|
| A `Blob` handed on outlives its use and pins memory | `takePendingFile` clears on read — already tested. Do not add a history or a retry cache |
| Panel height changes → CLS | The cap stays 2, and all five live tools already render 2 chips, so nothing changes today. `e2e/result-panel-reservation.spec.ts` measures needed-vs-reserved and will catch a regression |
| Someone later "fixes" the handoff with sessionStorage or IndexedDB | The header comment in `pending-file.ts` documents why both are wrong. Do not weaken it |
| The origin page's `resultUrl` is revoked on unmount, so the intermediate file is no longer downloadable | Accepted, and handled by reading order: the chip sits after the Download button, below the divider. Do **not** auto-download before navigating |

## Rollback

Self-contained. Revert the commit: `chainTargets()` is additive, the `result`
prop is optional, and `pending-file.ts` is untouched — so removing the change
leaves the homepage handoff and every tool page exactly as they are today.
