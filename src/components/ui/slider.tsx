"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import type { ForcedState } from "./forced-state";

/**
 * Slider — docs/design-guidelines.md §5.4.
 *
 * A native `<input type="range">`, never a custom widget. That is what makes
 * ←/→, PgUp/PgDn and Home/End work, what makes it announce correctly, and what
 * keeps the drag on the compositor. §5.4 also requires a paired number input for
 * exact entry on desktop, because dragging a range to "exactly 64 colours" is a
 * fight the user should not have to win.
 *
 * The readout container is a fixed `6ch` of tabular mono so the label row cannot
 * reflow as the number ticks between 8 and 100 (§3).
 */

export interface SliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  /** Controlled value. Omit for an uncontrolled slider. */
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  disabled?: boolean;
  /** Appended to the readout, e.g. "%" or " fps". Never changes its width class. */
  unit?: string;
  /** §5.4 wants exact entry on desktop; suppress it where there is no room. */
  showNumberInput?: boolean;
  hint?: string;
  className?: string;
  /** Screenshot support for /dev/states. Never set this in product code. */
  forceState?: ForcedState;
}

export function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  defaultValue,
  onValueChange,
  disabled = false,
  unit = "",
  showNumberInput = true,
  hint,
  className,
  forceState,
}: SliderProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [internal, setInternal] = useState(defaultValue ?? min);
  const current = value ?? internal;

  /**
   * What the number field shows while it is being typed in.
   *
   * Clamping on every keystroke makes exact entry impossible: on a 16-256
   * control, typing "128" clamps "1" to 16 on the first key and the field can
   * never reach the value the user is aiming at. So the draft is held as typed
   * and only committed when it parses inside the range; leaving the field
   * resolves whatever is left.
   */
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (value === undefined) setInternal(clamped);
    onValueChange?.(clamped);
    return clamped;
  };

  const fill = max === min ? 0 : ((current - min) / (max - min)) * 100;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={id}
        className="flex items-baseline justify-between gap-3 text-label font-semibold text-fg"
      >
        <span>{label}</span>
        {/* Fixed width and left-aligned, where this was `min-w-[6ch]` and
            right-aligned. `ch` is measured in the current font, so the box
            narrowed the moment JetBrains Mono replaced the fallback; and a
            right-aligned value pins its right edge, so the probe rewriting
            "1280 px" to "480 px" moved the glyphs leftward — an un-prompted
            shift, since the probe answers on its own schedule and not on a
            click. Left-aligned, the start edge is fixed and a longer value only
            grows into the trailing gap. 64px clears the widest value any
            current control produces in either face. */}
        <span
          className={cn(
            "tabular w-16 whitespace-nowrap text-left text-label font-medium",
            disabled ? "text-fg-disabled" : "text-fg-secondary",
          )}
        >
          {current}
          {unit}
        </span>
      </label>

      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          className="pz-range"
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          data-force={forceState}
          aria-describedby={hint ? hintId : undefined}
          style={{ "--fill": `${fill}%` } as React.CSSProperties}
          onChange={(event) => commit(Number(event.target.value))}
        />
        {showNumberInput ? (
          <input
            type="number"
            className={cn(
              "tabular hidden w-18 rounded-control border border-line-control bg-surface-1 px-2 py-1 text-sm md:block",
              "disabled:bg-surface-2 disabled:text-fg-disabled",
            )}
            min={min}
            max={max}
            step={step}
            value={draft ?? String(current)}
            disabled={disabled}
            aria-label={`${label} (exact value)`}
            onChange={(event) => {
              const raw = event.target.value;
              setDraft(raw);
              const parsed = Number(raw);
              if (
                raw !== "" &&
                Number.isFinite(parsed) &&
                parsed >= min &&
                parsed <= max
              ) {
                commit(parsed);
              }
            }}
            onBlur={() => {
              if (draft === null) return;
              const parsed = Number(draft);
              if (draft !== "" && Number.isFinite(parsed)) commit(parsed);
              setDraft(null);
            }}
          />
        ) : null}
      </div>

      {hint ? (
        <p id={hintId} className="text-caption text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
