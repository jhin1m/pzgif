import { AdSlot } from "@/components/ads/ad-slot";
import { cn } from "@/lib/utils";

/**
 * The tool-page grid — one column, then two, then three.
 *
 * ── The rail column is declared, not injected ───────────────────────────────
 * `design-guidelines.md` §8.2 and the wireframe both say it: at ≥1280px the
 * 300px rail is a real grid column from first paint, whether or not an ad ever
 * fills it. Adding the column when a creative arrives is the classic way to ship
 * a CLS regression on the one metric this project treats as a ranking input, and
 * it is invisible in development because no network is active there.
 *
 * That is also why the column is a static Tailwind class and not a runtime width
 * check: a client-side `matchMedia` would render the wrong thing on the server,
 * then correct itself after hydration — which is the shift, arriving by a
 * different route.
 *
 * ── Column sizing ──────────────────────────────────────────────────────────
 *   < lg    1 column, settings below the stage
 *   ≥ lg    stage `minmax(0,1fr)` + settings `320px`
 *   ≥ xl    the above + rail `300px`
 *
 * `minmax(0,1fr)` rather than `1fr`: a `1fr` track has an automatic minimum of
 * `min-content`, so a wide result image or a long unbroken filename would push
 * the settings column off screen instead of scrolling inside its own box.
 */

export function ToolShell({
  stage,
  settings,
  className,
}: {
  /** Dropzone, preview, progress and result — the left column. */
  stage: React.ReactNode;
  /** The settings card. Rendered below the stage at narrow widths. */
  settings: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-start gap-6",
        "lg:grid-cols-[minmax(0,1fr)_320px]",
        "xl:grid-cols-[minmax(0,1fr)_320px_300px]",
        className,
      )}
    >
      <div className="min-w-0">{stage}</div>
      <div className="min-w-0">{settings}</div>
      {/* The rail column exists at every width ≥ xl; only its contents are
          conditional, and even those are reserved rather than empty. The unit
          itself is never sticky — §4.4 permits exactly one sticky ad on the
          site, and that is the mobile anchor. */}
      <div className="hidden xl:block">
        <AdSlot variant="rail" name="rail" />
      </div>
    </div>
  );
}
