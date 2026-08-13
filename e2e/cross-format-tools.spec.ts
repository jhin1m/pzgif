import { readFileSync } from "node:fs";
import { join } from "node:path";
import { devices, expect, test, type Page } from "@playwright/test";
import { isPng, summariseZip } from "./lib/decode-archive";
import { isGif, summariseGif } from "./lib/decode-output";
import { summariseVideo } from "./lib/decode-video";

/**
 * The four tools that cross a format boundary: MP4→GIF, GIF→MP4, split to
 * frames, WebP→GIF.
 *
 * ── Every claim is checked against the produced file ──────────────────────
 * `plan.md` is explicit that a DOM assertion proves nothing — a Download button
 * appears whether the encoder wrote a correct file or four bytes of rubbish. So
 * a GIF is walked block by block, an archive is read through its central
 * directory the way an unzip tool does, and a video is handed to a real
 * `<video>` and played, because the three traps `phase-07` names all produce
 * files that a box walker would happily accept.
 *
 * ── The fixtures ──────────────────────────────────────────────────────────
 * `loop-small.gif` and `anim.webp` are both FFmpeg's `testsrc2` at 480×270,
 * 48 frames, 50 ms apart — the same source in two containers, which is what
 * makes the WebP assertions comparable to the GIF ones. `screen-720p-10s.mp4`
 * is a 10-second H.264 screen recording.
 */

const FIXTURES = join(process.cwd(), "e2e", "fixtures");
const GIF = join(FIXTURES, "loop-small.gif");
const WEBP = join(FIXTURES, "anim.webp");
const MP4 = join(FIXTURES, "screen-720p-10s.mp4");

const SOURCE = summariseGif(new Uint8Array(readFileSync(GIF)));

/** Video decode plus a GIF encode is minutes under WebKit, not seconds. */
const JOB_TIMEOUT_MS = 240_000;

function stage(page: Page) {
  return page.locator("[data-tool-stage]");
}

function downloadLink(page: Page) {
  return page.locator("a[download]:visible");
}

/** Loads a file and waits for the *worker's* probe, not for anything that
 *  merely looks like it — the metadata badge is the tell. */
async function loadFixture(page: Page, path: string, name: string) {
  await page.locator('input[type="file"]').setInputFiles(path);
  await expect(stage(page).getByTitle(name)).toBeVisible();
  await expect(stage(page).getByText(/\d+×\d+/)).toBeVisible({ timeout: 60_000 });
}

/** Runs the job and returns the bytes that were actually downloaded. */
async function runAndDownload(page: Page, action: string): Promise<Uint8Array> {
  await page.getByRole("button", { name: action, exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: JOB_TIMEOUT_MS }),
    downloadLink(page).click({ timeout: JOB_TIMEOUT_MS }),
  ]);
  const path = await download.path();
  return new Uint8Array(readFileSync(path));
}

/** What the running browser can actually do, asked of it rather than assumed. */
async function engineCan(page: Page) {
  return page.evaluate(() => ({
    videoDecode: typeof (globalThis as { VideoDecoder?: unknown }).VideoDecoder === "function",
    videoEncode: typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === "function",
  }));
}

