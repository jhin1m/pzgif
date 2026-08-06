/**
 * The shape of the homepage's hand-written copy.
 *
 * ── Why the schema is here and the prose is in `src/content/` ───────────────
 * Same boundary `tools/content.ts` draws, and for the same reason: `src/content/`
 * is `LICENSE-CONTENT` (all rights reserved) while the repository is AGPL-3.0,
 * so keeping that directory to pure `.json` makes the licence line visible in
 * the file tree. Schema is code. Prose is data.
 *
 * ── What this type deliberately does not do ────────────────────────────────
 * It says the homepage has a hero, a picker, a grid heading, three reasons and
 * a Discord teaser. It does not say what any of them contain, and it holds no
 * per-tool anything — the grid's cards read their name from `registry.ts` and
 * their benefit line from that tool's own content file. Nothing on this page is
 * assembled from a per-tool template.
 */

/** One tile in the "why" block. */
export interface WhyTile {
  heading: string;
  body: string;
  /**
   * The measurement behind the claim, in the visitor's words.
   *
   * Present only on a tile that makes an empirical claim, and when present it
   * must name the hardware — a throughput number without the machine it was
   * measured on is not a measurement, it is a mood. Architectural facts ("no
   * server exists in this path") carry no `evidence` because there is nothing
   * to measure; they are true by construction.
   */
  evidence?: string;
}

export interface HomeContent {
  hero: {
    title: string;
    lead: string;
    dropzoneTitle: string;
    dropzoneCaption: string;
    reassurance: string;
  };
  picker: {
    heading: string;
    /** Shown when the sniffed format matches no live tool. */
    unsupportedTitle: string;
    unsupportedBody: string;
    comingSoon: string;
  };
  grid: {
    heading: string;
    /**
     * Must survive Ships 2-4 unedited.
     *
     * The grid renders `liveRoutes()`, which grows. A sub-head phrased around a
     * fixed number needs rewriting every time a tool ships, and the version
     * that does not get rewritten is the one that ships a lie. `home.test.ts`
     * asserts this line carries no integer that disagrees with the live count —
     * the cheapest way to pass it is to carry no integer at all.
     */
    subhead: string;
  };
  why: readonly WhyTile[];
  discord: { heading: string; body: string; cta: string };
  meta: { title: string; description: string };
}

/**
 * Adopts the imported `.json` file as `HomeContent`.
 *
 * Mirrors `toolContent()`: it throws on a missing field rather than rendering a
 * blank section. A homepage that silently drops its hero lead because a key was
 * renamed is worse than a build failure, because nothing tells you.
 */
export function homeContent(data: unknown): HomeContent {
  const content = data as HomeContent;
  const missing: string[] = [];

  if (!content?.hero?.title) missing.push("hero.title");
  if (!content?.hero?.lead) missing.push("hero.lead");
  if (!content?.hero?.dropzoneTitle) missing.push("hero.dropzoneTitle");
  if (!content?.hero?.dropzoneCaption) missing.push("hero.dropzoneCaption");
  if (!content?.hero?.reassurance) missing.push("hero.reassurance");
  if (!content?.picker?.heading) missing.push("picker.heading");
  if (!content?.picker?.unsupportedTitle) missing.push("picker.unsupportedTitle");
  if (!content?.picker?.unsupportedBody) missing.push("picker.unsupportedBody");
  if (!content?.picker?.comingSoon) missing.push("picker.comingSoon");
  if (!content?.grid?.heading) missing.push("grid.heading");
  if (!content?.grid?.subhead) missing.push("grid.subhead");
  if (!content?.discord?.heading) missing.push("discord.heading");
  if (!content?.discord?.body) missing.push("discord.body");
  if (!content?.discord?.cta) missing.push("discord.cta");
  if (!content?.meta?.title) missing.push("meta.title");
  if (!content?.meta?.description) missing.push("meta.description");
  if (!Array.isArray(content?.why) || content.why.length === 0) {
    missing.push("why");
  }

  if (missing.length > 0) {
    throw new Error(`home.json is missing: ${missing.join(", ")}`);
  }
  return content;
}
