import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import about from "@/content/legal/about.json";
import guidesIndex from "@/content/guides.json";
import { DISCORD_PRESETS } from "@/lib/presets/discord";
import {
  GUIDE_ROUTES,
  guideToolRoutes,
  getRoute,
  isLive,
} from "@/lib/tools/registry";
import { guideContent, guideIndexContent, type GuideContent } from "./guide";
import { GUIDE_CONTENT } from "./guides-content";

/**
 * The mechanical half of the copy audit for the guides.
 *
 * These pages carry the load the tool pages cannot: they are the evidence that
 * this site is something other than fourteen near-identical utility pages, which
 * is the shape an ad network rejects. A guide that quietly became four
 * paragraphs, or that shares a paragraph with another page, defeats the purpose
 * of having written it — and neither failure is visible on the page itself.
 */

const PAGES: readonly GuideContent[] = GUIDE_ROUTES.map(
  (guide) => GUIDE_CONTENT[guide.slug],
);

/** Every string of prose in one page — lead, summary, headings and paragraphs. */
function proseOf(page: GuideContent): string[] {
  return [
    page.lead,
    page.summary,
    ...page.sections.flatMap((section) => [
      section.heading,
      ...section.paragraphs,
    ]),
  ];
}

function wordsIn(page: GuideContent): number {
  return proseOf(page).join(" ").trim().split(/\s+/).length;
}

function proseOfSlug(slug: string): string {
  return proseOf(GUIDE_CONTENT[slug]).join(" ");
}

describe("the guide content files", () => {
  it("all validate against the schema", () => {
    for (const guide of GUIDE_ROUTES) {
      expect(() =>
        guideContent(GUIDE_CONTENT[guide.slug], guide.slug),
      ).not.toThrow();
    }
  });

  it("has one file per registered guide and no orphans", () => {
    const onDisk = readdirSync(
      new URL("../../content/guides", import.meta.url),
    ).map((name) => name.replace(/\.json$/, ""));

    expect(onDisk.sort()).toEqual(GUIDE_ROUTES.map((g) => g.slug).sort());
  });

  it("has a valid hub", () => {
    expect(() => guideIndexContent(guidesIndex)).not.toThrow();
  });
});

/**
 * The validator's negative cases. Without these the loader is decoration — it
 * would be equally green with every check inside it deleted, and the failure it
 * prevents is a headline over white space, which nothing else detects.
 */
describe("the guide content validator", () => {
  const sample = GUIDE_CONTENT[GUIDE_ROUTES[0].slug];

  it("rejects a slug that does not match the route", () => {
    expect(() => guideContent(sample, "something-else")).toThrow(
      /does not match/,
    );
  });

  it("rejects a file with no sections", () => {
    expect(() =>
      guideContent({ ...sample, sections: [] }, sample.slug),
    ).toThrow(/no sections/);
  });

  it("rejects a missing summary", () => {
    // Blanked rather than deleted: the validator checks for a non-empty string,
    // so an empty one exercises the same branch without a discarded binding.
    expect(() => guideContent({ ...sample, summary: "" }, sample.slug)).toThrow(
      /summary/,
    );
  });

  it("rejects an updated date that is not ISO", () => {
    expect(() =>
      guideContent({ ...sample, updated: "10 Aug 2026" }, sample.slug),
    ).toThrow(/expected YYYY-MM-DD/);
  });

  it("rejects a heading at an outline level the renderer cannot emit", () => {
    const broken = {
      ...sample,
      sections: [{ heading: "H", level: 4, paragraphs: ["p"] }],
    };
    expect(() => guideContent(broken, sample.slug)).toThrow(/expected 2 or 3/);
  });

  it("rejects a hub with no closing paragraphs", () => {
    expect(() => guideIndexContent({ ...guidesIndex, closing: [] })).toThrow(
      /closing/,
    );
  });
});

describe("the anti-template guard", () => {
  it("shares no paragraph with another guide, a tool page or a policy", () => {
    // The whole point of writing these by hand is that no two of them are the
    // same page with nouns swapped. That is only visible in comparison, which is
    // what this does and a reader will not.
    //
    // It catches copy-paste, not paraphrase. That is the honest limit of a
    // mechanical check.
    const seen = new Map<string, string>();

    const register = (owner: string, strings: readonly string[]) => {
      for (const paragraph of strings) {
        const key = paragraph.toLowerCase().replace(/\s+/g, " ").trim();
        // Headings and short labels are allowed to repeat; paragraphs are not.
        if (key.split(" ").length < 8) continue;
        const previous = seen.get(key);
        expect(
          previous,
          `"${paragraph.slice(0, 60)}…" appears in both ${previous} and ${owner}`,
        ).toBeUndefined();
        seen.set(key, owner);
      }
    };

    for (const page of PAGES) register(page.slug, proseOf(page));
    // One page from the policy set, as a canary for the likeliest cross-corpus
    // copy-paste: the "what happens to your file" guide and the About page make
    // the same argument, and the temptation to reuse a paragraph between them is
    // real. `legal.test.ts` owns the policy set's own comparison.
    register("about", [
      about.lead,
      ...about.sections.flatMap((s) => s.paragraphs),
    ]);
    register("guides-hub", [guidesIndex.lead, ...guidesIndex.closing]);
  });

  it("keeps every guide above its length floor", () => {
    // Floors, not targets. A guide is the evidence that this site has content on
    // it, and a 250-word page is not evidence of anything.
    for (const page of PAGES) {
      expect(
        wordsIn(page),
        `${page.slug} is too short to be worth indexing`,
      ).toBeGreaterThanOrEqual(700);
    }
  });

  it("gives every guide its own summary, distinct from its meta description", () => {
    const summaries = PAGES.map((page) => page.summary);
    expect(new Set(summaries).size).toBe(summaries.length);
    for (const page of PAGES) {
      expect(page.summary, `${page.slug} reuses its meta description`).not.toBe(
        page.meta.description,
      );
    }
  });

  it("dates every guide in the past", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const page of PAGES) {
      expect(page.updated <= today, `${page.slug} is dated in the future`).toBe(
        true,
      );
    }
  });
});

