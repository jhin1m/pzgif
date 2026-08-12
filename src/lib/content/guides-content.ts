import discordImageSizeLimits from "@/content/guides/discord-image-size-limits.json";
import gifFrameRateLimits from "@/content/guides/gif-frame-rate-limits.json";
import gifVsMp4VsWebp from "@/content/guides/gif-vs-mp4-vs-webp.json";
import sharpDiscordEmoji from "@/content/guides/sharp-discord-emoji.json";
import whatHappensToYourFile from "@/content/guides/what-happens-to-your-file.json";
import whyIsMyGifSoBig from "@/content/guides/why-is-my-gif-so-big.json";
import { GUIDE_ROUTES } from "@/lib/tools/registry";
import { guideContent, type GuideContent } from "./guide";

/**
 * Every guide's copy, validated, keyed by slug.
 *
 * ── Why a static import per file ────────────────────────────────────────────
 * There is no filesystem here. These modules are prerendered by a bundler, so a
 * directory read is not merely slow, it is unavailable — the same reason
 * `sitemap.ts` enumerates the legal pages by hand. The `guide.test.ts` no-orphan
 * check is what stops this list and the directory silently disagreeing, because
 * that check runs in Node where a directory read *is* available.
 *
 * ── Why it is resolved once, here ───────────────────────────────────────────
 * Four consumers need it: the hub (for the card summaries), the guide route (for
 * the body), the sitemap (for `lastModified`), and the tests. Repeating the
 * import block in each is how one of them ends up missing a guide — and the one
 * that would miss it is the sitemap, silently, which is the only consumer whose
 * omission nobody would ever see.
 *
 * Validation runs at module scope, so a content file that lost a key is a build
 * failure rather than a published page with a headline and no body.
 */
/**
 * The imported modules, before validation. Keyed by the filename's slug.
 *
 * Declared above the map that consumes it, and not merely as a style choice:
 * `GUIDE_CONTENT` is built at module scope, so a `const` defined below it would
 * be in the temporal dead zone when it is read and the module would throw on
 * import.
 */
const RAW: Readonly<Record<string, unknown>> = {
  "discord-image-size-limits": discordImageSizeLimits,
  "gif-frame-rate-limits": gifFrameRateLimits,
  "gif-vs-mp4-vs-webp": gifVsMp4VsWebp,
  "sharp-discord-emoji": sharpDiscordEmoji,
  "what-happens-to-your-file": whatHappensToYourFile,
  "why-is-my-gif-so-big": whyIsMyGifSoBig,
};

export const GUIDE_CONTENT: Readonly<Record<string, GuideContent>> =
  Object.fromEntries(
    GUIDE_ROUTES.map((guide) => {
      const raw = RAW[guide.slug];
      if (!raw) {
        throw new Error(
          `No content file is wired up for the guide "${guide.slug}"`,
        );
      }
      return [guide.slug, guideContent(raw, guide.slug)];
    }),
  );

export function getGuideContent(slug: string): GuideContent | undefined {
  return GUIDE_CONTENT[slug];
}
