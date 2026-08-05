#!/usr/bin/env node
/**
 * Fails the build when any app route is not statically prerendered.
 *
 * Every page here is a static shell; all real work happens client-side. A route
 * that quietly turns dynamic costs the CDN cache, the LCP and — because Core Web
 * Vitals is a ranking input for this product — the traffic the whole business
 * depends on. That regression is invisible in a diff, so it is asserted here.
 *
 * Run AFTER `next build`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const BUILD_DIR = join(process.cwd(), ".next");

function readManifest(name) {
  try {
    return JSON.parse(readFileSync(join(BUILD_DIR, name), "utf8"));
  } catch (error) {
    console.error(`Could not read ${name}. Run \`pnpm build\` first.`);
    console.error(String(error));
    process.exit(1);
  }
}

const appRoutes = readManifest("app-path-routes-manifest.json");
const prerender = readManifest("prerender-manifest.json");

/** Routes Next never prerenders, and which carry no SEO value. */
const EXEMPT = new Set([
  "/_not-found",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

/**
 * A `dynamicRoutes` entry only counts as fully static when its fallback is
 * `false`. With the Next default (`dynamicParams: true`, fallback not `false`) a
 * route with `generateStaticParams()` prerenders the listed params and then
 * **server-renders every other param on demand**. That route reports as "static"
 * in the build summary while any unlisted slug is CDN-uncacheable and unbounded
 * — which is precisely the regression this guard exists to catch, so it is
 * checked rather than assumed.
 */
const fullyStaticDynamicRoutes = Object.entries(
  prerender.dynamicRoutes ?? {},
).filter(([, route]) => route.fallback === false);

const openFallbackRoutes = Object.entries(prerender.dynamicRoutes ?? {})
  .filter(([, route]) => route.fallback !== false)
  .map(([urlPath]) => urlPath);

const prerendered = new Set([
  ...fullyStaticDynamicRoutes.map(([urlPath]) => urlPath),
  ...Object.keys(prerender.routes ?? {}),
  // A concrete prerendered URL proves its source route was rendered at build
  // time — but not that EVERY param was. An open fallback is subtracted below,
  // otherwise one prerendered slug would vouch for all the unlisted ones.
  ...Object.values(prerender.routes ?? {})
    .map((route) => route.srcRoute)
    .filter(Boolean),
]);

for (const urlPath of openFallbackRoutes) prerendered.delete(urlPath);

const pageRoutes = Object.entries(appRoutes)
  // Route handlers (app/**/route.ts) are not pages.
  .filter(([appPath]) => !appPath.endsWith("/route"))
  .map(([, urlPath]) => urlPath)
  .filter((urlPath) => !EXEMPT.has(urlPath));

if (pageRoutes.length === 0) {
  console.error(
    "Found no page routes to check. That means the manifest is stale or the" +
      "\nbuild produced nothing — either way this guard must not report success.",
  );
  process.exit(1);
}

const notStatic = pageRoutes.filter((urlPath) => !prerendered.has(urlPath));

if (notStatic.length > 0) {
  console.error("These routes are not statically prerendered:\n");
  for (const route of notStatic) {
    console.error(`  ${route}`);
    if (openFallbackRoutes.includes(route)) {
      console.error(
        "    generateStaticParams() is present but the fallback is open, so any" +
          "\n    unlisted param server-renders on demand. Set `dynamicParams = false`.",
      );
    }
  }
  console.error(
    "\nEvery page must be a static shell. A route usually turns dynamic because it" +
      "\nreads cookies/headers, or because a layout forgot `setRequestLocale()`.",
  );
  process.exit(1);
}

console.log(
  `All ${pageRoutes.length} page route(s) are statically prerendered.`,
);
