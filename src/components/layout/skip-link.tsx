import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

/**
 * Skip link — docs/design-guidelines.md §7.2: the first tabbable node on every
 * page, visible on focus, at `--z-skip-link` (70) so nothing can cover it.
 *
 * It is a plain `<a href="#main">`, not next-intl's `Link`: this is a fragment
 * on the current document, and routing it through the locale rewriter would turn
 * a jump into a navigation.
 */
export async function SkipLink() {
  const t = await getTranslations("nav");

  return (
    <a
      href="#main"
      className={cn(
        "sr-only focus-visible:not-sr-only",
        "focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[var(--z-skip-link)]",
        "focus-visible:rounded-control focus-visible:bg-surface-raised focus-visible:px-4 focus-visible:py-2",
        "focus-visible:text-sm focus-visible:font-semibold focus-visible:text-fg focus-visible:shadow-md",
      )}
    >
      {t("skipToContent")}
    </a>
  );
}
