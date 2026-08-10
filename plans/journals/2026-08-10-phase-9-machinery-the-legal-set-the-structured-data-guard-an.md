---
title: "Phase 9 machinery: the legal set, the structured-data guard, and the rename mechanism"
date: 2026-08-10
summary: "Shipped Phase 9's deterministic machinery — two legal pages, homepage entity JSON-LD, a structured-data CI guard, and an empty-but-wired redirect map — leaving the editorial content pages for a later slice."
---

# Phase 9 machinery: the legal set, the structured-data guard, and the rename mechanism

## What happened

Executed the machinery back-half of Phase 9 (Content/SEO/Legal) of the PZGIF
MVP plan `260805-0001`, on branch `claude/gif-tools-discord-presets-xdhnq9`
(commit `c302b3f`). Scope was chosen by the user via a scope question: the
deterministic pieces, explicitly **not** the hand-written editorial content
pages.

Delivered:

- **Two legal pages completing the set of eight** — Acceptable Use and
  Accessibility. Hand-written per-page prose in `src/content/legal/*.json`,
  routed exactly like the existing legal pages (`setRequestLocale`,
  module-scope `legalContent()`, no per-request reads). `LEGAL_ROUTES`,
  the footer, `sitemap.ts` and `legal.test.ts` (word floors, no-orphan,
  single-address) all follow from the two new registry entries.
- **Homepage `WebSite` + `Organization` JSON-LD** (`site-json-ld.tsx`),
  rendered once on `/`, carrying no rating — the entity nodes the tool pages'
  publisher reference resolves to.
- **`scripts/check-structured-data.mjs`** — a CI grep-guard that fails on
  `aggregateRating`, `FAQPage`, or `HowTo` markup, modeled on the existing
  `check-forbidden-headers.mjs`. Wired into `package.json` + CI, and
  `design-guidelines.md` section 10 amended to drop the obsolete `FAQPage`
  schema requirement (the visible FAQ UI stays).
- **Rename-redirect mechanism** — `src/lib/seo/redirects.ts` +
  `next.config.ts redirects()`, empty today, with `redirects.test.ts` locking
  the from-not-live / to-live invariant before the list is ever non-empty.

## Decision

The structured-data guard matches **quoted JSON-LD usage** (`"FAQPage"`,
`aggregateRating:` / `"aggregateRating"`) rather than the bare word. That was
deliberate: the two JSON-LD components must name these constructs in prose to
explain why they are absent, and a bare-word grep would force either inline
pragmas through the doc comments or a whole-file allowlist. Allowlisting the
JSON-LD files is exactly wrong — those files are where a rating would be added
by mistake — so the guard keys on the shape real markup takes and leaves
backticked prose alone.

Code review (code-reviewer subagent) passed with no blocking issues. Its one
actionable low finding — the `redirects.ts` comment overstated a safety net
the registry test did not actually provide — was closed by adding
`redirects.test.ts`, which now genuinely enforces the invariant.

## Verification

`tsc` clean · 356 unit tests pass · the production compile prerenders both new
routes as static · `check:static` 24/24 · `check:structured-data` +
`check:forbidden` green.

## Next steps

Remaining Phase 9 work, deferred by design: the 6-10 hand-written non-tool
content pages (including the gifski side-by-side comparison — the AdSense
evidence pack), and the Phase 11 sitewide canonical/JSON-LD audit. Two
non-blocking review notes to honor when the first tool rename actually ships:
confirm the workerd/Cloudflare runtime serves `next.config` `redirects()` at
the edge, and keep the new collision test in force.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
