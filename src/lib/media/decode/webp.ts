/**
 * Animated WebP decoding: RIFF splitter plus the browser's own still-image
 * decoder, on every engine.
 *
 * ── Why `ImageDecoder` is gone ──────────────────────────────────────────────
 * It was the only API that decodes animated WebP directly, and Safari has never
 * shipped it at any version — Firefox only from 133. `plan.md` ratified the same
 * shape for GIF and for the same reason: **one decode path, no per-engine
 * special case.** Keeping `ImageDecoder` on Chromium and a splitter everywhere
 * else would ship the least-exercised code to the engine that is hardest to
 * debug, which is precisely backwards.
 *
 * `webp-riff.ts` turns each ANMF frame back into a standalone still WebP;
 * `createImageBitmap()` decodes it, natively, everywhere. No new dependency and
 * no second `.wasm` to boot through the CSP.
 *
 * ── Compositing is this file's real job ─────────────────────────────────────
 * An animated WebP is not a sequence of complete pictures. Each frame carries a
 * rectangle, an offset, a blend rule and a disposal rule, and the animation is
 * what you get by applying them in order to a persistent canvas. A decoder that
 * yields the raw frames — which is what "just decode each ANMF" would do — emits
 * fragments on empty backgrounds. The canvas below is the animation; each yielded
 * frame is a snapshot of it.
 */

import { FrameGeometry } from "../ops/geometry";
import { selectsFrame } from "../ops/frame-select";
import { parseAnimatedWebp, type AnimatedWebp } from "./webp-riff";
import type { DecodedFrame, FrameSource, InputProbe, TimingSpec } from "../types";

async function readAnimated(
  file: Blob,
  options?: { rebuild: boolean },
): Promise<AnimatedWebp> {
  const parsed = parseAnimatedWebp(new Uint8Array(await file.arrayBuffer()), options);
  if (!parsed) throw new Error("Not an animated WebP");
  return parsed;
}

export async function probeWebp(
  file: Blob,
  declaredExtension: string | null,
): Promise<InputProbe> {
  // Headers only, and no decode at all. The canvas size is in VP8X and the frame
  // count is the number of ANMF chunks. The old `ImageDecoder` probe decoded
  // frame zero purely to learn the dimensions, which spent a full frame's memory
  // before admission control — whose entire job is deciding whether this device
  // can afford that memory — had run. `rebuild: false` keeps the same discipline
  // for the splitter: rebuilding every frame would allocate the animation's
  // compressed size a second time to answer a question the headers contain.
  const animation = await readAnimated(file, { rebuild: false });

  return {
    format: "webp",
    declaredExtension,
    width: animation.width,
    height: animation.height,
    durationSec: animation.durationMs / 1000,
    frameCount: animation.frameCount,
    codec: "webp",
    decodable: true,
    rotationDegrees: 0,
  };
}

export interface WebpSourceOptions {
  timing?: TimingSpec;
  maxFrames?: number;
}

export async function webpFrameSource(
  file: Blob,
  geometry: FrameGeometry,
  { timing = {}, maxFrames }: WebpSourceOptions = {},
): Promise<FrameSource> {
  const animation = await readAnimated(file);
  const frameCount = animation.frames.length;

  let selected = 0;
  for (let index = 0; index < frameCount; index += 1) {
    if (selectsFrame(index, timing)) selected += 1;
  }
  const total = maxFrames ? Math.min(maxFrames, selected) : selected;

  return {
    width: geometry.outputWidth,
    height: geometry.outputHeight,
    frameCount: total,
    async *frames(signal?: AbortSignal): AsyncGenerator<DecodedFrame> {
      // The composited animation, at *source* size. Geometry is applied when a
      // frame is emitted, not here: the canvas has to stay at canvas size or the
      // per-frame offsets no longer mean anything.
      const canvas = new OffscreenCanvas(animation.width, animation.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");

      const out = geometry.createOutputCanvas();
      const outCtx = out.getContext("2d", { willReadFrequently: true });
      if (!outCtx) throw new Error("OffscreenCanvas 2D context unavailable");

      let emitted = 0;
      // Time owed by frames the stride skipped, paid to the next kept frame —
      // the same carry as `decode/gif.ts`.
      let carriedDelayMs = 0;

      for (const [index, frame] of animation.frames.entries()) {
        if (signal?.aborted) return;
        if (emitted >= total) return;

        // Every frame is composited even when it is skipped. Skipping the
        // *compositing* would be wrong rather than merely fast: a later kept
        // frame may be a small rectangle that only makes sense on top of the
        // ones before it, so the canvas has to have seen them.
        const bitmap = await createImageBitmap(
          new Blob([toStandaloneBuffer(frame.bytes)], { type: "image/webp" }),
        );
        try {
          // "Do not blend" means overwrite, including the alpha — so the
          // rectangle is cleared first rather than drawn over.
          if (frame.blend === "replace") {
            ctx.clearRect(frame.x, frame.y, frame.width, frame.height);
          }
          ctx.drawImage(bitmap, frame.x, frame.y);
        } finally {
          // `ImageBitmap` holds a platform buffer that garbage collection is
          // slow to reclaim. A hundred unclosed ones is the fastest route to the
          // ceiling this engine spends its effort staying under.
          bitmap.close();
        }

        if (!selectsFrame(index, timing)) {
          carriedDelayMs += frame.durationMs;
        } else {
          geometry.apply(canvas, animation.width, animation.height, out);
          emitted += 1;

          const durationMs = frame.durationMs + carriedDelayMs;
          carriedDelayMs = 0;

          yield {
            rgba: new Uint8Array(
              outCtx.getImageData(0, 0, geometry.outputWidth, geometry.outputHeight)
                .data.buffer,
            ),
            durationMs,
          };
        }

        // Disposal happens after the frame has been shown, not before the next
        // one is drawn — the distinction matters when the next frame's rectangle
        // does not cover this one's.
        if (frame.dispose === "background") {
          ctx.clearRect(frame.x, frame.y, frame.width, frame.height);
        }
      }
    },
  };
}

/**
 * Copies into a standalone ArrayBuffer.
 *
 * The rebuilt frame is a fresh allocation, but `Blob` is given whatever buffer
 * backs the view — and a future change that made `rebuildFrame` return a
 * subarray of the source file would silently hand the whole WebP to every
 * `createImageBitmap` call. One copy of a compressed frame is cheap insurance.
 */
function toStandaloneBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
