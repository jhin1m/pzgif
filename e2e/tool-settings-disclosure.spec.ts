import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ADS_ENABLED } from "./lib/ads";

/**
 * The preset-first settings column: chips, a promoted primary, and a settings
 * panel that is a disclosure.
 *
 * ── Two collapse behaviours, and which route has which ─────────────────────
 * The eight `GifWorkbench` routes collapse below `lg` and are forced open from
 * `lg` up, where the settings have their own column and hiding them would move
 * nothing. `/gif-compressor` passes `toggleLabel` and opts out: its three preset
 * chips are the expected answer, so the four controls stay closed at every width
 * until the visitor presses Show. Both are asserted below, on their own routes.
 *
 * ── Why 768×1024 is the viewport that matters for the workbench ────────────
 * Below `md` the sticky action bar already pins the primary to the bottom of
 * the viewport, so 390px passed before this feature existed and proves nothing
 * about it. At `≥lg` the settings have their own column. 768–1023px is the only
 * band where the panel genuinely sat between the visitor and the button, and it
 * is the band those assertions measure.
 *
 * ── Why this suite exists at all ───────────────────────────────────────────
 * `vitest.config.mts` sets `environment: "node"` and this repository has no DOM
 * harness, so every claim about intent, probe races and disclosure state has to
 * be made here. A unit test that cannot run is worse than an absent one.
 */

const FIXTURES = join(process.cwd(), "e2e", "fixtures");
const GIF = join(FIXTURES, "loop-small.gif");

/** The band where the collapse actually moves content. */
const TABLET = { width: 768, height: 1024 };
/** Wide enough for the rail column and for the forced-open panel. */
const WIDE = { width: 1440, height: 900 };

function stage(page: Page) {
  return page.locator("[data-tool-stage]");
}

function chip(page: Page, id: string) {
  return page.locator(`[data-preset="${id}"]`);
}

function toggle(page: Page, slug: string) {
  return page.locator(`button[aria-controls="${slug}-settings-panel"]`);
}

function panel(page: Page, slug: string) {
  return page.locator(`#${slug}-settings-panel`);
}

/**
 * Opens the compressor's panel.
 *
 * Its controls are outside the accessibility tree until this runs — the panel
 * is `visibility: hidden` while closed, and it is closed at every width — so
 * `getByRole` finds nothing rather than something hidden.
 */
async function openSettings(page: Page) {
  const control = toggle(page, "gif-compressor");
  if ((await control.getAttribute("aria-expanded")) === "true") return;
  await control.click();
  await expect(control).toHaveAttribute("aria-expanded", "true");
}

/** The inline primary, which is the one that lives in the settings column. */
function primary(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

async function loadGif(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(GIF);
  await expect(stage(page).getByTitle("loop-small.gif")).toBeVisible();
  // The worker's probe, not something that merely looks like it.
  await expect(stage(page).getByText("480×270")).toBeVisible({ timeout: 60_000 });
}

async function topOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  expect(box, "element has no box").not.toBeNull();
  return box!.y;
}

/**
 * Offset from the top of the *document*, not the viewport.
 *
 * `boundingBox()` is viewport-relative, and clicking the toggle scrolls it into
 * view — which made an element that moved 850px down the page appear to move
 * 850px up. Anything compared across a click has to be measured against the
 * document.
 */
async function documentTopOf(locator: Locator): Promise<number> {
  return locator.evaluate(
    (node) => node.getBoundingClientRect().top + window.scrollY,
  );
}

async function sliderValue(page: Page, name: RegExp): Promise<number> {
  return Number(await page.getByRole("slider", { name }).inputValue());
}

