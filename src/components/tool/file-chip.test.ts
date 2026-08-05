import { describe, expect, it } from "vitest";
import { middleEllipsis } from "./file-chip";

/**
 * §5.3 specifies middle-ellipsis at 22 characters. The reason it is not
 * end-truncation is the extension: `screen-recording-2026-08-04-final.gif`
 * truncated at the end loses the `.gif`, which is the one part of a filename
 * that says what the file is — and on a page where the wrong format is the most
 * common mistake, that matters.
 */
describe("middleEllipsis", () => {
  it("leaves short names untouched", () => {
    expect(middleEllipsis("loop.gif")).toBe("loop.gif");
    expect(middleEllipsis("exactly-22-chars-long.")).toBe(
      "exactly-22-chars-long.",
    );
  });

  it("keeps the extension visible on a long name", () => {
    const truncated = middleEllipsis(
      "screen-recording-2026-08-04-final-v3-really-final.gif",
    );
    expect(truncated.endsWith(".gif")).toBe(true);
    expect(truncated.startsWith("screen")).toBe(true);
    expect(truncated).toContain("…");
  });

  it("never exceeds the character budget", () => {
    for (const length of [23, 40, 120]) {
      const name = `${"a".repeat(length - 4)}.gif`;
      expect(middleEllipsis(name).length).toBeLessThanOrEqual(22);
    }
  });

  it("honours a custom budget", () => {
    expect(middleEllipsis("abcdefghijklmnop", 9)).toHaveLength(9);
  });

  it("never cuts a multi-byte character in half", () => {
    const truncated = middleEllipsis("🎬🎬🎬🎬🎬🎬🎬🎬🎬🎬🎬🎬🎬🎬🎬-clip.gif");
    // `Array.from` iterates code points, so a lone surrogate — the artefact of
    // slicing through a pair — survives as its own single-unit entry.
    const lone = Array.from(truncated).filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return char.length === 1 && code >= 0xd800 && code <= 0xdfff;
    });
    expect(lone).toEqual([]);
    expect(truncated.endsWith(".gif")).toBe(true);
  });
});
