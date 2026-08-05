"use client";

import { File as FileGlyph, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ForcedState } from "@/components/ui/forced-state";

/**
 * FileChip — docs/design-guidelines.md §5.3.
 *
 * The name truncates in the *middle*, not at the end. That is the whole reason
 * this does not use `text-overflow: ellipsis`: end-truncation eats the
 * extension, and "screen-recording-2026-08-04-final-v3-really-final.gif"
 * becoming "screen-recording-2026-08…" hides the one part of the name that says
 * what the file is.
 *
 * The remove button carries its own focus ring and its own 44px hit area (§5.3,
 * §5 shared rules) — it is 24px of visual inside a touch-sized target.
 */

/**
 * Truncates in the middle, keeping both ends. Pure, so it is unit-tested
 * directly rather than through a rendered chip.
 */
export function middleEllipsis(name: string, maxChars = 22): string {
  // Code points, not UTF-16 units: `slice` would cut an emoji filename in half
  // and leave a lone surrogate, which renders as a replacement character.
  const chars = Array.from(name);
  if (chars.length <= maxChars) return name;
  // Two visible ends plus the ellipsis character itself.
  const keep = maxChars - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${chars.slice(0, head).join("")}…${chars.slice(chars.length - tail).join("")}`;
}

export interface FileChipProps {
  name: string;
  /** Pre-formatted, e.g. "2.4 MB". Formatting bytes is the caller's job. */
  size?: string;
  error?: string;
  /** Hide the × entirely — a chip in a read-only summary has nothing to remove. */
  removable?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
  /** Screenshot support for /dev/states. Never set this in product code. */
  forceState?: ForcedState;
  /** Applies the forced state to the remove button rather than the chip. */
  forceRemoveState?: ForcedState;
}

export function FileChip({
  name,
  size,
  error,
  removable = true,
  onRemove,
  removeLabel = "Remove file",
  className,
  forceState,
  forceRemoveState,
}: FileChipProps) {
  return (
    <span
      data-force={forceState}
      className={cn(
        "inline-flex min-h-9 max-w-full items-center gap-2.5 rounded-pill py-0 pl-3 pr-1.5",
        "border border-line bg-surface-1 text-sm",
        "transition-colors duration-[120ms] ease-out",
        "hover:border-line-hover data-[force=hover]:border-line-hover",
        error && "border-danger",
        className,
      )}
    >
      <FileGlyph
        aria-hidden="true"
        className={cn(
          "size-4.5 flex-none",
          error ? "text-danger" : "text-brand",
        )}
      />
      <span className="truncate font-medium" title={name}>
        {middleEllipsis(name)}
      </span>
      {error ? (
        <span className="tabular text-caption text-danger-text">{error}</span>
      ) : size ? (
        <span className="tabular rounded-pill bg-surface-2 px-2 py-0.5 text-caption text-fg-muted">
          {size}
        </span>
      ) : null}
      {removable ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          data-force={forceRemoveState}
          className={cn(
            "relative grid size-6 flex-none cursor-pointer place-items-center rounded-full",
            "text-fg-muted hover:bg-surface-2 hover:text-fg",
            "data-[force=hover]:bg-surface-2 data-[force=hover]:text-fg",
            "after:absolute after:inset-[-10px] after:content-['']",
            forceRemoveState === "focus" && "force-focus",
          )}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