describe("the guides' outbound links", () => {
  it("points every tool link at a route that exists", () => {
    for (const guide of GUIDE_ROUTES) {
      for (const slug of guide.tools) {
        expect(getRoute(slug), `${guide.slug} links to "${slug}"`).toBeDefined();
      }
    }
  });

  it("leaves every guide with at least one live tool to send a reader to", () => {
    // A guide that explains a problem and then offers nothing is a dead end, and
    // these are the pages a stranger arrives on. The registry filters unshipped
    // routes out, so this fails if a guide's whole list is still `planned`.
    for (const guide of GUIDE_ROUTES) {
      expect(
        guideToolRoutes(guide.slug).length,
        `${guide.slug} has no live tool link`,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps the tool links live rather than merely defined", () => {
    for (const guide of GUIDE_ROUTES) {
      for (const slug of guide.tools) {
        const route = getRoute(slug);
        expect(route && isLive(route), `${guide.slug} → ${slug} is not live`).toBe(
          true,
        );
      }
    }
  });
});

/**
 * The Discord guide is the one page here that repeats figures which live in
 * code. The table itself is generated from `presets/discord.ts` and cannot
 * drift; the prose around it can, and these are the assertions that stop it.
 */
describe("the Discord limits guide", () => {
  const SLUG = "discord-image-size-limits";
  const prose = proseOfSlug(SLUG);

  it("states every published byte ceiling exactly as Discord writes it", () => {
    // Binary KB, matching the support articles — not `formatBytes()`, which is
    // decimal and would render 256 KB as 262 KB. See `discord-limits-table.tsx`.
    for (const preset of DISCORD_PRESETS) {
      if (preset.byteLimit === null) continue;
      const stated = `${Math.round(preset.byteLimit / 1024)} KB`;
      expect(prose, `the guide never states ${preset.id}'s ${stated}`).toContain(
        stated,
      );
    }
  });

  it("states every canvas size", () => {
    for (const preset of DISCORD_PRESETS) {
      expect(prose).toContain(`${preset.width}×${preset.height}`);
    }
  });

  it("says outright that a surface has no published limit, for each one", () => {
    const unpublished = DISCORD_PRESETS.filter(
      (preset) => preset.byteLimit === null,
    ).length;
    const said = prose.match(/no published file-size limit/g)?.length ?? 0;
    expect(
      said,
      "a surface with no published byte cap is not saying so",
    ).toBeGreaterThanOrEqual(unpublished);
  });

  it("only ever names the retired banner figure as the mistake", () => {
    // 680×240 matches no Discord surface. It was in this project's own design
    // guidelines and in the wireframe, and it is the most repeated wrong number
    // in this subject area — which is most of why the guide exists, so banning
    // the string outright would ban the correction along with the error.
    //
    // The invariant is therefore about context, not presence: every paragraph
    // that names the figure must also say it is wrong. A future edit that
    // reinstates it as a fact lands in a paragraph with no such marker, which is
    // exactly the change this needs to catch.
    const REFUTES = /matches no Discord surface|letterboxes/;
    const mentions = proseOf(GUIDE_CONTENT[SLUG]).filter((paragraph) =>
      /680\s*[×x]\s*240/.test(paragraph),
    );

    expect(mentions.length, "the correction has been dropped").toBeGreaterThan(
      0,
    );
    for (const paragraph of mentions) {
      expect(
        paragraph,
        `"${paragraph.slice(0, 60)}…" states 680×240 without refuting it`,
      ).toMatch(REFUTES);
    }
  });

  it("states the sticker's length and frame-rate caps, which most guides omit", () => {
    const sticker = DISCORD_PRESETS.find((preset) => preset.id === "sticker")!;
    expect(prose).toContain(`${sticker.maxDurationSec} seconds`);
    expect(prose).toContain(`${sticker.maxFps} frames per second`);
  });
});