test.beforeEach(async ({ page }) => {
  // Desktop: the number inputs beside each slider are `md:block`, and the
  // primary action lives in the settings panel rather than the sticky bar.
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.describe("mp4 to gif", () => {
  test("converts only the trimmed seconds, at the requested frame rate", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/mp4-to-gif");

    const engine = await engineCan(page);
    // A skip rather than a silent pass. WebCodecs video decode is a browser
    // fact, and a suite that quietly reported success on an engine that never
    // ran the job would be worse than one that says it did not.
    test.skip(!engine.videoDecode, "no WebCodecs VideoDecoder in this engine");

    await loadFixture(page, MP4, "screen-720p-10s.mp4");

    // Two seconds out of ten, at 10 fps and 320 px.
    await page.locator('[data-trim-field="to"]').fill("2");
    await page.locator('[data-trim-field="to"]').press("Enter");
    await page.getByLabel("Frames per second (exact value)").fill("10");
    await page.getByLabel("Width (exact value)").fill("320");

    const bytes = await runAndDownload(page, "Make the GIF");
    expect(isGif(bytes), "the download is not a GIF").toBe(true);
    const output = summariseGif(bytes);

    expect(output.width).toBe(320);
    // Two seconds at 10 fps. The resampler emits one frame per step and the last
    // one has no successor to measure against, so the count lands at or just
    // under 20 rather than exactly on it.
    expect(output.frames).toBeGreaterThanOrEqual(16);
    expect(output.frames).toBeLessThanOrEqual(22);
    // The whole point of the trim: a ten-second source must not produce ten
    // seconds of GIF.
    expect(output.durationMs).toBeGreaterThan(1_400);
    expect(output.durationMs).toBeLessThan(2_800);
    expect(output.loops).toBe(true);
  });

  test("converts the whole clip when the trim is left alone", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/mp4-to-gif");
    const engine = await engineCan(page);
    test.skip(!engine.videoDecode, "no WebCodecs VideoDecoder in this engine");

    await loadFixture(page, MP4, "screen-720p-10s.mp4");

    // The regression this exists for: the trim's stored end starts at zero,
    // because a clip's duration is not knowable until the probe answers. Read
    // literally that is a zero-second selection, and the decoder honours it
    // exactly — `canvases(0, 0)` yields nothing and the job produces an empty
    // GIF. Zero has to mean "to the end", and the only test that catches a
    // regression there is one that never touches the handles.
    //
    // Narrow and slow, so the encode stays short. Neither setting is a trim.
    await page.getByLabel("Frames per second (exact value)").fill("5");
    await page.getByLabel("Width (exact value)").fill("240");
    await expect(page.locator("[data-trim-field='to']")).toHaveValue("10.0");

    const bytes = await runAndDownload(page, "Make the GIF");
    const output = summariseGif(bytes);

    // Ten seconds at 5 fps, not zero frames and not two seconds.
    expect(output.frames).toBeGreaterThan(30);
    expect(output.durationMs).toBeGreaterThan(7_000);
  });

  test("keeps a chosen trim span when a preset chip is clicked", async ({
    page,
  }) => {
    await page.goto("/mp4-to-gif");
    const engine = await engineCan(page);
    test.skip(!engine.videoDecode, "no WebCodecs VideoDecoder in this engine");

    await loadFixture(page, MP4, "screen-720p-10s.mp4");

    await page.locator('[data-trim-field="to"]').fill("3");
    await page.locator('[data-trim-field="to"]').press("Enter");

    // A preset resolves width, fps and quality and nothing else — it is merged
    // over the current values rather than replacing them, so the span the
    // visitor chose is a key no chip owns and no chip may discard.
    await page.locator('[data-preset="smallest"]').click();
    await expect(page.locator('[data-trim-field="to"]')).toHaveValue("3.0");
    await expect(page.getByLabel("Frames per second (exact value)")).toHaveValue(
      "10",
    );
  });

  test("states the device limit and predicts a size before the job runs", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    // The narrowest supported viewport, not the default 1440: the estimate's
    // reservation is a line-count bet, and the only place it can lose is where
    // the text wraps most.
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/mp4-to-gif");
    const engine = await engineCan(page);
    test.skip(!engine.videoDecode, "no WebCodecs VideoDecoder in this engine");

    await loadFixture(page, MP4, "screen-720p-10s.mp4");

    // Below `lg` the settings are a disclosure and start collapsed, so the
    // controls and the two note slots have to be opened before they can be
    // measured. Collapsed here means `visibility: hidden`, not a zero-height
    // clip — a test that reached a control a visitor could not see was the
    // defect, not the fix.
    await page.locator('button[aria-controls="mp4-to-gif-settings-panel"]').click();

    // Computed from the tier budget, never written as static copy — so it names
    // a real number of seconds rather than the wireframe's "up to 60 seconds",
    // and it says "plans for" rather than claiming a device fact: the mobile
    // budgets still carry `measured: false`, and `limits.ts` forbids presenting
    // an unmeasured figure as something the hardware was observed to do.
    await expect(page.locator("[data-limits-note]")).toContainText(
      /plans for about \d+ seconds/i,
    );

    // The figure's slot, before it holds anything. It has to be the same box
    // afterwards: the estimate lands seconds after the file — far outside the
    // window that would excuse the shift as prompted — so a slot that grew when
    // it filled would be un-prompted CLS on every visit to this page.
    const slot = page.locator("[data-estimate]");
    const reserved = await slot.evaluate((element) =>
      Math.round(element.getBoundingClientRect().height),
    );

    // Trim hard so the estimate's own decode is cheap, then wait for the debounce
    // plus two sample encodes.
    await page.locator('[data-trim-field="to"]').fill("1");
    await page.locator('[data-trim-field="to"]').press("Enter");

    await expect(slot).toContainText(/Estimated result/i, {
      timeout: JOB_TIMEOUT_MS,
    });
    expect(
      await slot.evaluate((element) =>
        Math.round(element.getBoundingClientRect().height),
      ),
      "the estimate's slot grew when the figure arrived",
    ).toBe(reserved);
    // A range, never a point value — that is the failure this page's whole
    // estimator design exists to avoid. The caveat that says so is a separate,
    // always-rendered line, because the figure's own slot has to stay short
    // enough not to shift the page when it fills.
    await expect(page.locator("[data-estimate]")).toContainText(/ to /);
    await expect(page.locator("[data-estimate-caveat]")).toContainText(
      /not a promise/i,
    );
  });

  test("refuses an iPhone before a file is chosen, not after", async ({
    browser,
    browserName,
  }) => {
    test.skip(
      browserName !== "webkit",
      "an iPhone is mobile Safari; emulating one on Blink would test nothing real",
    );

    // The obligation `plan.md` puts on this phase: gate G8 measured an 80%
    // refusal rate for video input against the iOS budget — every video shape
    // fails, not merely large ones — so the page has to say so above the fold.
    // A refused job with no explanation is indistinguishable from a broken tool,
    // and iOS Safari is a large share of the mobile traffic a GIF utility gets.
    const context = await browser.newContext(devices["iPhone 13"]);
    const page = await context.newPage();

    try {
      await page.goto("/mp4-to-gif");

      // Rendered in place of the dropzone, inside the same fixed-height box.
      const refusal = page.locator("[data-tool-unavailable]");
      await expect(refusal).toBeVisible();
      await expect(refusal).toContainText(/isn't available on this device/i);

      // No dropzone at all, so there is no file to choose and nothing to fail
      // half-way through.
      await expect(page.locator('input[type="file"]')).toHaveCount(0);

      // And somewhere to go instead. A refusal with no exit is the dead end the
      // whole error taxonomy exists to prevent.
      await expect(
        refusal.getByRole("link", { name: /tools that do work here/i }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("moves the trim handles from the keyboard", async ({ page }) => {
    await page.goto("/mp4-to-gif");
    const engine = await engineCan(page);
    test.skip(!engine.videoDecode, "no WebCodecs VideoDecoder in this engine");

    await loadFixture(page, MP4, "screen-720p-10s.mp4");

    const start = page.locator('[data-trim-handle="from"]');
    await start.focus();
    await expect(start).toBeFocused();

    // Shift is the coarse step: one second per press.
    await start.press("Shift+ArrowRight");
    await start.press("Shift+ArrowRight");
    await expect(page.locator('[data-trim-field="from"]')).toHaveValue("2.0");

    // The fine step is a tenth of a second — deliberately the same precision the
    // field shows, so a press always moves the number the user is looking at.
    await start.press("ArrowLeft");
    await expect(page.locator('[data-trim-field="from"]')).toHaveValue("1.9");

    // Home returns the start handle to the beginning of the clip.
    await start.press("Home");
    await expect(page.locator('[data-trim-field="from"]')).toHaveValue("0.0");
  });
});

test.describe("gif to mp4", () => {
  test("produces a file a real video element decodes and plays", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/gif-to-mp4");

    const engine = await engineCan(page);
    test.skip(!engine.videoEncode, "no WebCodecs VideoEncoder in this engine");

    await loadFixture(page, GIF, "loop-small.gif");
    // Deliberately odd, to prove the even-dimension rounding happens rather than
    // being rejected by the encoder after the wait.
    await page.getByLabel("Width (exact value)").fill("321");
    await expect(page.locator("[data-even-note]")).toContainText("320×180");

    const bytes = await runAndDownload(page, "Convert to MP4");

    // The container the encoder actually chose, from the download's own name —
    // a device with no AVC encoder falls back to VP8 in WebM, and naming that
    // `.mp4` is the defect the extension logic exists to prevent.
    const name = await downloadLink(page).getAttribute("download");
    expect(name).toMatch(/\.(mp4|webm)$/);
    const mimeType = name!.endsWith(".webm") ? "video/webm" : "video/mp4";

    const video = await summariseVideo(page, bytes, mimeType);
    expect(video.width).toBe(320);
    expect(video.height).toBe(180);
    // `loadeddata` alone would pass on a file with a broken bitstream and a
    // well-formed container. Playback advancing is what proves samples decoded.
    expect(video.played, "the video never advanced past zero").toBe(true);
    // The GIF's own 2.4 s of delays, carried across rather than assumed.
    expect(video.durationSec).toBeGreaterThan(1.8);
    expect(video.durationSec).toBeLessThan(3.2);
  });

  test("hands over an embed tag with all four attributes", async ({ page }) => {
    await page.goto("/gif-to-mp4");
    // Present in the prerendered HTML, before any file: it is the thing most
    // visitors came for, and it is crawlable where a result-panel-only version
    // would not be.
    const snippet = page.locator("[data-embed-snippet] code");
    await expect(snippet).toContainText("autoplay");
    await expect(snippet).toContainText("muted");
    await expect(snippet).toContainText("loop");
    await expect(snippet).toContainText("playsinline");
  });
});

test.describe("split gif to frames", () => {
  test("writes one stored PNG per selected frame, correctly ordered", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/split-gif-to-frames");
    await loadFixture(page, GIF, "loop-small.gif");

    // Frames 3 to 10 inclusive — eight files, and an off-by-one at either end
    // shows up as seven or nine.
    await page.locator('[data-frame-field="from"]').fill("3");
    await page.locator('[data-frame-field="from"]').press("Enter");
    await page.locator('[data-frame-field="to"]').fill("10");
    await page.locator('[data-frame-field="to"]').press("Enter");
    await expect(page.locator("[data-frame-count]")).toContainText("8 frames");

    const archive = summariseZip(await runAndDownload(page, "Extract the frames"));
    expect(archive.entries).toHaveLength(8);

    for (const entry of archive.entries) {
      expect(entry.name).toMatch(/^loop-small-\d+\.png$/);
      // STORE, never deflate: a PNG is already compressed, and re-deflating it
      // spends processor time to add bytes.
      expect(entry.method, `${entry.name} was compressed`).toBe(0);
      expect(isPng(entry.bytes), `${entry.name} is not a PNG`).toBe(true);
      expect(entry.bytes.byteLength).toBe(entry.size);
    }

    // Zero-padded, so a plain lexical sort is playback order. Without the
    // padding, frame 10 sorts immediately after frame 1 everywhere.
    const names = archive.entries.map((entry) => entry.name);
    expect([...names].sort()).toEqual(names);

    // The panel reports what is really in the archive, read off the blob.
    await expect(page.locator("[data-zip-summary]")).toContainText("8 PNG files");
  });

  test("states the device's frame ceiling before a file is chosen", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/split-gif-to-frames");
    await loadFixture(page, GIF, "loop-small.gif");
    await expect(page.locator("[data-cap-note]")).toContainText(
      /plans for about \d+ frames/i,
    );
  });
});

test.describe("webp to gif", () => {
  test("reads an animated WebP on every engine, ImageDecoder or not", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/webp-to-gif");

    // No capability skip here, and that is the point of the test. WebKit has no
    // `ImageDecoder` at any version, which is what nearly cost this page its
    // place in the MVP; the RIFF splitter has to make it run anyway.
    await loadFixture(page, WEBP, "anim.webp");

    const bytes = await runAndDownload(page, "Convert to GIF");
    expect(isGif(bytes), "the download is not a GIF").toBe(true);
    const output = summariseGif(bytes);

    // Same source as `loop-small.gif`, in the other container: 480×270, 48
    // frames, 50 ms apart. Every one of those has to survive the conversion.
    expect(output.width).toBe(480);
    expect(output.height).toBe(270);
    expect(output.frames).toBe(SOURCE.frames);
    // GIF stores delays in hundredths of a second, so 50 ms lands exactly and
    // the total is comparable without a tolerance that would hide a retiming bug.
    expect(output.durationMs).toBe(SOURCE.durationMs);
  });

  test("counts the source's frames from the container's own headers", async ({
    page,
  }) => {
    test.setTimeout(JOB_TIMEOUT_MS);
    await page.goto("/webp-to-gif");
    await loadFixture(page, WEBP, "anim.webp");
    // Read out of VP8X and the ANMF chunks without decoding anything — the old
    // `ImageDecoder` probe decoded frame zero purely to learn the dimensions.
    await expect(page.locator("[data-source-note]")).toContainText("48 frames");
    await expect(stage(page).getByText("480×270 · 48 frames")).toBeVisible();
  });
});
