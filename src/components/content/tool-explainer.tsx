import { AdSlot } from "@/components/ads/ad-slot";
import { InlineCopy, wordCount } from "./inline-copy";
import type { ExplainerSection } from "@/lib/tools/content";
import { cn } from "@/lib/utils";

/**
 * The hand-written explainer that sits below the tool.
 *
 * ── This renders copy; it never generates it ────────────────────────────────
 * Every heading and every paragraph arrives from a per-tool `.json` file written
 * by hand. There is no interpolation here, no "compress your {format} file"
 * substitution, and there must never be one: 14 near-identical pages filled from
 * one template is the shape Google's scaled-content-abuse policy penalises, and
 * that penalty lands site-wide rather than on the offending page.
 *
 * ── Where the in-content ad goes, and why it is placed here ─────────────────
 * `design-guidelines.md` §8.1 puts one 336×280 unit inside the explainer, after
 * roughly 150 words. Counting the words is the only way to honour "after ~150
 * words" without hard-coding an index per tool — a tool whose first section runs
 * long would otherwise get its ad in the middle of the fold-line, and a tool with
 * a short first section would get it before the reader has been given anything.
 *
 * The slot is emitted between two sections, never inside a paragraph run, so it
 * always has a heading boundary above and below it. §8.3's 24px clearance comes
 * from `.ad-slot`'s own `margin-block`.
 */

/** §8.1: "inside the explainer, after ~150 words". */
const AD_AFTER_WORDS = 150;

export function ToolExplainer({
  sections,
  className,
}: {
  sections: readonly ExplainerSection[];
  className?: string;
}) {
  // Resolved once, ahead of the render, so the decision is visible as data
  // rather than as a mutable counter threaded through JSX.
  const adAfterIndex = adBoundary(sections);

  return (
    <section className={cn("max-w-[68ch]", className)}>
      {sections.map((section, index) => (
        <div key={section.heading}>
          {section.level === 2 ? (
            <h2 className="mt-10 font-display text-h2 font-bold text-fg first:mt-0">
              {section.heading}
            </h2>
          ) : (
            <h3 className="mt-8 font-display text-h3 font-medium text-fg">
              {section.heading}
            </h3>
          )}
          {section.paragraphs.map((paragraph, paragraphIndex) => (
            <p
              key={paragraphIndex}
              className="mt-3 text-body leading-relaxed text-fg-secondary"
            >
              <InlineCopy text={paragraph} />
            </p>
          ))}
          {index === adAfterIndex ? (
            <AdSlot variant="inline" name="content-inline" />
          ) : null}
        </div>
      ))}
    </section>
  );
}

/**
 * Index of the section the ad follows, or -1 when the explainer is too short to
 * carry one.
 *
 * Short-page suppression is deliberate: an ad after the only two paragraphs on a
 * page is the ad-density problem §8.4 exists to avoid, and it is not worth an
 * impression on a page that has not earned the reader's attention yet.
 */
export function adBoundary(sections: readonly ExplainerSection[]): number {
  if (sections.length < 2) return -1;
  let running = 0;
  for (const [index, section] of sections.entries()) {
    running += wordCount(section.paragraphs);
    // Never after the last section — that is below the explainer, not inside it,
    // and §8.1 already reserves a unit there.
    if (running >= AD_AFTER_WORDS && index < sections.length - 1) return index;
  }
  return -1;
}
