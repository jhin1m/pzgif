/**
 * The benchmark harness's view of video decoding.
 *
 * The decoder was promoted to `src/lib/media/decode/video.ts` in Phase 4. What
 * remains here are adapters that keep the Phase 1 specs — G7's container and
 * rotation checks in particular — calling the shape they were written against,
 * so their recorded artefacts stay comparable across phases.
 */

import { probeVideo as mediaProbeVideo, videoFrameSource as mediaVideoFrameSource } from "@/lib/media/decode/video";
import { FrameGeometry } from "@/lib/media/ops/geometry";
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
  /** Added in Phase 4: demuxing a container does not mean the codec decodes. */
  decodable: boolean;
}

export async function probeVideo(file: Blob): Promise<VideoProbe> {
  const probe = await mediaProbeVideo(file, null);
  return {
    codedWidth: probe.codedWidth,
    codedHeight: probe.codedHeight,
    displayWidth: probe.width,
    displayHeight: probe.height,
    rotationDegrees: probe.rotationDegrees,
    durationSec: probe.durationSec ?? 0,
    codec: probe.codec,
    decodable: probe.decodable,
  };
}

/** Width-and-fps adapter over the production decoder, for the Phase 1 specs. */
export async function videoFrameSource(
  file: Blob,
  targetWidth: number,
  fps: number,
  { maxFrames }: { maxFrames?: number } = {},
): Promise<FrameSource> {
  const probe = await mediaProbeVideo(file, null);
  const geometry = new FrameGeometry(probe.width, probe.height, { targetWidth });
  return mediaVideoFrameSource(file, geometry, fps, { maxFrames });
}
