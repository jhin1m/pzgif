import { Link } from "@/i18n/navigation";
import { relatedLiveRoutes } from "@/lib/tools/registry";
import { cn } from "@/lib/utils";

/**
 * The "what next?" row inside a finished result panel.
 *
 * ── Why this is a row of chips and not the related-tools grid ───────────────
 * `RelatedTools` sits at the foot of the page and is written for a reader who
 * is still deciding. This is for someone holding a finished file, and the only
 * question they have is whether one more operation is worth another click. It
 * carries the tool's name and nothing else — the blurb that helps a browsing
 * reader is noise to a reader who is done.
 *
 * ── Why it filters, and why it disappears under two ────────────────────────
 * `relatedLiveRoutes()` rather than `relatedRoutes()`: the registry describes
 * more routes than this deployment serves, and a `planned` slug linked here is a
 * 404 offered at the moment the visitor trusts the page most. Under two live
 * routes the row renders nothing at all — one lonely chip after a divider reads
 * as a broken list rather than as a choice.
 *
 * ── And why it stops at two ────────────────────────────────────────────────
 * Two reasons that happen to agree. Three chips is a menu and two is a
 * suggestion, and this is not the surface for a menu — the related-tools grid at
 * the foot of the page already is one. The second reason is measured: this row
 * is inside a panel whose height has to be reserved before any of it exists, and
 * at 375px a third chip wraps to a third 44px line. An unbounded row would make
 * the reservation depend on which tool the visitor is on, and the reservation is
 * one constant for all five.
 *
 * The order is the content author's, from `registry.ts`'s `related` array, so
 * "the first two" is a decision that was already made deliberately.
 *
 * ── Why it lives here and not in `result-panel.tsx` ────────────────────────
 * `ResultPanel` and `ResultSummary` take rendered values and children; they own
 * no routing and reach into no registry. Keeping the one part that does need
 * both in its own file is what lets the panel stay a pure presentational module
 * — renderable in the state gallery, and in a test, with no locale context to
 * stand up first.
 */

export function NextTools({
  slug,
  label,
  className,
}: {
  slug: string;
  /** "Next?" — generic chrome, so it comes from the message catalogue. */
  label: string;
  className?: string;
}) {
  const routes = relatedLiveRoutes(slug).slice(0, 2);
  if (routes.length < 2) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2.5 border-t border-line pt-4",
        className,
      )}
    >
      <span className="text-label font-semibold text-fg-secondary">{label}</span>
      {routes.map((route) => (
        <Link
          key={route.slug}
          href={`/${route.slug}`}
          className={cn(
            // 44px minimum, because this row is the most likely thing a thumb
            // reaches for on the screen where the job just finished.
            "inline-flex min-h-11 items-center rounded-pill border border-line bg-surface-1 px-4",
            "text-label font-medium text-fg",
            "transition-colors duration-[120ms] ease-out",
            "hover:border-brand hover:bg-brand-subtle",
          )}
        >
          {route.name}
        </Link>
      ))}
    </div>
  );
}
