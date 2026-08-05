import { join } from "node:path";
import type { Page } from "@playwright/test";
import { FIXTURES } from "./harness";
import type {
  EngineApi,
  EngineRunOutcome,
} from "../../src/app/%5F%5Fbench/engine-console";
import type { JobSpec } from "../../src/lib/media/types";

/**
 * The harness API is typed from the component that installs it, rather than
 * redeclared here. Two structural copies of the same contract drift, and the
 * drift shows up as a test asserting a shape the product stopped producing.
 */
export type { EngineApi, EngineRunOutcome };
export type EngineSpec = Partial<JobSpec>;

/** Opens the harness and waits for the engine API to be installed. */
export async function openEngine(page: Page): Promise<void> {
  const response = await page.goto("/__bench");
  if (!response || response.status() !== 200) {
    throw new Error(
      `/__bench returned ${response?.status()} — build without PZGIF_ENABLE_BENCH=1?`,
    );
  }
  await page.waitForFunction(() => Boolean(window.__engine));
}

/**
 * Loads a fixture through the real file input.
 *
 * Not a `fetch` into an ArrayBuffer: that would bypass the `File` plumbing every
 * tool page uses, and a test that skips the product's own input path can pass
 * while the product fails.
 */
export async function selectEngineFixture(page: Page, name: string): Promise<void> {
  await page.setInputFiles('[data-testid="engine-file"]', join(FIXTURES, name));
  await page.waitForFunction(
    (expected) => window.__engine?.file()?.name === expected,
    name,
  );
}

export function runEngine(page: Page, spec: EngineSpec): Promise<EngineRunOutcome> {
  return page.evaluate((argument) => window.__engine!.run(argument), spec);
}
