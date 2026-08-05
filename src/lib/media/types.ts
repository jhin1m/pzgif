/**
 * The engine's contract: frames, job specs, and the worker message protocol.
 *
 * This file is written first and changed last. Every tool page is a `JobSpec`,
 * and every UI state the user can see is a `JobEvent`. If a tool later needs a
 * message shape that is not here, the protocol was wrong — widen it here rather
 * than adding a side channel, because a side channel is how the main thread ends
 * up holding a frame buffer.
 *
 * Nothing in here carries user-facing prose. Errors travel as a code plus
 * parameters and are resolved to strings by the React layer through next-intl;
 * see `errors.ts` for why.
 */

/** One fully composited frame at output size, ready for an encoder. */
export interface DecodedFrame {
  /** Tightly packed RGBA8, exactly `width * height * 4` bytes. */
  rgba: Uint8Array;
  /** How long this frame is shown, in milliseconds. */
  durationMs: number;
}

/**
 * A decoder, normalised across GIF, video and animated WebP.
 *
 * `frameCount` is nullable on purpose. A GIF states its frame count up front; a
 * WebM often does not, and inventing a denominator so a progress bar looks tidy
 * is the exact thing `design-guidelines.md` §1.2 forbids. A null has to surface
 * as an indeterminate track, not as a guess.
 */
export interface FrameSource {
  width: number;
  height: number;
  frameCount: number | null;
  frames(signal?: AbortSignal): AsyncGenerator<DecodedFrame, void, unknown>;
}

/** Input containers the engine can be handed. `unknown` is a real answer. */
export type InputFormat = "gif" | "webp" | "video" | "image" | "unknown";

/** Rectangle in *source* pixels, applied before rotation and resizing. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Rotation = 0 | 90 | 180 | 270;

/**
 * Geometry, in the order it is applied: crop → rotate → resize.
 *
 * The order is load-bearing. Resizing before cropping throws away the pixels the
 * crop was going to keep, so the crop then samples an already-degraded image.
 */
export interface GeometrySpec {
  crop?: CropRect;
  rotate?: Rotation;
  /** Target width after cropping and rotation. Height follows aspect ratio. */
  targetWidth: number;
}

/**
 * Everything that changes which frames exist and how long they last.
 *
 * `speed` retimes; `keepEveryNth` drops; `range` trims; `direction` reorders.
 * They compose, and `frameMultiplier()` in `ops/frame-select.ts` is what turns
 * that composition into the frame count admission control has to budget for —
 * ping-pong doubling the output is a memory fact, not a UI detail.
 */
export interface TimingSpec {
  /** 1 = unchanged, 2 = twice as fast. Scales every frame duration. */
  speed?: number;
  /** Keep 1 frame in N. 1 = keep all. */
  keepEveryNth?: number;
  /** Half-open frame range `[from, to)` in decoded-frame indices. */
  range?: { from: number; to: number };
  direction?: "forward" | "reverse" | "ping-pong";
  /** Target frame rate for video input. Ignored for GIF, which keeps its delays. */
  fps?: number;
}

export type GifEncoderId = "gifski" | "gifenc";

export type OutputSpec =
  | {
      kind: "gif";
      /** 1-100, gifski's scale. Ignored by gifenc, which uses `colours`. */
      quality: number;
      /** Palette size for gifenc. gifski always uses 256. */
      colours: number;
      /** Force an encoder. Omitted means `resolveEncoder()` decides. */
      encoder?: GifEncoderId;
    }
  | { kind: "video"; container: "mp4" | "webm"; bitrateKbps?: number }
  | { kind: "png-zip" };

export interface JobSpec {
  /** The registry slug that asked for this job. Drives instrumentation and the
   *  "try this other tool instead" recovery, which must name a real route. */
  toolSlug: string;
  geometry: GeometrySpec;
  timing: TimingSpec;
  output: OutputSpec;
  /** Hard ceiling on decoded frames, below whatever the device tier allows. */
  maxFrames?: number;
}

/** What admission control decided before a single frame was decoded. */
export interface AcceptedPlan {
  fps: number;
  width: number;
  height: number;
  /** Frames that will exist *after* timing ops, i.e. what memory is sized on. */
  frames: number;
  /**
   * Frames the decoder is allowed to emit, **before** reordering.
   *
   * Distinct from `frames` because ping-pong turns n decoded frames into 2n-2
   * output frames. Handing the decoder the output count would let it emit twice
   * what the budget reserved — on the device that had just refused the job at
   * full size, which is the worst possible place to be wrong.
   */
  decodeFrames: number;
  /** `2 x frames x w x h x 4`, the quantity the tier budget is written against. */
  frameBufferBytes: number;
  /** True when this is below what the caller asked for. */
  downgraded: boolean;
  /** True when the clip was cut short to fit, not merely scaled down. The UI
   *  must say so — a silently shortened animation reads as a broken tool. */
  truncated: boolean;
  encoder: GifEncoderId | null;
}

