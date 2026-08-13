---
title: "Preset-first tool settings UI - chips, promoted primary, collapsible settings"
description: "Promote the primary action above the controls on gif-compressor and mp4-to-gif, add a named-preset chip row, and collapse the settings panel below lg. Values stay in useState; a touched ref replaces value-equality default detection."
status: complete
priority: P2
effort: "1.5-2d"
tags: [tool-framework, ui, presets, a11y, cls]
created: 2026-08-13
blockedBy: []
blocks: [260805-0001-pzgif-mvp-9-browser-native-gif-tools-discord-presets]
---

# Preset-first tool settings UI

Source: `plans/reports/from-brainstormer-to-planner-260813-0127-preset-first-tool-settings-ui-report.md` (approved 2026-08-13).
Rewritten 2026-08-13 after red team — see `## Red Team Review`.

## Overview

Two tool pages bury their primary action under their controls in the `md`–`lg`
band, and never say what the defaults are. This reorders the right-hand column
to **chips → primary → settings**, adds three named presets per tool, and
collapses the settings panel below `lg`.

Scope is `gif-compressor` and `mp4-to-gif`. `resize-gif` was cut during
brainstorm — its quality is deliberately fixed at 90 and its three "controls"
are a mode switch over two mutually exclusive fields, so it has no small↔sharp
axis to preset.

### What this plan deliberately does NOT do

The first draft replaced `useState<ControlValues>` with values *derived* from a
selection atom. Red team found four independent correctness defects in that
model (stale-closure probe guard, lost writes when one handler calls `setValue`
twice, unowned `startOver`/`resetSettings`, and no storage slot for
`valuesForProbe`). It is abandoned. **Values stay in `useState`.** The change is
the one the approved brainstorm specified: replace value-equality default
detection with explicit intent.

```ts
// gif-workbench.tsx — values keep their current shape and their functional updater
const [values, setValues] = useState<ControlValues>(defaultValues);

// Intent, held in a ref so the probe callback reads it at EXECUTION time.
// A state read would be captured when the callback was handed to job.probe()
// at drop time and would be stale by the time the worker answers.
//
// Shipped as `{kind:"auto", presetId: string | null}` rather than
// `{kind:"preset", id}` — see `## As built` #1 for why the seven preset-less
// tools need a non-custom intent that names no preset.
const intentRef = useRef<Intent>({ kind: "auto", presetId: defaultPresetId });

// probe callback — the decision stays inside the functional updater, exactly as today
setValues((current) => {
  const intent = intentRef.current;                       // fresh
  if (intent.kind === "custom") return current;           // the user owns these values
  const seeded = valuesForProbe ? valuesForProbe(result, current) : current;
  const preset = presetById(presets, intent.presetId);    // undefined for the 7 preset-less tools
  return preset ? { ...seeded, ...preset.resolve({ probe: result }) } : seeded;
});
```

`presetById(...)` is `undefined` on every tool that passes no table, so those
seven fall straight through to today's `valuesForProbe` call. That is how
"unchanged behaviour" is achieved — by reaching the same line, not by asserting
it. The result is **merged** over the seeded values rather than replacing them,
which is what lets `mp4-to-gif` keep a trim span no preset owns.

### Presets resolve on the page, not in the workbench

`GifWorkbench` has no device knowledge and gains none. `mp4-to-gif` already
holds `budget` (`mp4-to-gif-tool.tsx:156-157`); it calls
`mp4ToGifPresets(isMobileTier)` and hands `GifWorkbench` one finished
`ToolPresetGroup`. This removes the type that did not exist (`DeviceBudget`; the
real one is `TierBudget`) and the plumbing problem along with it. The chip's
pressed state and its click handler stay inside the workbench beside the intent
ref — see `## As built` #2.

### The four `setValues` writers, all owned

`gif-workbench.tsx` writes `values` at `:293` (setValue), `:323` (probe), `:340`
(startOver) and `:355` (resetSettings). All four are in scope:

