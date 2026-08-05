---
phase: 3
title: "Design System and Layout"
status: code-complete
priority: P1
effort: "6-8d"
dependencies: [2]
---

# Phase 3: Design System and Layout

## Overview

Build every reusable component in `design-guidelines.md` §5, plus the page chrome, as a self-contained library with a states gallery — before any tool page consumes them. Runs in parallel with Phase 1.

`docs/wireframe/states.html` already renders every component state visually. Treat it as the acceptance target: the built component must match it state for state.

## Requirements

**Functional**
- All 12 components from `design-guidelines.md` §5, each with every documented state
- Page chrome: Header, Footer, TrustLine, StickyActionBar, ThemeToggle, SkipLink
- A `/dev/states` route mirroring `states.html`, excluded from the sitemap and `noindex`

**Non-functional**
- WCAG 2.1 AA at component level: focus-visible on everything, ≥44px touch targets, no colour-only signalling
- Zero layout shift: every box that will later be filled declares its size in CSS

## Architecture

### Component inventory

| Component | Spec | Notes that are easy to get wrong |
|---|---|---|
| `Button` | §5.1 | 4 variants × 6 states. **Loading freezes `min-width`** so the layout never shifts on label swap. Only one primary per viewport |
| `Dropzone` | §5.2 | A real `<button>` wrapping a visually-hidden `<input type="file">`. **Never resizes on drag** — border/bg/scale(1.01) only. Document-level paste binding. Invalid-file state always names the correct alternative tool |
| `FileChip` | §5.3 | Middle-ellipsis at 22ch, mono size badge, 24px remove target with its own focus ring |
| `Slider` | §5.4 | Native `<input type="range">` only. **No transition on thumb position.** Paired number input on desktop. Fixed-width mono readout so it cannot reflow |
| `Select` | §5.5 | Radix Select via shadcn. Do not roll a custom listbox |
| `Toggle` | §5.6 | Native `role="switch"`. Never icon-only labelling |
| `ProgressBar` | §5.7 | **`transition: none` on the fill width.** Indeterminate becomes a static labelled track under reduced motion. Cancel sits 16px right and is always focusable |
| `BeforeAfterSlider` | §5.8 | `clip-path: inset()`, `setPointerCapture`, `touch-action: none`. Full keyboard slider semantics incl. Enter to A-B flip |
| `ResultPanel` | §5.9 | Empty state reserves the height. Reveal is 180ms; the box does not grow |
| `AdSlot` | §5.10 | 6px radius — a **reserved word**, ad slots only. Flat fill, 1px border, `box-shadow: none`, `contain: layout size`, always-present "Advertisement" label |
| `Toast` | §5.11 | Errors never auto-dismiss. Hover/focus pauses the timer |
| `Accordion` | §5.12 | `grid-template-rows: 0fr → 1fr`. **`hidden="until-found"` — but see the Safari trap below** |

> Counting honestly, this is **18 components** once the chrome is included, each with a full state matrix — not 12. `BeforeAfterSlider` alone is a day and a half. That is why this phase is 6-8 days, not 3.

### The `hidden="until-found"` trap — it fails closed in Safari

`design-guidelines.md` §5.12 mandates `hidden="until-found"` so FAQ answers stay crawlable and browser find-in-page can reveal them. **Safari does not support it** (Technology Preview only as of August 2026), and the attribute's invalid-value default is the plain *hidden* state. So on Safari the answers are `display: none` and the accordion **cannot open them at all** — a broken FAQ for roughly a fifth of desktop traffic and all of iOS, on the pages the whole SEO strategy depends on.

Implement it as progressive enhancement: render the answers visible-but-collapsed by default, and apply `hidden="until-found"` **imperatively at runtime only when the browser supports it** (feature-detect `'onbeforematch' in document.body`). The crawlability requirement is satisfied either way, because the content is in the SSG HTML in both branches. Add a Safari case to the Phase 11 matrix that actually opens an FAQ item.

### The two components that carry real engineering risk

**`BeforeAfterSlider`** is differentiator #1's proof surface. Any lag destroys the moment it exists to create. Build it pointer-tracked with zero transition, and implement the documented fallback: if the comparison is too expensive for a large GIF, render a static side-by-side pair with the same labels rather than shipping a laggy divider. The threshold is an open question in `design-guidelines.md` — set it from Phase 1's measurements.

**`ProgressBar`** encodes design principle #2 ("never fake progress"). Build it so faking is *structurally impossible*: the component takes either `{determinate: true, value: number}` or `{determinate: false, label: string}` and has no internal timer, no animation on width, and no way to interpolate. A unit test asserts the rendered width equals the passed value exactly.

