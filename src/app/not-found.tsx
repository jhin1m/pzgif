import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { routing } from "@/i18n/routing";
import { THEME_INIT_SCRIPT } from "@/lib/theme/theme-init-script";
import { fontVariables } from "./fonts";
import "./globals.css";

/**
 * Root 404.
 *
 * `[locale]/not-found.tsx` only fires for `notFound()` thrown *inside* that
 * segment. A URL that matches no route at all — which is most 404s, and every
 * 404 a crawler finds — falls back here instead. Without this file Next serves
 * its unstyled default: no `lang` attribute on an indexable response, no theme,
 * and no AGPL source link.
 *
 * There is no root layout — `[locale]/layout.tsx` is the root layout — so this
 * page has to render its own document shell. It deliberately mirrors that
 * layout's <head> so the theme still applies before first paint.
 */
export default async function RootNotFound() {
  const locale = routing.defaultLocale;
  // Without this the 404 reads the request to resolve a locale and turns
  // dynamic — meaning every crawler's 404 hits the origin instead of the CDN.
  setRequestLocale(locale);
  const messages = await getMessages({ locale });
  const t = await getTranslations({ locale, namespace: "notFound" });

  return (
    // Same reason as the locale layout: the theme script rewrites this element
    // before hydration, and without the suppression React discards the server
    // HTML over it. See src/app/[locale]/layout.tsx.
    <html
      lang={locale}
      data-theme-booting
      className={fontVariables}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <main id="main" className="mx-auto max-w-[68ch] px-4 py-24">
            <h1 className="text-h1 font-bold">{t("title")}</h1>
            <p className="mt-4 text-fg-secondary">{t("body")}</p>
            <p className="mt-6">
              {/* Plain next/link, not the locale-aware wrapper: this page sits
                  outside the [locale] segment, and "/" is already the
                  prefix-free English root. */}
              <Link
                href="/"
                className="text-brand underline underline-offset-2 hover:text-brand-hover"
              >
                {t("cta")}
              </Link>
            </p>
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
