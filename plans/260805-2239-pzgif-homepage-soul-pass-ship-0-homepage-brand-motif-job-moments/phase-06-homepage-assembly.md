---
phase: 6
title: "Homepage assembly"
status: complete
priority: P1
effort: "1.5-2d"
dependencies: [2, 4, 5]
---

# Phase 6: Homepage assembly

## Overview

Replace the holding page with the real one: hero, working dropzone, action
picker, tool grid, why-block and Discord teaser. This is where the previous
phases become a page.

## Requirements

- Functional: drop / paste / browse on `/`, sniff the bytes, offer every live
  tool that accepts that format, navigate with the file carried.
- Functional: a file no live tool accepts gets a named refusal, never silence.
- Functional: the grid links only live routes.
- Non-functional: the route stays statically prerendered — `pnpm check:static`
  must pass.
- Non-functional: no ad slot above the dropzone; the dropzone is fully visible at
  375×667 without scrolling.
- Non-functional: the landing bundle must not import the media worker, the WASM
  loader or `capability.ts`.

## Architecture

### Server / client split

`page.tsx` stays a server component: it calls `setRequestLocale()`, reads
`home.json`, and renders server sections directly. Only the hero is a client
island.

```
page.tsx  (server, SSG)
├─ <HomeHero content={...} />          client — the only hydrating part
│   ├─ <Dropzone accept={liveInputFormats} onFile={…} />   existing component
│   └─ <ToolPicker file={…} format={…} />                  appears after a drop
├─ <ToolGrid routes={liveRoutes()} content={…} />          server
├─ <WhyPzgif tiles={content.why} />                        server
├─ <DiscordTeaser content={content.discord} />             server
└─ <AdSlot />                                              below the grid, reserved
```

### The hero flow

```
idle ──drop/paste/browse──► sniffing ──► picking
                                │           │
                                └──► unsupported ──► "not built yet", clear
```

1. **idle** — dropzone with `bg-checker` and a faint `LoopMark` watermark.
   `accept` is the union of `inputFormats` across `liveRoutes()` — today `["gif"]`.
2. **sniffing** — read the leading bytes via `sniff.ts`. It reads
   `HEADER_BYTES = 4096`, so this is instant even on a 200 MB file.
3. **picking** — the box is replaced in place by a `FileChip` plus one chip per
   live route whose `inputFormats` include the sniffed format. **Reserve this
   height in the static HTML**; the picker must not push the page down when it
   appears.
4. **unsupported** — the sniffed format matches no live route. Say what the file
   is, say which tool will take it and that it is not built yet, and offer to
   clear. `sniff.ts:1-10` establishes this rule: a refusal that names the real
   format is the whole reason sniffing exists.

Selecting a chip calls `setPendingFile(file)` then navigates via `Link` from
`@/i18n/navigation`. Removing the file calls `clearPendingFile()`.

### Why sniff rather than trust the extension

`Dropzone` gates on `detectMediaFormat()`, which reads the **extension**. That is
the right first gate — it is synchronous and drives the `accept` attribute — but
it is a claim, not a fact. Every "save as GIF" button on a social network hands
out an MP4 named `.gif`. Routing that to the compressor produces `decode-failed`,
the generic bucket the "never a dead end" rule exists to keep files out of. The
picker uses the **sniffed** format, so a mislabelled file gets named correctly and
refused with a reason.

### Ad-slot law

`design-guidelines.md` §8 and the wireframe's own annotation: **no ad slot above
the dropzone.** The first slot sits below the tool grid. It is reserved from
first paint with `--radius-ad` and the "Advertisement" label, unfilled, no
spinner (`design-guidelines.md:430`).

### What must not creep in