### Ad slot quarantine — enforce it mechanically

The 6px-vs-16px radius mismatch is a deliberate "this is not app UI" signal. Add a lint or unit test asserting no product component uses `--radius-ad` / 6px, and that `.ad-slot` never carries a shadow. `design-guidelines.md` §1.3 makes this a design-review failure condition; make it a CI failure condition too.

## Related Code Files

- Create: `src/components/ui/**` — shadcn primitives (button, select, slider, switch, accordion, toast/sonner)
- Create: `src/components/tool/dropzone.tsx`, `file-chip.tsx`, `progress-bar.tsx`, `result-panel.tsx`, `before-after-slider.tsx`, `settings-panel.tsx`, `sticky-action-bar.tsx`
- Create: `src/components/ads/ad-slot.tsx` — visual shell only; the provider lands in Phase 10
- Create: `src/components/layout/header.tsx`, `footer.tsx`, `trust-line.tsx`, `theme-toggle.tsx`, `skip-link.tsx`
- Create: `src/app/[locale]/dev/states/page.tsx` — the gallery, `noindex`
- Create: `src/components/**/*.test.tsx` — Vitest unit tests
- Reference: `docs/wireframe/states.html`, `docs/wireframe/wireframe.css`

## Implementation Steps

1. Add the shadcn primitives actually needed. Resist adding the full set — YAGNI.
2. Build `Button` first with all four variants and six states; it is the dependency of most other components. Verify the loading state freezes width.
3. Build `Dropzone`. Get the three input routes working — drag-drop, click-to-browse, and document-level paste — and confirm each announces correctly. The invalid-file message must name a real alternative tool, sourced from the registry, so it can never become a dead end.
4. Build `ProgressBar` with the structural no-fake-progress design above, plus its unit test.
5. Build `BeforeAfterSlider` with full keyboard semantics: ←/→ 1%, Shift+←/→ 10%, Home/End, Enter for A-B flip. Test with a real large GIF, not a placeholder image.
6. Build `ResultPanel` with the reserved empty state — this is what prevents the layout shift when a result arrives.
7. Build `AdSlot` in all three sizes (`rect` 300×250, `inline` 336×280, `rail` 300×600) with the quarantine treatment and `contain: layout size`. It renders reserved and empty at this stage; that is the correct end state for Phase 3. **Add `position: relative` to `.ad-slot`** — `design-guidelines.md` §5.10 positions the "Advertisement" label absolutely but never establishes a containing block, so as written the label positions against some ancestor instead.
7b. Specify the **consent banner** treatment here, not in Phase 10. Every CMP's default mobile layout is a bottom sheet or overlay taking 30-50% of a 667px viewport, which would break this project's hardest acceptance criterion — the dropzone must be fully visible at 375×667 without scrolling. Design a compact bottom bar with reserved height that never overlays the dropzone, and never coexists with the sticky action bar.
8. Build the page chrome. `Header` is 56px sticky at z-10; `StickyActionBar` is 64px at z-20 and appears below `md` only once a file is loaded. **Footer must list exactly the 9 shipped tools + the Discord cluster** — correct the wireframe's extra `GIF to WebP` and `GIF for Slack` entries, which are out of MVP scope.
9. Build `/dev/states` mirroring `states.html`. This is the visual regression target for Phase 11 and the fastest way to review all states at once.
10. Accessibility pass over the library: keyboard-only traversal of every component, focus-visible on every interactive element including the dropzone and the before/after handle, forced-colors sanity check, 200% zoom at 375px with no horizontal scroll.

## Success Criteria

- [ ] Every component in `design-guidelines.md` §5 exists with every documented state, rendered in `/dev/states`
- [ ] Side-by-side comparison with `docs/wireframe/states.html` shows no unintended divergence
- [ ] `ProgressBar` cannot express a synthesised value — enforced by its API shape and a passing unit test
- [ ] Lint/test asserts no product component uses the 6px ad radius, and no `.ad-slot` has a shadow
- [ ] Keyboard-only pass over `/dev/states` with no trap and no unreachable control
- [ ] No horizontal scroll at 320px; all text readable at 200% zoom
- [ ] Footer lists exactly the 9 MVP tools plus the Discord cluster
- [ ] All components render correctly in both themes

## Delivery record — 2026-08-05

Code complete. Every component in §5 plus the chrome exists, `/dev/states`
renders all of them in both themes, and `typecheck`, `lint`, `test` (131
passing), `build`, `check:static` and `check:forbidden` are green.

