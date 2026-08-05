"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accordion — docs/design-guidelines.md §5.12.
 *
 * ── Why this is not Radix ───────────────────────────────────────────────────
 * Radix unmounts closed content, and with `forceMount` it applies the plain
 * `hidden` attribute instead. Both are `display: none` to a crawler. Every FAQ
 * answer on this site has to be in the served HTML and reachable — that is the
 * entire content strategy — so the open/closed state is expressed as
 * `grid-template-rows: 0fr → 1fr` on content that never leaves the layout.
 *
 * ── The `hidden="until-found"` trap, and why it is applied at runtime ───────
 * §5.12 mandates `hidden="until-found"` so Chrome's find-in-page can reveal a
 * closed answer. **Safari does not support it**, and the attribute's
 * invalid-value default is the plain *hidden* state — so on Safari the answer
 * would be `display: none` and the accordion could not open it at all. That is a
 * broken FAQ for every iOS visitor, on the pages the ranking strategy depends
 * on.
 *
 * So the attribute is never rendered. Panels ship visible-but-collapsed, and
 * `until-found` is attached imperatively after mount, only where
 * `onbeforematch` exists. Crawlability holds either way, because the answer is
 * in the SSG HTML in both branches.
 */

export interface AccordionItem {
  /** Stable across renders — it becomes the panel's DOM id. */
  id: string;
  question: React.ReactNode;
  answer: React.ReactNode;
}

export interface AccordionProps {
  items: readonly AccordionItem[];
  /** Single-open by default, which is what the FAQ archetype (§10) shows. */
  defaultOpenId?: string;
  className?: string;
  /** Screenshot support for /dev/states: paints a header as focus-visible. */
  forceFocusId?: string;
}

export function Accordion({
  items,
  defaultOpenId,
  className,
  forceFocusId,
}: AccordionProps) {
  const baseId = useId();
  const [openId, setOpenId] = useState<string | undefined>(defaultOpenId);

  return (
    <div className={cn("border-t border-line", className)}>
      {items.map((item) => (
        <AccordionRow
          key={item.id}
          item={item}
          baseId={baseId}
          open={openId === item.id}
          onToggle={() =>
            setOpenId((current) => (current === item.id ? undefined : item.id))
          }
          onRevealedByFind={() => setOpenId(item.id)}
          forceFocus={forceFocusId === item.id}
        />
      ))}
    </div>
  );
}

function AccordionRow({
  item,
  baseId,
  open,
  onToggle,
  onRevealedByFind,
  forceFocus,
}: {
  item: AccordionItem;
  baseId: string;
  open: boolean;
  onToggle: () => void;
  onRevealedByFind: () => void;
  forceFocus: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headerId = `${baseId}-${item.id}-header`;
  const panelId = `${baseId}-${item.id}-panel`;

  /**
   * Find-in-page revealed a closed answer. The browser has already dropped the
   * attribute; React still believes the row is closed, so the state is corrected
   * here — otherwise the next toggle would try to "open" an already-open row.
   */
  const handleBeforeMatch = useCallback(
    () => onRevealedByFind(),
    [onRevealedByFind],
  );

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // Feature detection, not a browser sniff: this is exactly the capability
    // being used, and it is absent in Safari.
    if (!("onbeforematch" in document.body)) return;

    if (open) {
      panel.removeAttribute("hidden");
      return;
    }
    panel.setAttribute("hidden", "until-found");
    panel.addEventListener("beforematch", handleBeforeMatch);
    return () => panel.removeEventListener("beforematch", handleBeforeMatch);
  }, [open, handleBeforeMatch]);

  return (
    <div className="border-b border-line">
      <h3>
        <button
          type="button"
          id={headerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={cn(
            "flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 px-2 py-3",
            "bg-transparent text-left font-display text-h4 font-medium text-fg",
            "transition-colors duration-[120ms] ease-out hover:bg-surface-1",
            // Inset, so the ring does not clip against the divider (§5.12).
            "focus-visible:outline-offset-[-2px]",
            forceFocus && "force-focus",
          )}
        >
          {item.question}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4.5 flex-none text-fg-muted transition-transform duration-150 ease-out",
              open && "rotate-180 text-brand",
            )}
          />
        </button>
      </h3>
      <div
        ref={panelRef}
        id={panelId}
        // Deliberately not `role="region"`: the APG only recommends it for a
        // handful of panels, and a FAQ page would otherwise add a landmark per
        // question. `aria-expanded` + `aria-controls` on the header is the pair
        // that carries the relationship.
        data-state={open ? "open" : "closed"}
        className="pz-acc-panel"
      >
        <div>
          <div className="max-w-[68ch] px-2 pb-5 pt-0 text-body text-fg-secondary">
            {item.answer}
          </div>
        </div>
      </div>
    </div>
  );
}
