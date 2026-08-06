# Homepage soul pass — delivery report

Plan: `plans/260805-2239-pzgif-homepage-soul-pass-ship-0-homepage-brand-motif-job-moments/plan.md`
Date: 2026-08-06 · Branch: `main` · Commit at start: `d6e1332` (uncommitted tree)
Phases executed this session: **3, 5 (closed out), 6, 7**. Phases 1, 2 and 4 were already delivered.

---

## 1. State found, versus state recorded

`plan.md` said phases 3, 5, 6 and 7 were pending. Three of those four were
accurate; **Phase 5 was already code-complete** and only its frontmatter said
otherwise — `home.ts`, `home.json`, the `card`/`result` blocks on all five tool
content files, `home.test.ts` and the `tool-copy.test.ts` assertions were all on
disk and green. What was genuinely outstanding there was the operator approval
the phase names as a success criterion, and one defect (below).

Baseline before any change this session: `pnpm typecheck` clean, `pnpm test`
208/208.

## 2. The one copy defect, and the assertion that now prevents it

`src/content/home.json`'s third "why" tile read:

> "A 48-frame 320px GIF re-encoded in **0.76s** — measured in Chrome on an
> 8-core, 16 GB laptop."

**No run in `bench-results/` ever produced 0.76 s.** The hardware was real
(`calibration.json` records `cpuCores: 8`, `deviceMemoryGb: 16`, chromium) and
the shape of the claim was right, which is exactly why prose review would not
catch it. The nearest real row — `loop-small.gif`, gifski, 48 frames, 320×180,
quality 80 — is **685 ms**.

Corrected to `0.69 s`, and two assertions added to `home.test.ts`:

- every figure quoted in a tile's `evidence` must match a row in
  `calibration.json` on frames, dimensions and duration (±5 ms of the quoted
  precision);
- the hardware named in the prose must match `calibration.json`'s recorded
  context, so re-running the benchmark on a different machine fails the suite
  rather than leaving the page describing hardware nobody used.

Verified by reverting the number: the suite fails with
`"…0.76 s…" matches no row in bench-results/calibration.json`.

## 3. Phase 3 — result and empty state moments

- `ResultSummary` added to `result-panel.tsx`: check-pop mark (`--accent-text`,
  one 200 ms iteration), size delta, the tool's own saved-bytes sentence,
  Download as a primary button, and a "Next?" row.
- `NextTools` is its own module. It has to be: `result-panel.tsx` stays free of
  `@/i18n/navigation`, which cannot be loaded in the vitest node environment —
  a `Link` import there would have made the panel untestable.
- `SizeDelta` recoloured to accent per the plan. **The badge does not turn red
  when the output grew**; the word "larger" carries the direction and a red badge
  would mislabel a correct result.
- The saved-bytes sentence is **dropped** when the file grew — every `savedLine`
  is written in the language of having gained something — while the slot keeps
  its line box so both outcomes are the same height.
- Empty state rebuilt: `bg-checker`, the personified `LoopMark`, and the three
  hand-written `result.emptyRows`, on an opaque card so no copy sits on the
  pattern.
- `result-panel.test.tsx`: 13 assertions, including that both branches emit the
  *identical* reservation classes.

### The reservation had to be re-measured, and it is now four numbers

Adding two rows to the done state **returned CLS to the compressor immediately**:
0.0028828 on the first run, against a test that asserts 0. Measured across the
five tools and eleven widths, the done state needs:

| width | 320 | 360 | 400 | 440 | 480 | 560–767 | 768+ |
|---|---|---|---|---|---|---|---|
| px needed | 731 | 695 | 674 | 635 | 581 | 553 | 617 |

The curve is dominated by *wrapping*, not content, and it jumps back up at `md`
when the inline Download button appears. A single reservation would have to be
736 px everywhere, putting 180 px of blank under the widest phone. So:

```
min-h-184  min-[400px]:min-h-170  min-[480px]:min-h-147  md:min-h-156
```

`e2e/result-panel-reservation.spec.ts` (8 cases) asserts each band still covers
its contents, on the two tools with the tallest done state. Compressor CLS is
back to **0**.

`NextTools` is capped at two chips. Two reasons that agree: three is a menu and
the related-tools grid already is one, and a third chip is a third wrapped 44 px
line inside a reservation that is one constant for all five tools.

## 4. Phase 6 — homepage assembly

`page.tsx` rewritten as a server shell; six new components under
`src/components/home/`. The hero is the only client island.

