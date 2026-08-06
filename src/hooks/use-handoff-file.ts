"use client";

import { useEffect } from "react";
import { takePendingFile } from "@/lib/handoff/pending-file";

/**
 * Loads the file the homepage handed over, if there is one.
 *
 * Both intake components already expose the exact seam this needs — a single
 * `handleFile(file)` that probes and sets state — so the whole consumer is one
 * mount effect, shared here rather than written twice.
 *
 * ── Why the empty-intent effect is correct, and why re-running is safe ──────
 * The handoff is a one-shot event that happened *before* this component
 * existed, so mount is the only moment it can be read. `handleFile` is wrapped
 * in `useCallback` at both call sites and so is stable, but the guarantee does
 * not rest on that: `takePendingFile()` clears on read, so a second invocation —
 * from Strict Mode's double mount, or from a dependency that turns out not to be
 * stable after all — returns `null` and does nothing. The page already has the
 * file in its own state by then.
 *
 * ── What happens when there is no handoff ───────────────────────────────────
 * Nothing, and that is the fallback the whole design leans on. A tool page
 * reached by a link, a reload or the back button finds `null` and renders its
 * own dropzone exactly as it always has. If a future navigation to a tool page
 * ever became a hard navigation, the file would be lost and the page would
 * still work — a missing convenience rather than a broken page.
 */
export function useHandoffFile(
  /** This page's registry slug. A file handed to another tool is not taken. */
  slug: string,
  handleFile: (file: File) => void,
): void {
  useEffect(() => {
    const handed = takePendingFile(slug);
    if (handed) handleFile(handed);
  }, [handleFile, slug]);
}
