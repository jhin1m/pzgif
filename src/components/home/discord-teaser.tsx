import { MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getRoute, isLive } from "@/lib/tools/registry";
import { cn } from "@/lib/utils";

/**
 * The Discord teaser.
 *
 * ── Why it is a teaser and not a link ──────────────────────────────────────
 * The preset cluster is a later ship. Until `gif-for-discord` carries
 * `status: "live"` this block describes what is coming and links nothing —
 * `registry.ts` warns that linking a `planned` route yields a 404, and a 404 on
 * the homepage of a domain whose whole SEO strategy is index age costs more than
 * the click was worth.
 *
 * It flips on its own the moment that route ships. Nothing here needs editing,
 * which is the point: a hand-maintained "coming soon" flag is a thing that stays
 * true for exactly as long as somebody remembers it.
 */

const PRESET_SLUG = "gif-for-discord";

export function DiscordTeaser({
  heading,
  body,
  cta,
  className,
}: {
  heading: string;
  body: string;
  cta: string;
  className?: string;
}) {
  const route = getRoute(PRESET_SLUG);
  const live = route !== undefined && isLive(route);

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-card border border-line bg-surface-1 p-5 md:p-6",
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-control bg-brand-subtle-strong text-brand">
        <MessageCircle aria-hidden="true" className="size-5" />
      </span>
      <h2 className="font-display text-h3 font-medium text-fg">{heading}</h2>
      <p className="max-w-[68ch] text-body text-fg-secondary">{body}</p>

      {live ? (
        <Link
          href={`/${PRESET_SLUG}`}
          className={cn(
            "inline-flex min-h-11 w-fit items-center rounded-control px-5",
            "bg-brand-fill text-body font-semibold text-fg-on-primary shadow-sm",
            "hover:bg-brand-fill-hover",
          )}
        >
          {cta}
        </Link>
      ) : (
        // Not a disabled button. A control that looks operable and is not is
        // worse than a plain statement, and a disabled element is skipped by
        // most screen readers — so the fact that it is unbuilt would reach
        // sighted users only.
        <p className="text-label font-medium text-fg-muted">{cta}</p>
      )}
    </section>
  );
}