**The Playwright suite did not run.** `e2e/component-states.spec.ts` is written —
skip-link tab order, the 62% fill measured against its track with
`transitionDuration: 0s`, the accordion opening on WebKit, the five before/after
key bindings, the ad slot's computed radius/shadow/label, and no horizontal
scroll at 320px — but no browser will launch in this environment (the wedged
macOS Mach bootstrap namespace first recorded in Phase 1, still unresolved). A
fresh terminal clears it:

```
pnpm test:e2e                       # chromium + webkit
pnpm test:e2e --project=webkit      # the hidden="until-found" case specifically
```

What was verified instead, and it is not nothing: the production build was served
and driven through Chrome. The ad slot computes to `border-radius: 6px`,
`box-shadow: none`, a 250px reserved height and an `::before` reading
"Advertisement"; the primary button's shadow resolves to the light tint in a
light pane and to opaque black in a dark one; `.force-focus` paints a 2px outline
*and* the 4px halo; a disabled primary in dark mode has no shadow at all; the
toast viewport is an `<ol>`; the page's first heading is its `<h1>`; the
before/after divider tracks a pointer drag; the accordion opens and closes.

A `code-reviewer` pass found **23 findings; the 7 it called blocking are fixed**,
along with 11 of the rest. Four were defects that static checks could not have
caught:

1. **The theme-toggle rename silently broke the dark-mode e2e test.** The label
   became "Switch to dark theme", and `app-shell.spec.ts` matched `/switch
   theme/i` — the locator resolved to nothing, so the one test that proves
   `@theme inline` survived would have timed out rather than failed loudly.
2. **The focus halo did not render on any control carrying a `shadow-*`
   utility** — the primary button, the before/after handle, the result panel, the
   toast. `@layer base` loses to `@layer utilities` regardless of specificity, so
   the halo was overwritten on exactly the controls a keyboard user lands on.
3. **Firefox had no visible focus on a slider at all.** The ring is drawn on the
   thumb, and only `::-webkit-slider-thumb` had a rule.
4. **The paired number input could not be typed into.** It clamped on every
   keystroke, so on a 16-256 control "1" became 16 and "128" was unreachable —
   the control §5.4 adds *because* dragging to an exact value is a fight.

### Deviations from this phase file

| # | Planned | Shipped | Why |
|---|---|---|---|
| 1 | Dropzone is "a real `<button>` wrapping a visually-hidden `<input type=file>`" (§5.2) | Button and input are siblings; the input is `tabIndex={-1}` and `aria-hidden` | An `<input>` inside a `<button>` is invalid HTML — interactive content inside interactive content — and double-fires the picker in some browsers. Tab reach, Enter/Space, drag-drop and paste all behave as §5.2 requires |
| 2 | Invalid-file message names the alternative tool inside the box | Message in the box, link directly beneath it | Same nesting rule: a `<a>` cannot live inside the `<button>`. Both sit inside one `role="alert"` |
| 3 | shadcn primitives added with the CLI | Hand-written against the installed `radix-ui` package | No network in this environment. The result is the same Radix primitives with PZGIF tokens, and rather less unused surface |
| 4 | Component unit tests via a DOM | `react-dom/server` markup assertions + Playwright for behaviour | `jsdom` and `@testing-library/react` cannot be installed offline. The split is honest: what is provable from markup is unit-tested; what needs an engine is in the e2e spec rather than faked |
| 5 | Accordion uses `hidden="until-found"` (§5.12) | Applied imperatively after mount, only where `onbeforematch` exists | Stated in this phase file already. Safari's invalid-value default is plain *hidden*, which would make a closed FAQ answer impossible to open for every iOS visitor |
| 6 | (not specified) | **Four new semantic tokens** — `--surface-hover`, `--border-control-hover`, `--surface-disabled`, `--control-track`, plus `--border-hover`, `--mark-muted`, `--shadow-bar` | The `dark:` variant is `[data-theme="dark"] *`, so it fires inside a *nested* light subtree too. `/dev/states` renders both themes at once and showed it immediately: light-pane buttons wearing dark hover colours. §2.2 already said components must go through semantic tokens; these are the ones that were missing. `theme-tokens.test.ts` now fails the build on any `dark:` or primitive in a component |
| 7 | (not specified) | Shadow theme values are `var()` references, not literals | Tailwind inlines a theme value at build time, so `[data-theme="dark"] { --shadow-sm: … }` is inert. §4.3's "halve nothing — instead swap" needs runtime resolution, and a `var()` inside the value is what provides it. Overriding Tailwind's internal `--tw-shadow` from outside the layers was tried first and rejected: it also beats `shadow-none`, so a disabled or pressed button kept a shadow §5.1 forbids |
| 8 | Bottom-bar mutual exclusion (§8.1) via a context the action bar registers with | Declared on `BottomBarProvider` at render time; the bar no longer self-registers | The effect version rendered the anchor slot into the static HTML and then unmounted it on hydration — a layout shift on the one element §8.2 exists to reserve. It also suppressed the consent bar on desktop, where the bar is `display: none` but its effect ran anyway. **Phase 5 must pass `actionBarVisible` when it renders the bar** |
| 9 | FileChip "Removing" (§5.3) and Dropzone "Loaded" (§5.2) as component states | Not built | Both are transitions owned by the job flow, not by the component: the chip cannot know that a removal was accepted, and "loaded" is the tool deciding to swap the dropzone for a chip row. Phase 5 owns both, and the gallery shows the end state |
| 10 | Dropzone mark at 120px (§5.2) | 72px, 96px at `md` | `docs/wireframe/states.html` is the visual source of truth and uses those sizes; 120px crowds the 176px mobile box |
| 11 | Esc dismisses the newest toast (§7.3) | Radix's in-toast Escape only | A global Escape listener would also close an open Select or a future modal. F6 reaches the toast region, and Escape works from there |

