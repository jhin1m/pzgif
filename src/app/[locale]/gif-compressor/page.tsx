import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { FaqSection } from "@/components/content/faq-section";
import { RelatedTools } from "@/components/content/related-tools";
import { ToolExplainer } from "@/components/content/tool-explainer";
import { ToolJsonLd } from "@/components/content/tool-json-ld";
import { TrustLine } from "@/components/layout/trust-line";
import rawContent from "@/content/gif-compressor.json";
import { SITE_URL } from "@/lib/site-config";
import { toolContent } from "@/lib/tools/content";
import { getRoute } from "@/lib/tools/registry";
import { GifCompressorTool } from "./gif-compressor-tool";

/**
 * The GIF compressor route.
 *
 * ── Server here, client only where interaction lives ───────────────────────
 * Everything on this page that a crawler reads — the heading, the explainer, the
 * FAQ answers, the related-tools links, the structured data — is rendered here
 * and prerendered into static HTML. The interactive half is one client component
 * that receives the content as `children` and passes it through untouched. That
 * split is why `pnpm check:static` still passes and why the FAQ is crawlable
 * even though the accordion is a client widget.
 *
 * ── No `dynamic`, no `revalidate`, no header reads ─────────────────────────
 * A single `cookies()` or `headers()` call anywhere in this subtree turns the
 * route dynamic, which costs the CDN cache and fails `check:static`. There is
 * nothing per-request on this page and there never will be: the tool has no
 * account, no session and no server.
 */

const SLUG = "gif-compressor";
const content = toolContent(rawContent, SLUG);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);

  return {
    title: content.meta.title,
    description: content.meta.description,
    // Self-referential, absolute. `localePrefix: "as-needed"` serves English
    // prefix-free, so this URL is the one that must stay stable when locale #2
    // arrives.
    alternates: { canonical: `${SITE_URL}/${SLUG}` },
    openGraph: {
      type: "website",
      url: `${SITE_URL}/${SLUG}`,
      title: content.meta.title,
      description: content.meta.description,
    },
  };
}

export default async function GifCompressorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const route = getRoute(SLUG);
  if (!route) notFound();

  const t = await getTranslations("tool");

  return (
    <>
      <ToolJsonLd
        route={route}
        title={content.meta.title}
        description={content.meta.description}
      />
      <GifCompressorTool content={content} trustLine={<TrustLine />}>
        <ToolExplainer sections={content.explainer} />
        <FaqSection heading={content.faqHeading} entries={content.faq} />
        <RelatedTools
          slug={SLUG}
          heading={t("relatedHeading")}
          blurbs={content.related}
        />
      </GifCompressorTool>
    </>
  );
}
