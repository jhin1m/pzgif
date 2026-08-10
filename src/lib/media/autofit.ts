/**
 * The auto-fit search: which settings to try, in which order, and how many times.
 *
 * ── Why this is a plan rather than a loop ───────────────────────────────────
 * The expensive half — decode, encode, measure — lives in `pipeline.ts`, because
 * it needs frames and a worker. What lives here is the decision, and it is
 * separated for one reason: **every attempt is a real encode**, and on the iOS
 * budget a wasted attempt is not merely slow. A decision that can be unit-tested
 * against a table of predicted sizes is a decision whose cost can be reasoned
 * about before it is paid.
 *
 * ── Seeded, not blind ───────────────────────────────────────────────────────
 * The naive search starts at the top of the quality ladder and walks down until
 * something fits, which costs one encode per rung. This one starts at the
 * *highest rung predicted to fit*, from a reference encode the estimator already
 * ran. On a file that is 3x over budget the naive search spends four encodes
 * discovering what the estimate said up front, and on a phone that is four
 * chances to run out of memory rather than one.
 *
 * The prediction is not trusted, only used to choose a starting point: the
 * attempt that follows is measured, and if it misses, the search steps down from
 * there. `SAMPLED_ESTIMATE_SPREAD` is ±20%, which is exactly why the seed cannot
 * simply be accepted without encoding it.
 *
 * ── Quality first, frames second ────────────────────────────────────────────
 * The dials are not interchangeable. Quality and palette degrade every pixel a
 * little; dropping frames removes motion. At emoji size, motion is the thing
 * nobody notices — a 128×128 loop played at 32 px in a message is not where
 * anyone counts frames — so frame dropping is the *right* last lever rather than
 * a desperate one. It stays last because it is the only one that changes what
 * the animation is, and the user did not ask for a shorter loop.
 */

import {
  GIFENC_COLOUR_SCALE,
  GIFSKI_QUALITY_SCALE,
  interpolate,
} from "./calibration";
import type { DeviceTier } from "./limits";
import type { AutofitSettings, GifEncoderId } from "./types";

/**
 * The settings the reference encode is measured at.
 *
 * Everything below is expressed as a ratio to this, so the reference has to be a
 * point both calibration curves are normalised to. Quality 80 and 256 colours
 * are that point in `calibration.ts`, which is not a coincidence — the whole
 * sweep was run from that baseline.
 */
export const REFERENCE_QUALITY = 80;
export const REFERENCE_COLOURS = 256;

/** gifski's dial, best first. */
const QUALITY_LADDER = [90, 80, 65, 50, 40] as const;
/** gifenc's dial, best first. gifski ignores palette size entirely. */
const COLOUR_LADDER = [256, 128, 64, 32] as const;
/**
 * Frame-drop rungs, best first.
 *
 * Stops at 3. Keeping one frame in four turns a smooth loop into a slideshow,
 * and a file that fits but no longer reads as animation has not solved the
 * user's problem — it has changed it.
 */
const STRIDE_LADDER = [1, 2, 3] as const;

/**
 * How many real encodes a device will spend on one search.
 *
 * Not a uniform number, and the iOS figure is the point of the table. Five
 * attempts there means five encode workers instantiated in sequence against a
 * 30 MB frame budget; gate G8 already measured that tier refusing 80% of
 * realistic inputs. Two is what the budget supports, and the page says so rather
 * than letting a phone discover it.
 */
export const ATTEMPT_CAP: Readonly<Record<DeviceTier, number>> = {
  desktop: 5,
  "desktop-low-ram": 4,
  "android-mobile": 3,
  ios: 2,
};

export function attemptCap(tier: DeviceTier): number {
  return ATTEMPT_CAP[tier] ?? ATTEMPT_CAP.desktop;
}

/**
 * Predicted output size at `settings`, as a multiple of the reference encode.
 *
 * The quality and palette halves come from the measured calibration curves. The
 * frame-drop half is `1 / keepEveryNth`, which **over-states the saving**: the
 * header and the palette are fixed costs that do not shrink with the frame
 * count, so a stride of two saves somewhat less than half. That bias is left in
 * deliberately — it makes the search start one rung *higher* in quality than
 * strictly safe, and the cost of being wrong in that direction is one more
 * attempt, while the cost of the other direction is a needlessly ugly file the
 * user has no way to know was avoidable.
 */
