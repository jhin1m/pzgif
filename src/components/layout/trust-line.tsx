import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

/**
 * Trust line — docs/design-guidelines.md §11.
 *
 * One per page, immediately below the h1 on a tool page or below the sub-head on
 * the homepage. Never in a corner, never in the footer: it is the answer to the
 * question every visitor to a file-upload page has, and it only works where they
 * are already looking.
 *
 * The lock is the single emoji permitted anywhere in the product UI, and it is
 * `aria-hidden` because the sentence beside it already says what it means.
 *
 * §11 also carries an obligation for later: if a server-side path ever exists,
 * the wording changes rather than disappears. A privacy claim that is quietly
 * dropped is worse than one that was never made.
 */
export async function TrustLine({
  className,
  center = false,
}: {
  className?: string;
  center?: boolean;
}) {
  // Two keys rather than one sentence split at runtime: §11 fixes the exact
  // string and emphasises only its first half, and a regex over a translated
  // sentence is a bug waiting for the first locale that punctuates differently.
  const t = await getTranslations("trust");

  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 text-sm font-medium text-fg-secondary",
        center && "justify-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="text-body leading-none text-accent-text"
      >
        🔒
      </span>
      <span>
        <strong className="font-bold text-fg">{t("claim")}</strong>{" "}
        {t("detail")}
      </span>
    </p>
  );
}
