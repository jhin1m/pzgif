import { getTranslations } from "next-intl/server";
import { BrandMark, Wordmark } from "@/components/brand/marks";
import { Link } from "@/i18n/navigation";
import { BUILD_COMMIT_SHA, sourceUrlForThisBuild } from "@/lib/site-config";
import {
  TOOL_GROUP_ORDER,
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

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-5 text-caption text-fg-muted">
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
