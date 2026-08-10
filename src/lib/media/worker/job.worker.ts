/**
 * The pipeline worker: probe, admit, demux, decode, frame ops.
 *
 * Long-lived — it holds no WASM heap of its own, so there is nothing to reclaim
 * by restarting it, and a warm worker saves a module instantiation per job.
 *
 * The main thread never sees a frame buffer. It starts jobs, brokers encode
 * workers and renders progress; everything with pixels in it happens here or in
 * the encode worker, and the frames move between the two by transfer over a
 * `MessageChannel` rather than through the page.
 */

import {
  runAutofit,
  runEstimate,
  runJob,
  type EncodeOutcome,
  type EncodeRequest,
  type PipelineHost,
} from "../pipeline";
import { configureTier } from "../capability";
import { probeInput } from "../decode";
import { toMediaError } from "../errors";
import type { DecodedFrame, JobEvent } from "../types";
import type { EncodeCall, EncodeReply, PipelineInbound, PipelineOutbound } from "./protocol";

const scope = self as unknown as {
  postMessage(message: PipelineOutbound, transfer?: Transferable[]): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<PipelineInbound>) => void,
  ): void;
};

/** One entry per in-flight job. Cancellation and encoder brokering hang off it. */
interface JobState {
  controller: AbortController;
  /** Resolved when the page hands over a port for the next encode attempt. */
  awaitEncoder: ((port: MessagePort) => void) | null;
  /** Rejects the current encode when the page reports a hang or a dead worker. */
  failEncoder: ((error: Error & { hang?: boolean }) => void) | null;
}

const jobs = new Map<number, JobState>();

function emit(event: JobEvent, transfer: Transferable[] = []): void {
  scope.postMessage(event, transfer);
}

scope.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.type) {
    case "configure": {
      // The page detected the tier where `maxTouchPoints` exists. Without this
      // the worker would classify every iPhone as a desktop.
      configureTier(message.tier);
      return;
    }

    case "run": {
      const state: JobState = {
        controller: new AbortController(),
        awaitEncoder: null,
        failEncoder: null,
      };
      jobs.set(message.jobId, state);
      void runJob(
        message.jobId,
        message.file,
        message.spec,
        hostFor(message.jobId),
        state.controller.signal,
      ).finally(() => jobs.delete(message.jobId));
      return;
    }

    case "autofit": {
      const state: JobState = {
        controller: new AbortController(),
        awaitEncoder: null,
        failEncoder: null,
      };
      jobs.set(message.jobId, state);
      void runAutofit(
        message.jobId,
        message.file,
        message.spec,
        message.budgetBytes,
        hostFor(message.jobId),
        state.controller.signal,
      ).finally(() => jobs.delete(message.jobId));
      return;
    }

    case "estimate": {
      const state: JobState = {
        controller: new AbortController(),
        awaitEncoder: null,
        failEncoder: null,
      };
      jobs.set(message.jobId, state);
      void runEstimate(
        message.jobId,
        message.file,
        message.spec,
        hostFor(message.jobId),
        state.controller.signal,
      ).finally(() => jobs.delete(message.jobId));
      return;
    }

    case "probe": {
      void probeInput(message.file)
        .then((probe) => emit({ type: "probed", jobId: message.jobId, probe }))
        .catch((error) =>
          emit({ type: "error", jobId: message.jobId, error: toMediaError(error) }),
        );
      return;
    }

    case "cancel": {
      // Cooperative on the decode side — the loop checks the signal between
      // frames — and immediate on the encode side. Failing the pending encoder
      // wait matters even when no encoder exists yet: a cancel that lands in the
      // window between `need-encoder` and the port arriving would otherwise let
      // the job run to completion and emit `done` minutes after it was stopped.
      const cancelled = jobs.get(message.jobId);
      cancelled?.controller.abort();
      cancelled?.failEncoder?.(
        Object.assign(new Error("Cancelled"), { hang: false, cancelled: true }),
      );
      return;
    }

    case "encoder-port": {
      const state = jobs.get(message.jobId);
      state?.awaitEncoder?.(message.port);
      return;
    }

    case "encoder-failed": {
      const state = jobs.get(message.jobId);
      const error = Object.assign(new Error(message.message ?? "Encoder stopped responding"), {
        hang: message.reason === "hang",
      });
      state?.failEncoder?.(error);
      return;
    }
  }
});

function hostFor(jobId: number): PipelineHost {
  return {
    emit,
    encode: (request, frames, options) => runEncode(jobId, request, frames, options),
  };
}

/**
 * Hands the frames to a fresh encode worker and waits for the result.
 *
 * The frames' buffers are **transferred**, so this worker holds nothing while
 * the encode runs. That is what keeps peak residency at one copy rather than
 * two, and it is why a fallback retry has to decode again rather than re-sending.
 */
async function runEncode(
  jobId: number,
  request: EncodeRequest,
  frames: DecodedFrame[],
  options: { watchdogMs: number; onFrame: (done: number, total: number) => void },
): Promise<EncodeOutcome> {
  const state = jobs.get(jobId);
  if (!state) throw new Error("Job is no longer running");

  const port = await new Promise<MessagePort>((resolve, reject) => {
    state.awaitEncoder = resolve;
    state.failEncoder = (error) => reject(error);
    scope.postMessage({ type: "need-encoder", jobId, watchdogMs: options.watchdogMs });
  });

  // Deduplicate before transferring. Ping-pong shares the interior frames'
  // buffers rather than copying their pixels, and a transfer list holding the
  // same `ArrayBuffer` twice throws `DataCloneError` — which would fail every
  // ping-pong job at the last step, after all the work was done.
  const buffers: ArrayBuffer[] = [];
  const seen = new Map<ArrayBufferLike, number>();
  const frameBuffers = frames.map((frame) => {
    const existing = seen.get(frame.rgba.buffer);
    if (existing !== undefined) return existing;
    const index = buffers.length;
    buffers.push(toTransferable(frame.rgba));
    seen.set(frame.rgba.buffer, index);
    return index;
  });

  const call: EncodeCall = {
    type: "encode",
    request,
    buffers,
    frameBuffers,
    durations: frames.map((frame) => frame.durationMs),
  };
  // Drop our own references before transferring: keeping the array alive would
  // hold detached views, which is harmless, and the frame objects, which is not.
  frames.length = 0;

  try {
    return await new Promise<EncodeOutcome>((resolve, reject) => {
      state.failEncoder = (error) => reject(error);
      port.onmessage = (event: MessageEvent<EncodeReply>) => {
        const reply = event.data;
        if (reply.type === "progress") {
          options.onFrame(reply.done, reply.total);
          return;
        }
        if (reply.type === "done") {
          resolve({ blob: reply.blob, encodeMs: reply.encodeMs });
          return;
        }
        reject(new Error(reply.message));
      };
      port.start();
      port.postMessage(call, buffers);
    });
  } finally {
    state.awaitEncoder = null;
    state.failEncoder = null;
    port.onmessage = null;
    port.close();
    // The page owns the worker's lifetime; this is what tells it the attempt is
    // over and the heap can be reclaimed by termination.
    scope.postMessage({ type: "release-encoder", jobId });
  }
}

/**
 * Copies into a standalone ArrayBuffer when the view does not already own one.
 *
 * A view onto a larger buffer would transfer everything behind it. Frames
 * produced by `getImageData` own their buffer outright, so the common path is
 * the cheap one.
 */
function toTransferable(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer;
  }
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
