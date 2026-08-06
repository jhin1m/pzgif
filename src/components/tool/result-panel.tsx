import type { ReactNode } from "react";
import { Check, Download } from "lucide-react";
import { LoopMark } from "@/components/brand/marks";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatDelta } from "@/lib/format-bytes";
import { cn } from "@/lib/utils";

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

/**
 * The reserved height. One string, used by every branch — the two must never be
 * written separately, because the whole mechanism is that they are equal.
 *
 * It was `min-h-80` (320px), and 320px is not what the done state occupies: a
 * header row, a media frame, the size delta and an action row come to ~440px at
 * narrow widths and ~496px from `md` up. The panel therefore grew by 185px when
 * a job finished, which moved the reserved ad slot and everything under it. That
 * growth arrives when the *encoder* finishes, seconds after the click that
 * started it, so it is not covered by `hadRecentInput` and it scored as real
 * CLS — 0.0147 of the 0.0150 the compressor measured.
 *
 * Reserving the larger box is the only honest fix available. The alternative,
 * sizing the panel from the decoded frame, cannot be reserved at all: a portrait
 * GIF and a landscape one ask the same column for wildly different heights, and
 * whichever moment the panel learns the answer is the moment the page shifts.
 * The media frames inside are fixed-height for exactly that reason.
 *
 * ── Why there are four numbers and not one ─────────────────────────────────
 * Every one of them is measured, and the shape of the curve is the reason there
 * are four. The done state's height is dominated by *wrapping*, not by content:
 * the delta row, the two secondary buttons and the next-tools chips each fold
 * onto an extra 44px line as the column narrows, and then the layout jumps back
 * up at `md` when the inline Download button appears. Swept across the five
 * tools with the widest done state, in Chromium, against `loop-small.gif`:
 *
 *     320 → 731    360 → 695    400 → 674    440 → 635
 *     480 → 581    560 → 553    767 → 553    768 → 617    1440 → 617
 *
 * A single reservation would have to be 736px everywhere, which would put 180px
 * of blank under a panel that needs 553 on the widest phone — on the surface
 * where vertical space is scarcest. So the bands follow the measurement.
 *
 * Re-measure whenever the done state gains or loses a row. `e2e/` asserts the
 * panel never exceeds its reservation at these widths, so a drift fails the
 * suite rather than quietly returning CLS to the tool pages.
 *
 * **Known residual.** The `plan.downgraded` and `plan.truncated` notes are not
 * reserved. They render in the same commit as the result, so they do not shift
 * anything a second time, but a job that triggers them overshoots this box by
 * about 50px and shifts once. Reserving them would cost that 50px blank on every
 * page load to protect an exceptional path, which is the worse trade on a
 * surface that is already most of a phone screen.
 */
const RESERVED_HEIGHT =
  "min-h-184 min-[400px]:min-h-170 min-[480px]:min-h-147 md:min-h-156";

export interface ResultPanelProps {
  /** The pre-run state that reserves the space. */
  empty?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  /**
   * What this tool will put here, in three hand-written lines.
   *
   * The reserved box is 480px of surface that a visitor looks at before they
   * have committed to anything, and one grey sentence was not using it. These
   * describe *this* tool's output — the slider the compressor shows, the
   * dimensions the resizer reports — rather than the idea of output, which is
   * why they are content and not a prop default.
   */
  emptyRows?: readonly string[];
  className?: string;
  children?: React.ReactNode;
}

