import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ADS_ENABLED } from "./lib/ads";

/**
 * The homepage, end to end.
 *
 * Three behaviours carry this page, and each of them fails silently if it
 * breaks — which is why they are asserted rather than reviewed:
 *
 *  1. **The handoff works.** Dropping a file and picking a tool has to land on
 *     that tool with the file already loaded. If the module singleton is ever
 *     lost — a hard navigation, a second realm, a promise that settles one
 *     microtask too late — the tool page renders its own dropzone and looks
 *     perfectly normal. Nothing surfaces the failure but this test.
 *  2. **The reload degrades.** The same page, reloaded, is a new realm with no
 *     handoff. It has to be an ordinary empty tool page, not an error.
 *  3. **The refusal names the format.** A `.gif` whose bytes are an MP4 must be
 *     called an MP4. Routed on its extension it would reach the compressor and
 *     die as `decode-failed`, which is the generic bucket the "never a dead end"
 *     rule exists to keep files out of.
 *
 * Plus the two things this page is a ranking surface for: it must not shift, and
 * the picker appearing must not shift it either.
 */

const FIXTURE = join(process.cwd(), "e2e", "fixtures", "loop-small.gif");

/**
 * An MP4 wearing a `.gif` extension, built in memory rather than committed.
 *
 * Only the leading bytes decide the answer — `sniff.ts` reads 4096 — so the
 * header alone is the whole fixture, and a truncated MP4 is a *better* test
 * than a whole one: nothing downstream can accidentally succeed at decoding it.
 */
const MISLABELLED = {
  name: "definitely-a.gif",
  mimeType: "image/gif",
  buffer: readFileSync(join(process.cwd(), "e2e", "fixtures", "screen-720p-10s.mp4")).subarray(
    0,
    8192,
  ),
};

/** The hero's reserved box. Every tool name on this page also appears below it. */
function hero(page: Page) {
  return page.locator("[data-home-hero]");
}

async function dropOnHomepage(page: Page, file: string | typeof MISLABELLED) {
  await page.locator('input[type="file"]').first().setInputFiles(file);
}

