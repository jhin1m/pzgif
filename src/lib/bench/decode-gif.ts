/**
 * GIF decoding, via `modern-gif`.
 *
 * One decode path on every browser — no `ImageDecoder`, no Safari special case.
 * `ImageDecoder` does not exist in Safari at any version and only arrived in
 * Firefox 133, while 6 of the 9 MVP tools take GIF input. A dual path would mean
 * two different disposal implementations to keep in agreement, and the browser's
 * is not inspectable when they disagree.
 *
 * The cost of that choice is that `modern-gif`'s speed is unmeasured, which is
 * one of the things this spike exists to find out.
 */

import { decode, decodeUndisposedFrame, type Gif } from "modern-gif";
import { drawDownscaled, fitWidth } from "@/lib/media/downscale";
import type { FrameSource } from "./types";

/**
 * Browsers clamp GIF frame delays of 0 and 1 (i.e. 0-10 ms) up to 100 ms, a
 * convention from the era when a 0-delay GIF would peg the CPU. Matching it
 * matters here beyond rendering: if we honoured the raw delay, a re-encode would
 * *change the animation speed* relative to what the user saw in their browser,
 * and they would read that as the tool breaking their file.
 */
const MIN_DELAY_MS = 20;
const BROWSER_CLAMP_THRESHOLD_MS = 20;
const BROWSER_CLAMP_TARGET_MS = 100;

export function normaliseDelay(rawMs: number): number {
  if (!Number.isFinite(rawMs) || rawMs <= 0) return BROWSER_CLAMP_TARGET_MS;
  if (rawMs < BROWSER_CLAMP_THRESHOLD_MS) return BROWSER_CLAMP_TARGET_MS;
  return Math.max(MIN_DELAY_MS, Math.round(rawMs));
}

export interface GifMetadata {
  width: number;
  height: number;
  frameCount: number;
  /** Per-frame delays as stored, before the browser clamp is applied. */
  rawDelaysMs: number[];
  loopCount: number | null;
}

/**
 * Proves the hand-rolled compositing above matches the library's own.
 *
 * `decodeFrames()` is unusable in production here — it materialises every frame
 * at source size — but that makes it an ideal *reference*: it is the same
 * library's independent implementation of the same disposal rules. Comparing
 * against it turns "disposal is ours to implement now" from a stated risk into a
 * checked one.
 *
 * Compares at native size with no downscaling, so any difference is
 * compositing and not resampling. A tolerance is allowed per channel because
 * `drawImage` compositing goes through premultiplied alpha in some engines and
 * can differ by a unit; anything structurally wrong — a missing disposal, a
 * mispositioned patch, a transparency hole — moves pixels far more than that.
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

export function readGifMetadata(source: ArrayBuffer): GifMetadata {
  const gif: Gif = decode(source);
  return {
    width: gif.width,
    height: gif.height,
    frameCount: gif.frames.length,
    rawDelaysMs: gif.frames.map((frame) => frame.delay),
    loopCount: gif.looped === false ? 1 : (gif.loopCount ?? null),
  };
}

/**
 * Streams composited frames at output size, in linear time and constant memory.
 *
 * ── Why this composites by hand instead of calling the library's helpers ─────
 * `modern-gif` offers two obvious routes, and both are wrong here:
 *
 *  - `decodeFrames()` returns the whole animation at once. For
 *    `loop-large.gif` — 200 frames at 800x600 — that is 384 MB of source-size
 *    RGBA resident *before* downscaling, on a budget where iOS dies at ~30 MB.
 *  - `decodeFrame(source, index)` looks like the streaming answer, but its
 *    implementation is `decodeFrames(range: [0, index])`: it re-decodes every
 *    preceding frame on every call. That is O(n^2), and it is not theoretical —
 *    measured at 73 ms/frame for 10 frames and **1261 ms/frame for 200**, a
 *    17x per-frame regression, putting decode at 252 s where the encode of the
 *    same animation took 0.9 s. Six of the nine MVP tools take GIF input, so
 *    this is the product's highest-volume path.
 *
 * `decodeUndisposedFrame()` decodes one frame's own sub-rectangle and nothing
 * else. Compositing it onto a running canvas costs one draw per frame, which
 * gives O(n) time *and* O(1) memory — strictly better than either helper.
 *
 * The cost is that GIF disposal becomes ours to implement, which is a real
 * source of subtle bugs. It is exercised by the fixture corpus rather than
 * assumed correct.
 */
