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

- `*.json` at the top level — one per tool page, plus `home.json`. Schema in
  `src/lib/tools/content.ts` and `src/lib/content/home.ts`.
- `legal/*.json` — the legal and trust pages. Schema and validator in
  `src/lib/content/legal.ts`; every field is checked at module scope in the
  route, so a malformed file is a build failure rather than a page that renders
  a heading and an empty body.

`**bold**` is the only inline markup any of these files may use — see
`src/components/content/inline-copy.tsx` for why there is no MDX here. Links go
in the component, not in the prose.
