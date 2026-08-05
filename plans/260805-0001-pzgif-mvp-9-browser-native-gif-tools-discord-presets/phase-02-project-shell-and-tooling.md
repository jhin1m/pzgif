---
phase: 2
title: "Project Shell and Tooling"
status: code-complete
priority: P1
effort: "2-4d"
dependencies: []
---

# Phase 2: Project Shell and Tooling

## Overview

Stand up the real Next.js application, the toolchain, CI, and the AGPL compliance surface. Runs in parallel with Phase 1 — nothing here depends on the benchmark result.

This phase also **amends the two locked documents** where research proved them factually wrong. Those amendments are part of the deliverable, not a side note.

## Day-one action: get the domain serving

**`pzgif.com` is purchased (2026-08-05).** The name risk is closed and the brand set built around "PZGIF" is safe.

What remains is the part that actually starts the clock: **a domain that is registered but not serving earns no index age.** On day 1 of this phase — DNS on Cloudflare, TLS live, and a deployed holding page carrying About, Privacy and Terms. Verify Search Console the same day and submit a sitemap, even a two-URL one.

The business is a 12-18 month SEO compounding play and the binding resource is *indexed age*, not code. Every day the domain sits parked is a day off the front of that curve, so this happens before the Next.js scaffold, not after it.

## Requirements

**Functional**
- Domain live with a holding page and Search Console verified — **day 1**
- Next.js 16.3 App Router app, TypeScript, Tailwind v4, shadcn/ui, next-intl, pnpm
- Full design-token layer from `design-guidelines.md` §2, wired so `[data-theme="dark"]` works
- CI: typecheck → eslint → vitest → build → playwright
- AGPL-3.0 compliance surface (licence, public source, version-accurate source offer)
- **Separate content licence** covering prose and brand assets
- Minimal service worker so "works offline after first load" is true
- `docs/tech-stack.md` amended with the six changes research established

**Non-functional**
- Every route statically prerenderable; a non-static tool page is a build failure
- No `SharedArrayBuffer` / `COOP` / `COEP` anywhere, enforced by CI

## Architecture

### Versions — pin these exactly

| Package | Version | Note |
|---|---|---|
| `next` | **16.3.0** | **Never below 16.2** — Turbopack worker+WASM origin bug was fixed in 16.2 |
| `react` / `react-dom` | 19.2.8 | |
| `tailwindcss` + `@tailwindcss/postcss` | 4.3.3 | CSS-first; **no `tailwind.config.js` exists in v4** |
| `next-intl` | 4.13.5 | Published 2026-08-04; smoke-test routing early |
| `typescript` | **`~5.9`** | **Do not take `latest` (7.0.x).** TS 7 is the Go compiler port; Next/shadcn/Radix type surfaces are validated on 5.x. Revisit when Next documents a tested TS 7 range |
| `shadcn` CLI | 4.16.1 | |
| `eslint-config-next` | 16.3.0 | Flat config by default |

Node ≥ 20.9.0 required by Next 16.

### Configuration decisions

| Decision | Value | Reason |
|---|---|---|
| `output` | **omit entirely** — do NOT use `output: 'export'` | Static export has no Proxy support, and next-intl `localePrefix: 'as-needed'` requires the proxy to rewrite `/gif-compressor` → `/en/gif-compressor`. Static export would force `/en/` prefixes forever — exactly the future migration we are avoiding. It also removes `headers()` and `redirects()` |
| `cacheComponents` | off | Zero server data to cache. YAGNI |
| i18n routing | `[locale]` segment, `localePrefix: 'as-needed'`, `locales: ['en']` | English serves prefix-free at `/gif-compressor`; locale #2 adds `/de/...` and **changes zero existing URLs**. Protects 12-18 months of accumulated link equity |
| `localeDetection` | `false` | One locale — negotiation is overhead and can produce odd bot redirects |
| `localeCookie` | `false` | A cookie before consent is a needless CMP complication |
| Proxy file | **`proxy.ts`**, not `middleware.ts` | Next 16 renamed it; `middleware.ts` is deprecated and slated for removal |
| Dark mode | `[data-theme="dark"]` on `<html>` | `design-guidelines.md` §2.2 wins over shadcn's `.dark` convention |
| `.wasm` delivery | `public/wasm/`, explicit origin-anchored URL | Sidesteps all Turbopack-vs-webpack asset-resolution divergence |

### `globals.css` — the three-block order matters