export function ResultPanel({
  empty = false,
  emptyMessage = "Your compressed GIF will appear here.",
  emptyHint,
  emptyRows,
  className,
  children,
}: ResultPanelProps) {
  if (empty) {
    return (
      <div
        className={cn(
          // `bg-checker` is the motif's whole point on this surface: a
          // checkerboard means "an image belongs here" to anyone who has opened
          // an image editor, which is exactly what this box is waiting to hold.
          "grid place-items-center rounded-card border border-dashed border-line bg-checker",
          RESERVED_HEIGHT,
          "px-5 py-5 text-center text-fg-muted md:px-6 md:py-6",
          className,
        )}
      >
        <div className="flex max-w-[46ch] flex-col items-center gap-4">
          {/* A face, because this surface is *waiting* rather than working. The
              same mark on a busy state would be a character watching the user
              wait. */}
          <LoopMark personified className="size-16 text-mark-muted md:size-20" />

          {/* The copy sits on its own opaque card. The motif is bound by "never
              behind body text" — the pattern's darkest tiles eat the contrast
              floor — so the surface carries the checkerboard and this carries
              the words. */}
          <div className="w-full rounded-card bg-surface-1/85 px-4 py-3.5">
            <p className="text-sm font-medium text-fg-secondary">
              {emptyMessage}
            </p>
            {emptyRows && emptyRows.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-left">
                {emptyRows.map((row) => (
                  <li
                    key={row}
                    className="flex items-start gap-2 text-caption text-fg-muted"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 flex-none rounded-full bg-accent-text"
                    />
                    {row}
                  </li>
                ))}
              </ul>
            ) : null}
            {emptyHint ? (
              <p className="mt-3 text-caption text-fg-muted">{emptyHint}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface-1 p-5 shadow-sm md:p-6",
        RESERVED_HEIGHT,
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
 *
 * ── Why accent and not success-green ───────────────────────────────────────
 * Green is reserved for *status*: a job succeeded, a check passed. This line is
 * not a status, it is the result — the number the visitor came for — and giving
 * it the product's accent is what makes the accent mean something rather than
 * decorate something. `--accent-text` is the token annotated "text-safe" and is
 * the only teal that clears the contrast floor in both themes.
 *
 * The badge deliberately does not turn red when the file grew. "+4% larger" is
 * a legitimate outcome of re-encoding an already-optimised GIF at a higher
 * quality, and colouring it as an error would mislabel a correct result. The
 * word carries the direction; the colour carries none of it.
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
      <span className="tabular text-[1.25rem] font-medium text-accent-text">
        {to}
      </span>
      <Badge variant="accent">{deltaLabel}</Badge>
    </div>
  );
}

/**
 * The completion moment: what the visitor got, and what to do with it.
 *
 * ── What it is, and what it refuses to become ──────────────────────────────
 * Both intake surfaces — `gif-workbench.tsx` for four tools, the compressor for
 * the fifth — had assembled this tail themselves, so "done" looked like whatever
 * each page happened to compose. This is that tail, once.
 *
 * It takes rendered values and children, never a configuration object. The
 * compressor needs a before/after slider above it and the workbench needs a
 * plain image; neither is expressible here and neither should be. A component
 * that grew options until it could express both would be a configuration
 * language, which is the failure the tool framework was split to avoid — so a
 * tool with something this cannot say composes *around* it instead.
 *
 * ── The mark pops once ──────────────────────────────────────────────────────
 * `pz-check-pop` is 200ms and one iteration. §6 is explicit that a looping
 * success animation reads as "still working", which is the opposite of what the
 * moment means. Under `prefers-reduced-motion` the global rule in `globals.css`
 * collapses the duration and the mark simply *is* there — the meaning was never
 * in the movement.
 *
 * ── There is no count-up on the numbers ────────────────────────────────────
 * It carries no information, and it makes a measured byte count look like an
 * estimate. Every figure in this panel is read off a real blob.
 */
export interface ResultSummaryProps {
  /** The file the visitor dropped, in bytes. */
  fromBytes: number;
  /** The blob that now exists, in bytes. Never an estimate. */
  toBytes: number;
  /**
   * This tool's completion sentence, still holding its `{saved}` placeholder.
   *
   * Interpolated here rather than through next-intl: `{saved}` comes from a
   * content file under `LICENSE-CONTENT`, not from the message catalogue, and
   * routing it through the ICU formatter would put prose in `messages/`.
   */
  savedLine: string;
  /** "encoded in 4.2s" — formatted by the caller, which owns the catalogue. */
  encodedIn: string;
  downloadHref: string;
  downloadName: string;
  downloadLabel: string;
  /** `plan.downgraded` / `plan.truncated` notes, when the engine reports them. */
  notes?: ReactNode;
  /** `<NextTools />`. Rendered under a divider, or not at all. */
  next?: ReactNode;
  /** Secondary actions — re-run, start over. */
  children?: ReactNode;
  className?: string;
}

export function ResultSummary({
  fromBytes,
  toBytes,
  savedLine,
  encodedIn,
  downloadHref,
  downloadName,
  downloadLabel,
  notes,
  next,
  children,
  className,
}: ResultSummaryProps) {
  // Only claimed when it is true. Every `savedLine` is written in the language
  // of having gained something, and re-encoding can legitimately produce a
  // larger file — on which the sentence would be false while the delta beside
  // it said so plainly. The slot keeps its line box either way, so the two
  // outcomes are the same height.
  //
  // The threshold is `formatDelta`'s own rounding, not zero. A 10 MB job that
  // came out 30 KB smaller rounds to `no change` in the badge, and "you just
  // cut 30 KB out of it" beside the words "no change" is two halves of the same
  // panel disagreeing about what happened.
  const saved = fromBytes - toBytes;
  const worthSaying = fromBytes > 0 && saved / fromBytes >= 0.005;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "grid size-7 flex-none place-items-center rounded-full",
              "bg-progress/15 text-accent-text",
              "animate-[pz-check-pop_200ms_ease-out_1]",
            )}
          >
            <Check aria-hidden="true" className="size-4.5" strokeWidth={2.6} />
          </span>
          <SizeDelta
            from={formatBytes(fromBytes)}
            to={formatBytes(toBytes)}
            deltaLabel={formatDelta(fromBytes, toBytes)}
          />
        </div>
        <span className="tabular text-caption text-fg-muted">{encodedIn}</span>
      </div>

      <p className="mt-2.5 min-h-[1.5em] text-sm text-fg-secondary">
        {worthSaying ? savedLine.replace("{saved}", formatBytes(saved)) : null}
      </p>

      {notes}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* Hidden below md: the sticky bar already carries this action, and §5.1
            permits exactly one primary per viewport. Above md this is the
            conversion action of the whole page and is styled as such — a primary
            button, not one link among several. */}
        <a
          href={downloadHref}
          download={downloadName}
          className={cn(
            "hidden min-h-12 items-center justify-center gap-2 rounded-control px-6 md:inline-flex",
            "bg-brand-fill text-body font-semibold text-fg-on-primary shadow-sm",
            "hover:bg-brand-fill-hover",
          )}
        >
          <Download aria-hidden="true" className="size-4.5" />
          {downloadLabel}
        </a>
        {children}
      </div>

      {next ? <div className="mt-5">{next}</div> : null}
    </div>
  );
}