test.describe("gif compressor settings column", () => {
  test("puts the primary above the controls at 768px", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await page.goto("/gif-compressor");

    // Chips first, then the button, then the disclosure header. This is the
    // whole reordering, asserted as geometry rather than as DOM order — a
    // `flex-col-reverse` would satisfy the second and fail a visitor.
    const chips = chip(page, "balanced");
    const button = primary(page, "Compress GIF");
    const settings = toggle(page, "gif-compressor");

    expect(await topOf(chips)).toBeLessThan(await topOf(button));
    expect(await topOf(button)).toBeLessThan(await topOf(settings));
  });

  test("stays collapsed at every width until Show is pressed", async ({
    page,
  }) => {
    // Both bands, because this route opts out of the forced-open `≥lg` rule
    // that the other eight keep. A regression that reinstated
    // `lg:grid-rows-[1fr]` here would still pass at 768px.
    for (const viewport of [TABLET, WIDE]) {
      await page.setViewportSize(viewport);
      await page.goto("/gif-compressor");

      const region = panel(page, "gif-compressor");
      const control = toggle(page, "gif-compressor");

      // The affordance is a word, not a bare chevron: this panel is the only
      // route to the controls, so "there is more here" has to be readable
      // rather than inferred from an icon.
      await expect(control).toBeVisible();
      await expect(control).toHaveText(/Show/);
      await expect(control).toHaveAttribute("aria-expanded", "false");
      await expect(region).toHaveAttribute("data-state", "closed");
      // Collapsed to zero height, but never `display: none` — the labels have
      // to stay in the layout, which is what keeps them in the served HTML.
      expect((await region.boundingBox())!.height, String(viewport.width)).toBe(0);

      await control.click();
      await expect(control).toHaveAttribute("aria-expanded", "true");
      await expect(control).toHaveText(/Hide/);
      // Polled, not read once: the panel animates its `grid-template-rows` over
      // 150 ms, so a single measurement races the transition rather than the
      // code.
      await expect
        .poll(async () => (await region.boundingBox())!.height)
        .toBeGreaterThan(100);
    }
  });

  test("keeps the other eight forced open at xl, by CSS alone", async ({
    page,
  }) => {
    // The rule the compressor opts out of, asserted on a route that keeps it:
    // at `≥lg` the toggle is gone and the panel is open regardless of the state
    // attribute React still holds. This is the specificity claim in the CSS —
    // `lg:grid-rows-[1fr]` is a utility, and utilities beat `@layer components`.
    await page.setViewportSize(WIDE);
    await page.goto("/resize-gif");

    const region = panel(page, "resize-gif");
    await expect(toggle(page, "resize-gif")).toBeHidden();
    await expect(region).toHaveAttribute("data-state", "closed");
    expect(
      await region.evaluate((node) => getComputedStyle(node).gridTemplateRows),
    ).not.toBe("0px");
    expect((await region.boundingBox())!.height).toBeGreaterThan(100);
  });

  test("moves the explainer when it collapses, and shifts nothing unprompted", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "layout-shift API is Chromium-only");
    await page.setViewportSize(TABLET);
    await page.goto("/gif-compressor");

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

    // What moves is recorded, not assumed: below `lg` the shell is one column
    // and everything under the panel — the explainer, the FAQ, the reserved ad
    // slot — is what an open panel pushes down. If this stopped moving, the
    // disclosure would have stopped doing anything.
    const explainer = page.locator("h2").first();
    const before = await documentTopOf(explainer);
    await toggle(page, "gif-compressor").click();
    await expect(toggle(page, "gif-compressor")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect
      .poll(
        () => documentTopOf(explainer),
        { message: "expanding the panel moved nothing below it" },
      )
      .toBeGreaterThan(before);

    // The move follows a click, inside Chromium's 500 ms input window, so it is
    // excluded from CLS. Nothing else may shift at all.
    const shift = await page.evaluate(
      () => (window as typeof window & { __shift: number }).__shift,
    );
    expect(shift).toBe(0);
  });

  test("takes the collapsed controls out of the tab order", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await page.goto("/gif-compressor");
    await loadGif(page);

    const region = panel(page, "gif-compressor");
    const firstControl = region.locator('input[type="range"]').first();

    // `grid-template-rows: 0fr` clips; on its own it leaves every control
    // focusable and announced, so a keyboard user would tab off the toggle into
    // five sliders they cannot see. `toBeHidden` is satisfied by
    // `visibility: hidden` and not by a zero-height clip, which is the
    // distinction being asserted.
    await expect(firstControl).toBeHidden();

    await toggle(page, "gif-compressor").focus();
    await page.keyboard.press("Tab");
    const landedInside = await region.evaluate((node) =>
      node.contains(document.activeElement),
    );
    expect(landedInside, "Tab reached a control inside the closed panel").toBe(
      false,
    );

    await toggle(page, "gif-compressor").click();
    await expect(firstControl).toBeVisible();
  });

  test("keeps the primary's reason outside the collapsible region", async ({
    page,
  }) => {
    await page.setViewportSize(TABLET);
    await page.goto("/gif-compressor");

    const described = await primary(page, "Compress GIF").getAttribute(
      "aria-describedby",
    );
    expect(described).toBe("compressor-primary-reason");

    // A description a visitor has to expand a panel to read is not one.
    const inside = await page
      .locator("#gif-compressor-settings-panel #compressor-primary-reason")
      .count();
    expect(inside).toBe(0);
    await expect(page.locator(`#${described}`)).toBeVisible();
  });

  test("reaches chips, primary and toggle in visual order from the keyboard", async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize(TABLET);
    await page.goto("/gif-compressor");
    await loadGif(page);

    // Tab order is asserted on Chromium only. WebKit follows macOS's "Full
    // Keyboard Access" setting, which is off by default and which Playwright
    // does not flip, so `Tab` there skips buttons entirely — a WebKit failure
    // would be a fact about the host OS and not about this page.
    if (browserName === "chromium") {
      await chip(page, "smallest").focus();
      await page.keyboard.press("Tab");
      await expect(chip(page, "balanced")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(chip(page, "sharpest")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(primary(page, "Compress GIF")).toBeFocused();
    }

    // Space and Enter both operate the disclosure, on both engines, because it
    // is a real button rather than a div with a click handler.
    const control = toggle(page, "gif-compressor");
    await control.focus();
    await page.keyboard.press("Enter");
    await expect(control).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(control).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("gif compressor presets", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
    await page.goto("/gif-compressor");
  });

  test("is disabled before a file, and pressed on the default", async ({
    page,
  }) => {
    await expect(chip(page, "balanced")).toBeDisabled();
    await expect(chip(page, "balanced")).toHaveAttribute("aria-pressed", "true");

    await loadGif(page);
    await expect(chip(page, "balanced")).toBeEnabled();
  });

  test("moves quality, and only quality, between the chips", async ({ page }) => {
    await loadGif(page);
    await openSettings(page);

    // The untouched default: `balanced`, sized to the source. This is also the
    // byte-identical anchor — a visitor who touches nothing runs the job the
    // pre-preset build ran.
    expect(await sliderValue(page, /^Quality/)).toBe(80);
    expect(await sliderValue(page, /^Width/)).toBe(480);
    await expect(page.getByRole("switch", { name: /drop every second frame/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await chip(page, "smallest").click();
    await expect(chip(page, "smallest")).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, "balanced")).toHaveAttribute("aria-pressed", "false");
    // Quality drops and nothing else moves. Capping the palette here is what
    // this preset used to do, and `calibration.json` measured that *growing*
    // the file on five of seven fixtures because it pins the weaker encoder —
    // so a 128 in the select would be the defect, not a detail.
    expect(await sliderValue(page, /^Quality/)).toBe(50);
    expect(await sliderValue(page, /^Width/)).toBe(480);
    await expect(page.getByText("256 — best quality")).toBeVisible();
    await expect(page.getByRole("switch", { name: /drop every second frame/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await chip(page, "sharpest").click();
    expect(await sliderValue(page, /^Quality/)).toBe(95);
    expect(await sliderValue(page, /^Width/)).toBe(480);
    await expect(page.getByText("256 — best quality")).toBeVisible();
  });

  test("clears the pressed chip when a control is edited by hand", async ({
    page,
  }) => {
    await loadGif(page);
    await openSettings(page);
    await expect(chip(page, "balanced")).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("switch", { name: /drop every second frame/i }).click();

    for (const id of ["smallest", "balanced", "sharpest"]) {
      await expect(chip(page, id)).toHaveAttribute("aria-pressed", "false");
    }
  });

  test("keeps the preset a probe lands under, and keeps a manual edit too", async ({
    page,
  }) => {
    // (a) A chip clicked while the probe is still in flight must survive it.
    // The probe callback is created at drop time and never recreated, so a
    // state read inside it would be the value from before the click.
    await page.locator('input[type="file"]').setInputFiles(GIF);
    await chip(page, "sharpest").click();
    await expect(stage(page).getByText("480×270")).toBeVisible({ timeout: 60_000 });
    await expect(chip(page, "sharpest")).toHaveAttribute("aria-pressed", "true");
    await openSettings(page);
    expect(await sliderValue(page, /^Quality/)).toBe(95);

    // (b) The other direction: an edit before the probe lands is the user's,
    // and the probe must not size over it.
    await page.reload();
    await page.locator('input[type="file"]').setInputFiles(GIF);
    await openSettings(page);
    await page.getByRole("switch", { name: /drop every second frame/i }).click();
    await expect(stage(page).getByText("480×270")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("switch", { name: /drop every second frame/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(chip(page, "balanced")).toHaveAttribute("aria-pressed", "false");

    // …and the width the panel shows is still the width the job would run. A
    // pre-probe edit must not freeze `width` at the 1280 pre-probe fallback
    // while the slider, whose `max` is now the source width, reads 480.
    expect(await sliderValue(page, /^Width/)).toBe(480);
    await expect(page.getByText("480 px", { exact: true })).toBeVisible();
  });

  test("sizes the second file, after the first one was edited", async ({
    page,
  }) => {
    await loadGif(page);
    await openSettings(page);
    await chip(page, "smallest").click();
    expect(await sliderValue(page, /^Quality/)).toBe(50);

    // `startOver` has to restore the default intent, or the next file inherits
    // the last one's choices and is never sized to itself.
    await page.getByRole("button", { name: /choose a different/i }).click();
    await loadGif(page);
    await openSettings(page);

    await expect(chip(page, "balanced")).toHaveAttribute("aria-pressed", "true");
    expect(await sliderValue(page, /^Quality/)).toBe(80);
    // Sized to the file it is now about, not left at the pre-probe fallback.
    expect(await sliderValue(page, /^Width/)).toBe(480);
  });

  test("is disabled while a job owns the settings", async ({ page }) => {
    test.setTimeout(180_000);
    await loadGif(page);

    await primary(page, "Compress GIF").click();
    // The same lock `SettingsForm` takes. A chip clicked mid-encode would leave
    // the panel describing settings the running job is not using.
    await expect(chip(page, "smallest")).toBeDisabled();
    await expect(page.getByText("Locked while encoding")).toBeVisible();

    await expect(page.locator("a[download]:visible")).toBeVisible({
      timeout: 180_000,
    });
    await expect(chip(page, "smallest")).toBeEnabled();
  });

  test("returns to the default preset on Reset", async ({ page }) => {
    await loadGif(page);
    await openSettings(page);
    await chip(page, "sharpest").click();
    expect(await sliderValue(page, /^Quality/)).toBe(95);

    // Reset lives in `aside`, outside the collapsible region, so it is reachable
    // whether the panel is open or not.
    await page.getByRole("button", { name: "Reset", exact: true }).click();

    await expect(chip(page, "balanced")).toHaveAttribute("aria-pressed", "true");
    expect(await sliderValue(page, /^Quality/)).toBe(80);
    expect(await sliderValue(page, /^Width/)).toBe(480);
  });
});

test.describe("the settings prose survives the collapse", () => {
  /**
   * Against the prerendered bytes, never the DOM: the point of collapsing with
   * `grid-template-rows` rather than `hidden` is that the labels stay in the
   * served HTML, and a DOM assertion would pass either way.
   */
  const CASES = [
    {
      route: "/gif-compressor",
      strings: [
        "Colours",
        "Halving the width is the single biggest size win",
        "Fine for screen recordings, visible on fast motion",
        "Start from one of these",
        "Best quality",
      ],
    },
    {
      route: "/mp4-to-gif",
      strings: [
        "Which seconds to keep",
        "Twelve to fifteen reads as motion",
        "Height follows the clip&#x27;s own proportions",
        "How should the clip come out?",
        "Smoothest motion",
      ],
    },
  ];

  for (const { route, strings } of CASES) {
    test(`serves every control label and hint on ${route}`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      const html = await response!.text();
      for (const needle of strings) expect(html, needle).toContain(needle);
    });
  }
});

test.describe("every tool the workbench serves gets the same disclosure", () => {
  /**
   * The chip row is scoped to two tools; the reorder and the collapse are not.
   * `GifWorkbench` is one component behind eight routes, so gating the
   * disclosure on whether a tool happens to have presets would have shipped the
   * primary buried under the controls on six of them — the same asymmetry the
   * plan rejected for the Reset button.
   *
   * That makes the other six in scope for verification even though they were
   * not in scope for design. Every pre-existing tool spec runs at ≥1024px,
   * where the panel is forced open, so without this the collapsed state on
   * those routes would ship measured on nothing.
   */
  const ROUTES = [
    "resize-gif",
    "crop-gif",
    "gif-speed-changer",
    "reverse-gif",
    "gif-to-mp4",
    "webp-to-gif",
    "split-gif-to-frames",
  ];

  for (const slug of ROUTES) {
    test(`collapses, opens and stays crawlable on /${slug}`, async ({ page }) => {
      await page.setViewportSize(TABLET);
      const response = await page.goto(`/${slug}`);
      expect(response?.status()).toBe(200);
      const html = await response!.text();

      const region = panel(page, slug);
      const control = toggle(page, slug);

      await expect(control).toHaveAttribute("aria-expanded", "false");
      expect((await region.boundingBox())!.height).toBe(0);
      // Hidden to the pointer and to the tab order, but still in the layout and
      // therefore still in the bytes the crawler was served.
      await expect(region.locator("label").first()).toBeHidden();
      // The label's first element child where there is one: `Slider` renders
      // `<label><span>Width</span><span>640 px</span></label>`, and the two run
      // together in `textContent` as "Width640 px", which is in no HTML
      // anywhere. The readout is a live value; the label is the copy.
      const firstLabel = await region
        .locator("label")
        .first()
        .evaluate(
          (node) =>
            (node.firstElementChild?.textContent ?? node.textContent ?? "").trim(),
        );
      expect(firstLabel.length, `${slug} renders no control label`).toBeGreaterThan(0);
      expect(html, `${slug}'s first control label is not in the served HTML`).toContain(
        firstLabel,
      );

      // The primary is above the controls here too — that is the whole reason
      // the reorder was not gated on presets.
      const button = page.locator(`[aria-describedby="${slug}-primary-reason"]`);
      expect(await topOf(button)).toBeLessThan(await topOf(control));

      await control.click();
      await expect(control).toHaveAttribute("aria-expanded", "true");
      await expect
        .poll(async () => (await region.boundingBox())!.height)
        .toBeGreaterThan(40);
      await expect(region.locator("label").first()).toBeVisible();
    });
  }
});

test.describe("the ad rail does not move when the settings do", () => {
  /**
   * Neither branch is a skip.
   *
   * `ADS_ENABLED` is inlined at build time, so this suite can only ask which
   * build it is looking at. With the flag on, the rail must exist and must not
   * move; with it off, `ToolShell` does not declare the third track at all and
   * the assertion is that nothing renders. CI runs the suite both ways, and the
   * ads run is the one that measures the rail.
   */
  test("keeps the rail's box and the grid's tracks fixed across a toggle", async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto("/gif-compressor");

    const rail = page.locator('[data-ad-slot="rail"]');
    const grid = page.locator("[data-tool-stage]").locator("xpath=../..");

    if (!ADS_ENABLED) {
      await expect(rail).toHaveCount(0);
      const tracks = await grid.evaluate(
        (node) => getComputedStyle(node).gridTemplateColumns.split(" ").length,
      );
      expect(tracks, "no ad build must not reserve a third track").toBe(2);
      return;
    }

    // Fails rather than skips: a missing rail in an ads build is the defect.
    await expect(rail).toBeVisible();
    // `x` and `width`, not the whole box: the toggle click scrolls, and `y` is
    // measured against the viewport. Horizontal position is what a column that
    // gained or lost a track would change.
    const railBox = () =>
      rail.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, width: box.width };
      });
    const before = await railBox();
    const tracksBefore = await grid.evaluate(
      (node) => getComputedStyle(node).gridTemplateColumns,
    );

    // Flipped at `xl`, where the rail exists: this route keeps its toggle at
    // every width, so there is no need to shrink the viewport to reach it.
    await toggle(page, "gif-compressor").click();
    await expect(toggle(page, "gif-compressor")).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    expect(await railBox()).toEqual(before);
    expect(
      await grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns),
    ).toBe(tracksBefore);
  });
});
