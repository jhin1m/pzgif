# Code review — preset-first tool settings UI

**Reviewer:** code-reviewer · **Date:** 2026-08-13
**Plan:** `plans/260813-1055-preset-first-tool-settings-ui-chips-promoted-primary-collapsible-settings/`
**Scope:** uncommitted working tree on `main` — 18 modified files, 5 new files, ~760 added lines.

## Verdict

The intent model is correct and the red-team findings it was rewritten around are
genuinely applied: values stayed in `useState`, the probe reads intent from a ref
inside the functional updater, `setValue` kept its updater, `onRunDegraded` is
wired on both pages, `PresetChips` was widened rather than duplicated, and the
`e2e/discord-presets.spec.ts` regression proof passes unedited (I ran it).

Three things block a clean landing: the collapsed panel is invisible but still
focusable and still announced, the compressor can now display a width it is not
running, and the disclosure shipped to eight routes when the plan scoped it to
two and verified two.

## Gates run

| Command | Result |
|---|---|
| `pnpm typecheck` | green |
| `pnpm lint` | green |
| `pnpm test` | green — 38 files, 396 tests |
| `pnpm check:forbidden` | green — 310 files, no forbidden constructs |
| `pnpm build` + `pnpm check:static` | green — 26 routes prerendered |
| `npx playwright test tool-settings-disclosure.spec.ts --project=chromium` | 15/15 pass |
| `npx playwright test discord-presets.spec.ts --project=chromium` | 15/15 pass, unedited |

Not run: WebKit projects, the `NEXT_PUBLIC_ADS_ENABLED=1` build, full `pnpm test:e2e`.

---

## High

### H1 — The collapsed settings panel is invisible but still focusable and still announced

`src/components/tool/settings-panel.tsx:138-146` renders the panel with
`.pz-acc-panel` (`src/app/globals.css:706-716`: `grid-template-rows: 0fr` +
`overflow: hidden` on the inner div) and deliberately drops
`hidden="until-found"`. `grid-template-rows: 0fr` clips the content; it does not
remove it from the tab order or from the accessibility tree. The FAQ accordion
does not have this problem because `src/components/ui/accordion.tsx:112-115`
applies `hidden="until-found"` to closed panels, which is `display: none`.

Measured against the production build at 768×1024 on `/gif-compressor` with a
file loaded (so the controls are enabled), focusing the toggle and pressing Tab
five times:

```
panel data-state: closed   height: 0
  - INPUT:range   (Quality)            inCollapsedPanel=true  h=18 w=592
  - INPUT:number  Quality (exact value) inCollapsedPanel=true h=32 w=66
  - BUTTON        "256 — best quality"  inCollapsedPanel=true h=40 w=670
  - INPUT:range   (Width)               inCollapsedPanel=true h=18 w=592
  - INPUT:number  Width (exact value)   inCollapsedPanel=true h=32 w=66
```

A keyboard user below `lg` — i.e. every phone and tablet visitor — tabs off the
toggle straight into five clipped controls with no visible focus ring, and a
screen-reader user is read the whole form the button has just announced as
`aria-expanded="false"`. `e2e/tool-settings-disclosure.spec.ts:201-231` asserts
the tab order *up to* the toggle and stops one Tab short of this.

Note this also makes Playwright `toBeVisible()` unreliable here: the clipped
controls have non-empty boxes, so a future test cannot detect the state by
visibility alone.

Fix options, cheapest first:

1. CSS only, no JS, keeps the strings in the served HTML:
   `.pz-acc-panel[data-state="closed"] > div { visibility: hidden }` plus a
   `lg:` override. `visibility: hidden` removes descendants from the tab order
   and the a11y tree, and it is inherited-and-overridable, so nothing else
   changes. Verify the 150 ms `grid-template-rows` transition still reads
   correctly on open (add `transition-behavior: allow-discrete` if it does not).
2. `inert` on the panel, driven by the same `open` state — but `inert` cannot be
   media-queried, so the component would have to know the breakpoint, which the
   plan forbids for good reason. Prefer option 1.

Whatever is chosen, extend the keyboard test past the toggle so it locks in.

### H2 — The compressor can display a width the job is not running

