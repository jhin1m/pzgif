---
phase: 8
title: "Discord Preset Pages"
status: complete
priority: P1
effort: "4-6d"
dependencies: [5]
completed: 2026-08-10
---

# Phase 8: Discord Preset Pages

> **Shipped 2026-08-10.** All five routes are live and statically prerendered;
> 15/15 preset E2E pass on Chromium and WebKit with every dimension and byte
> count read out of the produced GIF. What is **not** done is the manual upload
> test — see "What shipped" below, which is the honest record of the gap.

## Overview

Ship the Discord preset cluster: a hub page with a chip picker plus four dedicated keyword pages, all driven by one auto-fit engine that searches encoder settings until the output lands under a per-preset size budget.

This is **differentiator #2** and the one piece of UI in the whole product with no competitor equivalent. It is also the phase where research found the most factual errors in the locked documents.

Independent of Phases 6 and 7.

## Requirements

**Functional**
- `/gif-for-discord` — hub with the chip picker, exactly as `docs/wireframe/discord-preset.html`
- `/discord-emoji-gif`, `/discord-sticker-gif`, `/discord-banner-gif`, `/discord-avatar-gif` — same component, different default preset, **hand-written copy per page**
- Size-budget bar with three states (over / close / fits), each carrying an icon and a sentence, never colour alone
- Auto-fit: a real encode search that keeps the highest-quality attempt that fits
- Manual override panel

**Non-functional**
- Per-preset budgets — **never a shared `MAX_BYTES` constant**
- Never print an unverified number as a hard limit
- Auto-fit attempt count capped by device tier; Cancel always available

## Architecture

### Corrected preset data — research verdict, 2026-08-04

**Both `design-guidelines.md` §10 and `docs/wireframe/discord-preset.html` contain wrong numbers.** The wireframe is closer. Verified against Discord's Help Center (Zendesk API) and `docs.discord.com`:

| Preset | Correct values | What was wrong |
|---|---|---|
| **Emoji** | 128×128, **< 256 KB**, GIF/PNG/JPEG/WebP | Both docs correct — ship as is |
| **Sticker** | **320×320 exactly**, **≤ 512 KB**, **≤ 5 s**, **≤ 60 FPS** | §10 said 256 KB (wrong). **Both docs omit the 5 s and 60 FPS caps**, which are hard rejection criteria |
| **Server banner** | **960×540, 16:9**; byte limit **undocumented by Discord** | **`680×240` appears in both docs and matches no Discord surface.** Almost certainly a corruption of the community 600×240 profile-banner figure |
| **Profile banner** | ~600×240 — **community standard, Discord publishes nothing** | The wireframe's "≤10 MB" is unverified |
| **Avatar / server icon** | Avatar 128×128 recommended; server icon 512×512 (community). **Byte limits undocumented** | §10's 256 KB is wrong — that is the emoji limit only |
| Slack emoji (future) | 128×128, **< 128 KB**, **≤ 50 frames** | Half Discord's budget — another reason there can be no shared constant |

`680×240` is the most damaging error: a preset that outputs it produces a file Discord letterboxes or crops on every upload, and the page's entire promise ("Fits Discord ✓") becomes a lie a user can disprove in ten seconds.

**Where Discord publishes no limit, do not invent one.** Target a sane default and phrase the success line as "Well under Discord's limit" rather than asserting a number. Label community-derived dimensions as "recommended" or "community standard".

Implement as `src/lib/presets/discord.ts` — one config object, each field carrying a source comment and a verification date. These numbers move: the emoji article changed on 2026-07-30 and the sticker/banner articles on 2026-08-04. Re-verify before every content refresh.

### Copy constraints these corrections impose

- The binary success line becomes **preset-parameterised**: "Fits Discord's sticker limit: 320×320, 480 KB / 512 KB ✓" — not the hard-coded "Fits Discord's 256 KB limit ✓" in `design-guidelines.md` §10
- **Do not state any Nitro/Boost gating rule — anywhere, including the FAQ.** Two Discord articles, both updated within the last fortnight, contradict each other on animated-emoji gating. `discord-preset.html` currently states gating rules in three places (the "Do I need Nitro?" FAQ answer, "animated icons need a boosted server", "animated banners need Nitro"). All three come out. Say only "Discord custom emoji · 128×128 · under 256 KB"
- **Cut the maintenance promise.** "Discord changes these occasionally; the presets on this page are updated when they do" is unkeepable for a solo operator on numbers that changed twice within two weeks. Replace with a verification date: "Verified 2026-08-04."
- The emoji upload UI also accepts **WebP** — the FAQ's "Discord expects GIF, PNG or JPEG there" is incomplete
- **Remove the "GIF for Slack" related-tools card.** The Slack preset is cut from scope; the card is a dead link promising a product that does not exist
- **Do not promise GIF stickers in an h1.** The API and Discord's own blog say GIF is accepted; a help article says APNG only. Two Discord-owned sources beat one, but put it in FAQ body text where a correction is cheap, and test a real GIF sticker upload before launch
- The server banner's "animates ~5 s on load, then pauses" behaviour is a real, useful fact — it justifies a "trim to 5 s" default as genuine user value

