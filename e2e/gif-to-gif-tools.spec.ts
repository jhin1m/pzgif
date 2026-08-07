import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ADS_ENABLED } from "./lib/ads";
import { isGif, summariseGif } from "./lib/decode-output";
import { frameSignature, signatureDistance } from "./lib/pixel-probe";

/**
 * Resize, crop, speed and reverse — the four GIF-in, GIF-out tools.
 *
 * ── Every claim is checked against the produced file ──────────────────────
 * `plan.md` is explicit that a DOM assertion proves nothing: a Download button
 * appears whether the encoder wrote a correct animation or four bytes of
 * rubbish. So each test downloads the output and walks its bytes. Where the
 * structure cannot tell two outcomes apart — a reversed GIF has exactly the same
 * frame count and duration as the original — the first frame is decoded by the
 * browser and compared as pixels.
 *
 * ── The fixture ───────────────────────────────────────────────────────────
 * `loop-small.gif` is FFmpeg's `testsrc2` at 480×270, 48 frames, 50 ms apart.
 * Its content changes visibly from frame to frame, which is what makes the
 * ordering assertions possible, and its 50 ms delays land exactly on GIF's
 * 1/100 s granularity so timing can be asserted without a tolerance that would
 * hide a retiming bug.
 */

const FIXTURE = join(process.cwd(), "e2e", "fixtures", "loop-small.gif");
const SOURCE_BYTES = new Uint8Array(readFileSync(FIXTURE));
const SOURCE = summariseGif(SOURCE_BYTES);

/** A 48-frame encode is seconds on V8 and slower under WebKit. */
const JOB_TIMEOUT_MS = 180_000;

/** The stage column. The file name and size also render in the sticky bar. */
function stage(page: Page) {
  return page.locator("[data-tool-stage]");
}

async function loadFixture(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(stage(page).getByTitle("loop-small.gif")).toBeVisible();
  await waitForProbe(page);
}

/**
 * Waits for the worker's probe, not for anything that merely looks like it.
 *
 * The frame count is the tell. `480×270` alone is not: the crop overlay's own
 * readout contains those digits from first paint, because the fallback bounds
 * happen to match this fixture — so waiting on that raced the probe and let the
 * test type into a control whose defaults had not been applied yet.
 */
async function waitForProbe(page: Page) {
  await expect(
    stage(page).getByText(
      `${SOURCE.width}×${SOURCE.height} · ${SOURCE.frames} frames`,
    ),
  ).toBeVisible();
}

function downloadLink(page: Page) {
  return page.locator("a[download]:visible");
}

/** Runs the job and returns the bytes that were actually downloaded. */
async function runAndDownload(page: Page, action: string): Promise<Uint8Array> {
  await page.getByRole("button", { name: action, exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: JOB_TIMEOUT_MS }),
    downloadLink(page).click({ timeout: JOB_TIMEOUT_MS }),
  ]);
  const path = await download.path();
  const bytes = new Uint8Array(readFileSync(path));
  expect(isGif(bytes), "the download is not a GIF").toBe(true);
  return bytes;
}

/** Picks an option from one of the Radix selects in the settings panel. */
async function choose(page: Page, control: RegExp, option: RegExp) {
  await page.getByRole("combobox", { name: control }).click();
  await page.getByRole("option", { name: option }).click();
}

test.beforeEach(async ({ page }) => {
  // Desktop: the number inputs beside each slider are `md:block`, and the
  // primary action lives in the settings panel rather than the sticky bar.
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.describe("resize gif", () => {
  test("writes the exact width asked for and keeps every frame", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/resize-gif");
    await loadFixture(page);

    await page.getByLabel("Width (exact value)").fill("240");
    const output = summariseGif(await runAndDownload(page, "Resize GIF"));

    expect(output.width).toBe(240);
    // Height follows the source ratio: 240 × 270 ÷ 480.
    expect(output.height).toBe(135);
    // Resizing is not a retime and not a frame drop.
    expect(output.frames).toBe(SOURCE.frames);
    expect(output.durationMs).toBe(SOURCE.durationMs);
  });

  test("shows the output size before the job runs", async ({ page }) => {
    await page.goto("/resize-gif");
    await loadFixture(page);
    // The readout is the whole decision on this page, so it is asserted as a
    // pre-run fact rather than as a label on the result.
    await expect(
      page.getByText("Output 480×270 px · 100% of the original"),
    ).toBeVisible();
  });
});

test.describe("crop gif", () => {
  test("cuts the typed rectangle out of every frame", async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/crop-gif");
    await loadFixture(page);

    const region = { x: 96, y: 24, width: 192, height: 144 };
    for (const field of ["width", "height", "x", "y"] as const) {
      const input = page.locator(`[data-crop-field="${field}"]`);
      await input.fill(String(region[field]));
      await input.press("Enter");
    }

    const bytes = await runAndDownload(page, "Crop GIF");
    const output = summariseGif(bytes);

    expect(output.width).toBe(region.width);
    expect(output.height).toBe(region.height);
    expect(output.frames).toBe(SOURCE.frames);

    // Dimensions alone would also pass if the crop had been taken from the
    // wrong corner. This compares the output's first frame with the region it
    // claims to have come from, and with the whole frame as a control.
    const cropped = await frameSignature(page, bytes);
    const fromRegion = await frameSignature(page, SOURCE_BYTES, region);
    const fromWholeFrame = await frameSignature(page, SOURCE_BYTES);

    const regionDistance = signatureDistance(cropped, fromRegion);
    const wholeDistance = signatureDistance(cropped, fromWholeFrame);
    expect(regionDistance).toBeLessThan(24);
    expect(regionDistance).toBeLessThan(wholeDistance);
  });

  test("moves the rectangle with the arrow keys", async ({ page }) => {
    await page.goto("/crop-gif");
    await loadFixture(page);

    // Start from a rectangle with room to move in both directions.
    const x = page.locator('[data-crop-field="x"]');
    const width = page.locator('[data-crop-field="width"]');
    await width.fill("200");
    await width.press("Enter");
    await x.fill("40");
    await x.press("Enter");

    const mover = page.locator("[data-crop-move]");
    await mover.focus();
    await expect(mover).toBeFocused();

    for (let press = 0; press < 5; press += 1) {
      await mover.press("ArrowRight");
    }
    await expect(x).toHaveValue("45");

    // Shift is the coarse step, and it is the same arithmetic the drag uses.
    await mover.press("Shift+ArrowLeft");
    await expect(x).toHaveValue("35");
  });
});

