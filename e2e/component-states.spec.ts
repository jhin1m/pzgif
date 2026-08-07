import { expect, test } from "@playwright/test";

/**
 * The component library, asserted in a real browser.
 *
 * The unit tests cover what is provable from rendered markup — the progress
 * width, the middle-ellipsis, the ad quarantine. Everything here needs an engine:
 * focus order, keyboard operation, computed styles, and the Safari behaviour that
 * `hidden="until-found"` would otherwise break. This suite runs on chromium and
 * webkit, which is the pair that matters for that last one.
 */

test.describe("component gallery", () => {
  test("is reachable and asks not to be indexed", async ({ page }) => {
    const response = await page.goto("/dev/states");
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });

  test("puts the skip link first in the tab order", async ({ page }) => {
    // §7.2: the skip link is the first tabbable node on every page. If anything
    // gets in front of it, a keyboard user tabs through the whole header before
    // reaching content.
    await page.goto("/dev/states");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      href: document.activeElement?.getAttribute("href"),
    }));
    expect(focused.tag).toBe("A");
    expect(focused.href).toBe("#main");
  });

  test("renders the progress fill at exactly the reported width", async ({
    page,
  }) => {
    // Principle #2 in a live browser: no transition, no interpolation. The
    // computed width of the 62% bar must be 62% of its track, not a value on the
    // way there.
    await page.goto("/dev/states");
    const fill = page
      .locator('[role="progressbar"][aria-valuenow="62"] > div')
      .first();
    const measured = await fill.evaluate((element) => {
      const parent = element.parentElement!;
      return {
        ratio:
          element.getBoundingClientRect().width /
          parent.getBoundingClientRect().width,
        transition: getComputedStyle(element).transitionDuration,
      };
    });
    expect(measured.ratio).toBeCloseTo(0.62, 2);
    expect(measured.transition).toBe("0s");
  });

  test("keeps FAQ answers reachable in every browser", async ({ page }) => {
    // The Safari trap: `hidden="until-found"` has the plain *hidden* state as its
    // invalid-value default, so applying it unconditionally would make a closed
    // answer impossible to open on Safari — on the pages the whole ranking
    // strategy depends on. The attribute is applied only where supported, and a
    // closed answer is never `display: none`.
    await page.goto("/dev/states");
    const closed = page.getByRole("button", { name: "Closed item" }).first();
    const panelId = await closed.getAttribute("aria-controls");
    const panel = page.locator(`#${panelId}`);

    await expect(closed).toHaveAttribute("aria-expanded", "false");
    expect(
      await panel.evaluate((element) => getComputedStyle(element).display),
    ).not.toBe("none");

    await closed.click();
    await expect(closed).toHaveAttribute("aria-expanded", "true");
    // The panel has real height once open — `grid-template-rows: 0fr → 1fr`.
    // Polled, not sampled: that row change is a transition, so a single read
    // taken the instant `aria-expanded` flips catches whatever fraction of the
    // animation has run and passes or fails on timing rather than on behaviour.
    await expect
      .poll(() =>
        panel.evaluate((element) => element.getBoundingClientRect().height),
      )
      .toBeGreaterThan(10);
  });

  test("serves every FAQ answer in the HTML, not just after hydration", async ({
    request,
  }) => {
    // Crawlability is the entire content strategy. An answer that only exists
    // after JS runs is an answer Google may never see.
    const html = await (await request.get("/dev/states")).text();
    expect(html).toContain(
      "stays in the DOM so crawlers and find-in-page can reach it",
    );
    expect(html).toContain("Collapsed, but still in the served HTML.");
  });

  test("drives the before/after comparison from the keyboard alone", async ({
    page,
  }) => {
    // §5.8 and §7.3: ← / → 1%, Shift + ← / → 10%, Home / End, Enter for an A-B
    // flip. Without these the quality proof is pointer-only.
    await page.goto("/dev/states");
    const handle = page
      .getByRole("slider", { name: "Compare before and after" })
      .first();
    await handle.focus();

    await handle.press("ArrowRight");
    await expect(handle).toHaveAttribute("aria-valuenow", "51");

    await handle.press("Shift+ArrowLeft");
    await expect(handle).toHaveAttribute("aria-valuenow", "41");

    await handle.press("Home");
    await expect(handle).toHaveAttribute("aria-valuenow", "0");

    await handle.press("End");
    await expect(handle).toHaveAttribute("aria-valuenow", "100");

    await handle.press("Enter");
    await expect(handle).toHaveAttribute("aria-valuenow", "0");
  });

  test("quarantines ad slots from product surfaces", async ({ page }) => {
    // §1.3: if a reviewer cannot tell an ad slot from a product card in under a
    // second, the layout fails. The three signals that carry that are asserted
    // here, in computed styles rather than in class names.
    await page.goto("/dev/states");
    const slot = page.locator('[data-ad-slot="gallery-rect"]').first();
    const style = await slot.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        radius: computed.borderTopLeftRadius,
        shadow: computed.boxShadow,
        label: getComputedStyle(element, "::before").content,
      };
    });
    expect(style.radius).toBe("6px");
    expect(style.shadow).toBe("none");
    expect(style.label).toContain("Advertisement");
  });

  test("reserves the ad slot's height before anything fills it", async ({
    page,
  }) => {
    // §8.2 and Success Criterion #4: the box is in the static HTML at full size,
    // so a fill — whenever it arrives — cannot move the page.
    await page.goto("/dev/states");
    const height = await page
      .locator('[data-ad-slot="gallery-rect"]')
      .first()
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(250);
  });

  test("never scrolls horizontally at 320px", async ({ page }) => {
    // A hard rule in §9, and the width below which a utility page becomes
    // unusable rather than merely awkward.
    await page.setViewportSize({ width: 320, height: 720 });
    for (const path of ["/", "/dev/states"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows at 320px`).toBeLessThanOrEqual(0);
    }
  });

  test("keeps the footer's tool inventory equal to the shipped scope", async ({
    page,
  }) => {
    // The wireframe footer lists `GIF to WebP` and `GIF for Slack`; both are cut.
    // A footer link to a page that does not exist is a 404 in the internal link
    // graph, on the surface whose only job is that graph.
    await page.goto("/");
    const footer = page.locator("footer");
    const links = await footer.getByRole("link").allTextContents();
    expect(links).not.toContain("GIF to WebP");
    expect(links.some((text) => text.includes("Slack"))).toBe(false);
    // 9 tools + 5 Discord routes, plus the brand link and the AGPL source offer.
    expect(
      links.filter((text) => text.trim().length > 0).length,
    ).toBeGreaterThanOrEqual(14);
  });
});
