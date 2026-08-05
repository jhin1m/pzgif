/**
 * Constants distilled from `bench-results/calibration.json`.
 *
 * The raw file is 115 measured rows and 45 KB; shipping it to every visitor to
 * read six numbers would be a bundle cost with no user benefit. These are those
 * six numbers, each traceable back to the rows it came from, so a later reader
 * can re-derive them rather than trusting a magic constant.
 *
 * **Provenance:** Apple Silicon, 8 cores, 16 GB, Chromium 151, one-axis-at-a-time
 * sweep from a 480 px / 15 fps / quality 80 baseline. Cross-terms are unmeasured
 * — the sweep was not a full factorial — which is one reason the sampled
 * estimator is preferred over these curves wherever a sample is affordable.
 */

/**
 * Bytes per pixel per frame at the baseline, anchored on content flatness.
 *
 * The calibration data's headline finding is a **22x spread in bytes-per-pixel
 * at identical settings**, driven entirely by content: 0.046 for flat vector art
 * against 1.035 for photographic grain. Any model keyed only on
 * (width, fps, quality, colours) is therefore wrong by an order of magnitude on
 * the inputs users care most about, which is why these anchors exist and why the
 * descriptors that feed them are computed rather than assumed.
 *
 * **Known weakness:** only 1 of the 7 calibration fixtures is photographic, so
 * the photographic anchor rests on a single measurement. It is the anchor that
 * matters most and the one with the least evidence behind it. Adding
 * photographic fixtures is the first thing to do before trusting this path over
 * a sample.
 */
export const BPP_ANCHOR_FLAT = 0.076;
export const BPP_ANCHOR_PHOTO = 1.035;
/** Flat-pixel ratio each anchor was measured at. */
export const FLAT_RATIO_AT_FLAT_ANCHOR = 0.9;
export const FLAT_RATIO_AT_PHOTO_ANCHOR = 0.04;

/** Never predict outside the measured envelope; the model has no evidence there. */
export const BPP_FLOOR = 0.02;
export const BPP_CEILING = 1.4;

/**
 * gifski quality → bytes, normalised to quality 80.
 *
 * Mean across all seven fixtures. The curve is strongly non-linear below 60,
 * which is why the UI's quality slider cannot be treated as proportional.
 */
export const GIFSKI_QUALITY_SCALE: ReadonlyArray<readonly [quality: number, scale: number]> = [
  [100, 1.25],
  [80, 1.0],
  [60, 0.694],
  [40, 0.477],
  [20, 0.394],
];

/** gifenc palette size → bytes, normalised to 256 colours. */
export const GIFENC_COLOUR_SCALE: ReadonlyArray<readonly [colours: number, scale: number]> = [
  [256, 1.0],
  [128, 0.849],
  [64, 0.703],
  [32, 0.58],
];

/**
 * Bytes-per-pixel rises as the output shrinks — a smaller frame spends the same
 * palette and header on fewer pixels, and fine detail that dithered away at
 * 480 px is still present at 240 px. Measured relative to the 480 px baseline.
 *
 * Rows above 480 px are excluded: several fixtures are narrower than that, so
 * the encoder clamped to the source width and those rows measure the clamp
 * rather than the effect.
 */
export const WIDTH_BPP_SCALE: ReadonlyArray<readonly [width: number, scale: number]> = [
  [240, 1.48],
  [320, 1.23],
  [400, 1.1],
  [480, 1.0],
  [640, 0.92],
];

/**
 * How far a sampled estimate is allowed to claim accuracy.
 *
 * A strided sample sees content but not the encoder's cross-frame optimisation
 * over the whole animation, so it runs slightly high. The fps sweep bounds that
 * effect: bytes-per-frame moved only 2-6% across a 3x change in stride. The
 * ±20% band is wider than that on purpose — it is a *user-facing* claim, and the
 * cost of a range that turns out too narrow is trust.
 *
 * `e2e/engine/estimate-accuracy.spec.ts` measures the real error against the
 * fixture corpus; these are the numbers to correct when it does.
 */
export const SAMPLED_ESTIMATE_SPREAD = 0.2;
export const CURVE_ESTIMATE_SPREAD = 0.45;

/**
 * Stage weights for the overall progress figure, per job type.
 *
 * Measured, and the measurement overturned the research report's proposed fixed
 * `0.05 / 0.55 / 0.40`: the split depends on both input kind and encoder, from
 * 12% decode on a video-to-GIF job under Chromium to 79% on a GIF-to-GIF job
 * under gifenc. A single global triple would make the bar crawl on one job type
 * and jump on another.
 *
 * **This is a mapping, not a fabrication.** Each stage's own value comes from a
 * real counter — a decoded-frame index, or an encoder callback. What is
 * forbidden is interpolation: time-based ramps, simulated movement, any value
 * not backed by a counter. Weighting real sub-progress into one figure is
 * arithmetic on measurements. Do not "fix" this by removing the weights.
 */
export interface StageWeights {
  probe: number;
  decode: number;
  encode: number;
}

const VIDEO_GIFSKI: StageWeights = { probe: 0.01, decode: 0.15, encode: 0.84 };
const VIDEO_GIFENC: StageWeights = { probe: 0.01, decode: 0.55, encode: 0.44 };
const GIF_GIFSKI: StageWeights = { probe: 0.02, decode: 0.5, encode: 0.48 };
const GIF_GIFENC: StageWeights = { probe: 0.02, decode: 0.79, encode: 0.19 };

/**
 * The GIF-input + gifski cell is the one figure derived rather than measured:
 * `stage-split.spec.ts` did not run in Phase 1 (a wedged Playwright session), so
 * it is interpolated from the GIF-input + gifenc split and the two video cells.
 * It biases the bar, never the truth of a stage's own counter. Re-measure it and
 * replace this constant.
 */
export function stageWeights(
  inputKind: "video" | "gif" | "webp",
  encoder: "gifski" | "gifenc" | "other",
): StageWeights {
  if (inputKind === "video") {
    return encoder === "gifenc" ? VIDEO_GIFENC : VIDEO_GIFSKI;
  }
  return encoder === "gifenc" ? GIF_GIFENC : GIF_GIFSKI;
}

/** Linear interpolation across a measured, descending-or-ascending table. */
export function interpolate(
  table: ReadonlyArray<readonly [number, number]>,
  at: number,
): number {
  const sorted = [...table].sort((a, b) => a[0] - b[0]);
  if (at <= sorted[0][0]) return sorted[0][1];
  const last = sorted[sorted.length - 1];
  if (at >= last[0]) return last[1];

  for (let index = 1; index < sorted.length; index += 1) {
    const [x1, y1] = sorted[index - 1];
    const [x2, y2] = sorted[index];
    if (at <= x2) return y1 + ((y2 - y1) * (at - x1)) / (x2 - x1);
  }
  return last[1];
}
