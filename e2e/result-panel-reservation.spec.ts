import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * The reservation guard.
 *
 * `result-panel.tsx` reserves the result box in the static HTML, and that
 * reservation is the only reason a finished job causes no layout shift. The
 * growth arrives when the *encoder* finishes — seconds after the click that
 * started it, well outside Chromium's 500ms input window — so an under-reserved
 * panel scores as real, un-prompted CLS on every job. That is what
 * `gif-compressor.spec.ts` measured at 0.0147 before Phase 1, and again at
 * 0.0029 the moment Phase 3 added two rows to the done state.
 *
 * The compressor's CLS test proves the reservation holds at **one** width. This
 * proves it holds across the four bands the reservation is written in, on the
 * two tools whose done state is tallest, because the height is dominated by
 * wrapping and the worst case is not the narrowest tool — it is the narrowest
 * viewport.
 *
 * ── Why it asserts the reservation and not the shift ───────────────────────
 * A `layout-shift` run costs a full encode per viewport, and the API is
 * Chromium-only. This measures the thing the shift is a symptom of: the content
 * the panel needs versus the space it reserved. When this fails, the failure
 * message says which band is short and by how much — where a CLS failure says
 * only that a number was not zero.
 */

const FIXTURE = join(process.cwd(), "e2e", "fixtures", "loop-small.gif");

/** Encoding a 48-frame GIF is seconds on V8 and slower under WebKit. */
const JOB_TIMEOUT_MS = 180_000;

/**
 * The two tools with the tallest done state.
 *
 * Both carry the full summary and a two-chip next row; the compressor is
 * covered by its own CLS test at 1440. Running all five here would triple the
 * suite's wall clock to re-measure a layout that does not differ between them.
 */
const TOOLS = [
  { slug: "crop-gif", run: /^crop gif$/i },
  { slug: "reverse-gif", run: /^reverse gif$/i },
] as const;

/**
 * One width per reservation band, at the band's **narrowest** point — which is
 * where the wrapping is worst and so where the band is tightest.
 */
const BANDS = [
  { width: 320, band: "base" },
  { width: 400, band: "min-[400px]" },
  { width: 480, band: "min-[480px]" },
  { width: 768, band: "md" },
] as const;

/** The reserved box's own height, and the height its contents actually need. */
async function measurePanel(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector("[data-tool-stage]");
    if (!stage) throw new Error("no tool stage on this page");
    const panel = [...stage.querySelectorAll("div")].find((element) =>
      /(^|\s)min-h-1\d\d(\s|$)/.test(element.className),
    );
    if (!panel) throw new Error("no reserved result panel on this page");

    const style = getComputedStyle(panel);
    // Summed from the children rather than read off the panel: the panel's own
    // height is already clamped up to the reservation, so it can never reveal an
    // overflow. What the contents *need* is the number under test.
    const content = [...panel.children].reduce((sum, child) => {
      const box = getComputedStyle(child);
      return (
        sum +
        child.getBoundingClientRect().height +
        parseFloat(box.marginTop) +
        parseFloat(box.marginBottom)
      );
    }, 0);

    return {
      needed: Math.ceil(
        content +
          parseFloat(style.paddingTop) +
          parseFloat(style.paddingBottom) +
          parseFloat(style.borderTopWidth) * 2,
      ),
      reserved: Math.round(parseFloat(style.minHeight)),
    };
  });
}

test.describe("the result panel's reservation", () => {
  for (const { slug, run } of TOOLS) {
    for (const { width, band } of BANDS) {
      test(`covers ${slug}'s done state at ${width}px (${band})`, async ({
        page,
        browserName,
      }) => {
        test.skip(
          browserName !== "chromium",
          "one engine is enough — this measures CSS box maths, not engine behaviour",
        );
        test.setTimeout(JOB_TIMEOUT_MS);

        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/${slug}`);

        const empty = await measurePanel(page);

        await page.locator('input[type="file"]').setInputFiles(FIXTURE);
        await page.getByRole("button", { name: run }).first().click();
        await expect(page.locator("a[download]:visible")).toBeVisible({
          timeout: JOB_TIMEOUT_MS,
        });

        const done = await measurePanel(page);

        // The invariant, in the order it matters. Both branches reserve the same
        // box, and that box is big enough for the one that fills it.
        expect(done.reserved, "the two branches reserve different boxes").toBe(
          empty.reserved,
        );
        expect(
          done.needed,
          `the done state needs ${done.needed}px and the ${band} band reserves ${done.reserved}px`,
        ).toBeLessThanOrEqual(done.reserved);
      });
    }
  }
});
