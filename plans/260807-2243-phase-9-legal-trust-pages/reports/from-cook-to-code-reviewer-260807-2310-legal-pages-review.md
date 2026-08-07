---
title: "Code review — Phase 9 legal/trust pages"
date: 2026-08-07
reviewer: code-reviewer
verdict: CHANGES REQUIRED
---

# Code review — six legal/trust pages

## Scope

- Added: `src/lib/content/legal.ts`, `legal.test.ts`, `src/components/content/legal-page.tsx`,
  6 × `src/app/[locale]/(legal)/*/page.tsx`, 6 × `src/content/legal/*.json`, `e2e/legal-pages.spec.ts`
- Modified: `src/lib/site-config.ts`, `src/lib/tools/registry.ts`, `src/components/layout/site-footer.tsx`,
  `src/app/sitemap.ts`, `messages/en.json`, `NOTICE`, `LICENSE-CONTENT`, `docs/infrastructure-runbook.md`,
  `src/content/README.md`
- ~159 lines changed in tracked files + ~39 KB of new JSON prose

## Verdict

The machinery is clean and matches neighbouring patterns closely. **Two factual claims in the
published prose are false against the code**, which is the defect class the task itself names as
worst, and one of them is repeated on two pages. Blocking.

---

## Critical

### C1 — Privacy and Cookie policies claim IndexedDB is used. It is not.

`src/content/legal/privacy.json:25` and `src/content/legal/cookies.json:26` both tell the reader
that the tool-to-tool handoff file is stored in IndexedDB.

