import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { GuideContent } from "@/lib/content/guide";
import {
  GUIDES_BASE_PATH,
  guidePath,
  guideToolRoutes,
  otherGuides,
} from "@/lib/tools/registry";
import { cn } from "@/lib/utils";
import { InlineCopy } from "./inline-copy";
import { ToolExplainer } from "./tool-explainer";

/**
 * The one renderer behind every guide.
 *
 * ── Why it reuses `ToolExplainer` for the body ──────────────────────────────
 * Not to save code. `ToolExplainer` is where the in-content ad law from
 * `design-guidelines.md` §8.1 lives — one unit, after roughly 150 words, always
 * on a heading boundary, suppressed entirely on a page too short to have earned
 * it. Guides are the pages an ad network is being shown as evidence that this
 * site has content on it, so they carry ads exactly like a tool page does, and
 * duplicating that placement rule here is how the two would drift apart.
 *
 * The legal pages deliberately do the opposite and carry no ad at all. The
 * difference is not inconsistency: a guide is content, and a Privacy Policy is
 * the page a reviewer opens to check that the content pages have not put an ad
 * inside a Privacy Policy.
 *
 * ── Why the outbound links are here and not in the prose ────────────────────
 * `inline-copy.tsx` permits `**bold**` and nothing else, so a content file
 * cannot emit a link even if it wanted to. That constraint is load-bearing in
 * both directions: prose cannot rot into a link farm, and every internal link on
 * the page comes from the registry, which means it cannot point at a route that
 * does not exist.
 *
 * ── Server only ─────────────────────────────────────────────────────────────
 * No state, no interaction. `pnpm check:static` fails the build if any of these
 * routes stops being statically prerenderable.
 */
export async function GuidePage({
  content,
  insert,
}: {
  content: GuideContent;
  /**
   * A block rendered between the lead and the body.
   *
   * One guide needs it: the Discord limits table, which is generated from the
   * preset config so it cannot drift from what the tools encode. Passing it as a
   * slot keeps that one exception out of the content schema — a `table: true`
   * flag in a JSON file would invite a second flag, and then the content files
   * would be describing layout.
   */
  insert?: React.ReactNode;
}) {
  const t = await getTranslations("guides");
  const tools = guideToolRoutes(content.slug);
  const more = otherGuides(content.slug);

  return (
    <main id="main" className="mx-auto max-w-[68ch] px-4 py-12 sm:px-6">
      {/* A real nav landmark rather than a decorative chevron string: it is the
          same hierarchy the BreadcrumbList declares to a crawler, and a reader
          who arrived from a search result has no other way back up. */}
      <nav aria-label={t("backToGuides")} className="mb-6">
        <Link
          href={GUIDES_BASE_PATH}
          className="text-caption text-fg-muted no-underline hover:text-brand hover:underline hover:underline-offset-2"
        >
          ← {t("backToGuides")}
        </Link>
      </nav>

      <h1 className="font-display text-h1 font-bold text-fg">
        {content.title}
      </h1>

      <p className="mt-4 text-lead leading-relaxed text-fg-secondary">
        <InlineCopy text={content.lead} />
      </p>

      <p className="mt-6 border-b border-line pb-6 text-caption text-fg-muted">
        {t("updated")}{" "}
        <time dateTime={content.updated} className="tabular">
          {content.updated}
        </time>
      </p>

      {insert}

      <ToolExplainer sections={content.sections} className="mt-2" />

      {tools.length > 0 ? (
        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-display text-h3 font-medium text-fg">
            {t("toolsHeading")}
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {tools.map((route) => (
              <li key={route.slug}>
                <Link
                  href={`/${route.slug}`}
                  className={cn(
                    "inline-flex rounded-card border border-line bg-surface-1 px-3 py-2",
                    "text-sm text-fg-secondary no-underline",
                    "transition-colors duration-[120ms] ease-out",
                    "hover:border-brand hover:bg-brand-subtle hover:text-fg",
                  )}
                >
                  {route.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {more.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-h3 font-medium text-fg">
            {t("moreHeading")}
          </h2>
          <ul className="mt-4 grid gap-2">
            {more.map((guide) => (
              <li key={guide.slug}>
                <Link
                  href={guidePath(guide.slug)}
                  className="text-body text-brand no-underline hover:underline hover:underline-offset-2"
                >
                  {guide.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
