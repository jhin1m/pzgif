import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { FaqSection } from "@/components/content/faq-section";
import { RelatedTools } from "@/components/content/related-tools";
import { ToolExplainer } from "@/components/content/tool-explainer";
import { ToolJsonLd } from "@/components/content/tool-json-ld";
import { TrustLine } from "@/components/layout/trust-line";
import rawContent from "@/content/gif-speed-changer.json";
import { toolContent } from "@/lib/tools/content";
import { toolMetadata } from "@/lib/tools/metadata";
import { getRoute } from "@/lib/tools/registry";
import { GifSpeedChangerTool } from "./gif-speed-changer-tool";

/** The speed-changer route. Prose is server-rendered; the tool is the island. */

const SLUG = "gif-speed-changer";
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

export default async function GifSpeedChangerPage({
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
      <GifSpeedChangerTool content={content} trustLine={<TrustLine />}>
        <ToolExplainer sections={content.explainer} />
        <FaqSection heading={content.faqHeading} entries={content.faq} />
        <RelatedTools
          slug={SLUG}
          heading={t("relatedHeading")}
          blurbs={content.related}
        />
      </GifSpeedChangerTool>
    </>
  );
}
