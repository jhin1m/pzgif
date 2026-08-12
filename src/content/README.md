# Site content

Hand-written prose lives here as `.json` data files — never as `.tsx` modules.
Two reasons, both load-bearing:

1. **Licence boundary.** Everything in this directory is covered by
   `LICENSE-CONTENT` (all rights reserved), not by the AGPL that covers the rest
   of the repository. Keeping it in data files makes that boundary visible in the
   file tree instead of buried in a component.

2. **No templated copy.** Every tool page carries at least 400 words written for
   that tool specifically. Filling one template across 14 near-identical pages is
   what Google's scaled-content-abuse policy penalises, and the penalty is
   site-wide rather than per-page.

`src/lib/tools/registry.ts` owns structure — slugs, formats, relationships. It
must never own prose.

## Layout

- `*.json` at the top level — one per tool page, plus `home.json` and
  `guides.json` (the guides hub). Schema in `src/lib/tools/content.ts`,
  `src/lib/content/home.ts` and `src/lib/content/guide.ts`.
- `legal/*.json` — the legal and trust pages. Schema and validator in
  `src/lib/content/legal.ts`; every field is checked at module scope in the
  route, so a malformed file is a build failure rather than a page that renders
  a heading and an empty body.
- `guides/*.json` — the editorial pages at `/guides/<slug>`. Schema and
  validator in `src/lib/content/guide.ts`, wired up in
  `src/lib/content/guides-content.ts`. A file here must have a matching entry in
  `GUIDE_ROUTES`, and vice versa; `guide.test.ts` asserts it.

Every file except the hub carries an `updated` date in ISO `YYYY-MM-DD`. It is
the sitemap's `lastModified` for that route, and it lives with the prose because
a build timestamp on every URL tells a crawler the whole site changed and then
gives it nothing changed to find. Move it when you edit the words, not when you
touch the file.

`**bold**` is the only inline markup any of these files may use — see
`src/components/content/inline-copy.tsx` for why there is no MDX here. Links go
in the component, not in the prose.