`src/app/[locale]/gif-compressor/gif-compressor-tool.tsx:262-271` made the
probe's width write conditional on intent. Before this change the write was
unconditional (`setValues(current => ({ ...current, width: max(WIDTH_MIN, result.width) }))`),
so the slider was always corrected to the source width once the probe answered.
Now, any edit to any control before the probe lands sets intent to `custom`
(`:320-326`) and the whole value set — including `width`, which the user never
touched — is frozen at the pre-probe fallback of 1280
(`src/lib/presets/tool-presets.ts:80,126`).

Measured on the production build, 1440×900, `/gif-compressor`, loading the 480px
fixture and toggling "drop every second frame" while the probe is in flight:

```
after pre-probe edit: slider inputValue = 480 | panel text with px: 1280 px
```

The panel contradicts itself — the range input clamps to `widthMax`
(`:377`, 480) while the readout prints `values.width` (1280) — and `buildSpec`
(`:200-206`) sends `targetWidth: 1280`. The produced bytes are unaffected
(`src/lib/media/ops/geometry.ts:56-63` bounds output width by the source unless
`spec.upscale`), so acceptance criterion 1 still holds, but this is exactly the
displayed-versus-executed divergence `tool-presets.ts:7-21` says the feature
exists to stop, and it is a regression against `main`.

The narrowest fix is to keep the *file-sizing* write unconditional and let intent
govern only preset re-resolution — the width bound is a property of the file, not
a preference:

```ts
setValues((current) => {
  const sized = { ...current, width: Math.min(numberValue(current, "width", result.width), Math.max(WIDTH_MIN, result.width)) };
  const active = readIntent();
  if (active.kind === "custom") return sized;
  const preset = presetById(presets, active.presetId);
  return preset ? { ...sized, ...preset.resolve({ probe: result }) } : { ...sized, width: Math.max(WIDTH_MIN, result.width) };
});
```

Add the case to `e2e/tool-settings-disclosure.spec.ts` beside the existing
probe-race pair (`:295-318`) — the (b) direction there edits a *toggle*, which is
precisely the input that leaves `width` stale, so the assertion is one line away
from where the bug is.

### H3 — The disclosure and the reorder shipped to eight routes; the plan scoped and verified two

`src/components/tool/gif-workbench.tsx:798-881` puts every consumer behind the
new disclosure. That is `crop-gif`, `resize-gif`, `reverse-gif`,
`gif-speed-changer`, `gif-to-mp4`, `split-gif-to-frames`, `webp-to-gif` and
`mp4-to-gif` — while `plan.md:26-28` states the scope is two tools and that
`resize-gif` was cut, and `phase-03` measures only `/gif-compressor` and
`/mp4-to-gif`.

Every existing tool spec runs at ≥1024px (`grep setViewportSize e2e/*.spec.ts`:
1440 or 375; nothing in the 768–1023 band except the new spec), so those six
routes have **zero** coverage of the collapsed state — they pass unedited because
they never enter it. `crop-gif` is the one to look at by hand before landing: its
numeric crop fields are now behind a toggle below `lg` while the crop overlay
stays in the stage, which is a larger product change than the compressor's.

Either state the widened scope in the plan and add one collapsed-state check for
a second workbench route, or gate the disclosure on the presence of `presets`
so the six out-of-scope tools keep today's panel.

---

## Medium

### M1 — `onRunDegraded` clears the chip but leaves the controls showing the un-run values

`src/components/tool/gif-workbench.tsx:632-648` and
`src/app/[locale]/gif-compressor/gif-compressor-tool.tsx:590-600` call
`markCustom()` and then splice the engine's plan into the spec. The chip clears;
the sliders keep saying 480/20 while the job runs 320/10. `phase-02` step 5 asked
for "zero chips pressed **and** that the sliders match the executed plan", and
the second half is not implemented — `grep -rn "degraded" e2e/*.spec.ts` returns
nothing, so nothing caught it. Writing `degraded.width`/`degraded.fps` back
through `setValue` (which already marks custom) satisfies both halves with one
call each.

### M2 — The preset key-set "equality" guard is a hand-copied literal, not the tools' control lists

