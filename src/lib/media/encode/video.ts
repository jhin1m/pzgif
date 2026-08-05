/**
 * Video encoding, via `mediabunny`'s muxer over WebCodecs.
 *
 * Three decisions here are not preferences:
 *
 *  - **Dimensions are rounded down to even.** H.264 in yuv420p rejects odd
 *    sizes, and GIFs are frequently odd-sized — the fixture corpus carries a
 *    499x281 one for exactly this reason. An odd width fails at
 *    `VideoEncoder.configure`, long after the user pressed the button.
 *  - **The codec is probed, never assumed.** `avc1.4D402A` (Main, level 4.2) is
 *    the universally playable default, but hardware support is a device fact and
 *    a hardcoded table ages into a bug. The chain falls back through Baseline to
 *    VP9 and VP8 in WebM.
 *  - **The output is video-only.** No silent audio track is added: every major
 *    platform already produces silent MP4s from GIFs, and a track-less MP4
 *    autoplays fine when muted. A fake silent track is bytes spent to look
 *    conventional.
 */

import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
} from "mediabunny";
import type { DecodedFrame } from "../types";

/** Ordered best-first. Each entry is what `VideoEncoder` is actually asked about. */
const CODEC_CHAIN = [
  { family: "avc", codec: "avc1.4D402A", container: "mp4" },
  { family: "avc", codec: "avc1.42E01E", container: "mp4" },
  { family: "vp9", codec: "vp09.00.10.08", container: "webm" },
  { family: "vp8", codec: "vp8", container: "webm" },
] as const;

export interface VideoCodecChoice {
  family: (typeof CODEC_CHAIN)[number]["family"];
  codec: string;
  container: "mp4" | "webm";
}

/**
 * Asks the browser which codec it can actually encode at this size.
 *
 * Size is part of the question: level 4.2 caps resolution, and a device may
 * support the profile while refusing the dimensions.
 */
export async function chooseVideoCodec(
  width: number,
  height: number,
  preferContainer?: "mp4" | "webm",
): Promise<VideoCodecChoice | null> {
  const scope = globalThis as typeof globalThis & {
    VideoEncoder?: {
      isConfigSupported(config: {
        codec: string;
        width: number;
        height: number;
      }): Promise<{ supported?: boolean }>;
    };
  };
  if (typeof scope.VideoEncoder?.isConfigSupported !== "function") return null;

  const ordered = preferContainer
    ? [...CODEC_CHAIN].sort((a, b) =>
        a.container === preferContainer ? -1 : b.container === preferContainer ? 1 : 0,
      )
    : CODEC_CHAIN;

  for (const candidate of ordered) {
    try {
      const support = await scope.VideoEncoder.isConfigSupported({
        codec: candidate.codec,
        width,
        height,
      });
      if (support.supported === true) return { ...candidate };
    } catch {
      // A rejected probe is a "no", not a failure worth surfacing.
    }
  }
  return null;
}

export interface VideoEncodeArgs {
  frames: readonly DecodedFrame[];
  width: number;
  height: number;
  container: "mp4" | "webm";
  bitrateKbps?: number;
  onFrame?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Bits per pixel per second, tuned so a 480x270 clip lands around 1.2 Mbps. */
const BITS_PER_PIXEL_SECOND = 0.09;

export async function encodeVideo({
  frames,
  width,
  height,
  container,
  bitrateKbps,
  onFrame,
  signal,
}: VideoEncodeArgs): Promise<{ blob: Blob; codec: VideoCodecChoice }> {
  if (frames.length === 0) throw new Error("No frames to encode");

  const evenWidth = Math.max(2, width & ~1);
  const evenHeight = Math.max(2, height & ~1);

  const codec = await chooseVideoCodec(evenWidth, evenHeight, container);
  if (!codec) throw new Error("No encodable video codec on this device");

  const totalMs = frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  const frameRate = Math.max(1, Math.round((frames.length * 1000) / Math.max(1, totalMs)));
  const bitrate =
    (bitrateKbps ?? 0) > 0
      ? bitrateKbps! * 1000
      : Math.round(evenWidth * evenHeight * frameRate * BITS_PER_PIXEL_SECOND);

  const canvas = new OffscreenCanvas(evenWidth, evenHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");

  // The *chosen* codec's container, not the requested one. A device without AVC
  // encode falls back to VP9 or VP8, and muxing those into an MP4 either throws
  // inside the muxer or produces a file labelled `video/mp4` that nothing plays.
  const chosenContainer = codec.container;
  const output = new Output({
    format: chosenContainer === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new BufferTarget(),
  });

  const source = new CanvasSource(canvas, { codec: codec.family, bitrate });
  output.addVideoTrack(source, { frameRate });
  await output.start();

  let timestampSec = 0;
  for (const [index, frame] of frames.entries()) {
    if (signal?.aborted) {
      await output.cancel();
      throw new DOMException("Cancelled", "AbortError");
    }

    // The frame arrives as output-sized RGBA, so this is a straight put, not a
    // scale. Rounding to even may shave one row or column; that is why the
    // rounding happens here and not after something has been composited to it.
    // The narrowing is the same one `decode/gif.ts` documents: `ImageData`
    // refuses a shared backing store, and this project bans that construct
    // outright — it needs cross-origin isolation, which breaks ad serving, and
    // `pnpm check:forbidden` fails the build on any reference to it — so the
    // buffer is always a plain ArrayBuffer. Narrowing rather than copying keeps
    // this off the per-frame allocation path.
    const view = new Uint8ClampedArray(
      frame.rgba.buffer,
      frame.rgba.byteOffset,
      frame.rgba.byteLength,
    ) as Uint8ClampedArray<ArrayBuffer>;
    const image = new ImageData(view, width, height);
    ctx.putImageData(image, 0, 0);

    const durationSec = frame.durationMs / 1000;
    // Awaited: `add()` resolves when the encoder has room. Firing and forgetting
    // queues every frame at once, which both defeats the encoder's backpressure
    // and makes `onFrame` a submission counter rather than an encode counter —
    // a bar that reaches 100% and then waits.
    await source.add(timestampSec, durationSec);
    timestampSec += durationSec;
    onFrame?.(index + 1, frames.length);
  }

  source.close();
  await output.finalize();

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error("Muxer produced no output");

  return {
    blob: new Blob([buffer], {
      type: chosenContainer === "mp4" ? "video/mp4" : "video/webm",
    }),
    codec,
  };
}
