/**
 * Progress reporting. Every number here comes from a counter.
 *
 * ── The rule, and where its boundary is ─────────────────────────────────────
 * Time-based interpolation, simulated ramps and invented percentages are
 * forbidden. Stage weighting is not: each stage's own value is a real
 * denominator — a decoded-frame index, an encoder callback — and combining them
 * into one figure is arithmetic on measurements, not a fabrication. The weights
 * themselves are measured per job type; see `calibration.ts`.
 *
 * A reviewer who deletes the weighting to "stop faking progress" would make the
 * bar worse, not more honest: it would jump from 0 to 55 to 100 with nothing in
 * between. This comment exists so that does not happen.
 *
 * ── When there is genuinely no counter ─────────────────────────────────────
 * The unforked gifski exposes no progress callback and blocks its worker for the
 * entire encode. There is nothing to count, so `determinate` goes false and the
 * UI shows an indeterminate track with an elapsed timer and the word
 * "Preparing…". It does not show a number, because there is no number.
 *
 * ── Throttling is not an optimisation ──────────────────────────────────────
 * A `postMessage` per decoded frame is thousands of messages a second, each one
 * a main-thread task and a React render. That alone would breach the INP budget
 * the whole worker architecture exists to protect. 10 Hz is faster than the eye
 * reads a percentage.
 */

import type { StageWeights } from "./calibration";
import type { JobStage, ProgressEvent } from "./types";

const THROTTLE_MS = 100;

export type ProgressSink = (event: ProgressEvent) => void;

export class ProgressReporter {
  private lastEmitAt = 0;
  private completedWeight = 0;
  private currentStage: JobStage = "probe";

  constructor(
    private readonly weights: StageWeights,
    private readonly emit: ProgressSink,
    private readonly now: () => number = () => performance.now(),
  ) {}

  private weightOf(stage: JobStage): number {
    switch (stage) {
      case "probe":
        return this.weights.probe;
      case "decode":
        return this.weights.decode;
      case "encode":
        return this.weights.encode;
      // Packaging and the encoder retry are not separately calibrated; they
      // borrow the encode weight because that is what they replace.
      case "package":
      case "retry":
        return this.weights.encode;
    }
  }

  /** Everything before this stage in the canonical sequence. */
  private weightBefore(stage: JobStage): number {
    switch (stage) {
      case "probe":
      case "retry":
        return 0;
      case "decode":
        return this.weights.probe;
      case "encode":
      case "package":
        return this.weights.probe + this.weights.decode;
    }
  }

  /**
   * Moves to a new stage.
   *
   * The completed weight is **recomputed from the stage**, not accumulated.
   * Accumulating looks equivalent until a job re-enters a stage: the fallback
   * retry decodes a second time, and an accumulator would credit the decode
   * twice and pin the bar at 100% while the retry was still reading frames.
   * Deriving it means the bar steps back to the start of the decode band on a
   * retry — visible, correct, and accompanied by a "retrying" label, which is a
   * better answer than a full bar over unfinished work.
   */
  enter(stage: JobStage): void {
    if (stage === this.currentStage) return;
    // `retry` is not a position in the sequence; it is a marker on the way back
    // to one, so it leaves the banked weight where the encode left it.
    if (stage !== "retry") this.completedWeight = this.weightBefore(stage);
    this.currentStage = stage;
    this.lastEmitAt = 0;
    this.report(0, null, { force: true });
  }

  /**
   * Reports a real counter. `total === null` means the stage is indeterminate:
   * no denominator exists, so no percentage is claimed.
   */
  report(done: number, total: number | null, { force = false } = {}): void {
    const at = this.now();
    if (!force && at - this.lastEmitAt < THROTTLE_MS) return;
    this.lastEmitAt = at;

    const determinate = total !== null && total > 0;
    const fraction = determinate ? Math.min(1, done / total) : 0;
    const value = Math.min(
      1,
      this.completedWeight + this.weightOf(this.currentStage) * fraction,
    );

    this.emit({ stage: this.currentStage, determinate, value, done, total });
  }

  /** The final emit, always sent, so the bar never rests at 97%. */
  finish(): void {
    this.completedWeight = 1;
    this.emit({ stage: this.currentStage, determinate: true, value: 1, done: 1, total: 1 });
  }
}