`src/lib/presets/tool-presets.test.ts:47-71` asserts key-set equality against
`SHAPES`, a literal declared in the test file. `phase-01`'s risk table claims
"adding a control without updating the presets fails the test" — it does not.
Adding a fifth control to `gif-compressor-tool.tsx:388-418` leaves this suite
green and reintroduces exactly the 1-versus-80 defect the file's own header
documents. Deriving the expected id set from the page's `controls` array is not
possible from a node-environment test (it needs hooks), but exporting the control
ids as a module constant from each page and asserting against that is, and it
would make the guarantee real.

### M3 — A typo in a chip label key silently ships a raw preset id as visible copy

`src/components/tool/preset-chips.tsx:63` falls back to `preset.id`, and
`src/lib/tools/tool-copy.test.ts:215-236` only asserts that each page has three
labels and that no label repeats across pages — not that the keys match the
preset ids. Rename `smoothest` to `smooth` in `src/content/mp4-to-gif.json` and
the tools ship a chip reading "smoothest" in lowercase English, with the copy
test still green. Assert `Object.keys(labels)` equals the tool's preset id set,
or drop the `?? preset.id` fallback so the type system forces the pairing.

### M4 — The `as DiscordPresetId` cast is currently unreachable, but nothing keeps it that way

`src/components/tool/discord-workbench.tsx:447`. Today the array passed in is
built from `DISCORD_PRESETS` (`:440-444`) and `PresetChips` only ever calls
`onSelect(preset.id)` (`preset-chips.tsx:67`), so no bad value can reach the
cast. It is still an unchecked assertion standing between a `string` and a union
that indexes preset tables; a future edit that filters or appends to that array
would fail silently rather than at compile time. `PresetChips<Id extends string>`
with `presets: readonly { id: Id }[]` and `onSelect(id: Id)` removes the cast at
zero runtime cost and keeps the tool pages' `string` usage working.

### M5 — `COMPRESSOR_PRESETS[1]!` couples the default to an array index

`src/lib/presets/tool-presets.ts:126-127` picks the default by position, while
the id it must agree with lives in another file
(`gif-compressor-tool.tsx:113`, `DEFAULT_PRESET_ID = "balanced"`). Reordering the
table silently changes what the controls mount with. The unit test at
`tool-presets.test.ts:79-88` pins the resulting values, so this is a readability
and non-null-assertion complaint rather than a live bug — but
`COMPRESSOR_PRESETS.find(p => p.id === COMPRESSOR_DEFAULT_PRESET_ID)` with the id
exported from this file says the same thing without the puzzle or the `!`.

---

## Low

- **L1** `selectPreset`'s dependency array takes the whole `intent` object
  (`gif-workbench.tsx:333`, `gif-compressor-tool.tsx:333`), and
  `useToolIntent` returns a fresh object literal every render
  (`use-tool-intent.ts:76`), so the `useCallback` never holds. Destructure
  `selectPreset` alongside the other three, exactly as those lines already do.
- **L2** `/dev/states` gained the disclosure and the chip row
  (`settings-states.tsx`) but not `FileChip`'s new `removeDisabled` state, which
  is a visual state this change introduced on three pages. The disclosure rows
  also cannot show the collapsed state at the gallery's normal width — the
  comment at `settings-states.tsx:21-23` tells the reader to resize the window.
- **L3** `settings-panel.tsx` gained `"use client"`. `SettingsPanel` was
  previously usable from a server component; it is now a client boundary. Build
  and `check:static` pass, so nothing is broken, but it is an undeclared contract
  change on an existing export.
- **L4** `PresetChips` nests `role="group" aria-label={legend}`
  (`preset-chips.tsx:59`) inside a `<fieldset><legend>` that is already a group
  with the same name. Pre-existing, now on two more routes.
- **L5** `e2e/tool-settings-disclosure.spec.ts:371-392` files
  "Start from one of these" and "Keep every detail" under "the settings prose
  survives the collapse", but the chip legend renders *outside* the collapsible
  region (`gif-workbench.tsx:804-815`), so those two strings do not test the
  stated property. The four control strings do.
- **L6** `resetSettings` (`gif-workbench.tsx:415`) resolves
  `presetById(presets, presets?.defaultId)` and silently falls back when the
  default id names no item in the table. A dev-only throw or a type that pairs
  `defaultId` with `items` would surface the misconfiguration.