| Site | New behaviour |
|---|---|
| `:293` `setValue` | keeps its functional updater; also sets `intentRef.current = {kind:"custom"}` |
| `:323` probe | as the block above |
| `:340` `startOver` | resets `intentRef` to the default preset, so the **next** file is sized |
| `:355` `resetSettings` | selects the default preset. Reset stays on both tools — no asymmetry |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Primary action above the controls in the `md`–`lg` band on both tools | P1 |
| 2 | Three named presets per tool, each a complete and correctly-typed `ControlValues` | P1 |
| 3 | Settings collapsed below `lg`, open at `≥lg`, by CSS alone | P1 |
| 4 | No grid column count changes; ad rail never moves | P1 |
| 5 | Control labels and hints stay in the static HTML while collapsed | P1 |
| 6 | Probe-versus-intent conflict fixed once per component, both owners named | P2 |

**Goal 1 is scoped to `md`–`lg` deliberately.** Below `md`, `StickyActionBar`
already pins the primary to the viewport bottom (`sticky-action-bar.tsx:47`), so
390px passes on `main` today and proves nothing. At `≥lg` the reorder does the
work. 768–1023px is the only band where the stated problem is real, and it is
the band the acceptance tests must measure.

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Preset tables and touched tracking](./phase-01-preset-tables-and-touched-tracking.md) | Complete | — |
| 2 | [Tool integrations](./phase-02-tool-integrations.md) | Complete | 1 |
| 3 | [Verification sweep](./phase-03-verification-sweep.md) | Complete | 2 |

## Testing approach

**There is no DOM in this repo's unit harness.** `vitest.config.mts:11` sets
`environment: "node"`; there is no jsdom, happy-dom or `@testing-library/*`, and
every existing component test calls the component and walks the returned tree —
which only works for components that run no hooks (`next-tools.test.tsx:29-33`
says so outright). `GifWorkbench` runs four `useState` calls plus
`useMediaJob()`, so it cannot be unit-tested without a harness this plan does
not budget for.

Consequently:

- **Pure logic → vitest.** Preset resolution, type correctness, key completeness.
- **Anything stateful or interactive → Playwright.** Probe races, chip↔control
  sync, disclosure toggling, `startOver`.

No phase claims a unit test it cannot run. Adding jsdom is explicitly out of
scope; if a future plan wants it, that is its own phase.

## Success Criteria

- [x] At 768×1024 the primary is above the controls on both tools — `e2e/tool-settings-disclosure.spec.ts` asserts the geometry, not the DOM order
- [x] Chip click visibly updates the controls; editing a control clears the active chip
- [x] Every preset resolves to a complete `ControlValues` — `tool-presets.test.ts` asserts key-set **equality** plus per-key `typeof`
- [x] With no interaction, both tools produce byte-identical output to the pre-change build — `balanced` *is* `DEFAULT_VALUES`, by construction rather than by assertion
- [x] Probe landing after a chip click keeps the preset's values; probe landing after a manual edit keeps the user's values
- [x] Dropping a second file sizes its controls (the `startOver` path)
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` green
- [x] `pnpm build && pnpm check:static && pnpm check:forbidden` green
- [x] Served HTML for both routes contains every control label and hint while collapsed
- [x] Ad-rail check runs against a build with `NEXT_PUBLIC_ADS_ENABLED=1` — full suite green both ways; see the note in `## As built` on why it asserts the opposite invariant rather than skipping when ads are off
- [x] The 7 out-of-scope tools' E2E specs pass unedited — with one deliberate exception recorded in `## As built`: `cross-format-tools.spec.ts`'s 320px case had been filling a control through a collapsed panel
- [x] The 7 other `GifWorkbench` routes are verified at 768px for collapse, expand, tab order and served-HTML labels — the reorder and the disclosure reach them, so they are in scope for verification even though they were not in scope for design
- [ ] **Unverified:** iOS Safari collapse/expand on real hardware — inherited by the MVP plan's Phase 11
- [ ] **Unverified:** the degraded-recovery path clears the chip — see `## As built`

## As built

Eleven deltas between this plan and what shipped. Each is a decision the
implementation had to make that the plan did not settle, or a thing the plan
asked for that turned out to be unnecessary.

