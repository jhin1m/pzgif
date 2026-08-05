"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import { LoopMark } from "@/components/brand/marks";
import { Link } from "@/i18n/navigation";
import { suggestToolFor } from "@/lib/media/errors";
import {
  acceptAttribute,
  detectMediaFormat,
  extensionOf,
  formatListLabel,
  toInputFormat,
} from "@/lib/tools/file-format";
import { getRoute, type MediaFormat } from "@/lib/tools/registry";
import { cn } from "@/lib/utils";

/**
 * Dropzone — docs/design-guidelines.md §5.2, and principle #1: *the dropzone is
 * the page*.
 *
 * ── Three routes to the same outcome ────────────────────────────────────────
 * Drag-and-drop, click-to-browse and paste. §7.3 makes that non-negotiable:
 * there is no drag-only path, because a keyboard user and a touch user have no
 * drag. The paste binding is on the document, and the caption says so — an
 * affordance nobody is told about does not exist.
 *
 * ── The box never resizes ───────────────────────────────────────────────────
 * Every state changes border, background or `scale(1.01)` and nothing else
 * (§5.2, §6). A dropzone that grows on drag-over moves the thing the pointer is
 * aiming at.
 *
 * ── An invalid file is never a dead end ─────────────────────────────────────
 * The rejection always names a tool that takes the file, resolved through the
 * registry by `suggestToolFor()` so it can never point at a page that does not
 * exist. The wireframe's own copy fails this — it sends a rejected PNG to a
 * "PNG to GIF" tool that is not in scope.
 *
 * ── Deviations from the letter of §5.2, both deliberate ─────────────────────
 *  1. §5.2 describes "a real `<button>` wrapping a visually-hidden
 *     `<input type=file>`". An `<input>` inside a `<button>` is invalid HTML
 *     (interactive content inside interactive content) and double-fires the
 *     picker in some browsers. The input is a sibling instead, kept out of the
 *     tab order; every behaviour that section asks for is unchanged.
 *  2. The invalid-state *link* sits directly under the box rather than inside
 *     it, for the same nesting reason. The message stays in the box.
 *
 * `className` lands on the wrapper only. It used to be applied to the wrapper
 * *and* the button, so `className="mt-6"` produced margin outside the box and
 * inside it, and `max-w-md` constrained both.
 */

export type DropzoneState = "idle" | "dragover" | "invalid";

export interface DropzoneProps {
  /** Registry slug of the page this dropzone is on. Drives the suggestion. */
  toolSlug?: string;
  accept: readonly MediaFormat[];
  onFile?: (file: File) => void;
  /** Hand-written per tool. Rendered as the `aria-describedby` caption. */
  caption?: React.ReactNode;
  title?: string;
  disabled?: boolean;
  /** Applied to the wrapper, never to the box — see the note in the component. */
  className?: string;
  /**
   * Paints a state for `/dev/states` and for Phase 11's visual regression run.
   * Product code lets the component own its state.
   */
  forceState?: DropzoneState | "hover" | "focus";
}

