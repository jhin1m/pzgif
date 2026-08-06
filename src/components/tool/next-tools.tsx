"use client";

import type { MouseEvent } from "react";
import { Link } from "@/i18n/navigation";
import { setPendingFile } from "@/lib/handoff/pending-file";
import {
  chainTargets,
  relatedLiveRoutes,
  type MediaFormat,
} from "@/lib/tools/registry";
import { cn } from "@/lib/utils";

/**
 * The "what next?" row inside a finished result panel.
 *
 * ── Why this is a row of chips and not the related-tools grid ───────────────
 * `RelatedTools` sits at the foot of the page and is written for a reader who
 * is still deciding. This is for someone holding a finished file, and the only
 * question they have is whether one more operation is worth another click. It
 * carries the tool's name and nothing else — the blurb that helps a browsing
 * reader is noise to a reader who is done.
 *
 * ── The chip carries the file, so it is an action, not a suggestion ─────────
 * A finished result is a `Blob` that never left the JavaScript realm. Clicking
 * a chip stashes it in the same `pending-file` handoff the homepage picker
 * already uses, addressed to the destination slug, and lets `Link` navigate;
 * the destination's `useHandoffFile()` picks it up on mount. No new mechanism,
 * no round trip through the disk, and no tool page's intake logic changes.
 *
 * The row still renders without a result — the state gallery does exactly that
 * — and then it is the plain suggestion list it always was.
 *
 * One handoff exists at a time, by design. Clicking a second chip before the
 * first navigation commits re-addresses it, and whichever page mounts first
 * clears it — so the loser gets an ordinary dropzone. Left as-is: the window is
 * a frame or two on a prefetched route, and a queue would be the multi-step
 * pipeline `plan.md` puts out of scope.
 *
 * ── Why it filters, and why one chip is now enough ─────────────────────────
 * `relatedLiveRoutes()` rather than `relatedRoutes()`: the registry describes
 * more routes than this deployment serves, and a `planned` slug linked here is a
 * 404 offered at the moment the visitor trusts the page most. With a result in
 * hand the list narrows further, to `chainTargets()`, which also drops anything
 * that cannot decode the format that was actually produced.
 *
 * This row used to hide itself below two chips, on the reasoning that one lonely
 * chip after a divider reads as a broken list. That holds for a *suggestion*
 * list and stops holding once the chip moves a file: after format filtering
 * `gif-to-mp4` has exactly one valid destination (`mp4-to-gif`), and hiding the
 * row there would remove the feature's whole value on that page. So the minimum
 * follows the prop — one when a chip is an action, still two when it is only a
 * suggestion.
 *
 * ── And why it still stops at two ──────────────────────────────────────────
 * Two reasons that happen to agree. Three chips is a menu and two is a
 * suggestion, and this is not the surface for a menu — the related-tools grid at
 * the foot of the page already is one. The second reason is measured: this row
 * is inside a panel whose height has to be reserved before any of it exists, and
 * at 375px a third chip wraps to a third 44px line. An unbounded row would make
 * the reservation depend on which tool the visitor is on, and the reservation is
 * one constant for all five.
 *
 * The order is the content author's, from `registry.ts`'s `related` array, so
 * "the first two" is a decision that was already made deliberately.
 *
 * ── Why it lives here and not in `result-panel.tsx` ────────────────────────
 * `ResultPanel` and `ResultSummary` take rendered values and children; they own
 * no routing and reach into no registry. Keeping the one part that does need
 * both in its own file is what lets the panel stay a pure presentational module
 * — renderable in the state gallery, and in a test, with no locale context to
 * stand up first.
 */

export interface ChainableResult {
  readonly blob: Blob;
  readonly name: string;
  /**
   * What the page just produced. Stated, never inferred: `outputFormats` can
   * hold more than one entry (`split-gif-to-frames` is `png` | `zip`) and
   * `blob.type` is a second source of truth for the same fact. The page knows.
   */
  readonly format: MediaFormat;
}

export function NextTools({
  slug,
  label,
  result,
  className,
}: {
  slug: string;
  /** "Send to" — generic chrome, so it comes from the message catalogue. */
  label: string;
  /** The finished file, when there is one. Absent in the state gallery. */
  result?: ChainableResult | null;
  className?: string;
}) {
  const routes = (
    result ? chainTargets(slug, result.format) : relatedLiveRoutes(slug)
  ).slice(0, 2);
  if (routes.length < (result ? 1 : 2)) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2.5 border-t border-line pt-4",
        className,
      )}
    >
      <span className="text-label font-semibold text-fg-secondary">
        {label}
      </span>
      {routes.map((route) => (
        <Link
          key={route.slug}
          href={`/${route.slug}`}
          // Stash only on the click that will actually navigate. `Link` tests
          // the same modifiers before deciding, and a ⌘-click that stashed
          // anyway would leave this tab holding a handoff addressed to the tool
          // the visitor just opened elsewhere: reaching that tool here later, by
          // any ordinary link, would silently load a stale file and render no
          // dropzone. The address in `pending-file.ts` cannot catch that one —
          // it only rejects handoffs meant for a *different* tool — and until
          // something consumed it the result blob would stay alive.
          //
          // No `preventDefault` and no manual push: a modifier click still opens
          // a new tab, which is a fresh realm with an ordinary dropzone, exactly
          // as it behaves from the homepage picker today.
          onClick={
            result
              ? (event: MouseEvent<HTMLAnchorElement>) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  setPendingFile(
                    new File([result.blob], result.name, {
                      type: result.blob.type,
                    }),
                    route.slug,
                  );
                }
              : undefined
          }
          className={cn(
            // 44px minimum, because this row is the most likely thing a thumb
            // reaches for on the screen where the job just finished.
            "inline-flex min-h-11 items-center rounded-pill border border-line bg-surface-1 px-4",
            "text-label font-medium text-fg",
            "transition-colors duration-[120ms] ease-out",
            "hover:border-brand hover:bg-brand-subtle",
          )}
        >
          {route.name}
        </Link>
      ))}
    </div>
  );
}