export function gifFrameSource(
  source: ArrayBuffer,
  targetWidth: number,
  { maxFrames }: { maxFrames?: number } = {},
): FrameSource {
  const gif: Gif = decode(source);
  const { width, height } = fitWidth(gif.width, gif.height, targetWidth);
  const total = maxFrames
    ? Math.min(maxFrames, gif.frames.length)
    : gif.frames.length;

  return {
    width,
    height,
    frameCount: total,
    async *frames() {
      const out = new OffscreenCanvas(width, height);
      const outCtx = out.getContext("2d", { willReadFrequently: true });
      if (!outCtx) throw new Error("OffscreenCanvas 2D context unavailable");

      // The logical screen: every frame is composited onto this, and this is
      // what gets downscaled. One canvas for the whole animation.
      const screen = new OffscreenCanvas(gif.width, gif.height);
      const screenCtx = screen.getContext("2d", { willReadFrequently: true });
      if (!screenCtx) throw new Error("OffscreenCanvas 2D context unavailable");

      // A frame's own sub-rectangle, reused and resized per frame.
      const patch = new OffscreenCanvas(1, 1);
      const patchCtx = patch.getContext("2d");
      if (!patchCtx) throw new Error("OffscreenCanvas 2D context unavailable");

      // Only allocated if the animation actually uses disposal method 3.
      let snapshot: ImageData | null = null;
      let previous: { disposal: number; left: number; top: number; width: number; height: number } | null = null;

      for (let index = 0; index < total; index += 1) {
        const descriptor = gif.frames[index];

        // Apply the *previous* frame's disposal before drawing this one. That
        // ordering is the spec's, and getting it backwards produces trails that
        // only show up on animations with transparency.
        if (previous?.disposal === 3 && snapshot) {
          screenCtx.putImageData(snapshot, 0, 0);
        } else if (previous?.disposal === 2) {
          // "Restore to background" means transparent in every renderer that
          // matters; the background-colour reading was abandoned decades ago.
          screenCtx.clearRect(
            previous.left,
            previous.top,
            previous.width,
            previous.height,
          );
        }

        if (descriptor.disposal === 3) {
          snapshot = screenCtx.getImageData(0, 0, gif.width, gif.height);
        }

        const undisposed = decodeUndisposedFrame(source, gif, index);

        if (patch.width !== undisposed.width) patch.width = undisposed.width;
        if (patch.height !== undisposed.height) patch.height = undisposed.height;

        // The lib types allow a shared backing store here and `ImageData` does
        // not accept one, so the narrowing below is what reconciles them. It is
        // sound because this project bans that construct outright — it needs
        // cross-origin isolation, which breaks ad serving, and
        // `pnpm check:forbidden` fails the build on any reference to it — so
        // the backing store is always a plain ArrayBuffer. Narrowing rather
        // than copying keeps this off the per-frame allocation path.
        const data = undisposed.data as Uint8ClampedArray<ArrayBuffer>;
        patchCtx.putImageData(
          new ImageData(data, undisposed.width, undisposed.height),
          0,
          0,
        );

        // `drawImage`, not `putImageData`: the latter replaces the destination
        // including its alpha, so every transparent pixel in this frame would
        // punch a hole through what the previous frame left behind instead of
        // letting it show. That is the whole point of GIF transparency.
        screenCtx.drawImage(patch, descriptor.left, descriptor.top);

        drawDownscaled(screen, gif.width, gif.height, out);

        yield {
          rgba: new Uint8Array(outCtx.getImageData(0, 0, width, height).data.buffer),
          durationMs: normaliseDelay(descriptor.delay),
        };

        previous = {
          disposal: descriptor.disposal,
          left: descriptor.left,
          top: descriptor.top,
          width: descriptor.width,
          height: descriptor.height,
        };
      }
    },
  };
}
