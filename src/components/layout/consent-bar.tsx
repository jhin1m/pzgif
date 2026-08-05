"use client";

import { useActionBarVisible } from "@/components/tool/action-bar-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Consent bar — the *treatment*, specified in Phase 3 rather than Phase 10.
 *
 * ── Why the visual design cannot wait for the CMP ──────────────────────────
 * Every certified CMP ships a default mobile layout that is a bottom sheet or a
 * centred overlay taking 30-50% of a 667px viewport. Dropped onto a tool page
 * that would break this project's hardest acceptance criterion — *the dropzone
 * must be fully visible at 375×667 without scrolling* (design principle #1) —
 * and it would break it on the exact surface the conversion depends on. By the
 * time Phase 10 is choosing a vendor, "make the banner smaller" is a
 * configuration fight; deciding the shape now makes it a requirement instead.
 *
 * So: a compact bottom bar with a **reserved height**, never an overlay, never
 * covering the dropzone, and never coexisting with the sticky action bar — it
 * stands down through the same `BottomBarProvider` the anchor ad uses.
 *
 * This component renders the shell and the buttons. Phase 10 owns consent state,
 * Consent Mode v2 signalling and the preference dialog behind "Manage". Nothing
 * here writes a cookie or stores anything.
 */

export interface ConsentBarProps {
  message: string;
  acceptLabel: string;
  rejectLabel: string;
  manageLabel: string;
  onAccept?: () => void;
  onReject?: () => void;
  onManage?: () => void;
  className?: string;
}

export function ConsentBar({
  message,
  acceptLabel,
  rejectLabel,
  manageLabel,
  onAccept,
  onReject,
  onManage,
  className,
}: ConsentBarProps) {
  const actionBarVisible = useActionBarVisible();
  if (actionBarVisible) return null;

  return (
    <div
      // Not `role="dialog"`: this is a non-modal bar that never takes focus, and
      // a dialog role with no focus management is announced as something the
      // user is inside. The label is short so the message is not read twice.
      role="region"
      aria-label="Cookie consent"
      className={cn(
        // `sticky`, not `fixed`: a fixed bar sits on top of the page content,
        // and the one thing it must never sit on top of is the dropzone.
        "sticky bottom-0 z-[var(--z-action-bar)] border-t border-line bg-surface-raised",
        "px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        "shadow-[var(--shadow-bar)]",
        className,
      )}
    >
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-caption text-fg-secondary">
          {message}
        </p>
        <div className="flex flex-none items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onManage}>
            {manageLabel}
          </Button>
          <Button variant="secondary" size="sm" onClick={onReject}>
            {rejectLabel}
          </Button>
          <Button variant="primary" size="sm" onClick={onAccept}>
            {acceptLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
