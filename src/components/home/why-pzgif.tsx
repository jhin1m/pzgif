import { Cpu, ShieldOff, Sparkles } from "lucide-react";
import type { WhyTile } from "@/lib/content/home";
import { cn } from "@/lib/utils";

/**
 * The three reasons, and the rule they are written under.
 *
 * Two of these tiles are architectural facts — true by construction, because no
 * server exists in the free path — and carry no `evidence`, because there is
 * nothing to measure about a thing that does not exist. The third is empirical
 * and carries the figure *and* the machine it was measured on, which is what
 * makes it a measurement rather than a mood. `home.test.ts` refuses a figure
 * that no row in `bench-results/` produced.
 *
 * The icons are ordered with the tiles and are decorative: each tile's heading
 * says the same thing in words, so a reader who never sees the glyph loses
 * nothing.
 */

const ICONS = [Cpu, ShieldOff, Sparkles] as const;

export function WhyPzgif({
  tiles,
  className,
}: {
  tiles: readonly WhyTile[];
  className?: string;
}) {
  return (
    <section className={className}>
      <ul className="grid gap-4 md:grid-cols-3">
        {tiles.map((tile, index) => {
          const Icon = ICONS[index % ICONS.length];
          return (
            <li
              key={tile.heading}
              className="flex flex-col gap-2.5 rounded-card border border-line bg-surface-1 p-5"
            >
              <span className="flex size-10 items-center justify-center rounded-control bg-brand-subtle-strong text-brand">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <h2 className="font-display text-h4 font-medium text-fg">
                {tile.heading}
              </h2>
              <p className="text-sm text-fg-secondary">{tile.body}</p>
              {tile.evidence ? (
                // Set apart from the body on purpose. It is the receipt for the
                // sentence above it, and a reader checking a claim should be
                // able to find the number without reading the paragraph again.
                <p
                  className={cn(
                    "tabular mt-auto border-t border-line pt-2.5",
                    "text-caption text-fg-muted",
                  )}
                >
                  {tile.evidence}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
