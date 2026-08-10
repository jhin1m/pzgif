/**
 * Which decoded frames survive, and how many the budget has to be sized for.
 *
 * Selection runs **while decoding**, not after: a dropped frame that was never
 * held is the cheapest memory saving in the engine, and on the iOS budget it is
 * often the difference between a job and a refusal.
 *
 * The frame count these functions predict is the number admission control
 * budgets against, so a mistake here is not a cosmetic one — ping-pong doubling
 * the output while the plan budgeted for single is exactly the shape of an OOM
 * that arrives after the user was told the job would fit.
 */

import type { DecodedFrame, TimingSpec } from "../types";

/**
 * The source seconds a job actually reads, after `trimSec` is clamped to the
 * clip.
 *
 * One function rather than clamping at each call site, because three places have
 * to agree on the answer or the engine contradicts itself: the decoder seeks to
 * it, admission control budgets memory against it, and the estimator prices it.
 * A trim that admission control sized at three seconds while the decoder read
 * sixty is an OOM arriving after the user was told the job would fit.
 *
 * `durationSec` is null for a container that never stated one — some WebM. The
 * span is then unknowable and the trim is dropped rather than guessed at; the
 * decoder still stops at the tier's frame cap and reports the truncation.
 */
export function trimmedSpan(
  durationSec: number | null,
  timing: TimingSpec,
): { fromSec: number; durationSec: number } | null {
  if (durationSec === null || !Number.isFinite(durationSec)) return null;
  const trim = timing.trimSec;
  if (!trim) return { fromSec: 0, durationSec };

  const from = Math.max(0, Math.min(trim.from, durationSec));
  const to = Math.max(from, Math.min(trim.to, durationSec));
  return { fromSec: from, durationSec: to - from };
}

/** Whether a decoded frame at `index` is kept, before any reordering. */
export function selectsFrame(index: number, timing: TimingSpec): boolean {
  const { range, keepEveryNth = 1 } = timing;
  if (range && (index < range.from || index >= range.to)) return false;
  const offset = range ? index - range.from : index;
  return offset % Math.max(1, Math.round(keepEveryNth)) === 0;
}

/** How many frames survive selection out of `decodedCount`. */
export function selectedFrameCount(decodedCount: number, timing: TimingSpec): number {
  const from = Math.max(0, timing.range?.from ?? 0);
  const to = Math.min(decodedCount, timing.range?.to ?? decodedCount);
  const span = Math.max(0, to - from);
  const stride = Math.max(1, Math.round(timing.keepEveryNth ?? 1));
  return Math.ceil(span / stride);
}

/**
 * How `direction` multiplies the surviving frames.
 *
 * Ping-pong is `2n - 2`, not `2n`: repeating the first and last frames back to
 * back reads as a stutter at the turning points, which is the one artefact the
 * effect exists to avoid.
 */
export function directionFrameCount(
  selected: number,
  direction: TimingSpec["direction"],
): number {
  if (direction !== "ping-pong") return selected;
  return selected >= 2 ? selected * 2 - 2 : selected;
}

/** Total output frames for a decode of `decodedCount` frames under `timing`. */
export function plannedFrameCount(decodedCount: number, timing: TimingSpec): number {
  return directionFrameCount(selectedFrameCount(decodedCount, timing), timing.direction);
}

/** The last decoded index worth reading. Lets a decode stop early on a trim. */
export function lastNeededIndex(decodedCount: number, timing: TimingSpec): number {
  const to = timing.range?.to;
  return to === undefined ? decodedCount - 1 : Math.min(decodedCount, to) - 1;
}

/**
 * Keeps one frame in `n` from an **already decoded** list, preserving the
 * animation's total running time.
 *
 * The duration handling is the whole function. A dropped frame's time does not
 * disappear — it is added to the frame that replaces it on screen — so a loop
 * that ran for two seconds still runs for two seconds with half the frames. Any
 * implementation that only filters the array silently doubles the playback
 * speed, which on a Discord emoji reads as a broken conversion rather than as a
 * smaller file.
 *
 * Distinct from `selectsFrame`, which runs *during* decoding and is the cheap
 * path. This one exists for the auto-fit search, where the frames are already
 * resident and re-decoding to drop half of them would cost far more than it
 * saves. It returns new frame objects sharing the original pixel buffers, so it
 * allocates nothing per pixel.
 */
export function keepEveryNthFrame(
  frames: readonly DecodedFrame[],
  n: number,
): DecodedFrame[] {
  const stride = Math.max(1, Math.round(n));
  if (stride === 1) return [...frames];

  const kept: DecodedFrame[] = [];
  for (const [index, frame] of frames.entries()) {
    if (index % stride === 0) {
      kept.push({ rgba: frame.rgba, durationMs: frame.durationMs });
      continue;
    }
    // Its time goes to whichever frame is currently on screen.
    kept[kept.length - 1].durationMs += frame.durationMs;
  }
  return kept;
}

/**
 * Evenly spaced items across the whole list, so a sample shows the arc rather
 * than the opening.
 *
 * Used by the preview and by the estimator. A leading slice would price a fade-in
 * or a title card, which is often the least representative part of an animation.
 */
export function strideSample<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const step = items.length / count;
  const out: T[] = [];
  for (let index = 0; index < count; index += 1) {
    out.push(items[Math.min(items.length - 1, Math.floor(index * step))]);
  }
  return out;
}
