import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Handing a finished result to the next tool without a round trip through disk.
 *
 * ── Why one chain and not five ─────────────────────────────────────────────
 * The mechanism is shared: every chip stashes into the same module-level
 * handoff, and every tool page collects it through the same `useHandoffFile`.
 * A second chain would re-measure that one wire for triple the wall clock, and
 * an encode is seconds on V8 and slower under WebKit.
 *
 * ── Why `resize-gif` and not `crop-gif` ────────────────────────────────────
 * The chips are the compressor's own `related` list from the registry, filtered
 * to routes that exist and can decode a GIF. `crop-gif` is not on that list;
 * `resize-gif` is the first entry that is.
 *
 * ── Why the destination's probe is the real assertion ──────────────────────
 * A file chip bearing the right name proves only that a name crossed the
 * navigation. The dimensions-and-frames badge does not appear until the worker
 * has decoded the bytes, so waiting on it is what proves an actual GIF arrived
 * rather than an empty or detached blob.
 */

const FIXTURE = join(process.cwd(), "e2e", "fixtures", "loop-small.gif");

/** A 48-frame encode is seconds on V8 and slower under WebKit. */
const JOB_TIMEOUT_MS = 180_000;

/** The stage column. The file name also renders in the sticky action bar. */
function stage(page: Page) {
  return page.locator("[data-tool-stage]");
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("hands the compressed GIF to the tool whose chip was clicked", async ({
  page,
}) => {
  await page.goto("/gif-compressor");
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(stage(page).getByTitle("loop-small.gif")).toBeVisible();

  await page.getByRole("button", { name: "Compress GIF" }).click();
  // The result panel is up once its Download link is, which is also the point
  // the chip row exists — the row sits below the divider, after Download.
  await expect(page.locator("a[download]:visible")).toBeVisible({
    timeout: JOB_TIMEOUT_MS,
  });

  await stage(page).getByRole("link", { name: "Resize GIF" }).click();
  await expect(page).toHaveURL(/\/resize-gif$/);

  // The produced file, already loaded: the compressor's own output name, a real
  // byte count, and — the assertion that matters — a probe that decoded it.
  await expect(
    stage(page).getByTitle("loop-small-compressed.gif"),
  ).toBeVisible();
  await expect(
    stage(page)
      .getByText(/^\d+(\.\d+)? (KB|MB)$/)
      .first(),
  ).toBeVisible();
  await expect(stage(page).getByText(/^\d+×\d+ · \d+ frames$/)).toBeVisible({
    timeout: JOB_TIMEOUT_MS,
  });

  // And no dropzone underneath it. The file input only exists in the idle
  // state, so its absence is the precise form of "the visitor is not asked for
  // the file they just handed over".
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test("leaves the cold path alone", async ({ page }) => {
  // Reached by link rather than by a chip: no handoff, ordinary dropzone. The
  // fallback the whole design leans on, asserted so that arming the handoff
  // from a second sender cannot quietly become a requirement for the page.
  await page.goto("/resize-gif");
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await expect(stage(page).getByTitle(/\.gif$/)).toHaveCount(0);
});
