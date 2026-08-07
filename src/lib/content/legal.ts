import type { ExplainerSection } from "@/lib/tools/content";

/**
 * The shape of a legal or trust page's hand-written copy.
 *
 * ── Same boundary the tool and homepage schemas draw ────────────────────────
 * `src/content/` is `LICENSE-CONTENT` (all rights reserved) while the repository
 * is AGPL-3.0. Schema is code and lives here; prose is data and lives there.
 *
 * ── Why the section type is imported rather than redeclared ─────────────────
 * A clause in the Terms and a paragraph run in a tool explainer are the same
 * shape — a heading, an outline level, and paragraphs with `**bold**` as the
 * only inline markup — so they share one type and one renderer. Two copies of a
 * structurally identical interface drift, and the drift shows up as a page that
 * renders its headings at the wrong outline level.
 *
 * ── Why `legalContent()` validates rather than casts ────────────────────────
 * `toolContent()` only checks the slug, because a tool page that lost its
 * `controls` key fails loudly the moment the tool renders. A legal page has no
 * interactive half: a missing `sections` key renders a heading, a lead and
 * nothing else, and a Privacy Policy that silently lost its body is worse than
 * one that was never written — it looks complete to the operator and reads as
 * empty to a regulator. So every field is checked, at module scope in each
 * route, which makes a malformed file a build failure.
 */
export interface LegalContent {
  /** Must match the filename and the route segment. */
  slug: string;
  /** The page `h1`. Not the `<title>` — see `meta`. */
  title: string;
  /**
   * The `<title>` and meta description.
   *
   * Separate from `title` for the same reason the tool pages separate them: the
   * `h1` is written for someone already on the page, the `<title>` for someone
   * choosing between ten results. "Privacy Policy" is the right heading and a
   * wasteful title.
   */
  meta: { title: string; description: string };
  /**
   * ISO `YYYY-MM-DD`, the date this page's text last changed.
   *
   * This is the sitemap's `lastModified` for the route. It lives with the prose
   * because a `lastModified` of "now" on every URL at every build is a negative
   * quality signal — it tells a crawler the site changed and gives it nothing
   * changed to find.
   */
  updated: string;
  /** The paragraph under the `h1`, before the first heading. */
  lead: string;
  sections: readonly ExplainerSection[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Adopts an imported `.json` file as a `LegalContent`, or throws.
 *
 * The cast is unavoidable — TypeScript widens `"level": 2` in a JSON module to
 * `number`, so the literal union cannot survive the import. Everything the cast
 * gives up is checked here instead.
 */
export function legalContent(
  data: unknown,
  expectedSlug: string,
): LegalContent {
  const content = data as LegalContent;

  if (!content || typeof content !== "object") {
    throw new Error(`Legal content for "${expectedSlug}" is not an object`);
  }
  if (content.slug !== expectedSlug) {
    throw new Error(
      `Content slug "${content.slug}" does not match the route "${expectedSlug}"`,
    );
  }
  for (const key of ["title", "lead", "updated"] as const) {
    if (typeof content[key] !== "string" || content[key].trim() === "") {
      throw new Error(`Legal content "${expectedSlug}" is missing ${key}`);
    }
  }
  for (const key of ["title", "description"] as const) {
    if (
      typeof content.meta?.[key] !== "string" ||
      content.meta[key].trim() === ""
    ) {
      throw new Error(`Legal content "${expectedSlug}" is missing meta.${key}`);
    }
  }
  if (!ISO_DATE.test(content.updated)) {
    throw new Error(
      `Legal content "${expectedSlug}" has updated "${content.updated}", expected YYYY-MM-DD`,
    );
  }
  if (!Array.isArray(content.sections) || content.sections.length === 0) {
    throw new Error(`Legal content "${expectedSlug}" has no sections`);
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
