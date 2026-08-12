import { SITE_NAME, SITE_URL } from "@/lib/site-config";
import { GUIDES_BASE_PATH } from "@/lib/tools/registry";

/**
 * Structured data for a guide: `BreadcrumbList`, and nothing else.
 *
 * ── Why no `Article` ────────────────────────────────────────────────────────
 * It is tempting, and it would not be spam. It also would not do anything.
 * `Article` earns a rich result for news publishers in Top Stories and for
 * nobody else; on an ordinary explainer it is a type a parser reads and
 * discards. The phase plan settled the emitted set deliberately — breadcrumbs
 * and `WebApplication` on tools, `WebSite` and `Organization` on the homepage,
 * nothing further — and "nothing further" is the part that keeps the markup
 * auditable. A type added because it seemed harmless is how a schema graph turns
 * into noise nobody can justify line by line.
 *
 * The breadcrumb is the one that pays: it renders in results, and it is the only
 * place the Home > Guides > page hierarchy is legible to a crawler, because the
 * URL path is the only other signal and paths are not evidence of structure.
 *
 * Inlined rather than emitted from `generateMetadata` for the reason set out in
 * `tool-json-ld.tsx`: Next's metadata API has no JSON-LD slot, and the CSP's
 * `script-src` does not apply to a non-JavaScript MIME type.
 */
export function GuideJsonLd({
  slug,
  name,
  guidesLabel,
}: {
  slug: string;
  /** The final crumb. The guide's short registry name, not its headline. */
  name: string;
  /** The middle crumb's label — the hub's own title, from its content file. */
  guidesLabel: string;
}) {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "@id": `${SITE_URL}${GUIDES_BASE_PATH}/${slug}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
          {
            "@type": "ListItem",
            position: 2,
            name: guidesLabel,
            item: `${SITE_URL}${GUIDES_BASE_PATH}`,
          },
          // No `item` on the last crumb: schema.org's guidance is to omit the
          // URL for the current page rather than self-reference.
          { "@type": "ListItem", position: 3, name },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}
