"use client";

import { AdSlot } from "@/components/ads/ad-slot";
import { BottomBarProvider } from "@/components/tool/action-bar-context";
import { ToolShell } from "@/components/tool/tool-shell";

/**
 * The frame every tool page is assembled into.
 *
 * ── Composition, not a template engine ─────────────────────────────────────
 * This owns chrome and nothing else: the heading pair, the grid, the mobile
 * action bar, the reserved ad slots. It takes the explainer, the FAQ and the
 * related-tools block as opaque `children` — server-rendered, hand-written, and
 * invisible to this file. That split is the point. A `<ToolPage config={...}/>`
 * that rendered prose from data would be the same page fourteen times with the
 * nouns swapped, which is exactly the shape Google's scaled-content-abuse policy
 * penalises and the reason the content lives in `src/content/`.
 *
 * ── Why this is a client component, and why the content still is not ───────
 * `BottomBarProvider` has to wrap **everything below the fold as well**, because
 * the anchor ad sits at the bottom of the page and must know whether the sticky
 * action bar has claimed that space (§8.1 — the two are mutually exclusive). A
 * server-rendered `children` passed through a client component stays a server
 * component, so the prose is still prerendered and still crawlable; only the
 * frame hydrates.
 *
 * ── Why `actionBarVisible` is a prop ───────────────────────────────────────
 * It is decided in the same render pass that decides whether the bar exists, so
 * server and client agree and nothing is unmounted after hydration. Registering
 * it from an effect — the obvious alternative — would render the anchor slot
 * into the static HTML and then remove it on hydration, i.e. it would introduce
 * a layout shift on the very element §8.2 requires to be reserved from first
 * paint. See `action-bar-context.tsx`.
 */

export interface ToolPageProps {
  /** The page `h1`. Hand-written per tool. */
  title: string;
  lead: string;
  /**
   * `<TrustLine />`, passed in rather than rendered here.
   *
   * It is an async server component and this frame is a client one, so it has
   * to arrive as an already-rendered child. §11 requires it directly below the
   * `h1` on every tool page, which is why the slot exists at all instead of
   * leaving placement to each page.
   */
  trustLine?: React.ReactNode;
  /** Left column: dropzone, preview, progress, result. */
  stage: React.ReactNode;
  /** Right column: the settings card. */
  settings: React.ReactNode;
  /** The mobile-only bottom bar. Rendered only when `actionBarVisible`. */
  actionBar?: React.ReactNode;
  /** True exactly when `actionBar` is on screen — drives the anchor exclusion. */
  actionBarVisible?: boolean;
  /** The sr-only live region for job announcements (§7.5). */
  announcer?: React.ReactNode;
  /** Explainer, FAQ, related tools and JSON-LD. Server-rendered. */
  children?: React.ReactNode;
}

export function ToolPage({
  title,
  lead,
  trustLine,
  stage,
  settings,
  actionBar,
  actionBarVisible = false,
  announcer,
  children,
}: ToolPageProps) {
  return (
    <BottomBarProvider actionBarVisible={actionBarVisible}>
      <main id="main" className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex max-w-[64ch] flex-col gap-3">
          <h1 className="font-display text-h1 font-bold text-fg">{title}</h1>
          <p className="text-body text-fg-secondary">{lead}</p>
          {trustLine}
        </header>

        {announcer}

        <ToolShell className="mt-8" stage={stage} settings={settings} />

        {actionBarVisible ? actionBar : null}

        <div className="mt-12 flex flex-col gap-12">{children}</div>

        {/* §8.1: bottom anchor, mobile only, and only while the action bar is
            not there. `AdSlot` enforces the exclusion itself so no page can
            forget it. */}
        <AdSlot variant="anchor" name="anchor" className="md:hidden" />
      </main>
    </BottomBarProvider>
  );
}
