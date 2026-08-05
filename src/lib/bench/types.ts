/**
 * Shared shapes for the Phase 1 benchmark harness.
 *
 * These types describe *measurements*, not product state. The one thing here
 * that is deliberately product-shaped is `DecodedFrame`, because the decode
 * interface the spike settles on is the one Phase 4 inherits.
 */

/**
 * `DecodedFrame` and `FrameSource` moved to `src/lib/media/types.ts` in Phase 4.
 *
 * They were always the product's interface rather than the benchmark's — the
 * spike settled the decode contract, and Phase 4 inherited it. Re-exporting
 * rather than redeclaring keeps one definition, so a change to the engine's
 * frame contract cannot leave the harness silently measuring a different shape.
 */
export type { DecodedFrame, FrameSource } from "@/lib/media/types";

export type EncoderId = "gifski" | "gifenc";

export interface EncodeSettings {
  /** gifski's 1-100 quality. `gifenc` has no equivalent; see `colours`. */
  quality: number;
  /** Palette size. gifski always uses 256; `gifenc` honours this. */
  colours: number;
}

/** What a single benchmark run was asked to do. */
export interface BenchJobSpec {
  fixture: string;
  encoder: EncoderId;
  /** Target output width in px; height follows the source aspect ratio. */
  width: number;
  /** Target frame rate for video inputs. Ignored for GIF inputs, which keep
   *  their own per-frame delays — resampling them would change the timing the
   *  round-trip check asserts. */
  fps: number;
  quality: number;
  colours: number;
  /** Cap on decoded frames, so the memory probe can walk the ceiling upward. */
  maxFrames?: number;
}

/** Wall-clock, split by stage. Every field is measured, none is derived. */
export interface StageTimings {
  wasmInitMs: number;
  probeMs: number;
  decodeMs: number;
  encodeMs: number;
  totalMs: number;
}

export interface BenchResult {
  spec: BenchJobSpec;
  ok: boolean;
  error: string | null;
  /** Set when the watchdog fired rather than the encoder returning. */
  hang: boolean;
  outWidth: number;
  outHeight: number;
  frames: number;
  outBytes: number;
  timings: StageTimings;
  /** `usedJSHeapSize` high-water mark where the browser exposes it. Chromium
   *  only — absent elsewhere, and never silently replaced with an estimate. */
  peakJsHeapBytes: number | null;
  /** RGBA bytes actually held resident: `2 x frames x w x h x 4`, the quantity
   *  the admission-control budget is written against. */
  frameBufferBytes: number;
  /** Longest main-thread task observed during the job. Proves the worker split. */
  longestMainThreadTaskMs: number | null;
  /** Re-decoded from the produced GIF, to prove the output is real. */
  roundTrip: { header: string; frameCount: number } | null;
}

/** One row of the G1 soak. Kept narrow — a thousand of these are collected. */
export interface SoakRow {
  run: number;
  fixture: string;
  mode: "worker-per-job" | "long-lived-worker";
  ms: number;
  ok: boolean;
  hang: boolean;
  error: string | null;
}

export interface SoakSummary {
  runs: number;
  hangs: number;
  errors: number;
  medianMs: number;
  watchdogMs: number;
  rows: SoakRow[];
}

/** What `inspectContainer` reports — G7's raw material. */
export interface ContainerInspection {
  kind: "gif" | "video";
  ok: boolean;
  error: string | null;
  details: Record<string, unknown>;
}

/** Messages the harness page sends into the worker. */
export type BenchRequest =
  | { type: "job"; id: number; spec: BenchJobSpec; file: File }
  | { type: "probe-boot"; id: number }
  | { type: "inspect"; id: number; file: File }
  | { type: "descriptors"; id: number; spec: BenchJobSpec; file: File }
  | { type: "verify-compositing"; id: number; file: File }
  | { type: "encode-pair"; id: number; spec: BenchJobSpec; file: File };

/** Messages the worker sends back. */
export type BenchResponse =
  | {
      type: "progress";
      id: number;
      stage: string;
      done: number;
      total: number | null;
    }
  | { type: "result"; id: number; result: BenchResult; gif: ArrayBuffer | null }
  | { type: "boot"; id: number; ok: boolean; ms: number; error: string | null }
  | { type: "inspect"; id: number; inspection: ContainerInspection }
  | { type: "descriptors"; id: number; descriptors: unknown }
  | { type: "compositing"; id: number; comparison: unknown }
  | {
      type: "pair";
      id: number;
      width: number;
      height: number;
      frames: number;
      gifski: { gif: ArrayBuffer; ms: number; quality: number };
      gifenc: {
        gif: ArrayBuffer;
        ms: number;
        colours: number;
        attempts: number;
      };
    }
  | { type: "error"; id: number; error: string };
