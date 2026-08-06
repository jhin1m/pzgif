# From brainstormer to planner — homepage soul, brand motif, two job moments

**Date:** 2026-08-05
**Branch:** main
**Trigger:** operator reported the site "feels soulless"; asked for suggestions
**Outcome:** Option A ratified by operator 2026-08-05
**Governs:** a new plan covering the Ship 0 homepage + polish on the 5 live tool pages

---

## 1. Problem statement

The operator's complaint decomposes into three things they named explicitly:

1. **Homepage is empty.** `src/app/[locale]/page.tsx:29-55` is a skeleton — `h1` + `TrustLine` + three groups of bare link boxes. No hero, no dropzone, no icons, no tool descriptions, no why-block.
2. **No brand identity.** Reads as default shadcn. Logo is a deliberate placeholder (`src/components/brand/marks.tsx:5-8`). No repeated visual motif. Primary `#3D5AFE` used almost only on buttons; accent teal reserved but unassigned to any meaning.
3. **No motion/feedback at two specific moments** (operator picked these two out of four offered): **job completion** and **before a file is loaded**.

**Not a plan deviation — a plan arrear.** `plan.md:220` defines **Ship 0 (week 1-2)** as Phase 2 + Phase 9 + the chrome half of Phase 3 + Phase 10. Ship 0 was never executed; the engine (Phases 4-6) shipped first. The homepage being a holding page is the documented consequence.

## 2. Requirements captured (operator answers, 2 rounds)

| Item | Value |
|---|---|
| **Scope** | Homepage + the 5 live tool pages (compressor, resize, crop, speed, reverse) |
| **Motion law** | **Unchanged.** `design-guidelines.md` §6 stands — no loops, no parallax, no scroll effects, no route curtains, no ad-slot animation |
| **Hero shape** | Real dropzone **with routing** — not a decorative one, not a demo |
| **Brand identity** | Repeated visual motif + stronger colour/surface depth + (mascot requested, see §4 — deferred with a cheap substitute) |
| **Moments** | Job done · empty (pre-file) state |
| **Out of scope** | Real logo/favicon/OG · full mascot · Phase 7 tools · Phase 8 Discord cluster · fixing the 5 failing browser tests |

## 3. The finding that changed the hero design

`docs/wireframe/index.html:86` promises *"We pick the right tool for your file."*

**It cannot deliver that.** `src/lib/media/sniff.ts` decides *what format the bytes are* — it says nothing about *what the user wants to do*. Drop a `.gif` and `registry.ts` yields **5 live tools that all accept `gif`**. Auto-routing guesses wrong 4 times in 5.

**Resolution (better than the wireframe):** the hero dropzone does not navigate on drop. It **becomes an action picker** — FileChip + tool chips filtered from `registry.inputFormats` against the *sniffed* format. Clicking a chip performs a client-side navigation carrying the file.

- **Why it works:** Next App Router client navigation does not reload the document, so a module-level singleton holding the `File` survives the transition. No IndexedDB, no serialization, no `sessionStorage` (which cannot hold a `File` anyway).
- **Accepted failure mode:** a hard reload loses the file and the tool page falls back to its own empty dropzone. Predictable, and the tool page already handles that state.
- **Why it is a differentiator:** ezgif forces tool-selection *before* upload. PZGIF accepts the file first and asks second.

## 4. Ratified solution — Option A ("Ship 0, done properly")

### Track 1 — Homepage

| Block | Content | Constraint |
|---|---|---|
| Hero | `h1` + lead + TrustLine + large dropzone + "Nothing to install. No account. No watermark." | **No ad slot above the dropzone.** Dropzone fully visible at 375×667 without scrolling |
| Action picker | Sniff → FileChip → tool chips → client nav with file handoff | See §3 |
| Tool grid | Icon + name + **one hand-written benefit line per tool** | Benefit lines **must not** live in `registry.ts` (HARD RULE, `registry.ts:8-11`). They go in `src/content/` |
| Why PZGIF | 3-up: runs in tab / nothing uploaded / gifski quality | Each tile carries a **measured** number from `bench-results/`, not a claim |
| Discord teaser | Preset chips via the existing `PresetChip` primitive | Links must respect `RouteStatus` — `planned` routes are not linkable |

**Copy warning carried forward:** `plan.md:24` documents four known wireframe defects (two unbacked speed claims, cut tools in the footer, wrong Discord dimensions, mobile limits contradicting the memory model). Borrow the *voice*, never the *numbers*.

### Track 2 — Brand identity

| # | Item | Rationale | Cost |
|---|---|---|---|
| a | **Checkerboard alpha motif** under every preview, dropzone and empty state | Universal "transparent image" signifier; carries meaning (*this is where the image appears*), not decoration. Pure `repeating-linear-gradient` — zero bytes, zero CLS. Grep confirms nothing like it exists in `globals.css` today | Very low |
| b | **LoopMark promoted to recurring device** — faint watermark in empty states, section divider, 404 mark | Asset already exists (`marks.tsx:34`), used only in the dropzone | Very low |
| c | **Teal = the winning number.** Accent applied consistently to the delta badge and post-compression byte count | Accent is spec-capped at <5% of surface and currently spent on nothing meaningful. One colour, one meaning | Low |
| d | **Mascot — deferred.** Cheap substitute: personify LoopMark with two eye dots in empty/404 states | A real mascot needs a multi-pose set and a designer, risks the privacy-serious tone, and inverts plan order (the *logo* is already deliberately deferred). Operator may re-open as a separate parallel track | — |

