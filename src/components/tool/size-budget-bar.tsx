import { AlertTriangle, Check, CircleAlert, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format-bytes";

/**
 * The size-budget meter — the one piece of UI in this product with no competitor
 * equivalent, and the one most able to lie.
 *
 * ── Why it is not a progress bar ───────────────────────────────────────────
 * A progress bar's 100% is where the work ends. This bar's 100% is a *ceiling*
 * you must stay under, so the two read in opposite directions: a full progress
 * bar is success and a full budget bar is failure. Hence the fixed tick at the
 * right edge and the fill that keeps going past it — an over-budget file has to
 * look over-budget, not finished.
 *
 * ── The three rules it enforces ────────────────────────────────────────────
 *
 *  1. **Every state carries an icon and a sentence, never colour alone.** The
 *     difference between "fits" and "will be rejected" is the entire point of
 *     the page, and roughly one man in twelve cannot read it from a green-to-red
 *     hue shift.
 *
 *  2. **An estimate is rendered as a range, never as a point value.** The
 *     sampled estimator carries ±20%, and a midpoint of 243 KB against a 256 KB
 *     ceiling is a number whose true value may be 290 KB. `basis: "range"` is
 *     what the caller passes while nothing has been encoded yet.
 *
 *  3. **`fits` is only reachable from `basis: "measured"`.** The type makes it
 *     unrepresentable otherwise: an estimate can say "probably" and "probably
 *     not", and only a real file on disk can say ✓. `discord-preset.html`'s FAQ
 *     promises the page "will not let you download something that misses the
 *     limit", and that promise is kept here.
 *
 * ── When Discord publishes no limit ───────────────────────────────────────
 * Three of the four surfaces have no documented maximum. `limitBytes: null` is
 * that state: the bar shows the measured size and no ceiling, because a tick
 * drawn at a number nobody published is the same defect as the wireframe's
 * "≤10 MB".
 */

/** What is known about the size, and how firmly. */
export type BudgetBasis =
  | {
      /** No encode has happened. Both ends of the estimator's band. */
      basis: "range";
      low: number;
      high: number;
    }
  | {
      /** A real file exists and this is its byte count. */
      basis: "measured";
      bytes: number;
    };

export type BudgetTone = "over" | "close" | "fits" | "unknown";

export interface SizeBudgetBarProps {
  /** e.g. "Size budget — Discord emoji". Written per page. */
  heading: string;
  /** Discord's published ceiling, or null where it publishes none. */
  limitBytes: number | null;
  size: BudgetBasis;
  /**
   * The hand-written sentence for the state the caller computed.
   *
   * Passed in rather than chosen here: every word a visitor reads on a preset
   * page is written for that preset, and a component that owned this string
   * would be one sentence appearing on five pages.
   */
  message: string;
  /** Accessible name for the meter, with the figures already interpolated. */
  meterLabel: string;
  className?: string;
}

const TONE_ICON = {
  over: CircleAlert,
  close: AlertTriangle,
  fits: Check,
  unknown: Ruler,
} as const;

/**
 * Which state the figures put this in.
 *
 * Exported and pure so the page can label its badge and its bar from one
 * decision. Two independent readings of "does this fit" is how a panel ends up
 * showing a green tick above a sentence saying it will be rejected.
 *
 * The `close` band is keyed on the **high** end of an estimate, not its
 * midpoint: what makes a file risky is that it *might* be over, and the midpoint
 * is precisely the number that hides that.
 */
export function budgetTone(
  size: BudgetBasis,
  limitBytes: number | null,
): BudgetTone {
  if (limitBytes === null) return "unknown";
  if (size.basis === "measured") {
    return size.bytes > limitBytes
      ? "over"
      : size.bytes > limitBytes * 0.9
        ? "close"
        : "fits";
  }
  if (size.low > limitBytes) return "over";
  // The upper end crosses the ceiling: it may fit, and it may not. That is the
  // honest answer and it is not "fits".
  return size.high >= limitBytes * 0.8 ? "close" : "fits";
}

/** How full the track is drawn, 0-100. Over-budget pins at 100 and says so. */
function fillPercent(size: BudgetBasis, limitBytes: number | null): number {
  if (limitBytes === null || limitBytes <= 0) return 0;
  const bytes = size.basis === "measured" ? size.bytes : size.high;
  return Math.min(100, Math.round((bytes / limitBytes) * 100));
}

export function SizeBudgetBar({
  heading,
  limitBytes,
  size,
  message,
  meterLabel,
  className,
}: SizeBudgetBarProps) {
  const tone = budgetTone(size, limitBytes);
  const Icon = TONE_ICON[tone];
  const percent = fillPercent(size, limitBytes);
  const measured = size.basis === "measured";

  return (
    <div className={cn("flex flex-col gap-2", className)} data-budget-tone={tone}>
      <span className="font-sans text-label font-semibold text-fg">{heading}</span>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span
          className={cn(
            "tabular text-h4 font-medium leading-none",
            tone === "over" && "text-danger-text",
            tone === "fits" && measured && "text-success-text",
          )}
          data-budget-size
        >
          {measured
            ? formatBytes(size.bytes)
            : `≈ ${formatBytes(size.low)}–${formatBytes(size.high)}`}
        </span>
        {limitBytes !== null ? (
          <span className="tabular text-caption text-fg-muted" data-budget-limit>
            {formatBytes(limitBytes)}
          </span>
        ) : null}
      </div>

      {limitBytes !== null ? (
        <div
          role="meter"
          aria-label={meterLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          // The figures, not the geometry. "72" is meaningless read aloud; the
          // sentence under the bar is what a screen-reader user is actually
          // given, and this restates it inside the control itself.
          aria-valuetext={meterLabel}
          className="relative h-3.5 overflow-hidden rounded-xs bg-surface-2 shadow-[inset_0_0_0_1px_var(--border)]"
        >
          <div
            className={cn(
              "h-full rounded-xs transition-none",
              tone === "over" && "bg-danger",
              tone === "close" && "bg-warning",
              tone === "fits" && "bg-success",
            )}
            style={{ width: `${percent}%` }}
          />
          {/* The ceiling, drawn *on* the right edge: the track's full width is
              100% of the budget, which is what makes this a budget rather than
              a progress bar. */}
          <span
            aria-hidden="true"
            className="absolute inset-y-0 right-0 w-[3px] bg-fg opacity-80"
          />
        </div>
      ) : null}

      <p
        className={cn(
          "flex items-start gap-1.5 text-caption font-semibold",
          tone === "over" && "text-danger-text",
          tone === "close" && "text-warning-text",
          tone === "fits" && "text-success-text",
          tone === "unknown" && "text-fg-secondary",
        )}
        data-budget-message
      >
        <Icon aria-hidden="true" className="mt-0.5 size-3.5 flex-none" strokeWidth={2.4} />
        <span>{message}</span>
      </p>
    </div>
  );
}
