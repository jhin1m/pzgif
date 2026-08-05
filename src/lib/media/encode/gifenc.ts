/**
 * `gifenc` encoding — the MIT-licensed alternative, and the escape hatch.
 *
 * Three roles, all of them load-bearing:
 *
 *  - **The deadlock fallback.** gifski carries an open upstream deadlock issue
 *    the maintainer attributes to "hacks I implemented to get this to compile".
 *    G1's 2,500-run soak found zero hangs, which bounds the rate at ~0.12% with
 *    95% confidence rather than showing it absent — one job in eight hundred is
 *    not something to ship knowingly without a second encoder.
 *  - **The Firefox path.** gifski's WASM measured 12-14x slower under
 *    SpiderMonkey than under V8 or JavaScriptCore, 51.8 s against a 30 s
 *    viability floor. `gifenc`, being plain JavaScript, runs at parity on all
 *    three engines.
 *  - **Determinate progress.** It encodes frame by frame in JS, so unlike gifski
 *    it can report a real counter — and it can stop when asked.
 *
 * It has no dithering and quantises per frame; its own README says it suits flat
 * vector-style graphics better than photographs.
 */

import { applyPalette, GIFEncoder, quantize, type Palette } from "gifenc";
import type { DecodedFrame } from "../types";

export interface GifencEncodeArgs {
  frames: readonly DecodedFrame[];
  width: number;
  height: number;
  /** Palette size, 2-256. `gifenc`'s only real quality dial. */
  colours: number;
  /**
   * Recompute the palette per frame instead of reusing the first frame's.
   *
   * Per-frame palettes track colour change through the animation and generally
   * look better; one global palette encodes smaller and is closer to what gifski
   * effectively does.
   */
  perFramePalette?: boolean;
  /** Called after each frame. The only determinate GIF progress the engine has. */
  onFrame?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export function encodeWithGifenc({
  frames,
  width,
  height,
  colours,
  perFramePalette = true,
  onFrame,
  signal,
}: GifencEncodeArgs): Uint8Array {
  if (frames.length === 0) throw new Error("gifenc needs at least one frame");

  const encoder = GIFEncoder();
  let globalPalette: Palette | null = null;

  for (const [index, frame] of frames.entries()) {
    // Cancellation is cooperative and checked per frame. A GIF-sized frame
    // quantises in single-digit milliseconds, so the 500 ms cancel budget is met
    // with room to spare — unlike gifski, which can only be cancelled by
    // terminating its worker.
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");

    const palette: Palette =
      perFramePalette || !globalPalette
        ? quantize(frame.rgba, colours, { format: "rgb565" })
        : globalPalette;
    globalPalette ??= palette;

    encoder.writeFrame(applyPalette(frame.rgba, palette), width, height, {
      palette,
      delay: frame.durationMs,
      // 0 means loop forever here. gifski spells the same intent by *omitting*
      // its `repeat` option and reads an explicit 0 as "play once" — the two
      // libraries invert each other on this single number.
      repeat: 0,
    });
    onFrame?.(index + 1, frames.length);
  }

  encoder.finish();
  return encoder.bytes();
}

/**
 * Encodes repeatedly, reducing the palette until the output fits `targetBytes`.
 *
 * This is what the Discord preset routes drive: a byte budget is the *given*,
 * and colours are what gets spent to reach it. Returns the closest result at or
 * under the target, or the smallest achievable output if even a 2-colour palette
 * overshoots — which is a real answer the preset UI has to be able to state.
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
