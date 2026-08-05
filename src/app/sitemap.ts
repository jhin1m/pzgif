import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

/**
 * Day-one sitemap.
 *
 * It lists only routes that actually exist. A sitemap advertising the 14 tool
 * URLs before they are built would hand Google a page of 404s on the first
 * crawl, which is a worse first impression than a one-URL sitemap.
 *
 * Phase 9 owns the real SEO machinery and will generate this from
 * `src/lib/tools/registry.ts` as each tool ships.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
