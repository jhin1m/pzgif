import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { InlineCopy } from "@/components/content/inline-copy";
import { Link } from "@/i18n/navigation";
import raw from "@/content/guides.json";
import { guideIndexContent } from "@/lib/content/guide";
import { GUIDE_CONTENT } from "@/lib/content/guides-content";
import { SITE_URL } from "@/lib/site-config";
import { GUIDES_BASE_PATH, GUIDE_ROUTES, guidePath } from "@/lib/tools/registry";
import { cn } from "@/lib/utils";

/**
 * The guides hub.
 *
 * ── Why the card sentences come from the guides themselves ──────────────────
 * A card needs one sentence about the page it links to, and that sentence has to
 * come from that page's own content file rather than be written a second time
 * here. Two descriptions of the same guide drift, and the drifted one is always
 * the one on the index, because the index is the page nobody re-reads. The
 * summary field exists for exactly this and is not the meta description reused:
 * a description is written to win a click from a stranger, a summary to help
 * someone already here choose between six.
 */

const content = guideIndexContent(raw);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);

  const url = `${SITE_URL}${GUIDES_BASE_PATH}`;
  return {
    title: content.meta.title,
    description: content.meta.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: content.meta.title,
      description: content.meta.description,
    },
  };
}

export default async function GuidesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main id="main" className="mx-auto max-w-[68ch] px-4 py-12 sm:px-6">
      <h1 className="font-display text-h1 font-bold text-fg">
        {content.title}
      </h1>

      <p className="mt-4 text-lead leading-relaxed text-fg-secondary">
        <InlineCopy text={content.lead} />
      </p>

      <h2 className="mt-10 font-display text-h2 font-bold text-fg">
        {content.listHeading}
      </h2>

      <ul className="mt-5 grid gap-3">
        {GUIDE_ROUTES.map((guide) => (
          <li key={guide.slug}>
            <Link
              href={guidePath(guide.slug)}
              className={cn(
                "flex flex-col gap-1.5 rounded-card border border-line bg-surface-1 p-4",
                "no-underline shadow-sm transition-colors duration-[120ms] ease-out",
                "hover:border-brand hover:bg-brand-subtle",
              )}
            >
              <span className="font-display text-h4 font-medium text-fg">
                {guide.name}
              </span>
              <span className="text-sm text-fg-muted">
                {GUIDE_CONTENT[guide.slug].summary}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {content.closing.map((paragraph, index) => (
        <p
          key={index}
          className="mt-6 text-body leading-relaxed text-fg-secondary"
        >
          <InlineCopy text={paragraph} />
        </p>
      ))}
    </main>
  );
}