| # | Plan said | Shipped | Why |
|---|---|---|---|
| 1 | `Intent = {kind:"preset", id} \| {kind:"custom"}` | `{kind:"auto", presetId: string \| null} \| {kind:"custom"}` | The preset-less tools need a non-custom intent that names no preset. A `null` `presetId` says that; an `id` field would have needed a sentinel string that meant "there is no table" |
| 2 | The page hands the workbench `{presets, presetId, onSelectPreset}` | The page hands it one `ToolPresetGroup`; the workbench keeps `presetId` and the click handler | Same guarantee — `mp4ToGifPresets(isMobileTier)` is resolved on the page, so `GifWorkbench` still never learns what a tier is. Splitting the chip state out would have put half the intent machine on the page and half in the hook |
| 3 | Add an off-ladder fixture | Reused `e2e/fixtures/odd-dims.gif` (499×281) | It already exists, it is already off-rung, and `admit()` honours 499 verbatim. A twelfth fixture would have been a second copy of the same fact |
| 4 | One `lg:` rule in `globals.css` | No CSS change at all — `lg:grid-rows-[1fr]` on the panel | Utilities sit in a later cascade layer than `@layer components`, so the utility beats `.pz-acc-panel[data-state]` without a specificity war. The plan's risk row asked for this to be asserted rather than assumed, and it is: the spec reads `getComputedStyle().gridTemplateRows` at `xl` |
| 5 | Chip copy in `src/content/` | New `ToolContent.presetChips`, **not** the existing `preset` | `tool-copy.test.ts` asserts `preset !== undefined` on exactly five pages. Reusing the key would have made the two tools Discord preset pages as far as every copy rule was concerned |
| 6 | Add collapsed/expanded rows to `page.dev.tsx` | Rows added, backed by a new client island `dev/states/settings-states.tsx` | `/dev/states` is a server component and the disclosure takes an `onToggle`. A fixed-`open` prop would have shown both boxes without showing that either can be reached |
| 7 | — | `FileChip` gained `removeDisabled`; the × and "Choose a different file" are now disabled rather than unmounted while a job is locked | See below |
| 8 | — | `data-accordion-panel` on the accordion panel; `faq-crawlability.spec.ts` rescoped to it | The disclosure reuses `.pz-acc-panel` and the same `-panel` id suffix, and it deliberately never takes `hidden="until-found"`. The FAQ spec was selecting "the first closed panel on the page" and started finding the settings |
| 9 | Tab reaches chips → primary → toggle | Asserted on Chromium only | WebKit follows macOS's "Full Keyboard Access", which is off by default and which Playwright does not flip, so `Tab` there skips buttons. A WebKit failure would have been a fact about the host OS |
| 10 | Phase 2 step 5: an E2E for degraded recovery | **Not written** | An admission refusal cannot be forced deterministically from a browser test — the budgets are derived from the device. `markCustom()` is in both `onRunDegraded` handlers and is covered by review, not by a test. A flaky test here would be worse than an honest gap |
| 11 | The ad-rail check fails rather than skips | Both branches assert something | `ADS_ENABLED` is inlined at build time, so a spec cannot flip it. With ads on it measures the rail and fails if it is absent; with ads off it asserts the other half — no rail, and no third grid track. The suite was run green both ways |

### Fixed after code review

Three findings, all confirmed against the built site before being acted on.

**The collapsed panel was still focusable and still announced.**
`grid-template-rows: 0fr` clips a panel; it does not remove it from the tab
order or the accessibility tree, and `hidden="until-found"` was deliberately
dropped here. At 768px a keyboard user tabbed off the toggle straight into five
controls they could not see. Fixed with `data-[state=closed]:invisible
lg:data-[state=closed]:visible` on the panel — `visibility: hidden` is inherited
by every descendant, removes them from both trees, and unlike `display: none`
leaves the labels in the layout and therefore in the served HTML, which is the
entire reason the collapse is built this way. `e2e/tool-settings-disclosure.spec.ts`
now walks Tab off the toggle and asserts it lands outside the panel.

