/**
 * `gifenc` encoding — the MIT-licensed alternative, and the fallback that
 * decides whether the AGPL obligation is worth carrying.
 *
 * Two roles:
 *  - **Gate G6.** If gifski is not visibly better than this at matched bytes,
 *    the licensing cost buys nothing and gifski should be dropped.
 *  - **The deadlock escape hatch.** gifski can hang (upstream issue #5). A
 *    per-job automatic fallback needs a second encoder that already works.
 *
 * `gifenc` has no dithering and quantises per frame. Its own README says it
 * suits flat vector-style graphics better than photographs — which is precisely
 * why G6 judges both `flat-art.gif` and `photo-grain.gif` rather than one.
 */

import { applyPalette, GIFEncoder, quantize, type Palette } from "gifenc";
import type { DecodedFrame } from "./types";

export interface GifencEncodeArgs {
  frames: DecodedFrame[];
  width: number;
  height: number;
  /** Palette size, 2-256. This is `gifenc`'s only real quality dial. */
  colours: number;
  /**
   * Recompute the palette per frame instead of reusing the first frame's.
   *
   * Per-frame palettes track colour change through the animation and generally
   * look better; one global palette encodes smaller and is what gifski
   * effectively does. G6 matches on output bytes, so this changes which side of
   * the trade the comparison sits on — keep it explicit rather than implied.
   */
  perFramePalette?: boolean;
}

export function encodeWithGifenc({
  frames,
  width,
  height,
  colours,
  perFramePalette = true,
}: GifencEncodeArgs): Uint8Array {
  if (frames.length === 0) throw new Error("gifenc needs at least one frame");

  const encoder = GIFEncoder();
  let globalPalette: Palette | null = null;

  for (const frame of frames) {
    const palette: Palette =
      perFramePalette || !globalPalette
        ? quantize(frame.rgba, colours, { format: "rgb565" })
        : globalPalette;
    globalPalette ??= palette;

    encoder.writeFrame(applyPalette(frame.rgba, palette), width, height, {
      palette,
      delay: frame.durationMs,
      // 0 means loop forever here. gifski spells the same intent by *omitting*
      // its `repeat` option, and reads an explicit 0 as "play once" — the two
      // libraries invert each other on this single number.
      repeat: 0,
    });
  }

  encoder.finish();
  return encoder.bytes();
}

/**
 * Encodes repeatedly, reducing the palette until the output fits `targetBytes`.
 *
 * G6 compares the two encoders **at matched output size**, and gifski's quality
 * dial and gifenc's palette size are not comparable quantities — so the only
 * fair way to line them up is to hold bytes constant and let each library spend
 * them however it likes. Returns the closest result at or under the target, or
 * the smallest achievable output if even a 2-colour palette overshoots.
 */
export function encodeGifencToByteBudget(
  args: Omit<GifencEncodeArgs, "colours">,
  targetBytes: number,
): { bytes: Uint8Array; colours: number; attempts: number } {
  const ladder = [256, 192, 128, 96, 64, 48, 32, 24, 16, 12, 8, 4, 2];
  let attempts = 0;
  let smallest: { bytes: Uint8Array; colours: number } | null = null;

  for (const colours of ladder) {
    attempts += 1;
    const bytes = encodeWithGifenc({ ...args, colours });
    if (!smallest || bytes.byteLength < smallest.bytes.byteLength) {
      smallest = { bytes, colours };
    }
    if (bytes.byteLength <= targetBytes) return { bytes, colours, attempts };
  }

  return { ...smallest!, attempts };
}
