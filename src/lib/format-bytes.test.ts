import { describe, expect, it } from "vitest";
import { deltaDirection, formatBytes, formatDelta } from "./format-bytes";

/**
 * These numbers are the evidence for the product's central claim, so the thing
 * worth testing is not the arithmetic — it is that a visitor who checks the
 * output against their own file browser sees the same figure.
 */

describe("formatBytes", () => {
  it("uses decimal units, matching every OS file browser", () => {
    // 1 MiB would render as "1.0 MB" under binary units and disagree with
    // Finder and Explorer by 5% on the one number users cross-check.
    expect(formatBytes(1_000_000)).toBe("1.0 MB");
    expect(formatBytes(1_048_576)).toBe("1.0 MB");
    expect(formatBytes(2_400_000)).toBe("2.4 MB");
    expect(formatBytes(480_000)).toBe("480 KB");
  });

  it("drops the decimal once the number no longer needs it", () => {
    expect(formatBytes(9_870_000)).toBe("9.9 MB");
    expect(formatBytes(124_300_000)).toBe("124 MB");
  });

  it("keeps small sizes in whole bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1000)).toBe("1.0 KB");
  });

  it("refuses to render a number it was not given", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("formatDelta", () => {
  it("reports a reduction with the minus sign the wireframe specifies", () => {
    expect(formatDelta(2_400_000, 480_000)).toBe("−80% smaller");
  });

  it("says so plainly when the file got bigger", () => {
    // Re-encoding an already-optimised GIF at a higher quality really does this.
    // An unsigned percentage here would make the page's one proof point lie.
    expect(formatDelta(100_000, 104_000)).toBe("+4% larger");
  });

  it("distinguishes no change from a rounding artefact", () => {
    expect(formatDelta(100_000, 100_000)).toBe("no change");
    expect(formatDelta(0, 5_000)).toBe("—");
  });
});

describe("deltaDirection", () => {
  it("agrees with the word the badge prints", () => {
    // The colour and the word come from one rounded percentage on purpose. If
    // these two ever disagreed, the panel would warn about a growth it also
    // described as "no change".
    for (const [from, to] of [
      [2_400_000, 480_000],
      [100_000, 104_000],
      [100_000, 100_000],
      [0, 5_000],
      // A 0.4% growth: real bytes, but below what a whole percent can show.
      [100_000, 100_400],
    ] as const) {
      const label = formatDelta(from, to);
      const expected = label.includes("larger")
        ? "larger"
        : label.includes("smaller")
          ? "smaller"
          : label === "no change"
            ? "none"
            : "unknown";
      expect(deltaDirection(from, to), label).toBe(expected);
    }
  });
});
