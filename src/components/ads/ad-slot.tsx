"use client";

import { useActionBarVisible } from "@/components/tool/action-bar-context";
import { cn } from "@/lib/utils";

/**
 * AdSlot — docs/design-guidelines.md §5.10 and §8 (binding).
 *
 * At MVP this renders **reserved and empty**, and that is the correct end state
 * for Phase 3: no network is activated at launch, so the box exists to prove the
 * layout holds when one is. Phase 10 adds the provider that fills it.
 *
 * ── What this component is actually for ─────────────────────────────────────
 * Two things that are policy, not styling:
 *
 *  1. **Reservation.** The box is in the static HTML with its size in CSS and
 *     `contain: layout size`, so a fill — whenever it happens — cannot reflow the
 *     page. §8.2 forbids injecting the container after hydration. CLS = 0 with
 *     slots reserved and unfilled is a hard acceptance criterion.
 *  2. **Quarantine.** 6px radius, flat fill, 1px border, no shadow, and a label
 *     that is always present (§5.10). The 6px-vs-16px radius mismatch against
 *     every product surface is the deliberate "this is not app UI" signal, which
 *     is why `--radius-ad` is a reserved word and why a test asserts no product
 *     component reaches for it.
 *
 * Placement is the caller's job and is constrained by §8.1: never above the fold
 * on a tool page, never inside a tool panel, never between the settings and the
 * primary action, and never within 24px of one — the `margin-block: 24px` on
 * `.ad-slot` is that clearance, not decoration.
 */

export type AdSlotVariant = "rect" | "inline" | "rail" | "anchor";

export interface AdSlotProps {
  variant: AdSlotVariant;
  /** Slot name from the §8.1 map, e.g. "result-rect". Instrumentation only. */
  name: string;
  className?: string;
}

export function AdSlot({ variant, name, className }: AdSlotProps) {
  const actionBarVisible = useActionBarVisible();

  // §8.1: the anchor unit is the one permitted sticky ad, and it is mutually
  // exclusive with the sticky action bar. Enforced here so no page can forget.
  // The flag is known at render time, on the server too, so this decision is
  // made before the HTML is written rather than by unmounting after hydration.
  if (variant === "anchor" && actionBarVisible) return null;

  return (
    <div
      data-ad-slot={name}
      // Not `aria-hidden`: an empty labelled box is what a screen-reader user
      // should find here, and hiding it would misrepresent the page.
      role="complementary"
      aria-label="Advertisement"
      className={cn(
        "ad-slot",
        variant === "rect" && "ad-slot--rect",
        variant === "inline" && "ad-slot--inline",
        variant === "rail" && "ad-slot--rail",
        variant === "anchor" && "ad-slot--anchor",
        className,
      )}
    />
  );
}
