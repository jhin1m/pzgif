import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultPanel, ResultSummary, SizeDelta } from "./result-panel";

/**
 * What this file is protecting.
 *
 * The reservation is the whole CLS mechanism on a tool page: the empty panel is
 * a fixed box in the static HTML, and the result arriving causes no shift only
 * because the space was already there. The two branches sharing one height is
 * not a coincidence to be re-established by inspection each time someone edits
 * the file — it is the invariant, and 0.0147 of measured CLS is what it cost the
 * last time it lapsed.
 *
 * Rendered to static markup rather than to a DOM, for the same reason
 * `progress-bar.test.tsx` is: there is no jsdom here, and these components are
 * pure functions of their props with no effect and no state to observe. What a
 * DOM would add — computed heights — a static render cannot answer anyway; the
 * height is asserted by class equality, which is what the source guarantees.
 */

const EMPTY_ROWS = [
  "A before/after slider you can drag across the two versions",
  "The real byte count of the file you are about to download",
  "Which encoder ran, and how many colours it was allowed",
] as const;

/** Every `min-h-*` class on the outermost element, in source order. */
function reservedHeights(markup: string): string[] {
  const openingTag = /^<div class="([^"]*)"/.exec(markup);
  if (!openingTag) return [];
  return openingTag[1].split(/\s+/).filter((token) => /(^|:)min-h-/.test(token));
}

describe("ResultPanel", () => {
  it("reserves the identical height whether it is empty or filled", () => {
    // The assertion the whole panel exists for. Not "both are tall" — *equal*,
    // because a result that is one pixel taller than its reservation shifts the
    // ad slot below it and everything under that.
    const empty = renderToStaticMarkup(
      <ResultPanel empty emptyMessage="Your compressed GIF will appear here." />,
    );
    const filled = renderToStaticMarkup(
      <ResultPanel>
        <p>done</p>
      </ResultPanel>,
    );

    expect(reservedHeights(empty).length).toBeGreaterThan(0);
    expect(reservedHeights(empty)).toEqual(reservedHeights(filled));
  });

  it("marks the empty surface as the place an image goes", () => {
    // The motif carries one meaning — "an image belongs here" — and this is the
    // surface it means it about.
    const markup = renderToStaticMarkup(
      <ResultPanel empty emptyMessage="Your compressed GIF will appear here." />,
    );
    expect(markup).toContain("bg-checker");
  });

  it("keeps the empty state's words off the pattern", () => {
    // The motif's binding rule: never behind body text, because the pattern's
    // darkest tiles eat the contrast floor. The panel carries the checkerboard;
    // an opaque surface inside it carries the copy. A render where the message
    // is not inside `bg-surface-1` has broken that.
    const markup = renderToStaticMarkup(
      <ResultPanel
        empty
        emptyMessage="Your compressed GIF will appear here."
        emptyRows={EMPTY_ROWS}
      />,
    );
    const copyCard = markup.indexOf("bg-surface-1");
    const message = markup.indexOf("Your compressed GIF will appear here.");
    expect(copyCard).toBeGreaterThan(-1);
    expect(message).toBeGreaterThan(copyCard);
  });

  it("promises what will appear, in this tool's own words", () => {
    const markup = renderToStaticMarkup(
      <ResultPanel
        empty
        emptyMessage="Your compressed GIF will appear here."
        emptyRows={EMPTY_ROWS}
      />,
    );
    for (const row of EMPTY_ROWS) expect(markup).toContain(row);
  });

  it("renders no empty rows when a tool supplies none", () => {
    // The gallery and the 404 both use the bare panel. An empty `<ul>` with a
    // divider above it would be a rule across nothing.
    const markup = renderToStaticMarkup(
      <ResultPanel empty emptyMessage="Nothing here yet." />,
    );
    expect(markup).not.toContain("<ul");
  });
});

describe("SizeDelta", () => {
  it("states the change as text, not as a colour", () => {
    // §7.6. A visitor who cannot distinguish the accent from the body colour
    // still has to be able to read what happened.
    const markup = renderToStaticMarkup(
      <SizeDelta from="2.4 MB" to="480 KB" deltaLabel="−80% smaller" />,
    );
    expect(markup).toContain("−80% smaller");
    expect(markup).toContain("2.4 MB");
    expect(markup).toContain("480 KB");
  });
});

