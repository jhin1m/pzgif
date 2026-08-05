import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { BUILD_COMMIT_SHA, sourceUrlForThisBuild } from "@/lib/site-config";

/**
 * Minimal footer. Phase 3 owns the visual design and Phase 9 owns the link
 * inventory; what has to exist from Phase 2 onward is the AGPL source offer,
 * pinned to the commit this bundle was actually built from.
 */
export async function SiteFooter() {
  const t = await getTranslations("footer");
  const shortSha = BUILD_COMMIT_SHA ? BUILD_COMMIT_SHA.slice(0, 7) : null;

  return (
    <footer className="border-t border-line mt-16 py-8 text-sm text-fg-muted">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-4">
        <a
          href={sourceUrlForThisBuild}
          title={t("sourceTitle")}
          rel="noreferrer"
          className="text-brand underline underline-offset-2 hover:text-brand-hover"
        >
          {t("source")}
          {shortSha ? <span className="ml-1 tabular">({shortSha})</span> : null}
        </a>
        <span>{t("licence")}</span>
        <span className="ms-auto">
          <ThemeToggle />
        </span>
      </div>
    </footer>
  );
}
