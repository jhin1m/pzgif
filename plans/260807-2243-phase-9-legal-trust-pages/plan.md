---
plan: 260807-2243-phase-9-legal-trust-pages
title: "Phase 9 slice — six legal/trust pages"
status: complete
parent: plans/260805-0001-pzgif-mvp-9-browser-native-gif-tools-discord-presets/phase-09-content-seo-and-legal.md
created: 2026-08-07
---

# Phase 9 slice — Terms, Privacy, Cookie, Contact, About, DMCA

Ship the six legal/trust pages that gate an ad-network application. Acceptable
Use and Accessibility are deliberately deferred: neither is checked by AdSense
intake, and both cost copy time this slice does not need to spend.

## Decisions taken (locked, not to be re-litigated)

| # | Decision | Consequence |
|---|---|---|
| 1 | **Named operator: Louis Le**, solo developer, based in Australia | About, Privacy controller, DMCA agent, `NOTICE`, `LICENSE-CONTENT` |
| 2 | **`contact@pzgif.com`** | Requires Cloudflare Email Routing before the pages go live — infra task, see Risks |
| 3 | **Governing law: Australia** | Terms; Australian Consumer Law carve-out is mandatory and non-excludable |
| 4 | **Prose as `src/content/legal/*.json`** | No MDX dependency, keeps the `LICENSE-CONTENT` boundary visible in the file tree |

## What is actually true today — every page must match this

Measured, not assumed (`grep` across `src/`, `public/`, `scripts/`):

- **No cookies.** Zero `document.cookie` in the codebase, and `localeCookie: false`
  in `src/i18n/routing.ts` suppresses next-intl's `NEXT_LOCALE` default — that
  line, not the absence of `document.cookie`, is what actually keeps the claim true.
- `localStorage`: exactly one key, the theme preference (`theme-init-script.ts`).
- **No IndexedDB and no `sessionStorage` anywhere.** The tool-to-tool handoff in
  `lib/handoff/pending-file.ts` is an in-memory module singleton; its header
  explains why both storage options were rejected. The first draft of the copy
  claimed IndexedDB on the strength of that header's *mention* of it — the
  correction is recorded here because the wrong version was written under this
  very heading.
- Cache Storage: the service worker caches the app shell and the WASM binaries.
- **No analytics, no ad network, no error reporting.** All of it is Phase 10.
- No account, no upload, no server-side processing of any media.

A Cookie Policy claiming cookies we do not set is the boilerplate failure the
parent phase doc calls out. The page says so plainly and then describes what
*will* be set when advertising ships, so it does not need amending on the day the
flag flips.

## Phases

| # | File | Ships |
|---|---|---|
| 1 | [phase-01-machinery-and-routes.md](phase-01-machinery-and-routes.md) | Schema, loader, shared renderer, 6 route shells, registry entries, footer, sitemap |
| 2 | [phase-02-legal-copy.md](phase-02-legal-copy.md) | Six hand-written `src/content/legal/*.json` files |
| 3 | [phase-03-verification.md](phase-03-verification.md) | Vitest content guards, e2e, doc + licence-file sync |

Phase 1 and 2 can be written in either order but Phase 3 verifies both.

## Acceptance criteria

- [x] Six routes live and statically prerendered: `/terms`, `/privacy`, `/cookies`, `/contact`, `/about`, `/dmca`
- [x] `pnpm check:static` passes — 13 page routes, 6 of them new
- [x] Every page reachable from the footer on every route
- [x] Every page in `sitemap.xml` with a **real content date** from its own file, not a build timestamp
- [x] About names Louis Le and says where he is; Contact carries a working `contact@pzgif.com`
- [x] Privacy records a GDPR Art. 27 EU-representative decision explicitly
- [x] Terms carries the Australian Consumer Law non-excludable-guarantees carve-out
- [x] Cookie Policy states the site sets no cookies today, and no page claims behaviour the code does not have
- [x] A vitest guard fails the build if two legal pages share a paragraph (anti-template)
- [x] A vitest guard fails the build if the contact address or operator name drifts between pages
- [x] `typecheck`, `lint`, `test`, `build`, `check:forbidden`, `check:static` all clean
- [x] `NOTICE` and `LICENSE-CONTENT` name the operator instead of "the PZGIF operator"

## Out of scope this slice — stated, not forgotten

- **Acceptable Use** and **Accessibility statement** — the other two of the eight
- The 6-10 editorial content pages (the AdSense evidence pack proper)
- `src/lib/seo/metadata.ts` / `jsonld.ts` refactor; JSON-LD on legal pages
- `lastModified` for **tool** pages in the sitemap (tool content files carry no
  `updated` field yet; adding it touches all five and belongs with the tool copy pass)
- `noindex` for `/dev/states` and `/__bench`, redirect map, `aggregateRating` CI grep
- Phase 10 consent wiring — `consent-bar.tsx` stays a treatment with no state

## Risks

| Risk | Mitigation |
|---|---|
| `contact@pzgif.com` does not resolve when the pages go live → a Contact page with a dead address is worse than none | Cloudflare Email Routing must be configured **before deploy**, not before merge. Tracked as a runbook checklist item in Phase 3 |
| Legal copy drifts into boilerplate that contradicts the code | The storage table above is the source; Phase 3's vitest guard asserts the no-cookie claim and cross-page paragraph uniqueness |
| Governing-law clause names no Australian state | Written as "the laws of Australia"; see Open questions |
| A future session "improves" the pages by templating them | Same defence as the tool pages — the uniqueness guard is mechanical, not a comment |

## Open questions

1. **Which Australian state/territory** for the Terms venue clause? Written as
   "the laws of Australia" until answered — enforceable, but a named state
   (e.g. New South Wales) is the stronger form. One-line edit when decided.
2. Business name / ABN — is Louis Le trading as an individual, or is there a
   registered entity? Affects the Privacy Act 1988 small-business exemption
   wording. Assumed sole individual, turnover under AU$3M.
