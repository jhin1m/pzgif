/**
 * The benchmark harness's view of GIF decoding.
 *
 * The decoder itself was promoted to `src/lib/media/decode/gif.ts` in Phase 4 —
 * it was production code that happened to be written during the spike. What
 * stays here is the part only a benchmark needs: the reference comparison that
 * proves the hand-rolled disposal compositing matches the library's own.
 *
 * The thin adapter below keeps the Phase 1 specs calling the shape they were
 * written against, so the recorded artefacts stay comparable across phases.
 */

import { decode, type Gif } from "modern-gif";
import { gifFrameSource as mediaGifFrameSource } from "@/lib/media/decode/gif";
import { FrameGeometry } from "@/lib/media/ops/geometry";
import type { FrameSource } from "./types";

export { normaliseDelay, readGifMetadata, type GifMetadata } from "@/lib/media/decode/gif";

/**
 * Proves the streaming compositor matches the library's own implementation.
 *
 * `decodeFrames()` is unusable in production — it materialises every frame at
 * source size — but that makes it an ideal *reference*: the same library's
 * independent implementation of the same disposal rules. Comparing against it
 * turns "disposal is ours to implement now" from a stated risk into a checked
 * one.
 *
 * Compared at native size with no downscaling, so any difference is compositing
 * and not resampling. A per-channel tolerance is allowed because `drawImage`
 * compositing goes through premultiplied alpha in some engines and can differ by
 * a unit; anything structurally wrong — a missing disposal, a mispositioned
 * patch, a transparency hole — moves pixels far more than that.
 */
export function compareCompositingAgainstReference(
  source: ArrayBuffer,
  reference: Array<{ data: Uint8ClampedArray }>,
  produced: Uint8Array[],
  tolerance = 2,
): {
  frames: number;
  maxChannelDelta: number;
  mismatchedPixels: number;
  totalPixels: number;
  matches: boolean;
} {
  const gif: Gif = decode(source);
  const pixelsPerFrame = gif.width * gif.height;
  let maxChannelDelta = 0;
  let mismatchedPixels = 0;
  const frames = Math.min(reference.length, produced.length);

  for (let index = 0; index < frames; index += 1) {
    const expected = reference[index].data;
    const actual = produced[index];
    for (let pixel = 0; pixel < pixelsPerFrame; pixel += 1) {
      const at = pixel * 4;
      // Fully transparent pixels carry undefined RGB in both implementations,
      // so only alpha is meaningful there.
      const bothTransparent = expected[at + 3] === 0 && actual[at + 3] === 0;
      const channels = bothTransparent ? [3] : [0, 1, 2, 3];
      let bad = false;
      for (const channel of channels) {
        const delta = Math.abs(expected[at + channel] - actual[at + channel]);
        if (delta > maxChannelDelta) maxChannelDelta = delta;
        if (delta > tolerance) bad = true;
      }
      if (bad) mismatchedPixels += 1;
    }
  }

  return {
    frames,
    maxChannelDelta,
    mismatchedPixels,
    totalPixels: frames * pixelsPerFrame,
    matches: mismatchedPixels === 0,
  };
}

/** Width-only adapter over the production decoder, for the Phase 1 specs. */
export function gifFrameSource(
  source: ArrayBuffer,
  targetWidth: number,
  { maxFrames }: { maxFrames?: number } = {},
): FrameSource {
  const gif: Gif = decode(source);
  const geometry = new FrameGeometry(gif.width, gif.height, { targetWidth });
  return mediaGifFrameSource(source, geometry, { maxFrames });
}
