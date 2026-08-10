import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { isGif, summariseGif } from "./lib/decode-output";

/**
 * The Discord preset cluster: one hub and four dedicated routes, all driven by
 * the auto-fit search.
 *
 * ── Why every assertion decodes the file ──────────────────────────────────
 * This is the phase where a DOM assertion is least trustworthy. The page's whole
 * claim is "this fits Discord", and a green tick appears whether the encoder
 * produced a 320×320 sticker or a 240×240 one. Three of the four sticker rules —
 * exact dimensions, length, frame rate — are invisible in the result panel and
 * are only refused later, at Discord's upload endpoint, where no test can see
 * them. So each of these walks the produced GIF's own blocks.
 *
 * ── Why the fixtures are the heavy ones ───────────────────────────────────
 * A file that already fits proves nothing about a search. `loop-small.gif` is
 * 4 MB at 480×270 over 48 frames and `photo-grain.gif` is photographic, which is
 * the worst case for a palette and the one where the estimator's seed is least
 * likely to be lucky. Both are far over every preset's budget on arrival.
 */

const FIXTURES = join(process.cwd(), "e2e", "fixtures");
const HEAVY = join(FIXTURES, "loop-small.gif");
const PHOTO = join(FIXTURES, "photo-grain.gif");
const VIDEO = join(FIXTURES, "screen-720p-10s.mp4");

const KB = 1024;

/**
 * Auto-fit is several real encodes back to back, and gifski under WebKit is
 * minutes rather than seconds on a photographic source.
 */
const JOB_TIMEOUT_MS = 300_000;

function stage(page: Page) {
  return page.locator("[data-tool-stage]");
}

async function loadFixture(page: Page, path: string, name: string) {
  await page.locator('input[type="file"]').setInputFiles(path);
  await expect(stage(page).getByTitle(name)).toBeVisible();
  // The metadata badge is the tell that the *worker* answered, rather than
  // something that merely looks like it did.
  await expect(stage(page).getByText(/\d+×\d+/).first()).toBeVisible({
    timeout: 60_000,
  });
}

/** Runs the search and returns the bytes that were actually downloaded. */
async function autofitAndDownload(page: Page, action: string): Promise<Uint8Array> {
  await page.getByRole("button", { name: action, exact: true }).first().click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: JOB_TIMEOUT_MS }),
    page
      .locator("a[download]:visible")
      .first()
      .click({ timeout: JOB_TIMEOUT_MS }),
  ]);
  const path = await download.path();
  return new Uint8Array(readFileSync(path));
}

test.beforeEach(async ({ page }) => {
  // Desktop: the primary sits in the settings panel rather than the sticky bar,
  // and the manual-override controls show their number inputs.
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.describe("emoji preset", () => {
  test("fits a heavy GIF under Discord's 256 KB emoji limit", async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/discord-emoji-gif");
    await loadFixture(page, HEAVY, "loop-small.gif");

    const bytes = await autofitAndDownload(page, "Make it fit 256 KB");
    expect(isGif(bytes), "the download is not a GIF").toBe(true);
    const output = summariseGif(bytes);

    // The published ceiling, checked against the file rather than the panel.
    expect(output.byteLength).toBeLessThanOrEqual(256 * KB);
    // 128 is the recommended canvas, not a hard requirement, so the engine is
    // free to come in under it — never over.
    expect(output.width).toBeLessThanOrEqual(128);
    expect(output.height).toBeLessThanOrEqual(128);
    // A 480×270 source cropped to a square: the two axes must match, or the
    // crop was skipped and Discord letterboxes the result.
    expect(output.width).toBe(output.height);
    expect(output.frames).toBeGreaterThan(1);
  });

  test("reports honestly when a photographic source cannot be fitted", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/discord-emoji-gif");
    await loadFixture(page, PHOTO, "photo-grain.gif");

    const bytes = await autofitAndDownload(page, "Make it fit 256 KB");
    const output = summariseGif(bytes);
    const tone = await stage(page)
      .locator("[data-budget-tone]")
      .first()
      .getAttribute("data-budget-tone");

    // Either outcome is legitimate — what must never happen is the panel
    // claiming a fit that the bytes contradict, in either direction.
    if (output.byteLength <= 256 * KB) {
      expect(tone).not.toBe("over");
    } else {
      expect(tone).toBe("over");
      await expect(stage(page).locator("[data-budget-message]")).toContainText(
        /refuse|over/i,
      );
    }
  });
});

test.describe("sticker preset", () => {
  test("produces exactly 320×320 under 512 KB and no longer than five seconds", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/discord-sticker-gif");
    await loadFixture(page, HEAVY, "loop-small.gif");

    const bytes = await autofitAndDownload(page, "Fit the sticker rules");
    expect(isGif(bytes)).toBe(true);
    const output = summariseGif(bytes);

    // All four of Discord's sticker rules, and three of them are invisible in
    // the UI. This is the only place they are checked before an upload is
    // refused for one of them.
    expect(output.width, "sticker width must be exact").toBe(320);
    expect(output.height, "sticker height must be exact").toBe(320);
    expect(output.byteLength).toBeLessThanOrEqual(512 * KB);
    // The 48-frame fixture runs 2.4s, so the cap is not reached here — the
    // assertion guards against a future change that lets a long source through.
    expect(output.durationMs).toBeLessThanOrEqual(5_000);
    const fps = output.frames / (output.durationMs / 1000);
    expect(fps).toBeLessThanOrEqual(60);
  });
});

