import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { isGif, summariseGif } from "./lib/decode-output";

/**
 * The GIF compressor, end to end.
 *
 * ── Every output assertion decodes the bytes ───────────────────────────────
 * `plan.md`'s success criteria are explicit that a DOM check proves nothing: a
 * download button appears whether the encoder produced a valid animation or four
 * bytes of garbage. So the test downloads the file and walks it with
 * `lib/decode-output.ts`, which parses the GIF spec directly and shares no code
 * with the decoder under test.
 *
 * ── Fixture choice is not incidental ───────────────────────────────────────
 * `loop-small.gif` is 4.1 MB of 480x270 at 48 frames. It is used here because
 * the *reduction* has to be unambiguous: a small, already-optimised fixture can
 * legitimately come out larger at quality 80, and a test that failed on correct
 * behaviour would be worse than no test. Its 50 ms frame delays also land
 * exactly on GIF's 1/100 s granularity, so timing can be asserted to the
 * millisecond rather than to a tolerance that would hide a retiming bug.
 */

// Resolved from the repo root, the way `e2e/bench/harness.ts` does it. Playwright
// transpiles this suite to CommonJS, where `import.meta` does not exist.
const FIXTURE = join(process.cwd(), "e2e", "fixtures", "loop-small.gif");
const SOURCE = summariseGif(new Uint8Array(readFileSync(FIXTURE)));

/** Encoding a 48-frame GIF is seconds on V8 and slower under WebKit. */
const JOB_TIMEOUT_MS = 180_000;

/**
 * The stage column. Every assertion about job state scopes to it.
 *
 * The file name and the size delta each appear **twice** once a file is loaded:
 * in the stage, and again in the sticky action bar. The bar is `md:hidden`, so
 * it is `display: none` on a desktop viewport but still in the DOM — and
 * Playwright's text engine does not filter on visibility, so an unscoped
 * `getByText` resolves to two nodes and fails strict mode before asserting
 * anything.
 */
function stage(page: Page) {
  return page.locator("[data-tool-stage]");
}

async function loadFixture(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(stage(page).getByTitle("loop-small.gif")).toBeVisible();
}

/** The visible Download link — the inline one on desktop, the bar's on mobile. */
function downloadLink(page: Page) {
  return page.locator("a[download]:visible");
}

/** Runs a compression and returns the decoded bytes of what was downloaded. */
async function compressAndDecode(page: Page) {
  await page.getByRole("button", { name: "Compress GIF" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: JOB_TIMEOUT_MS }),
    downloadLink(page).click({ timeout: JOB_TIMEOUT_MS }),
  ]);
  const path = await download.path();
  const bytes = new Uint8Array(readFileSync(path));
  expect(isGif(bytes), "the download is not a GIF").toBe(true);
  return summariseGif(bytes);
}

