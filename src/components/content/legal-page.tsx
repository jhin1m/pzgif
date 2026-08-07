import type { LegalContent } from "@/lib/content/legal";
import { InlineCopy } from "./inline-copy";

/**
 * The one renderer behind all six legal and trust pages.
 *
 * ── Shared chrome, never shared prose ───────────────────────────────────────
 * This component owns the *shape* of a legal page — a title, a lead, a date and
 * a run of sections. It owns none of the words. That is the same split
 * `registry.ts` and the tool content files draw, and it holds here for a second
 * reason: six pages rendered from one template would be fine, six pages *written*
 * from one template would be the scaled-content pattern.
 *
 * ── No ad slot ──────────────────────────────────────────────────────────────
 * `ToolExplainer` places a unit after ~150 words. Nothing here does. An ad
 * inside a Privacy Policy is what an ad-network reviewer opens the Privacy
 * Policy to check for, and these are the pages whose entire job is being
 * credible.
 *
 * ── Server only ─────────────────────────────────────────────────────────────
 * No state, no interaction, no client boundary — every one of these routes has
 * to stay statically prerenderable or `pnpm check:static` fails.
 */
export function LegalPage({
  content,
  children,
}: {
  content: LegalContent;
  /**
   * Rendered after the last section.
   *
   * Exists for one page: Contact, whose whole purpose is a reachable address and
   * which therefore needs a real `mailto:` rather than an address a reader has
   * to select and copy. Keeping it a slot rather than a `contactEmail` prop
   * stops the renderer growing a branch per page.
   */
  children?: React.ReactNode;
}) {
  return (
    <main id="main" className="mx-auto max-w-[68ch] px-4 py-12 sm:px-6">
      <h1 className="font-display text-h1 font-bold text-fg">
        {content.title}
      </h1>

      <p className="mt-4 text-lead leading-relaxed text-fg-secondary">
        <InlineCopy text={content.lead} />
      </p>

      {/* `dateTime` carries the machine-readable value; the visible text is the
          same string, because an unambiguous ISO date is more useful to a reader
          checking whether a policy changed than a localised one is pretty. */}
      <p className="mt-6 border-b border-line pb-6 text-caption text-fg-muted">
        Last updated{" "}
        <time dateTime={content.updated} className="tabular">
          {content.updated}
        </time>
      </p>

      {content.sections.map((section) => (
        <section key={section.heading}>
          {section.level === 2 ? (
            <h2 className="mt-10 font-display text-h2 font-bold text-fg">
              {section.heading}
            </h2>
          ) : (
            <h3 className="mt-8 font-display text-h3 font-medium text-fg">
              {section.heading}
            </h3>
          )}
          {section.paragraphs.map((paragraph, index) => (
            <p
              key={index}
              className="mt-3 text-body leading-relaxed text-fg-secondary"
            >
              <InlineCopy text={paragraph} />
            </p>
          ))}
        </section>
      ))}

      {children}
    </main>
  );
}