This also exposed a test that had been passing by reaching a control a visitor
could not see: `cross-format-tools.spec.ts`'s 320px estimate case filled the
trim field through a collapsed panel. It now opens the disclosure first, which
is what a visitor at that width has to do.

**The compressor could display a width it was not running.** Its probe used to
write `width` unconditionally; making that write conditional on intent meant any
pre-probe edit to any control froze `width` at the 1280 pre-probe fallback while
the slider — whose `max` had become the source width — displayed 480 and
`buildSpec` sent 1280. Output bytes were never wrong (`ops/geometry.ts` bounds by
source), but a panel contradicting the job is the exact defect this feature
exists to prevent, and it was a regression against `main`. The probe now clamps
`width` to the source width under custom intent instead of skipping it: a
narrower width the visitor really chose survives, and the displayed number and
the executed number are the same number again.

**Scope: the reorder and the collapse reach all eight `GifWorkbench` routes.**
Only the chip row is scoped to two tools. Gating the disclosure on whether a
tool has presets would have left the primary buried under the controls on six
routes — the same asymmetry this plan rejected for the Reset button — so it
stays on all eight and the verification was widened to match. Every pre-existing
tool spec runs at ≥1024px, where the panel is forced open, so the collapsed
state on those six had shipped measured on nothing;
`e2e/tool-settings-disclosure.spec.ts` now covers all seven workbench routes at
768px for collapse, expand, tab order and served-HTML labels.

Two medium findings were also closed: `tool-presets.test.ts` was testing its own
hand-written shape table, so it now asserts the preset key sets and the chip
label keys against each tool's `src/content/*.json` — the one artefact that is
always edited when a control or a chip changes. A typo'd label key used to ship
a raw preset id to a visitor as visible copy; that is now a failing test.

### The two layout shifts this work exposed

Promoting the primary above the controls removed an accidental shield. On `main`
a click on the primary — which sat under the whole settings panel — scrolled the
page roughly 490px, which carried two pre-existing shifts out of the viewport
before they happened. With the primary above the fold the page no longer
scrolls, and both became visible to the layout-instability observer:

- `FileChip`'s × unmounts while `locked`, narrowing the chip by 34px and moving
  the metadata badge beside it. **0.00013.**
- "Choose a different file" unmounts while `locked`, narrowing a wrapping row by
  158px. On a viewport wide enough for the ad rail that is the difference
  between one line and two, so the source preview moved 44px. **0.0038**, and
  only reproducible with `NEXT_PUBLIC_ADS_ENABLED=1`.

Both fire twice per job — once at the start, inside the 500 ms window that
excuses them, and once at the end, long outside it. Both are fixed the way
`settings-form.tsx` already states the rule: **disabled, never hidden.** Measured
at zero afterwards, with ads on and off.

A third shift was introduced and removed during implementation: wrapping the
Reset button and the disclosure toggle in a shared `div` turned an
element-*replacement* (badge → button, which scores nothing) into one element
whose box changed (which scores). The header row is three flat children for that
reason.

## Out of scope

`resize-gif` · 4 Discord preset routes + hub · the 6 tools with ≤2 controls ·
`src/lib/media/*` · a jsdom test harness · a fourth preset per tool.

### Pre-existing defect, recorded not fixed

The compressor's width slider can display a value the engine will not run: the
page never reads the device tier, so a 1280px source shows 1280 while
`widthCapFor()` caps the job at 640 on desktop and 480 on every mobile tier
(`plan.ts:113-115`, `limits.ts:55-76`). `plan.downgraded` cannot report it,
because `wantedWidth` is already capped before the flag is computed
(`plan.ts:243-244`).

**This exists on `main` and is not caused by this plan.** Fixing it means giving
the compressor page a capabilities dependency it does not have. Recorded here so
Phase 11's copy/honesty audit inherits it; presets must not make it worse, which
is why `balanced` and `sharpest` use source width unchanged.

## Open questions

