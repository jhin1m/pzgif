"use client";

import { useJobProgress, type ProgressStore } from "@/hooks/use-media-job";

/**
 * The job's screen-reader narration — `docs/design-guidelines.md` §7.5.
 *
 * ── Why announcements are quantised to quarters ────────────────────────────
 * The engine emits progress at 10 Hz. Piping that into a live region means a
 * screen reader is interrupted ten times a second and the user hears nothing
 * else for the length of the job — a politeness setting that is, in practice, a
 * denial of service. Four announcements per stage is the same information a
 * sighted user takes from glancing at the bar.
 *
 * The visible percentage carries `aria-hidden` in `ProgressBar` precisely so
 * this region is the only thing that speaks; otherwise every value would be read
 * twice, once from each source.
 *
 * ── Why there is no state and no effect here ───────────────────────────────
 * The message is a pure function of the progress event. That is not a style
 * preference: a `useState` fed from a `useEffect` would re-render this component
 * on every one of those 10 Hz events just to discard nine of them, on the exact
 * interaction the worker architecture exists to keep responsive. Flooring the
 * value to a quarter *before* it becomes output means the rendered string
 * changes four times per stage and React does nothing in between.
 *
 * The announced figure is the boundary reached, not the instantaneous value —
 * "50%" when progress has passed one half. That is a real measurement rounded
 * down, never an interpolation, and it is what §7.5's "25% boundaries" asks for.
 */

const QUARTERS = 4;

export function JobAnnouncer({
  progress,
  /** Stage sentence, already translated. Null when no job is running. */
  stageLabel,
  /** Terminal message: the result summary, or the failure. Wins over progress. */
  outcome,
}: {
  progress: ProgressStore;
  stageLabel: string | null;
  outcome: string | null;
}) {
  const event = useJobProgress(progress);

  // An indeterminate stage has no denominator, so the stage sentence is the
  // whole message. Attaching a number here would be the invented percentage the
  // progress rules exist to forbid.
  const quarter = event.determinate
    ? Math.floor(event.value * QUARTERS)
    : 0;

  const message =
    outcome ??
    (stageLabel
      ? quarter > 0
        ? `${stageLabel} ${(quarter * 100) / QUARTERS}%`
        : stageLabel
      : "");

  return (
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </p>
  );
}
