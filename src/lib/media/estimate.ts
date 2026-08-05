/**
 * Output-size prediction — the "≈ 1.8 MB" readout.
 *
 * ── Why a formula on the settings cannot work ───────────────────────────────
 * The calibration sweep measured a **22x spread in bytes-per-pixel at identical
 * settings**, driven entirely by content: 0.046 for flat vector art against
 * 1.035 for photographic grain. A model keyed on (width, fps, quality, colours)
 * is blind to the dominant variable, so it is not slightly wrong — it is wrong by
 * an order of magnitude, on exactly the files people care about.
 *
 * So the primary path measures instead of predicting: encode two small strided
 * samples at the real settings with the real encoder, and read the **marginal**
 * cost of a frame off the difference.
 *
 *     bytesPerFrame = (bytes(n2) - bytes(n1)) / (n2 - n1)
 *
 * Differencing is what makes this work at sample size. A single small sample is
 * dominated by the header and palette, which are amortised over 5 frames instead
 * of 500 and would inflate the estimate several-fold. Subtracting two samples
 * cancels every fixed cost and leaves the quantity that actually scales.
 *
 * ── Why this matters beyond a readout ──────────────────────────────────────
 * The estimate seeds the Discord auto-fit search. A bad estimate means a blind
 * search, which means five real encodes against a 30 MB iOS budget — the crash
 * the memory model exists to design out. The readout is the visible half of this
 * function; the search is the expensive half.
 *
 * ── Why the sample encodes are injected rather than called ─────────────────
 * This module must not import an encoder. It is reachable from the *long-lived*
 * pipeline worker, and importing gifski there would instantiate its WASM heap in
 * the one thread that is never terminated — undoing the entire reason the encode
 * worker is disposable. The caller passes an `encodeSample` that routes through
 * that disposable worker instead.
 *
 * ── The output is always a range ───────────────────────────────────────────
 * Never a point value presented as a fact, and never a promise. Near a hard
 * limit the range is what tells the user the honest thing: that it might not fit.
 */

import {
  BPP_ANCHOR_FLAT,
  BPP_ANCHOR_PHOTO,
  BPP_CEILING,
  BPP_FLOOR,
  CURVE_ESTIMATE_SPREAD,
  FLAT_RATIO_AT_FLAT_ANCHOR,
  FLAT_RATIO_AT_PHOTO_ANCHOR,
  GIFENC_COLOUR_SCALE,
  GIFSKI_QUALITY_SCALE,
  SAMPLED_ESTIMATE_SPREAD,
  WIDTH_BPP_SCALE,
  interpolate,
} from "./calibration";
import { strideSample } from "./ops/frame-select";
import type { DecodedFrame, GifEncoderId, SizeEstimate } from "./types";

/** Sample sizes. Small enough to be nearly free, far enough apart to difference. */
const SAMPLE_SMALL = 2;
const SAMPLE_LARGE = 6;

export interface ContentDescriptors {
  /** Share of pixels whose neighbours match. High means flat art. */
  flatPixelRatio: number;
  paletteEntropyBits: number;
}

export interface EstimateSettings {
  width: number;
  height: number;
  frames: number;
  encoder: GifEncoderId;
  quality: number;
  colours: number;
}

function band(bytes: number, spread: number, basis: SizeEstimate["basis"]): SizeEstimate {
  return {
    bytes: Math.round(bytes),
    low: Math.max(0, Math.round(bytes * (1 - spread))),
    high: Math.round(bytes * (1 + spread)),
    basis,
  };
}

/**
 * The settings-only fallback, used when even a sample is too expensive.
 *
 * Two anchors interpolated on flatness, then scaled by the measured quality and
 * width curves. Its spread is deliberately wide: with seven fixtures and one of
 * them photographic, this model's confidence is not high and pretending
 * otherwise would be the failure mode the range exists to prevent.
 */
