import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AdSlot } from "@/components/ads/ad-slot";
import { DiscordTeaser } from "@/components/home/discord-teaser";
import { HomeHero } from "@/components/home/home-hero";
import { ToolGrid } from "@/components/home/tool-grid";
import { WhyPzgif } from "@/components/home/why-pzgif";
import { TrustLine } from "@/components/layout/trust-line";
import rawContent from "@/content/home.json";
import { homeContent } from "@/lib/content/home";
import { SITE_URL } from "@/lib/site-config";

/**
 * The homepage.
 *
 * ── Server shell, one client island ────────────────────────────────────────
 * Everything a crawler reads — the grid, the three reasons, the teaser — is
 * rendered here and prerendered into static HTML. Only the hero hydrates,
 * because only the hero has to respond to a file. `setRequestLocale()` is what
 * keeps this route static; a `cookies()` or `headers()` call anywhere in the
 * subtree would turn it dynamic and fail `pnpm check:static`.
 *
 * ── What is deliberately absent ────────────────────────────────────────────
 * No worker boot, no WASM prefetch, no `capability.ts` call, and no ad slot
 * above the dropzone. The first two are the landing page's performance budget:
 * the engine belongs to the tool pages, and reading 4096 bytes of a dropped file
 * is the whole of this page's client-side work. The third is §8.1, which is
 * binding — the dropzone is the page, and nothing sells against it.
 *
 * There is also no auto-playing demo. §7.4 and §6 both forbid a preview that
 * loops without being asked, and the honest version of "watch how fast this is"
 * is letting the visitor drop their own file.
 */

const content = homeContent(rawContent);

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
    // `localePrefix: "as-needed"` serves English prefix-free, so the bare origin
    // is the canonical homepage and stays so when locale #2 arrives.
    alternates: { canonical: SITE_URL },
    openGraph: {
      type: "website",
      url: SITE_URL,
      title: content.meta.title,
      description: content.meta.description,
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main id="main" className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
      <HomeHero content={content} />
      <TrustLine className="mt-5" />

      <ToolGrid
        className="mt-14"
        heading={content.grid.heading}
        subhead={content.grid.subhead}
      />

      {/* §8.1: the first slot on this page sits below the grid — never above the
          dropzone — reserved from first paint and unfilled until Phase 10. */}
      <AdSlot variant="rect" name="home-rect" />

      <WhyPzgif className="mt-14" tiles={content.why} />

      <DiscordTeaser
        className="mt-14"
        heading={content.discord.heading}
        body={content.discord.body}
        cta={content.discord.cta}
      />
    </main>
  );
}
