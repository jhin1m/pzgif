/* eslint-disable @next/next/no-img-element -- The source is a `blob:` URL made
   in this tab. `next/image` cannot optimise a file that never had a network URL,
   and its loader would try to fetch a blob through the image optimiser. Same
   reasoning as `gif-workbench.tsx`. */

import { cn } from "@/lib/utils";

/**
 * "How it will look in a message" — the result shown at the size Discord
 * actually renders it.
 *
 * ── Why this is worth a component ──────────────────────────────────────────
 * The decision a visitor is making here is not "is this file small enough" — the
 * budget bar already answers that — it is "is this still readable once Discord
 * has shrunk it". An emoji is authored at 128×128 and displayed at 32px inline,
 * a 4x reduction that turns fine detail into mush, and no competitor shows it
 * before you upload. Seeing it is often what sends someone back to crop tighter,
 * which is a better outcome than discovering it in a channel.
 *
 * ── Why the sizes are props ────────────────────────────────────────────────
 * Each surface renders at its own size and this component states none of them.
 * That is deliberate: the figures belong beside the rest of the preset data,
 * where they carry a source and a date, rather than buried in a shared
 * component where nobody re-verifies them. The captions are hand-written per
 * page for the same reason every other sentence here is.
 */

export interface PreviewSample {
  /** Rendered edge length in CSS pixels. */
  px: number;
  /** Hand-written label, e.g. "inline, beside text". */
  label: string;
}

export interface DiscordPreviewProps {
  /** Object URL of the produced file. */
  url: string;
  alt: string;
  /** The heading above the mock, written per page. */
  caption: string;
  /** The line of chat text the sample sits in, written per page. */
  message: string;
  samples: readonly PreviewSample[];
  className?: string;
}

export function DiscordPreview({
  url,
  alt,
  caption,
  message,
  samples,
  className,
}: DiscordPreviewProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)} data-discord-preview>
      <p className="text-caption text-fg-muted">{caption}</p>

      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface-2 p-3.5">
        {samples.map((sample, index) => (
          <div key={sample.px} className="flex items-center gap-2.5">
            <span
              // Fixed box at the sample's own size, so the row's height is
              // decided before the image loads. A blob decoding a beat later
              // must not move the download button underneath it.
              className="flex flex-none items-center justify-center overflow-hidden rounded-xs"
              style={{ width: sample.px, height: sample.px }}
            >
              <img
                src={url}
                // Only the first sample is announced. The others are the same
                // file at another size, and three identical alt texts in a row
                // is noise for the reader who most needs the panel to be quiet.
                alt={index === 0 ? alt : ""}
                aria-hidden={index === 0 ? undefined : true}
                className="size-full object-contain"
              />
            </span>
            {index === 0 ? (
              <span className="text-body text-fg-secondary">{message}</span>
            ) : null}
            <span className="ml-auto text-caption text-fg-muted">{sample.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
