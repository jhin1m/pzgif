"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SettingsPanel — the card that holds a tool's controls (§10, tool archetype).
 *
 * A deliberately thin container: the vertical rhythm from §4.1 (label→control 8,
 * control→control 16, group→group 24) is the only thing it owns, so every tool
 * page spaces its controls identically without each one re-deciding.
 *
 * §8 forbids an ad inside a tool panel or between the settings and the primary
 * action, so nothing here accepts an ad slot — the slot map lives in the page
 * layout, never in this box.
 */

export function SettingsPanel({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-card border border-line bg-surface-1 p-5 shadow-sm md:p-6",
        className,
      )}
    >
      {title ? (
        <h2 className="font-sans text-h4 font-semibold text-fg">{title}</h2>
      ) : null}
      {description ? (
        <p className="mt-1 text-caption text-fg-muted">{description}</p>
      ) : null}
      <div
        className={cn("flex flex-col gap-4", (title || description) && "mt-4")}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * The controls, as a disclosure below `lg` and always open at or above it.
 *
 * ── Why it collapses only where it changes something ───────────────────────
 * At `≥lg` the settings have their own grid column beside the stage, so
 * collapsing them would hide a panel and move nothing. Below `lg` the shell is
 * one column and the panel sits between the stage and the explainer, the FAQ,
 * the related tools and the reserved ad slot — which is where an open panel
 * pushes the primary action off the first screen.
 *
 * ── Why the mechanism is CSS and nothing else ──────────────────────────────
 * `grid-template-rows: 0fr → 1fr` on content that never leaves the layout is
 * the same technique §5.12 uses for the FAQ, and for the same reason: every
 * control label and hint must stay in the served HTML. `lg:grid-rows-[1fr]`
 * then forces it open, and it wins over `.pz-acc-panel[data-state]` because
 * utilities sit in a later cascade layer than `@layer components` — no
 * specificity war and no `!important`.
 *
 * `hidden="until-found"` is deliberately **not** carried over from
 * `accordion.tsx`. It has to be attached imperatively, and at `≥lg` it would
 * apply `display: none` to a panel this CSS says is open. §5.12 wants it for
 * FAQ *prose*, which is the crawl surface; a Width slider is not that.
 *
 * ── `toggleLabel`: a disclosure at every width ─────────────────────────────
 * Passing it opts a tool out of the forced-open `≥lg` behaviour above, so the
 * panel starts collapsed on a desktop too and the visitor opens it deliberately.
 * That is only correct for a tool whose preset chips are a complete answer on
 * their own — the compressor, where three chips cover what almost everyone
 * wants and the four controls below are the exception. It also changes the
 * affordance: a bare chevron is discoverable enough beside a heading a visitor
 * already expected to be open, but not when the panel is the *only* way to
 * reach the controls, so the word is rendered rather than implied.
 */
export function SettingsDisclosure({
  id,
  heading,
  aside,
  open,
  onToggle,
  toggleLabel,
  children,
}: {
  /** Unique per route. Becomes the heading and panel DOM ids. */
  id: string;
  heading: string;
  /** Reset, or the waiting/locked badge. Stays visible while collapsed. */
  aside: React.ReactNode;
  open: boolean;
  onToggle(): void;
  /**
   * Visible text on the toggle — "Show" / "Hide", supplied by the page because
   * the wording is a message-catalogue string and this file takes no `t`.
   *
   * Its presence is what keeps the panel collapsible at `≥lg`.
   */
  toggleLabel?: string;
  children: React.ReactNode;
}) {
  const headingId = `${id}-settings-heading`;
  const panelId = `${id}-settings-panel`;
  /** Collapsible at every width, rather than forced open from `lg` up. */
  const alwaysCollapsible = toggleLabel !== undefined;

  const toggleButton = (
    <button
      type="button"
      // Without a visible label, named by the heading rather than by a string of
      // its own: a button whose accessible name is "Settings" and whose state is
      // `aria-expanded` announces exactly what it does, and adds no sentence to
      // the message catalogue. With one, the visible word *is* the name — WCAG
      // 2.5.3 wants the two to match, and an `aria-labelledby` pointing
      // elsewhere would override the text a speech-input user reads off the
      // screen. `aria-describedby` carries "Settings" instead, so the row still
      // announces what it opens.
      aria-labelledby={alwaysCollapsible ? undefined : headingId}
      aria-describedby={alwaysCollapsible ? headingId : undefined}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1",
        "rounded-control text-fg-muted transition-colors duration-[120ms] ease-out",
        "hover:bg-surface-2 hover:text-fg",
        alwaysCollapsible
          ? "min-h-11 w-full border border-line text-label font-semibold"
          : "-mr-1.5 size-11 flex-none lg:hidden",
      )}
    >
      {toggleLabel}
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "size-5 transition-transform duration-150 ease-out",
          open && "rotate-180 text-brand",
        )}
      />
    </button>
  );

  return (
    <>
      {/* Flat children, and deliberately not a heading plus a wrapper around the
          rest. `aside` swaps a wide badge for a narrow button when a file loads:
          as two sibling elements that is a replacement, which scores no layout
          shift, but inside a shared wrapper it becomes one element whose box
          changes — and Chromium scores that, on a transition that happens
          seconds after the file picker opened and so is not excused as prompted.
          Measured at 0.0008 before this was flattened. */}
      <div className="flex items-center justify-between gap-3">
        <span
          id={headingId}
          className="mr-auto font-sans text-h4 font-semibold text-fg"
        >
          {heading}
        </span>
        {aside}
        {/* Inline only where it is an icon. A labelled toggle is ~80px wide, and
            in the settings column that is enough of the row to make the "Waiting
            for a file" badge wrap to two lines — so the row shrank by 11px when
            the badge was replaced by Reset, moving its own contents, seconds
            after the file picker opened. Measured at 0.000075. Its own row has
            no horizontal contention and therefore no state-dependent height. */}
        {alwaysCollapsible ? null : toggleButton}
      </div>
      {alwaysCollapsible ? toggleButton : null}

      <div
        id={panelId}
        data-state={open ? "open" : "closed"}
        className={cn(
          "pz-acc-panel",
          !alwaysCollapsible && "lg:grid-rows-[1fr]",
          // `grid-template-rows: 0fr` clips the panel; it does not take it out
          // of the tab order or the accessibility tree. Without this a keyboard
          // or screen-reader user at 768px tabs off the toggle straight into
          // five controls they cannot see. `visibility: hidden` removes them
          // from both, is inherited by every descendant, and — unlike
          // `display: none` — leaves the labels in the layout and therefore in
          // the served HTML, which is the whole reason the collapse is built
          // this way. The `lg:` half re-shows them where the panel is forced
          // open and the toggle is not rendered at all.
          "data-[state=closed]:invisible",
          !alwaysCollapsible && "lg:data-[state=closed]:visible",
        )}
      >
        <div>
          <div className="flex flex-col gap-4">{children}</div>
        </div>
      </div>
    </>
  );
}

/** A labelled cluster of related controls. 24px from the next group (§4.1). */
export function SettingsGroup({
  legend,
  children,
  className,
}: {
  legend?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex flex-col gap-4 border-0 p-0", className)}>
      {legend ? (
        <legend className="mb-2 text-label font-semibold text-fg-secondary">
          {legend}
        </legend>
      ) : null}
      {children}
    </fieldset>
  );
}
