import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import type {
  BenchJobSpec,
  BenchResult,
  ContainerInspection,
  SoakSummary,
} from "../../src/lib/bench/types";

export const FIXTURES = join(process.cwd(), "e2e", "fixtures");
export const RESULTS = join(process.cwd(), "bench-results");

/**
 * Every recorded number carries the machine and browser it came from.
 *
 * `phase-01` is explicit that a measurement without device, OS and browser
 * identity is not a result — a bare millisecond count cannot be compared against
 * anything later, and cannot be defended when it is questioned.
 */
export interface RunContext {
  browser: string;
  browserVersion: string;
  platform: string;
  cpuCores: number | null;
  deviceMemoryGb: number | null;
  userAgent: string;
  recordedAt: string;
}

export async function runContext(
  page: Page,
  browserName: string,
): Promise<RunContext> {
  const probe = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    cpuCores: navigator.hardwareConcurrency ?? null,
    deviceMemoryGb:
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
  }));
  return {
    browser: browserName,
    browserVersion: page.context().browser()?.version() ?? "unknown",
    ...probe,
    recordedAt: new Date().toISOString(),
  };
}

/** Opens the harness and waits for its window API to be installed. */
export async function openBench(page: Page): Promise<void> {
  const response = await page.goto("/__bench");
  if (!response || response.status() !== 200) {
    throw new Error(
      `/__bench returned ${response?.status()} — build without PZGIF_ENABLE_BENCH=1?`,
    );
  }
  await page.waitForFunction(() => Boolean(window.__bench));
}

/**
 * Loads a fixture through the real file input.
 *
 * Not a `fetch` into an ArrayBuffer: that would bypass the `File` plumbing every
 * tool page uses, and a benchmark that skips the product's own input path can
 * pass while the product fails.
 */
export async function selectFixture(page: Page, name: string): Promise<void> {
  await page.setInputFiles('[data-testid="bench-file"]', join(FIXTURES, name));
  await page.waitForFunction(
    (expected) => window.__bench?.file()?.name === expected,
    name,
  );
}

export function bootProbe(
  page: Page,
): Promise<{ ok: boolean; ms: number; error: string | null }> {
  return page.evaluate(() => window.__bench!.boot());
}

export function inspect(page: Page): Promise<ContainerInspection> {
  return page.evaluate(() => window.__bench!.inspect());
}

export function runJob(
  page: Page,
  spec: Partial<BenchJobSpec>,
): Promise<BenchResult> {
  return page.evaluate((s) => window.__bench!.job(s), spec);
}

export function descriptors(
  page: Page,
  spec: Partial<BenchJobSpec>,
): Promise<unknown> {
  return page.evaluate((s) => window.__bench!.descriptors(s), spec);
}

export function runSoak(
  page: Page,
  options: {
    runs: number;
    mode: "worker-per-job" | "long-lived-worker";
    spec?: Partial<BenchJobSpec>;
    warmup?: number;
  },
): Promise<SoakSummary> {
  return page.evaluate((o) => window.__bench!.soak(o), options);
}

export function writeResult(name: string, payload: unknown): string {
  mkdirSync(RESULTS, { recursive: true });
  const path = join(RESULTS, name);
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n");
  return path;
}

/**
 * Peak renderer memory from the Chrome DevTools Protocol.
 *
 * `performance.measureUserAgentSpecificMemory()` is not an option: it requires
 * cross-origin isolation, and those headers break ad serving — so with them the
 * measurement would describe an app this project can never ship, and without
 * them it throws. CDP asks the browser rather than the page, so no header is
 * involved. Chromium only; null elsewhere, never a substituted estimate.
 */
export async function cdpMemorySampler(page: Page, browserName: string) {
  if (browserName !== "chromium") {
    return { sample: async () => {}, peak: () => null as number | null };
  }
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  let peak = 0;

  const sample = async () => {
    const { metrics } = await session.send("Performance.getMetrics");
    const value = metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;
    peak = Math.max(peak, value);
  };

  await sample();
  return { sample, peak: () => (peak > 0 ? peak : null) };
}