- **The drop offers; it does not route.** Confirmed from the registry: all five
  live routes declare `inputFormats: ["gif"]`, so auto-routing guesses wrong four
  times in five. The wireframe's "we pick the right tool for your file" cannot be
  honoured and was not attempted.
- **Sniffed, not extension-matched.** `liveRoutesFor()` filters on `sniff.ts`'s
  answer, so an MP4 named `.gif` is named as a video and refused with a reason
  rather than reaching a decoder and dying as `decode-failed`.
- The picker's box is reserved (`h-104 sm:h-88 md:h-92`), measured the same way —
  the first attempt overflowed by 17 px at 320 and 375.
- A live region announces the picker, reusing the `JobAnnouncer` pattern.
- A missing icon or a missing card benefit **throws at build time**. Both
  surfaces are prerendered, so a new route without either fails `pnpm build`
  rather than shipping a blank card.
- `check:forbidden`, `check:static` and the new `check:landing` all pass.

## 5. Phase 7 — verification

**`e2e/homepage.spec.ts`** — 15 cases × 2 engines. The three the plan named
(handoff works · reload degrades · refusal names the real format), plus: no
`planned` route is linked (every picker href fetched, all 200), the reservation
holds at 320/375/768/1440, CLS is 0 idle *and* after a drop, no ad slot sits
above the dropzone, no horizontal scroll at 320 px, the whole flow completes from
the keyboard with a visible focus ring, the picker is announced, and the page
survives forced-colors.

The mislabelled fixture is built in memory from the first 8 KB of
`screen-720p-10s.mp4` — nothing was committed, and a truncated MP4 is the better
fixture because nothing downstream can accidentally succeed at decoding it.

**`scripts/check-landing-bundle.mjs`** — wired as `pnpm check:landing` and into
CI. Greps the prerendered homepage's own script tags for `"pzgif-pipeline"` (the
worker) and the `capability.ts` object keys, and checks that every importer of
the handoff singleton is a `"use client"` module. **Both rules carry a canary**:
each engine marker is asserted *present* in the compressor's bundle, and the
importer rule fails if it finds nothing importing the handoff at all — so a check
that stops matching fails loudly instead of turning the script into a silent
pass. Both verified to fail: the first by pointing it at the compressor (three
leaks reported), the second by adding the import to `registry.ts`. The first
version of the second rule did **not** have a canary and was a guaranteed pass;
see §5b.

### Test baseline

| | Phase 1 baseline | Now |
|---|---|---|
| passed | 72 | **109** |
| `gif-compressor` › shifts nothing the user did not ask for | **0.015 — red** | **green** |
| chromium `component-states` › 320 px overflow | red, 40 px | red, **40 px — identical** |
| webkit `component-states` › skip link tab order | red | red |
| webkit `component-states` › 320 px overflow | red, 40 px | red, 40 px |
| `component-states` › FAQ answers reachable | flaky (green that run) | flaky (red on webkit in the final run; red on both in an earlier one) |

**Nothing new is red.** The FAQ case is the racing assertion the Phase 1 report
already diagnosed — it reads the panel height while the 150 ms
`grid-template-rows` transition is still running. Re-verified this session: it
fails 2/2 in isolation **with the `/dev/states` changes stashed**, so it is not
caused by this work. It still flaps: it failed on both engines in one full run
and on WebKit only in the final one.

## 5b. Code review, and what it caught

A `code-reviewer` pass was run against the 18 changed files with the acceptance
criteria and six named concerns. **Four of the six concerns were verified
non-issues** (the `stash()` ordering — `Link` calls `onClick` synchronously
before `router.push`; the sniff race guard; the build-time throws — no
`error.tsx` anywhere and `dynamicParams = false`; and the Tailwind band cascade —
compiled through `@tailwindcss/postcss` and confirmed `md:` is emitted last).
Two were real, and the review found four more. All are fixed.

**The worst finding was in my own guard.** `check-landing-bundle.mjs` rule 3
walked `.next/server/app` — 23 files — while the handoff module sits in
`.next/server/chunks/ssr/`. I verified it independently: `takePendingFile`
appears in **5 server chunks the walk never opened**, out of 109. The script
printed *"handoff absent from 23 server bundle(s)"*, which was false, and the
rule could not have failed. I had written a canary for `ENGINE_MARKERS` and not
for `HANDOFF_MARKERS`, and the half without one is the half that broke — in
exactly the way the script's own comment says is worse than having no check.

