"use client";

import { useEffect, useState } from "react";

/**
 * A `blob:` URL for a file, alive for exactly as long as that file is the one
 * being shown.
 *
 * ── The pairing this exists to make unbreakable ────────────────────────────
 * Three components need the same thing: mint an object URL for the file the
 * page is about, and revoke it when that file is replaced or the page goes
 * away. Written by hand, all three arrived at the same wrong shape — mint
 * inside the drop handler, revoke from a mount-scoped `useEffect(…, [])` — and
 * the two halves came apart under React's Strict Mode.
 *
 * Strict Mode runs effects setup → cleanup → setup on mount to prove they are
 * resilient to being re-run. A file that arrives *during* that first setup pass
 * is the case that breaks: `useHandoffFile` reads the homepage's handoff, the
 * URL is minted, the cleanup pass revokes it, and the second setup pass has
 * nothing to re-mint from because `takePendingFile` clears on read. The page
 * then renders a revoked URL — which does not throw and does not look broken.
 * It lays out at its reserved size and shows nothing, with only an
 * `ERR_FILE_NOT_FOUND` in the console to say so, and only in development, on the
 * one path a developer reaches by clicking through from the homepage rather
 * than dropping a file on the tool page directly.
 *
 * Keyed on the file, the halves cannot separate: every setup mints, every
 * cleanup revokes the URL from its own closure, and a re-run produces a fresh
 * live URL instead of a dead one. It also makes the double-revoke that the
 * previous ref-based guard was written for structurally impossible, since no
 * cleanup can ever see a URL it did not mint.
 *
 * ── The one render this costs ──────────────────────────────────────────────
 * The URL lands in the commit *after* the file does, so there is one frame
 * where the file is known and the URL is still null. Every caller renders this
 * inside a fixed-height box, so that frame is an empty reservation rather than a
 * layout shift — and the browser's own decode of a multi-megabyte GIF takes
 * longer than the render does regardless.
 *
 * ── Why the state is keyed on the file rather than being a bare string ─────
 * Same shape as `useFirstFrame`, and for two reasons beyond consistency. It
 * means clearing needs no state update at all — when the file goes away the key
 * stops matching and the hook reads null — so there is no `setState` on the
 * teardown path to cascade a render. And it means a file swapped for another
 * reads as "no URL yet" for the render before its own is minted, instead of
 * briefly handing back the *previous* file's URL and pointing an `<img>` at the
 * wrong picture.
 */
export function useObjectUrl(file: File | null): string | null {
  const [minted, setMinted] = useState<{ file: File; url: string } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- The rule's
       target is state derived from other state, which should be computed during
       render instead. This is the other thing it catches: publishing a handle to
       an imperative resource that *must* be created inside the effect, because
       only then is it paired with the cleanup that frees it. Minting it in a
       `useMemo` or during render and revoking it from an effect reintroduces the
       exact defect this hook documents — the cleanup pass runs, and nothing
       re-runs the mint. The cost is one extra render per file the visitor
       chooses, which is not a cascade. */
    setMinted({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return minted && minted.file === file ? minted.url : null;
}
