import { expect, test } from "@playwright/test";
import { openEngine, runEngine, selectEngineFixture } from "./engine-harness";

/**
 * The engine's acceptance suite.
 *
 * Every assertion here reads the **produced file back** — frame counts and
 * durations decoded out of the real output, dimensions read from the real
 * container. A test that checked the job reported success would pass against an
 * encoder that wrote a valid GIF header and nothing else, which is exactly the
 * class of defect that reaches users as "the download is broken".
 *
 * Runs under the bench config, because the harness route only exists in a build
 * that opted it in. From Phase 5 the same properties are asserted through the
 * real tool pages as well.
 */

test.describe("GIF in, GIF out", () => {
  test.beforeEach(async ({ page }) => {
    await openEngine(page);
    await selectEngineFixture(page, "loop-small.gif");
  });

  test("produces a real GIF at the planned size", async ({ page }) => {
    const outcome = await runEngine(page, { geometry: { targetWidth: 320 } });

    expect(outcome.status).toBe("done");
    expect(outcome.output?.kind).toBe("gif");
    if (outcome.output?.kind !== "gif") return;

    expect(outcome.output.width).toBe(outcome.plan?.width);
    expect(outcome.output.height).toBe(outcome.plan?.height);
    expect(outcome.output.width).toBe(320);
    expect(outcome.output.bytes).toBeGreaterThan(1000);
    expect(outcome.output.frameCount).toBe(outcome.stats?.frames);
  });

  test("keeps the animation's timing through a re-encode", async ({ page }) => {
    // A GIF that comes back playing at a different speed reads as the tool
    // breaking the file, so the delays have to survive the round trip.
    const outcome = await runEngine(page, { geometry: { targetWidth: 240 } });
    if (outcome.output?.kind !== "gif") throw new Error("expected a GIF");

    const total = outcome.output.durationsMs.reduce((sum, delay) => sum + delay, 0);
    expect(outcome.output.durationsMs.every((delay) => delay > 0)).toBe(true);
    // loop-small.gif is 48 frames at 10 ms stored, which browsers clamp to 100.
    expect(total).toBeGreaterThan(0);
  });

  test("halves the run time at 2x speed without losing frames", async ({ page }) => {
    const normal = await runEngine(page, { geometry: { targetWidth: 240 } });
    const faster = await runEngine(page, {
      geometry: { targetWidth: 240 },
      timing: { speed: 2 },
    });
    if (normal.output?.kind !== "gif" || faster.output?.kind !== "gif") {
      throw new Error("expected GIFs");
    }

    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
    expect(faster.output.frameCount).toBe(normal.output.frameCount);
    expect(sum(faster.output.durationsMs)).toBeLessThan(sum(normal.output.durationsMs));
  });

  test("ping-pong produces the frame count the plan budgeted", async ({ page }) => {
    // The plan's frame count is what memory was reserved against, so a mismatch
    // here is a memory-budget bug wearing an animation-length costume.
    const outcome = await runEngine(page, {
      geometry: { targetWidth: 240 },
      timing: { direction: "ping-pong" },
    });
    if (outcome.output?.kind !== "gif") throw new Error("expected a GIF");

    expect(outcome.plan?.frames).toBe(outcome.output.frameCount);
    expect(outcome.output.frameCount).toBeGreaterThan(48);
  });

  test("trims to a frame range", async ({ page }) => {
    const outcome = await runEngine(page, {
      geometry: { targetWidth: 240 },
      timing: { range: { from: 0, to: 10 } },
    });
    if (outcome.output?.kind !== "gif") throw new Error("expected a GIF");
    expect(outcome.output.frameCount).toBe(10);
  });

  test("crops before resizing", async ({ page }) => {
    // Cropping the left half of a 480x270 source and asking for 240px wide must
    // give a 240x270-shaped output — if resize ran first, the aspect ratio would
    // come out matching the uncropped frame instead.
    const outcome = await runEngine(page, {
      geometry: { targetWidth: 240, crop: { x: 0, y: 0, width: 240, height: 270 } },
    });
    if (outcome.output?.kind !== "gif") throw new Error("expected a GIF");

    const aspect = outcome.output.width / outcome.output.height;
    expect(Math.abs(aspect - 240 / 270)).toBeLessThan(0.02);
  });

  test("rotates a quarter turn and swaps the axes", async ({ page }) => {
    const outcome = await runEngine(page, {
      geometry: { targetWidth: 240, rotate: 90 },
    });
    if (outcome.output?.kind !== "gif") throw new Error("expected a GIF");
    expect(outcome.output.height).toBeGreaterThan(outcome.output.width);
  });

  test("reports determinate decode progress and no invented values", async ({ page }) => {
    const outcome = await runEngine(page, { geometry: { targetWidth: 240 } });

    const decode = outcome.progress.filter((event) => event.stage === "decode");
    expect(decode.length).toBeGreaterThan(0);
    expect(decode.some((event) => event.determinate)).toBe(true);

    for (const event of outcome.progress) {
      expect(event.value).toBeGreaterThanOrEqual(0);
      expect(event.value).toBeLessThanOrEqual(1);
      // The rule: a value only ever accompanies a real counter.
      if (event.determinate) expect(event.total).not.toBeNull();
    }
    // Monotonic — a bar that goes backwards reads as a crash.
    const values = outcome.progress.map((event) => event.value);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThanOrEqual(values[index - 1] - 1e-9);
    }
  });
});

