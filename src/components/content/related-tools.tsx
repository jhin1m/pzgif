import { Link } from "@/i18n/navigation";
import { relatedLiveRoutes } from "@/lib/tools/registry";
import { cn } from "@/lib/utils";

/**
 * The "related tools" grid at the foot of a tool page.
 *
 * ── Why it filters on `status` ──────────────────────────────────────────────
 * The plan ships in five stages, so for most of the build the registry describes
 * more routes than exist. An internal link to an unbuilt page is a 404 served to
 * a crawler on a domain whose entire strategy is index age — the one thing a new
 * site cannot afford to spend. `relatedLiveRoutes()` is the filter; the block
 * renders nothing at all rather than rendering a dead link.
 *
 * ── Why the blurbs come from the page, not the registry ─────────────────────
 * `registry.ts` owns structure and never prose. The sentence under "Resize GIF"
 * is written for the reader of *this* page — someone who has just compressed
 * something — and it is a different sentence on the crop page. Keying them by
 * slug rather than by position means a registry reordering cannot silently
 * attach the wrong sentence to the wrong tool.
 */

export function RelatedTools({
  slug,
  heading,
  blurbs,
  className,
}: {
  slug: string;
  heading: string;
  /** Slug → hand-written sentence. A slug with no blurb is not rendered. */
  blurbs: Readonly<Record<string, string>>;
  className?: string;
}) {
  const routes = relatedLiveRoutes(slug).filter((route) => blurbs[route.slug]);
  if (routes.length === 0) return null;

  return (
    <section className={className}>
      <h2 className="font-display text-h2 font-bold text-fg">{heading}</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {routes.map((route) => (
          <li key={route.slug}>
            <Link
              href={`/${route.slug}`}
              className={cn(
                "flex h-full flex-col gap-1.5 rounded-card border border-line bg-surface-1 p-4",
                "shadow-sm transition-colors duration-[120ms] ease-out",
                "hover:border-brand hover:bg-brand-subtle",
              )}
            >
              <span className="font-display text-h4 font-medium text-fg">
                {route.name}
              </span>
              <span className="text-sm text-fg-muted">{blurbs[route.slug]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
