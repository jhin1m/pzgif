import { getTranslations } from "next-intl/server";
import { BrandMark, Wordmark } from "@/components/brand/marks";
import { Link } from "@/i18n/navigation";
import { BUILD_COMMIT_SHA, sourceUrlForThisBuild } from "@/lib/site-config";
import {
  GUIDES_BASE_PATH,
  GUIDE_ROUTES,
  LEGAL_ROUTES,
  TOOL_GROUP_ORDER,
  guidePath,
  routesInGroup,
  type ToolGroup,
} from "@/lib/tools/registry";
import { cn } from "@/lib/utils";

/**
 * Footer — docs/design-guidelines.md §10 ("footer with the full tool list for
 * internal linking").
 *
 * ── Two things this file is responsible for ────────────────────────────────
 *  1. **The tool inventory, and only the real one.** Every link comes from
 *     `registry.ts`, which is scoped to exactly 9 tools plus the Discord
 *     cluster. `docs/wireframe/index.html` lists two more — `GIF to WebP` and
 *     `GIF for Slack` — and both are cut. A footer link to a page that does not
 *     exist is a 404 in the internal link graph, on the one surface whose whole
 *     purpose is that graph.
 *  2. **The AGPL source offer.** §6 of AGPL-3.0 asks for the Corresponding
 *     Source *of the version conveyed*, so the link is pinned to the commit this
 *     bundle was built from, not to `main`.
 */
export async function SiteFooter() {
  const t = await getTranslations("footer");
  const tNav = await getTranslations("nav");
  const shortSha = BUILD_COMMIT_SHA ? BUILD_COMMIT_SHA.slice(0, 7) : null;

  return (
    <footer className="mt-12 border-t border-line bg-surface-1 pb-8 pt-10">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link
              href="/"
              className="mb-3 inline-flex items-center gap-2 no-underline"
            >
              <BrandMark />
              <Wordmark />
            </Link>
            <p className="max-w-[34ch] text-sm text-fg-muted">{t("blurb")}</p>
            <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-fg-secondary">
              <span
                aria-hidden="true"
                className="text-body leading-none text-accent-text"
              >
                🔒
              </span>
              <span>{t("trustShort")}</span>
            </p>
          </div>

          {TOOL_GROUP_ORDER.map((group: ToolGroup) => (
            <nav key={group} aria-label={tNav(group)}>
              {/* A <p>, not a heading: the <nav> already carries this label, and
                  a heading here would sit below the page's own outline. */}
              <p className="mb-3 text-label font-semibold uppercase tracking-[0.06em] text-fg-muted">
                {tNav(group)}
              </p>
              <ul className="grid gap-2">
                {routesInGroup(group).map((route) => (
                  <li key={route.slug}>
                    <Link
                      href={`/${route.slug}`}
                      className={cn(
                        "text-sm text-fg-secondary no-underline",
                        "hover:text-brand hover:underline hover:underline-offset-2",
                      )}
                    >
                      {route.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Guides get their own row rather than a fifth column. Two reasons: the
            grid above is the tool inventory and a guide is not a tool, and a
            fifth column is what made the reserved boxes overflow the last time
            this footer grew. A row wraps instead.

            Every guide is listed rather than just the hub. These are the only
            non-tool pages worth an internal link from every page on the site,
            and a sitewide link is the strongest one this site can give them. */}
        <nav
          aria-label={t("guides")}
          className="mt-8 border-t border-line pt-5"
        >
          <p className="mb-3 text-label font-semibold uppercase tracking-[0.06em] text-fg-muted">
            <Link
              href={GUIDES_BASE_PATH}
              className="no-underline hover:text-brand hover:underline hover:underline-offset-2"
            >
              {t("guides")}
            </Link>
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {GUIDE_ROUTES.map((guide) => (
              <li key={guide.slug}>
                <Link
                  href={guidePath(guide.slug)}
                  className="text-sm text-fg-secondary no-underline hover:text-brand hover:underline hover:underline-offset-2"
                >
                  {guide.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Legal links sit in the bottom bar, not as a fourth column above.
            Those three columns are the tool inventory; a legal column beside
            them would read as "Terms is a tool you can use on a file". Here they
            keep company with the licence line and the source offer, which is
            what they actually are — the site's terms of engagement. */}
        {/* No divider of its own: the guides row above already drew one, and two
            rules stacked six pixels apart read as a rendering fault. */}
        <nav aria-label={t("legal")} className="mt-6">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {LEGAL_ROUTES.map((route) => (
              <li key={route.slug}>
                <Link
                  href={`/${route.slug}`}
                  className="text-caption text-fg-muted no-underline hover:text-brand hover:underline hover:underline-offset-2"
                >
                  {route.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-fg-muted">
          <a
            href={sourceUrlForThisBuild}
            title={t("sourceTitle")}
            rel="noreferrer"
            className="text-brand underline underline-offset-2 hover:text-brand-hover"
          >
            {t("source")}
            {shortSha ? (
              <span className="tabular ml-1">({shortSha})</span>
            ) : null}
          </a>
          <span>{t("licence")}</span>
        </div>
      </div>
    </footer>
  );
}