- No `capability.ts` call — every live route is GIF-only, nothing to gate
  (see plan.md's answer to open question 3)
- No worker boot, no WASM prefetch, no probe. Sniffing 4096 bytes is the entire
  client-side cost of the homepage
- No auto-playing GIF demo. `design-guidelines.md:461` bans anything that runs on
  a loop, and §7.4 bans an auto-playing preview loop without opt-in

## Related Code Files

- Modify: `src/app/[locale]/page.tsx` — full rewrite
- Create: `src/components/home/home-hero.tsx`
- Create: `src/components/home/tool-picker.tsx`
- Create: `src/components/home/tool-grid.tsx`
- Create: `src/components/home/why-pzgif.tsx`
- Create: `src/components/home/discord-teaser.tsx`
- Create: `src/components/home/tool-icons.tsx` — one `lucide-react` icon per slug
- Modify: `src/lib/tools/registry.ts` — **only** if a live-input-format helper is
  needed. Structure only; no prose, ever
- Modify: `messages/en.json` — picker UI labels only

## Implementation Steps

1. Rewrite `page.tsx` as a server shell reading `home.json`. Keep
   `setRequestLocale()` — omitting it turns the route dynamic and fails
   `check:static`.
2. Build `ToolGrid`. Cards read name and slug from the registry and the benefit
   line from content. Icons map slug → `lucide-react` component in one small
   file, so an unmapped slug is a type error rather than a blank card.
3. Build `WhyPzgif` and `DiscordTeaser` as plain server components. The teaser
   links `gif-for-discord` only if it is live; otherwise it describes what is
   coming without a link.
4. Build `HomeHero`. Wire the existing `Dropzone` with the computed accept list.
   Reserve the picker's height in the idle state.
5. Build `ToolPicker`. Filter `liveRoutes()` by sniffed format. Chips are real
   links, so middle-click and keyboard both work.
6. Wire `setPendingFile` on selection and `clearPendingFile` on removal.
7. Build the unsupported state using the format name from `sniff.ts`.
8. Place the ad slot below the grid, reserved and unfilled.
9. Verify at 320px, 375×667, 768px and 1440px. The dropzone must be fully visible
   at 375×667 without scrolling.
10. Run `pnpm build && pnpm check:static && pnpm check:forbidden`.

## Success Criteria

- [ ] Dropping a GIF on `/` shows a picker with all five live tools
- [ ] Selecting a chip lands on that tool with the file already loaded
- [ ] Reloading that tool page falls back to its own empty dropzone with no error
- [ ] A file with no live tool gets a named refusal identifying the real format
- [ ] A `.gif` that is really an MP4 is identified as an MP4, not decode-failed
- [ ] The grid links no `planned` route
- [ ] The picker's appearance causes no layout shift
- [ ] No ad slot above the dropzone; the first slot is below the grid, reserved and unfilled
- [ ] Dropzone fully visible at 375×667 without scrolling; no horizontal scroll at 320px
- [ ] Landing chunk imports nothing from `src/lib/media/worker/**` or `capability.ts`
- [ ] `pnpm build`, `pnpm check:static`, `pnpm check:forbidden` pass
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The picker appearing shifts the page | Reserve its height in the idle state exactly as `ResultPanel` reserves its box. Phase 7 asserts homepage CLS is 0 |
| `sniff.ts` pulls a media-lib dependency chain into the landing bundle | It imports only a type from `./types`. Verify with a bundle inspection in step 10 and assert it in Phase 7 |
| Hero becomes a second engine and the landing page slows | Sniffing 4096 bytes is the whole budget. Any probe, decode or worker boot on this page is out of scope by rule |
| `Dropzone`'s extension gate rejects a mislabelled file before sniffing can name it | Accept-list is the union across live routes, so it is permissive; the sniffed format then decides. If a genuinely mislabelled file is rejected at the gate, the existing `suggestToolFor()` message still names a tool — no dead end either way |
| Icon choice makes the grid look like generic SaaS | Icons are a Phase 6 detail, reviewable and cheap to change. Bespoke icons stay out of scope per the ratified option |
