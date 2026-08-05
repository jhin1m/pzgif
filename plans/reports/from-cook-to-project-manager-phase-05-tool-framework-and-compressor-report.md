# Phase 5 — Tool framework and GIF compressor

**Status: complete. The blocker was found, fixed and verified.**
Date: 2026-08-05

---

## Verdict in one line

The framework, the page and the content ship and pass every gate, and the
compressor produces a real file: **4.1 MB → 705 KB (−83%)**, valid `GIF89a`, all
48 frames, original 480×270, original 2,400 ms timing — verified by decoding the
downloaded bytes in a real browser with the service worker active.

---

## The blocker, and its root cause

**One line: the service worker was caching Turbopack's worker bootstrap, and
Turbopack identifies each worker only by that URL's fragment.**

Turbopack ships a single shared bootstrap file and passes each worker its chunk
list in the URL fragment — `turbopack-worker-<hash>.js#params=[[…]]`. The Cache
API keys on the **fragment-stripped** URL, so every worker in the app collapses
onto one cache entry. The pipeline worker is requested first, misses, and fills
that entry from the network. The encode worker is requested seconds later, hits
it, and receives a response whose URL carries no fragment. It boots with an empty
chunk list, registers no message handler, and then does nothing — no error, no
message, no rejection. The job stalls until the hang watchdog fires ~20 s later
and reports `encode-failed`.

**The fix** (`public/sw.js`): worker scripts bypass the service worker entirely,
keyed on `request.destination === "worker" | "sharedworker"` — the
standards-defined answer, so it needs no path matching and cannot drift with
hash names. The cache name is bumped to `pzgif-shell-v2` so visitors already
carrying a poisoned entry evict it on activate. The chunks the bootstrap then
imports are ordinary fragment-free `/_next/static/` URLs, so they stay
cache-first; offline was re-checked and still works, because the bootstrap is
served from the browser's own immutable HTTP cache.

`src/lib/service-worker-policy.test.ts` locks the rule, along with the
navigation-fallback scope and the never-cache-a-tracker list.

### Why it hid for two phases

It only bites the **second** worker onwards, only once a service worker is
active, and it fails **silently** in a build. Gate G5 proved the *pipeline*
worker boots — that one always works, because it is the request that fills the
cache. `/__bench` renders its own document and never registers a service worker,
so every Phase 1 and Phase 4 measurement ran on the healthy path. Phase 4 was
recorded "browser suite unrun", and this is the first time the engine has been
driven from a product page.

**Severity, stated plainly:** shipped as it was, the entire media engine would
have been dead for every repeat visitor of every tool, with no error in any log.

---

## How it was isolated

The measurements below are what narrowed it down, and they are kept because the
same technique will be needed again.

### The measurement that split the problem in two

One production build (`PZGIF_ENABLE_BENCH=1 pnpm build`, so both routes exist in
the same bundle), one Chrome session, one fixture (`loop-small.gif`, 4.1 MB,
480×270, 48 frames), identical settings (gifski, quality 80, 256 colours):

| Caller | Result |
|---|---|
| `/__bench` → `JobController.run()` | **done in 6,715 ms** — 4.1 MB → 705,027 bytes, 48 frames, encoder `gifski`, `encoderFellBack: false` |
| `/gif-compressor` → `useMediaJob` → the same `JobController.run()` | **watchdog hang, twice, then `encode-failed`** |

### Where it stalls, to the millisecond

Instrumented `Worker.postMessage` / `message` on the product page:

```
   15  new Worker  pzgif-pipeline
   15  tx  pipeline  configure
   15  tx  pipeline  probe
  112  rx  pipeline  probed              ← probe fine
 2594  click Compress
 2594  tx  pipeline  run
 2608  rx  pipeline  accepted            ← admission control fine
 2616  rx  pipeline  progress decode 0/48
 4566  rx  pipeline  progress decode 48/48 ← decode fine, ~1.95 s
 4568  rx  pipeline  progress encode 0/null
 4570  rx  pipeline  need-encoder
 4572  new Worker  pzgif-encode-2
 4572  tx  encode-2  port
 4572  tx  pipeline  encoder-port
24594  tx  pipeline  encoder-failed hang  ← exactly 20,000 ms of silence
24600  rx  pipeline  release-encoder
        … full re-decode, fallback to gifenc …
26538  tx  pipeline  encoder-port
46595  tx  pipeline  encoder-failed hang  ← another exact 20,000 ms
46599  rx  pipeline  error  encode-failed
```

