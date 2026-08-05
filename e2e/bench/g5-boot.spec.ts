import { expect, test } from "@playwright/test";
import { WASM_BASE_PATH } from "../../src/lib/site-config";
import { bootProbe, openBench, runContext, writeResult } from "./harness";

/**
 * Gate G5 — the boot path.
 *
 * The reason the harness lives inside the real app rather than in its own
 * scaffold. Everything that can stop `WebAssembly.instantiate` from working is a
 * production-only fact: the CSP (`'wasm-unsafe-eval'` must be present and
 * `'unsafe-eval'` must not be needed), `worker-src`, the `application/wasm`
 * Content-Type the streaming path depends on, and the `immutable` cache header
 * on a versioned path. A spike in a bare Next project would test none of them.
 *
 * The MIME assertion is not pedantry. The wasm-bindgen glue tries
 * `instantiateStreaming` first and silently falls back to a buffered compile on
 * a wrong Content-Type, warning only in the console — so a MIME regression
 * shows up as a slow first load nobody attributes to a header.
 */

test.describe("G5 boot path", () => {
  test("the .wasm is served correctly", async ({ page, browserName }) => {
    const response = await page.request.get(
      `${WASM_BASE_PATH}/gifski_wasm_bg.wasm`,
    );

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/wasm");
    expect(response.headers()["cache-control"]).toContain("immutable");

    const body = await response.body();
    // The WebAssembly magic number: \0asm.
    expect([...body.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);

    writeResult(`g5-wasm-headers.${browserName}.json`, {
      status: response.status(),
      contentType: response.headers()["content-type"],
      cacheControl: response.headers()["cache-control"],
      bytes: body.byteLength,
    });
  });

  test("the worker instantiates gifski behind the production CSP", async ({
    page,
    browserName,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await openBench(page);
    const context = await runContext(page, browserName);

    // Cold: nothing cached, module compiled from scratch. This is the number a
    // first-time visitor actually pays.
    const cold = await bootProbe(page);
    // Warm: the init promise is memoised, so this measures the memoisation, not
    // a second compile. Recorded separately rather than averaged in — averaging
    // them would produce a figure describing neither visit.
    const warm = await bootProbe(page);

    writeResult(`g5-boot.${browserName}.json`, {
      gate: "G5",
      context,
      coldMs: cold.ms,
      warmMs: warm.ms,
      ok: cold.ok,
      error: cold.error,
      consoleErrors,
    });

    expect(cold.error).toBeNull();
    expect(cold.ok).toBe(true);
    // A CSP refusal surfaces here rather than as a thrown error in some engines.
    expect(consoleErrors.join("\n")).not.toMatch(/Content Security Policy/i);
  });

  test("no page is cross-origin isolated", async ({ page }) => {
    await openBench(page);
    // If this is ever true, ad serving is broken and the revenue model with it.
    expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(false);
  });
});
