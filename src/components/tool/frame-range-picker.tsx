"use client";

import { useCallback, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * "Frames 1 to 48" — the range control `split-gif-to-frames` needs.
 *
 * ── Why frames and not seconds ─────────────────────────────────────────────
 * `TrimRange` answers "which part of this clip", which is a question about time.
 * This answers "which of these pictures", which is a question about a list, and
 * the two are not the same control with a different unit. Someone extracting the
 * frame they want to post is counting entries in a ZIP, not scrubbing a
 * timeline — so this is 1-based, inclusive at both ends, and reads the way the
 * filenames in the archive will.
 *
 * ── The cap is stated, never silently applied ──────────────────────────────
 * `maxFrames` is the device tier's ceiling, and when the selection exceeds it
 * the caller shows the reason. This control's job is to make the number
 * reachable, not to enforce the ceiling — a picker that snapped back to 230
 * every time a phone user typed 400 would be a control fighting its user with no
 * explanation.
 */

export interface FrameRange {
  /** 1-based, inclusive. */
  from: number;
  /** 1-based, inclusive. */
  to: number;
}

/** Clamps a range into `[1, total]` and keeps `from <= to`. */
export function clampFrameRange(range: FrameRange, total: number): FrameRange {
  const top = Math.max(1, Math.round(total));
  const from = Math.min(Math.max(1, Math.round(range.from)), top);
  const to = Math.min(Math.max(from, Math.round(range.to)), top);
  return { from, to };
}

/** How many frames the range covers. Inclusive at both ends. */
export function frameRangeCount(range: FrameRange): number {
  return Math.max(0, range.to - range.from + 1);
}

export function FrameRangePicker({
  totalFrames,
  value,
  onChange,
  disabled = false,
  label,
}: {
  /** Frames the source actually has. Null before the probe answers. */
  totalFrames: number | null;
  value: FrameRange;
  onChange(next: FrameRange): void;
  disabled?: boolean;
  /** The group label. Hand-written per tool. */
  label: string;
}) {
  const t = useTranslations("frameRange");
  const groupId = useId();
  const [draft, setDraft] = useState<{ field: "from" | "to"; value: string } | null>(
    null,
  );

  const total = totalFrames ?? value.to;

  const commit = useCallback(
    (field: "from" | "to", raw: string) => {
      setDraft(null);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      onChange(clampFrameRange({ ...value, [field]: parsed }, total));
    },
    [onChange, total, value],
  );

  return (
    <div className="flex flex-col gap-3" data-frame-range>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span id={groupId} className="text-label font-semibold text-fg">
          {label}
        </span>
        <span className="tabular text-caption text-fg-secondary" data-frame-count>
          {t("selected", { count: frameRangeCount(value) })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["from", "to"] as const).map((field) => (
          <label key={field} className="flex flex-col gap-1">
            <span className="text-caption text-fg-muted">
              {t(field === "from" ? "first" : "last")}
            </span>
            <input
              type="number"
              inputMode="numeric"
              data-frame-field={field}
              aria-describedby={groupId}
              className={cn(
                "tabular w-full rounded-control border border-line-control bg-surface-1 px-2 py-1.5 text-sm",
                "disabled:bg-surface-2 disabled:text-fg-disabled",
              )}
              min={1}
              max={total}
              step={1}
              disabled={disabled}
              value={draft?.field === field ? draft.value : String(value[field])}
              onChange={(event) => setDraft({ field, value: event.target.value })}
              onBlur={(event) => commit(field, event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                commit(field, event.currentTarget.value);
              }}
            />
          </label>
        ))}
      </div>

      <button
        type="button"
        disabled={disabled || totalFrames === null}
        className={cn(
          "self-start rounded-control px-2 py-1 text-caption font-medium text-brand underline-offset-2",
          "hover:underline disabled:cursor-not-allowed disabled:text-fg-disabled disabled:no-underline",
        )}
        onClick={() => onChange({ from: 1, to: Math.max(1, totalFrames ?? 1) })}
      >
        {t("selectAll")}
      </button>
    </div>
  );
}
