import type { MetadataRoute } from "next";
import about from "@/content/legal/about.json";
import contact from "@/content/legal/contact.json";
import cookies from "@/content/legal/cookies.json";
import dmca from "@/content/legal/dmca.json";
import privacy from "@/content/legal/privacy.json";
import terms from "@/content/legal/terms.json";
import { SITE_URL } from "@/lib/site-config";
import { LEGAL_ROUTES, liveRoutes } from "@/lib/tools/registry";

/**
 * `updated` for each legal page, keyed by slug.
 *
 * A static import per file rather than a directory read: this module is
 * prerendered by a bundler with no filesystem, so a directory read is not
 * available here at all. A slug with no entry throws while the sitemap is being
 * generated, which fails the build — noisy, and much better than the silent
 * alternative of falling back to a build timestamp on one URL.
 */
const LEGAL_CONTENT: Readonly<Record<string, { updated: string }>> = {
  about,
  contact,
  cookies,
  dmca,
  privacy,
  terms,
};

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
 * The legal pages carry a real `lastModified`, taken from the `updated` field of
 * their own content file. Not a build timestamp: "everything changed" on every
 * deploy tells a crawler the site changed and then gives it nothing changed to
 * find, which is a negative quality signal rather than a neutral one. The tool
 * entries have no date for the honest reason that their content files do not
 * carry one yet — inventing one here would be the same lie in a smaller font.
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
    // Lower priority than a tool page, and that is the accurate signal rather
    // than a modest one: nobody arrives at this site searching for its Terms.
    // They still have to be crawlable — an ad-network reviewer follows them, and
    // so does anyone deciding whether to trust the tools.
    ...LEGAL_ROUTES.map((route) => ({
      url: `${SITE_URL}/${route.slug}`,
      lastModified: LEGAL_CONTENT[route.slug].updated,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
