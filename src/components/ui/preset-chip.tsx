import { cn } from "@/lib/utils";
import type { ForcedState } from "./forced-state";

/**
 * Preset chip — the picker in `docs/wireframe/discord-preset.html`, shipped as a
 * component here so Phase 8 inherits its states rather than reinventing them.
 *
 * It is a real `<button aria-pressed>`, not a radio painted as a pill: the
 * Discord hub lets a visitor flip between presets repeatedly while a file is
 * loaded, and `aria-pressed` is what announces that as a toggle rather than as a
 * navigation.
 *
 * 44px min-height, so it already clears the touch floor without extra padding.
 *
 * The dimensions shown here come from whatever Phase 8 passes in. Do not
 * hard-code the wireframe's numbers anywhere — `design-guidelines.md` §10 lists
 * a "Banner 680×240" that matches no Discord surface, and correcting that is
 * Phase 8's job.
 */

export interface PresetChipProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  label: string;
  /** e.g. "128×128". Rendered in mono so a column of chips lines up. */
  dimensions?: string;
  selected?: boolean;
  /** Screenshot support for /dev/states. Never set this in product code. */
  forceState?: ForcedState;
}

export function PresetChip({
  label,
  dimensions,
  selected = false,
  disabled,
  forceState,
  className,
  ...props
}: PresetChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      data-force={forceState}
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill px-4",
        "border border-line bg-surface-1 text-sm font-medium text-fg-secondary",
        "transition-[background-color,border-color,color] duration-[120ms] ease-out",
        "hover:border-line-hover hover:bg-surface-2",
        "data-[force=hover]:border-line-hover data-[force=hover]:bg-surface-2",
        "aria-pressed:border-brand aria-pressed:bg-brand-subtle aria-pressed:font-semibold aria-pressed:text-brand",
        "disabled:cursor-not-allowed disabled:opacity-50",
        forceState === "focus" && "force-focus",
        className,
      )}
      {...props}
    >
      <span>{label}</span>
      {dimensions ? (
        <span
          className={cn(
            "tabular text-caption",
            selected ? "text-brand" : "text-fg-muted",
          )}
        >
          {dimensions}
        </span>
      ) : null}
    </button>
  );
}
