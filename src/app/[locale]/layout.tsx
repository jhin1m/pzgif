import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";
import { BottomBarProvider } from "@/components/tool/action-bar-context";
import { ToastProvider } from "@/components/ui/toast";
import { routing } from "@/i18n/routing";
import { THEME_INIT_SCRIPT } from "@/lib/theme/theme-init-script";
import { SITE_NAME, SITE_URL } from "@/lib/site-config";
import { fontVariables } from "../fonts";
import "../globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — GIF tools that run in your browser`,
    template: `%s — ${SITE_NAME}`,
  },
  description:
    "Compress, resize, crop and convert GIFs without uploading them. Every operation runs inside your own browser tab.",
};

export const viewport: Viewport = {
  // Both themes are declared so the browser chrome matches before hydration.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0D12" },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Without this, Next keeps the fallback open: the listed locales prerender and
 * every *unlisted* one server-renders on demand, CDN-uncacheable. `routing`
 * already enumerates every locale that exists, so anything else is a 404 — which
 * is what `dynamicParams = false` makes it, statically.
 */
export const dynamicParams = false;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Required for every statically prerendered route that reads translations.
  setRequestLocale(locale);

  return (
    // `suppressHydrationWarning` is load-bearing, not cosmetic. The theme script
    // below runs before hydration and rewrites this element by design: it sets
    // `data-theme` and drops `data-theme-booting`. React then hydrates, finds
    // attributes that do not match what the server sent, and reports a mismatch
    // it says it "won't patch up" — so it discards the server HTML and
    // client-renders the tree instead. That fallback is what produced the
    // "Encountered a script tag while rendering React component" warning: a
    // `<script>` rendered on the client, which browsers never execute, so the
    // theme boot the suppression exists to protect was itself the casualty.
    // Scoped to this element only; it does not extend to children.
    <html
      lang={locale}
      data-theme-booting
      className={fontVariables}
      suppressHydrationWarning
    >
      <head>
        {/* Runs before first paint so the theme never flashes. Deliberately not
            hashed into the CSP — a hash there disables 'unsafe-inline' and kills
            Next's own payload scripts. See next.config.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider>
          {/* The bottom of a phone viewport can hold exactly one of: the sticky
              action bar, the anchor ad, the consent bar. The provider is what
              makes that mutual exclusion structural rather than a review note. */}
          <BottomBarProvider>
            <ToastProvider>
              <SkipLink />
              <SiteHeader />
              {children}
              <SiteFooter />
            </ToastProvider>
          </BottomBarProvider>
        </NextIntlClientProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
