import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";
import { liveRoutes } from "@/lib/tools/registry";

/**
 * The sitemap.
 *
 * It lists only routes that actually exist — the ones the registry marks
 * `status: "live"`. The plan ships in five stages, so for most of the build the
 * registry describes more routes than are built; advertising the unbuilt ones
 * would hand Google a page of 404s on the first crawl of a domain whose entire
 * strategy is index age. A tool's status flips when its page lands, and that is
 * the single edit that adds it here, to the related-tools blocks, and to nothing
 * else by accident.
 *
 * Phase 9 owns the rest of the SEO machinery — `lastModified` from the content
 * files, and the non-tool content pages.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...liveRoutes().map((route) => ({
      url: `${SITE_URL}/${route.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
