/**
 * The shape of a tool page's hand-written copy.
 *
 * ── Why this type lives here and not in `src/content/` ──────────────────────
 * `src/content/` is covered by `LICENSE-CONTENT` (all rights reserved) while the
 * rest of the repository is AGPL-3.0. Keeping that directory to pure `.json`
 * data files makes the boundary visible in the file tree; a `.ts` module in
 * there would blur it. So the *schema* is code and lives here, and the *prose*
 * is data and lives there.
 *
 * ── Why this is a shape and not a template ──────────────────────────────────
 * `registry.ts` owns structure and must never own prose. This type is the other
 * half of that rule: it says a tool page has a lead, an explainer and a FAQ — it
 * does not say what any of them contain. Every word is written for one tool.
 * Filling one template across 14 near-identical pages is precisely what Google's
 * scaled-content-abuse policy penalises, and the penalty is site-wide.
 *
 * A reviewer's test for a violation: if two tools' copy differs only by
 * substituted nouns, it was generated, and it has to be rewritten.
 */

/** A run of prose under one heading. `level` is the real document outline. */
export interface ExplainerSection {
  heading: string;
  /** 2 under the page `h1`, 3 under a preceding `h2`. */
  level: 2 | 3;
  /** Paragraphs, in order. Inline `**bold**` is the only markup permitted. */
  paragraphs: readonly string[];
}

export interface FaqEntry {
  /** Stable across edits — it becomes the panel's DOM id and any deep link. */
  id: string;
  question: string;
  answer: readonly string[];
}

/** Label and helper text for one setting. Written for this tool only. */
export interface ControlCopy {
  label: string;
  hint?: string;
  /**
   * Select options, **in the order they must be offered**.
   *
   * An array rather than a `{ value: label }` map, because JavaScript reorders
   * integer-like object keys into ascending numeric order regardless of how the
   * JSON was written. A `"256" … "32"` map — best option first, as the wireframe
   * has it — silently renders as `32, 64, 128, 256`, putting the worst choice at
   * the top of the list and the default at the bottom.
   */
  options?: readonly { value: string; label: string }[];
}

export interface ToolContent {
  /** Must match a `registry.ts` slug. Asserted at build time by the page. */
  slug: string;
  /** The page `h1`. Not the `<title>` — see `meta`. */
  title: string;
  lead: string;
  meta: { title: string; description: string };
  /** Per-tool dropzone copy. The generic default names formats and nothing else. */
  dropzone: { title: string; caption: string };
  /**
   * The verbs on this page's buttons.
   *
   * "Compress GIF" is not "Run tool" with a noun substituted, and the difference
   * is the difference between a page that reads as written and a page that reads
   * as generated. Generic chrome — "Cancel", "Settings", "Reset" — stays in the
   * message catalogue, because it genuinely is the same word everywhere.
   */
  actions: {
    run: string;
    running: string;
    rerun: string;
    download: string;
    /** Shown beside the disabled primary, per §5.1. */
    disabledReason: string;
  };
  /** Keyed by control id from the page's schema. */
  controls: Readonly<Record<string, ControlCopy>>;
  /**
   * This tool's card in the homepage grid.
   *
   * `registry.ts` owns the name; this owns the reason to click it. One line,
   * and it has to name something true of *this* tool alone — a line that still
   * reads correctly with another tool's name substituted in is a noun-swap, and
   * a grid of noun-swaps is the scaled-content pattern the whole content
   * strategy exists to avoid. `tool-copy.test.ts` asserts it.
   */
  card: { benefit: string };
  /** The empty result panel — the box that reserves the space before it fills. */
  resultEmpty: { message: string; hint: string };
  /**
   * The completion moment and what the empty panel promises.
   *
   * `savedLine` is the one sentence under the size delta. It says what the
   * visitor got, in this tool's own terms — "cut" is right for the compressor
   * and wrong for reverse, which changes no bytes on purpose.
   *
   * `emptyRows` are the "what will appear here" lines in the reserved panel,
   * which is 480px of surface that would otherwise hold one grey sentence.
   * Three rows, describing this tool's output rather than the idea of output.
   */
  result: { savedLine: string; emptyRows: readonly string[] };
  /**
   * Short strings the chrome needs but that read wrong when they are generic.
   *
   * "Compression progress" is right on one page and wrong on the other four, and
   * an alt text of "The compressed GIF" on the reverse tool is simply false —
   * which matters more than tone, because it is what a screen-reader user is
   * told the image is. Optional so a page that has nothing tool-specific to say
   * falls back to the message catalogue rather than restating it.
   */
  labels?: {
    /** Accessible name of the progress bar, e.g. "Resizing progress". */
    progress?: string;
    /** Alt text for the produced file's preview. */
    resultAlt?: string;
    /** Alt text for the loaded source preview. */
    sourceAlt?: string;
  };
  explainer: readonly ExplainerSection[];
  faqHeading: string;
  faq: readonly FaqEntry[];
  /**
   * Blurb per related slug, written for *this* page's reader.
   *
   * Keyed rather than positional so a registry reordering cannot silently
   * attach the wrong sentence to the wrong tool.
   */
  related: Readonly<Record<string, string>>;
}

/**
 * Adopts an imported `.json` file as a `ToolContent`.
 *
 * The cast is unavoidable — TypeScript widens `"level": 2` in a JSON module to
 * `number`, so the literal union cannot survive the import — but the slug check
 * is not decoration. Wiring the wrong content file to a page is a silent,
 * plausible mistake that would ship one tool's prose under another tool's URL,
 * and it is exactly the duplicate-content signal the hand-written copy exists to
 * avoid. This turns it into a build failure.
 */
export function toolContent(data: unknown, expectedSlug: string): ToolContent {
  const content = data as ToolContent;
  if (content.slug !== expectedSlug) {
    throw new Error(
      `Content slug "${content.slug}" does not match the route "${expectedSlug}"`,
    );
  }
  return content;
}