- **L7** Two routes with no `valuesForProbe` (`gif-speed-changer`,
  `reverse-gif`) now execute `setValues(current => current)` on every probe
  (`gif-workbench.tsx:366-374`) where the old code returned early
  (`if (!result || !valuesForProbe) return;`). React bails out on identity, so
  this is inert — recorded because it is a behavioural delta on two of the seven
  "unchanged" tools.
- **L8** Latent, currently unreachable: on `mp4-to-gif`, going custom and then
  re-selecting a chip while the probe is still in flight would let
  `valuesForProbe` reset `trimFrom`/`trimTo` under the user
  (`gif-workbench.tsx:369-373`). It cannot happen today because `TrimRange` is
  disabled until `duration > 0` (`mp4-to-gif-tool.tsx:233`), which requires the
  probe. Worth a comment at the seam so a future "seed the trim from metadata"
  change does not open it.

---

## Acceptance criteria — what I verified and how

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Untouched visitor gets byte-identical output on all 11 routes | **Pass** | `COMPRESSOR_DEFAULT_VALUES` equals the deleted literal (`tool-presets.test.ts:79-88`, matches removed `gif-compressor-tool.tsx` `DEFAULT_VALUES`); compressor probe path resolves `max(120, probe.width)` — identical to the old line; mp4 `balanced` == `profile` on both columns (`tool-presets.test.ts:128-139`, `mp4-to-gif-tool.tsx:73-77`); other 9 routes pass no table. Note: the guard changed from value-equality to intent, so "edited then reverted to default" now behaves differently — that visitor is not untouched, so the criterion holds. |
| 2 | 7 preset-less tools reach the old `valuesForProbe` path | **Pass** | `grep "presets={"` → only `mp4-to-gif-tool.tsx:431` reaches `GifWorkbench`; `presetById(undefined, …) === undefined` (`tool-presets.ts:63-69`, asserted `tool-presets.test.ts:169-179`); fall-through returns `seeded` (`gif-workbench.tsx:369-373`). See L7 for the one inert delta. |
| 3 | Every preset resolves every key with the reader's runtime type | **Pass, weakly guarded** | Compressor controls are exactly `quality/colours/width/dropFrames` (`gif-compressor-tool.tsx:388-418`) and `colours` is a string (`:191,:200`); mp4 owns `width/fps/quality` and deliberately not the trim span, which the merge preserves (verified live by `e2e/cross-format-tools.spec.ts:146-166`). The key-set guard itself is M2. |
| 4 | Chip survives an in-flight probe; a manual edit is not overwritten; intent read from the ref inside the updater | **Pass** | `gif-workbench.tsx:366-374`, `gif-compressor-tool.tsx:262-271` — `readIntent()` is called inside the updater, never captured outside; both directions pass in the spec I ran (`tool-settings-disclosure.spec.ts:295-318`). |
| 5 | `setValue` keeps its functional updater | **Pass** | `gif-workbench.tsx:315`, `gif-compressor-tool.tsx:321`; the double call is `mp4-to-gif-tool.tsx:237-238`. |
| 6 | Every path that changes the job clears the chip, incl. `onRunDegraded` | **Partial** | `markCustom()` present at `gif-workbench.tsx:640` and `gif-compressor-tool.tsx:595`; `applySetting`/`onChangeSetting` route through `setValue`. The controls still misdescribe the degraded run — M1. No test. |
| 7 | `startOver` restores the default intent | **Pass** | `gif-workbench.tsx:391`, `gif-compressor-tool.tsx:283`, both before `setValues`; covered live by `tool-settings-disclosure.spec.ts:320-334`. |
| 8 | Chip `disabled` equals `SettingsForm`'s | **Pass** | Identical `flow === "idle" \|\| locked` at `gif-workbench.tsx:813`/`:870` and `gif-compressor-tool.tsx:783`/`:840`; asserted at `:240-248` and `:336-350`. |
| 9 | No `matchMedia`/`innerWidth`/`until-found` in the settings path; collapsed content in the DOM and in the prerendered HTML | **Pass** | `grep` over `src/` finds `matchMedia` only in `theme-init-script.ts` and a comment in `tool-shell.tsx`, `until-found` only in `accordion.tsx`/`faq-section.tsx` and the settings-panel comment explaining its absence; `curl` of the built `/gif-compressor` contains "Halving the width", "Start from one of these", "Squeeze it hard"; `pnpm check:static` green. |
| 10 | `aria-describedby` target outside the collapsible region | **Pass** | `gif-workbench.tsx:837-847` and `gif-compressor-tool.tsx:808-818` render the `<p>` before `SettingsDisclosure`; asserted structurally at `tool-settings-disclosure.spec.ts:182-199`, and the served HTML has zero `compressor-primary-reason` inside `#gif-compressor-settings-panel`. |
| 11 | No `hadRecentInput === false` shift on the tool pages | **Partial** | `tool-settings-disclosure.spec.ts:135-180` measures total CLS 0 across a toggle at 768px on `/gif-compressor` only, chromium only (I ran it). The two latent shifts are fixed in code — `FileChip.removeDisabled` (`file-chip.tsx:43-52,109`) and the disabled-not-unmounted "Choose a different file" (`gif-workbench.tsx:604-611`, `gif-compressor-tool.tsx:537-547`, `discord-workbench.tsx:491-503`), and `Button`'s disabled styles change no box (`ui/button.tsx:34-69`) — but **no test asserts the job-start/job-end transitions**, so the "measured 0.0008" claim in the comments is not locked against regression. `/mp4-to-gif` and the six other workbench routes are unmeasured (see H3). |

