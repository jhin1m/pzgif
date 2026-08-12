import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { GUIDE_CONTENT } from "@/lib/content/guides-content";
import { SITE_URL } from "@/lib/site-config";
import {
  GUIDES_BASE_PATH,
  GUIDE_ROUTES,
  LEGAL_ROUTES,
  guidePath,
  liveRoutes,
} from "@/lib/tools/registry";
import { TOOL_UPDATED } from "@/lib/tools/updated";

/**
 * What the sitemap advertises, and with what dates.
 *
 * Two failures this guards against, both silent. A route that ships without
 * being added here is simply never crawled, and nothing about the site looks
 * wrong. And a `lastModified` that quietly becomes a build timestamp tells a
 * crawler that every page changed on every deploy, then offers nothing changed
 * to find — a negative quality signal on a site whose entire strategy is organic
 * search.
 */

const entries = sitemap();
const urls = entries.map((entry) => entry.url);

describe("the sitemap", () => {
  it("lists the homepage, every live tool, the guides and the policies", () => {
    const expected = [
      SITE_URL,
      ...liveRoutes().map((route) => `${SITE_URL}/${route.slug}`),
      `${SITE_URL}${GUIDES_BASE_PATH}`,
      ...GUIDE_ROUTES.map((guide) => `${SITE_URL}${guidePath(guide.slug)}`),
      ...LEGAL_ROUTES.map((route) => `${SITE_URL}/${route.slug}`),
    ];
    expect(urls.sort()).toEqual(expected.sort());
  });

  it("advertises no URL twice", () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("gives every tool and guide its own content date", () => {
    for (const route of liveRoutes()) {
      const entry = entries.find(
        (candidate) => candidate.url === `${SITE_URL}/${route.slug}`,
      );
      expect(entry?.lastModified, `${route.slug} has no date`).toBe(
        TOOL_UPDATED[route.slug],
      );
    }
    for (const guide of GUIDE_ROUTES) {
      const entry = entries.find(
        (candidate) => candidate.url === `${SITE_URL}${guidePath(guide.slug)}`,
      );
      expect(entry?.lastModified, `${guide.slug} has no date`).toBe(
        GUIDE_CONTENT[guide.slug].updated,
      );
    }
  });

  it("derives no date from the clock", () => {
    // The regression this whole arrangement exists to prevent, and it cannot be
    // caught by looking at the output: on the day a page is genuinely edited, a
    // real content date and a build timestamp are the same string. So the check
    // is on the source — a sitemap that never reads the clock cannot emit one.
    const source = readFileSync(
      new URL("../../app/sitemap.ts", import.meta.url),
      "utf8",
    );
    // Comments are stripped first: this file explains at length why it does not
    // do this, and a guard that trips on its own rationale gets deleted.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code, "sitemap.ts reads the clock").not.toMatch(
      /new Date|Date\.now/,
    );
  });

  it("leaves the homepage undated rather than guessing", () => {
    // It is a composite of the hero copy, the live tool grid and the preset
    // teaser, so no single content file owns its date. Omitting it is the honest
    // answer; `changeFrequency` carries what is actually known.
    const home = entries.find((entry) => entry.url === SITE_URL);
    expect(home?.lastModified).toBeUndefined();
    expect(home?.changeFrequency).toBe("weekly");
  });
});
