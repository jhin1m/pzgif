"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A still of a GIF's first frame, as a `blob:` URL.
 *
 * ── Why `createImageBitmap` and not the engine ─────────────────────────────
 * The pipeline worker emits a preview bitmap, but only once a job is running —
 * and the crop rectangle has to be placed *before* the job. Every browser this
 * project supports decodes the first frame of an animated GIF through
 * `createImageBitmap(blob)`, which costs one frame of memory and no worker round
 * trip. That is the whole requirement here: one frame, before anything else
 * happens.
 *
 * ── Why a canvas and not the bitmap ────────────────────────────────────────
 * An open `ImageBitmap` holds a platform buffer the garbage collector is slow
 * about, and it cannot be the `src` of an `<img>`. Painting it once into a
 * canvas and taking a blob lets the bitmap be closed immediately, which matters
 * on the device class where a single held frame is a measurable share of the
 * budget.
 *
 * Returns null while decoding and if decoding fails. A null is a real answer:
 * the caller falls back to the animated file, which every browser can render.
 */
export function useFirstFrame(file: File | null): string | null {
  // Keyed by the file it was decoded from, so a new file reads as "no still
  // yet" during the render before its decode finishes rather than briefly
  // showing the previous file's frame — and so nothing has to be cleared
  // synchronously from an effect.
  const [still, setStill] = useState<{ file: File; url: string } | null>(null);
  // Revoked deterministically rather than from state, so StrictMode's double
  // invocation cannot revoke a URL that the second pass is still using.
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    const release = () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };

    void (async () => {
      try {
        const bitmap = await createImageBitmap(file);
        if (cancelled) {
          bitmap.close();
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        bitmap.close();

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (cancelled || !blob) return;
        release();
        urlRef.current = URL.createObjectURL(blob);
        setStill({ file, url: urlRef.current });
      } catch {
        // Nothing to report, and nothing to clear: the state is keyed on the
        // file, so a failed decode simply leaves this file with no still and the
        // caller shows the animated version. The job itself will fail with a
        // proper taxonomy entry if the file really is unreadable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    },
    [],
  );

  return still && still.file === file ? still.url : null;
}
