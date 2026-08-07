import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomBarProvider } from "@/components/tool/action-bar-context";
import { AdSlot } from "./ad-slot";

/**
 * §8.2 requires the container to exist, at full size, in the **initial HTML** —
 * "never inject the container node after hydration". These assertions run
 * against the server render for exactly that reason: a slot that only appears
 * (or only disappears) once JS runs is a layout shift on the element the CLS
 * budget is spent on.
 */
describe("AdSlot", () => {
  it("ships the reserved box, its size class and its label in the server HTML", () => {
    const markup = renderToStaticMarkup(
      <AdSlot variant="rect" name="result-rect" />,
    );
    expect(markup).toContain("ad-slot");
    expect(markup).toContain("ad-slot--rect");
    expect(markup).toContain('data-ad-slot="result-rect"');
    expect(markup).toContain('aria-label="Advertisement"');
  });

  it("renders the anchor unit when the bottom of the viewport is free", () => {
    const markup = renderToStaticMarkup(
      <BottomBarProvider>
        <AdSlot variant="anchor" name="mobile-anchor" />
      </BottomBarProvider>,
    );
    expect(markup).toContain("ad-slot--anchor");
  });

  it("omits the anchor unit on the server when the action bar is up", () => {
    // §8.1: mutually exclusive with the sticky action bar. Decided at render
    // time, so the server and the client agree and nothing unmounts later.
    const markup = renderToStaticMarkup(
      <BottomBarProvider actionBarVisible>
        <AdSlot variant="anchor" name="mobile-anchor" />
      </BottomBarProvider>,
    );
    expect(markup).toBe("");
  });

  it("leaves the in-content slots alone whatever the action bar is doing", () => {
    // Only the anchor competes for the bottom of the viewport; suppressing a
    // result or in-content slot would forfeit inventory for nothing.
    for (const variant of ["rect", "inline", "rail"] as const) {
      const markup = renderToStaticMarkup(
        <BottomBarProvider actionBarVisible>
          <AdSlot variant={variant} name={`slot-${variant}`} />
        </BottomBarProvider>,
      );
      expect(markup).toContain(`ad-slot--${variant}`);
    }
  });
});

describe("AdSlot with no ad network configured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /** Re-import through a cleared flag — `ADS_ENABLED` is read at module load. */
  async function withAdsDisabled() {
    vi.stubEnv("NEXT_PUBLIC_ADS_ENABLED", "");
    vi.resetModules();
    return (await import("./ad-slot")).AdSlot;
  }

  it("renders nothing at all", async () => {
    // The default deployment has no network behind it. An empty grey box
    // labelled "Advertisement" costs viewport and reads as broken; there is
    // nothing arriving later that it needs to hold a place for.
    const Slot = await withAdsDisabled();
    for (const variant of ["rect", "inline", "rail", "anchor"] as const) {
      // No provider: the context defaults to "bar not visible", which is the
      // case where the anchor unit would otherwise render.
      const markup = renderToStaticMarkup(
        <Slot variant={variant} name={`slot-${variant}`} />,
      );
      expect(markup, variant).toBe("");
    }
  });

  it("still renders for the dev gallery, which has to show the quarantine", async () => {
    const Slot = await withAdsDisabled();
    const markup = renderToStaticMarkup(
      <Slot demo variant="rect" name="gallery-rect" />,
    );
    expect(markup).toContain("ad-slot--rect");
  });
});
