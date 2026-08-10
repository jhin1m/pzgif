/**
 * What this browser can actually do, decided once at boot.
 *
 * Every branch in the engine reads from here rather than sniffing again, so
 * there is exactly one place where a device fact is established and exactly one
 * place to correct when a browser ships a fix.
 *
 * Two rules govern this file:
 *
 *  - **Probe, never hardcode a version.** "Safari 26 cannot encode VP9" ages
 *    into a bug the moment it can. `VideoEncoder.isConfigSupported()` answers
 *    the question the browser is actually the authority on.
 *  - **An honest refusal beats a hopeful attempt.** Firefox for Android has no
 *    `VideoDecoder` at all; offering it a 10 MB ffmpeg download over mobile data
 *    to work around that is worse than saying so.
 */

import { detectTier, type DeviceTier } from "./limits";
import type { GifEncoderId } from "./types";

/** Rendering engine, as far as the pipeline needs to care. */
export type EngineId = "blink" | "webkit" | "gecko" | "unknown";

export interface Capabilities {
  tier: DeviceTier;
  engine: EngineId;
  /** WebCodecs video decode. Absent on Firefox for Android. */
  videoDecode: boolean;
  /** WebCodecs video encode, needed by `gif-to-mp4`. */
  videoEncode: boolean;
  /**
   * `ImageDecoder`. Absent in Safari at every version, Firefox below 133.
   *
   * Nothing branches on this any more. It used to gate animated WebP, which
   * refused the format outright on Safari; Phase 7 replaced that path with the
   * RIFF splitter in `decode/webp-riff.ts`, which works on every engine. Kept as
   * a reported probe result because it is the thing to check first if a future
   * format is considered for an `ImageDecoder`-only route.
   */
  imageDecoder: boolean;
  offscreenCanvas: boolean;
  webAssembly: boolean;
  /**
   * Whether video input is offered at all.
   *
   * False on iOS. Gate G8 measured an 80% refusal rate for video inputs against
   * the 30 MB iOS frame budget — everything that passes is an existing small
   * GIF, every video shape fails. Refusing at the file picker is honest; letting
   * someone pick a clip and then refusing it after a probe is a broken tool with
   * extra steps. Ratified 2026-08-05 in `plan.md`.
   */
  videoInput: boolean;
  /** iOS is excluded: `ffmpeg.load()` alone is reported to OOM there. */
  ffmpegFallback: boolean;
}

let cached: Capabilities | null = null;
let injectedTier: DeviceTier | null = null;

/**
 * Supplies the tier from the page, because the worker cannot work it out.
 *
 * `navigator.maxTouchPoints` is `[Exposed=Window]` — `WorkerNavigator` has no
 * such member, and it reads as `undefined` rather than throwing. Since that
 * property is how iOS is identified (Safari implements no `deviceMemory`, and an
 * iPad reports itself as a Mac), a worker left to its own devices classifies
 * every iPhone as `desktop` and hands it a budget **seventeen times** what it can
 * survive. TypeScript does not catch this: the engine compiles against `lib.dom`,
 * so `navigator` is typed as the Window one everywhere.
 *
 * So the page detects the tier where the property exists and posts it in before
 * the first job. `JobController` does this on worker creation.
 */
export function configureTier(tier: DeviceTier): void {
  injectedTier = tier;
  cached = null;
}

function detectEngine(userAgent: string): EngineId {
  // Order matters — every engine's UA string claims to be several others.
  if (/Firefox\/|FxiOS\//.test(userAgent)) return "gecko";
  if (/Chrome\/|Chromium\/|Edg\//.test(userAgent)) return "blink";
  if (/Safari\//.test(userAgent)) return "webkit";
  return "unknown";
}

export function detectCapabilities(): Capabilities {
  if (cached) return cached;

  const scope = globalThis as typeof globalThis & {
    VideoDecoder?: unknown;
    VideoEncoder?: unknown;
    ImageDecoder?: unknown;
    OffscreenCanvas?: unknown;
  };
  const userAgent =
    typeof navigator === "undefined" ? "" : (navigator.userAgent ?? "");
  // `injectedTier` wins wherever it was supplied: inside a worker it is the only
  // reliable answer, and on the page it is the same value `detectTier()` returns.
  const tier = injectedTier ?? detectTier();

  cached = {
    tier,
    engine: detectEngine(userAgent),
    videoDecode: typeof scope.VideoDecoder === "function",
    videoEncode: typeof scope.VideoEncoder === "function",
    imageDecoder: typeof scope.ImageDecoder === "function",
    offscreenCanvas: typeof scope.OffscreenCanvas === "function",
    webAssembly: typeof WebAssembly === "object",
    videoInput: tier !== "ios" && typeof scope.VideoDecoder === "function",
    ffmpegFallback: tier !== "ios",
  };
  return cached;
}

/** Forgets the cached probe. Tests only — a real device does not change. */
export function resetCapabilities(): void {
  cached = null;
  injectedTier = null;
}

/**
 * Whether a codec can be *decoded*, asked of the browser rather than a table.
 *
 * G7 measured HEVC failing on Chromium and Firefox while every container
 * demuxed fine everywhere — so a job that only checked the container would
 * accept an iPhone `.mov` and die mid-decode. mediabunny's own error says to
 * check decodability before using a track; this is that check.
 */
export async function canDecodeCodec(codec: string): Promise<boolean> {
  const scope = globalThis as typeof globalThis & {
    VideoDecoder?: { isConfigSupported(config: { codec: string }): Promise<{ supported?: boolean }> };
  };
  if (typeof scope.VideoDecoder?.isConfigSupported !== "function") return false;
  try {
    const support = await scope.VideoDecoder.isConfigSupported({ codec });
    return support.supported === true;
  } catch {
    return false;
  }
}

/**
 * The encoder for this job.
 *
 * Three inputs, in descending priority:
 *
 *  1. **The job's own request.** A preset that has to hit a byte budget may pick
 *     the encoder whose dial it can actually turn.
 *  2. **`NEXT_PUBLIC_GIF_ENCODER`.** The kill switch. gifski carries an open,
 *     unresolved deadlock issue upstream; G1 bounded the failure rate at ~0.12%
 *     rather than showing it absent. This turns a production hang from an
 *     emergency redeploy into a config flip.
 *  3. **The engine.** gifski's WASM measured 12-14x slower under SpiderMonkey
 *     than under V8 or JavaScriptCore — 51.8 s against a 30 s viability floor on
 *     the same job Chromium finishes in 4.0 s. A `gifenc` control run at parity
 *     on all three engines, so this is the module and not the browser. Firefox
 *     therefore defaults to `gifenc`.
 *
 * The Firefox measurement is from a Playwright build and wants one confirmation
 * run in release Firefox; the default is set the safe way round in the meantime,
 * because a 52-second encode is a lost user and a 3% quality delta is not.
 */
export function resolveEncoder(
  requested: GifEncoderId | undefined,
  capabilities: Capabilities = detectCapabilities(),
): GifEncoderId {
  if (requested) return requested;

  const configured = process.env.NEXT_PUBLIC_GIF_ENCODER;
  if (configured === "gifski" || configured === "gifenc") return configured;

  return capabilities.engine === "gecko" ? "gifenc" : "gifski";
}

/** The encoder to retry with when the watchdog fires. Always the other one. */
export function fallbackEncoder(current: GifEncoderId): GifEncoderId {
  return current === "gifski" ? "gifenc" : "gifski";
}
