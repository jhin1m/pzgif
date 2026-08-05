/**
 * Probe and open — the two questions every job asks of its input.
 *
 * Probing is separated from opening on purpose: admission control has to run on
 * the probe's answer *before* a decoder is constructed, because constructing one
 * is where memory starts being spent.
 */

import { sniffFile } from "../sniff";
import { unsupportedFormatError } from "../errors";
import { getRoute } from "@/lib/tools/registry";
import type { FrameSource, InputProbe, JobSpec, MediaError } from "../types";
import { FrameGeometry } from "../ops/geometry";
import { gifFrameSource, readGifMetadata } from "./gif";
import { probeVideo, videoFrameSource } from "./video";
import { probeWebp, webpFrameSource } from "./webp";
import { probeStill } from "./still";

export { readGifMetadata, normaliseDelay } from "./gif";
export { probeVideo } from "./video";

/**
 * Identifies the input from its bytes and reads its dimensions.
 *
 * The extension is never trusted. A file renamed `.gif` that is really an MP4 is
 * common — social platforms hand them out — and routing it by name lands it in
 * the generic `decode-failed` bucket instead of the tool that would have worked.
 */
export async function probeInput(file: File): Promise<InputProbe> {
  const sniffed = await sniffFile(file);

  switch (sniffed.format) {
    case "gif": {
      const metadata = readGifMetadata(await file.arrayBuffer());
      return {
        format: "gif",
        declaredExtension: sniffed.declaredExtension,
        width: metadata.width,
        height: metadata.height,
        durationSec:
          metadata.rawDelaysMs.reduce((sum, delay) => sum + Math.max(delay, 20), 0) / 1000,
        frameCount: metadata.frameCount,
        codec: "gif",
        decodable: true,
        rotationDegrees: 0,
      };
    }

    case "video":
      return probeVideo(file, sniffed.declaredExtension);

    case "webp": {
      if (sniffed.animated === false) {
        // A still WebP cannot become an animation, and `webp-to-gif` producing a
        // one-frame GIF would be a worse answer than saying so — gifski refuses
        // single frames outright anyway.
        return {
          ...(await probeStill(file, sniffed.declaredExtension)),
          format: "image",
        };
      }
      try {
        return await probeWebp(file, sniffed.declaredExtension);
      } catch {
        // No `ImageDecoder` — Safari at every version, Firefox below 133. The
        // container is understood; this engine just cannot read it.
        return {
          format: "webp",
          declaredExtension: sniffed.declaredExtension,
          width: 0,
          height: 0,
          durationSec: null,
          frameCount: null,
          codec: "webp",
          decodable: false,
          rotationDegrees: 0,
        };
      }
    }

    case "image":
      return probeStill(file, sniffed.declaredExtension);

    default:
      return {
        format: "unknown",
        declaredExtension: sniffed.declaredExtension,
        width: 0,
        height: 0,
        durationSec: null,
        frameCount: null,
        codec: null,
        decodable: false,
        rotationDegrees: 0,
      };
  }
}

/**
 * Whether this tool takes what was actually dropped on it.
 *
 * Checked against the registry rather than against the decoders, because the
 * question is a product one: `gif-compressor` can technically decode the MP4
 * that arrived named `party.gif`, but the user chose a GIF tool and the right
 * answer is to hand them `mp4-to-gif` with the file still loaded. Deciding this
 * from the *sniffed* format rather than the extension is what makes that
 * possible at all.
 */
export function inputRefusal(probe: InputProbe, spec: JobSpec): MediaError | null {
  const route = getRoute(spec.toolSlug);
  const accepted = route?.inputFormats ?? [];

  const matches =
    probe.format === "gif"
      ? accepted.includes("gif")
      : probe.format === "webp"
        ? accepted.includes("webp")
        : probe.format === "video"
          ? accepted.some((format) => format === "mp4" || format === "mov" || format === "webm")
          : false;

  if (matches) return null;
  return unsupportedFormatError({
    format: probe.format,
    extension: probe.declaredExtension,
    fromSlug: spec.toolSlug,
  });
}

/**
 * Constructs the decoder for an accepted job.
 *
 * `geometry` is built once from the *plan's* width, not the spec's — the plan is
 * what admission control agreed to, and decoding at the requested size and
 * shrinking afterwards would spend the memory the plan exists to bound.
 */
export async function openFrameSource(
  file: File,
  probe: InputProbe,
  spec: JobSpec,
  planWidth: number,
  planFps: number,
  maxFrames: number,
): Promise<{ source: FrameSource; geometry: FrameGeometry }> {
  const geometry = new FrameGeometry(
    probe.width,
    probe.height,
    { ...spec.geometry, targetWidth: planWidth },
    { even: spec.output.kind === "video" },
  );

  switch (probe.format) {
    case "gif":
      return {
        geometry,
        source: gifFrameSource(await file.arrayBuffer(), geometry, {
          timing: spec.timing,
          maxFrames,
        }),
      };
    case "video":
      return {
        geometry,
        source: await videoFrameSource(file, geometry, planFps, {
          timing: spec.timing,
          maxFrames,
        }),
      };
    case "webp":
      return {
        geometry,
        source: await webpFrameSource(file, geometry, { timing: spec.timing, maxFrames }),
      };
    default:
      throw unsupportedFormatError({
        format: probe.format,
        extension: probe.declaredExtension,
        fromSlug: spec.toolSlug,
      });
  }
}