export function relativeScale(
  settings: AutofitSettings,
  encoder: GifEncoderId,
): number {
  const dial =
    encoder === "gifski"
      ? interpolate(GIFSKI_QUALITY_SCALE, settings.quality) /
        interpolate(GIFSKI_QUALITY_SCALE, REFERENCE_QUALITY)
      : interpolate(GIFENC_COLOUR_SCALE, settings.colours) /
        interpolate(GIFENC_COLOUR_SCALE, REFERENCE_COLOURS);

  return dial / Math.max(1, settings.keepEveryNth);
}

/**
 * Every settings combination worth trying, best first.
 *
 * Two rules, and the second one is not cosmetic:
 *
 *  1. **Ordered stride-outer**, so the whole quality ladder is exhausted before
 *     a single frame is dropped. That is the product decision in this file.
 *  2. **Filtered to a strictly descending predicted size.** The preference order
 *     alone is *not* monotonic — the top of the stride-2 block (0.56 of the
 *     reference for gifski) is larger than the bottom of the stride-1 block
 *     (0.48), so a search that walked the raw order would follow a failed
 *     attempt with a larger one. That attempt cannot succeed by construction:
 *     the search only ever descends because the rung above it did not fit. It
 *     would be a real encode, a real worker, and real memory, spent to
 *     re-establish something already known.
 *
 * Exported because both rules are invisible in any assertion about the final
 * output file, and the second one is the kind of defect that reads as a slow
 * tool rather than as a bug.
 */
export function candidates(encoder: GifEncoderId): readonly AutofitSettings[] {
  const ordered: AutofitSettings[] = [];
  for (const keepEveryNth of STRIDE_LADDER) {
    if (encoder === "gifski") {
      for (const quality of QUALITY_LADDER) {
        ordered.push({ quality, colours: REFERENCE_COLOURS, keepEveryNth });
      }
    } else {
      for (const colours of COLOUR_LADDER) {
        ordered.push({ quality: REFERENCE_QUALITY, colours, keepEveryNth });
      }
    }
  }

  const out: AutofitSettings[] = [];
  let smallest = Number.POSITIVE_INFINITY;
  for (const settings of ordered) {
    const scale = relativeScale(settings, encoder);
    if (scale >= smallest) continue;
    smallest = scale;
    out.push(settings);
  }
  return out;
}

/**
 * The attempts to make, in order.
 *
 * `referenceBytes` is a real measurement — the estimator's sampled figure at
 * `REFERENCE_QUALITY`/`REFERENCE_COLOURS` — not a guess. Pass a non-positive
 * value when no estimate was available and the search starts at the top of the
 * ladder instead, which is the honest fallback: without a measurement there is
 * nothing to seed from, and beginning at the best quality at least means the
 * first attempt is the one the user would have wanted.
 *
 * Returns **one** attempt when the model says nothing will fit. Spending five
 * encodes to confirm a prediction of failure is exactly the memory risk the cap
 * exists to bound; the single most aggressive attempt is made, the real bytes
 * are measured, and the page reports honestly that it does not fit.
 */
export function planSearch(
  referenceBytes: number,
  budgetBytes: number,
  encoder: GifEncoderId,
  maxAttempts: number,
): readonly AutofitSettings[] {
  const ladder = candidates(encoder);
  const attempts = Math.max(1, Math.floor(maxAttempts));

  if (!(referenceBytes > 0) || !(budgetBytes > 0)) {
    return ladder.slice(0, attempts);
  }

  const required = budgetBytes / referenceBytes;
  const seed = ladder.findIndex(
    (settings) => relativeScale(settings, encoder) <= required,
  );

  // Nothing on the ladder is predicted to reach the budget. Make the one attempt
  // with a chance and let the measurement, not the model, have the last word.
  if (seed === -1) return [ladder[ladder.length - 1]];

  return ladder.slice(seed, seed + attempts);
}