export function Dropzone({
  toolSlug,
  accept,
  onFile,
  caption,
  title,
  disabled = false,
  className,
  forceState,
}: DropzoneProps) {
  const t = useTranslations("dropzone");
  const captionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<{
    extension: string | null;
    suggestion: { slug: string; name: string } | null;
  } | null>(null);

  const accepts = useCallback(
    (file: File) => {
      const format = detectMediaFormat(file);
      return format !== null && accept.includes(format);
    },
    [accept],
  );

  const reject = useCallback(
    (file: File) => {
      const format = detectMediaFormat(file);
      const extension = extensionOf(file.name) ?? "";
      const slug = suggestToolFor(toInputFormat(format), extension, toolSlug);
      const route = slug ? getRoute(slug) : undefined;
      setRejected({
        // Null, not a fallback to this tool's own formats: a pasted screenshot
        // often has no extension, and "GIF files aren't supported here" on the
        // GIF compressor is worse than saying nothing about the format.
        extension: extension ? extension.toUpperCase() : null,
        suggestion: route ? { slug: route.slug, name: route.name } : null,
      });
    },
    [toolSlug],
  );

  const offer = useCallback(
    (file: File | null | undefined) => {
      if (!file || disabled) return;
      // §5.2: the invalid state clears on the next interaction, never on a
      // timer — a message that vanishes while being read is worse than none.
      setRejected(null);
      if (!accepts(file)) {
        reject(file);
        return;
      }
      onFile?.(file);
    },
    [accepts, disabled, onFile, reject],
  );

  // Paste is bound at document level so it works wherever focus happens to be —
  // but only by a dropzone that can actually do something with the file. A
  // display-only instance (the gallery renders ten) binding a document listener
  // would mean one paste ran through every one of them.
  useEffect(() => {
    if (disabled || !onFile) return;
    const onPaste = (event: ClipboardEvent) => {
      const file = event.clipboardData?.files?.[0];
      if (file) offer(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [disabled, offer, onFile]);

  const state: DropzoneState =
    forceState === "dragover" || forceState === "invalid"
      ? forceState
      : dragging
        ? "dragover"
        : rejected
          ? "invalid"
          : "idle";

  const invalid = state === "invalid";
  const showRejection =
    invalid && (rejected !== null || forceState === "invalid");
  const rejectedExtension = rejected ? rejected.extension : "PNG";
  const suggestion = rejected?.suggestion ?? null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-describedby={captionId}
        data-state={state}
        data-force={forceState}
        onClick={() => {
          setRejected(null);
          inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          // `dragleave` bubbles, so moving the pointer from the box onto the
          // mark or the caption inside it would otherwise drop the drag-over
          // state and immediately restore it — a border that flickers under the
          // pointer, which is the instability §5.2 exists to prevent.
          if (event.currentTarget.contains(event.relatedTarget as Node | null))
            return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          offer(event.dataTransfer?.files?.[0]);
        }}
        className={cn(
          "relative flex w-full cursor-pointer flex-col items-center justify-center gap-2.5",
          "min-h-44 px-4 py-6 text-center md:min-h-60 lg:min-h-70",
          "rounded-card border-2 border-dashed bg-surface-2 text-fg",
          "border-brand/40",
          // Colour and a 1% scale only. Never a size (§5.2, §6).
          "transition-[background-color,border-color,transform] duration-100 ease-out",
          "hover:border-brand/65 hover:bg-brand-subtle",
          "data-[force=hover]:border-brand/65 data-[force=hover]:bg-brand-subtle",
          // The ring sits outside the dashed border (§5.2).
          "focus-visible:outline-offset-4",
          "data-[state=dragover]:scale-[1.01] data-[state=dragover]:border-solid data-[state=dragover]:border-brand data-[state=dragover]:bg-brand-subtle-strong",
          "data-[state=invalid]:border-solid data-[state=invalid]:border-danger data-[state=invalid]:bg-danger-subtle",
          "disabled:cursor-not-allowed disabled:opacity-55",
          forceState === "focus" && "force-focus",
        )}
      >
        {invalid ? (
          <CircleAlert
            aria-hidden="true"
            className="size-11 flex-none text-danger"
            strokeWidth={1.6}
          />
        ) : (
          <LoopMark
            className={cn(
              "text-mark-muted",
              state === "dragover" && "text-brand",
            )}
          />
        )}

        {invalid ? (
          <span className="text-sm font-semibold text-danger-text">
            {rejectedExtension
              ? t("invalidTitle", { extension: rejectedExtension })
              : t("invalidTitleUnknown")}
          </span>
        ) : (
          <span className="font-display text-h3 font-medium">
            {state === "dragover" ? t("release") : (title ?? t("title"))}
          </span>
        )}

        <span id={captionId} className="text-label text-fg-muted">
          {caption ?? t("caption", { formats: formatListLabel(accept) })}
        </span>
      </button>

      {/* Interactive content cannot nest inside the button, so the recovery link
          lives here — still inside the alert, still adjacent to the box. */}
      <p role="alert" className="min-h-5 text-sm text-danger-text">
        {showRejection ? (
          suggestion ? (
            <Link
              href={`/${suggestion.slug}`}
              className="font-semibold text-danger-text underline underline-offset-2"
            >
              {t("invalidSuggestion", { tool: suggestion.name })}
            </Link>
          ) : (
            t("invalidNoSuggestion", { formats: formatListLabel(accept) })
          )
        ) : null}
      </p>

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        accept={acceptAttribute(accept)}
        disabled={disabled}
        onChange={(event) => {
          offer(event.target.files?.[0]);
          // Re-selecting the same file must fire `change` again.
          event.target.value = "";
        }}
      />
    </div>
  );
}