test.describe("gif speed changer", () => {
  test("retiming keeps every frame and halves the duration", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/gif-speed-changer");
    await loadFixture(page);

    // 2× retime is the default. Every frame survives; only the delays change.
    const output = summariseGif(await runAndDownload(page, "Change speed"));

    expect(output.frames).toBe(SOURCE.frames);
    expect(output.width).toBe(SOURCE.width);
    // 50 ms halves to 25 ms, which GIF's 1/100 s field rounds to 20 or 30 ms.
    // Asserting the band rather than the value is what keeps this honest about
    // the format's own granularity.
    expect(output.durationMs).toBeGreaterThan(SOURCE.durationMs * 0.35);
    expect(output.durationMs).toBeLessThan(SOURCE.durationMs * 0.65);
  });

  test("dropping frames halves the frame count instead", async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/gif-speed-changer");
    await loadFixture(page);

    await choose(page, /^How/, /Drop frames, keep the delays/);
    const output = summariseGif(await runAndDownload(page, "Change speed"));

    // The distinguishing assertion: same halved duration as retiming, but from
    // half the frames rather than from shorter delays.
    expect(output.frames).toBe(Math.ceil(SOURCE.frames / 2));
    expect(output.delaysMs[1]).toBe(SOURCE.delaysMs[1]);
  });
});

test.describe("reverse gif", () => {
  test("reverses the frame order without changing count or duration", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS * 2);
    await page.goto("/reverse-gif");
    await loadFixture(page);

    const reversed = await runAndDownload(page, "Reverse GIF");
    const output = summariseGif(reversed);

    expect(output.frames).toBe(SOURCE.frames);
    expect(output.durationMs).toBe(SOURCE.durationMs);
    expect(output.width).toBe(SOURCE.width);

    // Structure cannot tell a reversed GIF from an untouched one, so the order
    // is proved by pixels: the reversed file must not start where the source
    // starts, and reversing it a second time must put it back.
    const sourceFirst = await frameSignature(page, SOURCE_BYTES);
    const reversedFirst = await frameSignature(page, reversed);
    expect(signatureDistance(sourceFirst, reversedFirst)).toBeGreaterThan(12);

    await page.getByRole("button", { name: "Start over" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "reversed.gif",
      mimeType: "image/gif",
      buffer: Buffer.from(reversed),
    });
    await expect(stage(page).getByTitle("reversed.gif")).toBeVisible();
    await waitForProbe(page);

    const roundTrip = await runAndDownload(page, "Reverse GIF");
    const roundTripFirst = await frameSignature(page, roundTrip);
    expect(signatureDistance(sourceFirst, roundTripFirst)).toBeLessThan(12);
  });

  test("ping-pong produces 2n−2 frames and says so first", async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/reverse-gif");
    await loadFixture(page);

    await choose(page, /^Direction/, /Ping-pong/);

    // The re-plan is surfaced before the run, not discovered afterwards.
    const expected = SOURCE.frames * 2 - 2;
    await expect(
      page.getByText(`${expected} output frames from ${SOURCE.frames}`),
    ).toBeVisible();

    const output = summariseGif(await runAndDownload(page, "Reverse GIF"));
    expect(output.frames).toBe(expected);
    // The endpoints are not repeated, so the turn does not stutter.
    expect(output.durationMs).toBe(expected * SOURCE.delaysMs[1]);
  });
});

test.describe("the four pages themselves", () => {
  const ROUTES = [
    { path: "/resize-gif", heading: "Resize GIF", prose: "Set the width; the height follows" },
    { path: "/crop-gif", heading: "Crop GIF", prose: "One rectangle, every frame" },
    {
      path: "/gif-speed-changer",
      heading: "GIF speed changer",
      prose: "A GIF has no frame rate — it has delays",
    },
    { path: "/reverse-gif", heading: "Reverse GIF", prose: "Ping-pong, and what it costs" },
  ];

  for (const route of ROUTES) {
    test(`serves ${route.path}'s explainer without JavaScript`, async ({
      page,
    }) => {
      // The ranking strategy is that this prose is in the served bytes. A DOM
      // assertion would pass even if the copy were mounted client-side.
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      const html = await response!.text();

      expect(html).toContain(route.heading);
      expect(html).toContain(route.prose);
      // FAQ rich results were removed from Search on 2026-05-07; the markup can
      // now only be flagged.
      expect(html).not.toContain("FAQPage");
    });
  }

  test("reserves every ad slot from first paint", async ({ page }) => {
    test.skip(!ADS_ENABLED, "no ad network in this build; no slots to reserve");
    await page.goto("/crop-gif");
    for (const name of ["result-rect", "rail"]) {
      const slot = page.locator(`[data-ad-slot="${name}"]`);
      await expect(slot).toBeVisible();
      expect((await slot.boundingBox())!.height, name).toBeGreaterThan(200);
    }
  });
});
