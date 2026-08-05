import { SITE_NAME, SITE_URL } from "@/lib/site-config";
import type { ToolDefinition } from "@/lib/tools/registry";

/**
 * Structured data for a tool page: `BreadcrumbList` + `WebApplication`.
 *
 * ── What is deliberately absent ─────────────────────────────────────────────
 *  - **`FAQPage`.** Google removed FAQ rich results from Search on 2026-05-07 and
 *    deleted the documentation on 2026-06-15. See `faq-section.tsx`.
 *  - **`aggregateRating` / `review`.** There are no ratings. Self-serving review
 *    markup on the entity that publishes it is against Google's own guidance and
 *    is a structured-data manual action waiting to happen.
 *  - **`price`.** `offers` with a zero price on a free tool reads as a product
 *    listing to the parser and gains nothing.
 *
 * ── Why it is inlined rather than emitted from `generateMetadata` ───────────
 * Next's metadata API has no JSON-LD slot, and the documented approach is a
 * `<script type="application/ld+json">` in the page body. It is inert data, not
 * an executable script: `type` is not a JavaScript MIME type, so the CSP's
 * `script-src` does not apply to it and no hash or nonce is needed — which
 * matters here, because adding either to `script-src` would disable
 * `'unsafe-inline'` and stop the app hydrating. See `next.config.ts`.
 */

export function ToolJsonLd({
  route,
  title,
  description,
  breadcrumbLabel = "Tools",
}: {
  route: ToolDefinition;
  title: string;
  description: string;
  /** The intermediate crumb. Matches the nav group heading the tool sits under. */
  breadcrumbLabel?: string;
}) {
  const url = `${SITE_URL}/${route.slug}`;

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
          // No `item` on the last crumb: it is the current page, and schema.org's
          // own guidance is to omit the URL there rather than self-reference.
          { "@type": "ListItem", position: 2, name: breadcrumbLabel, item: `${SITE_URL}/#tools` },
          { "@type": "ListItem", position: 3, name: route.name },
        ],
      },
      {
        "@type": "WebApplication",
        "@id": `${url}#app`,
        name: title,
        description,
        url,
        applicationCategory: "MultimediaApplication",
        // The claim the whole product is built on, stated where a parser can
        // read it: this runs in the browser and needs nothing installed.
        operatingSystem: "Any",
        browserRequirements: "Requires a browser with WebAssembly support",
        isAccessibleForFree: true,
        permissions: "none",
        featureList: [
          `Accepts ${route.inputFormats.map((format) => format.toUpperCase()).join(", ")}`,
          `Produces ${route.outputFormats.map((format) => format.toUpperCase()).join(", ")}`,
          "Runs entirely in the browser — files are never uploaded",
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // The payload is built here from typed values, never from user input.
      // `<` is escaped so a string can never terminate the element early.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}