### Auto-fit search

Each attempt is a **real encode**, so progress is genuine ("try 3 of 5 · q64"). The naive version is a blind search; do better:

1. Resize to the preset's target dimensions **first** — this alone often solves it
2. Seed the search from `estimate.ts` rather than starting blind, so most files land in 1-2 attempts instead of 5
3. Search quality and palette downward; keep the **highest-quality attempt that fits**
4. If nothing fits, drop frames and retry — for emoji at 128×128, frame reduction is nearly invisible and is usually the right lever
5. Cap attempts by device tier. On iOS, 5 real encodes plus the 30 MB frame budget is a genuine crash risk — cap lower and say so
6. Cancel is available throughout and aborts cleanly

The budget bar re-estimates on every settings change **without re-encoding** — that comes from `estimate.ts`, which is why its accuracy matters here more than anywhere else.

**The bar must not overstate its own precision.** Within 20% of the limit, show a **range** ("≈ 200-260 KB"), not a point value — an estimate of 240 KB against a 256 KB ceiling is meaningless if the true value could be 300 KB, and the wireframe's "Cutting it close · 243 KB · 95% of budget" state is unbackable at loose tolerance. And **no "Fits ✓" state may be shown without a real encode behind it.** Auto-fit already encodes; the manual-override path currently does not, yet `discord-preset.html`'s FAQ promises the page "will not let you download something that misses the limit". Honour that by encoding before asserting a fit.

### Route structure

The hub and the four dedicated pages share one component and one engine. What differs per route: the default preset, the h1, the explainer prose, and the FAQ. **The prose must be genuinely different per page** — four near-identical preset pages generated from config is the scaled-content shape, and the penalty is site-wide.

## Related Code Files

- Create: `src/lib/presets/discord.ts` — corrected config, with source comments and dates
- Create: `src/lib/media/autofit.ts` — the search
- Create: `src/app/[locale]/gif-for-discord/page.tsx` + the four dedicated routes
- Create: `src/content/discord-*.mdx` — five distinct sets of copy
- Create: `src/components/tool/size-budget-bar.tsx`, `preset-chips.tsx`, `discord-preview.tsx`
- Create: `e2e/discord-presets.spec.ts`
- Modify: `docs/design-guidelines.md` §10 — correct the preset numbers
- Modify: `docs/wireframe/discord-preset.html` — correct 680×240 and the byte limits

## Implementation Steps

1. Write `src/lib/presets/discord.ts` with the corrected values, each annotated with its source URL and "verified 2026-08-04".
2. **Correct the two locked documents in the same change** — `design-guidelines.md` §10 and `discord-preset.html`. Leaving wrong numbers in the source of truth guarantees they come back.
3. Build `SizeBudgetBar`: three states, each with an icon plus a sentence, a fixed tick at 100% so it reads as a budget rather than progress, and the exact byte figures in mono tabular-nums.
4. Build `PresetChips` as toggle buttons with `aria-pressed`, 44px tall, Tab-reachable, Enter/Space activated.
5. Implement `autofit.ts` with the seeded search above. Emit real per-attempt progress, **and show an estimated total time** from `calibration.json` before starting — "about 8 seconds" is legible; "try 3 of 5" alone feels like a stall. Make resize-then-single-encode the default path and treat multi-attempt search as the escalation, since resizing alone often solves it.

   **Each attempt must spawn and terminate its own encode worker.** Releasing JS buffers does not release gifski's WASM heap high-water mark, so five attempts in one worker grow monotonically toward the iOS ceiling — the opposite of the memory discipline this phase claims. Budget the ~50-150 ms respawn cost per attempt; it is another argument for seeding rather than searching blind.
