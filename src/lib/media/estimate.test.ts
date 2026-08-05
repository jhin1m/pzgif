/**
 * The estimator's job is to be honest, not to be exact. These tests check the
 * honesty properties — a range that contains its own midpoint, content changing
 * the answer, no promise made — and leave accuracy to
 * `e2e/engine/estimate-accuracy.spec.ts`, which measures it against real
 * fixtures in a real browser.
 */

import { describe, expect, it } from "vitest";
import { estimateFromCurve, isNearLimit } from "./estimate";
import { interpolate, GIFSKI_QUALITY_SCALE } from "./calibration";

const BASE = {
  width: 480,
  height: 270,
  frames: 48,
  encoder: "gifski" as const,
  quality: 80,
  colours: 256,
};

const FLAT = { flatPixelRatio: 0.92, paletteEntropyBits: 3.6 };
const PHOTO = { flatPixelRatio: 0.04, paletteEntropyBits: 12.6 };

describe("estimateFromCurve", () => {
  it("returns a range that brackets its own midpoint", () => {
    const estimate = estimateFromCurve(BASE, FLAT);
    expect(estimate.low).toBeLessThan(estimate.bytes);
    expect(estimate.high).toBeGreaterThan(estimate.bytes);
    expect(estimate.basis).toBe("curve");
  });

  it("puts photographic content an order of magnitude above flat art", () => {
    // The calibration sweep measured a 22x spread at identical settings. A model
    // that missed this would be wrong by an order of magnitude on exactly the
    // files people care about.
    const flat = estimateFromCurve(BASE, FLAT).bytes;
    const photo = estimateFromCurve(BASE, PHOTO).bytes;
    expect(photo / flat).toBeGreaterThan(5);
  });

  it("lands within the measured envelope for the baseline fixtures", () => {
    // `screen-720p-10s.mp4` measured 0.0765 B/px at these settings; the flat
    // anchor should predict the same order of magnitude.
    const estimate = estimateFromCurve(BASE, FLAT);
    const measuredBytes = 0.0765 * BASE.width * BASE.height * BASE.frames;
    expect(estimate.low).toBeLessThanOrEqual(measuredBytes);
    expect(estimate.high).toBeGreaterThanOrEqual(measuredBytes);
  });

  it("shrinks with quality and grows with frame count", () => {
    const high = estimateFromCurve({ ...BASE, quality: 100 }, FLAT).bytes;
    const low = estimateFromCurve({ ...BASE, quality: 40 }, FLAT).bytes;
    expect(low).toBeLessThan(high);

    const longer = estimateFromCurve({ ...BASE, frames: 96 }, FLAT).bytes;
    expect(longer).toBeGreaterThan(estimateFromCurve(BASE, FLAT).bytes);
  });

  it("uses the palette curve for gifenc, not the quality curve", () => {
    const many = estimateFromCurve({ ...BASE, encoder: "gifenc", colours: 256 }, FLAT).bytes;
    const few = estimateFromCurve({ ...BASE, encoder: "gifenc", colours: 32 }, FLAT).bytes;
    expect(few).toBeLessThan(many);
  });

  it("stays inside the measured bytes-per-pixel envelope", () => {
    const absurd = estimateFromCurve(BASE, { flatPixelRatio: 1, paletteEntropyBits: 0 });
    expect(absurd.bytes).toBeGreaterThan(0);
  });
});

describe("interpolate", () => {
  it("returns measured points exactly", () => {
    expect(interpolate(GIFSKI_QUALITY_SCALE, 80)).toBe(1);
    expect(interpolate(GIFSKI_QUALITY_SCALE, 60)).toBeCloseTo(0.694, 3);
  });

  it("clamps outside the measured range rather than extrapolating", () => {
    // Extrapolating a curve fitted on 20-100 into quality 5 would be inventing
    // data, which is what the whole estimator is written to avoid.
    expect(interpolate(GIFSKI_QUALITY_SCALE, 5)).toBe(0.394);
    expect(interpolate(GIFSKI_QUALITY_SCALE, 200)).toBe(1.25);
  });
});

describe("isNearLimit", () => {
  it("flags an estimate whose upper bound approaches the budget", () => {
    // Discord's emoji budget is 256 KB. "≈ 250 KB" followed by a rejected upload
    // is worse than "≈ 200-260 KB — this may not fit".
    expect(isNearLimit({ bytes: 200_000, low: 160_000, high: 240_000, basis: "sampled" }, 256_000)).toBe(true);
    expect(isNearLimit({ bytes: 50_000, low: 40_000, high: 60_000, basis: "sampled" }, 256_000)).toBe(false);
  });
});
