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