```css
@import "tailwindcss";

/* shadcn components use `dark:` utilities; make them resolve against the attribute.
   Do this ONCE here — never patch individual copied components. */
@custom-variant dark (&:where([data-theme=dark] *));

@theme { /* 1. primitives — full palette from design-guidelines §2.1 */ }
:root { /* 2. semantic tokens — design-guidelines §2.2. Plain CSS vars, NOT inside @theme */ }
[data-theme="dark"] { /* 2b. dark overrides */ }
@theme inline { /* 3. bridge semantics to Tailwind utilities */ }
```

Without `@theme inline` on the bridge block, Tailwind snapshots values at build time and dark mode silently stops working. This is the step people get wrong.

## Related Code Files

- Create: `package.json`, `next.config.ts`, `postcss.config.mjs`, `proxy.ts`, `tsconfig.json`
- Create: `src/app/[locale]/layout.tsx`, `src/app/globals.css`, `src/app/fonts.ts`
- Create: `src/i18n/routing.ts`, `src/i18n/request.ts`, `messages/en.json`
- Create: `src/lib/tools/registry.ts` — typed structure only, **no prose**
- Create: `scripts/copy-wasm.mjs` (promoted from Phase 1)
- Create: `scripts/check-forbidden-headers.mjs` — CI guard
- Create: `.github/workflows/ci.yml`
- Create: `LICENSE` (AGPL-3.0), `NOTICE`, `CLAUDE.md`
- Modify: `docs/tech-stack.md` — the six amendments below
- Modify: `.gitignore`

## Implementation Steps

1. `pnpm dlx create-next-app@latest` with `--typescript --eslint --app --use-pnpm`. Immediately `pnpm add -D typescript@~5.9` to override the TS 7 default.
2. Add Tailwind v4 (`tailwindcss`, `@tailwindcss/postcss`, `postcss`) and `postcss.config.mjs`. Do **not** create `tailwind.config.js` — it does not exist in v4.
3. `pnpm dlx shadcn@latest init`. Then add the single `@custom-variant dark` line to `globals.css`.
4. Port the **complete** `design-guidelines.md` §2.1 and §2.2 token blocks into `globals.css` in the three-block order. Do not abridge — a partial palette causes silent fallbacks later.
5. Wire fonts per `design-guidelines.md` §3.1: Space Grotesk, Hanken Grotesk, JetBrains Mono via `next/font/google`, self-hosted, `display: swap`, mono not preloaded. Add the theme-init inline script that sets `data-theme` before first paint so there is no FOUC.
6. Add next-intl: `src/i18n/routing.ts` with `localePrefix: 'as-needed'`, `proxy.ts` with the asset-excluding matcher, `[locale]` segment with `generateStaticParams()`.
7. Write `src/lib/tools/registry.ts` — the single typed source for slugs, display names, accepted input formats, output formats, and related-tool relationships across all 9 tools + 5 preset routes. **Structure only.** Prose lives in Phase 9's content modules.
8. **AGPL-3.0 compliance** (the user chose to open-source the client bundle rather than buy the $950/yr commercial licence):
   - Add `LICENSE` with the full AGPL-3.0 text, covering **code only**
   - Add **`LICENSE-CONTENT`** — all-rights-reserved (or CC BY-NC-ND) — covering `src/content/**`, `messages/**`, brand assets and the wireframe copy, with an explicit `NOTICE` clause stating the content is **not part of the Program**. The moat is the SEO copy, the domain and the traffic; open-sourcing the code is the deal, open-sourcing the copy is not. Without this split, a competitor on an aged domain can fork, rebrand, and outrank PZGIF using PZGIF's own words — and the duplicate-content penalty lands on the newer, weaker domain
   - Keep content in `.md`/`.mdx` **data files**, not `.tsx` modules, so the code/content boundary is obvious and defensible
   - Make the repository public
   - Add `NOTICE` listing third-party licences: gifski/gifski-wasm (AGPL-3.0-or-later), imagequant (GPL-3.0-or-later), mediabunny (MPL-2.0), modern-gif (MIT), fflate (MIT), `@jsquash/*` (Apache-2.0), and `@ffmpeg/core` (GPL-2.0-or-later) if the fallback ships
   - **Version-accurate source offer.** GPLv3 §6 requires Corresponding Source *for the version conveyed*. A bare footer link to `main` breaks the moment production is ahead of, behind, or diverged from it — a hotfix, a promoted preview, a rollback. Inject the build commit SHA at build time and point the footer link at `…/tree/<sha>`; CI refuses to deploy if that SHA is not pushed and public. Roughly 15 lines, permanently correct, no lawyer required
   - **Write down that the frontend is AGPL permanently.** A future Pro/API tier will inevitably share the tool registry, the design system, the components and the copy, all AGPL by then. The server binary can stay separate (unmodified gifski invoked out-of-process is the standard mere-aggregation position), but the Pro UI *is* this UI. Record in `docs/tech-stack.md`: *"The PZGIF frontend is AGPL permanently. Pro/API monetises the hosted service and the API, not code secrecy. Any closed component must be server-only and must invoke unmodified gifski out-of-process."* Note the exit — the $950/yr licence remains purchasable and would let *newly written* first-party code be closed — but it un-publishes nothing already released and does not cover `@ffmpeg/core`. Do not let a future session discover this while building Pro
