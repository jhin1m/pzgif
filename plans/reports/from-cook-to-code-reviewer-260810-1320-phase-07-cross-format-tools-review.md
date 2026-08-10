# Phase 7 (Cross-Format Tools) — pre-landing review

Reviewer: code-reviewer · 2026-08-10 · branch `main`, uncommitted
Scope: 24 modified files + 21 untracked (≈1,700 LOC net). No files modified by this review.

Everything below is static analysis plus targeted spec/API verification. I did not
re-run the suites (they were reported green); nothing I found is caught by them,
which is stated per finding.

---

## Verdict

Four blockers, two of which ship a broken first-run experience on a whole device
class, and one of which burns the user's CPU indefinitely. The binary parser —
the thing flagged as highest risk — is the strongest part of the change and I
cleared it. The defects are all in the React glue and in the two computed
captions.

---

## Blocking

### B1 — `/mp4-to-gif` runs an unbounded estimate loop for as long as a file sits loaded

`src/components/tool/gif-workbench.tsx:391-395`
`src/hooks/use-media-job.ts:276`

```ts
}, [buildSpec, file, flow, job, liveEstimate, probe, values]);
```

`useMediaJob` returns a **fresh object literal** on every render
(`use-media-job.ts:276` — `return { state, progress, run, estimate, probe, cancel, reset };`,
no `useMemo`). So `job` has a new identity on every render and this effect's deps
have *always* changed. That alone would only re-arm the debounce; the loop closes
because the estimate's own completion re-renders:

`use-media-job.ts:221` → `setState(previous => ({ ...previous, estimate: event.estimate }))`
→ new state object → re-render → new `job` → effect cleanup + re-setup → new 500 ms
timer → `job.estimate(...)` → full decode + two sample encodes → repeat.

**Failure scenario:** drop `screen-720p-10s.mp4` on `/mp4-to-gif`, touch nothing.
Every ~(500 ms + estimate duration) the worker decodes the whole selection and runs
two sample encodes, forever, until the tab is closed or Run is pressed. On a phone
that is a hot device and a flat battery; on desktop it is a pegged core behind a
page whose entire pitch is "this runs in your tab".

It is invisible to every existing test: the e2e only asserts that `[data-estimate]`
eventually contains text, which it does — repeatedly.

**Fix:** the effect only needs `job.estimate`, which *is* stable
(`useCallback(..., [controller])`, `controller` is `useCallback(..., [])`):

```ts
const runEstimate = job.estimate;
useEffect(() => {
  if (!liveEstimate || !file || flow !== "loaded") return;
  const timer = setTimeout(() => runEstimate(file, buildSpec(values, probe)), 500);
  return () => clearTimeout(timer);
}, [buildSpec, file, flow, liveEstimate, probe, runEstimate, values]);
```

Memoising `useMediaJob`'s return value as well would stop the same trap being
re-laid by the next effect that depends on `job` (there are three more, at
`gif-workbench.tsx:328`, `:341`, `:351` — all callbacks, so currently only a
churn cost, not a correctness one).

Confidence: **high**.

---

### B2 — On `android-mobile` the first conversion always produces a zero-length trim

`src/app/[locale]/mp4-to-gif/mp4-to-gif-tool.tsx:70-76, 134-137, 264-274`
`src/components/tool/gif-workbench.tsx:282, 306-329`

Two facts combine:

