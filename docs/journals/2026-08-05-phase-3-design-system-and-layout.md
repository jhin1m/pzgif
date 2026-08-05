# Phase 3 Ships: Design System and Layout, and the Browser Suite Goes Unrun for a Third Time

**Date**: 2026-08-05 15:00
**Severity**: Medium
**Component**: `src/components/**`, `src/app/[locale]/dev/states`, `docs/design-guidelines.md`
**Status**: Resolved (code-complete), one item Ongoing

## What Happened

Phase 3 of the MVP plan landed in five commits (`6117ae0`, `618b01a`, `533e1cb`,
`4b4cb5e`, `e6bd02c`): 18 components plus page chrome, a `/dev/states` gallery
mirroring `docs/wireframe/states.html`, 132 unit tests across 18 files, and
`typecheck` / `lint` / `test` / `build` / `check:static` / `check:forbidden` all
green. A `code-reviewer` pass found 23 issues; all 7 blocking ones are fixed,
plus 11 more. Four amendments went into `docs/design-guidelines.md`.

`e2e/component-states.spec.ts` was written — tab order, the 62% fill measured
against a track with `transitionDuration: 0s`, the WebKit accordion path, all
five before/after key bindings, the ad slot's computed radius/shadow/label, no
horizontal scroll at 320px — and it did not run. No browser launches in this
environment. Same wedged macOS Mach bootstrap namespace first recorded in
Phase 1, still present in Phase 4, still present now. Three phases in a row
have shipped with a written, unrun browser suite. That is not a footnote
anymore, it is the pattern: every phase that touches rendered behavior is
currently shipping on unit tests and one manual pass through a production
build in Chrome, because Playwright cannot launch anything on this machine.

## The Brutal Truth

The gallery did exactly the job it was built for and it did it faster than the
component-by-component review that came before it. Three of the four worst
defects this phase produced were CSS cascade problems, and not one of them
would have shown up in a unit test no matter how many were written, because
`react-dom/server` markup assertions can't see computed styles. The focus halo
was silently absent on every control that also carries a `shadow-*` utility —
the primary button, the before/after handle, the result panel, the toast —
because `@layer base` loses to `@layer utilities` regardless of specificity.
That is precisely the set of controls a keyboard user lands on first. It shipped
invisible until someone put both themes on one screen and looked.

That is the uncomfortable part: static analysis, typecheck, and 132 passing
unit tests all went green while the focus ring was broken on four components
and a dark-mode override of `--shadow-sm` was dead code because Tailwind
inlines theme values at build time. Green CI is not the same claim as "this
works," and it took a visual side-by-side, not a test suite, to find what was
actually wrong.

## Technical Details

- **Cascade-layer loss on focus halo**: `@layer base` rules for `.force-focus`
  lost to `@layer utilities` `shadow-*` classes regardless of specificity,
  silently dropping the focus ring on the primary button, before/after handle,
  result panel, and toast.
- **Dead dark-mode shadow override**: `[data-theme="dark"] { --shadow-sm: … }`
  never applied because Tailwind v4 inlines theme values at build time. Fix:
  write shadow values as `var()` references (`0 1px 2px var(--shadow-tint-1)`)
  so resolution stays live at runtime. The first fix attempt — overriding
  Tailwind's internal `--tw-shadow` from outside the cascade layers — was
  tried and rejected because it also beat `shadow-none`, leaving a shadow on a
  disabled or pressed button that §5.1 forbids.
- **`dark:` variant leaking into nested light subtrees**: the variant compiles
  to `[data-theme="dark"] *`, so it fires inside a *nested*
  `[data-theme="light"]` element too. Found in one screenshot of `/dev/states`
  rendering both themes side by side — light-pane secondary buttons wearing
  the dark hover colour. Fixed with seven new semantic tokens
  (`--surface-hover`, `--border-control-hover`, `--surface-disabled`,
  `--control-track`, `--border-hover`, `--mark-muted`, `--shadow-bar`), and
  `theme-tokens.test.ts` now fails the build on any `dark:` or palette
  primitive found inside `src/components/`.
- **Theme-toggle rename broke `app-shell.spec.ts` silently**: label became
  "Switch to dark theme," the existing regex matched `/switch theme/i`, the
  locator resolved to nothing. The one test proving `@theme inline` survives a
  rebuild would have timed out rather than failed loudly — and it can't even
  demonstrate that now, because the suite doesn't run here.
- **Firefox had no visible focus on the slider at all** — the ring rule only
  targeted `::-webkit-slider-thumb`.
- **Paired number input clamped on every keystroke**: typing "1" into a
  16–256 range control became "16" immediately, and "128" was unreachable one
  digit at a time — breaking the exact control §5.4 added because dragging to
  an exact value is a fight.

## What We Tried

- Reviewed each of the 18 components individually against
  `docs/wireframe/states.html` before building the gallery. This pass missed
  all three cascade-layer defects above.
