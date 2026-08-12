import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  DISCORD_PRESETS,
  PRESET_ROUTE_SLUGS,
  type DiscordPreset,
} from "@/lib/presets/discord";
import { getRoute } from "@/lib/tools/registry";

/**
 * The Discord limits table, rendered from `presets/discord.ts`.
 *
 * ── Why this is a component and not four rows of prose ──────────────────────
 * The guide it sits in exists because every other page carrying these figures
 * has at least one of them wrong. A hand-typed table here would join them the
 * first time Discord edits an article and only the preset config is updated —
 * and the failure is silent, because a wrong number in prose looks exactly like
 * a right one. Reading the same objects the encoders read makes the page and the
 * tools incapable of disagreeing.
 *
 * It also means the `verifiedOn` date shown to the reader is the real one. A
 * table that promises "kept up to date" is making a commitment a solo operator
 * cannot keep on figures that moved three times in a fortnight; a table that
 * shows when it was last checked, with a link to the source, lets the reader
 * decide whether that is recent enough for them.
 *
 * ── Two things it must never do ─────────────────────────────────────────────
 *  1. **Render a byte figure where Discord publishes none.** Three of the four
 *     surfaces have `byteLimit: null`, and that is an answer. The cell says so,
 *     and the site's own target appears underneath it explicitly labelled as
 *     ours — never in the column headed with Discord's name.
 *  2. **Use `formatBytes()`.** That helper is decimal, because it is used where
 *     a reader may cross-check against their file browser. Discord states these
 *     ceilings in binary kilobytes, so `256 * 1024` has to render as "256 KB"
 *     and not as the arithmetically-correct "262 KB" — a table whose figures do
 *     not match the source article word for word fails at its only job.
 */

/** Binary KB, to match how Discord writes these numbers. See the note above. */
function asStatedKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

export async function DiscordLimitsTable() {
  const t = await getTranslations("guides.discordTable");

  return (
    // The horizontal scroll lives on this wrapper, not on the page. A table with
    // six columns cannot fit a phone, and a body that scrolls sideways is the
    // failure mode the design guidelines forbid outright.
    <div className="my-8 overflow-x-auto rounded-card border border-line">
      <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
        <caption className="sr-only">{t("caption")}</caption>
        <thead>
          <tr className="border-b border-line bg-surface-1">
            <th scope="col" className="p-3 font-semibold text-fg">
              {t("surface")}
            </th>
            <th scope="col" className="p-3 font-semibold text-fg">
              {t("canvas")}
            </th>
            <th scope="col" className="p-3 font-semibold text-fg">
              {t("fileSize")}
            </th>
            <th scope="col" className="p-3 font-semibold text-fg">
              {t("length")}
            </th>
            <th scope="col" className="p-3 font-semibold text-fg">
              {t("frameRate")}
            </th>
            <th scope="col" className="p-3 font-semibold text-fg">
              {t("verified")}
            </th>
          </tr>
        </thead>
        <tbody>
          {DISCORD_PRESETS.map((preset) => (
            <Row key={preset.id} preset={preset} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One surface.
 *
 * Async, and it fetches its own translator rather than taking one as a prop:
 * `getTranslations` returns a function whose key type is inferred from the
 * message catalogue, and narrowing that to a `(key: string) => string` prop
 * throws away the compile-time check that every key here exists.
 */
async function Row({ preset }: { preset: DiscordPreset }) {
  const t = await getTranslations("guides.discordTable");
  const slug = PRESET_ROUTE_SLUGS[preset.id];
  const route = getRoute(slug);

  return (
    <tr className="border-b border-line last:border-b-0">
      <th scope="row" className="p-3 font-medium text-fg">
        {route ? (
          <Link
            href={`/${slug}`}
            className="text-brand no-underline hover:underline hover:underline-offset-2"
          >
            {route.name}
          </Link>
        ) : (
          slug
        )}
      </th>

      <td className="tabular p-3 text-fg-secondary">
        {preset.width}×{preset.height}
        {/* Only the sticker pipeline rejects other dimensions. Saying "exactly"
            on all four would turn a hard rule into a house style. */}
        {preset.dimensionsExact ? (
          <span className="block text-caption text-fg-muted">{t("exact")}</span>
        ) : null}
      </td>

      <td className="tabular p-3 text-fg-secondary">
        {preset.byteLimit === null ? (
          <>
            <span className="text-fg-muted">{t("notPublished")}</span>
            <span className="block text-caption text-fg-muted">
              {t("ourTarget", { size: asStatedKb(preset.targetBytes) })}
            </span>
          </>
        ) : (
          asStatedKb(preset.byteLimit)
        )}
      </td>

      <td className="tabular p-3 text-fg-secondary">
        {preset.maxDurationSec === null ? (
          <span className="text-fg-muted">{t("noCap")}</span>
        ) : (
          t("seconds", { count: String(preset.maxDurationSec) })
        )}
      </td>

      <td className="tabular p-3 text-fg-secondary">
        {preset.maxFps === null ? (
          <span className="text-fg-muted">{t("noCap")}</span>
        ) : (
          t("fps", { count: String(preset.maxFps) })
        )}
      </td>

      <td className="p-3 text-fg-secondary">
        <a
          href={preset.sourceUrl}
          rel="nofollow noreferrer"
          className="text-brand no-underline hover:underline hover:underline-offset-2"
        >
          <time dateTime={preset.verifiedOn} className="tabular">
            {preset.verifiedOn}
          </time>
        </a>
      </td>
    </tr>
  );
}
