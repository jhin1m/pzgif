import { expect, test } from "@playwright/test";
import {
  openBench,
  runContext,
  runJob,
  selectFixture,
  writeResult,
} from "./harness";

/**
 * Gate G2 — desktop throughput.
 *
 * `screen-720p-10s.mp4` to a 480px-wide GIF at 15 fps. Thresholds from
 * `phase-01`: 15 s on desktop Chrome, 25 s on desktop Safari, and a
 * **pre-committed floor of 30 s** — below which the architecture is not viable
 * client-side and the answer is to escalate rather than to keep tuning defaults.
 *
 * Five runs, median reported. A single run measures whatever else the machine
 * was doing. The first run is kept and reported separately rather than
 * discarded: a cold `.wasm` compile is a real cost a first-time visitor pays,
 * and hiding it would make the copy's speed claims describe a warm repeat visit
 * that most users never make.
 *
 * Timings are *reported*, not CI-gated. Machine variance on a shared runner
 * would make the assertion flaky, and a flaky perf gate gets disabled rather
 * than fixed. The floor is asserted because it is a go/no-go architectural
 * fact, not a tuning target.
 *
 * ── Firefox is outside G2's stated scope, and that matters here ──────────────
 * `phase-01` names thresholds for Chrome and Safari only; Firefox appears in G1
 * (the soak) but not in G2. It is measured anyway, and it **breaches the 30 s
 * viability floor by a wide margin** — see `encoder-cross-engine.spec.ts`, where
 * gifski's WASM runs 12-14x slower under Firefox while pure-JS `gifenc` runs at
 * parity, which locates the problem in the WASM module rather than in the
 * browser's general throughput.
 *
 * That result is recorded and escalated rather than asserted, because asserting
 * a threshold the gate never set would be inventing a requirement — and
 * *removing* Firefox from the run to keep the suite green would bury the
 * finding, which is worse. The flag below is what the report reads.
 */

const RUNS = 5;
const VIABILITY_FLOOR_MS = 30_000;

/** Only the browsers `phase-01` G2 actually sets a threshold for. */
const TARGETS: Record<string, number> = {
  chromium: 15_000,
  webkit: 25_000,
};

const IN_GATE_SCOPE = new Set(["chromium", "webkit"]);

test("G2 desktop throughput", async ({ page, browserName }) => {
  test.setTimeout(20 * 60_000);

  await openBench(page);
  const context = await runContext(page, browserName);
  await selectFixture(page, "screen-720p-10s.mp4");

  const runs = [];
  for (let index = 0; index < RUNS; index += 1) {
    const result = await runJob(page, {
      encoder: "gifski",
      width: 480,
      fps: 15,
      quality: 80,
    });
    expect(result.error).toBeNull();
    expect(result.roundTrip?.header).toBe("GIF89a");
    runs.push(result);
  }

  const totals = runs.map((run) => run.timings.totalMs);
  const sorted = [...totals].sort((a, b) => a - b);
  const medianMs = sorted[Math.floor(sorted.length / 2)];

  const payload = {
    gate: "G2",
    fixture: "screen-720p-10s.mp4",
    settings: { width: 480, fps: 15, quality: 80, encoder: "gifski" },
    context,
    inGateScope: IN_GATE_SCOPE.has(browserName),
    target: TARGETS[browserName] ?? null,
    viabilityFloorMs: VIABILITY_FLOOR_MS,
    breachesViabilityFloor: medianMs >= VIABILITY_FLOOR_MS,
    coldRunMs: totals[0],
    medianMs,
    warmMedianMs: (() => {
      const warm = [...totals.slice(1)].sort((a, b) => a - b);
      return warm[Math.floor(warm.length / 2)];
    })(),
    meetsTarget: medianMs <= (TARGETS[browserName] ?? Infinity),
    runs: runs.map((run) => ({
      totalMs: run.timings.totalMs,
      probeMs: run.timings.probeMs,
      wasmInitMs: run.timings.wasmInitMs,
      decodeMs: run.timings.decodeMs,
      encodeMs: run.timings.encodeMs,
      frames: run.frames,
      outBytes: run.outBytes,
      outWidth: run.outWidth,
      outHeight: run.outHeight,
      peakJsHeapBytes: run.peakJsHeapBytes,
      longestMainThreadTaskMs: run.longestMainThreadTaskMs,
    })),
  };

  writeResult(`g2-throughput.${browserName}.json`, payload);

  if (IN_GATE_SCOPE.has(browserName)) {
    // The pre-committed floor. Not a tuning target — a viability statement.
    expect(medianMs).toBeLessThan(VIABILITY_FLOOR_MS);
  } else {
    // Out of G2's scope, so no threshold is asserted — but the number is
    // attached to the run so a breach cannot pass unnoticed as a green tick.
    test.info().annotations.push({
      type: payload.breachesViabilityFloor ? "G2-out-of-scope-BREACH" : "G2-out-of-scope",
      description: `${browserName} median ${Math.round(medianMs)}ms against a ${VIABILITY_FLOOR_MS}ms viability floor`,
    });
  }
});
