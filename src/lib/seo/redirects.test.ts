import { describe, expect, it } from "vitest";
import { ALL_ROUTES, liveRoutes } from "@/lib/tools/registry";
import { TOOL_RENAMES, toolRedirects } from "./redirects";

/**
 * The invariant `redirects.ts` documents but could not enforce on its own.
 *
 * A rename adds `{ from, to }`. Two ways to get it wrong are both silent in
 * production and both undo the reason redirects exist:
 *
 *  - `from` equal to a slug that is still live would 308 a real page away — the
 *    opposite of preserving it. The list is empty today, so this guards the
 *    first entry anyone adds rather than anything shipping now.
 *  - `to` pointing at a slug with no live route sends every preserved link to a
 *    404, losing exactly the ranking signal the redirect was meant to carry.
 *
 * Vacuously green while `TOOL_RENAMES` is empty, which is the point: the invariant
 * is locked in before the list is non-empty, not discovered after a bad rename
 * ships.
 */
describe("tool redirects", () => {
  const liveSlugs = new Set(liveRoutes().map((route) => route.slug));
  const knownSlugs = new Set(ALL_ROUTES.map((route) => route.slug));

  it("never redirects away from a slug a live route still uses", () => {
    for (const { from } of TOOL_RENAMES) {
      expect(
        liveSlugs.has(from),
        `redirect source /${from} shadows a live page`,
      ).toBe(false);
    }
  });

  it("redirects to a slug that a live route actually serves", () => {
    for (const { to } of TOOL_RENAMES) {
      expect(
        liveSlugs.has(to),
        `redirect target /${to} is not a live route`,
      ).toBe(true);
    }
  });

  it("never redirects a slug to itself", () => {
    for (const { from, to } of TOOL_RENAMES) {
      expect(from, "a redirect from a slug to itself is a loop").not.toBe(to);
    }
  });

  it("names a retired slug, not one the registry never knew", () => {
    // A `from` that was never a real route is dead config: harmless, but it means
    // the rename it claims to record never happened, so flag it.
    for (const { from } of TOOL_RENAMES) {
      expect(
        knownSlugs.has(from),
        `redirect source /${from} was never a registered route`,
      ).toBe(true);
    }
  });

  it("expands each rename into a permanent (308) redirect", () => {
    const redirects = toolRedirects();
    expect(redirects).toHaveLength(TOOL_RENAMES.length);
    for (const redirect of redirects) {
      expect(redirect.permanent).toBe(true);
      expect(redirect.source.startsWith("/")).toBe(true);
      expect(redirect.destination.startsWith("/")).toBe(true);
    }
  });
});
