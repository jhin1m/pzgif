import cropGif from "@/content/crop-gif.json";
import discordAvatarGif from "@/content/discord-avatar-gif.json";
import discordBannerGif from "@/content/discord-banner-gif.json";
import discordEmojiGif from "@/content/discord-emoji-gif.json";
import discordStickerGif from "@/content/discord-sticker-gif.json";
import gifCompressor from "@/content/gif-compressor.json";
import gifForDiscord from "@/content/gif-for-discord.json";
import gifSpeedChanger from "@/content/gif-speed-changer.json";
import gifToMp4 from "@/content/gif-to-mp4.json";
import mp4ToGif from "@/content/mp4-to-gif.json";
import resizeGif from "@/content/resize-gif.json";
import reverseGif from "@/content/reverse-gif.json";
import splitGifToFrames from "@/content/split-gif-to-frames.json";
import webpToGif from "@/content/webp-to-gif.json";
import { liveRoutes } from "./registry";

/**
 * Each tool page's real content date, keyed by slug.
 *
 * ── Why this module exists at all ───────────────────────────────────────────
 * Only the sitemap needs it, and putting fourteen imports at the top of
 * `sitemap.ts` would bury the one thing that file is supposed to make legible —
 * which URLs are advertised to a crawler and why. Same reasoning as
 * `guides-content.ts`: the import block is the part that rots, so it gets a
 * module whose only job is being audited against the route list.
 *
 * A static import per file rather than a directory read, because this runs
 * inside a bundler with no filesystem.
 *
 * ── The throw is the point ──────────────────────────────────────────────────
 * A live route with no date here would silently emit a sitemap entry with no
 * `lastModified`. That is not visibly broken, which is exactly why it has to
 * fail the build instead: the next tool to ship would join the sitemap dateless
 * and nobody would notice for months.
 */
const RAW: Readonly<Record<string, { updated?: string }>> = {
  "crop-gif": cropGif,
  "discord-avatar-gif": discordAvatarGif,
  "discord-banner-gif": discordBannerGif,
  "discord-emoji-gif": discordEmojiGif,
  "discord-sticker-gif": discordStickerGif,
  "gif-compressor": gifCompressor,
  "gif-for-discord": gifForDiscord,
  "gif-speed-changer": gifSpeedChanger,
  "gif-to-mp4": gifToMp4,
  "mp4-to-gif": mp4ToGif,
  "resize-gif": resizeGif,
  "reverse-gif": reverseGif,
  "split-gif-to-frames": splitGifToFrames,
  "webp-to-gif": webpToGif,
};

export const TOOL_UPDATED: Readonly<Record<string, string>> =
  Object.fromEntries(
    liveRoutes().map((route) => {
      const updated = RAW[route.slug]?.updated;
      if (!updated) {
        throw new Error(
          `The live route "${route.slug}" has no content date. Add "updated" to src/content/${route.slug}.json.`,
        );
      }
      return [route.slug, updated];
    }),
  );
