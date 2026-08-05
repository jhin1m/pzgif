"use client";

import { Select as SelectPrimitive } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Select — docs/design-guidelines.md §5.5.
 *
 * Radix, never a hand-rolled listbox: typeahead, roving focus, Escape semantics,
 * scroll locking and the collision-aware popover are all things a custom widget
 * gets subtly wrong, and this control sits in the middle of the job flow.
 *
 * The popover is pinned to `--z-popover` (§4.4) so it clears the sticky header
 * and the mobile action bar but stays under toasts.
 */

export const SelectRoot = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex min-h-10 w-full items-center justify-between gap-2 rounded-control",
        "border border-line-control bg-surface-1 px-3 text-sm text-fg",
        "cursor-pointer transition-colors duration-[120ms] ease-out",
        "hover:border-line-control-hover",
        "data-[state=open]:border-brand",
        "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-disabled",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          className="size-4 flex-none text-fg-muted"
          aria-hidden="true"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        className={cn(
          "z-[var(--z-popover)] min-w-[var(--radix-select-trigger-width)] overflow-hidden",
          "rounded-panel border border-line bg-surface-raised p-1 shadow-md",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-control px-2.5 text-sm outline-none",
        "data-[highlighted]:bg-brand-subtle",
        "data-[state=checked]:font-semibold data-[state=checked]:text-brand",
        "data-[disabled]:pointer-events-none data-[disabled]:text-fg-disabled",
        className,
      )}
      {...props}
    >
      {/* The box is always there, the tick is not — otherwise selecting an item
          would shift every label in the menu by 16px. */}
      <span className="flex size-4 flex-none items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden="true" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