The premise was also wrong. A `"use client"` module *is* evaluated on the server
during SSR; `pending-file.ts` is legitimately in that bundle. It is safe because
neither entry point is *reachable* there — `setPendingFile` runs from a click
handler and `takePendingFile` from `useEffect`. So rule 3 was replaced with the
invariant that is both true and checkable: **every importer of the handoff is a
`"use client"` module**, with its own canary that fails if the rule finds nothing
to check. Verified to fail by adding the import to `registry.ts`.

| # | Finding | Fix |
|---|---|---|
| 1 | `sniffFile()` had no `.catch()`. A file that moved, was deleted, or is an undownloaded cloud placeholder rejects, and the hero sat on "Reading…" **forever** — a dead end in the component built to prevent them | New `unreadable` state with its own named message |
| 2 | `check:landing` rule 3 checked nothing (above) | Rewritten as an importer check, with a canary |
| 3 | `check:landing` was never wired into `.github/workflows/ci.yml` | Added after `check:heavy` |
| 4 | A ⌘-click on a picker chip arms the handoff and then does **not** navigate. The armed file would be consumed by the next tool page reached in that tab. Harmless today (all live routes GIF-only); a `decode-failed` the moment a cross-format tool ships | Handoff now names its destination: `setPendingFile(file, slug)` / `takePendingFile(slug)`. Three new unit tests |
| 5 | `picker.unsupportedBody` promised "the tool that handles this format is on the list" — **no route, live or planned, accepts a still image or an unknown file**. Reachable by renaming a PNG to `.gif` | Rewritten to promise nothing it cannot support |
| 6 | The "your name says .GIF but the bytes are Video" line rendered only in the `picking` branch — never in `unsupported`, which is the mislabelled-MP4 case the sniffer exists for | Moved outside both branches; e2e now asserts it |
| 7 | `formatDelta` rounds to whole percent, so a 10 MB → 9.97 MB job showed badge `no change` beside "you just cut 30 KB out of it" | Sentence gated on the same 0.5% threshold; new unit test |
| 8 | `t(\`format.${...}\`)` — a dynamic key compiles for any string, so a new `InputFormat` member would render the raw key path | Replaced with `Record<InputFormat, string>`; a new member is now a type error |
| 9 | `announcePicker` read "1 tools" if the live count ever drops to one | ICU plural |
| 10 | A test asserted the summary contains no `transition` — it passed only because it rendered no children, and in production the children are `Button`s that carry transitions | Narrowed to what it meant: the only animation present is `pz-check-pop` |
| 11 | `tool-icons.tsx` comment claimed no two routes share an icon; five Discord routes share one | Comment corrected — the sharing is deliberate |

## 6. Found and not fixed

**`site-header.tsx` overflows by 22 px at 375 px with a 32 px root font** —
WCAG 1.4.4. The wordmark grows with the text and pushes the theme toggle and the
menu button past the viewport edge. It is **shared chrome and affects every
route**: `/gif-compressor` overflows by the identical 22 px. The homepage's own
`#main` is clean, and the test is scoped to `#main` with that reasoning written
into it rather than silently widened.

Likely one-line class fix (let the brand link shrink, pin the controls
`flex-none`), but it is Phase 2 chrome and outside this plan's scope boundary.
Recorded in parent `plan.md` open question 10.

## 7. Documentation

| File | Change |
|---|---|
| Parent `plan.md` | Open question 10 rewritten: CLS item struck with its diagnosis, five failures → four, the header defect added |
| Parent `phase-09-*.md` | Homepage ownership removed, including the rejected file-type-routing bullet and the "reuse the wireframe copy verbatim" step. **Legal, non-tool content, SEO machinery and the footer rule all left intact** |
| `docs/design-guidelines.md` | New §2.3 (the motif and its two rules), new §2.4 (what accent means), §5.9 rewritten. **§6 explicitly unchanged** — nothing this pass needed was missing from it, and that is recorded rather than left as an apparent oversight |
| This plan | All seven phases marked complete |

## 8. Open items

1. **The header text-resize overflow** — operator's call whether it is fixed now
   or folded into parent Phase 11.
2. **`/dev/states` 320 px overflow (40 px)** and the **WebKit skip-link** failure
   remain out of scope by operator decision, unchanged from the Phase 1 baseline.
3. **The FAQ racing assertion** still flaps, and it fails 2/2 when run in
   isolation. It is a test defect, not a product defect, and fixing it means
   waiting on the transition rather than reading through it.
4. **Gate G6 is still unscored.** The third "why" tile therefore describes what
   gifski does and quotes one measured figure; it makes no superiority claim, and
   `home.test.ts` asserts it cannot acquire one.
