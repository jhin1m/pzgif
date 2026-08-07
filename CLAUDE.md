# CLAUDE.md — PZGIF

Guidance for Claude Code working in this repository.

> If a global `~/.claude/CLAUDE.md` describes a Laravel manga project, it is not
> this one. **This file wins.** PZGIF is a Next.js browser-native GIF toolset.

## What this is

`pzgif.com` — an ezgif competitor where **every free-tier operation runs inside
the user's tab**. No upload, no account, no server in the loop. Revenue is
display ads. Pro and API are explicitly out of scope.

Scope is exactly **9 tools plus a Discord preset cluster** (hub + 4 dedicated
pages). `GIF → WebP` and the Slack preset appear in the wireframe footer but are
**cut**.

## The three rules that override everything

1. **No page may be cross-origin isolated.** `COEP: require-corp` breaks Google
   ad serving; `COEP: credentialless` is unsupported in Safari. Multi-threaded
   WASM needs `SharedArrayBuffer`, which needs isolation, so it is out
   permanently. Any change introducing `SharedArrayBuffer`, COOP or COEP breaks
   the revenue model — reject it. `pnpm check:forbidden` enforces this
   mechanically, and ESLint `no-restricted-imports` covers the import paths.

2. **Never fake progress.** Every progress value derives from a real counter — a
   decoded-frame index or an encoder callback. Stage weighting is fine and is
   calibrated per job type. Time-based interpolation, simulated ramps and
   invented percentages are not. When progress is genuinely unknown, show an
   indeterminate track and the word "Preparing…".

3. **Prose is never generated from a template.** 14 near-identical pages filled
   from one template is what Google's scaled-content-abuse policy penalises, and
   the penalty is site-wide. `src/lib/tools/registry.ts` owns structure only;
   every word of explainer copy is hand-written per tool.

## Authoritative documents

| File | Governs |
|---|---|
| `docs/tech-stack.md` | Architecture, library choices, rejected alternatives |
| `docs/design-guidelines.md` | Tokens, component states, ad-slot law, a11y |
| `docs/wireframe/*.html` | Visual source of truth **and voice reference** |
| `docs/infrastructure-runbook.md` | Everything that needs an account or a DNS record |
| `plans/260805-0001-.../plan.md` | Phase order, gates, ship boundaries |

Where this file and those disagree, **those win** — except the two rules above.

**The wireframe copy is not verified.** It contains at least four documented
defects: two unbacked speed claims, cut tools in the footer, wrong Discord
dimensions, and mobile limits contradicted by the memory model. Reuse it as a
voice reference; do not reuse its numbers until the Phase 11 copy audit clears
them.

## Commands

```bash
pnpm dev                 # Turbopack dev server
pnpm build               # production build (Turbopack)
pnpm typecheck           # tsc --noEmit
pnpm lint                # explicit eslint — Next 16 removed `next lint`
pnpm test                # vitest
pnpm test:e2e            # playwright, against a production build
pnpm check:forbidden     # cross-origin-isolation guard (run before build)
pnpm check:static        # every route statically prerendered (run after build)
pnpm copy:wasm           # copy .wasm out of node_modules into public/wasm/<version>/
pnpm preview             # build + run on workerd locally — the real deploy target
pnpm deploy              # check:source-sha, then build and ship to Cloudflare
```

`pnpm start` runs the Next server; **`pnpm preview` runs workerd**, and only the
second one is production. Header behaviour differs between them: Cloudflare
serves static assets without invoking the Worker, so `headers()` in
`next.config.ts` never reaches `/wasm/*` or `/_next/static/*`. `public/_headers`
is what covers those in production — change one, change the other.

## Layout

```
src/app/[locale]/        SSG shells. [locale]/layout.tsx IS the root layout
src/middleware.ts        next-intl rewrite. Next 16 renamed this to proxy.ts and
                         made it Node-only; the Cloudflare adapter rejects that,
                         so the deprecated name is deliberate. See the file.
src/components/          shared components; ui/ holds shadcn primitives
src/lib/media/           THE ENGINE — all of it inside a Web Worker (Phase 4)
src/lib/tools/registry.ts  ONE typed source for routes, nav, footer, sitemap
src/content/             hand-written per-tool copy (Phase 9). NOT .tsx
messages/                next-intl UI strings
public/wasm/<version>/   .wasm binaries, immutable-cached
```

## Conventions that are easy to get wrong

- **Pinned versions are deliberate.** `typescript` is `~5.9`; `latest` is 7.0.x,
  the Go compiler port, and Next/shadcn/Radix type surfaces are not validated on
  it. `next` must never drop below 16.2 — the Turbopack worker+WASM origin bug
  was fixed there.
- **Tailwind v4 has no `tailwind.config.js`.** All theming is in
  `src/app/globals.css`, and its block order is load-bearing. The bridge block
  must be `@theme inline`; without `inline`, Tailwind snapshots values at build
  time and dark mode silently stops working.
- **Dark mode is `[data-theme="dark"]` on `<html>`**, not shadcn's `.dark` class.
  One `@custom-variant dark` line in `globals.css` reconciles them. Never patch
  an individual copied component.
- **6px border-radius is a reserved word.** `--radius-ad` / `rounded-md` is for
  ad slots only; product elements use 8/12/16px. The mismatch is a deliberate
  "this is not app UI" signal.
- **Do not add a hash or nonce to `script-src`.** Per the CSP spec that makes
  browsers ignore `'unsafe-inline'`, which blocks Next's inline RSC payload
  scripts and stops the page hydrating. The full explanation is in
  `next.config.ts`; `e2e/app-shell.spec.ts` locks it down.
- **Import `Link` from `@/i18n/navigation`**, never from `next/link`.
- **Every route must be statically prerenderable.** A layout or page that reads
  cookies/headers — or forgets `setRequestLocale()` — turns the route dynamic and
  fails `pnpm check:static`.

## Licensing

Two licences, disjoint file sets. `LICENSE` is AGPL-3.0 and covers the code —
this is not optional, `gifski-wasm` is AGPL and shipping it to a browser is
conveyance. `LICENSE-CONTENT` is all-rights-reserved and covers prose and brand
assets, which is why content lives in `.md`/`.json` data files rather than
`.tsx`. `NOTICE` states the boundary. The frontend is AGPL **permanently**; a
future Pro tier monetises the hosted service, not code secrecy.
