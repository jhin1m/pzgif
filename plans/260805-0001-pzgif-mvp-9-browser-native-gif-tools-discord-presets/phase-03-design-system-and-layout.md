---
phase: 3
title: "Design System and Layout"
status: pending
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

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Components drift from `design-guidelines.md` during tool-page work | The doc is the source of truth by its own §0. `/dev/states` makes drift visible in one screen. Review it before each phase closes |
| `BeforeAfterSlider` is janky on large GIFs | Build the static side-by-side fallback in this phase, not later. Set the threshold from Phase 1 data |
| shadcn components arrive with `dark:` utilities that do not match `[data-theme]` | The single `@custom-variant dark` line from Phase 2 handles this globally. Never patch components individually |
| Over-building the library | Build only what the 12 specs and the chrome require. No variants "for later" |

## Open questions

1. `BeforeAfterSlider` fallback threshold for very large GIFs — **this is a real dependency on Phase 1**, not a footnote. Build the component and its static side-by-side fallback in this phase; set the switchover threshold once Phase 1's numbers land. Everything else here is genuinely engine-free.
2. Favicon/logo legibility at 32px is untested and the mark does not exist yet. Ship the text wordmark per the bootstrap decision; do not block on it.