export function estimateFromCurve(
  settings: EstimateSettings,
  descriptors: ContentDescriptors,
): SizeEstimate {
  const flatness = Math.max(0, Math.min(1, descriptors.flatPixelRatio));
  const span = FLAT_RATIO_AT_FLAT_ANCHOR - FLAT_RATIO_AT_PHOTO_ANCHOR;
  const position = (FLAT_RATIO_AT_FLAT_ANCHOR - flatness) / span;
  const rawBpp = BPP_ANCHOR_FLAT + (BPP_ANCHOR_PHOTO - BPP_ANCHOR_FLAT) * position;
  const bpp = Math.max(BPP_FLOOR, Math.min(BPP_CEILING, rawBpp));

  const qualityScale =
    settings.encoder === "gifski"
      ? interpolate(GIFSKI_QUALITY_SCALE, settings.quality)
      : interpolate(GIFENC_COLOUR_SCALE, settings.colours);
  const widthScale = interpolate(WIDTH_BPP_SCALE, settings.width);

  const bytes =
    bpp * qualityScale * widthScale * settings.width * settings.height * settings.frames;
  return band(bytes, CURVE_ESTIMATE_SPREAD, "curve");
}

/** Encodes a handful of frames at the real settings and reports the byte count. */
export type SampleEncoder = (frames: readonly DecodedFrame[]) => Promise<number>;

/**
 * The measured path: two strided sample encodes, differenced.
 *
 * Costs a fraction of a full encode — eight frames rather than several hundred —
 * and is the only approach that sees the content it is predicting.
 *
 * Returns **null** when it cannot produce a number and has no descriptors to
 * fall back on. Null is a real answer: showing "≈ 0 KB" because a sample encode
 * threw would be a confidently wrong readout, which is worse than no readout.
 */
export async function estimateFromSample(
  frames: readonly DecodedFrame[],
  settings: EstimateSettings,
  encodeSample: SampleEncoder,
  descriptors?: ContentDescriptors,
): Promise<SizeEstimate | null> {
  const fallback = () => (descriptors ? estimateFromCurve(settings, descriptors) : null);

  try {
    if (frames.length <= SAMPLE_LARGE) {
      // Fewer frames than the large sample means the "sample" would be the whole
      // job. Encoding it outright is both cheaper and exact.
      if (frames.length < 2) return fallback();
      const bytes = await encodeSample(frames);
      return band(bytes, SAMPLED_ESTIMATE_SPREAD / 2, "sampled");
    }

    const large = strideSample(frames, SAMPLE_LARGE);
    const small = large.slice(0, SAMPLE_SMALL);

    // Sequential, not concurrent: each sample runs in its own disposable encode
    // worker, and two at once would hold two WASM heaps to save a few hundred
    // milliseconds on a job whose whole point is bounded memory.
    const largeBytes = await encodeSample(large);
    const smallBytes = await encodeSample(small);

    const marginal = (largeBytes - smallBytes) / (SAMPLE_LARGE - SAMPLE_SMALL);
    // A non-positive marginal cost means the difference vanished into noise —
    // near-identical frames, or a palette that dominates. The curve is a better
    // answer than a negative one.
    if (!(marginal > 0)) {
      return (
        fallback() ??
        band(largeBytes * (settings.frames / SAMPLE_LARGE), CURVE_ESTIMATE_SPREAD, "curve")
      );
    }

    const fixed = Math.max(0, largeBytes - marginal * SAMPLE_LARGE);
    return band(fixed + marginal * settings.frames, SAMPLED_ESTIMATE_SPREAD, "sampled");
  } catch {
    // An estimate must never be the thing that fails a job.
    return fallback();
  }
}

/**
 * Whether the estimate is close enough to a hard limit that the range, rather
 * than the midpoint, is the honest thing to show.
 *
 * Discord's emoji budget is 256 KB and its sticker budget 512 KB; being told
 * "≈ 250 KB" and then having the upload rejected is worse than being told
 * "≈ 200-260 KB — this may not fit".
 */
export function isNearLimit(estimate: SizeEstimate, limitBytes: number): boolean {
  return estimate.high >= limitBytes * 0.8;
}
