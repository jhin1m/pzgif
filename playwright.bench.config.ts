import { defineConfig, devices } from "@playwright/test";

const PORT = 3101;
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * The Phase 1 benchmark runner.
 *
 * Separate from `playwright.config.ts` on purpose. The ordinary e2e suite runs
 * against a build with **no** `/__bench` route and asserts it 404s; this one
 * runs against a build that opted the route in with `PZGIF_ENABLE_BENCH=1`. One
 * config cannot serve both, because the whole point of the first assertion is
 * that the second build is not what ships.
 *
 * Still a production build, not `next dev` — gate G5 is about the production
 * CSP, the `immutable` `/wasm/*` headers and Turbopack's optimised output.
 *
 * Timeouts are long and workers are one: these are measurements, and two
 * benchmarks sharing a CPU produce two wrong numbers rather than one right one.
 * Firefox is in the matrix because G1 requires all three engines.
 */
export default defineConfig({
  testDir: "./e2e/bench",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "bench-results/playwright.json" }]],
  timeout: 30 * 60_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: "off",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: `PZGIF_ENABLE_BENCH=1 pnpm build && pnpm start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
