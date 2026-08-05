/**
 * Previews. `gifenc` only, and **never** the final export.
 *
 * A preview exists to answer "is this the crop I meant?" in under a second, so
 * it trades quality for latency deliberately: a strided handful of frames, a
 * small palette, no dithering. Routing an export through here would ship that
 * trade to the user's file, which is why the two paths do not share a function.
 */

import { encodeWithGifenc } from "./gifenc";
import { strideSample } from "../ops/frame-select";
import type { DecodedFrame } from "../types";

/** Enough to read as motion, few enough to encode while a slider is moving. */
const PREVIEW_FRAMES = 8;
const PREVIEW_COLOURS = 64;

/** The first frame, as a transferable bitmap for the result panel. */
export async function firstFrameBitmap(
  frame: DecodedFrame,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  // See `encode/video.ts` for why this narrowing is sound.
  const view = new Uint8ClampedArray(
    frame.rgba.buffer,
    frame.rgba.byteOffset,
    frame.rgba.byteLength,
  ) as Uint8ClampedArray<ArrayBuffer>;
  return createImageBitmap(new ImageData(view, width, height));
}

export function encodePreviewGif(
  frames: readonly DecodedFrame[],
  width: number,
  height: number,
): Uint8Array {
  const sample = strideSample(frames, PREVIEW_FRAMES);
  return encodeWithGifenc({
    frames: sample,
    width,
    height,
    colours: PREVIEW_COLOURS,
    // One palette across the preview: it is faster, and palette flicker between
    // frames would be read as a defect in the source rather than in the preview.
    perFramePalette: false,
  });
}
