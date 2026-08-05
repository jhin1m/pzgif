/**
 * Retiming.
 *
 * ── Why speeding up drops frames instead of just shortening delays ──────────
 * GIF stores delays in hundredths of a second, and browsers clamp anything below
 * ~20 ms up to 100 ms — a convention from when a 0-delay GIF would peg the CPU.
 * So shortening a 100 ms frame past that floor does not make the animation
 * faster; it makes the browser render it **five times slower than asked**. A 4x
 * speed-up on a 25 ms source would come out slower than the original, which the
 * user would read as the tool being broken.
 *
 * Past the floor the only honest way to go faster is to show fewer frames, so
 * that is what this does — and it reports how many it dropped, because a frame
 * count that changed silently is a memory-budget surprise.
 */

import type { DecodedFrame } from "../types";

/** Matches the browser clamp used when decoding; see `decode/gif.ts`. */
const MIN_DELAY_MS = 20;

export interface RetimeResult {
  frames: DecodedFrame[];
  /** Frames removed because the delay floor was reached. */
  dropped: number;
}

export function retime(frames: DecodedFrame[], speed = 1): RetimeResult {
  const factor = Number.isFinite(speed) && speed > 0 ? speed : 1;
  if (factor === 1) return { frames, dropped: 0 };

  const out: DecodedFrame[] = [];
  let dropped = 0;
  // Debt carries the time of dropped frames forward, so the animation keeps its
  // total duration instead of getting shorter every time a frame is discarded.
  let debtMs = 0;

  for (const frame of frames) {
    const scaled = frame.durationMs / factor + debtMs;
    if (scaled < MIN_DELAY_MS) {
      debtMs = scaled;
      dropped += 1;
      continue;
    }
    debtMs = 0;
    out.push({ rgba: frame.rgba, durationMs: Math.round(scaled) });
  }

  // Never return an empty animation: an extreme speed-up on a short clip would
  // otherwise produce zero frames and a `decode-failed` for a setting the UI
  // itself offered.
  if (out.length === 0 && frames.length > 0) {
    out.push({ rgba: frames[0].rgba, durationMs: MIN_DELAY_MS });
    dropped = frames.length - 1;
  }

  return { frames: out, dropped };
}

/** Total playback time, used for the "about 6 s of GIF" readouts. */
export function totalDurationMs(frames: readonly DecodedFrame[]): number {
  return frames.reduce((sum, frame) => sum + frame.durationMs, 0);
}
