import { expect, test } from "@playwright/test";
import { openBench, selectFixture, writeResult } from "./harness";

/**
 * Correctness of the streaming GIF compositor.
 *
 * `decode-gif.ts` composites frames by hand — applying disposal methods and
 * frame offsets itself — because the library's own helpers are either O(n^2) in
 * time or O(n) in memory at source size, and neither is shippable. That trade
 * moves GIF disposal from the library's problem to ours, and disposal bugs are
 * the quiet kind: they leave trails on transparent animations and look fine on
 * everything else.
 *
 * So the streaming compositor is checked against `modern-gif`'s own
 * `decodeFrames()` — the same library's independent implementation of the same
 * rules — pixel for pixel at native size. That is a genuine oracle rather than a
 * restatement of what this code does.
 *
 * This runs on all three engines because the compositing goes through
 * `drawImage`, and canvas alpha blending is an engine behaviour, not a library
 * one.
 */

const GIF_FIXTURES = [
  "loop-small.gif",
  "flat-art.gif",
  "photo-grain.gif",
  "odd-dims.gif",
  "loop-large.gif",
];

test("streaming compositor matches the reference decoder", async ({
  page,
  browserName,
}) => {
  test.setTimeout(15 * 60_000);

  await openBench(page);
  const comparisons = [];

  for (const fixture of GIF_FIXTURES) {
    await selectFixture(page, fixture);
    const comparison = (await page.evaluate(() =>
      window.__bench!.verifyCompositing(),
    )) as {
      frames: number;
      maxChannelDelta: number;
      mismatchedPixels: number;
      totalPixels: number;
      matches: boolean;
    };
    comparisons.push({ fixture, ...comparison });
  }

  writeResult(`gif-compositing.${browserName}.json`, { comparisons });

  for (const comparison of comparisons) {
    expect(comparison.frames, `${comparison.fixture} decoded no frames`).toBeGreaterThan(0);
    expect(
      comparison.mismatchedPixels,
      `${comparison.fixture}: ${comparison.mismatchedPixels}/${comparison.totalPixels} pixels differ, max channel delta ${comparison.maxChannelDelta}`,
    ).toBe(0);
  }
});
