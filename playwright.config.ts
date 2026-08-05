import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * E2E runs against a production build, never `next dev`: the CSP, the static
 * prerendering and the `immutable` wasm headers only exist there, and those are
 * the things most likely to break WASM instantiation.
 *
 * From Phase 5 onward these tests must assert real output by **decoding** the
 * produced file. A DOM assertion that a download button appeared proves nothing
 * about whether the encoder worked.
 */
export default defineConfig({
  testDir: "./e2e",
  // `e2e/bench/` needs a build that opts the `/__bench` route in, which is the
  // opposite of what this suite asserts. It has its own config.
  testIgnore: "**/bench/**",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
