"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PresetChip } from "@/components/ui/preset-chip";
import type { CropRect } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import {
  applyAspect,
  aspectValue,
  clampCropRect,
  fullFrameRect,
  type CropBounds,
} from "./crop-rect";

/**
 * The typed route to the same rectangle the overlay drags.
 *
 * §7.3 forbids a drag-only path, and this is the half that satisfies it as a
 * first-class control rather than an afterthought: four number inputs in source
 * pixels, plus the shape presets, sitting in the settings panel where every
 * other tool's controls live. Someone handed exact coordinates never has to
 * touch the rectangle at all.
 *
 * ── Why the value is committed on blur ─────────────────────────────────────
 * Clamping on every keystroke makes a number input unusable: typing "300" into
 * a field whose minimum is 16 becomes "16" the moment the "3" lands. So the
 * keystrokes go into a draft and the clamp runs when the field is left or Enter
 * is pressed. Only one field can be focused, so one draft is enough.
 */

type Field = "x" | "y" | "width" | "height";

const FIELDS: readonly Field[] = ["x", "y", "width", "height"];

export function CropFields({
  rect,
  bounds,
  aspect,
  onChange,
  onAspectChange,
  presets,
  disabled = false,
  label,
}: {
  rect: CropRect;
  bounds: CropBounds;
  /** Ratio held while dragging, or null for free. */
  aspect: number | null;
  onChange(rect: CropRect): void;
  onAspectChange(preset: string, rect: CropRect): void;
  /** Hand-written preset labels, in the order they are offered. */
  presets: readonly { value: string; label: string }[];
  disabled?: boolean;
  /** The group label. Hand-written per tool. */
  label: string;
}) {
  const t = useTranslations("crop");
  const [draft, setDraft] = useState<{ field: Field; value: string } | null>(null);

  const commit = (field: Field, raw: string) => {
    setDraft(null);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const next = clampCropRect({ ...rect, [field]: parsed }, bounds);
    onChange(
      aspect !== null && (field === "width" || field === "height")
        ? applyAspect(next, aspect, bounds)
        : next,
    );
  };

  const selectPreset = (preset: string) => {
    const ratio = aspectValue(preset);
    // Reshaping from the current rectangle rather than from the whole frame
    // keeps the region the user already framed; only its proportions move.
    const reshaped =
      ratio === null
        ? clampCropRect(rect, bounds)
        : applyAspect(rect, ratio, bounds);
    onAspectChange(preset, reshaped);
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-label font-semibold text-fg">{label}</span>

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <PresetChip
            key={preset.value}
            label={preset.label}
            disabled={disabled}
            selected={
              aspect === null
                ? preset.value === "free"
                : aspectValue(preset.value) === aspect
            }
            onClick={() => selectPreset(preset.value)}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((field) => (
          <label key={field} className="flex flex-col gap-1">
            <span className="text-caption text-fg-muted">
              {t(`fields.${field}`)}
            </span>
            <input
              type="number"
              inputMode="numeric"
              data-crop-field={field}
              className={cn(
                "tabular w-full rounded-control border border-line-control bg-surface-1 px-2 py-1.5 text-sm",
                "disabled:bg-surface-2 disabled:text-fg-disabled",
              )}
              min={0}
              max={field === "width" || field === "x" ? bounds.width : bounds.height}
              step={field === "width" || field === "height" ? 2 : 1}
              disabled={disabled}
              value={
                draft?.field === field ? draft.value : String(rect[field])
              }
              onChange={(event) =>
                setDraft({ field, value: event.target.value })
              }
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
        disabled={disabled}
        className={cn(
          "self-start rounded-control px-2 py-1 text-caption font-medium text-brand underline-offset-2",
          "hover:underline disabled:cursor-not-allowed disabled:text-fg-disabled disabled:no-underline",
        )}
        onClick={() => onChange(fullFrameRect(bounds, aspect))}
      >
        {t("selectAll")}
      </button>
    </div>
  );
}
