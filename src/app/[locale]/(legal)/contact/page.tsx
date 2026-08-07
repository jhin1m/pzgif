import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/content/legal-page";
import raw from "@/content/legal/contact.json";
import { legalContent } from "@/lib/content/legal";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site-config";

/**
 * Nothing on this route is per-request, so nothing here may read `cookies()` or
 * `headers()` — a single such call turns the route dynamic and fails
 * `pnpm check:static`.
 *
 * `legalContent()` runs at module scope on purpose: a content file that lost a
 * key becomes a build failure rather than a page that renders a heading and an
 * empty body.
 */

const SLUG = "contact";
const content = legalContent(raw, SLUG);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);

  return {
    title: content.meta.title,
    description: content.meta.description,
    alternates: { canonical: `${SITE_URL}/${SLUG}` },
    openGraph: {
      type: "website",
      url: `${SITE_URL}/${SLUG}`,
      title: content.meta.title,
      description: content.meta.description,
    },
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <LegalPage content={content}>
      {/* The address is named in the prose above as well, because a reader who
          copies text out of a policy should get a working address. This is the
          one-click version, and it is the reason this page has a slot at all. */}
      <p className="mt-10 border-t border-line pt-8">
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-lead font-medium text-brand underline underline-offset-4 hover:text-brand-hover"
        >
          {CONTACT_EMAIL}
        </a>
      </p>
    </LegalPage>
  );
}
