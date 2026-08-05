import { describe, expect, it } from "vitest";
import {
  ALL_ROUTES,
  PRESET_ROUTES,
  TOOLS,
  getRoute,
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

  it("declares at least one input and one output format per route", () => {
    for (const route of ALL_ROUTES) {
      expect(route.inputFormats.length, route.slug).toBeGreaterThan(0);
      expect(route.outputFormats.length, route.slug).toBeGreaterThan(0);
    }
  });
});
