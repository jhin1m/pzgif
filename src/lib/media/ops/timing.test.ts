/**
 * The timing ops decide how many frames exist, which is what admission control
 * budgets memory against. A miscount here does not produce a slightly wrong
 * animation — it produces an OOM after the user was told the job would fit.
 */

import { describe, expect, it } from "vitest";
import {
  directionFrameCount,
  lastNeededIndex,
  plannedFrameCount,
  selectedFrameCount,
  selectsFrame,
} from "./frame-select";
import { retime, totalDurationMs } from "./speed";
import { applyDirection } from "./reverse";
import type { DecodedFrame } from "../types";

function frames(count: number, durationMs = 100): DecodedFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    rgba: new Uint8Array([index]),
    durationMs,
  }));
}

describe("frame selection", () => {
  it("keeps every frame by default", () => {
    expect(selectedFrameCount(48, {})).toBe(48);
    expect([0, 1, 47].every((index) => selectsFrame(index, {}))).toBe(true);
  });

  it("counts a stride the same way it applies one", () => {
    const timing = { keepEveryNth: 3 };
    const kept = Array.from({ length: 10 }, (_, index) => index).filter((index) =>
      selectsFrame(index, timing),
    );
    expect(kept).toEqual([0, 3, 6, 9]);
    expect(selectedFrameCount(10, timing)).toBe(kept.length);
  });

  it("strides from the start of the range, not the start of the file", () => {
    const timing = { range: { from: 5, to: 11 }, keepEveryNth: 2 };
    const kept = Array.from({ length: 20 }, (_, index) => index).filter((index) =>
      selectsFrame(index, timing),
    );
    expect(kept).toEqual([5, 7, 9]);
    expect(selectedFrameCount(20, timing)).toBe(3);
  });

  it("stops reading once the trim range ends", () => {
    expect(lastNeededIndex(200, { range: { from: 0, to: 30 } })).toBe(29);
    expect(lastNeededIndex(200, {})).toBe(199);
  });
});

describe("direction", () => {
  it("shares the endpoints in a ping-pong instead of repeating them", () => {
    // Repeating the first and last frames back to back reads as a stutter at
    // each turning point, which is the artefact the effect exists to avoid.
    const output = applyDirection(frames(4), "ping-pong");
    expect(output.length).toBe(6);
    expect(directionFrameCount(4, "ping-pong")).toBe(6);
    expect(output.map((frame) => frame.rgba[0])).toEqual([0, 1, 2, 3, 2, 1]);
  });

  it("predicts the same count it produces, for every direction", () => {
    for (const direction of ["forward", "reverse", "ping-pong"] as const) {
      const produced = applyDirection(frames(7), direction).length;
      expect(plannedFrameCount(7, { direction }), direction).toBe(produced);
    }
  });

  it("does not ping-pong a single frame into anything", () => {
    expect(applyDirection(frames(1), "ping-pong").length).toBe(1);
    expect(directionFrameCount(1, "ping-pong")).toBe(1);
  });

  it("reverses without copying pixel data", () => {
    const input = frames(3);
    const output = applyDirection(input, "reverse");
    expect(output[0].rgba).toBe(input[2].rgba);
  });
});

describe("retime", () => {
  it("leaves frames alone at 1x", () => {
    const input = frames(5);
    expect(retime(input, 1).frames).toBe(input);
  });

  it("halves durations at 2x while keeping every frame", () => {
    const result = retime(frames(4, 100), 2);
    expect(result.dropped).toBe(0);
    expect(result.frames.map((frame) => frame.durationMs)).toEqual([50, 50, 50, 50]);
  });

  it("drops frames rather than shortening past the browser delay floor", () => {
    // Below ~20 ms browsers clamp *up* to 100 ms, so shortening further would
    // make the animation play five times slower than asked.
    const result = retime(frames(20, 100), 10);
    expect(result.dropped).toBeGreaterThan(0);
    expect(result.frames.every((frame) => frame.durationMs >= 20)).toBe(true);
  });

  it("keeps total playback time when it drops frames", () => {
    // Dropped frames carry their time forward, so a 4x speed-up on a 2-second
    // animation still lasts half a second rather than collapsing to nothing.
    const source = frames(20, 100);
    const result = retime(source, 8);
    const expected = totalDurationMs(source) / 8;
    expect(Math.abs(totalDurationMs(result.frames) - expected)).toBeLessThanOrEqual(20);
  });

  it("never returns an empty animation", () => {
    const result = retime(frames(3, 30), 1000);
    expect(result.frames.length).toBeGreaterThanOrEqual(1);
  });

  it("slows down without dropping anything", () => {
    const result = retime(frames(3, 100), 0.5);
    expect(result.dropped).toBe(0);
    expect(result.frames.map((frame) => frame.durationMs)).toEqual([200, 200, 200]);
  });
});