describe("ResultSummary", () => {
  const BASE = {
    savedLine: "You just cut {saved} out of it.",
    encodedIn: "encoded in 4.2s",
    downloadHref: "blob:x",
    downloadName: "loop-compressed.gif",
    downloadLabel: "Download GIF",
  };

  it("pops the success mark exactly once", () => {
    // §6: a looping success animation reads as "still working". The iteration
    // count is part of the class, so it is assertable — and under
    // `prefers-reduced-motion` the global rule in `globals.css` collapses the
    // duration, which is why nothing here has to branch on the preference.
    const markup = renderToStaticMarkup(
      <ResultSummary {...BASE} fromBytes={2_400_000} toBytes={480_000} />,
    );
    expect(markup).toContain("pz-check-pop_200ms_ease-out_1");
    expect(markup).not.toContain("infinite");
  });

  it("derives the delta and the saved figure from the same two numbers", () => {
    // The badge and the sentence cannot disagree, because neither is passed in.
    const markup = renderToStaticMarkup(
      <ResultSummary {...BASE} fromBytes={2_400_000} toBytes={480_000} />,
    );
    expect(markup).toContain("−80% smaller");
    expect(markup).toContain("You just cut 1.9 MB out of it.");
  });

  it("does not claim a saving when the file grew", () => {
    // Re-encoding an already-optimised GIF at a higher quality legitimately
    // produces a larger file. Every `savedLine` is written in the language of
    // having gained something, so on this outcome the sentence is dropped —
    // while the badge still says what happened, in words.
    const markup = renderToStaticMarkup(
      <ResultSummary {...BASE} fromBytes={480_000} toBytes={499_200} />,
    );
    expect(markup).not.toContain("You just cut");
    expect(markup).toContain("+4% larger");
  });

  it("keeps the sentence's line box whether or not it is filled", () => {
    // Otherwise the panel is a line shorter on a job that grew the file, and
    // "shorter than reserved" is the same reservation bug as "taller".
    const saved = renderToStaticMarkup(
      <ResultSummary {...BASE} fromBytes={2_400_000} toBytes={480_000} />,
    );
    const grew = renderToStaticMarkup(
      <ResultSummary {...BASE} fromBytes={480_000} toBytes={499_200} />,
    );
    for (const markup of [saved, grew]) {
      expect(markup).toContain("min-h-[1.5em]");
    }
  });

  it("makes the download the primary action", () => {
    // It is the conversion action of the entire page, not one link among links.
    const markup = renderToStaticMarkup(
      <ResultSummary {...BASE} fromBytes={2_400_000} toBytes={480_000} />,
    );
    expect(markup).toContain('download="loop-compressed.gif"');
    expect(markup).toContain("bg-brand-fill");
  });

  it("never counts the numbers up", () => {
    // A count-up carries no information and makes a measured byte count look
    // like an estimate. The figure is rendered once, as itself.
    //
    // Asserted on the animations only. An earlier version also forbade the
    // string "transition", which passed for the wrong reason: it renders no
    // children here, and in production the children are `Button`s that carry
    // transitions on their own hover states. A test that holds only while the
    // component is rendered empty is not testing the component.
    const markup = renderToStaticMarkup(
      <ResultSummary {...BASE} fromBytes={2_400_000} toBytes={480_000} />,
    );
    const animations = [...markup.matchAll(/animate-\[([a-z-]+)_/g)].map(
      (match) => match[1],
    );
    expect(animations).toEqual(["pz-check-pop"]);
  });

  it("says nothing about a saving too small for the badge to show", () => {
    // `formatDelta` rounds to whole percent, so a 10 MB job that came out 30 KB
    // smaller reads "no change" — and "you just cut 30 KB out of it" beside it
    // is the panel disagreeing with itself about what happened.
    const markup = renderToStaticMarkup(
      <ResultSummary {...BASE} fromBytes={10_000_000} toBytes={9_970_000} />,
    );
    expect(markup).toContain("no change");
    expect(markup).not.toContain("You just cut");
  });
});
