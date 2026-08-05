/**
 * Timing and memory sampling for the spike.
 *
 * ── `measureUserAgentSpecificMemory()` is unusable here, in both directions ──
 * It requires cross-origin isolation. Without COOP+COEP it throws
 * `SecurityError`; with them, the boot path being measured would belong to an
 * app this project can never ship, because those headers break Google ad
 * serving. So it is not a matter of preferring another API — there is no
 * configuration in which its result would mean anything.
 *
 * What is used instead:
 *  - **CDP `Performance.getMetrics`**, driven from Playwright, for renderer
 *    totals. Chromium only.
 *  - **`performance.memory`** where present, as a rough cross-check only.
 *  - **The empirical OOM probe** — step the frame count up until the tab dies.
 *    Crude, and the only one of the three available on iOS at all, which makes
 *    it the number that actually decides the shipped limits.
 */

interface ChromiumPerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function performanceMemory(): ChromiumPerformanceMemory | null {
  const candidate = (
    performance as Performance & { memory?: ChromiumPerformanceMemory }
  ).memory;
  return candidate && typeof candidate.usedJSHeapSize === "number"
    ? candidate
    : null;
}

/**
 * Samples the JS heap high-water mark across a job.
 *
 * Returns null rather than 0 where the browser does not expose the figure. A
 * zero would average into a summary as a real measurement of "no memory used",
 * which is worse than a gap that is visibly a gap.
 */
export class HeapSampler {
  private peak: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  start(intervalMs = 50): void {
    this.sample();
    this.timer = setInterval(() => this.sample(), intervalMs);
  }

  sample(): void {
    const memory = performanceMemory();
    if (!memory) return;
    this.peak = Math.max(this.peak ?? 0, memory.usedJSHeapSize);
  }

  stop(): number | null {
    this.sample();
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    return this.peak;
  }
}

/** Milliseconds elapsed, from a monotonic clock. */
export function stopwatch(): () => number {
  const start = performance.now();
  return () => performance.now() - start;
}

/**
 * Runs `work` under a watchdog.
 *
 * gifski's `encode()` is a blocking synchronous WASM call with no cancellation,
 * so this cannot interrupt a hang — it only lets the *caller* stop waiting and
 * record the run as hung. Actually reclaiming the thread needs
 * `worker.terminate()` from the page side, which is why the soak runs in
 * worker-per-job mode as well as long-lived.
 */
export async function withWatchdog<T>(
  work: () => Promise<T>,
  timeoutMs: number,
): Promise<{ value: T | null; hang: boolean; ms: number }> {
  const elapsed = stopwatch();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const guard = new Promise<"hang">((resolve) => {
    timer = setTimeout(() => resolve("hang"), timeoutMs);
  });

  try {
    const outcome = await Promise.race([work(), guard]);
    if (outcome === "hang") return { value: null, hang: true, ms: elapsed() };
    return { value: outcome as T, hang: false, ms: elapsed() };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Re-decodes a produced GIF to prove it is a real file.
 *
 * `phase-01` and `tech-stack.md` §7 both require output assertions that decode
 * the result rather than check the DOM. A byte length greater than zero proves
 * only that *something* was written; a header and a frame count prove a decoder
 * can read it back.
 */
export async function roundTripGif(
  bytes: Uint8Array,
): Promise<{ header: string; frameCount: number }> {
  const header = new TextDecoder().decode(bytes.subarray(0, 6));
  const { decode } = await import("modern-gif");
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const gif = decode(buffer);
  return { header, frameCount: gif.frames.length };
}