The handoff is an **in-memory module singleton**. `src/lib/handoff/pending-file.ts:44` is
`let pending: { file: File; slug: string } | null = null`, and the file's own header comment
explicitly rejects IndexedDB ("copying tens of megabytes out to disk and back to cross a navigation
that never left the realm is work performed for nothing").

`grep -rni indexeddb src public` returns exactly three hits: the two content files, and that
rejection comment. There is no IndexedDB in this codebase.

Aggravating: `cookies.json:23` frames the list as "If you open your browser's developer tools and
look at site data, these are what you will find — listed here so that finding them is not a
surprise." A reader who follows that instruction finds no IndexedDB database, on the page whose
entire purpose is verifiable honesty.

Root cause: `plans/260807-2243-phase-9-legal-trust-pages/plan.md:30` states the same wrong fact
under a heading that says "Measured, not assumed". The copy inherited an unverified plan claim.

Fix: rewrite both bullets to describe in-page JavaScript memory (which is *cleared when the tab
navigates or closes* — a stronger privacy statement than the one currently made), or drop the item
and reduce the list to two storage mechanisms. Also correct `plan.md:30`.

### C2 — Privacy Policy claims an automated test that does not exist.

`src/content/legal/privacy.json:45`:

> "It will contain no filename, no file content, no identifier for you and no IP-derived value. It
> cannot be tied back to a person, which is why it does not require consent — and there is an
> automated test in the codebase whose only job is to fail if a filename ever reaches it."

There is no such test. `JobTelemetry` (`src/lib/media/job-controller.ts:37`) has no filename field,
so the *design* is right — but there is no `job-controller.test.ts`, and no test in `src/` or `e2e/`
asserts the telemetry shape. Grepping the test files for a filename guard returns only unrelated
comments in `src/components/tool/file-chip.test.ts` and three e2e specs.

This is a present-tense claim about a codebase artefact, made in the paragraph that argues the
future measurement signal does not require consent. It is the sentence a regulator or an ad-network
reviewer would spot-check.

Fix: either write the test (a five-line assertion over `JobTelemetry` keys, worth having anyway) or
delete the clause. Deleting is in scope; writing the test is arguably Phase 10.

---

## High

### H1 — `<title>` renders the brand twice on five of six pages.

`src/app/[locale]/layout.tsx:21` sets `title.template: "%s — PZGIF"`. A page returning a string
`title` gets the template applied.

The tool content files deliberately omit the brand suffix for exactly this reason
(`"GIF compressor — shrink a GIF in your browser"` → `"… — PZGIF"`). Five of the six legal
`meta.title` values already carry it:

| file | `meta.title` | rendered `<title>` |
|---|---|---|
| `privacy.json` | `Privacy Policy — PZGIF` | `Privacy Policy — PZGIF — PZGIF` |
| `cookies.json` | `Cookie Policy — PZGIF` | `Cookie Policy — PZGIF — PZGIF` |
| `terms.json` | `Terms of Service — PZGIF` | `Terms of Service — PZGIF — PZGIF` |
| `dmca.json` | `Copyright and DMCA takedown — PZGIF` | `… — PZGIF — PZGIF` |
| `contact.json` | `Contact PZGIF` | `Contact PZGIF — PZGIF` |

Deviation from the established tool-page convention, visible in SERPs, on the pages whose job is
looking credible. Not caught by CI because the only title assertion is `not.toBe("")` (see M3).

Note: `src/content/home.json` has the same shape pre-existing. That is a separate, pre-existing
issue; this change adds five new instances.

Fix: strip the suffix from the five `meta.title` values, or use `title: { absolute: … }` in
`generateMetadata`. Prefer the former — it keeps the pattern identical to the tool routes.

### H2 — The no-cookie guard cannot catch the most likely way the claim goes false.

`src/lib/content/legal.test.ts:196-215` greps source files for the literal string
`document.cookie`. Two gaps:

1. **`src/i18n/routing.ts:20` — `localeCookie: false`.** That single line is what actually keeps
   next-intl from setting a `NEXT_LOCALE` cookie; next-intl's default is *on*. Flip it, or delete
   the line during a config tidy, and the site sets a cookie while `cookies.json`'s headline
   ("PZGIF sets no cookies. Not 'only essential cookies' — none.") stays green.
2. **`next.config.ts` is outside the walked roots.** `sourceFiles()` walks `src/` and `public/`
   only (verified: 137 files, includes `src/middleware.ts`, `public/sw.js`, `src/i18n/routing.ts`;
   excludes root-level configs). A `Set-Cookie` added in `headers()` is invisible to the guard.

Also, the comment at line 199-201 — "the day Phase 10 wires an ad network, this test fails and the
policy has to be rewritten in the same commit as the cookie" — is wrong. An AdSense or GPT tag sets
its cookies from its own origin; the string `document.cookie` never appears in this repository. The
test will stay green through the exact event it says it guards.

Fix: add `localeCookie` and `Set-Cookie` to the offending-pattern list, add the repo root's config
files to the scanned set, and correct the comment to say what the guard actually covers.

---

## Medium

### M1 — `sitemap.ts` comment misstates its own safety property.

`src/app/sitemap.ts:12-18` claims "Missing an entry is a type error instead."

`noUncheckedIndexedAccess` is not enabled (`tsconfig.json`), and `LEGAL_CONTENT` is typed
`Readonly<Record<string, { updated: string }>>`. Indexing it with a `string` slug yields
`{ updated: string }` unconditionally. Adding a route to `LEGAL_ROUTES` without adding the import
type-checks fine and throws `Cannot read properties of undefined (reading 'updated')` during
`next build`.

The failure is still loud, so this is a comment defect rather than a behaviour defect — but the
comment is the reason the shape was chosen. Making it true is cheap: narrow `LegalRoute["slug"]` to
a union and key the record on it.

### M2 — `cookies.json` overstates what the guard does.

`cookies.json:16`: "an automated test in the repository fails the build if one is ever added
without this page being updated at the same time."

- `pnpm build` does not run vitest. CI (`.github/workflows/ci.yml`) does run `pnpm test` before
  `pnpm build`, so the spirit holds on `main` — but "fails the build" is not accurate as written.
- The test has no coupling to "this page being updated". It fails on `document.cookie` full stop;
  editing the page does not make it pass.

Fix: "a test in the repository fails CI if a cookie is ever set in the code" is true and sufficient.

### M3 — e2e assertion does not test what its comment says.

`e2e/legal-pages.spec.ts:36-38`:

```ts
// Distinct <title> per page — six identical titles is the duplicate signal
// the hand-written copy exists to avoid.
expect(await page.title()).not.toBe("");
```

A non-empty check cannot detect identical titles. This is a phantom assertion — it executes the
page and proves nothing about the stated property, and it is why H1 shipped. Collect the titles
across the loop and assert `new Set(titles).size === PAGES.length`, or assert each title contains
its page's distinctive token.

### M4 — Anti-template guard only catches byte-identical paragraphs.

`legal.test.ts:157-175` normalises case and whitespace, skips strings under 8 words, and requires an
exact match. The scaled-content shape it targets is *near*-identical prose, which passes. That is a
reasonable engineering limit, but the comment calls it "the one defence that survives a future
consistency pass", which oversells it. Either say what it covers, or add a cheap shingle-overlap
check. Non-blocking — the copy read as genuinely distinct on inspection.

---

## Low

- **L1** `legal-page.tsx:60` uses `key={section.heading}`. Two sections with the same heading in one
  page collide. `legalContent()` does not enforce per-page heading uniqueness. Same pattern as
  `tool-explainer.tsx`, so it is consistent — but the validator already checks everything else, and
  this is two lines.
- **L2** `legal.test.ts:61-65` ("all validate against the schema") can never fail independently:
  `PAGES` is built by calling `legalContent()` at module scope, so a schema break throws at import
  and the file errors before the test runs. Harmless, but it is not the guard it appears to be.
- **L3** `plan.md:55` says `check:static` passes with 14/14 routes; the actual count is 13. Plan
  text only.
- **L4** `src/app/robots.ts:10` still reads "Phase 9 owns the real SEO machinery and will extend
  this." Robots extension is explicitly out of scope for this slice; the comment now points at a
  phase that has partly landed. One-line update or leave.

---

## Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Six routes statically prerendered, `check:static` clean | **Met.** No `cookies()`/`headers()`/`dynamic`/`revalidate` in any new file; `setRequestLocale(locale)` in both `generateMetadata` and the default export of all six; `generateStaticParams` + `dynamicParams = false` inherited from `[locale]/layout.tsx`. Middleware matcher `/((?!api\|_next\|_vercel\|wasm\|__bench\|.*\..*).*)` covers all six slugs. |
| 2 | No regression to `registry.ts` consumers | **Met.** Purely additive: `LegalRoute` + `LEGAL_ROUTES` appended, `ALL_ROUTES`/`liveRoutes()`/`relatedRoutes()`/`chainTargets()`/`routesInGroup()` byte-identical. `LEGAL_ROUTES` is correctly excluded from `ALL_ROUTES`. |
| 3 | Footer inventory + AGPL source link intact | **Met.** The three-column tool grid is untouched. The `border-t border-line pt-5` moved from the source/licence div onto the new `<nav>`, and the div became `mt-4` with no border — the divider now sits above the legal row instead of above the licence row, which reads correctly. `sourceUrlForThisBuild` and `t("licence")` unchanged. |
| 4 | Sitemap: real content dates for legal, tool entries unchanged | **Met.** Tool and homepage entries byte-identical; legal entries carry `updated` from their own JSON. See M1 for the comment defect. |
| 5 | No new client component | **Met.** `LegalPage` and all six routes are server components; the Contact `mailto:` is a plain `<a>`, correctly not `Link`. |
| 6 | Prose uses only `**bold**` | **Met.** `grep -nE '\[[^]]+\]\([^)]+\)\|`\|<[a-zA-Z/]\|https?://'` across all six files: zero hits. Bare email addresses are used as plain text and read correctly. |
| 7 | Factual accuracy of the storage/upload/cookie claims | **NOT MET.** See C1 and C2. Verified true: no cookies (`document.cookie` appears only in the test that greps for it); `localStorage` holds exactly the theme key (`theme-toggle.tsx:54`, `theme-init-script.ts:18`, no other writer); Cache Storage holds the shell + `/wasm/` + `/_next/static/` per `public/sw.js`; no upload endpoint (`src/app/api` does not exist); no third-party script (fonts are `next/font/google`, self-hosted; no external hosts in `src/`). Verified false: IndexedDB, and the filename-guard test. |
| 8 | Guards can actually fail | **Partially met.** Ran the file: 18/18 pass. Replicated `sourceFiles()`: 137 files scanned, correctly includes `src/middleware.ts`, `public/sw.js`, `src/i18n/routing.ts`, correctly excludes `*.test.*`; root configs are outside the walk (H2). The six negative-case validator tests are real and each targets a distinct branch. The paragraph-uniqueness check can fail but only on exact matches (M4). L2 notes one test that cannot fail. |

## Not found

No concurrency, auth, N+1, data-exposure or backwards-compatibility issues. No scope drift — every
touched file is on the stated list. No `any`, no lint suppressions, no catch-and-swallow. The
`LegalPage` renderer is a faithful sibling of `ToolExplainer` rather than a parallel
reimplementation, and correctly omits the ad slot.

## Recommended actions

1. Fix C1 (IndexedDB) in `privacy.json`, `cookies.json` and `plan.md:30`. Blocking.
2. Fix C2 (filename-test claim) — delete the clause or write the test. Blocking.
3. Fix H1 (double brand suffix) in five `meta.title` values.
4. Fix H2 (cookie guard scope + comment).
5. Fix M3 (title-distinctness e2e assertion) — it is what would have caught H1.
6. Fix M1, M2 comment/claim accuracy.
7. L1-L4 at discretion.

## Unresolved questions

- H1 rests on Next's documented `title.template` inheritance; `.next` output is not readable from
  this session. Confirm with one `curl -s http://localhost:3000/privacy | grep -o '<title>.*</title>'`
  against `pnpm preview` before deciding the fix shape.
- C2: is the telemetry filename guard intended to be Phase 10 work? If so the clause should read in
  the future tense alongside the rest of that paragraph.
- `docs/infrastructure-runbook.md` correctly marks `contact@pzgif.com` as a pre-deploy blocker. Four
  published pages depend on it; confirm the Cloudflare Email Routing MX records exist before this
  ships, not before it merges.

Status: DONE_WITH_CONCERNS
Summary: Machinery is clean and additive with no regressions, but two published legal claims are
false against the code (IndexedDB storage; a filename-guard test that does not exist) and five of
six pages render a doubled brand suffix in `<title>`.
Concerns: C1 and C2 are blocking — a Privacy Policy that misstates where user data is stored is the
defect this page set exists to prevent. The unverified premise came from `plan.md`, so the plan
needs the same correction.
