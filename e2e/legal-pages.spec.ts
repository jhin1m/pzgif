import { expect, test } from "@playwright/test";

/**
 * The six legal and trust pages.
 *
 * They are the pages an ad-network reviewer opens first and the pages a cautious
 * visitor opens before dropping a file, so "does it render" is a real
 * requirement rather than a smoke test — and none of them has an interactive
 * half whose breakage would be noticed any other way.
 */

const PAGES = [
  { slug: "about", heading: "About PZGIF" },
  { slug: "contact", heading: "Contact" },
  { slug: "terms", heading: "Terms of Service" },
  { slug: "privacy", heading: "Privacy Policy" },
  { slug: "cookies", heading: "Cookie Policy" },
  { slug: "dmca", heading: "Copyright and takedown" },
] as const;

test.describe("legal pages", () => {
  for (const { slug, heading } of PAGES) {
    test(`/${slug} serves a prerendered page with its own title`, async ({
      page,
    }) => {
      const response = await page.goto(`/${slug}`);
      expect(response?.status()).toBe(200);

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);

      // A canonical pointing at another page is the failure mode of six routes
      // generated from one shell, and it is invisible on the page itself.
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveAttribute("href", new RegExp(`/${slug}$`));

      // The layout applies `%s — PZGIF`, so a `meta.title` carrying the brand
      // itself renders it twice. Five of six pages shipped that way in the first
      // draft, because the assertion here only checked the title was non-empty.
      const title = await page.title();
      expect(title.match(/PZGIF/g) ?? []).toHaveLength(1);
      expect(title.endsWith("— PZGIF")).toBe(true);
    });
  }

  test("gives every page a distinct title", async ({ page }) => {
    // Six routes generated from one shell, and a copy-paste in `meta` is
    // invisible on the page itself — it shows up only in a search result and in
    // a browser tab strip.
    const titles: string[] = [];
    for (const { slug } of PAGES) {
      await page.goto(`/${slug}`);
      titles.push(await page.title());
    }
    expect(new Set(titles).size).toBe(PAGES.length);
  });

  test("the prose column does not overflow at 320px", async ({ page }) => {
    // The narrowest viewport the design supports, and the width at which a long
    // unbroken string in prose — a URL, a statute reference — pushes the document
    // wider than the viewport. Six new long-prose pages are exactly where that
    // recurs, so it is asserted rather than assumed.
    await page.setViewportSize({ width: 320, height: 800 });

    for (const { slug } of PAGES) {
      await page.goto(`/${slug}`);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(
        overflow,
        `/${slug} overflows by ${overflow}px`,
      ).toBeLessThanOrEqual(0);
    }
  });

  test("every legal page is reachable from the footer of a tool page", async ({
    page,
  }) => {
    // Checked on a tool route rather than the homepage: the footer is rendered
    // by the shared layout, and a tool page is where a visitor actually decides
    // whether to trust the site with a file.
    await page.goto("/gif-compressor");
    const footer = page.getByRole("navigation", { name: "Legal" });

    for (const { slug } of PAGES) {
      await expect(footer.locator(`a[href="/${slug}"]`)).toBeVisible();
    }
  });

  test("the sitemap lists all six with real content dates", async ({
    request,
  }) => {
    const xml = await (await request.get("/sitemap.xml")).text();

    for (const { slug } of PAGES) {
      expect(xml).toContain(`/${slug}</loc>`);
    }
    // A build timestamp would carry a time component. A content date does not,
    // and that difference is the whole point of storing the date with the prose.
    expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });
});
