"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The `<video>` tag that replaces a GIF embed — `gif-to-mp4`'s result panel.
 *
 * ── Why the snippet is the point of the tool ───────────────────────────────
 * Almost nobody converts a GIF to MP4 to keep an MP4. They convert it because a
 * 6 MB GIF is destroying a page's load time, and the file is only half of what
 * they need — the other half is the four attributes that make an MP4 behave like
 * the GIF it replaced. Drop `playsinline` and iOS Safari opens it fullscreen;
 * drop `muted` and no browser will autoplay it at all. No competitor hands this
 * over, and it costs one component.
 *
 * ── Why the filename is a placeholder and not the download name ────────────
 * The `src` is where the file will live on *their* server, which this page
 * cannot know. Interpolating the local download name would produce a snippet
 * that looks copy-pasteable and is wrong, so the path is obviously a stand-in
 * and the caption says to replace it.
 *
 * ── Copy has a real fallback ───────────────────────────────────────────────
 * `navigator.clipboard` is unavailable on insecure origins and can be refused by
 * permission. The `<pre>` is selectable text either way, so the failure mode is
 * "select it yourself", not a button that silently does nothing.
 */

/** How long the button stays in its confirmed state before reverting. */
const CONFIRM_MS = 2000;

export function videoEmbedSnippet(fileName: string): string {
  return `<video src="${fileName}" autoplay muted loop playsinline></video>`;
}

export function VideoEmbedSnippet({
  fileName,
  label,
  caption,
  className,
}: {
  /** Placeholder path shown in the `src`, e.g. `your-animation.mp4`. */
  fileName: string;
  /** The block's heading. Hand-written per tool. */
  label: string;
  /** One line under the snippet. Hand-written per tool. */
  caption: string;
  className?: string;
}) {
  const t = useTranslations("embed");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleared on unmount: the result panel is torn down by "Start over", and a
  // pending timer would then set state on a component that no longer exists.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const snippet = videoEmbedSnippet(fileName);

  const copy = useCallback(() => {
    void navigator.clipboard
      ?.writeText(snippet)
      .then(() => {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), CONFIRM_MS);
      })
      .catch(() => {
        // Denied or unavailable. The text is selectable, so there is nothing to
        // recover from and nothing worth interrupting the user about.
      });
  }, [snippet]);

  return (
    <div className={cn("flex flex-col gap-2", className)} data-embed-snippet>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-label font-semibold text-fg">{label}</span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-control px-3",
            "text-label font-medium text-fg",
            "border border-line bg-surface-1 hover:border-brand hover:bg-brand-subtle",
          )}
        >
          {copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>

      <pre
        className={cn(
          "overflow-x-auto rounded-card border border-line bg-surface-2 p-3",
          "text-caption text-fg-secondary",
        )}
      >
        <code>{snippet}</code>
      </pre>

      <p className="text-caption text-fg-muted">{caption}</p>
    </div>
  );
}
