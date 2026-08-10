import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { FaqSection } from "@/components/content/faq-section";
import { RelatedTools } from "@/components/content/related-tools";
import { ToolExplainer } from "@/components/content/tool-explainer";
import { ToolJsonLd } from "@/components/content/tool-json-ld";
import { TrustLine } from "@/components/layout/trust-line";
import rawContent from "@/content/mp4-to-gif.json";
import { toolContent } from "@/lib/tools/content";
import { toolMetadata } from "@/lib/tools/metadata";
import { getRoute } from "@/lib/tools/registry";
import { Mp4ToGifTool } from "./mp4-to-gif-tool";

/**
 * The MP4-to-GIF route.
 *
 * Same server/client split as every tool page. The one thing that is *not*
 * decided here is whether this device can run the tool at all: that answer needs
 * a device, this half has none, and guessing it would make the prerendered HTML
 * disagree with the client's. The client component asks after hydration and
 * swaps the intake box, which is fixed-height so nothing moves.
 */

const SLUG = "mp4-to-gif";
const content = toolContent(rawContent, SLUG);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  return toolMetadata(content);
}

export default async function Mp4ToGifPage({
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
      <Mp4ToGifTool content={content} trustLine={<TrustLine />}>
        <ToolExplainer sections={content.explainer} />
        <FaqSection heading={content.faqHeading} entries={content.faq} />
        <RelatedTools
          slug={SLUG}
          heading={t("relatedHeading")}
          blurbs={content.related}
        />
      </Mp4ToGifTool>
    </>
  );
}
