/**
 * Reordering: reverse and ping-pong.
 *
 * These run on the accumulated frame array rather than during decode, because
 * both need the last frame before they can emit the first. That is not a memory
 * regression — gifski cannot stream anyway, so the array exists regardless — but
 * it is the reason ping-pong's frame count has to be in the plan before decoding
 * starts rather than discovered here.
 *
 * Ping-pong **shares** the endpoint frames rather than copying their pixels, so
 * a 2x frame count is not a 2x memory cost. The duplicate entries reference the
 * same `Uint8Array`; only the durations are re-stated.
 */

import type { DecodedFrame, TimingSpec } from "../types";

export function applyDirection(
  frames: DecodedFrame[],
  direction: TimingSpec["direction"] = "forward",
): DecodedFrame[] {
  if (direction === "forward" || frames.length < 2) return frames;
  if (direction === "reverse") return [...frames].reverse();

  // Ping-pong: forward, then back through the interior only. Repeating the
  // first and last frames back to back reads as a stutter at each turn, which is
  // the artefact the effect exists to avoid.
  const back = frames.slice(1, -1).reverse();
  return [...frames, ...back];
}
