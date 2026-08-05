import { expect, test } from "@playwright/test";
import {
  inspect,
  openBench,
  runContext,
  runJob,
  selectFixture,
  writeResult,
} from "./harness";

/**
 * Gate G7 — container coverage and rotation.
 *
 * Two questions. Which fixtures can mediabunny demux at all, per engine — which
 * is what decides whether an `@ffmpeg/core` fallback is worth building for MVP,
 * given it costs ~10 MB gzip to load. And whether container rotation metadata is
 * honoured.
 *
 * The rotation check is a dimension assertion, not a visual one.
 * `portrait-rotated.mp4` has landscape 1920x1080 coded frames carrying a
 * 90-degree display matrix, so an upright output must come out taller than it is
 * wide. If rotation were ignored the output would still be a perfectly valid
 * GIF — just sideways — and every check short of this one would pass.
 */

const VIDEO_FIXTURES = [
  "screen-720p-10s.mp4",
  "phone-1080p-5s.mov",
  "clip-vp9-5s.webm",
  "portrait-rotated.mp4",
];

test("G7 container coverage", async ({ page, browserName }) => {
  test.setTimeout(10 * 60_000);

  await openBench(page);
  const context = await runContext(page, browserName);

  const coverage = [];
  for (const fixture of VIDEO_FIXTURES) {
    await selectFixture(page, fixture);
    const inspection = await inspect(page).catch((error) => ({
      kind: "video" as const,
      ok: false,
      error: String(error),
      details: {},
    }));

    // Demuxing is not decoding. Reading a codec string off the container proves
    // the box structure parsed; it says nothing about whether the engine can
    // actually turn HEVC or VP9 samples into frames — and that is the question
    // that decides whether a ~10 MB ffmpeg fallback has to exist at MVP. So
    // every fixture is put through a real short decode as well.
    const decoded = inspection.ok
      ? await runJob(page, {
          encoder: "gifenc",
          width: 160,
          fps: 5,
          maxFrames: 4,
        }).catch((error) => ({
          ok: false,
          error: String(error),
          frames: 0,
          roundTrip: null,
        }))
      : { ok: false, error: "not demuxable", frames: 0, roundTrip: null };

    coverage.push({
      fixture,
      demux: { ok: inspection.ok, error: inspection.error },
      details: inspection.details,
      decode: {
        ok: decoded.ok && decoded.frames > 0,
        frames: decoded.frames,
        error: decoded.error,
        decodesToValidGif: decoded.roundTrip?.header === "GIF89a",
      },
    });
  }

  writeResult(`g7-containers.${browserName}.json`, {
    gate: "G7",
    context,
    coverage,
  });

  // Recorded, not asserted: which codecs an engine can decode is the finding
  // this gate exists to produce, and asserting a list would only re-state the
  // expectation instead of measuring it.
  test
    .info()
    .annotations.push({
      type: "G7-coverage",
      description: coverage
        .map(
          (row) =>
            `${row.fixture}: demux ${row.demux.ok ? "ok" : "FAIL"}, decode ${row.decode.ok ? "ok" : `FAIL ${row.decode.error}`}`,
        )
        .join("; "),
    });
});

test("G7 portrait video produces an upright GIF", async ({
  page,
  browserName,
}) => {
  test.setTimeout(10 * 60_000);

  await openBench(page);
  await selectFixture(page, "portrait-rotated.mp4");

  const inspection = await inspect(page);
  const result = await runJob(page, {
    encoder: "gifski",
    width: 240,
    fps: 10,
    maxFrames: 12,
  });

  writeResult(`g7-rotation.${browserName}.json`, {
    gate: "G7",
    probe: inspection.details,
    outWidth: result.outWidth,
    outHeight: result.outHeight,
    upright: result.outHeight > result.outWidth,
    ok: result.ok,
    error: result.error,
  });

  expect(result.error).toBeNull();
  // The coded frame is landscape. A taller-than-wide output is only possible if
  // the display matrix was applied.
  expect(result.outHeight).toBeGreaterThan(result.outWidth);
});