6. Build the Discord preview ("How it will look in a message") — emoji at 32px inline and 48px alone. This is a small touch that materially improves the decision and no competitor has it.
7. Wire the manual override panel with per-preset constraint enforcement: sticker locks to exactly 320×320 and enforces ≤5 s and ≤60 FPS; emoji locks the byte budget at 256 KB.
8. Build the hub page, then the four dedicated routes sharing the component.
9. Write five distinct sets of copy. The hub covers all presets; each dedicated page goes deep on its own — the emoji page on why frame count beats resolution, the sticker page on the 5 s and 60 FPS caps nobody else surfaces, the banner page on the 5 s animate-then-pause behaviour and the 48px title-safe area, the avatar page on Nitro and on Discord not publishing a size.
10. Add the post-download "next step" line the wireframe specifies (Server Settings → Emoji → Upload Emoji, name rules), per preset.
11. E2E: for each preset, feed an oversized fixture, run auto-fit, and assert the downloaded file is **under the preset's real byte limit and at the exact required dimensions** — decoded, not asserted from the DOM.

## Success Criteria

- [x] Auto-fit produces a file under the real per-preset limit at the correct dimensions, verified by decoding it, for all five routes
- [x] `680×240` appears nowhere in the codebase, `design-guidelines.md`, or the wireframes
- [x] Sticker preset enforces 320×320 exactly, ≤512 KB, ≤5 s and ≤60 FPS
- [x] No shared `MAX_BYTES` constant exists — every budget is per preset
- [x] No unverified number is rendered as a hard limit; community-derived values are labelled as such
- [x] No Nitro/Boost gating rule is stated anywhere in the UI
- [x] Budget bar states carry icon + sentence, never colour alone
- [x] Auto-fit is cancellable and attempt-capped by device tier — **but the iPhone half is unverified**; there is still no hardware, and it is the same gap as plan-level open question 8
- [x] Five distinct sets of hand-written copy
- [ ] **Not done: a real GIF sticker upload to Discord has not been tested.** It needs a Boost-level-1 server for custom stickers and level 2 for the 960×540 banner — roughly one month of Nitro/Boost, and no such server exists. This is a launch-blocking manual step, not a coding one, and it stays open into Phase 11
- [x] The budget bar shows a range near the limit, and no "Fits ✓" appears without a real encode behind it
- [x] No Nitro/Boost gating rule appears anywhere, FAQ included; the maintenance promise is replaced by a verification date; the Slack related-tools card is gone

## What shipped, 2026-08-10

### The engine gained four things, and three of them exist because a preset's size is chosen by its destination

Admission control was built on an assumption that is right for every tool and
wrong for every preset: that a smaller version of the requested file is an
acceptable substitute for it. It is not. A 240×240 Discord sticker is not a
smaller sticker, it is a rejected upload.

| Addition | Why |
|---|---|
| `JobSpec.widthCeiling` | Discord publishes 960×540 for the server banner, which is above **every** tier's `defaultMaxWidth`. Without it the banner silently emitted 640×360 — the right shape at the wrong size, with nothing on screen saying so. The byte budget is untouched and still decides admission; this only raises what may be *considered* |
| `GeometrySpec.pinWidth` | Makes the search shed frame rate instead of width. Applied to **all** presets, not only the sticker: it was the banner that exposed the need, because an auto-fit job is admitted against two thirds of the frame budget |
| `GeometrySpec.upscale` | Sticker only. Discord refuses anything but exactly 320×320, so an honest 200×200 sticker is a file the destination will not take. The copy says the result will look soft |
| `runAutofit` + `autofit.ts` | The search. Decodes once, holds the frames resident, and encodes a **copy** per attempt in a worker of its own |

### The search is seeded, and the ladder had a defect the first test caught

`planSearch()` starts at the highest rung *predicted to fit* — from two real
sample encodes, not a formula — so most files land in one or two attempts rather
than walking down from the top. Attempt caps are 5/4/3/2 by tier, with iOS the
point of the table.

The candidate ladder is ordered quality-first and frames-second, which is the
product decision. It is also **filtered to a strictly descending predicted
size**, and that filter is not cosmetic: the raw preference order is not
monotonic — the top of the stride-2 block is larger than the bottom of the
stride-1 block — so a search walking it would have followed a failed attempt
with a *larger* one, which cannot succeed by construction. That is a real encode,
a real worker and real memory spent to re-establish something already known, and
it reads as a slow tool rather than as a bug.

### Memory: the auto-fit job is admitted against two thirds of the budget

A normal job transfers its frames to the encoder and holds nothing. This one
cannot — it may need them for a second attempt, and re-decoding a ten-second clip
three times reads as a hang. So the frames stay resident and each attempt copies
them, which is one more full-size buffer alive than `frameBufferBytes()`
accounts for. `AUTOFIT_BUDGET_SHARE` reserves that third **before** anything is
decoded rather than discovering it as an OOM on the device with least room.