Probe, admission control, decode and the progress protocol all work. **Nothing
comes back from the encode worker — ever.** Not a byte, not an error.

### What was excluded on the way

Each of these was tested and ruled out before the real cause was found:

- **Not the encoder.** `gifenc` is plain JavaScript and calls `onFrame` after the
  first frame, in milliseconds. Selecting Colours 128 pins `gifenc` for the first
  attempt; it produced **zero** progress events in 59 s.
- **Not job size.** 24 frames at 240×135 (≈8× cheaper) stalls identically.
- **Not the watchdog being too tight.** Neutralising it (`setTimeout` delays
  ×30) let the job sit in the encode stage for **173 s** without finishing.
- **Not the worker failing to load.** No `error` or `messageerror` event on the
  encode worker, and every chunk in its `#params` list serves HTTP 200.
- **Not build shape.** Reproduced inside the very build where `/__bench` works.
- **Not the live estimate.** Suspected first — an estimate is a second full job
  in a non-reentrant worker — and removed. Behaviour unchanged.
- **Not the animated `<img>` preview.** Removed before the run; unchanged.
- **Not the module graph.** Converting `encode.worker.ts` to dynamic imports so
  it pulled neither mediabunny nor fflate nor gifski at module scope changed
  nothing. Reverted; the file is untouched in the final diff.

What finally located it was routing diagnostics through `postMessage` rather
than `console.log` — worker console output is not captured by the tooling here.
That showed the pipeline worker posting `encoder-port`, resolving its await, and
posting the 48-buffer / 24.9 MB encode call successfully — while the encode
worker emitted **nothing at all**, not even a "module evaluated" ping. A worker
that is constructed, throws no error, and never evaluates points at what served
its script, and unregistering the service worker made the same job complete in
2.0 s.

---

## What was delivered

### The framework

| File | What it owns |
|---|---|
| `components/tool/tool-page.tsx` | The frame: heading pair, grid, action bar, anchor slot. Client, so `BottomBarProvider` can wrap the content below the fold; the prose stays server-rendered `children` |
| `components/tool/tool-shell.tsx` | 1 → 2 → 3 column grid. The 300×600 rail is a declared column at ≥1280 whether or not it fills |
| `components/tool/job-state.tsx` | `toolFlowState()` — five view states from `(hasFile, JobStatus)`. Unit-tested |
| `components/tool/settings/control-schema.ts` | Declarative controls with a `kind: "custom"` escape hatch, present from the start for Phase 6's crop and Phase 7's trim |
| `components/tool/settings/settings-form.tsx` | Renders the schema with the Phase 3 primitives. Disabled, never hidden |
| `components/tool/job-announcer.tsx` | §7.5 live region, quantised to quarters. **No state, no effect** — a pure function of the progress event, so a 10 Hz stream does not re-render it |
| `components/tool/job-error.tsx` | The only place a user-facing failure string is written. Renders every recovery action the taxonomy attaches |
| `lib/format-bytes.ts` | Decimal units, so a byte count agrees with Finder. `+4% larger` when a re-encode grows the file |

### The content layer

Phase 3 shipped none of `faq-accordion`, `related-tools`, `seo-section` or the
JSON-LD, and Phase 9 has not started, so **Phase 5 created them**. Phase 9 must
consume these rather than build a second set:

- `components/content/tool-explainer.tsx` — places the in-content ad by counting
  words to the §8.1 "~150 words" boundary, never inside a paragraph run
- `components/content/faq-section.tsx` — **no `FAQPage` JSON-LD**
- `components/content/related-tools.tsx` — filters on the new registry `status`
- `components/content/tool-json-ld.tsx` — `BreadcrumbList` + `WebApplication`
- `components/content/inline-copy.tsx` — `**bold**` only, no MDX, no `innerHTML`
- `lib/tools/content.ts` — the shape; `src/content/gif-compressor.json` — the prose

### Registry: a `status` field

`registry.ts` gained `status?: "live" | "planned"`, defaulting to planned, plus
`isLive()`, `liveRoutes()` and `relatedLiveRoutes()`. The sitemap and the
related-tools block now emit only built routes. Without it, Ship 1 would have
advertised 13 unbuilt URLs to the first crawl of a new domain.

