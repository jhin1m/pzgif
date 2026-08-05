import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { FaqSection } from "@/components/content/faq-section";
import { RelatedTools } from "@/components/content/related-tools";
import { ToolExplainer } from "@/components/content/tool-explainer";
import { ToolJsonLd } from "@/components/content/tool-json-ld";
import { TrustLine } from "@/components/layout/trust-line";
import rawContent from "@/content/resize-gif.json";
import { toolContent } from "@/lib/tools/content";
import { toolMetadata } from "@/lib/tools/metadata";
import { getRoute } from "@/lib/tools/registry";
import { ResizeGifTool } from "./resize-gif-tool";

/**
 * The resize route.
 *
 * Same server/client split as every tool page: the heading, the explainer, the
 * FAQ answers and the JSON-LD are rendered here and prerendered into static
 * HTML, and the interactive half is one client component that takes them as
 * `children` and passes them through untouched. Nothing in this subtree reads
 * cookies or headers, so the route stays statically prerendered and
 * `pnpm check:static` keeps passing.
 */

const SLUG = "resize-gif";
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

export default async function ResizeGifPage({
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
      <ResizeGifTool content={content} trustLine={<TrustLine />}>
        <ToolExplainer sections={content.explainer} />
        <FaqSection heading={content.faqHeading} entries={content.faq} />
        <RelatedTools
          slug={SLUG}
          heading={t("relatedHeading")}
          blurbs={content.related}
        />
      </ResizeGifTool>
    </>
  );
}
