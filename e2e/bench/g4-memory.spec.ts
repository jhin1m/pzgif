import { test } from "@playwright/test";
import {
  cdpMemorySampler,
  openBench,
  runContext,
  runJob,
  selectFixture,
  writeResult,
} from "./harness";

/**
 * Gate G4 — the memory ceiling.
 *
 * `phase-01` is explicit that this gate has no failure mode, only a number: the
 * measured ceiling becomes the clamp in `src/lib/media/limits.ts`, whose tier
 * budgets are currently research estimates carrying `measured: false`.
 *
 * Two instruments, because neither alone is enough:
 *
 *  - **CDP `Performance.getMetrics`** for the JS heap. Chromium only, and it
 *    asks the browser rather than the page — so unlike
 *    `measureUserAgentSpecificMemory()` it needs no cross-origin isolation, and
 *    isolation is precisely what this project cannot have.
 *  - **The empirical probe**: walk the frame budget up until something breaks.
 *    Crude, but it is the only instrument that exists on iOS, and it measures
 *    the thing that actually matters — the point at which a real user loses
 *    their work — rather than a heap figure that correlates with it.
 *
 * The desktop numbers here do **not** transfer to mobile. The whole memory model
 * rests on an iPhone SE 3-class floor, and no amount of desktop measurement
 * substitutes for it.
 */

/**
 * Steps in RGBA frame-buffer terms, not in file size.
 *
 * `2 x frames x w x h x 4` is the quantity that binds — the 2 is gifski copying
 * every frame a second time into the WASM heap — and input file size predicts it
 * so poorly that budgeting on file size is how a 2 MB GIF kills a tab.
 */
const STEPS = [
  { width: 320, maxFrames: 50 },
  { width: 480, maxFrames: 100 },
  { width: 640, maxFrames: 200 },
  { width: 800, maxFrames: 200 },
];

/**
 * Generous, because the largest step legitimately takes minutes — Chromium
 * needed 262 s for the 640px step. Long enough not to cut off real work, short
 * enough that a dead renderer is recorded within the hour.
 */
const STEP_TIMEOUT_MS = 12 * 60_000;

test("G4 memory ceiling", async ({ page, browserName }) => {
  test.setTimeout(30 * 60_000);

  await openBench(page);
  const context = await runContext(page, browserName);
  const memory = await cdpMemorySampler(page, browserName);
  await selectFixture(page, "loop-large.gif");

  interface StepOutcome {
    width: number;
    maxFrames: number;
    ok: boolean;
    error: string | null;
    frames: number;
    outWidth: number;
    outHeight: number;
    frameBufferBytes: number;
    frameBufferMb: number;
    peakJsHeapBytes: number | null;
    totalMs: number;
  }

  const steps: StepOutcome[] = [];
  let firstFailure: StepOutcome | null = null;

  for (const step of STEPS) {
    const sampler = setInterval(() => void memory.sample(), 100);
    let outcome: StepOutcome;
    try {
      // A renderer killed by the allocator stops answering rather than
      // reporting. Observed on WebKit at the 732 MB step, where the process
      // dropped to 0% CPU and the page waited indefinitely. An unanswered step
      // *is* the ceiling, so it is bounded and recorded rather than allowed to
      // stall the run.
      const result = await Promise.race([
        runJob(page, {
          encoder: "gifski",
          width: step.width,
          maxFrames: step.maxFrames,
          quality: 80,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("STEP_TIMEOUT: renderer stopped responding")),
            STEP_TIMEOUT_MS,
          ),
        ),
      ]);
      outcome = {
        ...step,
        ok: result.ok,
        error: result.error,
        frames: result.frames,
        outWidth: result.outWidth,
        outHeight: result.outHeight,
        frameBufferBytes: result.frameBufferBytes,
        frameBufferMb: +(result.frameBufferBytes / 1024 / 1024).toFixed(1),
        peakJsHeapBytes: result.peakJsHeapBytes,
        totalMs: result.timings.totalMs,
      };
    } catch (error) {
      // A worker killed by the allocator rejects the pending request rather
      // than returning a row. That is the ceiling, and it is the result.
      outcome = {
        ...step,
        ok: false,
        error: String(error),
        frames: 0,
        outWidth: 0,
        outHeight: 0,
        frameBufferBytes: 0,
        frameBufferMb: 0,
        peakJsHeapBytes: null,
        totalMs: 0,
      };
    } finally {
      clearInterval(sampler);
    }

    await memory.sample();
    steps.push(outcome);
    if (!outcome.ok && !firstFailure) firstFailure = outcome;
    // Once something breaks, larger steps tell us nothing new and risk taking
    // the page down mid-suite.
    if (!outcome.ok) break;
  }

  const largestOk = [...steps].reverse().find((step) => step.ok) ?? null;

  writeResult(`g4-memory.${browserName}.json`, {
    gate: "G4",
    context,
    fixture: "loop-large.gif",
    // Chromium only. Null elsewhere, never a substituted estimate — a zero here
    // would average into a summary as a real "used no memory" measurement.
    cdpPeakJsHeapBytes: memory.peak(),
    largestSuccessful: largestOk,
    firstFailure,
    // What to paste into limits.ts for this tier, once corroborated.
    observedCeilingMb: largestOk?.frameBufferMb ?? null,
    steps,
  });
});
