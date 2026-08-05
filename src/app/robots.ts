import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

/**
 * Minimal robots.txt so Search Console can be verified and a sitemap submitted
 * on day one — a registered-but-unserving domain earns no index age, and that is
 * the binding resource for this product.
 *
 * Phase 9 owns the real SEO machinery and will extend this.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
