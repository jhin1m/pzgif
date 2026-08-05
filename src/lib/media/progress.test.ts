/**
 * Progress is the one place where a plausible-looking lie is easy to ship, so
 * these tests are written against the rule rather than the implementation:
 * every value must trace to a counter, and no value may move without one.
 */

import { describe, expect, it } from "vitest";
import { ProgressReporter } from "./progress";
import { stageWeights } from "./calibration";
import type { ProgressEvent } from "./types";

function collect() {
  const events: ProgressEvent[] = [];
  let clock = 0;
  const reporter = new ProgressReporter(
    stageWeights("gif", "gifenc"),
    (event) => events.push(event),
    () => clock,
  );
  return {
    events,
    reporter,
    advance(ms: number) {
      clock += ms;
    },
  };
}

describe("ProgressReporter", () => {
  it("never emits a value without a counter behind it", () => {
    const { events, reporter, advance } = collect();
    reporter.enter("decode");
    advance(200);
    reporter.report(10, 100);

    const withValues = events.filter((event) => event.determinate);
    expect(withValues.length).toBeGreaterThan(0);
    for (const event of withValues) {
      expect(event.total).not.toBeNull();
      expect(event.done).toBeLessThanOrEqual(event.total!);
    }
  });

  it("marks a stage with no denominator indeterminate rather than guessing", () => {
    // gifski exposes no callback and blocks its worker outright. There is
    // nothing to count, so nothing is claimed.
    const { events, reporter, advance } = collect();
    reporter.enter("encode");
    advance(200);
    reporter.report(0, null);
    const last = events[events.length - 1];
    expect(last.determinate).toBe(false);
    expect(last.stage).toBe("encode");
  });

  it("throttles to roughly 10 Hz", () => {
    // A message per decoded frame is thousands a second, each one a main-thread
    // task — the exact INP regression the worker split exists to prevent.
    const { events, reporter, advance } = collect();
    reporter.enter("decode");
    const before = events.length;
    for (let index = 0; index < 500; index += 1) {
      advance(1);
      reporter.report(index, 500);
    }
    expect(events.length - before).toBeLessThanOrEqual(6);
  });

  it("advances monotonically across stages", () => {
    const { events, reporter, advance } = collect();
    reporter.enter("decode");
    advance(200);
    reporter.report(100, 100);
    reporter.enter("encode");
    advance(200);
    reporter.report(50, 100);
    reporter.finish();

    const values = events.map((event) => event.value);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThanOrEqual(values[index - 1]);
    }
    expect(values[values.length - 1]).toBe(1);
  });

  it("does not let a retry push the bar past the end or backwards", () => {
    // The retry re-runs the encode; banking the failed attempt's weight would
    // take the bar over 1 and then visibly reverse.
    const { events, reporter, advance } = collect();
    reporter.enter("decode");
    advance(200);
    reporter.report(100, 100);
    reporter.enter("encode");
    advance(200);
    reporter.enter("retry");
    advance(200);
    reporter.enter("encode");
    advance(200);
    reporter.report(10, 100);

    for (const event of events) {
      expect(event.value).toBeLessThanOrEqual(1);
      expect(event.value).toBeGreaterThanOrEqual(0);
    }
    // And it must not sit at 100% while the retry is still decoding — a bar that
    // says finished while work continues is worse than one that says nothing.
    expect(events[events.length - 1].value).toBeLessThan(1);
  });

  it("weights stages differently per job type, from measured splits", () => {
    // A GIF→GIF job under gifenc spends most of its time decoding; a video job
    // under gifski spends most of it encoding. One global triple would make the
    // bar crawl on one and jump on the other.
    expect(stageWeights("gif", "gifenc").decode).toBeGreaterThan(
      stageWeights("video", "gifski").decode,
    );
    for (const [input, encoder] of [
      ["gif", "gifenc"],
      ["gif", "gifski"],
      ["video", "gifenc"],
      ["video", "gifski"],
    ] as const) {
      const weights = stageWeights(input, encoder);
      const total = weights.probe + weights.decode + weights.encode;
      expect(Math.abs(total - 1)).toBeLessThan(0.001);
    }
  });
});