### Track 3 — The two moments

**Job done.** Currently a 180ms fade plus a percentage badge. `pz-check-pop` exists but is used only in `progress-bar.tsx:95`. ResultPanel becomes a statement:

```
✓  2.4 MB  →  480 KB          [-80%]      ← check-pop 200ms, teal
   You just cut 1.9 MB.
   [ ⬇ Download GIF ]                     ← primary button, not a side link
   ──────────────────────────────────
   Next?  [ Resize ]  [ Crop for Discord ]  ← related, from registry
```

No confetti, no count-up. Fits §6 as written.

**Empty (pre-file).** `result-panel.tsx:33-48` is a 320px dashed box with one grey sentence occupying half the viewport. Replace with: checkerboard motif + LoopMark + short line + three "what will appear here" rows. Same `min-height`, so CLS is unchanged.

> ⚠️ **Do not wire the size estimate into this state.** `gif-compressor-tool.tsx:289-301` records that the live estimate was **removed because it corrupted output** — `downscale.ts` holds module-level scratch state, and an estimate running concurrently with a job overwrote it. Reviving it here without fixing the root cause reintroduces a measured defect.

## 5. Options considered and rejected

| Option | Scope | Estimate | Why rejected |
|---|---|---|---|
| **B — minimal** | Motif + two moments only; homepage untouched | 1-2d | Does not touch the surface the operator complained about most |
| **C — everything** | A + mascot + logo + favicon + OG | 9-13d | Mixes code work with graphic-design work in one pass; the design half blocks the code half. Also pulls forward what the plan deliberately deferred |

Also rejected during discussion: auto-routing the hero drop (§3); auto-playing GIF demo in the hero (violates §6 "anything that runs on a loop" and §7.4 "no auto-playing preview loop unless the user opts in"); count-up number animation on the result (motion with no informational content).

## 6. Acceptance criteria

- [ ] Homepage renders hero + working dropzone + action picker + tool grid + why-block + Discord teaser
- [ ] Dropping a GIF on the homepage and clicking a tool chip lands on that tool **with the file already loaded** — no second file selection
- [ ] Hard-reloading a tool page reached that way degrades to its normal empty dropzone, no error
- [ ] Every tool-card benefit line is hand-written and lives in `src/content/`, not `registry.ts`
- [ ] No speed or size claim appears anywhere without a measurement in `bench-results/` behind it
- [ ] Checkerboard motif present on dropzone, preview and empty state; renders correctly in both themes
- [ ] ResultPanel on completion: check-pop + delta + primary download + related tools
- [ ] Empty ResultPanel keeps its existing `min-height`; CLS does not regress on any route
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check:forbidden`, `pnpm check:static` all green
- [ ] `prefers-reduced-motion` honoured on every new motion; no new looping animation anywhere

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| File handoff via module singleton breaks if a future route becomes a hard navigation | Homepage promise silently fails | Tool page must always accept a missing handoff and show its own dropzone. E2E asserts both paths |
| Homepage grows an unreserved box → CLS on the ranking surface | CLS is a ranking input and already sits at 0.015 on the compressor | Reserve every box in static HTML, as ResultPanel already does. Lighthouse check per route before merge |
| Benefit lines drift toward template copy across 9 cards | Site-wide scaled-content-abuse penalty | Lines live in `src/content/`; a test can assert `registry.ts` contains no prose (`tool-copy.test.ts` already exists) |
| 5 browser tests already failing on `main` (`plan.md:259`), one of them CLS on the compressor | New work lands on an unstable baseline and blame gets confused | **Recommend fixing the compressor CLS failure before Track 3**, since Track 3 modifies exactly that component |
| Checkerboard motif reads as noise behind real content | Visual regression in the opposite direction | Keep it at low opacity and only behind *empty* or *media* surfaces, never behind text |

## 8. Decisions taken to unblock planning (assumptions — flag if wrong)

1. **Icons: `lucide-react`**, already in dependencies and already used in `site-header.tsx`. Nine bespoke SVGs would have more character but are a separate design task and were not part of Option A.
2. **Copy: drafted by the implementer in the wireframe's voice, operator approves before merge.** Rule #3 requires every word hand-written; it does not require the operator to type them.
3. **Mascot: not started.** Available as a separate parallel track on request.

## 9. Unresolved questions

1. Should the compressor's CLS 0.015 failure be folded into this plan as a prerequisite phase, or stay a separate fix? (Recommendation: fold it in — Track 3 edits the same component.)
2. The homepage dropzone accepts formats whose tools are `planned`, not `live` (mp4, webm, mov, webp). Refuse them up front with a "coming soon" reason, or accept and offer nothing? Neither is obviously right and it affects the action-picker's empty case.
3. iOS: the action picker must not offer a video-input tool on iOS (`plan.md:78-88`). `capability.ts` exists — confirm it can be called from the homepage without pulling the worker bundle into the landing page's critical path.
