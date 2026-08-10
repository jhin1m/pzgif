import compressor from "@/content/gif-compressor.json";
import crop from "@/content/crop-gif.json";
import resize from "@/content/resize-gif.json";
import reverse from "@/content/reverse-gif.json";
import gifToMp4 from "@/content/gif-to-mp4.json";
import mp4ToGif from "@/content/mp4-to-gif.json";
import speed from "@/content/gif-speed-changer.json";
import splitFrames from "@/content/split-gif-to-frames.json";
import webpToGif from "@/content/webp-to-gif.json";
import { toolIcon } from "@/components/home/tool-icons";
import { Link } from "@/i18n/navigation";
import { toolContent } from "@/lib/tools/content";
import { liveRoutes } from "@/lib/tools/registry";
import { cn } from "@/lib/utils";

/**
 * The tool grid — the homepage's index of what actually exists.
 *
 * ── It renders `liveRoutes()`, and that is a copy decision as much as a
 *    structural one ────────────────────────────────────────────────────────
 * The registry describes fourteen routes and this deployment serves nine. A card
 * linking a `planned` slug is a 404 handed to the crawler on the one page it
 * crawls first. The grid therefore grows on its own as tools ship, which is also
 * why the sub-head above it states no number — a heading built around "nine
 * tools" needs rewriting every ship, and the version nobody rewrites is the one
 * that ships a lie.
 *
 * ── Where each half of a card comes from ───────────────────────────────────
 * The name is structure and comes from `registry.ts`. The reason to click is
 * prose and comes from that tool's own content file. The split is the same one
 * the whole content strategy rests on: one line per tool, hand-written, never a
 * template with the noun swapped — `tool-copy.test.ts` asserts the real lines do
 * not share a vocabulary.
 *
 * A live route with no content file throws here rather than rendering a card
 * with an empty line under it. The grid is prerendered, so that is a build
 * failure and not a blank card in front of a visitor.
 */

const CONTENT = [
  compressor,
  resize,
  crop,
  speed,
  reverse,
  mp4ToGif,
  gifToMp4,
  splitFrames,
  webpToGif,
].map((data) =>
  toolContent(data, (data as { slug: string }).slug),
);

const BENEFITS = new Map(CONTENT.map((page) => [page.slug, page.card.benefit]));

export function ToolGrid({
  heading,
  subhead,
  className,
}: {
  heading: string;
  subhead: string;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="font-display text-h2 font-bold text-fg">{heading}</h2>
      <p className="mt-2 max-w-[68ch] text-body text-fg-secondary">{subhead}</p>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {liveRoutes().map((route) => {
          const benefit = BENEFITS.get(route.slug);
          if (!benefit) {
            throw new Error(
              `Live route "${route.slug}" has no card benefit. Write one in src/content/${route.slug}.json.`,
            );
          }
          const Icon = toolIcon(route.slug);

          return (
            <li key={route.slug}>
              <Link
                href={`/${route.slug}`}
                className={cn(
                  "flex h-full flex-col gap-2 rounded-card border border-line bg-surface-1 p-5",
                  "shadow-sm transition-colors duration-[120ms] ease-out",
                  "hover:border-brand hover:bg-brand-subtle",
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-control bg-brand-subtle-strong text-brand">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="font-display text-h4 font-medium text-fg">
                  {route.name}
                </span>
                <span className="text-sm text-fg-muted">{benefit}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
