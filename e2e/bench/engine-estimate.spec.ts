import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { RESULTS, runContext } from "./harness";
import { openEngine, runEngine, selectEngineFixture } from "./engine-harness";

/**
 * How wrong the estimator actually is, measured rather than assumed.
 *
 * The estimate is a headline element on two wireframes and it seeds the Discord
 * auto-fit search, so its error is a product number, not a curiosity. This spec
 * records it per fixture and asserts the one property that has to hold: **the
 * real size falls inside the range that was shown.** A midpoint that drifts is
 * tolerable; a range that excludes the truth is a broken promise.
 *
 * The recorded artefact is what `SAMPLED_ESTIMATE_SPREAD` in `calibration.ts`
 * should be set from. If the measured error is consistently tighter, narrow the
 * band — a range wider than the evidence is its own kind of dishonesty.
 */

const FIXTURES = [
  { name: "loop-small.gif", width: 320 },
  { name: "flat-art.gif", width: 320 },
  { name: "photo-grain.gif", width: 320 },
  { name: "odd-dims.gif", width: 320 },
];

test("estimates bracket the real output size", async ({ page }, testInfo) => {
  test.setTimeout(10 * 60_000);
  await openEngine(page);

  const rows: Array<{
    fixture: string;
    estimateBytes: number;
    low: number;
    high: number;
    basis: string;
    actualBytes: number;
    relativeError: number;
    withinRange: boolean;
  }> = [];

  for (const fixture of FIXTURES) {
    await selectEngineFixture(page, fixture.name);
    const spec = {
      geometry: { targetWidth: fixture.width },
      output: { kind: "gif" as const, quality: 80, colours: 256 },
    };

    const estimate = await page.evaluate(
      (argument) => window.__engine!.estimate(argument),
      spec,
    );
    if (!("bytes" in estimate)) {
      throw new Error(`estimate refused for ${fixture.name}: ${estimate.code}`);
    }

    const outcome = await runEngine(page, spec);
    expect(outcome.status, fixture.name).toBe("done");
    const actualBytes = outcome.stats!.outBytes;

    rows.push({
      fixture: fixture.name,
      estimateBytes: estimate.bytes,
      low: estimate.low,
      high: estimate.high,
      basis: estimate.basis,
      actualBytes,
      relativeError: +((estimate.bytes - actualBytes) / actualBytes).toFixed(4),
      withinRange: actualBytes >= estimate.low && actualBytes <= estimate.high,
    });
  }

  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(
    join(RESULTS, `engine-estimate-accuracy.${testInfo.project.name}.json`),
    JSON.stringify(
      { context: await runContext(page, testInfo.project.name), rows },
      null,
      2,
    ),
  );

  for (const row of rows) {
    expect(
      row.withinRange,
      `${row.fixture}: ${row.actualBytes} outside ${row.low}-${row.high} (${row.basis})`,
    ).toBe(true);
  }
});
