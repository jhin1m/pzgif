# Site content

Hand-written prose lives here as `.md` / `.mdx` data files — never as `.tsx`
modules. Two reasons, both load-bearing:

1. **Licence boundary.** Everything in this directory is covered by
   `LICENSE-CONTENT` (all rights reserved), not by the AGPL that covers the rest
   of the repository. Keeping it in data files makes that boundary visible in the
   file tree instead of buried in a component.

2. **No templated copy.** Every tool page carries at least 400 words written for
   that tool specifically. Filling one template across 14 near-identical pages is
   what Google's scaled-content-abuse policy penalises, and the penalty is
   site-wide rather than per-page.

`src/lib/tools/registry.ts` owns structure — slugs, formats, relationships. It
must never own prose. Phase 9 fills this directory.
