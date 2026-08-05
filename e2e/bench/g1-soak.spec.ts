import { expect, test } from "@playwright/test";
import {
  openBench,
  runContext,
  runSoak,
  selectFixture,
  writeResult,
} from "./harness";

/**
 * Gate G1 — the deadlock soak.
 *
 * The highest technical risk in the product. `gifski-wasm` issue #5 is open and
 * unanswered, and the maintainer attributes it to "hacks I implemented to get
 * this to compile"; gifski uses `crossbeam-channel` even in the non-rayon build,
 * so the single-thread path is not exempt until measured.
 *
 * ── What a pass here does and does not mean ─────────────────────────────────
 * Zero hangs in 1000 runs puts the 95% confidence upper bound on the failure
 * rate at roughly 0.3%. That is a low ceiling, **not** proof of absence, and
 * roughly one job in three hundred is not a rate anyone would ship knowingly.
 * G1 is necessary and insufficient, and the two Phase 4 safeguards it implies —
 * a worker watchdog that turns a hang into a reported failure, and an automatic
 * per-job fallback to `gifenc` — are not optional extras on top of a pass.
 *
 * Both worker lifetimes are exercised because they stress different things. A
 * long-lived worker accumulates whatever state the module never releases; a
 * fresh worker per job re-instantiates the module a thousand times. A deadlock
 * caused by accumulated state would be invisible in the second mode, and one
 * caused by init races invisible in the first.
 *
 * The watchdog is calibrated from measured warm-up runs at 10x the median,
 * rather than fixed. A fixed threshold would call a slow machine a deadlock and
 * miss a real one on a fast fixture.
 */

/** Small settings on purpose: a thousand slow encodes measures patience. */
const SOAK_SPEC = { encoder: "gifski" as const, width: 160, maxFrames: 20 };

/**
 * Fixtures cycled through the soak. All of them, per `phase-01` — soaking one
 * fixture a thousand times exercises one code path a thousand times, and a
 * deadlock in channel handling is far likelier to depend on frame content and
 * count than on repetition.
 */
const SOAK_FIXTURES = [
  "loop-small.gif",
  "flat-art.gif",
  "photo-grain.gif",
  "odd-dims.gif",
  "loop-large.gif",
];

/**
 * Runs per mode, per fixture. The default gives 1000 encodes per browser across
 * the two modes; a nightly job should raise it, because the bound above only
 * tightens with volume.
 */
const RUNS_PER_FIXTURE = Number(process.env.PZGIF_SOAK_RUNS ?? 100);

for (const mode of ["long-lived-worker", "worker-per-job"] as const) {
  test(`G1 deadlock soak (${mode})`, async ({ page, browserName }) => {
    test.setTimeout(120 * 60_000);

    await openBench(page);
    const context = await runContext(page, browserName);

    const perFixture = [];
    let hangs = 0;
    let errors = 0;
    let runs = 0;

    for (const fixture of SOAK_FIXTURES) {
      await selectFixture(page, fixture);
      const summary = await runSoak(page, {
        runs: RUNS_PER_FIXTURE,
        mode,
        spec: SOAK_SPEC,
        warmup: 3,
      });

      hangs += summary.hangs;
      errors += summary.errors;
      runs += summary.runs;

      perFixture.push({
        fixture,
        runs: summary.runs,
        hangs: summary.hangs,
        errors: summary.errors,
        medianMs: summary.medianMs,
        watchdogMs: summary.watchdogMs,
        // Only failing rows are kept. A thousand successful rows per fixture is
        // noise that would bury the one row that matters.
        failures: summary.rows.filter((row) => !row.ok),
      });
    }

    writeResult(`g1-soak.${mode}.${browserName}.json`, {
      gate: "G1",
      mode,
      context,
      spec: SOAK_SPEC,
      totalRuns: runs,
      hangs,
      errors,
      // Stated in the artefact so a reader cannot mistake a pass for proof.
      confidenceNote:
        "Zero hangs in N runs bounds the failure rate at roughly 3/N with 95% confidence. This is a ceiling, not an absence.",
      perFixture,
    });

    expect(hangs).toBe(0);
    expect(errors).toBe(0);
  });
}
