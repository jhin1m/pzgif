import { test } from "@playwright/test";
import {
  openBench,
  runContext,
  runJob,
  selectFixture,
  writeResult,
} from "./harness";

/**
 * Stage weighting for the progress protocol.
 *
 * `phase-01` open question 1 asks how to report progress through an encoder that
 * exposes no callback and blocks its worker outright. The answer shapes Phase
 * 4's protocol, and `design-guidelines.md` §1.2 forbids inventing a percentage,
 * so the weights have to come from measurement.
 *
 * The research report proposed `0.05 probe + 0.55 decode + 0.40 encode`. That
 * was a guess, and this exists to replace it — a bar that moves at a badly wrong
 * rate is only marginally better than a fake one, and it is wrong in a way users
 * notice: it crawls, then jumps.
 *
 * Measured for both input kinds, because they are not alike. Video decode goes
 * through the browser's hardware decoder; GIF decode is pure JavaScript.
 */

const CASES = [
  { fixture: "loop-small.gif", label: "gif-input", spec: { width: 480 } },
  {
    fixture: "screen-720p-10s.mp4",
    label: "video-input",
    spec: { width: 480, fps: 15 },
  },
];

test("measure decode/encode stage split", async ({ page, browserName }) => {
  test.setTimeout(30 * 60_000);

  await openBench(page);
  const context = await runContext(page, browserName);

  const rows = [];
  for (const testCase of CASES) {
    await selectFixture(page, testCase.fixture);
    for (const encoder of ["gifski", "gifenc"] as const) {
      const result = await runJob(page, {
        ...testCase.spec,
        encoder,
        quality: 80,
        colours: 256,
      });
      if (!result.ok) continue;

      const { probeMs, decodeMs, encodeMs, totalMs } = result.timings;
      rows.push({
        input: testCase.label,
        fixture: testCase.fixture,
        encoder,
        frames: result.frames,
        probeMs: Math.round(probeMs),
        decodeMs: Math.round(decodeMs),
        encodeMs: Math.round(encodeMs),
        totalMs: Math.round(totalMs),
        probeShare: +(probeMs / totalMs).toFixed(3),
        decodeShare: +(decodeMs / totalMs).toFixed(3),
        encodeShare: +(encodeMs / totalMs).toFixed(3),
      });
    }
  }

  writeResult(`stage-split.${browserName}.json`, {
    context,
    proposedByResearch: { probe: 0.05, decode: 0.55, encode: 0.4 },
    rows,
  });
});