Each attempt still spawns and terminates its own encode worker, as the phase
required — that was already `JobController`'s behaviour per `need-encoder`, so
gifski's heap is reclaimed between attempts rather than accumulating.

### Two defects found while verifying, both real

1. **The homepage tool picker overflowed its reserved box by 31px at 768px.**
   The five preset routes all accept GIF, so the picker went from seven rows to
   twelve. Phase 7 had anticipated exactly this and bounded the list with
   `max-h-80` — a constant measured at 320 and 375px, where a 320px ceiling is
   *smaller* than the room available. At 768 the chips share rows and that
   ceiling is far larger than the reservation leaves, so the bound never engaged.
   The list is now a shrinkable flex child (`min-h-0`) that scrolls inside
   whatever height is left at any width, so no breakpoint knows the route count
   and the next ship cannot overflow it.

2. **The Discord result panel overshot every reservation band.** It needs
   967/933/800/764px against 736/704/588/624 — a size-budget meter and an
   in-message preview sit above the summary every other tool ends with. It now
   carries `PRESET_RESERVATION`, applied to all three branches, and
   `result-panel-reservation.spec.ts` runs `discord-emoji-gif` so the next drift
   fails the suite. That spec also stopped locating its subject by matching
   `min-h-1\d\d` against the class string — a coupling that silently found
   nothing the moment a page reserved a box outside that range, i.e. a test that
   measures nothing while looking healthy.

### One thing the copy could not say

`phase-08` above asks the avatar page to cover "Nitro", and the same file forbids
stating any Nitro or Boost gating rule anywhere including the FAQ. The
prohibition wins — it is restated twice in the success criteria and the reason is
that two Discord articles updated within a fortnight contradict each other. Both
the avatar and banner pages now point the reader at their own client instead, and
`tool-copy.test.ts` plus `discord-presets.spec.ts` assert the words appear
nowhere in the content files or the rendered markup.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Discord changes limits after launch | Config carries source URLs and dates. Re-verify before each content refresh. The four support articles changed within two weeks of the research |
| Auto-fit is slow enough to feel broken on mobile | Seed from the estimator, resize first, cap attempts by tier. Real per-attempt progress makes the wait legible rather than mysterious |
| Auto-fit OOMs on iOS | Attempt cap plus the 30 MB frame budget from Phase 4. Each attempt must release its buffers before the next |
| Four dedicated pages read as duplicates | Each goes deep on a genuinely different constraint. If the copy cannot be made distinct, collapse to the hub alone — that is the honest outcome, and better than a site-wide penalty |
| Claiming GIF stickers work and being wrong | Test a real upload before launch. Keep the claim in FAQ body text, not an h1 |

## Open questions

1. ~~Discord publishes **no** byte or pixel limit for avatars, server icons, or profile banners.~~ **Closed 2026-08-10 by making the absence a state rather than a gap.** `byteLimit: null` is a first-class value in `presets/discord.ts`, `SizeBudgetBar` renders no ceiling and no tick when it sees one, and the `unknown` sentence says plainly that Discord publishes no maximum. `targetBytes` — what the search actually aims at — is labelled as ours on the page and is never called a limit. The profile banner was cut rather than labelled: its ~600×240 is a community figure with nothing authoritative behind it, and the route now targets the 960×540 server banner Discord does publish.
2. ~~Animated-emoji gating is self-contradictory across two Discord articles.~~ **Closed by saying nothing.** No page states any gating rule; both places that wanted to now point the reader at their own client. Asserted in two suites so it cannot come back in an edit.
3. **GIF stickers: still open, and deliberately unresolved.** The API and Discord's blog say animated stickers work; one help article is more restrictive. The FAQ says exactly that — that the sources disagree and it is worth testing on your own server — rather than picking a side. **A real upload has not been tested and cannot be without a Boost-level-1 server.** This is the phase's one unmet success criterion and it carries into Phase 11.
4. ~~Server-banner max file size: no Discord-published figure exists.~~ **Closed the same way as 1.** No figure is printed. The five-second target the banner aims at is justified by the surface's own animate-then-pause behaviour rather than by an invented ceiling.
5. **New: the iOS attempt cap is unverified.** `ATTEMPT_CAP.ios` is 2, chosen against the 30 MB budget that itself carries `measured: false`. Gate G3 has never run because there is no iPhone, so "auto-fit completes on a real iPhone without crashing" is asserted by reasoning rather than by measurement. Same hardware gap as plan-level open question 8, now with one more thing riding on it.
