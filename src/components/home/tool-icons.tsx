import {
  Crop,
  Film,
  FileVideo,
  Gauge,
  Images,
  LayoutGrid,
  MessageCircle,
  Minimize2,
  Rewind,
  Scaling,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon per route, in one place.
 *
 * ── Why a lookup and not a field on the registry ───────────────────────────
 * `registry.ts` owns structure — slugs, formats, relationships — and is imported
 * by the sitemap and the footer, neither of which renders an icon. Putting a
 * React component in there would drag `lucide-react` into every consumer of the
 * route table.
 *
 * ── Why a missing icon fails the build ─────────────────────────────────────
 * The grid is server-rendered at build time by `generateStaticParams`, so this
 * throw happens during `pnpm build` rather than in front of a visitor. A card
 * with a blank square where its icon should be is the kind of defect that ships
 * — it looks like a loading state — so a new route without an icon stops the
 * build instead.
 *
 * The icons are a deliberately plain set, and they are meant to be replaced.
 * Bespoke iconography is out of scope for this pass; what is in scope is that
 * every card has *an* icon and that the mapping is one file to edit when a
 * designer replaces them.
 *
 * The five Discord routes share one glyph on purpose — they are one cluster
 * distinguished by their names and their dimensions, not by five near-identical
 * chat bubbles. The nine tools each have their own.
 */

const ICONS: Record<string, LucideIcon> = {
  "gif-compressor": Minimize2,
  "resize-gif": Scaling,
  "crop-gif": Crop,
  "gif-speed-changer": Gauge,
  "reverse-gif": Rewind,
  "mp4-to-gif": FileVideo,
  "gif-to-mp4": Film,
  "webp-to-gif": Images,
  "split-gif-to-frames": LayoutGrid,
  "gif-for-discord": MessageCircle,
  "discord-emoji-gif": MessageCircle,
  "discord-sticker-gif": MessageCircle,
  "discord-banner-gif": MessageCircle,
  "discord-avatar-gif": MessageCircle,
};

export function toolIcon(slug: string): LucideIcon {
  const icon = ICONS[slug];
  if (!icon) {
    throw new Error(
      `No icon mapped for route "${slug}". Add one to src/components/home/tool-icons.tsx.`,
    );
  }
  return icon;
}
