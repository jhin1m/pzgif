import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BeforeAfterSlider,
  shouldRenderSideBySide,
} from "./before-after-slider";

const PROPS = {
  beforeSrc: "blob:before",
  afterSrc: "blob:after",
  beforeLabel: "Before · 2.4 MB",
  afterLabel: "After · 480 KB",
  beforeAlt: "Original frame",
  afterAlt: "Compressed frame",
};

describe("shouldRenderSideBySide", () => {
  it("keeps the slider for an ordinary desktop comparison", () => {
    // 640×360 × 60 frames ≈ 13.8 M animated pixels, under the desktop budget.
    expect(
      shouldRenderSideBySide({
        frames: 60,
        width: 640,
        height: 360,
        tier: "desktop",
      }),
    ).toBe(false);
  });

  it("falls back on a long, large GIF even on desktop", () => {
    expect(
      shouldRenderSideBySide({
        frames: 300,
        width: 800,
        height: 600,
        tier: "desktop",
      }),
    ).toBe(true);
  });

  it("is stricter the smaller the device budget", () => {
    const comparison = { frames: 60, width: 640, height: 360 };
    expect(shouldRenderSideBySide({ ...comparison, tier: "desktop" })).toBe(
      false,
    );
    expect(
      shouldRenderSideBySide({ ...comparison, tier: "android-mobile" }),
    ).toBe(true);
    expect(shouldRenderSideBySide({ ...comparison, tier: "ios" })).toBe(true);
  });
});

describe("BeforeAfterSlider", () => {
  it("gives the handle full slider semantics", () => {
    const markup = renderToStaticMarkup(<BeforeAfterSlider {...PROPS} />);
    expect(markup).toContain('role="slider"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-valuenow="50"');
    expect(markup).toContain("aria-valuetext=");
  });

  it("clips the after layer rather than resizing it", () => {
    // A width change would relayout the image on every pointer move; the clip
    // path is a compositor-only operation.
    const markup = renderToStaticMarkup(<BeforeAfterSlider {...PROPS} />);
    expect(markup).toContain("clip-path:inset(0 0 0 var(--pos))");
  });

  it("drops the divider entirely in the static fallback", () => {
    const markup = renderToStaticMarkup(
      <BeforeAfterSlider {...PROPS} sideBySide />,
    );
    expect(markup).not.toContain('role="slider"');
    expect(markup).not.toContain("clip-path");
    // Same labels, same byte counts — the evidence survives the degradation.
    expect(markup).toContain("Before · 2.4 MB");
    expect(markup).toContain("After · 480 KB");
  });

  it("describes both frames for a screen reader", () => {
    const markup = renderToStaticMarkup(<BeforeAfterSlider {...PROPS} />);
    expect(markup).toContain('alt="Original frame"');
    expect(markup).toContain('alt="Compressed frame"');
  });
});
