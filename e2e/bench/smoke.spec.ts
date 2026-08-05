import { expect, test } from "@playwright/test";
import { openBench, runJob, selectFixture } from "./harness";

/**
 * A fast end-to-end check of the pipeline, so a broken decode or encode surfaces
 * in seconds rather than partway through a thirty-minute soak.
 *
 * The assertions decode the produced file. A byte count greater than zero would
 * pass just as happily against a truncated GIF, or against a buffer of noise.
 */
test("pipeline produces a decodable GIF from a GIF input", async ({ page }) => {
  test.setTimeout(120_000);
  await openBench(page);
  await selectFixture(page, "loop-small.gif");

  const result = await runJob(page, { encoder: "gifski", width: 320 });

  expect(result.error).toBeNull();
  expect(result.ok).toBe(true);
  expect(result.outWidth).toBe(320);
  expect(result.frames).toBe(48);
  expect(result.roundTrip?.header).toBe("GIF89a");
  expect(result.roundTrip?.frameCount).toBe(48);
  expect(result.outBytes).toBeGreaterThan(1000);
});

test("pipeline produces a decodable GIF from a video input", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openBench(page);
  await selectFixture(page, "screen-720p-10s.mp4");

  const result = await runJob(page, {
    encoder: "gifski",
    width: 320,
    fps: 10,
    maxFrames: 20,
  });

  expect(result.error).toBeNull();
  expect(result.ok).toBe(true);
  expect(result.frames).toBe(20);
  expect(result.roundTrip?.header).toBe("GIF89a");
  expect(result.roundTrip?.frameCount).toBe(20);
});
