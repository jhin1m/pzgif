import { describe, expect, it } from "vitest";
import {
  ATTEMPT_CAP,
  REFERENCE_COLOURS,
  REFERENCE_QUALITY,
  attemptCap,
  candidates,
  planSearch,
  relativeScale,
} from "./autofit";
import { keepEveryNthFrame } from "./ops/frame-select";
import type { DecodedFrame } from "./types";

/**
 * The search is where auto-fit spends the user's battery and the device's
 * memory, so its decisions are asserted here rather than inferred from an
 * end-to-end result. An E2E test can only see that the output fits — it cannot
 * see that four encodes were burned reaching a conclusion the estimator already
 * held.
 */

describe("relativeScale", () => {
  it("is exactly 1 at the reference settings", () => {
    // Everything else is a ratio to this point. If it drifts, every seed does.
    const reference = {
      quality: REFERENCE_QUALITY,
      colours: REFERENCE_COLOURS,
      keepEveryNth: 1,
    };
    expect(relativeScale(reference, "gifski")).toBeCloseTo(1, 6);
    expect(relativeScale(reference, "gifenc")).toBeCloseTo(1, 6);
  });

  it("reads gifski's dial and ignores the palette", () => {
    // gifski always encodes a full palette, so a colours change there is inert.
    // A search that treated it as a lever would spend an encode on nothing.
    const low = { quality: 40, colours: 32, keepEveryNth: 1 };
    const high = { quality: 40, colours: 256, keepEveryNth: 1 };
    expect(relativeScale(low, "gifski")).toBe(relativeScale(high, "gifski"));
    expect(relativeScale(high, "gifski")).toBeLessThan(1);
  });

  it("reads gifenc's palette and ignores quality", () => {
    const coarse = { quality: 100, colours: 32, keepEveryNth: 1 };
    const fine = { quality: 40, colours: 32, keepEveryNth: 1 };
    expect(relativeScale(coarse, "gifenc")).toBe(relativeScale(fine, "gifenc"));
    expect(relativeScale(coarse, "gifenc")).toBeLessThan(1);
  });

  it("scales inversely with the frame stride", () => {
    const base = { quality: 80, colours: 256, keepEveryNth: 1 };
    expect(relativeScale({ ...base, keepEveryNth: 2 }, "gifski")).toBeCloseTo(
      relativeScale(base, "gifski") / 2,
      6,
    );
  });
});

describe("candidates", () => {
  it("exhausts the quality ladder before dropping a single frame", () => {
    // The product decision in this file. Quality degrades every pixel a little;
    // dropping frames changes what the animation is, and the user asked for a
    // smaller file, not a shorter loop.
    const ladder = candidates("gifski");
    const firstDrop = ladder.findIndex((s) => s.keepEveryNth > 1);
    expect(firstDrop).toBeGreaterThan(0);
    for (const settings of ladder.slice(0, firstDrop)) {
      expect(settings.keepEveryNth).toBe(1);
    }
    // And within a stride, quality only ever descends.
    const atStrideOne = ladder.slice(0, firstDrop).map((s) => s.quality);
    expect([...atStrideOne].sort((a, b) => b - a)).toEqual(atStrideOne);
  });

  it("descends monotonically in predicted size", () => {
    for (const encoder of ["gifski", "gifenc"] as const) {
      const scales = candidates(encoder).map((s) => relativeScale(s, encoder));
      for (let i = 1; i < scales.length; i += 1) {
        expect(scales[i], `${encoder} rung ${i}`).toBeLessThan(scales[i - 1]);
      }
    }
  });
});

describe("attemptCap", () => {
  it("gives iOS the fewest attempts", () => {
    // Five real encodes against a 30 MB frame budget is the crash the memory
    // model exists to design out, on the tier G8 already measured refusing 80%
    // of realistic inputs.
    expect(ATTEMPT_CAP.ios).toBeLessThan(ATTEMPT_CAP["android-mobile"]);
    expect(ATTEMPT_CAP["android-mobile"]).toBeLessThan(ATTEMPT_CAP.desktop);
  });

  it("falls back to the desktop cap for an unknown tier", () => {
    expect(attemptCap("pocket-watch" as never)).toBe(ATTEMPT_CAP.desktop);
  });
});

