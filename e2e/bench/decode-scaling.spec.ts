import { test } from "@playwright/test";
import {
  openBench,
  runContext,
  runJob,
  selectFixture,
  writeResult,
} from "./harness";

/**
 * How GIF decode time scales with frame count — not a numbered gate.
 *
 * Added because G4 turned up a number that does not fit: 200 frames at 640x480
 * took 262 s, when G2's 150 frames at 480x270 took 4 s. Scaling by pixel count
 * predicts roughly 11 s, so something is growing faster than the work is.
 *
 * The suspect is this project's own decode strategy. `decode-gif.ts` calls
 * `modern-gif`'s `decodeFrame(source, index)` once per frame, chosen so decode
 * memory stays constant instead of O(frames). If that call composites from the
 * animation's start each time — which is what GIF disposal semantics would force
 * on a stateless per-index API — then the decode is O(n^2) and the constant
 * memory was bought with quadratic time.
 *
 * This measures the same fixture at rising frame counts. Linear growth in
 * per-frame cost exonerates the decoder and points at the encoder; growth in
 * *per-frame* cost with n convicts it. Either answer changes Phase 4.
 */

const FRAME_COUNTS = [10, 25, 50, 100, 200];

test("GIF decode cost against frame count", async ({ page, browserName }) => {
  test.setTimeout(60 * 60_000);
  test.skip(browserName !== "chromium", "One engine is enough to see a curve.");

  await openBench(page);
  const context = await runContext(page, browserName);
  await selectFixture(page, "loop-large.gif");

  const rows = [];
  for (const maxFrames of FRAME_COUNTS) {
    // `gifenc` rather than gifski: it is far faster here, so the encode term
    // stays small and the decode curve is not buried under it.
    const result = await runJob(page, {
      encoder: "gifenc",
      width: 240,
      maxFrames,
      colours: 64,
    });

    rows.push({
      maxFrames,
      frames: result.frames,
      decodeMs: result.timings.decodeMs,
      encodeMs: result.timings.encodeMs,
      decodeMsPerFrame: result.timings.decodeMs / Math.max(1, result.frames),
      encodeMsPerFrame: result.timings.encodeMs / Math.max(1, result.frames),
      ok: result.ok,
      error: result.error,
    });
  }

  const first = rows[0];
  const last = rows[rows.length - 1];

  writeResult(`decode-scaling.${browserName}.json`, {
    context,
    fixture: "loop-large.gif",
    rows,
    // If per-frame decode cost is flat, decode is linear. If it rises with the
    // frame count, it is not.
    perFrameGrowthFactor:
      last.decodeMsPerFrame / Math.max(0.001, first.decodeMsPerFrame),
    verdict:
      last.decodeMsPerFrame > first.decodeMsPerFrame * 3
        ? "decode is super-linear in frame count"
        : "decode is approximately linear",
  });
});