## Vacuous-test check

I looked for locators that resolve to nothing and assertions that are true
regardless of the code. None found in the new specs; the near-misses:

- `e2e/faq-crawlability.spec.ts:61` — the regex change is a genuine fix, not a
  loosening: the built `/gif-compressor` has 8 elements whose id ends in
  `-panel` but only 7 `data-accordion-panel` divs, and the eighth is the new
  settings panel, which is never `hidden`. The old regex would have failed.
- `e2e/tool-settings-disclosure.spec.ts:423-429` — the no-ads branch is a real
  assertion (`tracks === 2`), so the suite cannot pass by skipping. It does
  depend on the ads build actually being run in CI; only the flag-off path is
  proven here.
- `e2e/gif-compressor.spec.ts:195-218` — the off-rung fixture is real:
  `odd-dims.gif` is 499×281 (verified from the file header), and 499 is not a
  `WIDTH_LADDER` rung.
- `e2e/tool-settings-disclosure.spec.ts:160` uses `page.locator("h2").first()`
  as "the explainer". It happens to be below the panel today; if a heading were
  ever added above it, the test fails rather than passes silently, which is the
  right direction.

## Recommended actions

1. Fix H1 — collapsed settings must leave the tab order and the a11y tree below
   `lg`; extend the keyboard test one Tab further.
2. Fix H2 — keep the compressor's width bounded by the probed source even under
   custom intent; add the toggle-before-probe case to the spec.
3. Resolve H3 — either accept and document the eight-route scope with one
   collapsed-state check on a second workbench route, or gate the disclosure on
   `presets`.
4. M1 — write the degraded plan back into the controls.
5. M2/M3 — make the key-set and label-key guarantees real instead of copied.
6. M4/M5, then the Low list, at leisure.

## Unresolved questions

1. Was shipping the disclosure to all eight `GifWorkbench` tools an intentional
   widening of the plan's scope, or a side effect of implementing it inside the
   shared component? `crop-gif` and `resize-gif` are the two whose UX changes
   most, and `resize-gif` was explicitly cut.
2. `phase-03` step 4 requires the iOS Safari collapse check on a real device or
   an explicit "unverified" record. I found no such record in the plan files —
   which is it?
3. Was the `NEXT_PUBLIC_ADS_ENABLED=1` e2e run actually executed, and against
   which viewport? I ran only the flag-off build.

Status: DONE_WITH_CONCERNS
Summary: The intent/preset model is sound and every red-team finding it was rewritten around is genuinely applied, but the collapsed panel is still focusable and still announced below `lg`, the compressor can display a width it is not running after a pre-probe edit, and the disclosure shipped to eight routes while only two were verified.
Concerns/Blockers: H1 (a11y — collapsed controls stay in the tab order and the a11y tree), H2 (displayed-versus-executed width regression against `main`), H3 (six unverified routes gained the disclosure). All three are code fixes plus one test each; none require a design change.
