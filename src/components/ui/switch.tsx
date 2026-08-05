"use client";

import { useId } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import type { ForcedState } from "./forced-state";

/**
 * Toggle — docs/design-guidelines.md §5.6.
 *
 * 44×24 track, 20px knob, `transform` + `background-color` only. Radix gives the
 * native `role="switch"` and `aria-checked` semantics, which is what the section
 * asks for; the visible `<label>` is required, not optional — §5.6 forbids an
 * icon-only switch, because "on"/"off" is not inferable from a shape.
 */

export interface SwitchFieldProps {
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Space-separated ids describing the control — its hint, a panel-wide reason. */
  describedBy?: string;
  className?: string;
  /** Screenshot support for /dev/states. Never set this in product code. */
  forceState?: ForcedState;
}

export function SwitchField({
  label,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled = false,
  describedBy,
  className,
  forceState,
}: SwitchFieldProps) {
  const id = useId();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 text-sm",
        disabled && "opacity-50",
        className,
      )}
    >
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={describedBy}
        data-force={forceState}
        className={cn(
          "relative h-6 w-11 flex-none cursor-pointer rounded-pill",
          "bg-control-track transition-colors duration-150 ease-out",
          "data-[state=checked]:bg-brand-fill",
          "hover:brightness-110 data-[force=hover]:brightness-110",
          "disabled:cursor-not-allowed",
          // 24px tall is under the 44px touch floor in §5's shared rules, so the
          // hit area is extended invisibly rather than the control being drawn
          // bigger than its spec.
          "after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
          forceState === "focus" && "force-focus",
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "block size-5 translate-x-0.5 rounded-full bg-bg shadow-sm",
            "transition-transform duration-150 ease-out",
            "data-[state=checked]:translate-x-[22px]",
          )}
        />
      </SwitchPrimitive.Root>
      <label
        htmlFor={id}
        className={cn("cursor-pointer", disabled && "cursor-not-allowed")}
      >
        {label}
      </label>
    </div>
  );
}
