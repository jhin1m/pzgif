import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { FaqSection } from "@/components/content/faq-section";
import { RelatedTools } from "@/components/content/related-tools";
import { ToolExplainer } from "@/components/content/tool-explainer";
import { ToolJsonLd } from "@/components/content/tool-json-ld";
import { TrustLine } from "@/components/layout/trust-line";
import rawContent from "@/content/gif-to-mp4.json";
import { toolContent } from "@/lib/tools/content";
import { toolMetadata } from "@/lib/tools/metadata";
import { getRoute } from "@/lib/tools/registry";
import { GifToMp4Tool } from "./gif-to-mp4-tool";

/**
 * The gif-to-mp4 route. Same server/client split as every tool page: the
 * heading, the explainer, the FAQ answers and the JSON-LD are prerendered here
 * and the interactive half takes them as `children` untouched.
 */

const SLUG = "gif-to-mp4";
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

export default async function GifToMp4Page({
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
      <GifToMp4Tool content={content} trustLine={<TrustLine />}>
        <ToolExplainer sections={content.explainer} />
        <FaqSection heading={content.faqHeading} entries={content.faq} />
        <RelatedTools
          slug={SLUG}
          heading={t("relatedHeading")}
          blurbs={content.related}
        />
      </GifToMp4Tool>
    </>
  );
}
