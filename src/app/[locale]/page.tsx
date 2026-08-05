import { getTranslations, setRequestLocale } from "next-intl/server";
import { TrustLine } from "@/components/layout/trust-line";
import { Link } from "@/i18n/navigation";
import {
  TOOL_GROUP_ORDER,
  routesInGroup,
  type ToolGroup,
} from "@/lib/tools/registry";

/**
 * Homepage shell.
 *
 * Phase 9 owns the homepage copy, the "Why PZGIF" block and the SEO machinery.
 * What exists here is the structural skeleton that proves the token layer, the
 * font stack and the registry all resolve — and that is also what serves as the
 * holding page from day one, so the domain is never parked.
 */

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();

  return (
    <main id="main" className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6">
      <h1 className="text-display font-bold">{t("site.tagline")}</h1>

      <TrustLine className="mt-3" />

      {TOOL_GROUP_ORDER.map((group: ToolGroup) => (
        <section key={group} className="mt-10">
          {/* The group headings are the same strings the nav and footer use —
              one label per group, read from the message catalogue, not spelled
              again per surface. */}
          <h2 className="text-h2 font-bold">{t(`nav.${group}`)}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {routesInGroup(group).map((route) => (
              <li key={route.slug}>
                <Link
                  href={`/${route.slug}`}
                  className="block rounded-card border border-line bg-surface-1 p-4 shadow-sm hover:border-brand"
                >
                  {route.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
