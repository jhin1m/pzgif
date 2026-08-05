# Phase 3 — Design System and Layout: delivery report

Date: 2026-08-05 · Branch: `phase-01-benchmark-spike` · Status: **code complete, browser suite unrun**

## What shipped

18 components, one gallery route, three new test files, and a token layer that
now survives being nested inside itself.

| Group | Files |
|---|---|
| Primitives | `ui/button.tsx` · `slider.tsx` · `select.tsx` · `switch.tsx` · `accordion.tsx` · `toast.tsx` · `badge.tsx` · `preset-chip.tsx` · `forced-state.ts` |
| Tool | `tool/dropzone.tsx` · `file-chip.tsx` · `progress-bar.tsx` · `before-after-slider.tsx` · `result-panel.tsx` · `settings-panel.tsx` · `sticky-action-bar.tsx` · `action-bar-context.tsx` |
| Ads | `ads/ad-slot.tsx` — reserved and empty, which is the correct end state until Phase 10 |
| Chrome | `layout/site-header.tsx` · `site-footer.tsx` · `skip-link.tsx` · `trust-line.tsx` · `theme-toggle.tsx` · `consent-bar.tsx` · `brand/marks.tsx` |
| Support | `lib/tools/file-format.ts` — the synchronous accept/reject check at the input boundary |
| Gallery | `app/[locale]/dev/states/` — every component, every state, both themes, `noindex` |

`src/components/site-footer.tsx` and `src/components/theme-toggle.tsx` moved into
`layout/` and were rewritten; the AGPL source offer and its pinned commit SHA
came with them unchanged.

## Verification

Green: `typecheck`, `lint`, `test` (132 passing across 18 files), `build`,
`check:static`, `check:forbidden`.

**Playwright did not run.** No browser will launch in this environment — the same
wedged macOS Mach bootstrap namespace recorded in Phase 1 and Phase 4, which
kills the pre-existing `app-shell` suite identically. `e2e/component-states.spec.ts`
is written and covers what unit tests structurally cannot: tab order, computed
focus styles, the WebKit accordion path, the five before/after key bindings, the
ad slot's computed radius and label, and horizontal scroll at 320px.

What was verified instead: the production build was served and driven through
Chrome, and the following were read out of live computed styles rather than
inferred — ad slot at `border-radius: 6px`, `box-shadow: none`, 250px reserved,
`::before` reading "Advertisement"; primary-button shadow resolving to the light
tint inside a light pane and to opaque black inside a dark one; `.force-focus`
painting both the 2px outline and the 4px halo; a disabled primary in dark mode
with no shadow at all; the toast viewport rendering as `<ol>`; the page's first
heading being its `<h1>`; the before/after divider tracking a pointer drag; the
accordion opening and closing.

## The review pass

`code-reviewer` returned 23 findings. **All 7 blocking ones are fixed**, plus 11
of the remainder. Four were defects no static check would have caught:

1. **The theme-toggle rename silently broke the dark-mode e2e test** — the label
   became "Switch to dark theme" while `app-shell.spec.ts` matched
   `/switch theme/i`, so the locator resolved to nothing and the one test proving
   `@theme inline` survived would have timed out rather than failed.
2. **The focus halo did not render on any control carrying a `shadow-*` utility.**
   `@layer base` loses to `@layer utilities` regardless of specificity, so the
   halo was overwritten on the primary button, the before/after handle, the
   result panel and the toast — precisely the controls a keyboard user lands on.
3. **Firefox had no visible focus on a slider at all.** The ring is drawn on the
   thumb, and only `::-webkit-slider-thumb` had a rule.
4. **The paired number input could not be typed into.** It clamped on every
   keystroke, so on a 16-256 control "1" became 16 and "128" was unreachable —
   the exact fight §5.4 adds the control to end.

## Three things the gallery caught that a component-at-a-time review would not

**`dark:` leaks into nested light subtrees.** The variant is
`[data-theme="dark"] *`, so it fires inside a nested `[data-theme="light"]`
element too. Rendering both themes side by side made it visible in one screenshot:
light-pane secondary buttons wearing the dark hover colour. Fixed by giving the
four theme-dependent states real semantic tokens — which §2.2 already required —
and `theme-tokens.test.ts` now fails the build on any `dark:` or palette
primitive inside `src/components/`.

**Tailwind inlines theme values, so `[data-theme="dark"] { --shadow-sm: … }` is
inert.** §4.3 asks for shadows that change with the theme. The fix is to write
the theme value with `var()` references — `0 1px 2px var(--shadow-tint-1)` — so
resolution stays live. Overriding Tailwind's internal `--tw-shadow` from outside
the cascade layers was tried first and rejected: it also beats `shadow-none`, so
a disabled or pressed button kept a shadow §5.1 forbids.

**The bottom-bar mutual exclusion was implemented as an effect, and that broke
the thing it protects.** Registering "the action bar is up" after mount meant the
anchor ad slot shipped in the static HTML and then unmounted on hydration — a
layout shift on the one element §8.2 exists to reserve — and it suppressed the
consent bar on desktop, where the bar is `display: none` but its effect ran
anyway. It is now declared on `BottomBarProvider` at render time.

## What Phase 5 inherits

- **`BottomBarProvider` needs `actionBarVisible`.** A tool page that renders
  `StickyActionBar` must nest its own provider with the same condition, or the
  anchor ad and the action bar will both claim the bottom of a 667px viewport.
- **`ProgressBar` takes percent, not the engine's fraction.** Pass
  `Math.round(event.value * 100)` — rounding a measurement, never inventing one.
- **`Dropzone` needs `toolSlug`** for its rejection to name a real alternative
  tool, and `onFile` for it to bind the document paste listener at all.
- **FileChip "Removing" and Dropzone "Loaded" do not exist as component states.**
  Both are job-flow transitions and belong to the tool, not the component.
- **`shouldRenderSideBySide()` is provisional.** Its shape is grounded in Phase 1;
  its constant is not, and on iOS it will choose the static pair for most real
  comparisons.

## Unresolved

1. The keyboard sweep and the 320px check are written and unrun. The 320px fix
   (stacking gallery rows below `sm`, `min-w-0` on the content cell) is reasoned
   from grid sizing rules, not measured.
2. `middleEllipsis` now iterates code points, not grapheme clusters — a flag
   emoji or a combining sequence can still be split. Not worth more until a real
   filename proves it.
3. The `Dropzone`'s document-level paste binding has no ownership rule beyond
   "only an instance with an `onFile` handler binds". Correct for one dropzone
   per page; a Phase 5 question the day that stops being true.
