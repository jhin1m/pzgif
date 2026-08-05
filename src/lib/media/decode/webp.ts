/**
 * Animated WebP decoding, via `ImageDecoder`.
 *
 * ── Why there is no fallback here yet ───────────────────────────────────────
 * `ImageDecoder` is absent from Safari at every version and arrived in Firefox
 * only at 133, so `webp-to-gif` has no decode path on Safari. The alternative is
 * a hand-rolled RIFF/ANMF splitter feeding a WebP still-image decoder per frame
 * — roughly 150 lines plus its own correctness surface — and that call belongs
 * to Phase 7, where the tool actually ships. Until then this decoder reports the
 * truth through `capability.imageDecoder`, and `plan.ts` refuses with
 * `browser-unsupported` rather than letting a Safari user pick a file and watch
 * it fail.
 *
 * Animated WebP is also the lowest-volume input in the MVP, which is why the
 * cost is deferred rather than paid speculatively.
 */

import { FrameGeometry } from "../ops/geometry";
import { selectsFrame } from "../ops/frame-select";
import type { DecodedFrame, FrameSource, InputProbe, TimingSpec } from "../types";

/**
 * The slice of `ImageDecoder` this file uses.
 *
 * Declared locally rather than pulled from a DOM lib: the API is not in
 * TypeScript's `lib.dom` yet, and adding `@types/dom-webcodecs` repo-wide to
 * name four members would put a second, competing definition of `VideoFrame` in
 * scope for every file that touches the engine.
 */
interface ImageDecoderTrack {
  frameCount: number;
  repetitionCount: number;
  animated: boolean;
}

interface ImageDecoderLike {
  tracks: {
    ready: Promise<void>;
    selectedTrack: ImageDecoderTrack | null;
  };
  decode(options: { frameIndex: number }): Promise<{
    image: CanvasImageSource & {
      displayWidth: number;
      displayHeight: number;
      /** Microseconds. Null for a still image. */
      duration: number | null;
      close(): void;
    };
  }>;
  close(): void;
}

type ImageDecoderConstructor = new (init: {
  data: ArrayBuffer | Uint8Array;
  type: string;
}) => ImageDecoderLike;

function imageDecoderConstructor(): ImageDecoderConstructor {
  const ctor = (globalThis as { ImageDecoder?: ImageDecoderConstructor }).ImageDecoder;
  if (!ctor) throw new Error("ImageDecoder is unavailable in this browser");
  return ctor;
}

/** Matches the GIF clamp, so a WebP→GIF round trip keeps its apparent speed. */
const DEFAULT_DELAY_MS = 100;
const MIN_DELAY_MS = 20;

function toDelayMs(durationMicroseconds: number | null): number {
  if (durationMicroseconds === null || !Number.isFinite(durationMicroseconds)) {
    return DEFAULT_DELAY_MS;
  }
  const ms = Math.round(durationMicroseconds / 1000);
  return ms < MIN_DELAY_MS ? DEFAULT_DELAY_MS : ms;
}

export async function probeWebp(
  file: Blob,
  declaredExtension: string | null,
): Promise<InputProbe> {
  const Ctor = imageDecoderConstructor();
  const decoder = new Ctor({ data: await file.arrayBuffer(), type: "image/webp" });
  try {
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    const { image } = await decoder.decode({ frameIndex: 0 });
    const width = image.displayWidth;
    const height = image.displayHeight;
    image.close();

    return {
      format: "webp",
      declaredExtension,
      width,
      height,
      durationSec: null,
      frameCount: track?.frameCount ?? 1,
      codec: "webp",
      decodable: true,
      rotationDegrees: 0,
    };
  } finally {
    decoder.close();
  }
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
  const Ctor = imageDecoderConstructor();
  const data = await file.arrayBuffer();
  const decoder = new Ctor({ data, type: "image/webp" });
  await decoder.tracks.ready;
  const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 1;

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
      const out = geometry.createOutputCanvas();
      const outCtx = out.getContext("2d", { willReadFrequently: true });
      if (!outCtx) throw new Error("OffscreenCanvas 2D context unavailable");

      let emitted = 0;
      // Time owed by frames the stride skipped, paid to the next kept frame —
      // see the same carry in `decode/gif.ts`.
      let carriedDelayMs = 0;

      try {
        for (let index = 0; index < frameCount; index += 1) {
          if (signal?.aborted) return;
          if (emitted >= total) return;
          if (!selectsFrame(index, timing)) {
            // A skipped frame still has to be decoded to learn its duration —
            // `ImageDecoder` exposes timing only on the decoded frame — but it is
            // closed immediately and never drawn. Paying that decode is what
            // keeps a strided animation the same length as its source.
            const skipped = await decoder.decode({ frameIndex: index });
            carriedDelayMs += toDelayMs(skipped.image.duration);
            skipped.image.close();
            continue;
          }

          // Each frame is decoded and closed immediately. `VideoFrame` holds a
          // platform buffer that garbage collection does not reclaim promptly,
          // and a hundred unclosed frames is the fastest way to hit the ceiling
          // this engine spends its effort staying under.
          const { image } = await decoder.decode({ frameIndex: index });
          try {
            geometry.apply(image, image.displayWidth, image.displayHeight, out);
            emitted += 1;

            const durationMs = toDelayMs(image.duration) + carriedDelayMs;
            carriedDelayMs = 0;

            yield {
              rgba: new Uint8Array(
                outCtx.getImageData(0, 0, geometry.outputWidth, geometry.outputHeight).data
                  .buffer,
              ),
              durationMs,
            };
          } finally {
            image.close();
          }
        }
      } finally {
        decoder.close();
      }
    },
  };
}
