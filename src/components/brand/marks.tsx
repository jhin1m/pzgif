import { cn } from "@/lib/utils";

/**
 * The loop mark, from `docs/wireframe/*.html`.
 *
 * A placeholder by decision, not by omission: the brand mark does not exist yet
 * and the bootstrap decision was to ship a text wordmark rather than block on
 * one (design-guidelines §Open 3).
 *
 * `src/app/icon.svg` draws the same figure with different numbers — plate,
 * compact lobes, heavier stroke — because 16px will not hold this one. That is
 * an optical variant of this mark, not a second mark, and the two move
 * together: a real logo replaces both.
 *
 * Both marks are decorative — the wordmark beside them carries the name — so
 * they are `aria-hidden` and never given a title.
 */

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-6.5 flex-none", className)}
    >
      <path
        d="M9.5 10.5A5.5 5.5 0 1 0 9.5 21.5C14 21.5 18 10.5 22.5 10.5A5.5 5.5 0 1 1 22.5 21.5C18 21.5 14 10.5 9.5 10.5Z"
        stroke="var(--primary)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="22.5" cy="16" r="1.9" fill="var(--accent)" />
    </svg>
  );
}

/**
 * The larger mark that sits inside the dropzone (§5.2).
 *
 * `personified` adds two eye dots to the left lobe. Same SVG, same viewBox, no
 * new asset and no new request — which is the whole reason this is the mascot
 * the product gets. A full multi-pose character was costed and cut; two circles
 * on a mark that already ships buy most of the warmth for none of the weight.
 *
 * Reserved for surfaces that are *waiting* rather than *working*: the empty
 * result panel, the 404, the homepage hero watermark. A face on a busy state
 * would be a character watching the user wait, which is the opposite of
 * reassuring. The mark stays `aria-hidden` in both forms — the copy beside it
 * carries the meaning, and a screen reader has no use for a wink.
 */
export function LoopMark({
  className,
  personified = false,
}: {
  className?: string;
  personified?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      className={cn("size-18 md:size-24", className)}
    >
      <path
        d="M30 34a14 14 0 1 0 0 28c11.5 0 21.5-28 33-28a14 14 0 1 1 0 28c-11.5 0-21.5-28-33-28Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="63" cy="48" r="4" fill="var(--accent)" />
      {personified ? (
        <>
          <circle cx="25" cy="44" r="2.4" fill="currentColor" />
          <circle cx="34" cy="44" r="2.4" fill="currentColor" />
        </>
      ) : null}
    </svg>
  );
}

/** The PZ·GIF wordmark. Display face, tight tracking, brand-coloured second half. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-[1.125rem] font-bold tracking-[-0.03em] text-fg",
        className,
      )}
    >
      PZ<span className="text-brand">GIF</span>
    </span>
  );
}
