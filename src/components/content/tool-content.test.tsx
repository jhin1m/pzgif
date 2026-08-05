import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import content from "@/content/gif-compressor.json";
import { toolContent } from "@/lib/tools/content";
import { InlineCopy, wordCount } from "./inline-copy";
import { adBoundary } from "./tool-explainer";

/**
 * The content layer's two invariants: the copy is real, and the ad lands where
 * §8.1 puts it.
 *
 * The prose itself is not asserted word for word — that would make every edit a
 * test failure. What is asserted is the set of properties a reviewer would
 * otherwise have to re-check by hand on all fourteen pages, and the specific
 * defects `plan.md` records in the wireframe that this copy exists to correct.
 */

const compressor = toolContent(content, "gif-compressor");

describe("InlineCopy", () => {
  it("emits real emphasis rather than markup in a text node", () => {
    const markup = renderToStaticMarkup(<InlineCopy text="**Width.** Halve it." />);
    expect(markup).toContain("<strong");
    expect(markup).toContain("Width.");
    expect(markup).toContain("Halve it.");
  });

  it("leaves an unterminated marker as literal text", () => {
    // A typo in copy should read as a typo, not embolden the rest of the page.
    const markup = renderToStaticMarkup(<InlineCopy text="a **b c" />);
    expect(markup).not.toContain("<strong");
    expect(markup).toContain("a **b c");
  });

  it("escapes anything that looks like a tag", () => {
    const markup = renderToStaticMarkup(<InlineCopy text="<script>x</script>" />);
    expect(markup).not.toContain("<script>");
  });
});

describe("adBoundary", () => {
  it("places the in-content unit after roughly 150 words", () => {
    const index = adBoundary(compressor.explainer);
    expect(index).toBeGreaterThanOrEqual(0);
    const before = compressor.explainer
      .slice(0, index + 1)
      .reduce((total, section) => total + wordCount(section.paragraphs), 0);
    expect(before).toBeGreaterThanOrEqual(150);
  });

  it("never puts it after the last section", () => {
    // Below the explainer is not inside it, and §8.1 already reserves a unit
    // there. This is the boundary the word count could otherwise walk past.
    expect(adBoundary(compressor.explainer)).toBeLessThan(
      compressor.explainer.length - 1,
    );
  });

  it("suppresses the unit entirely on a short explainer", () => {
    expect(adBoundary([])).toBe(-1);
    expect(
      adBoundary([{ heading: "One", level: 2, paragraphs: ["a ".repeat(400)] }]),
    ).toBe(-1);
  });
});

describe("gif-compressor copy", () => {
  it("carries at least 400 hand-written explainer words", () => {
    const total = compressor.explainer.reduce(
      (sum, section) => sum + wordCount(section.paragraphs),
      0,
    );
    expect(total).toBeGreaterThanOrEqual(400);
  });

  it("repeats no paragraph, which is what a filled template looks like", () => {
    const paragraphs = compressor.explainer.flatMap(
      (section) => section.paragraphs,
    );
    expect(new Set(paragraphs).size).toBe(paragraphs.length);
  });

  it("gives every FAQ entry a stable, unique id", () => {
    const ids = compressor.faq.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("states no input-size limit anywhere", () => {
    // `plan.md` records this as a wireframe defect: "150 MB on desktop, 50 MB on
    // mobile" is contradicted by the memory model, where the binding constraint
    // is decoded frames rather than the compressed file's size.
    const prose = JSON.stringify(compressor);
    expect(prose).not.toMatch(/\d+\s*MB (on|limit)/i);
    expect(prose).not.toMatch(/150\s*MB|50\s*MB/i);
  });

  it("quotes no unverified compression ratio", () => {
    // Phase 1 measured a 22x content-driven spread in bytes per pixel and never
    // measured a GIF-to-GIF reduction corpus. "60-85%" was the wireframe's
    // number and it is not backed by anything.
    expect(JSON.stringify(compressor)).not.toMatch(/\d{2}\s*[-–]\s*\d{2}\s*%/);
  });

  it("never promises a duration, on any device", () => {
    // The fastest measured full job was 3.96 s and the slowest 51.8 s. No copy
    // can know which engine the reader is on. See the Phase 1 copy-risk verdict.
    expect(JSON.stringify(compressor)).not.toMatch(
      /\b(instant|instantly|in seconds|under \w+ seconds)\b/i,
    );
  });

  it("offers the palette options best-first, as the wireframe has them", () => {
    // An object keyed "256"…"32" would be silently reordered to 32, 64, 128,
    // 256 by JavaScript's integer-key rule, putting the worst choice at the top
    // of the menu and the default at the bottom. Hence the array.
    expect(
      compressor.controls.colours.options?.map((option) => option.value),
    ).toEqual(["256", "128", "64", "32"]);
  });

  it("writes a blurb for every related tool it names", () => {
    for (const [slug, blurb] of Object.entries(compressor.related)) {
      expect(blurb.length, slug).toBeGreaterThan(20);
    }
  });
});
