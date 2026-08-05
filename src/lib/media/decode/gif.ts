/**
 * GIF decoding, via `modern-gif`.
 *
 * One decode path on every browser — no `ImageDecoder`, no Safari special case.
 * `ImageDecoder` does not exist in Safari at any version and only arrived in
 * Firefox 133, while 6 of the 9 MVP tools take GIF input. A dual path would mean
 * two disposal implementations to keep in agreement, and the browser's is not
 * inspectable when they disagree.
 *
 * ── Why this composites by hand instead of calling the library's helpers ─────
 * `modern-gif` offers two obvious routes and both are wrong here:
 *
 *  - `decodeFrames()` returns the whole animation at once. For a 200-frame
 *    800x600 GIF that is 384 MB of source-size RGBA resident *before*
 *    downscaling, against an iOS budget of 30 MB.
 *  - `decodeFrame(source, index)` looks like the streaming answer, but its
 *    implementation is `decodeFrames(range: [0, index])` — it re-decodes every
 *    preceding frame on every call. Measured at 73 ms/frame for 10 frames and
 *    **1261 ms/frame for 200**: 252 s of decode for an animation whose encode
 *    took 0.9 s.
 *
 * `decodeUndisposedFrame()` decodes one frame's own sub-rectangle and nothing
 * else. Compositing it onto a running canvas is one draw per frame, giving O(n)
 * time and O(1) memory — strictly better than either helper. The cost is that
 * disposal handling becomes ours, which `e2e/bench/gif-compositing.spec.ts`
 * checks pixel-for-pixel against the library's own implementation rather than
 * assuming.
 */

import { decode, decodeUndisposedFrame, type Gif } from "modern-gif";
import { FrameGeometry } from "../ops/geometry";
import { selectsFrame } from "../ops/frame-select";
import type { DecodedFrame, FrameSource, TimingSpec } from "../types";

/**
 * Browsers clamp GIF frame delays of 0 and 1 (0-10 ms) up to 100 ms, a
 * convention from the era when a 0-delay GIF would peg the CPU. Matching it
 * matters beyond rendering: honouring the raw delay would make a re-encode
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

export interface GifSourceOptions {
  timing?: TimingSpec;
  maxFrames?: number;
}

/** Streams composited frames at output size, in linear time and constant memory. */
export function gifFrameSource(
  source: ArrayBuffer,
  geometry: FrameGeometry,
  { timing = {}, maxFrames }: GifSourceOptions = {},
): FrameSource {
  const gif: Gif = decode(source);

  // Every frame must be composited — disposal is a chain — but only selected
  // frames are downscaled and read back, which is where the per-frame cost is.
  let emitted = 0;
  const selectedTotal = (() => {
    let count = 0;
    for (let index = 0; index < gif.frames.length; index += 1) {
      if (selectsFrame(index, timing)) count += 1;
    }
    return maxFrames ? Math.min(count, maxFrames) : count;
  })();

  return {
    width: geometry.outputWidth,
    height: geometry.outputHeight,
    frameCount: selectedTotal,
    async *frames(signal?: AbortSignal): AsyncGenerator<DecodedFrame> {
      const out = geometry.createOutputCanvas();
      const outCtx = out.getContext("2d", { willReadFrequently: true });
      if (!outCtx) throw new Error("OffscreenCanvas 2D context unavailable");

      // The logical screen: every frame composites onto this, and this is what
      // gets cropped, rotated and downscaled. One canvas for the whole animation.
      const screen = new OffscreenCanvas(gif.width, gif.height);
      const screenCtx = screen.getContext("2d", { willReadFrequently: true });
      if (!screenCtx) throw new Error("OffscreenCanvas 2D context unavailable");

      // A frame's own sub-rectangle, reused and resized per frame.
      const patch = new OffscreenCanvas(1, 1);
      const patchCtx = patch.getContext("2d");
      if (!patchCtx) throw new Error("OffscreenCanvas 2D context unavailable");

      // Time owed by frames the stride skipped, paid to the next kept frame.
      let carriedDelayMs = 0;
      let snapshot: ImageData | null = null;
      let previous:
        | { disposal: number; left: number; top: number; width: number; height: number }
        | null = null;

      for (let index = 0; index < gif.frames.length; index += 1) {
        if (signal?.aborted) return;
        if (emitted >= selectedTotal) return;

        const descriptor = gif.frames[index];

        // Apply the *previous* frame's disposal before drawing this one. That
        // ordering is the spec's; getting it backwards produces trails that only
        // appear on animations with transparency.
        if (previous?.disposal === 3 && snapshot) {
          screenCtx.putImageData(snapshot, 0, 0);
        } else if (previous?.disposal === 2) {
          // "Restore to background" means transparent in every renderer that
          // matters; the background-colour reading was abandoned decades ago.
          screenCtx.clearRect(previous.left, previous.top, previous.width, previous.height);
        }

        if (descriptor.disposal === 3) {
          snapshot = screenCtx.getImageData(0, 0, gif.width, gif.height);
        }

        const undisposed = decodeUndisposedFrame(source, gif, index);

        if (patch.width !== undisposed.width) patch.width = undisposed.width;
        if (patch.height !== undisposed.height) patch.height = undisposed.height;

        // The library's type allows a shared backing store and `ImageData` does
        // not accept one, so this narrowing is what reconciles them. It is sound
        // because that construct is banned repo-wide — it needs cross-origin
        // isolation, which breaks ad serving, and `pnpm check:forbidden` fails
        // the build on any reference to it. Narrowing rather than copying keeps
        // this off the per-frame allocation path.
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

        previous = {
          disposal: descriptor.disposal,
          left: descriptor.left,
          top: descriptor.top,
          width: descriptor.width,
          height: descriptor.height,
        };

        if (!selectsFrame(index, timing)) {
          // A dropped frame's time is carried into the next kept one. Without
          // this, "keep 1 in 3" plays three times faster and ends three times
          // sooner — the user asked for fewer frames, not a different animation.
          carriedDelayMs += normaliseDelay(descriptor.delay);
          continue;
        }

        geometry.apply(screen, gif.width, gif.height, out);
        emitted += 1;

        const durationMs = normaliseDelay(descriptor.delay) + carriedDelayMs;
        carriedDelayMs = 0;

        yield {
          rgba: new Uint8Array(
            outCtx.getImageData(0, 0, geometry.outputWidth, geometry.outputHeight).data.buffer,
          ),
          durationMs,
        };
      }
    },
  };
}
