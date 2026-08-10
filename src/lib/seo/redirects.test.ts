import { describe, expect, it } from "vitest";
import { liveRoutes } from "@/lib/tools/registry";
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

  // Note: a retired `from` is deliberately NOT required to be in `ALL_ROUTES`.
  // The documented rename workflow moves the registry entry to the new slug, so
  // the old slug leaves the registry entirely — that is the point, since
  // `routesInGroup()` renders `ALL_ROUTES` into the header and footer and a
  // lingering entry would keep advertising the dead URL instead of only
  // redirecting from it. `from` must be absent from live routes, nothing more.

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
