import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_ROUTES,
  PRESET_ROUTES,
  TOOLS,
  chainTargets,
  getRoute,
  isLive,
  liveRoutes,
  relatedLiveRoutes,
  relatedRoutes,
} from "./registry";

describe("tool registry", () => {
  it("ships exactly 9 tools and 5 Discord routes", () => {
    // Scope is fixed by the plan: `GIF → WebP` and the Slack preset are cut.
    expect(TOOLS).toHaveLength(9);
    expect(PRESET_ROUTES).toHaveLength(5);
  });

  it("has exactly one preset hub", () => {
    expect(PRESET_ROUTES.filter((route) => route.isHub)).toHaveLength(1);
  });

  it("has unique slugs", () => {
    const slugs = ALL_ROUTES.map((route) => route.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses lower-case kebab slugs so URLs stay stable", () => {
    for (const route of ALL_ROUTES) {
      expect(route.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("never lists a related tool that does not exist", () => {
    for (const route of ALL_ROUTES) {
      for (const slug of route.related) {
        expect(getRoute(slug), `${route.slug} → ${slug}`).toBeDefined();
      }
    }
  });

  it("never relates a tool to itself", () => {
    for (const route of ALL_ROUTES) {
      expect(route.related).not.toContain(route.slug);
    }
  });

  it("resolves related slugs to definitions in declared order", () => {
    const related = relatedRoutes("gif-compressor");
    expect(related.map((route) => route.slug)).toEqual([
      "resize-gif",
      "gif-speed-changer",
      "gif-for-discord",
    ]);
  });

  it("treats a route as unbuilt unless it says otherwise", () => {
    // The default has to be the safe one. A route that ships without anyone
    // remembering to mark it planned is a 404 in the sitemap; a route that
    // ships without anyone remembering to mark it live is merely invisible.
    for (const route of ALL_ROUTES) {
      if (route.status === undefined) expect(isLive(route)).toBe(false);
    }
  });

  it("only exposes routes that have a page behind them", () => {
    // Anything listed here is a URL a crawler will follow, so this set must
    // never run ahead of what is built. Asserted against the file tree rather
    // than a hand-maintained list: the failure this guards against is marking a
    // route live and forgetting to build it, and a list that has to be edited
    // in the same commit as the mistake cannot catch it.
    for (const route of liveRoutes()) {
      const page = join(
        process.cwd(),
        "src",
        "app",
        "[locale]",
        route.slug,
        "page.tsx",
      );
      expect(existsSync(page), `${route.slug} is live with no page`).toBe(true);
    }
  });

  it("never offers an unbuilt tool in the related block", () => {
    // This used to assert that the filter actually removed something, using
    // `gif-compressor`'s link to the then-unbuilt Discord hub as the specimen.
    // Phase 8 shipped that hub, so every route in the registry is now live and
    // the filter legitimately removes nothing — an inequality there would fail
    // for the best possible reason, which is not a useful test.
    //
    // What still has to hold is the property itself, asserted across every
    // route rather than one. The next `planned` route added to this file is
    // covered by it without anyone remembering to come back here.
    for (const route of ALL_ROUTES) {
      const live = relatedLiveRoutes(route.slug);
      expect(live.length).toBeLessThanOrEqual(relatedRoutes(route.slug).length);
      for (const related of live) {
        expect(isLive(related), `${route.slug} → ${related.slug}`).toBe(true);
      }
    }
  });

  it("declares at least one input and one output format per route", () => {
    for (const route of ALL_ROUTES) {
      expect(route.inputFormats.length, route.slug).toBeGreaterThan(0);
      expect(route.outputFormats.length, route.slug).toBeGreaterThan(0);
    }
  });
});

describe("chainTargets", () => {
  it("keeps every related live route that accepts the produced format", () => {
    // The case that exists today: GIF in, GIF out, nothing dropped.
    expect(chainTargets("gif-compressor", "gif").map((r) => r.slug)).toEqual(
      relatedLiveRoutes("gif-compressor").map((r) => r.slug),
    );
  });

  it("drops a destination that cannot decode what was produced", () => {
    // `split-gif-to-frames` will produce these. Handing a PNG or a ZIP to a
    // GIF-only editor is the dead end the filter exists to prevent, and it has
    // to be closed before the tool that would expose it ships.
    expect(chainTargets("gif-compressor", "png")).toEqual([]);
    expect(chainTargets("gif-compressor", "zip")).toEqual([]);
  });

  it("preserves the author's order from `related`", () => {
    // `gif-speed-changer` lists three, and the order is an editorial decision.
    expect(chainTargets("gif-speed-changer", "gif").map((r) => r.slug)).toEqual(
      ["reverse-gif", "gif-compressor", "resize-gif"],
    );
  });

  it("never offers a route with no page behind it", () => {
    for (const route of liveRoutes()) {
      for (const target of chainTargets(route.slug, "gif")) {
        expect(isLive(target), target.slug).toBe(true);
      }
    }
  });

  it("never offers the source tool itself", () => {
    for (const route of liveRoutes()) {
      expect(chainTargets(route.slug, "gif").map((r) => r.slug)).not.toContain(
        route.slug,
      );
    }
  });

  it("returns nothing for a slug the registry does not know", () => {
    expect(chainTargets("not-a-tool", "gif")).toEqual([]);
  });
});
