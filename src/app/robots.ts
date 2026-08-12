import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

/**
 * robots.txt.
 *
 * ── What is disallowed, and why it is belt-and-braces ───────────────────────
 * `/dev/states` and `/__bench` are `page.dev.tsx` files, and `pageExtensions` in
 * `next.config.ts` only recognises that suffix when `PZGIF_ENABLE_DEV_ROUTES` or
 * `PZGIF_ENABLE_BENCH` is set. An ordinary production build therefore does not
 * contain those routes at all — they are not unlinked pages, they do not exist —
 * and both also carry `robots: { index: false }` in their own metadata.
 *
 * So these two lines are the third layer, not the first. They are here because
 * the failure they guard against is a build shipped with the flag accidentally
 * set, and in that scenario the page's own `noindex` is the only remaining
 * defence and this file is free. A disallow for a path that does not resolve
 * costs a crawler nothing.
 *
 * ── What is deliberately not disallowed ─────────────────────────────────────
 * There are no result URLs to exclude. A finished file is an in-memory blob
 * addressed by an object URL scoped to the tab that created it; nothing about a
 * job is ever reachable at an HTTP address, so there is no URL shape a crawler
 * could reach even if it tried. The phase plan lists result URLs alongside the
 * dev routes because it was written before the engine settled that question.
 *
 * `/_next/` is left crawlable on purpose. Blocking it stops Googlebot fetching
 * the JavaScript and CSS it needs to render the page, and a page Google cannot
 * render is a page it cannot judge — a far larger cost than any crawl budget
 * saved on chunk files it discards anyway.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dev/", "/__bench"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
