import { expect, test } from "@playwright/test";
import {
  descriptors,
  openBench,
  runContext,
  runJob,
  selectFixture,
  writeResult,
} from "./harness";

/**
 * `calibration.json` — the dataset Phase 4's `estimate.ts` is built on.
 *
 * The product shows a live "≈ 1.8 MB" readout before a job runs. That figure is
 * a headline feature on two wireframes, and a bad one erodes trust faster than
 * no figure at all, so it has to be fitted to measured data rather than guessed
 * from a formula.
 *
 * ── Why content descriptors are recorded alongside the settings ──────────────
 * GIF output size is dominated by content, not by settings. `photo-grain.gif`
 * and `flat-art.gif` are in the corpus precisely because they bracket that
 * range, and an estimator keyed only on (width, fps, quality, colours) ignores
 * the dominant variable and cannot be accurate at any resolution the UI offers.
 * Settling the estimator's input features is a deliverable of this phase, not
 * of Phase 4 — otherwise the calibration data depends on the thing it exists to
 * enable.
 *
 * ── Why this is not a full factorial ────────────────────────────────────────
 * The wireframes expose quality 1-100, colours {256,128,64,32}, width 240-640
 * and fps 8-24. Crossing all of those over nine fixtures is tens of thousands of
 * encodes — days of wall clock at the measured gifski throughput, and far worse
 * on Firefox. This sweeps one axis at a time from a shared baseline, which gives
 * the per-axis gradients a model needs, and records the baseline point so the
 * axes can be recombined. Where a cross-term turns out to matter, Phase 4 has
 * the harness to measure it directly.
 */

const BASELINE = { width: 480, fps: 15, quality: 80, colours: 256 } as const;

/** Frames are capped so the sweep stays tractable; bytes-per-frame is the
 *  quantity the estimator actually needs, and it is recorded per row. */
const MAX_FRAMES = 48;

const WIDTHS = [240, 320, 400, 480, 560, 640];
const QUALITIES = [20, 40, 60, 80, 100];
const COLOURS = [256, 128, 64, 32];
const FPS = [8, 12, 15, 20, 24];

const GIF_FIXTURES = [
  "loop-small.gif",
  "loop-large.gif",
  "photo-grain.gif",
  "flat-art.gif",
  "odd-dims.gif",
];
const VIDEO_FIXTURES = ["screen-720p-10s.mp4", "clip-vp9-5s.webm"];

test("emit calibration.json", async ({ page, browserName }) => {
  test.setTimeout(120 * 60_000);
  // One engine. Output bytes are a property of the encoder, not the browser —
  // and the cross-engine spec already measured where that assumption is tested.
  test.skip(browserName !== "chromium", "Byte counts do not vary by engine.");

  await openBench(page);
  const context = await runContext(page, browserName);

  const rows = [];
  const content = [];

  for (const fixture of [...GIF_FIXTURES, ...VIDEO_FIXTURES]) {
    await selectFixture(page, fixture);
    const isVideo = !fixture.endsWith(".gif");

    content.push({
      fixture,
      descriptors: await descriptors(page, {
        ...BASELINE,
        maxFrames: MAX_FRAMES,
      }),
    });

    const points: Array<{ axis: string; spec: Record<string, number> }> = [
      ...WIDTHS.map((width) => ({ axis: "width", spec: { width } })),
      ...QUALITIES.map((quality) => ({ axis: "quality", spec: { quality } })),
      ...COLOURS.map((colours) => ({ axis: "colours", spec: { colours } })),
      ...(isVideo ? FPS.map((fps) => ({ axis: "fps", spec: { fps } })) : []),
    ];

    for (const point of points) {
      // The colours axis only means anything to `gifenc` — gifski always
      // builds a 256-entry palette and exposes quality instead. Sweeping
      // colours through gifski would record four identical byte counts and
      // imply a relationship that does not exist.
      const encoder = point.axis === "colours" ? "gifenc" : "gifski";

      const result = await runJob(page, {
        ...BASELINE,
        ...point.spec,
        encoder,
        maxFrames: MAX_FRAMES,
      });

      if (!result.ok) {
        rows.push({ fixture, axis: point.axis, encoder, ...point.spec, ok: false, error: result.error });
        continue;
      }

      rows.push({
        fixture,
        axis: point.axis,
        encoder,
        width: result.outWidth,
        height: result.outHeight,
        fps: BASELINE.fps,
        quality: BASELINE.quality,
        colours: BASELINE.colours,
        ...point.spec,
        frames: result.frames,
        outBytes: result.outBytes,
        bytesPerFrame: +(result.outBytes / result.frames).toFixed(1),
        bytesPerPixel: +(
          result.outBytes /
          (result.frames * result.outWidth * result.outHeight)
        ).toFixed(4),
        encodeMs: Math.round(result.timings.encodeMs),
        ok: true,
        error: null,
      });
    }
  }

  writeResult("calibration.json", {
    generatedBy: "e2e/bench/calibration.spec.ts",
    context,
    baseline: BASELINE,
    maxFrames: MAX_FRAMES,
    design:
      "One-axis-at-a-time from the baseline, not a full factorial. Per-axis gradients plus the shared baseline point; cross-terms are unmeasured.",
    estimatorFeatures: [
      "frames",
      "width",
      "height",
      "quality (gifski) or colours (gifenc)",
      "paletteEntropyBits",
      "distinctColours",
      "meanInterFrameDelta",
      "flatPixelRatio",
    ],
    content,
    rows,
  });

  expect(rows.filter((row) => row.ok).length).toBeGreaterThan(0);
});
