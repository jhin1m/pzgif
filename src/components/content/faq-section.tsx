import { Accordion } from "@/components/ui/accordion";
import { InlineCopy } from "./inline-copy";
import type { FaqEntry } from "@/lib/tools/content";
import { cn } from "@/lib/utils";

/**
 * The FAQ block. Present in the served HTML on every tool page.
 *
 * ── No `FAQPage` JSON-LD. This is not an oversight ──────────────────────────
 * `design-guidelines.md` §10 asks for schema.org `FAQPage` markup. That guidance
 * predates the change: Google removed FAQ rich results from Search on
 * 2026-05-07 and deleted the documentation on 2026-06-15. Emitting the markup now
 * buys no rich result and adds a structured-data surface that can only ever be
 * flagged.
 *
 * The FAQ **UI** stays, because the reason it earns its place never depended on
 * the rich result: it answers the long-tail question a search actually carried,
 * and it is the part of the page that AI answer surfaces quote. That is why the
 * answers ship expanded-in-the-DOM and collapsed only visually — see
 * `ui/accordion.tsx` for how, and why `hidden="until-found"` is attached at
 * runtime rather than rendered.
 */

export function FaqSection({
  heading,
  entries,
  className,
}: {
  heading: string;
  entries: readonly FaqEntry[];
  className?: string;
}) {
  return (
    <section className={cn("max-w-[68ch]", className)}>
      <h2 className="font-display text-h2 font-bold text-fg">{heading}</h2>
      <Accordion
        className="mt-4"
        // The first answer is open on arrival: a wall of closed rows reads as an
        // empty section, and the opening answer is the one most visitors came for.
        defaultOpenId={entries[0]?.id}
        items={entries.map((entry) => ({
          id: entry.id,
          question: entry.question,
          answer: (
            <div className="flex flex-col gap-3">
              {entry.answer.map((paragraph, index) => (
                <p key={index}>
                  <InlineCopy text={paragraph} />
                </p>
              ))}
            </div>
          ),
        }))}
      />
    </section>
  );
}
