import { cn } from "@/lib/utils";

/**
 * The loop mark, from `docs/wireframe/*.html`.
 *
 * A placeholder by decision, not by omission: the brand mark does not exist yet
 * and the bootstrap decision was to ship a text wordmark rather than block on
 * one. Favicon legibility at 32px is still untested (design-guidelines §Open 3).
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

/** The larger mark that sits inside the dropzone (§5.2). */
export function LoopMark({ className }: { className?: string }) {
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