1. `useCapabilities()` returns `null` on the hydration render *by design*
   (`src/hooks/use-capabilities.ts:40`). So on the render where `GifWorkbench`
   calls `useState(defaultValues)` (`gif-workbench.tsx:282`), `profile` is still
   `DESKTOP_DEFAULTS` and the initial `values` are `{width: 480, fps: 15, …}`.
   React never re-initialises `useState` when the prop changes, so on a phone the
   **`MOBILE_DEFAULTS` (320 px / 10 fps) never reach the controls at all** —
   which is the exact mitigation `phase-07.md:39` requires ("Add a mobile default
   profile … so the refusal threshold lands in usable meme-length territory").

2. Worse, `handleFile` gates `valuesForProbe` on
   `untouched(current, defaultValues)` (`gif-workbench.tsx:323-325`). After
   hydration `defaultValues` *is* the mobile pair while `values` is still the
   desktop pair, so `untouched()` returns `false` for the first file no matter
   what the user does. `valuesForProbe` — the only thing that sets
   `trimTo = probe.durationSec` — never runs.

`DEFAULT_VALUES.trimTo` is `0` (`mp4-to-gif-tool.tsx:75`). `numberValue` returns
the stored `0`, not the fallback, so `buildSpec` takes the
`duration > 0 && to < duration` branch and emits `trimSec: { from: 0, to: 0 }`
(`:245-247`). `trimmedSpan` then returns `durationSec: 0`
(`ops/frame-select.ts:36-38`), `decodedFrameCount` admits **1 frame**
(`plan.ts:53`), and `sink.canvases(0, 0)` yields **none** (`endTimestamp` is
exclusive — verified against mediabunny's source JSDoc).

**Failure scenario:** Pixel 7, Chrome, `/mp4-to-gif`, drop a 10 s clip, press
"Make the GIF". Trim readout says `0.0s selected`; the job decodes zero frames and
dies in the encoder. Recovering requires the user to notice and drag the end
handle, or hit "Choose different" (which calls `startOver` → `setValues(defaultValues)`
→ the second file then works).

The desktop e2e never sees this because `defaultValues` is referentially stable
there (the `useMemo` deps are primitives that don't change).

**Fix (both halves needed):**
- Derive the tier-dependent defaults without going through `useState` init — e.g.
  fold the profile into `valuesForProbe`, or key `GifWorkbench` on the tier, or
  let `GifWorkbench` re-seed `values` when `defaultValues` changes while untouched.
- Independently, make `buildSpec` refuse to emit a degenerate span:
  `...(to > from && (from > 0 || to < duration) ? { trimSec: { from, to } } : {})`.

Confidence: **high** for the mechanism; **high** that the observable result is a
zero-frame job.

---

### B3 — The same zero-trim bug is reachable on desktop by touching a control before the probe lands

Same code path as B2, different trigger. `handleFile` starts the probe
asynchronously; on a large `.mov`/`.mp4` the metadata read is not instant. Any
control change in that window makes `untouched()` false, `valuesForProbe` is
skipped, `trimTo` stays `0`, and the run produces `trimSec {0, 0}`.

The `untouched()` guard's own doc comment (`gif-workbench.tsx:317-322`) says it
exists so a *typed value* is not reverted — that reasoning is sound for crop/resize,
where the un-updated default is merely suboptimal. For trim the un-updated default
is a **poison value** that silently truncates the job to nothing. The guard needs
a per-value carve-out, or `trimTo` needs a sentinel that means "whole clip"
(`Infinity`, or absent).

Confidence: **high** on the code path; **medium** on how often a real user hits the
race (it needs a slow probe).

---

### B4 — `/split-gif-to-frames`'s cap caption contradicts admission control

`src/app/[locale]/split-gif-to-frames/split-gif-to-frames-tool.tsx:147-173`
`src/content/split-gif-to-frames.json` → `notes.cap` / `notes.overCap`

The caption uses **only** `budget.hardMaxFrames`. Admission control uses
`min(hardMaxFrames, budgetBytes / frameBufferBytes)`
(`limits.ts:193-197`, and `frameBufferBytes` already carries gifski's 2×).

Desktop tier: `hardMaxFrames = 900`, `budgetBytes = 500 MB`. A 480×270 GIF costs
`2 × 480 × 270 × 4 = 1,036,800` bytes per frame → the real ceiling is **505 frames**,
not 900. At 640×360 it is **284**.

**Failure scenario:** a 600-frame 480×270 GIF on a desktop. The caption reads
*"This device can hold about 900 frames at once … Your selection of 600 is within
that."* `planEncode` then refuses or silently downgrades the width. That is exactly
the failure `mp4-to-gif`'s own header comment says the computed caption exists to
prevent — "the caption and the refusal can never disagree"
(`mp4-to-gif-tool.tsx:35-41`). `mp4-to-gif` gets this right via
`deviceLimitSeconds` (`:86-97`); `split-gif-to-frames` does not have the equivalent.

**Fix:** compute the cap the same way —
`Math.min(budget.hardMaxFrames, Math.floor(budget.budgetBytes / frameBufferBytes(1, w, h)))`
using the probe's dimensions (falling back to `defaultMaxWidth` before the probe).

Confidence: **high** (arithmetic, verified against `planEncode`).

---

## High

### H1 — A refused estimate leaves a permanent error banner, and shifts the layout

`src/hooks/use-media-job.ts:223-226` · `src/components/tool/gif-workbench.tsx:413-414`

`estimate`'s callback sets `state.error` on refusal and **never clears it** on a
subsequent successful estimate. `showError` is true whenever
`error !== null && flow === "loaded"`.

**Failure scenario:** on `/mp4-to-gif`, drag width to the top → 500 ms later the
estimate is refused (over budget) → `JobError` appears between the intake box and
the result panel. Drag width back to 320 → the estimate now succeeds and updates
`[data-estimate]`, but the refusal banner is still on screen, offering degraded-run
buttons for a plan the user has already abandoned. It persists until Run or a file
change.

Secondary: the banner's appearance is an un-prompted block insertion arriving
seconds after the last interaction — real CLS.

**Fix:** `setState(previous => ({ ...previous, estimate: event.estimate, error: null }))`
in the success branch, and consider routing estimate refusals to a quiet inline
line rather than the full recovery UI.

Confidence: **high**.

### H2 — `[data-estimate]` reserves one line for a five-line sentence — un-prompted CLS on `/mp4-to-gif`

`src/app/[locale]/mp4-to-gif/mp4-to-gif-tool.tsx:306-316`

```tsx
<p className="tabular min-h-[1.45em] text-caption text-fg-muted" data-estimate>
```

The comment says the line is "always rendered, empty until the first estimate
lands" so it cannot push the primary down. But the string it renders is:

> "Estimated result: 1.2 MB to 2.1 MB. A prediction from two sample encodes, not a
> promise — the real number appears the moment the file exists."

At the settings column's width that is four to six lines at every breakpoint. One
`em` of reservation buys nothing. The growth arrives after a decode plus two sample
encodes — far outside the 500 ms `hadRecentInput` window — so it scores as
un-prompted CLS, and on mobile the settings panel sits above the footer/ad, so
everything below moves.

No test covers it: the only `layout-shift` observer in the suite is on
`/gif-compressor` at 1440 (`e2e/gif-compressor.spec.ts:210-246`), and
`result-panel-reservation.spec.ts` measures the *result panel*, not the settings
panel.

**Fix:** reserve the real height (measure it, as `result-panel.tsx` does for its
bands), or split the sentence so the volatile part is one line and the
"not a promise" caveat is always rendered.

Confidence: **high**.

---

## Medium

### M1 — `probeWebp` allocates ~1× the compressed file *before* admission control runs, and the file is parsed twice

`src/lib/media/decode/webp.ts:31-35, 45` · `src/lib/media/decode/webp-riff.ts:183-210`

The probe's comment claims "No decode at all … both of which are header reads".
That understates it: `parseAnimatedWebp` eagerly calls `rebuildFrame` for every
ANMF, and `concat()` **copies** each frame's payload into a new `Uint8Array`. So
probing allocates the source `ArrayBuffer` plus roughly its own size again in
rebuilt containers — and then throws all of it away, because `webpFrameSource`
(`webp.ts:74`) reads and parses the file a second time.

There is no input file-size gate anywhere in the codebase (I grepped), so on the
iOS tier a 40 MB animated WebP allocates ~80 MB transient before the 30 MB budget
has been consulted.

**Fix:** give `parseAnimatedWebp` a `{ rebuild: false }` mode for the probe path,
and thread the already-parsed animation from probe to source rather than reparsing.

Confidence: **high** on the allocation; **medium** on whether it matters in practice
(animated WebP is the smallest input in the set).

### M2 — Bounding `canvases()` in the untrimmed path can drop the final frame

`src/lib/media/decode/video.ts:118-119, 172-175`

Previously `sink.canvases()` (defaults `0`/`Infinity`). Now always
`sink.canvases(span.fromSec, span.fromSec + durationSec)`, and with no trim that
is `(0, computeDuration())`. `endTimestamp` is **exclusive** (verified against
mediabunny's `samples()`/`canvases()` JSDoc). For any container whose declared
duration equals its last frame's presentation timestamp — a track whose final
sample has no duration — the last frame is now silently discarded, and for a
single-frame video `canvases(0, 0)` yields nothing.

This is a change to the default path of a shipped behaviour, which the brief asked
me to look for specifically.

**Fix:** pass the bounds only when a trim exists:
`sink.canvases(...(timing.trimSec ? [span.fromSec, span.fromSec + durationSec] : []))`.

Confidence: **medium** (the failure needs a container with a zero-duration final
sample; common enough in the wild for screen recorders).

### M3 — The rationale comment on the trim clock is factually wrong

`src/lib/media/decode/video.ts:150-153`

> "`canvases()` may hand back frames from before `fromSec` — it seeks to the
> keyframe preceding it — and a clock left at zero would accept those…"

mediabunny decodes from the preceding keyframe internally but yields only samples
in `[start, end)`. The `nextSampleSec = span.fromSec` initialisation is harmless
and arguably still correct-by-construction, but a maintainer reading this comment
will believe the iterator has a behaviour it does not, and may "fix" the wrong
thing. Correct the comment.

Confidence: **high** (verified against upstream JSDoc).

### M4 — Two shipped captions present unmeasured tier budgets as device facts

`src/lib/media/limits.ts:27-32, 51-80`

Every entry in `TIER_BUDGETS` still carries `measured: false`, and the file states
the rule plainly:

> "Anything still carrying `measured: false` when a limit is shown to a user is a
> number we made up, and the copy must not present it as a device fact."

Phase 7 ships two such captions:
- `mp4-to-gif` → *"this device can hold about {seconds} seconds of GIF at once"*
- `split-gif-to-frames` → *"This device can hold about {cap} frames at once"*

The word "about" hedges the precision, not the provenance. Either land G3/G4, or
soften to a limit-of-this-tool phrasing that does not assert a measurement of the
user's hardware. This is the same class of defect as the wireframe's unbacked
speed claims that CLAUDE.md tells us not to reuse.

Confidence: **high** on the rule; the call on whether it blocks is the lead's.

### M5 — `notes` prose is exempt from the anti-template copy test

`src/lib/tools/content.ts:122-134` · `src/lib/tools/tool-copy.test.ts`

The `notes` doc comment says explicitly that anything without a runtime figure
"belongs in `explainer`, `controls` or `result`, where the copy tests can see it".
But `notes` now carries substantial hand-written prose with no token in it at all:
`unavailableTitle`, `unavailableBody`, `embedLabel`, `embedCaption`,
`embedFileName`. Those are exactly the strings the vocabulary-overlap assertions
exist to police, and they are now outside the net.

**Fix:** either extend `tool-copy.test.ts` to include `notes` values, or assert
that every `notes` value contains at least one `{token}` (which would force the
token-free ones back into the covered sections).

Confidence: **high**.

### M6 — WebP compositing is untested where it is hard

`src/lib/media/decode/webp.ts:104-153` · `e2e/cross-format-tools.spec.ts`

The unit tests prove the *parser*; the e2e proves frame count and total duration.
Neither exercises the compositing loop's hard cases, because the fixture
(`anim.webp`, testsrc2, 48 full-canvas frames) has `x = y = 0`, `blend = over`,
`dispose = none` on every frame. Sub-rectangle offsets, `blend: "replace"`
(clear-then-draw), `dispose: "background"`, and the "skipped frames are still
composited" invariant are all dead code paths under test.

A wrong offset or an inverted flag here produces a *plausible* animation, which is
precisely the failure mode the file's own header warns about.

**Fix:** add a second fixture built with `img2webp` from offset sub-frames with
disposal, and assert decoded pixel values at known coordinates (`decode-output.ts`
already walks GIF blocks, so the output side is available).

Confidence: **high** on the coverage gap.

---

## Low

- **L1** `limits.ts:113-115` — `(touchPoints > 0 || /Mobile/.test(ua)) && /Android|Mobile/.test(ua)`.
  The first disjunct is subsumed by the second whenever `/Mobile/` matches; the
  expression reduces to `/Mobile/.test(ua) || (touchPoints > 0 && /Android/.test(ua))`.
  No behaviour bug, but the redundancy will mislead the next editor.
- **L2** `gif-to-mp4-tool.tsx:168-188` — `notice` returns `null` before the probe,
  so the dimensions line appears late; `mp4-to-gif` always renders its lines.
  Inconsistent, and a small late shift in the settings column.
- **L3** `webp-riff.ts:212-217` — `toDelayMs` clamps anything `< 20 ms` to 100 ms.
  Chrome's WebP rule is `<= 10 ms → 100 ms`, so a genuine 15 ms-per-frame WebP is
  converted 6.7× slower than it plays. Consistent with the GIF decoder, so possibly
  deliberate — worth one line of justification either way.
- **L4** `tool-picker.tsx:61` — setting only `overflow-y` makes the computed
  `overflow-x` become `auto` per CSS spec, so a focus ring on an edge chip can be
  clipped. Also, the scroll affordance is purely the partly-visible chip; consider
  a fade or a count.
- **L5** `result-panel.tsx:73` — the `min-[400px]` band went 680 → 704 px. Correct
  for `mp4-to-gif`, but it now reserves ~30 px of dead space at 400-479 px for
  crop/reverse (measured 674). Accepted trade-off per the file's own reasoning;
  noting it so the number is not mistaken for a measurement of those tools.
- **L6** `webp.ts:150-152` — "dispose to background" clears to transparent rather
  than to the ANIM background colour the spec names. This matches libwebp's
  `WebPAnimDecoder` in RGBA mode and Chrome, so it is the right call; the ANIM
  background bytes are parsed and discarded without comment. One sentence would
  close it.
- **L7** `webp-riff.ts:198-206` — a malformed file carrying both `ALPH` and `VP8L`
  in one ANMF would be rebuilt as `VP8X + ALPH + VP8L`, which is spec-invalid.
  Cosmetic; the browser will reject or ignore.

---

## Verified and cleared

**`decode/webp-riff.ts` — the binary parser. Checked field by field against
developers.google.com/speed/webp/docs/riff_container. No defects found.**

- VP8X flags byte: animation = bit 1 = `0x02` ✓ (`:244`); alpha = bit 4 = `0x10` ✓
  (`:147`); reserved bits left zero ✓.
- VP8X canvas size: 24-bit LE *minus one* at payload `+4` / `+7` ✓ (`:245-246`),
  and the rebuilt container writes it back the same way ✓ (`:150-155`).
- ANIM: loop count is 16-bit LE at payload `+4`, after the 32-bit background
  colour ✓ (`:252`); `size < 6` guarded ✓.
- ANMF: X at `+0` and Y at `+3` as 24-bit LE **halved** (multiplied back) ✓
  (`:262-263`); width/height at `+6`/`+9` as 24-bit LE minus one ✓ (`:264-265`);
  duration 24-bit LE at `+12` ✓ (`:266`); flags at `+15` with bit 1 = "do not
  blend" → `replace` ✓ and bit 0 = "dispose to background" ✓ (`:282-285`).
- RIFF odd-size padding: handled once in `chunks()` (`:114`) for both the
  top-level and the ANMF-inner walk, and re-emitted in `rebuildFrame` after both
  the ALPH and the image payload ✓ (`:202`, `:206`). Rebuilt `RIFF` size field is
  `body + 4` and the body is always even ✓.
- Extended-container rebuild for `ALPH + VP8 `: VP8X first with the alpha flag,
  then ALPH, then VP8 — correct order, and the VP8X canvas is the *frame's* size,
  not the animation's ✓.
- Truncation/hostile input: `declared` bounded by `Math.min(data.length, …)` ✓;
  `start + size > to` bails ✓; `!animated || frames.length === 0` returns `null`
  rather than a half-parse ✓.

**Regression sweep on the four shipped GIF→GIF tools and the compressor — clean.**

- `output` defaults to `gifOutput` returning the module-level `GIF_OUTPUT`, so
  `produced.extension === ".gif"` and `produced.format === "gif"` — byte-identical
  to the previous literals (`gif-workbench.tsx:143-144, 431, 653`).
- `resultMedia` / `unavailable` undefined → `?.()`/`??` fall through to exactly the
  previous `<img>` and `<Dropzone>` ✓.
- `idleReason` undefined → `?? content.actions.disabledReason` in both places ✓.
- `liveEstimate` defaults `false` → the effect returns before doing anything ✓
  (this is what confines B1/H1/H2 to `/mp4-to-gif`).
- `context.estimate` is stably `null` on pages that never call `estimate`, so the
  new `useMemo` dep does not add renders ✓.
- `plan.ts` `decodedFrameCount(probe, spec, fps)` returns `probe.frameCount` before
  reading `spec` for GIF and WebP, so only the video path changes ✓.
- `plan.ts` `capabilityRefusal`'s new WebP branch is gated on `probe.format === "webp"`
  ✓; the GIF/video branches are untouched.
- `ops/frame-select.ts` adds `trimmedSpan` and changes nothing existing ✓.
- `decode/gif.ts` untouched ✓.

**The three overriding rules.**

- No `SharedArrayBuffer`, `COOP`, `COEP` or `crossOriginIsolated` introduced —
  the only hit is the pre-existing allow-listed comment in `encode/gifski.ts:5` ✓.
- No invented progress. The only new timers are the estimate debounce and the
  embed-snippet's copy confirmation; the elapsed readout is still a real wall clock
  shown *instead of* a bar ✓.
- Prose: the four content files are genuinely distinct, no shared paragraphs, and
  the `mp4-to-gif` FAQ no longer carries the "under ten seconds" claim
  `phase-07.md:95` required to be cut ✓. The rotation claim in the explainer is
  backed — `decode/video.ts:66, 137-139` reads and honours container rotation ✓.
  (See M4/M5 for the two prose holes that remain.)

**Other checks.**

- `TrimRange` `aria-valuemin`/`aria-valuemax` track the *other* handle and agree
  exactly with `set()`'s clamps (`trim-range.tsx:106-107` vs `:193-194`) ✓.
  `Home`/`End` are handle-relative and land precisely on the announced bounds ✓.
  `preventDefault` only on handled keys, so Tab is not trapped ✓.
- Frame-range 1-based↔0-based conversion: picker inclusive `[3,10]` →
  `range {from: 2, to: 10}` half-open → 8 frames; done in one place ✓
  (`split-gif-to-frames-tool.tsx:131`), and the e2e asserts the archive entry count.
- `FrameRangePicker`'s `total = totalFrames ?? value.to` fallback is unreachable —
  the control is `disabled` while `totalFrames === null` ✓.
- `ToolUnavailable` uses `min-h-0 flex-1` inside the same `h-60 md:h-72 lg:h-84`
  box as `Dropzone`, so the post-hydration swap is same-height ✓. `resultMedia`
  render props all use `size-full` ✓.
- `MediaError`'s dropped `no-image-decoder` reason: no live references remain
  (only the explanatory comment at `errors.ts:221`); the message key is gone from
  `messages/en.json` and the sample is gone from `errors.test.ts` ✓.
- `WorkbenchOutput`/`output` call sites: three (`gif-to-mp4` `outputFor`,
  `split-gif-to-frames` `zipOutput`, default `gifOutput`) — all accounted for ✓.
  `chainTargets` handles `zip` (matches nothing → no chips) and `webm`
  (`mp4-to-gif` accepts it) ✓.
- `ImageBitmap` lifetime in `webp.ts`: closed in a `finally` on every path,
  including the skipped-but-composited frames ✓. No `VideoFrame` reaches the main
  thread.
- Trust boundary: nothing new crosses one. All input is user-selected, processed
  in-tab, no network, no auth surface, no PII path. Nothing to report.
- `check:forbidden` / `check:static` surface: all four new routes call
  `setRequestLocale`, read no cookies/headers, and import `Link` from
  `@/i18n/navigation` ✓.

---

## Recommended order

1. B1 (one-line dep fix, biggest user-visible harm)
2. B2 + B3 (same root; fix `trimTo` sentinel *and* the mobile-defaults seeding)
3. B4 (caption must use the byte budget)
4. H1, H2
5. M2, M3 (small, and both are in the video decode path)
6. M1, M4, M5, M6
7. Low items at leisure

## Unresolved questions

1. **M4** — is showing `measured: false` budgets as "this device can hold…" an
   accepted risk for Phase 7, or does it block until G3/G4 land? `limits.ts` states
   it as a hard rule; I am not going to reverse a stated rule on my own judgement.
2. **M2** — is there a fixture in `e2e/fixtures/` whose final sample has no
   duration? If not, the safest move is the `undefined` bounds rather than trying
   to prove the negative.
3. `mp4-to-gif`'s `deviceLimitSeconds` omits the `& ~1` even-height rounding that
   `planEncode` applies (`limits.ts:189-192`). The delta is at most one pixel row,
   so the caption can be one frame optimistic at the boundary. Worth aligning, or
   worth ignoring — your call.

---
---

# Re-verification pass — 2026-08-10 13:38

Scope: only the fixes. I did not re-review anything else.

## Cleared

| Was | Verdict |
|---|---|
| **B1** estimate loop | **Fixed.** `runEstimate = job.estimate` is hoisted and the effect depends on it. `estimate` is `useCallback(…, [controller])` and `controller` is `useCallback(…, [])` — genuinely stable. The remaining deps are all stable or intentionally volatile: `buildSpec` is `useCallback(…, [profile.fps, profile.width])` over two module constants, `liveEstimate` is a literal, `flow` is a string, and `file`/`probe`/`values` are the state changes that are *supposed* to re-arm the debounce. `TrimRange`'s double `setValue` batches into one render under React 19. |
| **B2/B3** zero-length trim | **Fixed, and I could not construct a path back to it.** `trimOf` resolves `stored <= 0` to the clip duration and returns `to: Math.max(from, to)`, so `to >= from` unconditionally. `buildSpec` then emits `trimSec` only when `from > 0 \|\| to < duration`, and `duration === 0` (no probe / null duration) suppresses it entirely. `to === from` would need `stored > 0 && stored <= from`, which `TrimRange.set()`'s `MIN_SPAN_SEC` clamp prevents on both handles, on both the drag and the numeric-commit path; `applySetting` and the degraded-run spread in `gif-workbench.tsx` touch neither key. |
| **B2** mobile profile | **Fixed.** `DEFAULT_VALUES` is a module constant again, so `useState(DEFAULT_VALUES)` and the `untouched()` comparand are the same object at mount on every tier, and `valuesForProbe` — which now carries the profile — runs after the probe on Android as intended. `width: Math.min(profile.width, probe.width)` is identical to the old expression on desktop, because `current.width` can only be `DESKTOP_DEFAULTS.width` at the point it runs. |
| **B4** split cap | **Fixed and it matches `admit()`.** `affordableFrames` = `min(floor(budgetBytes / frameBufferBytes(1,w,h)), hardMaxFrames)`, which is exactly the pair of gates `admit()` applies at its first ladder rung (`plan.ts:222-232` and `:234-236`). The split page's `width = min(probe.width, defaultMaxWidth)` matches `buildPlan`'s `FrameGeometry(…, { maxWidth: budget.defaultMaxWidth })`, and its height formula matches `FrameGeometry`'s (`{even: false}` for `png-zip` and for `gif`, so no `& ~1` divergence). `overCap` being pessimistic about the narrower ladder rungs is covered by the copy ("run it and take the alternative you are offered"). |
| **H1** stale error | **Fixed, and the race I went looking for does not exist.** `error: null` on success is confined to `flow === "loaded"`, and the ordering concern — a late `estimate` event wiping a fresh *job* refusal — cannot happen: `cancel()` does not delete the handler (`job-controller.ts:206-220`), but both events travel the same worker port, and an estimate message can only have been posted *before* the run that follows it, so `postMessage` ordering preserves the sequence. A cancelled estimate returns early on `code === "cancelled"`. |
| **H2** estimate CLS | **Fixed.** `notes.estimate` is now `"Estimated result: {low} to {high}."` — 36 characters at the widest `formatBytes` output (3 significant digits + unit, `format-bytes.ts:20-34`), which cannot reach two lines at 320px, let alone exceed the reserved `min-h-[2.9em]`. The long caveat is a separate always-rendered node. `e2e/cross-format-tools.spec.ts:173-191` now measures the slot before and after the figure lands, which is a real regression guard. |
| **M2** `canvases()` bound | **Fixed.** The untrimmed path calls `sink.canvases()` with no arguments, exactly as before. |
| **M4** device-fact copy | **Fixed.** Both captions now read "the engine plans for about N…", and the e2e asserts the new wording with the reason attached. |
| **M5** `notes` copy coverage | **Fixed.** `tool-copy.test.ts:75-81` folds `Object.values(page.notes ?? {})` into the shared-paragraph check. |

## Still wrong / newly wrong

### N1 (new, medium-low) — `rebuild: false` and `rebuild: true` disagree on frame count for a malformed ANMF

`src/lib/media/decode/webp-riff.ts:296-305`

```ts
const bytes = rebuild ? rebuildFrame(...) : null;
if (rebuild && !bytes) break;   // ← only guards the rebuild pass

frameCount += 1;
durationMs += duration;
if (!bytes) break;
```

The payload check is now gated on `rebuild`. An ANMF chunk carrying neither `VP8 ` nor `VP8L` is therefore **skipped** by the full parse but **counted** by the probe.

Failure scenario: a truncated or hand-concatenated animated WebP with 48 ANMF chunks of which one has no image payload. `probeWebp` reports `frameCount: 48` and a duration including that frame; `webpFrameSource` builds `frames.length === 47` and emits 47. The badge says "48 frames", the GIF has 47, `plan.ts:52` budgets 48, and `plan.frames`/`stats.frames` disagree with the file. Nothing crashes — the over-budget direction is the safe one — but this is exactly the probe/decode agreement the new test was added to protect, and the test's fixture has a payload in every frame, so it does not see it.

Fix: hoist the check out of the `rebuild` branch —

```ts
const inner = [...chunks(data, at + 16, chunk.start + chunk.size)];
const hasImage = inner.some((c) => c.id === "VP8 " || c.id === "VP8L");
if (!hasImage) break;
frameCount += 1;
durationMs += duration;
if (!rebuild) break;
const bytes = rebuildFrame(data, inner, frameWidth, frameHeight);
if (!bytes) break;   // unreachable, but keeps the null off the type
```

Confidence: **high** on the divergence; **low** on how often a malformed file arrives.

### N2 (still wrong, low) — the corrected keyframe comment is still asserting something the API does not document

`src/lib/media/decode/video.ts:150-153`

> "A seek lands on the keyframe at or before `fromSec`, so the first canvases handed back can predate the requested start…"

mediabunny's JSDoc says only that `startTimestamp` is "the timestamp at which to start yielding samples (**inclusive**)". Whether the first yielded sample can have `timestamp < startTimestamp` (the "frame displayed at" reading) or cannot (the "timestamp >= start" reading) is not stated, and I could not confirm it from the docs. The code is correct under **both** readings — the guard is either load-bearing or a no-op — so nothing needs to change behaviourally, but the comment states as fact something that is currently a guess. Either verify against the mediabunny source and keep it, or hedge it to "may".

### N3 (informational) — the new CLS guard runs at one viewport

`e2e/cross-format-tools.spec.ts` sets 1440×900 in `beforeEach`, so the `[data-estimate]` height assertion only covers desktop. The reasoning that the short line cannot wrap past two lines holds at 320px by character count, so this is a coverage note, not a defect.

## On the deferred item

**M6 (WebP compositing fixture) — I accept the deferral, with one condition.** The parser's flag and offset decoding is unit-tested against synthesised containers, which is the half most likely to be wrong, and authoring an offset/disposed fixture does need `webpmux`/`img2webp`. But the untested half is not nothing: `blend: "replace"` (clear-then-draw), `dispose: "background"`, non-zero `x`/`y`, and the "skipped frames are still composited" invariant in `webp.ts:104-153` are all reachable from real files produced by every WebP animation encoder, and a defect there ships a plausible-looking wrong animation rather than an error. Please carry it as an explicit, named item on the Phase 11 or post-launch list rather than letting it lapse — it is the one place in Phase 7 where a wrong output does not announce itself.