test.describe("the homepage", () => {
  test("hands the dropped file to the tool the visitor picks", async ({
    page,
  }) => {
    await page.goto("/");
    await dropOnHomepage(page, FIXTURE);

    // Five live routes today, all GIF-only, so all five are offered.
    await expect(hero(page).getByRole("link", { name: /GIF compressor/i })).toBeVisible();
    await hero(page).getByRole("link", { name: /GIF compressor/i }).click();

    await expect(page).toHaveURL(/\/gif-compressor$/);

    // The proof: the tool page is already past its empty state. `loadFixture`
    // in the compressor suite has to set an input to reach this; here nobody
    // chose a file twice.
    const stage = page.locator("[data-tool-stage]");
    await expect(stage.getByTitle("loop-small.gif")).toBeVisible();
    await expect(
      stage.getByRole("button", { name: /drop your gif here/i }),
    ).toHaveCount(0);
  });

  test("degrades to an ordinary empty tool page when that page is reloaded", async ({
    page,
  }) => {
    await page.goto("/");
    await dropOnHomepage(page, FIXTURE);
    await hero(page).getByRole("link", { name: /Resize GIF/i }).click();
    await expect(page).toHaveURL(/\/resize-gif$/);

    // A reload is a new JavaScript realm, so the module singleton is gone. The
    // file is lost — a missing convenience — and the page has to be fine.
    await page.reload();

    // Matched on the dropzone's own idle state rather than on its title: every
    // tool writes that sentence for itself, so a title match here would be
    // asserting this route's copy instead of its behaviour.
    const stage = page.locator("[data-tool-stage]");
    await expect(stage.locator('button[data-state="idle"]')).toBeVisible();
    await expect(stage.locator("[title]")).toHaveCount(0);
    // Scoped to the page: Next's own route announcer is also `role="alert"`.
    await expect(page.locator("#main").getByRole("alert")).toHaveText("");
  });

  test("names what a mislabelled file really is, and refuses it with a reason", async ({
    page,
  }) => {
    await page.goto("/");
    await dropOnHomepage(page, MISLABELLED);

    // Not "decode-failed", and not silence. The bytes are a video, so the page
    // says video.
    await expect(hero(page).getByText("Video", { exact: true })).toBeVisible();

    // And the sentence that explains *why* their GIF is not a GIF. This is the
    // case the sniffer exists for.
    await expect(
      hero(page).getByText(/name ends in \.GIF, but the bytes are Video/i),
    ).toBeVisible();

    // The file is offered to the tool that takes video, and to no other.
    //
    // This assertion is the inverse of what it was until Phase 7, and the
    // change is the point rather than a regression: while no video route
    // existed, the honest answer was "nothing here handles this yet" and the
    // test asserted that nothing was offered. `mp4-to-gif` now exists, so the
    // same sniff has a real destination — and the invariant that never moved is
    // that the destination is chosen from the *bytes*. Routed on its extension,
    // this file would reach the compressor and die as `decode-failed`.
    await expect(
      hero(page).getByRole("link", { name: /MP4 to GIF/i }),
    ).toBeVisible();
    await expect(
      hero(page).getByRole("link", { name: /GIF compressor/i }),
    ).toHaveCount(0);
  });

  test("shows the dropped file back, decoded and not merely referenced", async ({
    page,
  }) => {
    // `naturalWidth` and not `toBeVisible()`, because a dead `blob:` URL is
    // visible: the element is laid out at its reserved size and the only thing
    // missing is the picture. That is the exact failure this assertion exists
    // for — a revoked object URL renders as an empty box that looks deliberate.
    await page.goto("/");
    await dropOnHomepage(page, FIXTURE);

    const preview = hero(page).locator("img");
    await expect(preview).toBeVisible();
    await expect
      .poll(
        () => preview.evaluate((img: HTMLImageElement) => img.naturalWidth),
        { message: "the hero preview never decoded" },
      )
      .toBeGreaterThan(0);

    // And it goes away with the file, rather than outliving it.
    await hero(page).getByRole("button", { name: /choose a different file/i }).click();
    await expect(hero(page).locator("img")).toHaveCount(0);
  });

  test("offers no route that is not built", async ({ page }) => {
    await page.goto("/");
    await dropOnHomepage(page, FIXTURE);

    const hrefs = await hero(page).getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const response = await page.request.get(href);
      expect(response.status(), `${href} is linked from the picker`).toBe(200);
    }
  });

  for (const width of [320, 375, 768, 1440]) {
    test(`reserves the picker's height at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");

      const box = hero(page);
      const idle = (await box.boundingBox())!.height;

      await dropOnHomepage(page, FIXTURE);
      await expect(box.getByRole("link", { name: /GIF compressor/i })).toBeVisible();

      // The box is fixed, so this is the assertion that the picker fits inside
      // it — a picker that overflowed would still leave the box this height
      // while spilling over the grid, so the contents are checked too.
      expect((await box.boundingBox())!.height).toBe(idle);

      // Measured against every descendant's rectangle, not against the box's
      // own `scrollHeight`. The card inside is `flex-1 min-h-0`, so it absorbs
      // the reservation and reports no overflow of its own while its children
      // spill past the bottom edge onto the tool grid — which is exactly what
      // the fixed height exists to prevent, and what the previous form of this
      // assertion could not see.
      //
      // The walk stops at any element that clips, and measures *that* element
      // instead of what is inside it. `getBoundingClientRect()` reports layout
      // position and knows nothing about clipping, so a scrolling list — which
      // the tool picker became once seven routes accepted a GIF — reads as a
      // spill of however far its content runs, while visually nothing crosses
      // the edge at all. What this test is about is whether anything is painted
      // over the tool grid, so a clipped subtree is exactly what it should not
      // descend into.
      const spill = await box.evaluate((element) => {
        const bottom = element.getBoundingClientRect().bottom;
        let worst = 0;

        const walk = (node: Element) => {
          for (const child of node.children) {
            const rect = child.getBoundingClientRect();
            if (rect.height === 0) continue;
            worst = Math.max(worst, rect.bottom - bottom);

            const { overflowY, overflowX } = getComputedStyle(child);
            const clips =
              overflowY !== "visible" || overflowX !== "visible";
            if (!clips) walk(child);
          }
        };

        walk(element);
        return Math.round(worst);
      });
      expect(spill, "the picker overflows its reserved box").toBeLessThanOrEqual(0);
    });
  }

  test("shifts nothing, idle or after a drop", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "layout-shift API is Chromium-only");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

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

    const read = () =>
      page.evaluate(
        () => (window as typeof window & { __shift: number }).__shift,
      );

    // Idle: fonts have swapped, the ad slot is reserved and unfilled, and the
    // hero has hydrated. Nothing above should have moved.
    //
    // Waited on the hydrated dropzone rather than on `networkidle`, which never
    // settles here — Next keeps a connection open, so the state is unreachable
    // in a production server and the wait would only ever time out.
    await expect(hero(page).locator('button[data-state="idle"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await read(), "the homepage shifted before any interaction").toBe(0);

    // And after a drop. The picker replacing the dropzone is the one shift this
    // page's design could introduce, and it is why the box is fixed.
    await dropOnHomepage(page, FIXTURE);
    await expect(
      hero(page).getByRole("link", { name: /GIF compressor/i }),
    ).toBeVisible();
    expect(await read(), "the picker appearing shifted the page").toBe(0);
  });

  test("puts no ad slot above the dropzone", async ({ page }) => {
    // §8.1, binding. The dropzone is the page; nothing sells against it.
    await page.goto("/");
    const dropzoneTop = (await hero(page).boundingBox())!.y;
    const slots = page.locator(".ad-slot");
    const count = await slots.count();
    if (!ADS_ENABLED) {
      // No network configured: the correct number of boxes is none. A reserved
      // grey rectangle for an ad that is never coming is lost viewport.
      expect(count).toBe(0);
      return;
    }
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = (await slots.nth(index).boundingBox())!;
      expect(box.y, "an ad slot sits above the dropzone").toBeGreaterThan(
        dropzoneTop,
      );
    }
  });

  test("never scrolls horizontally at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("survives doubled text without scrolling sideways", async ({ page }) => {
    // WCAG 1.4.4. Not browser zoom, which scales the viewport and is already
    // covered by the 320px reflow case above — this is the reader who has set a
    // larger default text size, where the layout keeps its width and every box
    // has to absorb twice the type.
    //
    // ── Scoped to `#main`, and the reason is a finding, not a convenience ──
    // At 375px with a 32px root, `site-header.tsx` overflows by 22px: the
    // wordmark grows with the text and the theme toggle and menu button are
    // pushed past the edge. That is shared chrome, it does the same on every
    // route — `/gif-compressor` overflows by the identical 22px — and it
    // predates this page. Asserting the whole document here would attribute a
    // header defect to the homepage. It is recorded in the delivery report.
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await page.addStyleTag({ content: "html { font-size: 32px; }" });

    const overflow = await page.locator("#main").evaluate((main) => {
      const limit = main.getBoundingClientRect().width;
      let worst = 0;
      for (const element of main.querySelectorAll("*")) {
        const rect = element.getBoundingClientRect();
        worst = Math.max(worst, rect.width - limit);
      }
      return Math.round(worst);
    });
    expect(overflow, "a homepage box is wider than the column").toBeLessThanOrEqual(0);
  });

  test("completes drop → pick → tool from the keyboard alone", async ({
    page,
  }) => {
    // §7.3: no pointer-only path. The OS file picker cannot be driven from a
    // test, so the file is supplied directly and everything after it — reaching
    // the chip, seeing that it is focused, activating it — is the keyboard's.
    await page.goto("/");
    await dropOnHomepage(page, FIXTURE);

    const chip = hero(page).getByRole("link", { name: /GIF compressor/i });
    await expect(chip).toBeVisible();

    await chip.focus();
    await expect(chip).toBeFocused();
    // A focus ring the browser draws, not one the CSS suppressed.
    expect(
      await chip.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe("none");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/gif-compressor$/);
    await expect(
      page.locator("[data-tool-stage]").getByTitle("loop-small.gif"),
    ).toBeVisible();
  });

  test("announces the picker to assistive technology", async ({ page }) => {
    // A sighted visitor watches the dropzone become a row of choices. This is
    // that event in words — the same live-region pattern the tool pages use for
    // job progress, rather than a second mechanism doing the same job.
    await page.goto("/");
    const live = page.locator('[role="status"][aria-live="polite"]');
    await expect(live).toHaveText("");

    await dropOnHomepage(page, FIXTURE);
    await expect(live).toContainText(/GIF/);
    await expect(live).toContainText(/tools can work on this file/i);
  });

  test("keeps its meaning in forced-colors mode", async ({ page }) => {
    // The motif is decoration and is expected to drop out here. What must not
    // drop out is the copy, the borders and the picker — the checkerboard was
    // never the thing carrying the meaning.
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");
    await dropOnHomepage(page, FIXTURE);

    await expect(
      hero(page).getByRole("link", { name: /GIF compressor/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
