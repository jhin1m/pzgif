import { describe, expect, it } from "vitest";
import compressor from "@/content/gif-compressor.json";
import gifToMp4 from "@/content/gif-to-mp4.json";
import mp4ToGif from "@/content/mp4-to-gif.json";
import splitFrames from "@/content/split-gif-to-frames.json";
import webpToGif from "@/content/webp-to-gif.json";
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
  toolContent(mp4ToGif, "mp4-to-gif"),
  toolContent(gifToMp4, "gif-to-mp4"),
  toolContent(splitFrames, "split-gif-to-frames"),
  toolContent(webpToGif, "webp-to-gif"),
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
        // `notes` too. It is prose that a visitor reads, it lives in the same
        // content file, and it was invisible to this check until Phase 7 added
        // it — which is exactly how a shared line gets in.
        ...Object.values(page.notes ?? {}),
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

  it("carries a card benefit for the homepage grid", () => {
    for (const page of PAGES) {
      expect(page.card?.benefit, page.slug).toBeTruthy();
      // Long enough to say something, short enough to sit under a card title.
      expect(page.card.benefit.length, page.slug).toBeGreaterThan(30);
      expect(page.card.benefit.length, page.slug).toBeLessThan(140);
    }
  });

  it("writes card benefits that are not noun-swaps of each other", () => {
    // The failure this catches is one line rewritten five times with the verb
    // changed. Vocabulary overlap is the measurable symptom: two lines about
    // genuinely different operations do not reach for the same words, while a
    // swapped template reuses everything except the noun.
    //
    // The threshold is tuned against the five real lines, not guessed. Resize
    // and crop are the closest legitimate pair — both are about dimensions —
    // and the point is to leave them room while still catching a template.
    const STOP = new Set([
      "a", "an", "and", "are", "at", "by", "for", "in", "is", "it", "its", "of",
      "on", "or", "over", "the", "them", "to", "which", "with", "you", "your",
    ]);
    const vocabulary = (line: string) =>
      new Set(
        line
          .toLowerCase()
          .split(/[^a-z]+/)
          .filter((word) => word.length > 2 && !STOP.has(word)),
      );

    for (const left of PAGES) {
      for (const right of PAGES) {
        if (left.slug >= right.slug) continue;
        const a = vocabulary(left.card.benefit);
        const b = vocabulary(right.card.benefit);
        const shared = [...a].filter((word) => b.has(word));
        const overlap = shared.length / Math.min(a.size, b.size);
        expect(
          overlap,
          `${left.slug} and ${right.slug} share ${shared.join(", ")}`,
        ).toBeLessThan(0.4);
      }
    }
  });

  it("keeps every unmeasured percentage and multiplier out of a card benefit", () => {
    // A card is the highest-traffic sentence a tool has and the easiest place
    // for "up to 80% smaller" to reappear. No figure may be stated here at all:
    // there is no room on a card for the fixture and the hardware that would
    // make one true, and a figure without those is the wireframe's defect.
    for (const page of PAGES) {
      expect(page.card.benefit, page.slug).not.toMatch(/\d+\s*%/);
      expect(page.card.benefit, page.slug).not.toMatch(/\d+\s*[x×]/i);
    }
  });

  it("promises three concrete things in the empty result panel", () => {
    for (const page of PAGES) {
      expect(page.result?.emptyRows?.length, page.slug).toBe(3);
      for (const row of page.result.emptyRows) {
        expect(row.length, `${page.slug}: "${row}"`).toBeGreaterThan(20);
      }
      // The rows describe *this* tool's output. Sharing one with another tool
      // is the same template failure the paragraph check catches upstream.
      expect(new Set(page.result.emptyRows).size, page.slug).toBe(3);
    }
  });

  it("shares no empty-panel row between tools", () => {
    const seen = new Map<string, string>();
    for (const page of PAGES) {
      for (const row of page.result.emptyRows) {
        const key = row.trim().toLowerCase();
        expect(
          seen.has(key),
          `"${row}" also appears in ${seen.get(key)}`,
        ).toBe(false);
        seen.set(key, page.slug);
      }
    }
  });

  it("interpolates the saved bytes rather than naming a figure", () => {
    // `{saved}` is filled from the real blobs at render time. A hard number here
    // would be a claim about a file the writer never saw.
    for (const page of PAGES) {
      expect(page.result.savedLine, page.slug).toContain("{saved}");
      expect(page.result.savedLine, page.slug).not.toMatch(/\d/);
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
