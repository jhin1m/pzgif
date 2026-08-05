/**
 * The control messages the two workers exchange with the page.
 *
 * Kept separate from `types.ts` because none of this is the public API: the
 * hook and the tool pages see `JobRequest`/`JobEvent` and nothing else. What is
 * here is plumbing — who spawns the encode worker, who owns the watchdog — and
 * it is plumbing precisely because the answer is "not the pipeline worker".
 *
 * ── Why the page brokers the encode worker ─────────────────────────────────
 * The encode worker has to be spawned and terminated per attempt, and something
 * has to notice when it stops responding. The pipeline worker cannot do either:
 * nested workers are not reliably available across engines, and a watchdog is
 * useless if it lives in a thread the encoder can block. The page owns
 * lifecycle, and the two workers are then wired together with a `MessageChannel`
 * so frames transfer **directly** between them — relaying frames through the
 * page would structured-clone hundreds of megabytes onto the main thread, which
 * is the exact failure the worker split exists to prevent.
 */

import type { DeviceTier } from "../limits";
import type { JobEvent, JobRequest } from "../types";
import type { EncodeRequest } from "../pipeline";

/** Page → pipeline worker. */
export type PipelineInbound =
  | JobRequest
  /** Sent once at worker creation. The worker cannot detect the tier itself —
   *  `navigator.maxTouchPoints` is Window-only, and it is how iOS is found. */
  | { type: "configure"; tier: DeviceTier }
  | { type: "encoder-port"; jobId: number; port: MessagePort }
  | { type: "encoder-failed"; jobId: number; reason: "hang" | "error"; message?: string };

/** Pipeline worker → page. */
export type PipelineOutbound =
  | JobEvent
  | { type: "need-encoder"; jobId: number; watchdogMs: number }
  | { type: "release-encoder"; jobId: number };

/** Pipeline worker → encode worker, over the channel. */
export interface EncodeCall {
  type: "encode";
  request: EncodeRequest;
  /**
   * The frames' pixel buffers, **deduplicated**. Transferred, not copied, so the
   * pipeline worker holds nothing afterwards.
   *
   * Deduplicated because ping-pong deliberately shares the interior frames'
   * buffers rather than copying their pixels — and a transfer list containing
   * the same `ArrayBuffer` twice throws `DataCloneError`, which would break
   * every ping-pong job. `frameBuffers` maps output frame index → entry here.
   */
  buffers: ArrayBuffer[];
  frameBuffers: number[];
  durations: number[];
}

/** Encode worker → pipeline worker, over the channel. */
export type EncodeReply =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; blob: Blob; encodeMs: number }
  | { type: "error"; message: string };
