---
phase: 9
title: "Content SEO and Legal"
status: pending
priority: P1
effort: "4-6d"
dependencies: [3]
---

# Phase 9: Content SEO and Legal

> **[Progress 2026-08-10] The machinery slice shipped; the editorial content pages remain.**
>
> Delivered this pass, verified by `tsc`, 356 unit tests, `next build` (both new
> routes prerender static ●), `check:static` 24/24, and the two guards:
>
> - **Acceptable Use** and **Accessibility** pages — hand-written `src/content/legal/*.json` + routes — completing the set of **eight** legal/trust pages. `LEGAL_ROUTES`, the footer, `sitemap.ts` and `legal.test.ts` (word floors, no-orphan, single-address) all follow.
> - **Homepage `WebSite` + `Organization` JSON-LD** (`site-json-ld.tsx`), rendered once on `/`, no rating.
> - **`scripts/check-structured-data.mjs`** — fails the build on `aggregateRating`, `FAQPage` or `HowTo` markup — wired into `package.json` and CI. `design-guidelines.md` §10 amended to drop the obsolete `FAQPage` requirement (FAQ UI kept).
> - **Redirect map** — `src/lib/seo/redirects.ts` (empty, typed) wired via `next.config.ts` `redirects()`, with `redirects.test.ts` locking the from-not-live / to-live invariant before the list is ever non-empty.
>
> **Still open after that pass:** the hand-written non-tool content pages, and the sitewide canonical/JSON-LD audit that Phase 11 verifies. Open question 1 (named operator) is already answered — Louis Le — via the legal slice.

