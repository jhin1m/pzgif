import { expect, test } from "@playwright/test";

test.describe("app shell", () => {
  test("serves English prefix-free, with no redirect", async ({ page }) => {
    // The prefix-free URL is what 12-18 months of link equity will accumulate
    // against. A redirect here would mean the proxy rewrite has broken.
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("serves a real, styled 404 for an unmatched URL", async ({ page }) => {
    // Unmatched URLs match no route inside [locale], so they fall through to the
    // root not-found. Without one, Next serves its unstyled default: no `lang`
    // on an indexable response, no theme, and no AGPL source link.
    const response = await page.goto("/definitely-not-a-page");
    expect(response?.status()).toBe(404);

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      /light|dark/,
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Styled, not the browser default.
    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(background).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("is never cross-origin isolated", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response!.headers();

    // COOP/COEP break Google ad serving. This is the revenue model, asserted.
    // forbidden-guard-allow: asserting the header's absence is the point here.
    expect(headers["cross-origin-opener-policy"]).toBeUndefined(); // forbidden-guard-allow
    expect(headers["cross-origin-embedder-policy"]).toBeUndefined(); // forbidden-guard-allow

    const isolated = await page.evaluate(() => window.crossOriginIsolated);
    expect(isolated).toBe(false);
  });

  test("allows WebAssembly instantiation under the CSP", async ({ page }) => {
    const response = await page.goto("/");
    const csp = response!.headers()["content-security-policy"];

    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).not.toContain("'unsafe-eval' ");

    // A hash or nonce in script-src makes browsers ignore 'unsafe-inline',
    // which blocks Next's inline RSC payload scripts and stops the page
    // hydrating entirely. See the warning in next.config.ts.
    const scriptSrc = csp
      .split(";")
      .find((part) => part.includes("script-src"));
    expect(scriptSrc).not.toMatch(/sha(256|384|512)-|'nonce-/);

    // The narrow directive has to actually work, not merely be present.
    const compiled = await page.evaluate(async () => {
      // Smallest valid WebAssembly module: magic number + version.
      const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
      const result = await WebAssembly.instantiate(bytes);
      return result.instance !== undefined;
    });
    expect(compiled).toBe(true);
  });

  test("applies the theme before first paint and remembers the choice", async ({
    page,
  }) => {
    await page.goto("/");

    // The boot script clears this attribute, which is what suppresses the
    // colour transition on the very first paint.
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-theme-booting",
      /.*/,
    );

    const initial = await page.locator("html").getAttribute("data-theme");
    expect(initial === "light" || initial === "dark").toBe(true);

    const readBackground = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const before = await readBackground();

    await page.getByRole("button", { name: /switch theme/i }).click();
    const flipped = initial === "dark" ? "light" : "dark";
    await expect(page.locator("html")).toHaveAttribute("data-theme", flipped);

    // The attribute flipping proves nothing on its own. Dropping `inline` from
    // the bridge `@theme` block in globals.css makes Tailwind snapshot the token
    // values at build time: the attribute still toggles, and every colour stays
    // exactly where it was. That is the single most likely way dark mode dies,
    // so the assertion is on a rendered colour.
    await expect.poll(readBackground).not.toBe(before);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", flipped);
  });

  test("still renders on reload with the network off", async ({
    page,
    context,
    browserName,
  }) => {
    // The copy tells users they can turn their connection off and the page will
    // still work. Chromium is enough to keep that claim honest in CI.
    test.skip(
      browserName !== "chromium",
      "service worker probe runs on chromium",
    );

    // Deliberately ONE visit, then straight offline. A worker never controls the
    // navigation that registered it, so an extra online reload here would prove
    // a scenario nobody performs and hide the one everybody does. The shell is
    // precached at install time precisely so this works first time.
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("h1")).toBeVisible();
    await context.setOffline(false);
  });
});
