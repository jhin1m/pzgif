import type { ExplainerSection } from "@/lib/tools/content";

/**
 * The shape of an editorial guide's hand-written copy.
 *
 * ── Why a third schema and not the legal one ────────────────────────────────
 * A legal page and a guide render the same way — heading, lead, date, sections —
 * and sharing `LegalContent` would have worked today. They are apart because
 * they answer to different masters. A legal page's date is a compliance fact and
 * its length floor exists so a Privacy Policy cannot quietly shrink; a guide's
 * date is a freshness signal and its floor exists so a page cannot quietly stop
 * being worth indexing. The two will diverge — a guide will want an image, a
 * summary, a "last verified against Discord" line — and the divergence is easier
 * to allow now than to unpick from under eight policy pages later.
 *
 * `ExplainerSection` is still shared, because a run of prose under a heading is
 * genuinely one thing and three copies of it would drift into three outline
 * behaviours.
 *
 * ── Why every field is validated ────────────────────────────────────────────
 * Same reason as `legalContent()`. A guide has no interactive half, so a missing
 * `sections` key renders a headline over white space and nothing fails. These
 * pages exist to be read by an ad reviewer deciding whether the site has content
 * on it; a blank one is worse than an absent one.
 */
export interface GuideContent {
  /** Must match the filename and the `/guides/<slug>` segment. */
  slug: string;
  /** The page `h1`. */
  title: string;
  /**
   * The `<title>` and meta description.
   *
   * Separate from `title` for the reason every page here separates them: the
   * `h1` is read by someone who already clicked, the `<title>` by someone
   * choosing between ten blue links.
   */
  meta: { title: string; description: string };
  /**
   * One sentence for the hub card and any internal link to this guide.
   *
   * Not the meta description reused. The description is written to win a click
   * from a search result; this is written for a reader already on the site who
   * is deciding which of six guides answers their question.
   */
  summary: string;
  /**
   * ISO `YYYY-MM-DD`, the date this page's text last changed.
   *
   * Feeds the sitemap's `lastModified`, and lives with the prose rather than
   * with the route for the same reason the legal pages' does: a build timestamp
   * on every URL tells a crawler everything changed and then gives it nothing
   * changed to find.
   */
  updated: string;
  /** The paragraph under the `h1`, before the first heading. */
  lead: string;
  sections: readonly ExplainerSection[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Adopts an imported `.json` file as a `GuideContent`, or throws.
 *
 * The cast is unavoidable — a JSON module widens `"level": 2` to `number`, so
 * the literal union cannot survive the import. Everything it gives up is checked
 * here instead, at module scope in the route, which makes a malformed file a
 * build failure rather than a published blank.
 */
export function guideContent(
  data: unknown,
  expectedSlug: string,
): GuideContent {
  const content = data as GuideContent;

  if (!content || typeof content !== "object") {
    throw new Error(`Guide content for "${expectedSlug}" is not an object`);
  }
  if (content.slug !== expectedSlug) {
    throw new Error(
      `Content slug "${content.slug}" does not match the guide "${expectedSlug}"`,
    );
  }
  for (const key of ["title", "lead", "summary", "updated"] as const) {
    if (typeof content[key] !== "string" || content[key].trim() === "") {
      throw new Error(`Guide content "${expectedSlug}" is missing ${key}`);
    }
  }
  for (const key of ["title", "description"] as const) {
    if (
      typeof content.meta?.[key] !== "string" ||
      content.meta[key].trim() === ""
    ) {
      throw new Error(`Guide content "${expectedSlug}" is missing meta.${key}`);
    }
  }
  if (!ISO_DATE.test(content.updated)) {
    throw new Error(
      `Guide content "${expectedSlug}" has updated "${content.updated}", expected YYYY-MM-DD`,
    );
  }
  if (!Array.isArray(content.sections) || content.sections.length === 0) {
    throw new Error(`Guide content "${expectedSlug}" has no sections`);
  }
  for (const section of content.sections) {
    if (typeof section.heading !== "string" || section.heading.trim() === "") {
      throw new Error(`A section of "${expectedSlug}" has no heading`);
    }
    if (section.level !== 2 && section.level !== 3) {
      throw new Error(
        `Section "${section.heading}" of "${expectedSlug}" has level ${section.level}, expected 2 or 3`,
      );
    }
    if (!Array.isArray(section.paragraphs) || section.paragraphs.length === 0) {
      throw new Error(
        `Section "${section.heading}" of "${expectedSlug}" has no paragraphs`,
      );
    }
  }

  return content;
}

/**
 * The hub page's own copy.
 *
 * A separate, smaller shape rather than a `GuideContent` with empty sections:
 * the hub is an index, its body is the card grid, and giving it the guide schema
 * would mean either inventing sections it does not have or loosening the
 * validator that protects the six pages that do.
 */
export interface GuideIndexContent {
  title: string;
  meta: { title: string; description: string };
  lead: string;
  /** Heading above the card grid. */
  listHeading: string;
  /** Closing prose under the grid. Kept short — the cards are the page. */
  closing: readonly string[];
}

export function guideIndexContent(data: unknown): GuideIndexContent {
  const content = data as GuideIndexContent;

  for (const key of ["title", "lead", "listHeading"] as const) {
    if (typeof content?.[key] !== "string" || content[key].trim() === "") {
      throw new Error(`The guides index content is missing ${key}`);
    }
  }
  for (const key of ["title", "description"] as const) {
    if (
      typeof content.meta?.[key] !== "string" ||
      content.meta[key].trim() === ""
    ) {
      throw new Error(`The guides index content is missing meta.${key}`);
    }
  }
  if (!Array.isArray(content.closing) || content.closing.length === 0) {
    throw new Error("The guides index content has no closing paragraphs");
  }

  return content;
}
