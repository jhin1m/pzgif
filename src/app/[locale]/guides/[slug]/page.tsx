import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { DiscordLimitsTable } from "@/components/content/discord-limits-table";
import { GuideJsonLd } from "@/components/content/guide-json-ld";
import { GuidePage } from "@/components/content/guide-page";
import indexRaw from "@/content/guides.json";
import { guideIndexContent } from "@/lib/content/guide";
import { getGuideContent } from "@/lib/content/guides-content";
import { SITE_URL } from "@/lib/site-config";
import {
  GUIDE_ROUTES,
  getGuide,
  guidePath,
} from "@/lib/tools/registry";

/**
 * Every guide, from one route.
 *
 * ── Why a dynamic segment when every tool page has its own directory ────────
 * A tool page is not a template: each one wires up its own client component,
 * its own control schema and its own pipeline, and the directory per route is
 * what keeps those from being selected by a lookup table. A guide has none of
 * that. It is a title, a date and a run of paragraphs, and six copies of this
 * file differing only in an import would be the shape the content rules exist to
 * forbid — in code rather than in prose, but the same mistake.
 *
 * The prose stays entirely separate, one hand-written file per guide. What is
 * shared here is the chrome, which is exactly the split `LegalPage` already
 * draws across eight pages.
 *
 * ── `dynamicParams = false` is load-bearing ─────────────────────────────────
 * Without it Next prerenders the six listed slugs and then **server-renders any
 * other slug on demand**, which reports as a static route in the build summary
 * while `/guides/anything` is CDN-uncacheable and unbounded. That is precisely
 * what `pnpm check:static` refuses, and it checks the fallback rather than the
 * label for this reason.
 */

export function generateStaticParams() {
  return GUIDE_ROUTES.map((guide) => ({ slug: guide.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const content = getGuideContent(slug);
  if (!content) return {};

  const url = `${SITE_URL}${guidePath(slug)}`;
  return {
    title: content.meta.title,
    description: content.meta.description,
    // Self-referential and absolute. No hreflang while there is one locale —
    // Google's own guidance is that a single-language site does not need it.
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: content.meta.title,
      description: content.meta.description,
    },
  };
}

/**
 * The one guide that renders something the schema cannot express.
 *
 * Kept as a lookup here rather than as a flag in the content file: a `table`
 * key in JSON would be prose describing layout, and it would invite a second
 * key, and then the content files would be a templating language. One entry is
 * an exception; the mechanism for exceptions is the thing worth constraining.
 */
const INSERTS: Readonly<Record<string, React.ReactNode>> = {
  "discord-image-size-limits": <DiscordLimitsTable />,
};

const indexContent = guideIndexContent(indexRaw);

export default async function GuideRoute({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const guide = getGuide(slug);
  const content = getGuideContent(slug);
  // Unreachable with `dynamicParams = false`, and kept anyway: it is what makes
  // the two lookups below safe to read without a non-null assertion.
  if (!guide || !content) notFound();

  return (
    <>
      <GuideJsonLd
        slug={slug}
        name={guide.name}
        guidesLabel={indexContent.title}
      />
      <GuidePage content={content} insert={INSERTS[slug]} />
    </>
  );
}