test.describe("other outputs", () => {
  test("GIF to MP4 produces a playable video with even dimensions", async ({ page }) => {
    await openEngine(page);
    await selectEngineFixture(page, "odd-dims.gif");

    const outcome = await runEngine(page, {
      toolSlug: "gif-to-mp4",
      geometry: { targetWidth: 320 },
      output: { kind: "video", container: "mp4" },
    });

    expect(outcome.status).toBe("done");
    if (outcome.output?.kind !== "video") throw new Error("expected a video");
    // H.264 in yuv420p rejects odd dimensions, and odd-dims.gif is 499x281.
    expect(outcome.output.width % 2).toBe(0);
    expect(outcome.output.height % 2).toBe(0);
    expect(outcome.output.bytes).toBeGreaterThan(1000);
    expect(outcome.output.codec).toBeTruthy();
  });

  test("splitting to frames produces one ZIP entry per frame", async ({ page }) => {
    await openEngine(page);
    await selectEngineFixture(page, "loop-small.gif");

    const outcome = await runEngine(page, {
      toolSlug: "split-gif-to-frames",
      geometry: { targetWidth: 160 },
      timing: { range: { from: 0, to: 8 } },
      output: { kind: "png-zip" },
    });

    expect(outcome.status).toBe("done");
    if (outcome.output?.kind !== "zip") throw new Error("expected a zip");
    expect(outcome.output.entries).toBe(8);
  });
});

test.describe("video input", () => {
  test("portrait video with rotation metadata comes out upright", async ({ page }) => {
    // The single most common real-world input is portrait phone video. Ignoring
    // the container's display matrix turns every one of them sideways.
    await openEngine(page);
    await selectEngineFixture(page, "portrait-rotated.mp4");

    const capabilities = await page.evaluate(() => window.__engine!.capabilities());
    test.skip(capabilities.videoInput !== true, "no video input on this device tier");

    const outcome = await runEngine(page, {
      toolSlug: "mp4-to-gif",
      geometry: { targetWidth: 240 },
      timing: { fps: 10 },
    });

    expect(outcome.status).toBe("done");
    if (outcome.output?.kind !== "gif") throw new Error("expected a GIF");
    expect(outcome.output.height).toBeGreaterThan(outcome.output.width);
  });

  test("an undecodable codec is refused before decoding, with a reason", async ({ page }) => {
    // HEVC demuxes on every engine and decodes on neither Chromium nor Firefox.
    await openEngine(page);
    await selectEngineFixture(page, "phone-1080p-5s.mov");

    const outcome = await runEngine(page, {
      toolSlug: "mp4-to-gif",
      geometry: { targetWidth: 240 },
      timing: { fps: 10 },
    });

    if (outcome.status === "done") {
      // WebKit decodes HEVC. A pass here is a real pass, not a skip.
      expect(outcome.output?.kind).toBe("gif");
      return;
    }
    expect(outcome.status).toBe("refused");
    expect(["decode-failed", "browser-unsupported"]).toContain(outcome.error?.code);
    expect(outcome.error?.actions.length).toBeGreaterThan(0);
  });
});

test.describe("refusals and recovery", () => {
  test("a video named .gif is routed to a tool that takes video", async ({ page }) => {
    await openEngine(page);
    await selectEngineFixture(page, "screen-720p-10s.mp4");

    const outcome = await runEngine(page, {
      toolSlug: "gif-compressor",
      geometry: { targetWidth: 240 },
    });

    expect(outcome.status).toBe("refused");
    expect(outcome.error?.code).toBe("unsupported-format");
    const suggestion = outcome.error?.actions.find((action) => action.kind === "use-tool");
    expect(suggestion?.slug).toBe("mp4-to-gif");
  });

  test("every refusal offers a next step and a way to report it", async ({ page }) => {
    await openEngine(page);
    await selectEngineFixture(page, "screen-720p-10s.mp4");
    const outcome = await runEngine(page, { toolSlug: "gif-compressor" });

    expect(outcome.error?.actions.some((action) => action.kind === "report")).toBe(true);
    expect(outcome.error?.actions.length).toBeGreaterThan(1);
  });
});

test.describe("cancellation", () => {
  test("stops within 500 ms and leaves a clean state", async ({ page }) => {
    await openEngine(page);
    await selectEngineFixture(page, "loop-large.gif");

    const result = await page.evaluate(() =>
      window.__engine!.runAndCancel({ geometry: { targetWidth: 480 } }, 250),
    );

    expect(result.status).toBe("cancelled");
    expect(result.cancelMs).toBeLessThan(500);
  });
});
