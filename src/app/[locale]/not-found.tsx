import { getTranslations } from "next-intl/server";
import { LoopMark } from "@/components/brand/marks";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <main id="main" className="mx-auto max-w-[68ch] px-4 py-24">
      {/* A page that is waiting rather than working — the one other place the
          personified mark belongs. Decorative and `aria-hidden`; the heading
          below says what happened. */}
      <LoopMark personified className="mb-5 text-mark-muted" />
      <h1 className="text-h1 font-bold">{t("title")}</h1>
      <p className="mt-4 text-fg-secondary">{t("body")}</p>
      <p className="mt-6">
        <Link
          href="/"
          className="text-brand underline underline-offset-2 hover:text-brand-hover"
        >
          {t("cta")}
        </Link>
      </p>
    </main>
  );
}
