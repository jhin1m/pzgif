import { defineRouting } from "next-intl/routing";

/**
 * URL policy — this is a 12-18 month SEO compounding play, so the URLs written
 * today must survive the arrival of locale #2 unchanged.
 *
 *   localePrefix: "as-needed"  English serves prefix-free at /gif-compressor.
 *                              Adding `de` later creates /de/gif-compressor and
 *                              changes ZERO existing URLs.
 *   localeDetection: false     One locale. Negotiation is pure overhead and can
 *                              produce odd redirects for crawlers.
 *   localeCookie: false        A cookie set before consent is a needless CMP
 *                              complication.
 */
export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeDetection: false,
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];