/** Stages a job moves through. `retry` is the encoder fallback, and it is
 *  shown rather than hidden — a silent retry looks like a stall. */
export type JobStage = "probe" | "decode" | "encode" | "package" | "retry";

export interface ProgressEvent {
  stage: JobStage;
  /**
   * False means: show an indeterminate track and an elapsed timer.
   *
   * The unforked gifski exposes no progress callback and blocks its worker for
   * the whole encode, so there is no counter to report against. An interpolated
   * value would be an invented percentage. See `progress.ts`.
   */
  determinate: boolean;
  /** 0-1, weighted across stages. Only meaningful when `determinate`. */
  value: number;
  /** Real counters behind `value`, for debugging and for the elapsed readout. */
  done: number;
  total: number | null;
}

export type MediaErrorCode =
  | "unsupported-format"
  | "too-large-for-device"
  | "decode-failed"
  | "encode-failed"
  | "oom"
  | "cancelled"
  | "browser-unsupported";

/** A concrete thing the user can do next. Never a dead end, never "Pro". */
export type RecoveryAction =
  | { kind: "use-tool"; slug: string }
  | { kind: "run-degraded"; plan: AcceptedPlan }
  | { kind: "change-setting"; setting: "colours" | "width" | "fps" | "frames"; value: number }
  | { kind: "install-fallback-decoder" }
  | { kind: "try-other-browser" }
  | { kind: "report" };

export interface MediaError {
  code: MediaErrorCode;
  /** Interpolation values for the next-intl message. Never a rendered string. */
  params?: Record<string, string | number>;
  actions: RecoveryAction[];
  /** Untranslated technical detail, for the report beacon only. Never shown. */
  detail?: string;
}

export interface JobStats {
  outBytes: number;
  frames: number;
  width: number;
  height: number;
  encoder: GifEncoderId | "mediabunny" | "fflate";
  decodeMs: number;
  encodeMs: number;
  totalMs: number;
  /** Which decode path ran. Instrumentation for the ffmpeg keep-or-delete call. */
  decodePath: "native" | "fallback";
  /** True when the watchdog fired and the job completed on the fallback encoder. */
  encoderFellBack: boolean;
}

/** Main thread → pipeline worker. */
export type JobRequest =
  | { type: "run"; jobId: number; spec: JobSpec; file: File }
  | { type: "cancel"; jobId: number }
  | { type: "estimate"; jobId: number; spec: JobSpec; file: File }
  | { type: "probe"; jobId: number; file: File };

/** Pipeline worker → main thread. */
export type JobEvent =
  | { type: "accepted"; jobId: number; plan: AcceptedPlan }
  | { type: "refused"; jobId: number; error: MediaError }
  | { type: "progress"; jobId: number; progress: ProgressEvent }
  | { type: "preview"; jobId: number; bitmap: ImageBitmap }
  | { type: "estimate"; jobId: number; estimate: SizeEstimate }
  | { type: "probed"; jobId: number; probe: InputProbe }
  | { type: "done"; jobId: number; blob: Blob; stats: JobStats }
  | { type: "error"; jobId: number; error: MediaError };

/** What a probe learned before anything was decoded. */
export interface InputProbe {
  format: InputFormat;
  /** The extension claimed; kept so a mismatch can be reported honestly. */
  declaredExtension: string | null;
  width: number;
  height: number;
  /** Null when the container does not state it, e.g. some WebM. */
  durationSec: number | null;
  frameCount: number | null;
  codec: string | null;
  /** False when the container parsed but the browser cannot decode the codec —
   *  HEVC on Chromium and Firefox is the measured case. */
  decodable: boolean;
  rotationDegrees: number;
}

/**
 * An output-size prediction. Always a range, never a promise.
 *
 * `low`/`high` are not decoration: the calibration data shows a 22x spread in
 * bytes-per-pixel driven purely by content at identical settings, so a point
 * value would be confidently wrong exactly where users care. `basis` says
 * whether this came from a real sample encode or from the settings-only curve,
 * because the two deserve different confidence in the UI.
 */
export interface SizeEstimate {
  bytes: number;
  low: number;
  high: number;
  basis: "sampled" | "curve";
}