describe("planSearch", () => {
  const BUDGET = 256 * 1024;

  it("starts at the highest rung predicted to fit, not the top of the ladder", () => {
    // The whole reason the estimator runs first. A file 30% over budget does not
    // need an encode at quality 90 to discover it is 30% over budget.
    const plan = planSearch(BUDGET / 0.8, BUDGET, "gifski", 5);
    expect(relativeScale(plan[0], "gifski")).toBeLessThanOrEqual(0.8);
    // And it is the *highest* such rung — one step up must not fit.
    const ladder = candidates("gifski");
    const seed = ladder.findIndex((s) => s.quality === plan[0].quality
      && s.keepEveryNth === plan[0].keepEveryNth);
    expect(relativeScale(ladder[seed - 1], "gifski")).toBeGreaterThan(0.8);
  });

  it("takes the best rung when the file already fits comfortably", () => {
    const plan = planSearch(BUDGET / 4, BUDGET, "gifski", 5);
    expect(plan[0]).toEqual(candidates("gifski")[0]);
  });

  it("reaches for the frame stride only when quality alone cannot get there", () => {
    // 0.3 is below every quality rung at stride 1 and reachable at stride 2.
    const plan = planSearch(BUDGET / 0.3, BUDGET, "gifski", 5);
    expect(plan[0].keepEveryNth).toBe(2);
  });

  it("makes exactly one attempt when nothing is predicted to fit", () => {
    // Spending five encodes to confirm a prediction of failure is the memory
    // risk the cap exists to bound. Make the one attempt with a chance, measure
    // it, and report honestly.
    const plan = planSearch(BUDGET / 0.001, BUDGET, "gifski", 5);
    expect(plan).toHaveLength(1);
    const ladder = candidates("gifski");
    expect(plan[0]).toEqual(ladder[ladder.length - 1]);
  });

  it("never returns more attempts than the device allows", () => {
    for (const max of [1, 2, 3, 5]) {
      expect(planSearch(BUDGET / 0.9, BUDGET, "gifski", max).length)
        .toBeLessThanOrEqual(max);
    }
  });

  it("descends from the seed rather than repeating it", () => {
    const plan = planSearch(BUDGET / 0.9, BUDGET, "gifski", 4);
    const scales = plan.map((s) => relativeScale(s, "gifski"));
    for (let i = 1; i < scales.length; i += 1) {
      expect(scales[i]).toBeLessThan(scales[i - 1]);
    }
  });

  it("starts at the top of the ladder when there is no measurement to seed from", () => {
    // Zero means the estimator produced nothing. Beginning at the best quality
    // is the honest fallback: without a measurement there is nothing to seed
    // from, and the first attempt is at least the one the user would want.
    const plan = planSearch(0, BUDGET, "gifski", 3);
    expect(plan[0]).toEqual(candidates("gifski")[0]);
    expect(plan).toHaveLength(3);
  });

  it("always offers at least one attempt", () => {
    expect(planSearch(1, BUDGET, "gifski", 0).length).toBeGreaterThan(0);
    expect(planSearch(-1, -1, "gifenc", 5).length).toBeGreaterThan(0);
  });
});

describe("keepEveryNthFrame", () => {
  const frames = (durations: number[]): DecodedFrame[] =>
    durations.map((durationMs, index) => ({
      rgba: new Uint8Array([index]),
      durationMs,
    }));

  it("returns a copy of the list untouched at a stride of one", () => {
    const input = frames([100, 100, 100]);
    const kept = keepEveryNthFrame(input, 1);
    expect(kept).toEqual(input);
    expect(kept).not.toBe(input);
  });

  it("preserves the total running time", () => {
    // The whole function. Filtering the array without moving the durations
    // doubles the playback speed, which reads as a broken conversion rather
    // than as a smaller file.
    const input = frames([100, 100, 100, 100, 100, 100]);
    for (const stride of [1, 2, 3, 4]) {
      const kept = keepEveryNthFrame(input, stride);
      const total = kept.reduce((sum, frame) => sum + frame.durationMs, 0);
      expect(total, `stride ${stride}`).toBe(600);
    }
  });

  it("gives a dropped frame's time to the frame still on screen", () => {
    const kept = keepEveryNthFrame(frames([100, 40, 100, 40]), 2);
    expect(kept.map((frame) => frame.durationMs)).toEqual([140, 140]);
  });

  it("keeps the first frame and shares the source pixel buffers", () => {
    const input = frames([50, 50, 50, 50]);
    const kept = keepEveryNthFrame(input, 2);
    expect(kept).toHaveLength(2);
    // Sharing rather than copying: the search runs this per attempt, and a
    // per-pixel copy here would be a second full frame buffer on every rung.
    expect(kept[0].rgba).toBe(input[0].rgba);
    expect(kept[1].rgba).toBe(input[2].rgba);
  });

  it("survives a stride longer than the animation", () => {
    const kept = keepEveryNthFrame(frames([30, 30, 30]), 10);
    expect(kept).toHaveLength(1);
    expect(kept[0].durationMs).toBe(90);
  });
});