8b. **Minimal service worker.** `plan.md` Goal 2 promises "offline-capable after first load", and `tool-compressor.html`'s FAQ actively invites the user to test it: *"Turning off your connection after the page loads also works."* Today that fails on reload. Cache the app shell and `/wasm/*` (already `immutable`-cached) in roughly 40 lines. **The SW must not cache ad or analytics endpoints.** This is the strongest privacy demonstration in the copy and a genuine differentiator against ezgif — cheap to make true, embarrassing to leave false.
9. CI (`.github/workflows/ci.yml`): `pnpm typecheck` → **`pnpm eslint .`** → `pnpm vitest run` → `pnpm build` → `pnpm playwright test`. The explicit eslint step is required because **Next 16 removed `next lint` and `next build` no longer lints**.
10. Add `scripts/check-forbidden-headers.mjs` to CI: fail the build if `SharedArrayBuffer`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Opener-Policy`, or an import of `gifski-wasm/multi-thread` / `@ffmpeg/core-mt` appears anywhere in `src/` or config. This is the mechanical enforcement of the plan's governing constraint.
11. Add ESLint `no-restricted-imports`: `@ffmpeg/*` importable only from `src/lib/media/ffmpeg-fallback.ts`; `gifski-wasm/multi-thread` and `gifski-wasm/cloudflare` banned outright.
12. Add CSP headers in `next.config.ts`: `script-src` must include **`'wasm-unsafe-eval'`** (the narrow directive — never blanket `'unsafe-eval'`), plus `worker-src 'self' blob:`. Without it, `WebAssembly.instantiate` throws.

    The inline theme-init script from step 5 collides with a strict CSP: nonces require per-request rendering, which contradicts this phase's own rule that every route must be statically prerenderable. Use a **build-time SHA-256 hash** of the inline script in `script-src`. The alternative is `'unsafe-inline'` (which defeats the CSP) or dropping the script (which brings back the FOUC).
13. Add `Cache-Control: public, max-age=31536000, immutable` for `/wasm/*`, with a version segment in the path since the filename carries no content hash.
14. **Amend `docs/tech-stack.md`** with a dated changelog entry recording all six research-driven changes:
    - §4: `mp4box.js` + WebM demuxer + muxer → **`mediabunny@1.52.3`** (mp4-muxer and webm-muxer are deprecated by their author; `webm-demuxer` does not exist on npm)
    - §4: animated GIF decode → **`modern-gif@2.1.0` on every browser** (Safari has no `ImageDecoder`, ever)
    - §4: add `fflate@0.8.3` (ZIP), and a vendored `gifski-wasm` fork (progress + cancellation)
    - §4: replace the "150 MB desktop / 50 MB mobile" client limits with the **frame-buffer budget model** from Phase 4
    - §6: **Ezoic is unreachable** — it has required 250,000+ monthly active users since 2026-02-19. The launch-monetisation premise is void; see Phase 10
    - §7: CI chain needs an explicit `eslint` step
15. Write a project-level `CLAUDE.md`. The global `~/.claude/CLAUDE.md` describes an unrelated Laravel manga project and will actively mislead any fresh session working in this repo.

16. **Name the hosting tier and model the bandwidth.** Vercel's Hobby plan forbids commercial use, and an ad-supported site is commercial use — so Pro at $20/mo before bandwidth is the floor, against a stated $20-50/mo infra budget. The per-session payload here is unusually heavy (gifski `.wasm` ~120 KB gzip, plus `modern-gif` and `mediabunny`), and bandwidth is the metered dimension. Decide deliberately rather than by drift; Cloudflare Pages is a live alternative but collides with the `output: 'export'` rejection above. Confirm `.wasm` is served compressed with long cache from the CDN edge, since it dominates the byte cost.

## Success Criteria

Code criteria verified 2026-08-05. Unticked items all need an account, a DNS
record or a payment method — tracked in `docs/infrastructure-runbook.md`.

- [ ] `pzgif.com` serving: DNS on Cloudflare, TLS live, holding page deployed, Search Console verified and a sitemap submitted — **on day 1** *(infra; app side ready — the homepage shell is the holding page, and `robots.ts` + `sitemap.ts` build)*
- [x] `LICENSE` (AGPL, code) and `LICENSE-CONTENT` (all-rights-reserved, prose and brand) both present, with the boundary stated in `NOTICE`
- [x] Content lives in `.md`/`.mdx` data files, not `.tsx` modules — `src/content/` established; `messages/` stays AGPL because the Program cannot run without its interface strings
- [x] Footer source link resolves to the exact deployed commit SHA; `check-source-sha.mjs` fetches that SHA **anonymously** from the public repo URL and fails CI on `main` when it is not reachable *(wire it ahead of the deploy step once a host exists)*
- [x] Service worker precaches the shell and cache-firsts `/wasm/*`, never caches ad or analytics endpoints, and falls back to the shell for offline navigations. Verified: emptying the precache list makes the offline e2e test fail. **A reload with the network off runs a *compression* only once an engine exists — that is a Phase 5/11 gate, not provable here**
- [ ] Hosting tier chosen and named, with bandwidth modelled against the infra budget *(infra — Vercel Hobby ruled out; see the runbook)*
- [x] `pnpm build` produces a statically prerendered route for every page; `check-static-routes.mjs` fails the build otherwise — demonstrated against a `force-dynamic` page, and it subtracts open-fallback routes
- [x] `pnpm dev` and `pnpm build` both run clean on Turbopack
- [x] Dark mode toggles with no FOUC and no flash on first paint — asserted on a rendered colour, not on the attribute
- [x] All `design-guidelines.md` §2 tokens resolve as Tailwind utilities in both themes
- [x] CI green end to end, with the forbidden-headers guard demonstrably failing when a `SharedArrayBuffer` reference is added
- [ ] `LICENSE`, `NOTICE`, footer "Source" link in place *(done)*; **public repo** *(infra)*
- [x] `docs/tech-stack.md` amended with a dated changelog entry covering all six changes
- [x] `CLAUDE.md` written and accurate for this repo

### Deviations from this phase file, with reasons

1. **Step 12's CSP script hash was implemented, then reverted.** Per the CSP
   spec a hash in `script-src` makes browsers ignore `'unsafe-inline'`, which
   blocks Next's inline `self.__next_f.push` RSC payload scripts — the page stops
   hydrating entirely. Observed in Playwright, not assumed. The alternative,
   a per-request nonce, forces dynamic rendering and breaks this phase's own
   static-prerender rule. `script-src-attr 'none'` was added instead, which
   recovers most of what `'unsafe-inline'` costs. Regression-tested.
2. **`upgrade-insecure-requests` removed.** WebKit applies it to loopback
   origins, upgrading `http://127.0.0.1` to https and killing every script on a
   TLS error. `default-src 'self'` already blocks cross-origin subresources, so
   it bought nothing. HTTPS enforcement moved to Cloudflare — revisit at Phase 10
   when ad and CMP origins enter the policy.
3. **`next/font` weights omitted.** All three families are variable fonts, so the
   full range ships and every weight in §3.2 is available. Cost: the weight scale
   is not enforced by the font loader.
4. **`shadcn init` partially failed** (CLI 4.16.1 errored after installing
   deps). `components.json` and `src/lib/utils.ts` are in place and the token
   bridge is verified against what shadcn/Radix components reference. No
   components are copied in yet — Phase 3 owns the design system.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `next-intl` 4.13.5 shipped the same day as the research; its Next 16 `proxy.ts` integration is documented but unexercised at that exact version | Pin exactly, smoke-test routing on day one, and keep a note of the last-known-good version |
| Amending a locked doc invites re-litigation of settled decisions | The changelog entry cites the research report line by line. Only the six listed items change; everything else in `tech-stack.md` stands |
| Making the repo public exposes work in progress | Expected and accepted under the AGPL decision. Do not commit any `.env`, key, or credential — ever, but especially now |
| TS `~5.9` pin drifts as dependencies assume TS 7 | Revisit at the first dependency that hard-requires it, not before |

## Open questions

1. Does the AGPL source offer need to cover the *exact* deployed bundle, or is the repo at a tagged commit sufficient? A footer link to the repo plus tagged releases matching each deploy is the conservative reading — confirm with a lawyer if this ever becomes contentious.
2. `next.config.ts` CSP must not block the future ad network. Phase 10 will need to extend `script-src`/`frame-src`; keep the CSP in one place so that is a one-line change.