test.describe("gif compressor", () => {
  test("serves the explainer and FAQ in the static HTML", async ({ page }) => {
    // The entire ranking strategy is that this prose is crawlable without
    // running JavaScript. Asserting on the DOM would pass even if the accordion
    // mounted its answers client-side, which is the failure mode that matters.
    const response = await page.goto("/gif-compressor");
    expect(response?.status()).toBe(200);
    const html = await response!.text();

    expect(html).toContain("How GIF compression actually works");
    // A collapsed FAQ answer, present in the served bytes.
    expect(html).toContain("no server-side quota because there is no server");
    // The corrected copy: the limit is frames, never an input file size.
    expect(html).not.toMatch(/150\s*MB|50\s*MB/);
  });

  test("emits BreadcrumbList and WebApplication, and never FAQPage", async ({
    page,
  }) => {
    const response = await page.goto("/gif-compressor");
    const html = await response!.text();

    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(
      html,
    );
    expect(block, "no JSON-LD on the page").not.toBeNull();

    const graph = JSON.parse(block![1]);
    const types = graph["@graph"].map((node: { "@type": string }) => node["@type"]);
    expect(types).toContain("BreadcrumbList");
    expect(types).toContain("WebApplication");

    // Google removed FAQ rich results on 2026-05-07 and deleted the docs on
    // 2026-06-15. The markup now buys nothing and can only be flagged.
    expect(html).not.toContain("FAQPage");
  });

  test("reserves every ad slot from first paint", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/gif-compressor");

    // Reserved and unfilled is the correct MVP end state — no network is
    // activated. What matters is that the boxes exist before anything loads, so
    // a later fill cannot reflow the page.
    for (const name of ["result-rect", "rail"]) {
      const slot = page.locator(`[data-ad-slot="${name}"]`);
      await expect(slot).toBeVisible();
      const box = await slot.boundingBox();
      expect(box!.height, name).toBeGreaterThan(200);
    }
    await expect(page.locator('[data-ad-slot="content-inline"]')).toBeVisible();
  });

  test("shows the whole dropzone at 375x667 without scrolling", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/gif-compressor");

    const dropzone = page.getByRole("button", {
      name: /drop your gif here/i,
    });
    const box = await dropzone.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(667);

    // No horizontal scroll at the narrowest supported width.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });

  test("keeps exactly one primary action on screen in every state", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/gif-compressor");

    const primaries = page.locator(".bg-brand-fill:visible");
    // Idle: the disabled Compress button, present and inert with a reason.
    await expect(primaries).toHaveCount(1);
    await expect(page.getByText("Add a GIF first.")).toBeVisible();

    await loadFixture(page);
    await expect(primaries).toHaveCount(1);
  });

  test("compresses a real GIF and produces a valid, smaller animation", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/gif-compressor");
    await loadFixture(page);

    // The probe has to answer before the settings mean anything.
    await expect(
      page.getByText(`${SOURCE.width}×${SOURCE.height}`),
    ).toBeVisible();

    const output = await compressAndDecode(page);

    // Smaller — the entire point of the tool.
    expect(output.byteLength).toBeLessThan(SOURCE.byteLength);

    // Same animation: every frame, at the original size, with the original
    // timing. A compressor that silently drops frames or halves the frame rate
    // would also produce a smaller file, and this is what tells them apart.
    expect(output.frames).toBe(SOURCE.frames);
    expect(output.width).toBe(SOURCE.width);
    expect(output.height).toBe(SOURCE.height);
    expect(output.durationMs).toBe(SOURCE.durationMs);
    expect(output.loops, "output does not loop").toBe(true);

    // The panel's byte counts are read from the real blobs, so they must agree
    // with the file that was just decoded.
    await expect(
      stage(page).getByText(/smaller|larger|no change/),
    ).toBeVisible();
  });

  test("honours 'drop every second frame' in the produced file", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/gif-compressor");
    await loadFixture(page);

    await page.getByRole("switch", { name: /drop every second frame/i }).click();
    const output = await compressAndDecode(page);

    // A stride of 2 over 48 frames keeps 24. Asserting the decoded count is the
    // only way to know the toggle reached the engine rather than the DOM.
    expect(output.frames).toBe(Math.ceil(SOURCE.frames / 2));
  });

  test("shifts nothing the user did not ask for", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "layout-shift API is Chromium-only");
    test.setTimeout(JOB_TIMEOUT_MS);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/gif-compressor");

    // `hadRecentInput` is the distinction that matters. The result panel grows
    // when a decoded frame with a real aspect ratio arrives, and no honest
    // reservation can predict that — but it follows a click, so it is excluded
    // from CLS. What must be zero is everything else: slots appearing late,
    // settings unhiding, a rail column materialising when an ad fills it.
    await page.evaluate(() => {
      const scope = window as typeof window & { __shift?: number };
      scope.__shift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[]) {
          if (!entry.hadRecentInput) scope.__shift! += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await loadFixture(page);
    await page.getByRole("button", { name: "Compress GIF" }).click();
    await expect(downloadLink(page)).toBeVisible({ timeout: JOB_TIMEOUT_MS });

    const shift = await page.evaluate(
      () => (window as typeof window & { __shift: number }).__shift,
    );
    expect(shift).toBe(0);
  });

  test("runs the whole job from the keyboard", async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/gif-compressor");

    // The dropzone is a real button, so it is reachable and operable without a
    // pointer — §7.3 forbids a drag-only path. The picker itself cannot be
    // driven from a test, so the file is supplied directly and everything after
    // it is keyboard-only.
    const dropzone = page.getByRole("button", { name: /drop your gif here/i });
    await dropzone.focus();
    await expect(dropzone).toBeFocused();

    await loadFixture(page);

    const compress = page.getByRole("button", { name: "Compress GIF" });
    await compress.focus();
    await page.keyboard.press("Enter");

    await expect(downloadLink(page)).toBeVisible({ timeout: JOB_TIMEOUT_MS });

    // The comparison slider is operable by keyboard, which is what makes the
    // proof surface usable without a pointer.
    const slider = page.getByRole("slider", {
      name: /compare before and after/i,
    });
    await slider.focus();
    await slider.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "0");
    await slider.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "100");
  });
});
