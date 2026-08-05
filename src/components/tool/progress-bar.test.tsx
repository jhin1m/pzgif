import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./progress-bar";

/**
 * The test design-guidelines.md §5.7 and plan Success Criterion #6 both ask for:
 * *the rendered width equals the passed value exactly*.
 *
 * These render to static markup rather than to a DOM. There is no jsdom in this
 * project, and for this component there is nothing a DOM would add — the whole
 * point of `ProgressBar` is that its output is a pure function of its props,
 * with no effect, no timer and no state to observe.
 */

function widthOf(markup: string): string | null {
  const match = /style="width:\s*([^";]+)/.exec(markup);
  return match ? match[1].trim() : null;
}

describe("ProgressBar", () => {
  it("renders the passed value as the fill width, exactly", () => {
    for (const value of [0, 1, 37, 62, 99, 100]) {
      const markup = renderToStaticMarkup(
        <ProgressBar determinate value={value} label="Compression progress" />,
      );
      expect(widthOf(markup)).toBe(`${value}%`);
      expect(markup).toContain(`aria-valuenow="${value}"`);
    }
  });

  it("never transitions the fill, so the rendered width cannot lag the real one", () => {
    const markup = renderToStaticMarkup(
      <ProgressBar determinate value={50} label="Compression progress" />,
    );
    expect(markup).toContain("transition-none");
  });

  it("clamps out-of-range values instead of rescaling them", () => {
    // A value outside 0-100 is a caller bug. The honest render is the nearest
    // end of the track — never a remapped number that hides the bug.
    const over = renderToStaticMarkup(
      <ProgressBar determinate value={140} label="Compression progress" />,
    );
    const under = renderToStaticMarkup(
      <ProgressBar determinate value={-20} label="Compression progress" />,
    );
    expect(widthOf(over)).toBe("100%");
    expect(widthOf(under)).toBe("0%");
  });

  it("claims no percentage at all when there is no counter", () => {
    const markup = renderToStaticMarkup(
      <ProgressBar determinate={false} label="Preparing" />,
    );
    // No width, no aria-valuenow, no number in the readout: an indeterminate
    // stage has no denominator, so inventing one is the failure mode this
    // component exists to prevent.
    expect(widthOf(markup)).toBeNull();
    expect(markup).not.toContain("aria-valuenow");
    expect(markup).not.toMatch(/\d+%<\/span>/);
    expect(markup).toContain("—");
  });

  it("marks the percentage readout aria-hidden so it is not double-announced", () => {
    // §7.5: the live region announces progress at 25% boundaries. A readout the
    // screen reader also reads would announce every tick.
    const markup = renderToStaticMarkup(
      <ProgressBar determinate value={25} label="Compression progress" />,
    );
    expect(markup).toMatch(/aria-hidden="true"[^>]*>25%/);
  });
});