### E2E output decoding — built, as the plan required

`e2e/lib/decode-output.ts` is a hand-written GIF89a walker returning width,
height, frame count, per-frame delays, duration and the Netscape loop flag. It
shares no code with `modern-gif`, so it cannot pass on a file both agree is
wrong. Verified against all five GIF fixtures. `e2e/gif-compressor.spec.ts` uses
it to assert the downloaded bytes, per Phase 5 step 12.

---

## Deviations from the phase file, and why

| Phase 5 says | Shipped | Why |
|---|---|---|
| Settings: Quality, Colors, **Lossy**, Width, drop-frames | Lossy **cut** | `gifski-wasm@2.2.0` exposes `quality` and nothing else; `gifenc` has no equivalent. There is no lever behind that slider. A control that moves and changes nothing is the same class of dishonesty as a fake progress bar |
| Colors 256/128/64/32 | Ships, and **pins the encoder** below 256 | gifski always writes a 256-entry palette. Only `gifenc` can honour a cap, so asking for one selects it — and Quality, which is gifski's dial alone, goes inert with a stated reason instead of pretending |
| "Also save as WebP / MP4" row | **Cut** | `GIF → WebP` is out of scope per `CLAUDE.md`; MP4 output is `gif-to-mp4`, Phase 7 / Ship 4. The row promised two encoders that do not exist |
| `content/gif-compressor.mdx` | `.json` | MDX would let prose import components, which dissolves the `LICENSE-CONTENT` boundary into a judgement call, and adds a compiler for the sake of `<b>` |
| Live size estimate (step 5) | **Not wired** | See the blocking finding — an estimate is a second full job in a single non-reentrant worker. Its valuable consumer is Phase 8's auto-fit search, which runs alone |
| Consume `faq-accordion` etc. from Phase 3/9 | **Created here** | They did not exist. Recorded above so Phase 9 does not build a second set |

### Open questions from the phase file, now answered

1. **Does "Also save as WebP / MP4" pre-encode?** Moot — the row is cut.
2. **Does Re-compress reuse decoded frames?** **No — it decodes again.** The
   pipeline *transfers* frame buffers into the encode worker precisely so peak
   residency is one copy. Caching them to speed a re-run would double the
   quantity admission control exists to bound, on the tier (iOS, 30 MB) where it
   already binds.

---

## Copy: the four wireframe defects, corrected

`src/content/gif-compressor.json` is hand-written and asserted by
`components/content/tool-content.test.tsx`:

- **"Cut a GIF down by 60–85%" — cut.** Phase 1 measured a 22× content-driven
  spread in bytes per pixel and never measured a GIF→GIF reduction corpus. The
  before/after slider with real byte counts replaces the claim with evidence.
- **"150 MB desktop / 50 MB mobile" — replaced.** A new explainer section, *Why
  the limit is frames, not megabytes*, states the real model. A test greps the
  content for any `NN MB` limit and fails if one returns.
- **No duration promises.** The fastest measured job is 3.96 s and the slowest
  51.8 s; no copy can know the reader's engine. A test greps for
  "instant/in seconds".
- **`FAQPage` markup — not emitted.** Removed from Search 2026-05-07.

623 explainer words, 7 FAQ entries, all in the served HTML.

---

## Verification

**Passing:**

- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm check:forbidden`
- `pnpm test` — 162 tests, 21 files (26 new)
- `pnpm check:static` — all 4 routes prerendered
- Served-HTML assertions against a production server: `h1`, explainer, all 7 FAQ
  answers, `BreadcrumbList` + `WebApplication`, no `FAQPage`, self-referential
  canonical, all four ad slots reserved from first paint, disabled primary with
  its reason, trust line, sitemap listing only `gif-compressor`
- In a real browser: probe resolves (`480×270 · 48 frames`), exactly **one**
  primary action visible at idle and at loaded, **zero** un-prompted layout shift
  (`hadRecentInput === false`) across idle → loaded → processing

**Verified in a real browser, service worker active and controlling:**

| Criterion | Result |
|---|---|
| Downloaded output is a valid GIF, smaller, original timing | `GIF89a`, 4,123,289 → 705,027 bytes (**−83%**), 48/48 frames, 480×270, 2,400 ms — asserted by decoding the bytes |
| "Drop every second frame" reaches the engine | Output decodes to **24** frames, 453,113 bytes |
| CLS across idle → loaded → processing → result | **0** un-prompted shift; page height identical across idle and loaded (4551 px → 4551 px) |
| One primary action per viewport | 1 at idle, 1 at loaded, 1 at result |
| Reset restores a width the file can have | 480 px, not the 1280 module default |
| Result badge describes the job, not the live controls | `gifski · 256 colours` |
| Offline | Worker bootstrap serves from the browser HTTP cache with `cache: "force-cache"`, so a warm visitor can still run a job |

**Not run:**

- `pnpm test:e2e`. Chromium cannot launch in this environment —
  `FATAL … bootstrap_check_in … MachPortRendezvousServer` — and the pre-existing
  `e2e/app-shell.spec.ts` fails identically, so this is environmental and matches
  the "browser suite unrun" state Phases 3 and 4 recorded. The assertions above
  were performed by driving a real Chrome instead, which is why they are stated
  as measurements rather than as passing tests.

---

## A second, separate defect — still open

`JobController`'s watchdog is documented as detecting an encoder that "has gone
silent", but it is implemented as a **one-shot absolute deadline armed at spawn
and never rearmed on progress**. For `gifenc`, which reports a real per-frame
counter, a legitimately slow encode is killed mid-progress. It should become an
inactivity timer reset by each `progress` reply. Left unfixed deliberately: it
is Phase 4 code, it is not blocking, and it deserves its own change rather than
being folded into this one.

---

## Code review

A `code-reviewer` pass ran over the diff. It corrected one premise worth
recording — **the React Compiler is not enabled** in this project; only its lint
rules run via `eslint-plugin-react-hooks` — and raised five High findings, all
of which are fixed and re-verified:

| # | Finding | Fix |
|---|---|---|
| 1 | Stale-probe race: dropping a large GIF then a small one could leave the page describing the discarded file | `probe()` now returns its handle, and the page ignores a probe whose file is no longer current |
| 2 | `getByText` matched the stage **and** the `display:none` sticky bar, failing Playwright strict mode in 5 tests | `ToolStage` carries `data-tool-stage`; every job assertion scopes to it |
| 3 | The source preview was unreserved, so idle → loaded shifted the ad slot, explainer and FAQ — **not** excused by `hadRecentInput`, because the file picker opens seconds before `change` | One fixed-height input region; both branches stretch to fill it. Measured: page height identical across the transition |
| 4 | `Button loading` only sets `pointer-events: none`, so the busy primary stayed keyboard-activatable and restarted the job | `run()` guards on `locked`; the primary uses `aria-disabled` |
| 5 | `JobError` rendered "Trim the clip" / "Set frame rate" buttons this tool cannot honour | New `settings` prop — a recovery is offered only where the tool can apply it |

Mediums fixed: Reset restoring an impossible width (#6), the result badge
reading live controls (#7), `"0 frames"` where the probe states none (#8, now
uses the already-defined `tool.sourceMetaUnknown`), the disabled primary's
reason being unreachable to assistive tech (#11), `describedBy` reaching one
control kind of four (#12), and copy stating gifski unconditionally when the
encoder is browser-dependent (#13).

Deliberately deferred, with reasons:

- **#10, the 10 Hz re-render.** `useJobProgress` is subscribed at the component
  root, so the whole page re-renders ten times a second during a job. Real, and
  the fix is to push it into a child — but it is a performance refactor best done
  alongside #14.
- **#14, extract a `<JobFlow>`.** ~400 of the page's 650 lines are tool-agnostic
  and Phase 6 would copy them. The stated acceptance bar ("add tool #2 without
  editing `tool-shell.tsx`") is met, but this should be done before Phase 6
  multiplies it by eight.
- **#15**, a test that every `status: "live"` route has a page on disk.

## Unresolved questions

1. Header and footer still link all 14 registry routes, 13 of which 404. The
   `status` field now makes the fix trivial, but nav and footer content are
   Phase 9's. **This is a Ship 1 launch blocker.**
2. `defaultMaxWidth: 640` silently caps the width slider's effect above 640 px on
   desktop. `plan.downgraded` reports it after the fact; the slider should
   probably state its ceiling before the run.
3. The encode worker now fetches its bootstrap outside the service worker on
   every spawn. Warm HTTP cache covers it, but the Discord auto-fit path
   (Phase 8) spawns up to five per job — worth measuring there.
