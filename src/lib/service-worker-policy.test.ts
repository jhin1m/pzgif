import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The service worker's caching policy, enforced mechanically.
 *
 * These are not style rules. Each one encodes a failure that has actually
 * happened in this repository or that the privacy copy depends on, and each is
 * invisible in development — a service worker only misbehaves on the *second*
 * request, in a build, in a browser that has already installed it.
 */

const SW = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

describe("service worker", () => {
  it("never serves a worker script from the cache", () => {
    /**
     * The bug this exists to prevent, in full, because it cost a day:
     *
     * Turbopack ships **one** shared worker bootstrap file and identifies each
     * worker purely by the URL **fragment** — `turbopack-worker-<hash>.js`
     * followed by `#params=[[…chunk list]]`. The Cache API keys on the
     * fragment-stripped URL, so every worker in the app collapses onto a single
     * cache entry.
     *
     * The pipeline worker is requested first, misses, and fills that entry from
     * the network. The encode worker is requested seconds later, hits it, and is
     * handed a response whose URL carries no fragment. It boots with an empty
     * chunk list, registers no message handler, and then does nothing at all —
     * no error, no message. The job stalls until the hang watchdog fires and
     * reports `encode-failed`, so the whole media engine is silently dead for
     * every visitor who has the service worker installed.
     */
    expect(SW).toMatch(/request\.destination === "worker"/);
    expect(SW).toMatch(/request\.destination === "sharedworker"/);

    // The bypass has to come before any branch that answers the request, or it
    // never runs. Compared against the `respondWith` call site rather than the
    // helper's own definition, which sits above the fetch handler.
    const bypass = SW.indexOf('request.destination === "worker"');
    const firstRespondWith = SW.indexOf("event.respondWith(");
    expect(bypass).toBeGreaterThan(-1);
    expect(firstRespondWith).toBeGreaterThan(-1);
    expect(bypass).toBeLessThan(firstRespondWith);
  });

  it("falls back to the shell only for real navigations", () => {
    // A subresource answered with the app shell is HTML where the caller wanted
    // a script or an image, and it fails in whatever way that caller happens to
    // fail — usually silently.
    expect(SW).toMatch(/fallbackToShell:\s*request\.mode === "navigate"/);
  });

  it("never caches an ad, consent or analytics endpoint", () => {
    // The privacy claim is the product's strongest differentiator; a cached
    // tracker would quietly falsify it.
    for (const host of [
      "googlesyndication",
      "doubleclick",
      "googletagmanager",
      "google-analytics",
    ]) {
      expect(SW, host).toContain(host);
    }
  });

  it("bumps the cache name when the policy changes", () => {
    // Existing visitors carry the old cache until a new name evicts it on
    // activate, so a policy fix that keeps the old name does not reach the
    // people it was written for.
    expect(SW).toMatch(/const CACHE = "pzgif-shell-v[2-9]\d*"/);
  });
});