### Success criteria status

- [x] Every component in §5 exists with every documented state, rendered in `/dev/states` — except the two transitions in deviation 9
- [x] Side-by-side comparison with `docs/wireframe/states.html` — reviewed section by section in Chrome; the divergences are listed above
- [x] `ProgressBar` cannot express a synthesised value — no state, no ref, no timer, and `determinate: false` has no `value` field in the type. `progress-bar.test.tsx` asserts the rendered width equals the passed value for six values
- [x] Lint/test asserts no product component uses the 6px ad radius and no `.ad-slot` has a shadow — `ad-quarantine.test.ts`, plus computed-style confirmation in Chrome
- [x] Footer lists exactly the 9 MVP tools plus the Discord cluster — rendered from `registry.ts`, so the wireframe's `GIF to WebP` and `GIF for Slack` are unrepresentable
- [x] All components render correctly in both themes — both panes, verified
- [ ] Keyboard-only pass over `/dev/states` with no trap and no unreachable control — spec written, **unrun**
- [ ] No horizontal scroll at 320px; text readable at 200% zoom — spec written, **unrun**. The known offender (a `whitespace-nowrap` button inside a `1fr` grid track) was fixed by stacking the gallery rows below `sm` and adding `min-w-0`, but that fix is reasoned, not measured

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Components drift from `design-guidelines.md` during tool-page work | The doc is the source of truth by its own §0. `/dev/states` makes drift visible in one screen. Review it before each phase closes |
| `BeforeAfterSlider` is janky on large GIFs | Build the static side-by-side fallback in this phase, not later. Set the threshold from Phase 1 data |
| shadcn components arrive with `dark:` utilities that do not match `[data-theme]` | The single `@custom-variant dark` line from Phase 2 handles this globally. Never patch components individually |
| Over-building the library | Build only what the 12 specs and the chrome require. No variants "for later" |

## Open questions

1. ~~`BeforeAfterSlider` fallback threshold~~ — **provisionally set.** `shouldRenderSideBySide()` refuses the slider when `frames × width × height` exceeds a quarter of the device tier's frame-buffer budget divided by the 8 bytes two RGBA layers cost per pixel. The *shape* is grounded in the one quantity Phase 1 measured; the constant is not, because Phase 1 measured decode and encode throughput, not browser compositing. It fails toward the static pair, which is the safe direction. Phase 11 re-measures it. On iOS the rule is strict enough that most comparisons will be static pairs — correct given a 30 MB budget, but worth confirming against a real device rather than an estimate.
2. Favicon/logo legibility at 32px is untested and the mark does not exist yet. Ship the text wordmark per the bootstrap decision; do not block on it.
3. **The `alwaysVisible` escape hatch on `StickyActionBar` exists only for the gallery.** If Phase 5 or 11 finds itself reaching for it in product code, the bar's breakpoint rule is wrong and should be changed rather than bypassed.
4. One finding was left open as smaller than its fix: the `Dropzone`'s document-level paste binding has no ownership rule beyond "only an instance with an `onFile` handler binds". That is right while a page has one working dropzone and wrong the day one has two, which is a Phase 5 question rather than a Phase 3 one.
