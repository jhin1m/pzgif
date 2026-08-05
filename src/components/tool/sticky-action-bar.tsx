"use client";

import { cn } from "@/lib/utils";

/**
 * StickyActionBar — docs/design-guidelines.md §9 (base breakpoint) and §4.4.
 *
 * Below `md`, the single primary action leaves the flow and pins to the bottom
 * once a file is loaded: 64px, `--surface-raised`, a 1px top border and an
 * upward shadow, at `--z-action-bar` (20) so it clears the header but stays
 * under popovers. At `md` and up it retires and the button returns inline. The
 * retirement is `display: none` rather than a media-query hook: that keeps the
 * bar out of the desktop tab order without a client-side width check, which
 * would either mismatch on hydration or render the wrong thing on first paint.
 *
 * While it is up it claims the bottom of the viewport, so the anchor ad and the
 * consent bar must stand down (§8.1, §9). That exclusion is declared on
 * `BottomBarProvider` by whichever page renders this bar, in the same render
 * pass — **a page that renders this component must pass
 * `actionBarVisible` to the provider.** It is not registered from an effect
 * here, because doing so would unmount a reserved ad slot after hydration.
 */

export interface StickyActionBarProps {
  /** Usually a `<Button size="xl">`. Only one primary per viewport (§5.1). */
  children: React.ReactNode;
  /** Small secondary line, e.g. "loop-final.gif · 2.4 MB". */
  meta?: React.ReactNode;
  className?: string;
  /**
   * Renders the bar at every width, in flow. For `/dev/states` only: the bar is
   * mobile-only, and a desktop screenshot of the gallery would otherwise show an
   * empty slot where a documented component should be.
   */
  alwaysVisible?: boolean;
}

export function StickyActionBar({
  children,
  meta,
  className,
  alwaysVisible = false,
}: StickyActionBarProps) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-[var(--z-action-bar)] flex min-h-16 items-center gap-3",
        alwaysVisible ? "static" : "md:hidden",
        "border-t border-line bg-surface-raised px-4 pt-2",
        "pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
        "shadow-[var(--shadow-bar)]",
        className,
      )}
    >
      {meta ? (
        <div className="min-w-0 text-caption leading-tight text-fg-muted">
          {meta}
        </div>
      ) : null}
      <div className="ms-auto flex min-w-0 flex-1 items-center justify-end">
        {children}
      </div>
    </div>
  );
}
