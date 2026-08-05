/**
 * The one piece of inline markup the content files may use: `**bold**`.
 *
 * ── Why not MDX ─────────────────────────────────────────────────────────────
 * MDX would let prose import components, and the moment prose can import, the
 * licence boundary between `src/content/` (all rights reserved) and the AGPL
 * code stops being a directory and starts being a judgement call. It also adds a
 * compiler to a build whose only requirement here is emphasis inside a sentence.
 *
 * ── Why not `dangerouslySetInnerHTML` ───────────────────────────────────────
 * Because the CSP is deliberately strict and prose should never be a place where
 * markup can appear by accident. This splits on a delimiter and emits `<strong>`;
 * anything that looks like a tag stays literal text, escaped by React.
 *
 * An odd number of delimiters is treated as literal text rather than as an
 * unterminated bold run — a typo in copy should read as a typo, not silently
 * embolden the rest of the paragraph.
 */

export function InlineCopy({ text }: { text: string }) {
  const parts = text.split("**");
  // Even count of delimiters means at least one unmatched marker.
  if (parts.length === 1 || parts.length % 2 === 0) return <>{text}</>;

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <strong key={index} className="font-semibold text-fg">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Word count of a paragraph run, used to place the in-content ad (§8.1). */
export function wordCount(paragraphs: readonly string[]): number {
  return paragraphs.reduce(
    (total, paragraph) => total + paragraph.trim().split(/\s+/).length,
    0,
  );
}
