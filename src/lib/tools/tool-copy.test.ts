import { describe, expect, it } from "vitest";
import compressor from "@/content/gif-compressor.json";
import crop from "@/content/crop-gif.json";
import resize from "@/content/resize-gif.json";
import reverse from "@/content/reverse-gif.json";
import speed from "@/content/gif-speed-changer.json";
import { wordCount } from "@/components/content/inline-copy";
import { toolContent, type ToolContent } from "./content";
import { getRoute, liveRoutes } from "./registry";

/**
 * The rules that apply to *every* tool page's copy, checked across all of them
 * at once.
 *
 * The reason this is one file rather than a per-tool test: the failure it exists
 * to catch — near-identical pages differing only by substituted nouns — is
 * invisible when each page is inspected alone. Google's scaled-content-abuse
 * penalty is site-wide, so the assertion has to be site-wide too.
 */

const PAGES: readonly ToolContent[] = [
  toolContent(compressor, "gif-compressor"),
  toolContent(resize, "resize-gif"),
  toolContent(crop, "crop-gif"),
  toolContent(speed, "gif-speed-changer"),
  toolContent(reverse, "reverse-gif"),
];

describe("every live tool page", () => {
  it("has a content file", () => {
    const written = new Set(PAGES.map((page) => page.slug));
    for (const route of liveRoutes()) {
      expect(written.has(route.slug), `${route.slug} has no copy`).toBe(true);
    }
  });

  it("carries at least 400 hand-written explainer words", () => {
    for (const page of PAGES) {
      const total = page.explainer.reduce(
        (sum, section) => sum + wordCount(section.paragraphs),
        0,
      );
      expect(total, page.slug).toBeGreaterThanOrEqual(400);
    }
  });

  it("opens its h1 with the tool's own name", () => {
    // The exact-match target keyword leads the heading. A page whose h1 starts
    // with anything else is competing for a query it was not written for.
    for (const page of PAGES) {
      const route = getRoute(page.slug);
      expect(route, page.slug).toBeDefined();
      expect(page.title.toLowerCase()).toContain(route!.name.toLowerCase());
      expect(
        page.title.toLowerCase().startsWith(route!.name.toLowerCase()),
        page.title,
      ).toBe(true);
    }
  });

  it("shares no paragraph with any other page", () => {
    // This is the whole test. Two tools whose copy differs only by substituted
    // nouns is what a filled template looks like from the outside, and one
    // shared paragraph is the first symptom.
    const seen = new Map<string, string>();
    for (const page of PAGES) {
      const prose = [
        ...page.explainer.flatMap((section) => section.paragraphs),
        ...page.faq.flatMap((entry) => entry.answer),
      ];
      for (const paragraph of prose) {
        const key = paragraph.trim().toLowerCase();
        expect(
          seen.has(key),
          `"${paragraph.slice(0, 60)}…" also appears in ${seen.get(key)}`,
        ).toBe(false);
        seen.set(key, page.slug);
      }
    }
  });

  it("gives every FAQ entry a stable, unique id", () => {
    for (const page of PAGES) {
      const ids = page.faq.map((entry) => entry.id);
      expect(new Set(ids).size, page.slug).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("writes a blurb for every related tool it names", () => {
    for (const page of PAGES) {
      for (const [slug, blurb] of Object.entries(page.related)) {
        expect(getRoute(slug), `${page.slug} → ${slug}`).toBeDefined();
        expect(blurb.length, `${page.slug} → ${slug}`).toBeGreaterThan(20);
      }
    }
  });

  it("makes no unverified claim about size, speed or duration", () => {
    // The three defects `plan.md` records in the wireframe copy. They are
    // asserted per page rather than once, because the next page to be written
    // is where they come back.
    for (const page of PAGES) {
      const prose = JSON.stringify(page);
      expect(prose, page.slug).not.toMatch(/\d+\s*MB (on|limit)/i);
      expect(prose, page.slug).not.toMatch(/\d{2}\s*[-–]\s*\d{2}\s*%/);
      expect(prose, page.slug).not.toMatch(
        /\b(instant|instantly|in seconds|under \w+ seconds)\b/i,
      );
    }
  });
});