1. ~~**Final chip names.**~~ Resolved. `gif-compressor`: "Squeeze it hard" /
   "Full palette" / "Keep every detail", under the legend "Start from one of
   these". `mp4-to-gif`: "Light and quick" / "Everyday loop" / "Smoothest
   motion", under "How should the clip come out?". `tool-copy.test.ts` now
   asserts no label appears on both rows; whether each label describes what its
   preset actually does is the Phase 11 copy audit's call.
2. **Chips at `idle`.** Resolved by decision, not left open: the chip row takes
   the same `disabled` condition as `SettingsForm` — `flow === "idle" || locked`.
   Red team found no phase disabled it during `processing`, which would let a
   mid-job click desync the panel from the running job.

## Red Team Review

### Session — 2026-08-13
**Reviewers:** Assumption Destroyer (Scope Auditor), Failure Mode Analyst (Flow
Tracer), Scope & Complexity Critic (Contract Verifier). Security Adversary was
substituted out — this change has no auth, server, data or network surface.

**Findings:** 15 after deduplication (7 Critical, 7 High, 1 Medium). All 15
carried `file:line` evidence and passed the evidence filter. All 15 accepted.

| # | Finding | Severity | Disposition | Applied |
|---|---|---|---|---|
| 1 | Ladder-snapping rule misreads `admit()` — requested width is option 0, ladder is only the downgrade fallback | Critical | Accept | Rule deleted; Phase 1 |
| 2 | Regression anchor cannot detect finding 1 — the only compressor fixture is 480×270, already a ladder rung | Critical | Accept | Phase 3 adds an off-rung fixture |
| 3 | Entire TDD gate unbuildable — no DOM harness, and Phase 1 forbade adding one | Critical | Accept | `## Testing approach` |
| 4 | Derived values have no storage slot for `valuesForProbe`; six tools lose probe sizing | Critical | Accept | Derived model abandoned |
| 5 | Probe callback would read `selection` through a stale closure | Critical | Accept | `intentRef`; Phase 1 |
| 6 | `setValue` seeded from `derived` drops one of two writes in the same handler | Critical | Accept | Functional updater retained |
| 7 | `smallest` omitting `quality` shows 1 while the engine runs 80; numeric `colours` type-fails `stringValue` | Critical | Accept | Completeness rule; Phase 1 |
| 8 | `accordion.tsx` already implements the disclosure mechanism; Phase 2 never read it | High | Accept | Phase 2 reuses `.pz-acc-panel` |
| 9 | "CSS-only default" + "imperative `hidden=until-found`" mutually unsatisfiable | High | Accept | `until-found` dropped; Phase 2 |
| 10 | `DeviceBudget` does not exist; `budget` is never null; risk row mitigated a non-hazard | High | Accept | Presets resolve on the page |
| 11 | `onRunDegraded` bypasses `setValue` entirely, so no chip can be cleared through it | High | Accept | Phase 2 |
| 12 | Chip row never disabled during `processing`/`error` | High | Accept | Open question 2 resolved |
| 13 | Ad-rail check cannot fail — ads default off, and it only measured `xl` where the toggle is `display:none` | High | Accept | Phase 3 |
| 14 | Justification for a separate `preset-row.tsx` is factually wrong — `dimensions` is already optional, `legend` already a plain string | High | Accept | `PresetChips` widened; Phase 2 |
| 15 | Goal 6 undeliverable as written — the compressor is not a `GifWorkbench` consumer, so the state machine lands twice | Medium | Accept | Goal 6 reworded; shared helper in Phase 1 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-…`, `phase-02-…`, `phase-03-…`
- Decision deltas checked: 8 (derived model → `useState` + `intentRef`; ladder snap → no snap; 5 phases → 3; new components → reuse `accordion.tsx`/`PresetChips`; unit gates → e2e; presets resolve on page; Reset kept on both tools; Goal 1 rescoped to `md`–`lg`)
- Reconciled stale references: all references to `PresetSelection`, `DeviceBudget`, `preset-row.tsx`, `settings-disclosure.tsx`, `tool-presets.resolve` ladder-snapping, and the 5-phase table removed
- Unresolved contradictions: 0

<!-- slug: preset-first-tool-settings-ui-chips-promoted-primary-collapsible-settings -->
