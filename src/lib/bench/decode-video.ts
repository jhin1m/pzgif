/**
 * Video decoding, via `mediabunny`.
 *
 * One library replaces `mp4box.js`, `mp4-muxer` and `webm-muxer` — the latter
 * two deprecated by their own author. Beyond that consolidation, `CanvasSink`
 * with `poolSize: 1` is what makes decode memory a constant rather than a
 * function of clip length, which is the single biggest lever available on the
 * memory ceiling and it costs nothing.
 */

import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { fitWidth } from "@/lib/media/downscale";
import type { FrameSource } from "./types";

export interface VideoProbe {
  /** Coded frame size, before any rotation is applied. */
  codedWidth: number;
  codedHeight: number;
  /** Display size, after container rotation. This is what the user expects. */
  displayWidth: number;
  displayHeight: number;
  rotationDegrees: number;
  durationSec: number;
  codec: string | null;
}

export async function probeVideo(file: Blob): Promise<VideoProbe> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("No video track in this file");

  const rotation = await track.getRotation();
  const durationSec = await input.computeDuration();

  return {
    codedWidth: track.codedWidth,
    codedHeight: track.codedHeight,
    displayWidth: track.displayWidth,
    displayHeight: track.displayHeight,
    rotationDegrees: rotation,
    durationSec,
    codec: await track.getCodecParameterString(),
  };
}

/**
 * Streams frames at output size, resampled to `fps`.
 *
 * Rotation is left to `CanvasSink`, whose `rotation` option defaults to whatever
 * the container declares. Overriding it with 0 — or reading `codedWidth` instead
 * of `displayWidth` — is how every portrait phone upload ends up sideways, which
 * is why `portrait-rotated.mp4` is in the fixture corpus and why its pass
 * condition is a dimension check rather than a glance.
 */
export async function videoFrameSource(
  file: Blob,
  targetWidth: number,
  fps: number,
  { maxFrames }: { maxFrames?: number } = {},
): Promise<FrameSource> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("No video track in this file");

  const durationSec = await input.computeDuration();
  const { width, height } = fitWidth(
    track.displayWidth,
    track.displayHeight,
    targetWidth,
  );

  const planned = Math.max(1, Math.floor(durationSec * fps));
  const total = maxFrames ? Math.min(maxFrames, planned) : planned;

  return {
    width,
    height,
    frameCount: total,
    async *frames() {
      const sink = new CanvasSink(track, {
        width,
        height,
        fit: "contain",
        // `rotation` is deliberately not passed: its default is the container's
        // own metadata, which is exactly what we want honoured.
        poolSize: 1,
      });

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");

      const stepSec = 1 / fps;
      const durationMs = Math.round(1000 / fps);
      let emitted = 0;
      let nextSampleSec = 0;

      // Iterating in presentation order and sampling against a clock, rather
      // than trusting decode order: Safari below 26.4 can emit H.264 frames out
      // of order, and a resampler that assumes monotonic timestamps silently
      // reorders the animation rather than failing.
      let lastTimestamp = -Infinity;
      for await (const wrapped of sink.canvases()) {
        if (emitted >= total) break;
        if (wrapped.timestamp < lastTimestamp) continue;
        lastTimestamp = wrapped.timestamp;
        if (wrapped.timestamp + 1e-6 < nextSampleSec) continue;

        // `CanvasSink` has already rotated, fitted and resized to the output
        // box, so this is a straight blit, not another scale.
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(wrapped.canvas, 0, 0);

        yield {
          rgba: new Uint8Array(
            ctx.getImageData(0, 0, width, height).data.buffer,
          ),
          durationMs,
        };

        emitted += 1;
        nextSampleSec += stepSec;
      }
    },
  };
}
