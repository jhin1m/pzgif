import { test } from "@playwright/test";
import {
  openBench,
  runContext,
  runJob,
  selectFixture,
  writeResult,
} from "./harness";

/**
 * Cross-engine encoder timing — not one of `phase-01`'s numbered gates.
 *
 * Added because G2 turned up something the plan did not anticipate: gifski's
 * WASM encode is roughly an order of magnitude slower under Firefox than under
 * Chromium or WebKit, on the same frames, while Firefox's *decode* is the
 * fastest of the three. One fixture is an anecdote, so this runs the same
 * comparison across a spread of frame counts and sizes to establish whether the
 * gap is systemic and whether it scales with work.
 *
 * `gifenc` is measured alongside on identical inputs. If the gap is specific to
 * the WASM module rather than to the browser's general throughput, the pure-JS
 * encoder should not show it — and that difference is what decides whether the
 * answer is a per-engine encoder switch or something else entirely.
 */

const CASES = [
  { fixture: "loop-small.gif", width: 320, label: "48f @ 320px" },
  { fixture: "flat-art.gif", width: 320, label: "36f @ 320px" },
  { fixture: "odd-dims.gif", width: 240, label: "30f @ 240px" },
];

test("gifski vs gifenc encode time per engine", async ({
  page,
  browserName,
}) => {
  test.setTimeout(25 * 60_000);

  await openBench(page);
  const context = await runContext(page, browserName);

  const rows = [];
  for (const testCase of CASES) {
    await selectFixture(page, testCase.fixture);

    const gifski = await runJob(page, {
      encoder: "gifski",
      width: testCase.width,
      quality: 80,
    });
    const gifenc = await runJob(page, {
      encoder: "gifenc",
      width: testCase.width,
      colours: 256,
    });

    rows.push({
      ...testCase,
      frames: gifski.frames,
      outWidth: gifski.outWidth,
      outHeight: gifski.outHeight,
      gifskiEncodeMs: gifski.timings.encodeMs,
      gifencEncodeMs: gifenc.timings.encodeMs,
      gifskiBytes: gifski.outBytes,
      gifencBytes: gifenc.outBytes,
      decodeMs: gifski.timings.decodeMs,
      // Per megapixel of encoded output, so the three cases are comparable.
      gifskiMsPerMegapixel:
        gifski.timings.encodeMs /
        ((gifski.frames * gifski.outWidth * gifski.outHeight) / 1e6),
    });
  }

  writeResult(`encoder-cross-engine.${browserName}.json`, {
    context,
    rows,
  });
});
