import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/**
 * The Cloudflare adapter's configuration.
 *
 * `incrementalCache` is not optional here, and the reason is worth writing down
 * because the obvious reading of it is wrong. "This app has no ISR, so it needs
 * no cache" produces a Worker that 404s **every page** — measured, not guessed.
 * Under OpenNext the incremental cache is not an optimisation layered over
 * prerendered pages; it is where prerendered pages *live*. `next build` writes
 * them into it, and the router reads them back out. With no store configured
 * there is nothing to read, so only the route handlers outside the cache
 * (`robots.txt`, `sitemap.xml`) answer.
 *
 * The static-assets store is the one that fits: read-only, populated at build
 * time, served straight from the ASSETS binding. It cannot revalidate — which
 * costs nothing here, since there is no server data to revalidate and
 * `pnpm check:static` fails the build if a route ever stops being static. The R2
 * and KV stores in the adapter's docs buy revalidation this app would never use,
 * at the price of a bucket, a binding and a bill.
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
