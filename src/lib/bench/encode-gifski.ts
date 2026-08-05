/**
 * gifski encoding — the differentiator, and the reason this whole bundle is
 * AGPL-3.0.
 *
 * Only the single-thread entry point is ever imported. The parallel build needs
 * SharedArrayBuffer (forbidden-guard-allow — naming it is this note's purpose),
 * which needs cross-origin isolation, which breaks ad serving. ESLint bans that
 * import path and `scripts/copy-wasm.mjs` never ships the parallel binary.
 *
 * ── What this encoder costs, and why the worker is disposable ────────────────
 * `encode()` is one synchronous WASM call that blocks the worker for its whole
 * duration and exposes no progress and no cancellation. It also copies the frame
 * buffer twice — once into a concatenated JS array, once into the WASM heap — so
 * peak residency is 2x the RGBA total, and its `WebAssembly.Memory` never
 * shrinks afterwards. The high-water mark is held for the life of the worker,
 * which is why the caller terminates and respawns rather than reusing it.
 */

import encode, { init } from "gifski-wasm";
import { WASM_BASE_PATH } from "@/lib/site-config";
import type { DecodedFrame } from "./types";

/** gifski refuses to encode a single frame; both the JS and the Rust side throw. */
export const GIFSKI_MIN_FRAMES = 2;

let initPromise: Promise<unknown> | null = null;

/**
 * Instantiates the WASM module from an explicit, origin-anchored URL.
 *
 * Never `new URL('…', import.meta.url)`. That is the wasm-bindgen glue's own
 * fallback and Turbopack rewrites it to a relative path during worker bundling,
 * which cannot resolve from a blob-URL worker context. The explicit URL
 * sidesteps bundler asset resolution entirely and behaves identically under
 * Turbopack and webpack, in dev and in production.
 */
export function initGifski(): Promise<unknown> {
  initPromise ??= init(
    new URL(`${WASM_BASE_PATH}/gifski_wasm_bg.wasm`, self.location.origin),
  );
  return initPromise;
}

export interface GifskiEncodeArgs {
  frames: DecodedFrame[];
  width: number;
  height: number;
  /** 1-100. gifski's own default is 80. */
  quality: number;
}

export async function encodeWithGifski({
  frames,
  width,
  height,
  quality,
}: GifskiEncodeArgs): Promise<Uint8Array> {
  if (frames.length < GIFSKI_MIN_FRAMES) {
    throw new Error(
      `gifski needs at least ${GIFSKI_MIN_FRAMES} frames, got ${frames.length}`,
    );
  }

  const expected = width * height * 4;
  for (const [index, frame] of frames.entries()) {
    if (frame.rgba.byteLength !== expected) {
      // Validate in JS: a size mismatch surfaces from Rust as a bare
      // `unreachable` RuntimeError with no indication of which frame was wrong.
      throw new Error(
        `Frame ${index} is ${frame.rgba.byteLength} bytes, expected ${expected} for ${width}x${height}`,
      );
    }
  }

  await initGifski();

  return encode({
    frames: frames.map((frame) => frame.rgba),
    width,
    height,
    frameDurations: frames.map((frame) => frame.durationMs),
    quality,
    // `repeat` is omitted on purpose. gifski reads `repeat: 0` as
    // `Repeat::Finite(0)` — play once, no loop — and only an omitted or negative
    // value means infinite. A looping GIF is the default every user expects, and
    // `gifenc` spells the same intent as `repeat: 0`, the exact inverse.
  });
}

/**
 * Throws away the module-level init promise.
 *
 * Only meaningful alongside terminating the worker: the WASM instance is a
 * singleton inside the glue and its memory never shrinks, so reclaiming the
 * high-water mark means dropping the whole worker, not just this reference.
 */
export function resetGifski(): void {
  initPromise = null;
}
