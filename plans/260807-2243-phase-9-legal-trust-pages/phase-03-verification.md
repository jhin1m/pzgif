---
phase: 3
title: "Verification and sync"
status: complete
---

# Phase 3: Verification and sync

## `src/lib/content/legal.test.ts`

Modelled on `src/lib/content/home.test.ts`, including its `allProse()` flattener.
These are the mechanical half of the Phase 11 copy audit, applied now because
legal copy is the surface a wrong claim is hardest to walk back from.

Assertions:

1. **Every file validates** against `legalContent()`, and the loader throws on a
   missing key, a slug mismatch and a malformed `updated` — the negative case
   matters as much as the positive one, or the validator is decorative.
2. **Slug ↔ filename ↔ `LEGAL_ROUTES` agree** for all six. A page whose slug
   disagrees with its route is a canonical pointing at the wrong URL.
3. **No paragraph appears in two files.** Normalise whitespace and case, then
   assert the set size equals the count. This is the anti-template guard and the
   only defence that survives a future session's "consistency pass".
4. **`OPERATOR_NAME`, `CONTACT_EMAIL` appear where they must** — the operator on
   About and Privacy, the address on Contact, Privacy and DMCA — and **no other
   email address appears anywhere** (regex for `@` in prose, allowlist the one).
   A stale `hello@` left in one paragraph is a dead support channel.
5. **The no-cookie claim is enforced against the code.** `cookies.json` states the
   site sets no cookies; the test greps `src/` and `public/` for `document.cookie`
   and fails if the claim and the code disagree. Either direction is a bug: the
   day Phase 10 sets a cookie, this test is what stops the Cookie Policy from
   silently becoming false.
6. **`updated` is a real past date**, not in the future, and matches what
   `sitemap.ts` emits for that route.
7. **Word-count floors** per `phase-02`, so a page cannot be gutted to a stub.

## `e2e/legal-pages.spec.ts`

Playwright, against a production build:

- All six routes return 200 and carry an `h1`
- Footer legal links present and correct on a tool route, not just the homepage
- One axe-style pass per page is out of scope here (Phase 11 owns a11y), but assert
  the prose column does not overflow at 320px — defect D1 in the launch report is
  an overflow bug, and six new long-prose pages are exactly where it recurs
- `sitemap.xml` contains all six URLs

## Sync — files that name the operator

- **`NOTICE`** and **`LICENSE-CONTENT`**: replace "the PZGIF operator" with
  `Louis Le`. `LICENSE-CONTENT` line 52 says "contact the operator named on the
  About page" — that sentence becomes true for the first time in this commit.
- **`docs/infrastructure-runbook.md`**: the "Named operator for the About page"
  open item (~line 174) is resolved — record the answer rather than deleting the
  item. Add a checklist entry for **Cloudflare Email Routing: `contact@pzgif.com`
  → the operator's inbox**, marked as required *before deploy*, because a Contact
  page advertising a dead address is worse than no Contact page.
- **`src/content/README.md`**: it says "Phase 9 fills this directory" and describes
  `.md`/`.mdx`. Both are now wrong — the directory holds `.json`, and `legal/`
  exists. Correct it.

## Gate

```
pnpm typecheck && pnpm lint && pnpm test && pnpm check:forbidden \
  && pnpm build && pnpm check:static && pnpm check:landing && pnpm check:heavy
```

Then `pnpm test:e2e`. The four known `/dev/states` failures from the launch report
are pre-existing and unrelated; anything new is this slice's.

## Acceptance

- All gates green; e2e failure count unchanged from the pre-existing four
- Every assertion above present and genuinely failing when its premise is broken
  (verify at least the paragraph-uniqueness and cookie guards by breaking them once)
