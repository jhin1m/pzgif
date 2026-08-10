import { OPERATOR_NAME, SITE_NAME, SITE_URL } from "@/lib/site-config";

/**
 * Structured data for the homepage: `WebSite` + `Organization`.
 *
 * These two feed entity understanding rather than a rich result. `WebSite` is
 * what Google reads to settle the site-name it prints under a result, and
 * `Organization` is the node the tool pages' `WebApplication` publisher resolves
 * to — so this is the one place the operator is named to a parser rather than
 * only to a human on the About page.
 *
 * ── What is deliberately absent, and enforced ──────────────────────────────
 *  - **No `aggregateRating` / `review`.** There are no ratings, and inventing one
 *    to earn a star is a structured-data manual action waiting to happen. The
 *    same absence holds on the tool pages; `scripts/check-structured-data.mjs`
 *    fails the build if the string reappears anywhere.
 *  - **No `FAQPage` / `HowTo`.** Both are dead as rich results, and emitting a
 *    dead type is noise a parser has to discard. See `faq-section.tsx`.
 *
 * ── Why it is inlined rather than emitted from `generateMetadata` ───────────
 * Next's metadata API has no JSON-LD slot; the documented approach is a
 * `<script type="application/ld+json">` in the body. `type` is not a JavaScript
 * MIME type, so the CSP's `script-src` does not apply and no hash or nonce is
 * needed — which matters, because adding either would disable `'unsafe-inline'`
 * and stop the app hydrating. See `next.config.ts` and `tool-json-ld.tsx`.
 */
export function SiteJsonLd() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: SITE_URL,
        // No `SearchAction`: there is no site search to wire it to, and a
        // sitelinks searchbox pointed at a route that does not exist is worse
        // than none.
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        // The generated app icon, served by Next from `src/app/icon.svg`.
        logo: `${SITE_URL}/icon.svg`,
        // The named operator, the same string the About page and the licence
        // files carry. It is what an entity graph and an ad reviewer both look
        // for behind a solo site.
        founder: { "@type": "Person", name: OPERATOR_NAME },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Built here from typed constants, never from user input. `<` is escaped so
      // a string can never terminate the element early.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}
