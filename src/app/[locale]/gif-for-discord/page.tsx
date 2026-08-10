import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { FaqSection } from "@/components/content/faq-section";
import { RelatedTools } from "@/components/content/related-tools";
import { ToolExplainer } from "@/components/content/tool-explainer";
import { ToolJsonLd } from "@/components/content/tool-json-ld";
import { TrustLine } from "@/components/layout/trust-line";
import { DiscordWorkbench } from "@/components/tool/discord-workbench";
import rawContent from "@/content/gif-for-discord.json";
import { toolContent } from "@/lib/tools/content";
import { toolMetadata } from "@/lib/tools/metadata";
import { getRoute } from "@/lib/tools/registry";

/**
 * The Discord hub — the one route in the cluster that renders the chip
 * picker, because it is the one whose visitor has not yet decided which surface
 * they are uploading to.
 *
 * Same server/client split as every other route here: the heading, the
 * explainer, the FAQ answers and the JSON-LD are prerendered on the server and
 * the interactive half takes them as `children` untouched. The only thing that
 * differs between the five preset routes is the `preset` prop, the copy file,
 * and whether the picker is shown — everything else is the shared component.
 */

const SLUG = "gif-for-discord";
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

export default async function GifForDiscordPage({
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
      <DiscordWorkbench
        slug={SLUG}
        content={content}
        trustLine={<TrustLine />}
        preset="emoji"
        showPicker
      >
        <ToolExplainer sections={content.explainer} />
        <FaqSection heading={content.faqHeading} entries={content.faq} />
        <RelatedTools
          slug={SLUG}
          heading={t("relatedHeading")}
          blurbs={content.related}
        />
      </DiscordWorkbench>
    </>
  );
}