- Built `/dev/states` rendering every component, every state, both themes on
  one route — and that single side-by-side screen caught the `dark:` leak
  immediately, something section-by-section review across five sittings had
  not.
- Bottom-bar mutual exclusion (action bar vs anchor ad vs consent bar) was
  first implemented as a `useEffect` where the action bar registered itself
  with a shared context after mount. This shipped the anchor ad slot in the
  static SSG HTML and then unmounted it on hydration — a layout shift on the
  exact element §8.2 exists to reserve, introduced by the code meant to
  protect it — and separately suppressed the consent bar on desktop, where the
  bar is `display: none` but the effect ran regardless. Rejected in review.
  Fixed by declaring the exclusion on `BottomBarProvider` at render time
  instead of registering it as a side effect.
- Served the production build and drove it manually through Chrome as a
  substitute for the unrunnable Playwright suite: confirmed ad-slot computed
  `border-radius: 6px` / `box-shadow: none` / 250px reserved height /
  `::before` "Advertisement" label, primary-button shadow resolving correctly
  in both panes, `.force-focus` painting both the 2px outline and 4px halo
  after the fix, disabled-primary-in-dark having no shadow, toast viewport as
  `<ol>`, page's first heading as `<h1>`, before/after divider tracking a
  pointer drag, accordion opening/closing. This is real verification, but it
  is one person's manual pass on one browser, not a repeatable suite.

## Root Cause Analysis

The cascade-layer and build-time-inlining defects happened because Tailwind
v4's layer and theme-resolution semantics are genuinely non-obvious — losing
to `@layer utilities` "regardless of specificity" and inlining theme values
"at build time" are both surprising if you haven't hit them before, and
nothing in a unit test surfaces either one. The `dark:` leak happened because
nobody had put both themes on the same page at the same time until the
gallery existed to do it. All three are visual/computed-style defects that
require an actual render pipeline to observe — which is exactly the category
of check this environment cannot currently run through Playwright.

The bottom-bar layout shift happened because "declare state after mount" is
the default instinct for cross-component coordination in React, and it is
wrong whenever the coordinated element is something the SSG HTML has to get
right on first paint. The fix (declare at render time) is not more code, it's
less — the self-registration pattern was strictly worse than passing a prop.

The unrun browser suite is an environment problem, not a code problem, but
three phases of "written, unrun" is no longer something to note in passing.
Nothing in this project's CI currently proves that keyboard focus, tab order,
or 320px layout actually work — only that a human looked at Chrome once per
phase and didn't find anything wrong.

## Lessons Learned

- **A states gallery earns its keep on day one.** Building `/dev/states` was
  scoped as review infrastructure and became the actual bug-finding
  instrument — it found in one screenshot what five sittings of
  component-by-component review missed. Build the multi-theme, multi-state
  side-by-side view before the components ship, not after a defect report
  asks for one.
- **Green unit tests plus green typecheck is not proof of correct rendering.**
  132 passing tests and a clean build coexisted with a broken focus ring on
  four components and a dead-code dark-mode override. If a defect can only be
  observed as a computed style, no amount of markup-assertion testing will
  catch it — only an actual render will.
- **State registered after mount is a layout-shift risk if the SSG HTML has to
  reserve space for it.** Prefer declaring shared UI state (visibility,
  mutual exclusion) at render time via props/context values, not via effects
  that fire post-hydration.
- **The unrun browser suite is now a three-phase pattern, not an incident.**
  Every phase that ships rendered behavior currently depends on one manual
  Chrome pass as its only cross-browser signal. That is thin, and it is thin
  by omission rather than by decision — nobody has fixed the Mach bootstrap
  namespace, so the gap just keeps recurring quietly in each phase's delivery
  record.

## Next Steps

- **Fix the macOS Mach bootstrap namespace blocking Playwright**, or document
  an accepted alternative (CI-hosted browser run, a different sandbox
  profile). Owner: whoever picks up environment/tooling next — this has now
  blocked the e2e suite in Phases 1, 4, and 3, and it should stop being
  re-discovered per phase.
- **Run `pnpm test:e2e` and `pnpm test:e2e --project=webkit` from a fresh
  terminal** the moment the environment allows it, to close out the keyboard
  sweep, the 320px check (currently reasoned, not measured), and the WebKit
  `hidden="until-found"` accordion path.
- **Phase 5 must pass `actionBarVisible` to `BottomBarProvider`** — the
  bottom-bar mutual-exclusion fix depends on the consuming page providing this
  correctly, since the bar no longer self-registers.
- **Phase 5 must pass `ProgressBar` a percent, not the engine's 0-1
  fraction** — `Math.round(event.value * 100)`, rounding a real measurement,
  never inventing one.
- FileChip "Removing" and Dropzone "Loaded" are deliberately unbuilt as
  component states — they are job-flow transitions owned by the tool page,
  not the component library. Phase 5 owns both.
