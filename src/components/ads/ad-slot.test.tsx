import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
