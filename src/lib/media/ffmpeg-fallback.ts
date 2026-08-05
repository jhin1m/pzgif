/**
 * The last-resort decoder, for containers and codecs WebCodecs refuses.
 *
 * This is **the only file permitted to touch ffmpeg**, and the rules around it
 * are stricter than the rest of the engine:
 *
 *  - **Dynamic load only, never a static import.** ffmpeg is roughly 10 MB of
 *    WASM. A static import would put it — or a reference to it — in the main
 *    client chunk, where every visitor pays for a path 1-3% of them will use.
 *    `scripts/check-ffmpeg-bundle.mjs` asserts the built client chunks contain no
 *    ffmpeg reference at all.
 *  - **Consent-gated.** 10 MB over mobile data without asking is not a fallback,
 *    it is a bill. The user is told the size and agrees before anything is
 *    fetched.
 *  - **Never on iOS.** `ffmpeg.load()` alone is reported to exhaust the page
 *    budget there, and the tab dies with no message — a worse outcome than the
 *    decode failure it was trying to rescue.
 *  - **Served from `public/ffmpeg/`, never a CDN.** The CSP is `default-src
 *    'self'` and widening it for a rarely-used decoder would weaken every page.
 *
 * ── Current state: the boundary exists, the binaries do not ────────────────
 * The core is loaded from `/ffmpeg/` at runtime through a URL the bundler cannot
 * see, so this module carries no package dependency. The binaries are vendored
 * by the same build step that copies `gifski_wasm_bg.wasm`, and until they are,
 * `isFfmpegAvailable()` is false and the recovery action is never offered. That
 * is deliberate: a fallback the UI advertises and cannot deliver is worse than
 * one it does not mention.
 *
 * The keep-or-delete decision is instrumented rather than assumed. Every job
 * logs `{container, codec, path}`; if 30 days of traffic puts the fallback rate
 * under 2%, deleting this file is the correct outcome.
 */

import { detectCapabilities } from "./capability";

/** Where the core is served from. Same origin, `'self'` under the CSP. */
const FFMPEG_BASE_PATH = "/ffmpeg";

/**
 * Whether the binaries were vendored into this deployment.
 *
 * A build-time flag rather than a runtime probe: probing means a request on
 * every decode failure, and the answer cannot change between deploys.
 */
export function isFfmpegAvailable(): boolean {
  return (
    process.env.NEXT_PUBLIC_FFMPEG_FALLBACK === "1" && detectCapabilities().ffmpegFallback
  );
}

/** What the consent prompt has to state before anything is downloaded. */
export const FFMPEG_DOWNLOAD_MB = 10;

/**
 * The slice of the ffmpeg.wasm API this module uses.
 *
 * Declared locally because the package is not a dependency — the module is
 * fetched at runtime from a URL assembled at call time, which is what keeps
 * every bundler from following it.
 */
interface FFmpegLike {
  load(options: { coreURL: string; wasmURL: string }): Promise<void>;
  writeFile(name: string, data: Uint8Array): Promise<void>;
  readFile(name: string): Promise<Uint8Array<ArrayBuffer> | string>;
  deleteFile(name: string): Promise<void>;
  exec(args: string[]): Promise<number>;
  terminate(): void;
}

let instance: FFmpegLike | null = null;

async function loadFfmpeg(): Promise<FFmpegLike> {
  if (instance) return instance;

  // The URL is assembled here, at call time, from a constant the bundler cannot
  // fold into a literal import specifier. That is the mechanism that keeps
  // ffmpeg out of the module graph — not a convention, a load-bearing detail.
  const origin = (globalThis as { location?: { origin: string } }).location?.origin ?? "";
  const moduleUrl = `${origin}${FFMPEG_BASE_PATH}/ffmpeg.mjs`;

  const loaded = (await import(/* webpackIgnore: true */ /* @vite-ignore */ moduleUrl)) as {
    FFmpeg: new () => FFmpegLike;
  };
  const ffmpeg = new loaded.FFmpeg();
  await ffmpeg.load({
    coreURL: `${origin}${FFMPEG_BASE_PATH}/ffmpeg-core.js`,
    wasmURL: `${origin}${FFMPEG_BASE_PATH}/ffmpeg-core.wasm`,
  });
  instance = ffmpeg;
  return ffmpeg;
}

/**
 * Transcodes an input WebCodecs cannot decode into one it can.
 *
 * Transcoding to H.264 rather than extracting raw frames is the memory-safe
 * choice: raw frames would materialise the whole clip in ffmpeg's virtual file
 * system, which is exactly the residency the engine spends its effort avoiding.
 * The result goes back through the ordinary mediabunny path, so there is one
 * decode implementation and not two.
 */
export async function transcodeToDecodable(
  file: File,
  { signal }: { signal?: AbortSignal } = {},
): Promise<File> {
  if (!isFfmpegAvailable()) {
    throw new Error("The fallback decoder is not available in this deployment");
  }

  const ffmpeg = await loadFfmpeg();
  const inputName = "input.bin";
  const outputName = "output.mp4";

  try {
    await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");

    await ffmpeg.exec([
      "-i", inputName,
      // Video only: the engine never uses the audio track, and dropping it here
      // saves both transcode time and output size.
      "-an",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    if (typeof data === "string") throw new Error("ffmpeg returned text, not a file");
    return new File([data], `${file.name}.mp4`, { type: "video/mp4" });
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}

/** Drops the instance and its heap. The module's memory never shrinks in place. */
export function releaseFfmpeg(): void {
  instance?.terminate();
  instance = null;
}
