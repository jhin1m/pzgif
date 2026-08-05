import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * ResultPanel — docs/design-guidelines.md §5.9, and principle #5: *reserve every
 * box before it fills*.
 *
 * The empty state is not decoration. It is a 320px box, rendered in the static
 * HTML before any job runs, and it is the only reason the result arriving causes
 * no layout shift. Both states share that `min-height`; if they ever diverge,
 * CLS returns — and CLS < 0.1 is a ranking input this project is built around.
 *
 * The reveal is 180ms of fade and an 8px rise. The box does not grow, because
 * the space was already there.
 */

export interface ResultPanelProps {
  /** The pre-run state that reserves the space. */
  empty?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  className?: string;
  children?: React.ReactNode;
}

export function ResultPanel({
  empty = false,
  emptyMessage = "Your compressed GIF will appear here.",
  emptyHint,
  className,
  children,
}: ResultPanelProps) {
  if (empty) {
    return (
      <div
        className={cn(
          "grid min-h-80 place-items-center rounded-card border border-dashed border-line",
          "px-5 py-5 text-center text-fg-muted md:px-6 md:py-6",
          className,
        )}
      >
        <div className="flex flex-col gap-2">
          <p className="text-sm">{emptyMessage}</p>
          {emptyHint ? <p className="text-caption">{emptyHint}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-h-80 rounded-card border border-line bg-surface-1 p-5 shadow-sm md:p-6",
        "animate-[pz-reveal_180ms_ease-out_1]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The size delta line — the evidence half of principle #4.
 *
 * The percentage is text, never colour alone (§7.6), and both byte counts are
 * mono tabular so a column of results lines up.
 */
export function SizeDelta({
  from,
  to,
  deltaLabel,
  className,
}: {
  from: string;
  to: string;
  deltaLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-baseline gap-2.5", className)}>
      <span className="tabular text-fg-muted line-through">{from}</span>
      <span aria-hidden="true" className="text-fg-muted">
        →
      </span>
      <span className="tabular text-[1.25rem] font-medium text-fg">{to}</span>
      <Badge variant="success">{deltaLabel}</Badge>
    </div>
  );
}