test.describe("banner preset", () => {
  test("reaches the full 960×540 canvas from a source big enough to fill it", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/discord-banner-gif");

    // A video, because **no GIF fixture is wide enough to prove this**. 960 is
    // above every device tier's `defaultMaxWidth`, so this is the regression
    // guard on `JobSpec.widthCeiling`: a 640×360 result means the preset lost
    // its shape to a ceiling that was never a memory constraint. The widest GIF
    // in the corpus is 800px, which the engine would legitimately leave alone,
    // so the assertion would pass against a broken ceiling.
    const engine = await page.evaluate(
      () => typeof (globalThis as { VideoDecoder?: unknown }).VideoDecoder === "function",
    );
    test.skip(!engine, "no WebCodecs VideoDecoder in this engine");

    await loadFixture(page, VIDEO, "screen-720p-10s.mp4");
    const bytes = await autofitAndDownload(page, "Fit the banner shape");
    const output = summariseGif(bytes);

    expect(output.width).toBe(960);
    expect(output.height).toBe(540);
  });

  test("never enlarges a source that is smaller than the canvas", async ({ page }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/discord-banner-gif");
    await loadFixture(page, HEAVY, "loop-small.gif");

    const bytes = await autofitAndDownload(page, "Fit the banner shape");
    const output = summariseGif(bytes);

    // Upscaling invents detail, and the banner is scaled on display anyway, so
    // a 480px source stays 480px. Only the sticker overrides this, and only
    // because Discord refuses anything but its exact square.
    expect(output.width).toBeLessThanOrEqual(960);
    expect(output.width).toBeLessThanOrEqual(480);
    // The shape is what the preset guarantees, at whatever size it lands.
    expect(output.width / output.height).toBeCloseTo(16 / 9, 1);
  });

  test("shows no byte ceiling, because Discord publishes none", async ({ page }) => {
    await page.goto("/discord-banner-gif");
    await loadFixture(page, HEAVY, "loop-small.gif");

    // The wireframe's "≤10 MB" is a figure nobody measured. The meter renders
    // no limit at all on this surface rather than inventing one.
    await expect(
      page.locator("[data-budget-limit]"),
      "a banner page must print no published limit",
    ).toHaveCount(0);
  });
});

test.describe("avatar preset", () => {
  test("produces a small square file and states that no limit is published", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/discord-avatar-gif");
    await loadFixture(page, HEAVY, "loop-small.gif");

    const bytes = await autofitAndDownload(page, "Make the avatar");
    const output = summariseGif(bytes);

    expect(output.width).toBeLessThanOrEqual(128);
    expect(output.width).toBe(output.height);
    await expect(stage(page).locator("[data-budget-message]").first()).toContainText(
      /publishes no maximum/i,
    );
  });
});

test.describe("the hub", () => {
  test("switches the target without discarding the loaded file", async ({ page }) => {
    await page.goto("/gif-for-discord");
    await loadFixture(page, HEAVY, "loop-small.gif");

    const emoji = page.locator('[data-preset="emoji"]');
    const sticker = page.locator('[data-preset="sticker"]');
    await expect(emoji).toHaveAttribute("aria-pressed", "true");

    await sticker.click();
    await expect(sticker).toHaveAttribute("aria-pressed", "true");
    await expect(emoji).toHaveAttribute("aria-pressed", "false");
    // The point of a toggle rather than a navigation: the file survives.
    await expect(stage(page).getByTitle("loop-small.gif")).toBeVisible();
  });

  test("offers every preset as a keyboard-reachable toggle", async ({ page }) => {
    await page.goto("/gif-for-discord");
    const chips = page.locator("[data-preset]");
    await expect(chips).toHaveCount(4);

    for (const id of ["emoji", "sticker", "banner", "avatar"]) {
      const chip = page.locator(`[data-preset="${id}"]`);
      await chip.focus();
      await expect(chip).toBeFocused();
      await chip.press("Enter");
      await expect(chip).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("never claims a fit before something has been encoded", async ({ page }) => {
    await page.goto("/gif-for-discord");
    await loadFixture(page, HEAVY, "loop-small.gif");

    // The estimator lands a beat after the probe. Whatever it says, the meter
    // may reach "close" but must not reach "fits" — only a real blob can.
    const meter = page.locator("[data-budget-tone]").first();
    await expect(meter).toBeVisible({ timeout: 120_000 });
    await expect(meter).not.toHaveAttribute("data-budget-tone", "fits");
  });
});

test.describe("every preset route", () => {
  const ROUTES = [
    "gif-for-discord",
    "discord-emoji-gif",
    "discord-sticker-gif",
    "discord-banner-gif",
    "discord-avatar-gif",
  ];

  for (const slug of ROUTES) {
    test(`${slug} states no Nitro or Boost rule anywhere in its markup`, async ({
      page,
    }) => {
      // Two Discord articles updated within a fortnight contradict each other on
      // this, so the page says nothing. Asserted against the rendered HTML,
      // including the FAQ panels, which is where such a sentence comes back.
      await page.goto(`/${slug}`);
      const html = await page.content();
      expect(html).not.toMatch(/\bnitro\b/i);
      expect(html).not.toMatch(/\bboost(ed|s|ing)?\b/i);
      expect(html).not.toMatch(/680\s*(?:×|x|&#215;)\s*240/);
    });
  }
});
