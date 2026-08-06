import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ProgressBar — docs/design-guidelines.md §5.7, and design principle #2:
 * *never fake progress*.
 *
 * ── Why the props are shaped like this ──────────────────────────────────────
 * The component is built so that faking is unrepresentable, not merely
 * discouraged:
 *
 *  - There is **no internal state, no ref and no timer**. It is a pure function
 *    of its props, so there is nowhere for an animation loop to live.
 *  - `determinate: false` has **no `value` field at all**. A caller who does not
 *    know the progress cannot pass a number, because the type has no slot for
 *    one.
 *  - The fill carries `transition: none`. A CSS transition would make the
 *    rendered width disagree with the reported width for 200ms at a time —
 *    interpolation by another name.
 *
 * `progress-bar.test.tsx` asserts that the rendered width equals the passed
 * value exactly.
 *
 * ── What is legitimate ──────────────────────────────────────────────────────
 * `value` arrives already weighted across job stages by
 * `src/lib/media/progress.ts`. Stage weighting is arithmetic on real counters —
 * a decoded-frame index, an encoder callback — with weights measured per job
 * type. Removing it would make the bar jump 0 → 55 → 100, which is less
 * informative, not more honest.
 */

type ProgressBarProps = {
  /** Names what is happening. Required in both modes — see §7.5. */
  label: string;
  /** Rendered beside the bar (Danger, sm). Focusable at all times during a job. */
  cancel?: React.ReactNode;
  className?: string;
} & (
  | {
      determinate: true;
      /**
       * Percent, 0-100. The engine emits a 0-1 fraction, so callers pass
       * `Math.round(event.value * 100)` — rounding a measurement, never
       * inventing one.
       */
      value: number;
      status?: "running" | "complete" | "error";
    }
  | {
      determinate: false;
      status?: "running";
    }
);

export function ProgressBar(props: ProgressBarProps) {
  const { label, cancel, className } = props;
  const status = props.status ?? "running";
  const complete = props.determinate && status === "complete";
  const errored = props.determinate && status === "error";

  // Clamped, never rescaled: a value outside 0-100 is a bug in the caller, and
  // the honest render of it is the nearest end of the track.
  const percent = props.determinate
    ? Math.min(100, Math.max(0, props.value))
    : null;

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={props.determinate ? 0 : undefined}
        aria-valuemax={props.determinate ? 100 : undefined}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={props.determinate ? undefined : label}
        className="h-2 flex-1 overflow-hidden rounded-xs bg-surface-2 shadow-[inset_0_0_0_1px_var(--border)]"
      >
        <div
          className={cn(
            "h-full rounded-xs transition-none",
            props.determinate ? "bg-progress" : "pz-shuttle bg-progress",
            complete && "bg-success",
            errored && "bg-danger",
          )}
          style={props.determinate ? { width: `${percent}%` } : undefined}
        />
      </div>

      {complete ? (
        // Same fixed box and same start edge as the readout it replaces:
        // swapping "100%" for a tick must move neither the cancel button beside
        // it nor the glyphs it replaces.
        <span className="flex w-12 justify-start">
          <Check
            aria-hidden="true"
            className="size-4.5 flex-none animate-[pz-check-pop_200ms_ease-out_1] text-success"
            strokeWidth={2.6}
          />
        </span>
      ) : (
        <span
          // §7.5: the live region announces progress at 25% boundaries. Leaving
          // this readable to a screen reader as well would double-announce it.
          aria-hidden="true"
          className={cn(
            // Fixed width and **left**-aligned, where this was `min-w-[4ch]`
            // and right-aligned. Both halves matter. `ch` is measured in the
            // current font, so the box itself resized when the mono face
            // replaced the fallback; and a right-aligned readout pins its right
            // edge, so "—" becoming "12%" moved the glyphs ~19px leftward.
            // Chromium scores an element whose *start* edge moves, and a text
            // node counts, so that read as an un-prompted layout shift even
            // though nothing around it had budged — 1.0e-5, the last one left
            // on this page. Left-aligned, the start edge never moves and only
            // the trailing edge grows, which is not a shift.
            "tabular w-12 text-left text-label font-medium",
            errored ? "text-danger-text" : "text-fg-secondary",
          )}
        >
          {percent === null ? "—" : `${percent}%`}
        </span>
      )}

      {cancel}
    </div>
  );
}
