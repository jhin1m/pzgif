---
phase: 1
title: "Machinery and routes"
status: complete
---

# Phase 1: Machinery and routes

Everything except the prose. When this lands, six pages render from six content
files, are linked from the footer and appear in the sitemap.

## Files

### Create

**`src/lib/content/legal.ts`** — schema + validating loader.

Mirrors `src/lib/tools/content.ts` and `src/lib/content/home.ts`: the *schema is
code*, the *prose is data*. Reuses `ExplainerSection` from `tools/content.ts`
rather than redeclaring it — a legal section and a tool explainer section are the
same shape, and two copies drift.

```ts
export interface LegalContent {
  slug: string;               // must match the filename and the route segment
  title: string;              // the page h1
  updated: string;            // ISO date — the sitemap's lastModified, not a build stamp
  lead: string;
  sections: readonly ExplainerSection[];
}
export function legalContent(raw: unknown, expectedSlug: string): LegalContent
```

The loader throws on a missing key, a slug mismatch, an empty `sections`, a
non-ISO `updated`, or a section with no paragraphs. Same reason `homeContent()`
throws: a page that renders a blank body because a key was renamed fails
silently, and silence is the failure mode.

**`src/components/content/legal-page.tsx`** — one server component, shared by all
six routes.

Renders `h1` → lead → "Last updated {date}" → `sections`. Reuses
`ToolExplainer`'s paragraph renderer if it is exported; otherwise renders
`ExplainerSection[]` the same way, including the `**bold**` inline rule. Prose
column at `max-w-[68ch]` matching `not-found.tsx`. No client component anywhere
in this subtree.

**`src/app/[locale]/(legal)/{terms,privacy,cookies,contact,about,dmca}/page.tsx`**
— six near-identical shells, each ~30 lines.

Each one: `setRequestLocale(locale)`, import its own content JSON, call
`legalContent(raw, SLUG)` at module scope so a broken file is a **build**
failure, export `generateMetadata` with a self-referential absolute canonical
(same shape as `gif-compressor/page.tsx`), render `<LegalPage content={...} />`.

No `cookies()`, no `headers()`, no `dynamic`, no `revalidate` — `check:static`
must stay at 100%.

The `(legal)` route group is a grouping only; it adds no layout. Segments are
`/terms` etc., not `/legal/terms`, because they are the URLs every ad-network
intake form and browser autofill expects.

**Contact page** is the one shell with an extra element: the `mailto:` link,
built from a `CONTACT_EMAIL` constant so the address exists in exactly one place
in code. The prose in `contact.json` also names the address in text — the Phase 3
guard asserts the two agree.

### Modify

**`src/lib/site-config.ts`** — add three deployment facts:

```ts
export const OPERATOR_NAME = "Louis Le";
export const OPERATOR_LOCATION = "Australia";
export const CONTACT_EMAIL = "contact@pzgif.com";
```

These are facts about the deployment, like `SITE_URL`, not prose. They exist as
constants so the footer, the Contact page and the vitest guard read one source.

**`src/lib/tools/registry.ts`** — add a `LEGAL_ROUTES` export.

The file's stated job is "ONE typed source for routes, nav, footer, sitemap", and
its HARD RULE is *no prose* — a slug and a nav label are structure, so this
belongs here. It stays separate from `TOOLS` / `PRESET_ROUTES` so
`ALL_ROUTES`, `liveRoutes()`, `chainTargets()` and every existing test keep the
exact meaning they have now.

```ts
export interface LegalRoute { readonly slug: string; readonly name: string }
export const LEGAL_ROUTES: readonly LegalRoute[] = [ … ];  // 6 entries, footer order
```

Order for the footer column: About, Contact, Terms, Privacy, Cookie Policy, DMCA.
Trust-building pages first, obligations after.

**`src/components/layout/site-footer.tsx`** — add the legal links.

They go in the **bottom bar**, alongside the AGPL Source link and the licence
line — not as a fourth column in the tool grid. The grid's three columns are the
tool inventory and the file's own doc comment says so; a legal column there
implies legal pages are tools. The bottom bar already wraps
(`flex flex-wrap gap-x-4 gap-y-2`), so six short links land there without a
layout change beyond a `<nav aria-label>` wrapper.

**`messages/en.json`** — add `footer.legal` ("Legal") as the `aria-label` for that
nav. Nothing else; the link labels come from `LEGAL_ROUTES[].name`, which is
structure, and adding them twice is the drift this registry exists to prevent.

**`src/app/sitemap.ts`** — append the legal routes.

`lastModified` comes from each content file's `updated` field. The existing tool
entries are untouched: they carry no `updated` today and inventing one is exactly
the build-timestamp problem the parent phase warns about. Legal pages get
`changeFrequency: "yearly"`, `priority: 0.3` — they are real URLs that must be
discoverable, and pretending they compete with tool pages for crawl budget is a
worse signal than admitting they do not.

## Acceptance

- `pnpm build` emits 19 static pages, 0 warnings
- `pnpm check:static` reports all 13 page routes prerendered
- Deleting a key from any `src/content/legal/*.json` fails the **build**, not runtime
- Footer legal links present on every route, keyboard reachable, `nav` labelled
- `sitemap.xml` contains all six with dates from the content files
- No new client component; `check:landing` and `check:heavy` unchanged
