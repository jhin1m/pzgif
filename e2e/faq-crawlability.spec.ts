import { expect, test } from "@playwright/test";
import content from "../src/content/gif-compressor.json";

/**
 * The FAQ answers have to be findable — by a crawler, and by a reader hitting
 * ctrl-F on a collapsed row.
 *
 * `phase-09` states the requirement as "FAQ answers present in the SSG HTML and
 * revealed by browser find-in-page", and the two halves need different proofs.
 *
 * ── Why the first half is checked against raw HTML, not the DOM ─────────────
 * `page.getByText()` reads the hydrated DOM, which is a different document from
 * the one Googlebot's first pass sees. An answer injected by client JavaScript
 * would pass a DOM assertion and be invisible to a crawler that did not run the
 * script, which is exactly the regression the requirement exists to prevent.
 * So this fetches the response body as text and looks in there.
 *
 * ── Why the second half checks the attribute, not the keystroke ─────────────
 * There is no way to invoke find-in-page from Playwright: it is browser chrome,
 * not page content, and no automation protocol exposes it. What *is* checkable
 * is the mechanism it depends on — `hidden="until-found"` on the collapsed
 * panel, applied after mount and only where `beforematch` exists. If the
 * attribute is there and the browser supports the feature, find-in-page reveals
 * the panel; that is the browser's contract, not this application's.
 *
 * The Safari branch matters as much as the Chromium one. `until-found` is
 * unsupported in WebKit and fails *closed* there — a panel rendered with the
 * attribute in the static HTML would be permanently unopenable. Hence the
 * assertion that the server never sends it, and that WebKit never gains it.
 */

const TOOL = "/gif-compressor";

test.describe("FAQ crawlability", () => {
  test("serves every answer in the static HTML", async ({ request }) => {
    const response = await request.get(TOOL);
    expect(response.status()).toBe(200);
    const html = await response.text();

    // The answers come from the content file rather than being hard-coded here:
    // a copy edit would otherwise fail this test for the wrong reason, and what
    // is under test is presence, not wording.
    expect(content.faq.length).toBeGreaterThan(0);

    for (const entry of content.faq) {
      // First sentence of the first paragraph: enough to prove the answer body
      // was server-rendered, short enough to survive an edit elsewhere in it.
      const probe = entry.answer[0].split(". ")[0].slice(0, 60);
      expect(
        html.includes(escapeForHtml(probe)),
        `the answer to "${entry.question}" is not in the served HTML`,
      ).toBe(true);
    }
  });

  test("never ships `hidden` in the static HTML", async ({ request }) => {
    // A panel that arrives hidden is unopenable in Safari and invisible to a
    // crawler that does not run scripts. The attribute is applied after mount or
    // not at all.
    const html = await (await request.get(TOOL)).text();
    // `data-accordion-panel`, not "an id ending in -panel": the tool pages'
    // settings disclosure reuses the same collapse CSS and the same id shape,
    // and it is deliberately never `hidden` at all.
    const panels = html.match(/<div[^>]*data-accordion-panel[^>]*>/g) ?? [];
    expect(panels.length, "no FAQ panels were rendered at all").toBeGreaterThan(
      0,
    );
    for (const panel of panels) {
      expect(panel, "a FAQ panel was server-rendered hidden").not.toContain(
        "hidden",
      );
    }
  });

  test("marks collapsed panels `until-found` where the browser supports it", async ({
    page,
    browserName,
  }) => {
    await page.goto(TOOL);

    // The *second* row. `FaqSection` opens the first one by default, so it never
    // carries the attribute — asserting against it would have tested nothing and
    // passed for the wrong reason on every engine.
    const panel = page
      .locator('[data-accordion-panel][data-state="closed"]')
      .first();
    await expect(panel).toBeAttached();

    const supported = await page.evaluate(
      () => "onbeforematch" in document.body,
    );

    if (supported) {
      // Chromium. The effect runs on mount, so this is the hydrated state.
      await expect(panel).toHaveAttribute("hidden", "until-found");
    } else {
      // WebKit and any engine without the feature. The panel must not gain the
      // attribute at all: `until-found` fails closed there, so a collapsed row
      // carrying it would be unopenable by any means, including the button.
      //
      // Not asserted with `toBeVisible()`: a closed row is collapsed to zero
      // height by `grid-template-rows`, so it is legitimately not visible. What
      // matters is that its text is still in the DOM and reachable, which is
      // what the absence of `hidden` guarantees.
      expect(browserName).not.toBe("chromium");
      await expect(panel).not.toHaveAttribute("hidden", /.*/);
      await expect(panel).not.toBeEmpty();
    }
  });
});

/** React escapes these on the way out; the probe has to match what was sent. */
function escapeForHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
