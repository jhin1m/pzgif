/**
 * The file the homepage handed to the tool page the visitor picked.
 *
 * ── Why a module singleton, and not storage ─────────────────────────────────
 * Next's App Router client navigation does not reload the document. The
 * JavaScript realm survives the route change, so module-level state survives
 * with it, and the handoff is seven lines instead of a storage problem.
 *
 * The alternatives were both worse for a concrete reason, not a stylistic one.
 * A `File` is not structured-cloneable into `sessionStorage` at all. IndexedDB
 * would take it, but copying tens of megabytes out to disk and back to cross a
 * navigation that never left the realm is work performed for nothing, on a
 * device whose memory budget is already the binding constraint on this product.
 *
 * ── `take` clears on read, and that one decision covers four cases ──────────
 *
 * | Drop → pick → tool mounts        | consumed, the tool loads it            |
 * | Tool page reloaded (F5)          | new realm, `null`, ordinary dropzone   |
 * | Back to `/`, then a second tool  | already consumed, no stale file        |
 * | Strict Mode double-mounts        | the second call gets `null`            |
 *
 * It also means the module never keeps a `File` alive after use. Holding a
 * 200 MB blob past its one consumer is a leak this product cannot afford.
 *
 * ── Two tabs do not interfere ───────────────────────────────────────────────
 * Module state is per-realm, so tabs are isolated for free. Recorded here so
 * that nobody later "fixes" the isolation with shared storage and breaks it.
 *
 * ── The handoff names its destination, and that is not belt-and-braces ─────
 * A ⌘-click or Ctrl-click on a picker chip fires React's `onClick` — so the
 * file is stashed — and then `Link` sees the modifier and declines to navigate.
 * The origin tab stays on `/` holding an armed handoff with no owner, and the
 * next client navigation to *any* tool page in that tab would consume it.
 *
 * Harmless while every live route is GIF-only. It stops being harmless the
 * first time a cross-format tool ships: the picker offers `mp4-to-gif` for a
 * video, the visitor opens it in a new tab, then reaches `gif-compressor` from
 * the nav in the original tab — and the compressor receives an MP4 and dies as
 * `decode-failed`, the generic bucket the "never a dead end" rule exists to
 * keep files out of. Naming the destination costs one field and closes it
 * before the tool that would expose it exists.
 */

let pending: { file: File; slug: string } | null = null;

/** Hand a file to a *named* tool page. Overwrites any previous. */
export function setPendingFile(file: File, slug: string): void {
  pending = { file, slug };
}

/**
 * Consume the file handed to `slug`.
 *
 * Returns null on a cold load, on a reload, and when the waiting file was meant
 * for a different tool — the last of which is the whole reason for the argument.
 * Clears on read either way: a handoff the intended page never collected is
 * stale, and a stale `File` is both a wrong result and a retained blob.
 */
export function takePendingFile(slug: string): File | null {
  const handoff = pending;
  pending = null;
  return handoff?.slug === slug ? handoff.file : null;
}

/** Drop a file that was set but never consumed. */
export function clearPendingFile(): void {
  pending = null;
}