> **[Progress 2026-08-10] The content slice shipped. One page is deliberately held.**
>
> Verified by `tsc`, `eslint`, **376 unit tests**, `next build` (all six guides
> and the hub prerender static ●), `check:static` **26/26**, `check:forbidden`,
> `check:structured-data`, `check:landing`, `check:heavy`, and the **full
> Playwright suite — 206 passed, 0 failed** across Chromium and WebKit.
>
> - **Six editorial guides at `/guides/<slug>`, plus a hub at `/guides`.** Route
>   shape settled — see "Where the guides live" below. Every word hand-written;
>   700-word floor asserted, and a cross-corpus duplicate-paragraph check now
>   spans the guides, the hub and the About page.
> - **The Discord limits table is generated from `presets/discord.ts`**, so the
>   page and the encoders cannot disagree. `byteLimit: null` renders as "Not
>   published" with our own target labelled separately; each row links its source
>   article and shows its `verifiedOn` date.
> - **Real content dates everywhere.** `updated` added to all 15 tool content
>   files (taken from each file's own last git commit, not invented), to the six
>   guides, and validated by `toolContent()`. `sitemap.ts` now emits a
>   `lastModified` for every URL except the homepage, which is a composite and is
>   honestly left undated. `sitemap.test.ts` asserts the route list, the dates,
>   and that the module never reads the clock.
> - **`robots.ts` extended** — `/dev/` and `/__bench` disallowed as a third
>   layer behind `pageExtensions` and each page's own `noindex`. There are no
>   result URLs to exclude; a finished file is an in-memory blob with no HTTP
>   address, which the phase plan predates.
> - **FAQ crawlability is now asserted** (`e2e/faq-crawlability.spec.ts`):
>   answers present in the *raw served HTML* rather than the hydrated DOM, no
>   `hidden` in the static markup, and `hidden="until-found"` applied after mount
>   only where `beforematch` exists — with the WebKit branch asserted separately,
>   because there the attribute fails closed.
> - **Footer** carries a guides row; all six are sitewide internal links.
>
> **Deliberately not shipped: the gifski side-by-side comparison page.** Gate G6
> — is gifski *visibly* better than `gifenc` at matched bytes — is generated but
> **unscored**, and Phase 1 pre-registered that every "visibly better" claim
> comes out of the copy if it fails. A page whose entire premise is that claim
> cannot be written before the judging; writing it anyway would make the
> pre-registration decoration. It becomes the seventh guide the moment G6 is
> scored, and `GUIDE_ROUTES` carries that note. **Scoring G6 is now the blocker
> on this phase's last page and on differentiator #1 being legible anywhere.**

## Overview

Build the SEO machinery and the legal pages. **The homepage is no longer in this phase** — it shipped in the homepage soul pass. Runs in parallel with the tool phases — none of it depends on the media engine.

Two things here are load-bearing for the business rather than the product: the **≥400-word hand-written explainer on every page** (the defence against Google's scaled-content-abuse policy, whose penalty is site-wide) and the **legal + About pages** (approval prerequisites for any ad network, not a later chore).

## Requirements

**Functional**
- **6-10 genuine non-tool content pages** — the AdSense evidence pack
- `sitemap.ts`, `robots.ts`, per-page metadata, canonical, JSON-LD
- Legal: Terms, Privacy, Cookie Policy, Acceptable Use, About, **Contact**, **DMCA**, **Accessibility statement**
- 404 page and a redirect strategy for future tool renames
- FAQ accordion component with crawlable answers

**Non-functional**
- Every page statically prerendered
- Every explainer hand-written; no page's prose derived from another's

## Architecture

### Structured data — what is actually alive in 2026

| Type | Status | Emit? |
|---|---|---|
| `FAQPage` | **Dead.** Deprecated 2025-05-08, stopped appearing in Search **2026-05-07**, docs removed 2026-06-15 | **No** |
| `HowTo` | **Dead.** Removed from mobile 2023, then desktop | **No** |
| `BreadcrumbList` | Live, still renders in results | **Yes**, every tool and preset page |
| `WebApplication` | Live. Rich-result eligible only with `aggregateRating`/`review` | **Yes, with `isAccessibleForFree: true` and NO rating** |
| `WebSite` + `Organization` | Feeds site-name generation and entity understanding | **Yes, homepage only** |

**On `offers` — amended 2026-08-10, during implementation.** This table asked for
`offers.price: 0`. The code emits `isAccessibleForFree: true` instead and no
`offers` node at all, because `offers` with a zero price reads to a parser as a
product listing for a thing that is not a product, and it earns nothing: the
rich result it feeds needs a rating this site correctly refuses to fabricate.
`isAccessibleForFree` states the same fact in the vocabulary meant for it. The
reasoning is recorded in `tool-json-ld.tsx`; this row was corrected to match the
code rather than the other way round.

**On `WebApplication` without a rating — this is deliberate and must survive future audits.** Google requires a rating for rich-result eligibility. PZGIF has no reviews at launch. Fabricating them is a structured-data spam violation that risks a manual action against a site whose entire model is organic search — a catastrophic downside for a cosmetic upside. Emit the markup, accept no rich result, gain the entity benefit. **Do not let a later "SEO fix" add synthetic ratings.**

**On `FAQPage`:** `design-guidelines.md` §10 mandates it. That half of the requirement is now obsolete. **Keep the FAQ UI exactly as specified** — the visible Q&A still earns long-tail impressions and feeds AI answer surfaces. Only the JSON-LD goes. Amend §10.

§5.12's `hidden="until-found"` requirement is right in intent but **unsupported in Safari, where it fails closed** and makes answers unopenable. Apply it as progressive enhancement per Phase 3; the crawlability goal is met either way because the answers are in the SSG HTML in both branches.

### Canonical and hreflang

At one locale: **self-referential canonical only. No hreflang, no `x-default`.** Google's own guidance is that single-language sites do not need hreflang, and emitting it for one language is noise. The `alternatesFor()` helper should be written now so locale #2 is a one-line change, but it emits only the canonical today.

### Non-tool content pages — this is the revenue path, not decoration

The plan otherwise produces **14 tool pages and zero editorial content**. Research is explicit that an ad network wants 10-20 indexed *content* pages, and that a wall of tool pages with an embedded app is the classic "low value content" rejection shape. 400 words per tool page is the floor, not a cushion. With AdSense as the only realistic launch network and Journey's Next.js support unverified, a double rejection leaves no revenue path at all.

Write 6-10 pages that need no engine, and publish them on the live domain **while the engine is being built** so they are indexed before the tools ship:

- "GIF vs MP4 vs WebP — which to use for what"
- "Every Discord asset size limit in one table" (feeds the preset cluster's internal links)
- "Why your GIF is 6 MB, and the four levers that shrink it"
- "gifski vs standard GIF encoders — side-by-side samples at matched file size"
- "How to make a Discord emoji that isn't blurry"

The gifski comparison page does triple duty: editorial content, link bait, and — critically — **the only surface where differentiator #1 is legible to a stranger**. The `BeforeAfterSlider` on a tool page compares the user's input to their output; it never shows gifski against a competitor, so a user cannot perceive the quality claim at the moment they decide.

**[2026-08-10] Held, pending gate G6.** The other five shipped and a sixth was
written in its place — "Why a 60fps GIF is not 60fps", which stands entirely on
properties of the file format and on the browser delay clamp the engine already
implements. The gifski page cannot be written on the same footing: its premise
*is* the unscored claim, and Phase 1 pre-committed to deleting every "visibly
better" line if the judging goes the other way. Score G6, then write it.

### Where the guides live — `/guides/<slug>`, decided 2026-08-10

Top-level was the alternative and it loses on three counts. The top-level
namespace is the commercial keyword space, and a guide at `/gif-vs-mp4-vs-webp`
sitting beside a tool at `/gif-to-mp4` invites exactly the confusion a URL exists
to resolve. A path prefix is also the only thing that makes "publish a batch,
watch Search Console, publish the next" a filter anyone can actually apply. And
a guide has a real parent, so `BreadcrumbList` gets Home > Guides > page rather
than an invented intermediate crumb or a two-item breadcrumb that says nothing.

The hub is a seventh indexable page and carries the six internal links; the
footer carries them sitewide as well.

### The scaled-content defence

14 near-identical tool pages is structurally the shape Google's policy targets. What actually differentiates them:

- A genuinely different explainer answering questions specific to that conversion
- A FAQ whose questions people actually ask about *that* tool
- Different related-tool links, different examples, different numbers
- A working tool — utility is itself a quality signal

What does **not** differentiate them: swapping the tool name into a shared paragraph. Launch in batches and watch Search Console before scaling, per the bootstrap guidance.

### Homepage — **shipped elsewhere, no longer this phase's**

`plans/260805-2239-pzgif-homepage-soul-pass-.../` built it: hero, working
dropzone, action picker, tool grid, "Why PZGIF" three-up, Discord teaser and the
below-grid ad slot. Nothing about the homepage is owed here.

Two decisions made there that this phase must not undo:

- **The drop does not route by file type.** It offers. Every live route declares
  `inputFormats: ["gif"]`, so a dropped GIF is valid input for all five and
  auto-routing would guess wrong four times in five. The bullet this section used
  to carry — "drop a `.mp4` → `/mp4-to-gif`" — describes a set of tools that do
  not exist yet and a behaviour that was rejected on the evidence.
- **The wireframe copy was not reused verbatim.** It carries five documented
  defects, and `src/lib/content/home.test.ts` now asserts none of them can
  reappear.

The **footer** is still this phase's, and the rule stands: exactly the 9 shipped
tools plus the Discord cluster. The wireframe's `GIF to WebP` and `GIF for Slack`
entries are out of scope.

## Related Code Files

- Create: `src/app/sitemap.ts`, `src/app/robots.ts`
- Create: `src/app/[locale]/(legal)/terms/page.tsx`, `privacy/page.tsx`, `cookies/page.tsx`, `acceptable-use/page.tsx`, `about/page.tsx`
- ~~Create: `src/lib/seo/metadata.ts` (incl. `alternatesFor()`), `src/lib/seo/jsonld.ts`~~ — shipped as `src/lib/tools/metadata.ts` plus `tool-json-ld.tsx` / `site-json-ld.tsx` / `guide-json-ld.tsx`. No `alternatesFor()` helper: with one locale it would be a function that returns a canonical, which `toolMetadata()` already does. It is a one-line addition when locale #2 lands, and a wrapper written for a caller that does not exist is the abstraction this codebase keeps refusing
- ~~Create: `src/components/content/faq-accordion.tsx`~~ — shipped as `faq-section.tsx` over `ui/accordion.tsx`
- ~~Create: `src/content/legal/*.mdx`~~ — **`.json`, not MDX.** MDX lets prose import components, which dissolves the `LICENSE-CONTENT` boundary into a judgement call; see `inline-copy.tsx`
- Create *(done 2026-08-10)*: `src/content/guides/*.json`, `src/content/guides.json`, `src/lib/content/guide.ts`, `src/lib/content/guides-content.ts`, `src/lib/tools/updated.ts`, `src/components/content/guide-page.tsx`, `guide-json-ld.tsx`, `discord-limits-table.tsx`, `src/app/[locale]/guides/{page.tsx,[slug]/page.tsx}`
- Modify: `docs/design-guidelines.md` §10 — remove the `FAQPage` schema requirement

## Implementation Steps

1. ~~Build the homepage.~~ Shipped in the homepage soul pass — see above.
2. Build `metadata.ts`: `metadataBase`, per-page static metadata, self-referential canonical, and `alternatesFor()` stubbed for future locales.
3. Build `sitemap.ts` with **real content dates** — a `lastModified` of "now" on every URL at every build is a negative quality signal. The date belongs with the content, so store it in each content module's frontmatter and have the registry reference it; the registry itself stays structure-only.
4. Build `robots.ts`. `noindex` `/dev/states`, `/__bench` and any result URL.
5. Build the JSON-LD helpers. `BreadcrumbList` + `WebApplication` on tool and preset pages; `WebSite` + `Organization` on the homepage; nothing else. No `FAQPage`, no `HowTo`.
6. Build `FaqAccordion` with `grid-template-rows: 0fr → 1fr` (no JS height math, no CLS) and apply `hidden="until-found"` **imperatively, only where supported** (feature-detect `'onbeforematch' in document.body`). Never render it in the static HTML — in Safari that would hide the answers permanently.
7. Write the legal pages. The Privacy Policy must disclose ad personalisation and cookies even though no network is live yet — it is easier to write once than to amend at ad-activation time. The Cookie Policy covers the CMP and analytics. Acceptable Use covers the client-side-only nature of the free tier.
7b. Add the four pages the original legal set missed:
   - **Contact**, with a real `contact@` address. Required by GDPR Art. 13(1)(b) for a controller processing EU visitors' analytics data, expected by every ad network, and — per Phase 4's error taxonomy — the product's only support channel. Today a user whose job is refused has nowhere to go
   - **DMCA policy.** Genuinely low-risk with no hosting, but it is a cheap ad-network trust signal and costs an afternoon
   - **GDPR Art. 27 EU representative** — record a decision in the Privacy Policy work item ("assessed, exemption relied on, revisit at X traffic" or "appointed"). An omission is worse than either answer
   - **Accessibility statement.** The EAA microenterprise exemption likely applies to a solo operator, but the site genuinely earns WCAG 2.1 AA and should say so — free E-E-A-T
7c. Add a 404 page and a redirect map for future tool renames. Redirect capability is the stated reason `output: 'export'` was rejected — use it.
8. Write the **About page with a real named operator**. This is an E-E-A-T signal that ad reviewers specifically look for, and it is the single cheapest thing that moves an approval decision. A generic "we are a small team" page does not count.
9. Add the AGPL **"Source"** footer link from Phase 2 alongside the legal links.
10. Verify every page is statically prerendered in the build output. Any dynamic tool page is a build failure.

## Success Criteria

- [x] The shared content components and JSON-LD helpers exist and are consumed — not duplicated — by Phases 5-8
- [x] *(Verified in Phase 11, not here:)* every tool and preset page carries ≥400 words of hand-written, page-specific explainer plus its own FAQ. Measured 2026-08-10: **875–1336 words** per page, lowest `discord-avatar-gif`. This phase owns the machinery and the non-tool pages; the tool phases own their own prose
- [~] **6-10 non-tool content pages published**, including the gifski side-by-side comparison page — **six published** (five from the list above plus "Why a 60fps GIF is not 60fps"), **gifski comparison held pending gate G6**. "Indexed" is not verifiable before the domain serves
- [x] `sitemap.ts` emits real per-page content dates, not build timestamps — asserted by `sitemap.test.ts`, including that the module never reads the clock
- [x] `BreadcrumbList` + `WebApplication` validate; `WebApplication` carries `isAccessibleForFree: true` (see the amendment above) and **no rating**
- [x] A CI grep fails the build on `aggregateRating`, so a future session cannot "fix" the missing rating by inventing one
- [x] No `FAQPage` or `HowTo` JSON-LD anywhere in the codebase
- [x] Self-referential canonical on every page; no hreflang while there is one locale — asserted per guide in `e2e/guides.spec.ts` and per policy in `e2e/legal-pages.spec.ts`
- [x] All eight legal/trust pages live — Terms, Privacy, Cookie, Acceptable Use, About, Contact, DMCA, Accessibility — with a real named operator on About and a working `contact@` address
- [x] 404 page and redirect map in place
- [x] FAQ answers present in the SSG HTML and revealed by browser find-in-page — `e2e/faq-crawlability.spec.ts`. Find-in-page itself is browser chrome and cannot be driven from Playwright, so the assertion is on the mechanism it depends on, with the WebKit fail-closed branch checked separately
- [x] Footer lists exactly the 9 shipped tools + the Discord cluster, plus the AGPL source link — and now the six guides
- [x] Every route statically prerendered — `check:static`, 26/26

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Explainer copy across 14 pages drifts into templated filler | Write it in tool-family batches with the wireframe's voice rules to hand, then read all pages side by side. Duplication is only visible in comparison |
| A later audit "fixes" the missing `aggregateRating` by inventing one | Document the reasoning in a code comment next to the JSON-LD. This is a deliberate decision, not an oversight |
| Legal pages written as boilerplate that does not match actual behaviour | The Privacy Policy must describe what the site really does: no upload, no server copy, no account. A copy-pasted policy claiming server-side processing is worse than none |
| Ad network approval rejected for thin content | Treat ≥400-word explainers, the five legal pages, and a real About page as **approval prerequisites**. Do not apply before they exist — a rejection costs weeks |

## Open questions

1. ~~Who is the named operator on the About page?~~ — resolved. **Louis Le**, in the legal slice.
2. ~~Domain provisional~~ — resolved. `pzgif.com` was purchased on 2026-08-05, so `metadataBase`, canonicals and sitemap URLs are final from the start. No placeholder-URL cleanup pass is needed.
3. ~~Where do the editorial pages live?~~ — resolved 2026-08-10. `/guides/<slug>` with a hub at `/guides`; reasoning above.
4. **When is gate G6 scored?** Now the only thing standing between this phase and its last page. The judging pack has been sitting generated and unscored since Phase 1. Three judges, forced choice, ≥7 of 9 — the protocol is pre-registered and takes an afternoon. Until it happens the site has no surface on which differentiator #1 is legible to a stranger, and it is paying the AGPL obligation for a claim it has never checked.
