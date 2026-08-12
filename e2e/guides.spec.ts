import { expect, test } from "@playwright/test";
import { GUIDE_ROUTES, guidePath } from "../src/lib/tools/registry";

/**
 * The guides.
 *
 * Six routes rendered by one component from six hand-written files, which is the
 * arrangement most likely to ship a page carrying another page's canonical, meta
 * title or body — none of which is visible on the page itself. That is what this
 * checks, plus the two structural claims the phase makes about them: each guide
 * declares the Home > Guides > page breadcrumb, and none of them emits a schema
 * type the structured-data guard bans.
 */

test.describe("guides", () => {
  test("the hub links to every guide", async ({ page }) => {
    const response = await page.goto("/guides");
    expect(response?.status()).toBe(200);

    for (const guide of GUIDE_ROUTES) {
      await expect(
        page.locator(`main a[href$="${guidePath(guide.slug)}"]`).first(),
      ).toBeVisible();
    }
  });

  for (const guide of GUIDE_ROUTES) {
    test(`${guidePath(guide.slug)} renders with its own canonical`, async ({
      page,
    }) => {
      const response = await page.goto(guidePath(guide.slug));
      expect(response?.status()).toBe(200);

      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${guidePath(guide.slug)}$`),
      );

      // One locale, so hreflang is noise. Google's guidance is explicit that a
      // single-language site does not need it, and emitting it for one language
      // is a signal that says nothing.
      await expect(page.locator("link[hreflang]")).toHaveCount(0);

      // The layout applies `%s — PZGIF`; a `meta.title` carrying the brand
      // itself renders it twice.
      const title = await page.title();
      expect(title.match(/PZGIF/g) ?? []).toHaveLength(1);
    });
  }

  test("gives every guide a distinct title and description", async ({
    page,
  }) => {
    const titles: string[] = [];
    const descriptions: string[] = [];

    for (const guide of GUIDE_ROUTES) {
      await page.goto(guidePath(guide.slug));
      titles.push(await page.title());
      descriptions.push(
        (await page
          .locator('meta[name="description"]')
          .getAttribute("content")) ?? "",
      );
    }

    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    expect(descriptions.every((text) => text.length > 0)).toBe(true);
  });

  test("declares a three-level breadcrumb and nothing else", async ({
    page,
  }) => {
    await page.goto(guidePath(GUIDE_ROUTES[0].slug));

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(blocks.length).toBe(1);

    const graph = JSON.parse(blocks[0]);
    const types = graph["@graph"].map(
      (node: { "@type": string }) => node["@type"],
    );
    expect(types).toEqual(["BreadcrumbList"]);

    const crumbs = graph["@graph"][0].itemListElement;
    expect(crumbs).toHaveLength(3);
    // The last crumb is the current page and carries no `item`, per schema.org's
    // own guidance against self-referencing the page you are on.
    expect(crumbs[2].item).toBeUndefined();
    expect(crumbs[1].item).toMatch(/\/guides$/);
  });

  test("renders the Discord table from the preset config", async ({ page }) => {
    await page.goto(guidePath("discord-image-size-limits"));

    const table = page.locator("main table");
    await expect(table).toBeVisible();
    // Four surfaces, one header row.
    await expect(table.locator("tbody tr")).toHaveCount(4);

    // The two published ceilings, written the way Discord writes them. A
    // decimal-formatted 262 KB here would mean the table stopped matching the
    // source article it links to.
    await expect(table).toContainText("256 KB");
    await expect(table).toContainText("512 KB");
    // And the honest blank for the two surfaces Discord publishes no cap for.
    await expect(table.getByText("Not published")).toHaveCount(2);
  });
});
