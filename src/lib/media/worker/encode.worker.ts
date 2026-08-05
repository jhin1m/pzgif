/**
 * The encode worker. Spawned per attempt, terminated after it.
 *
 * It exists as a separate thread for one reason: **gifski's WASM heap never
 * shrinks.** A long-lived encode worker holds the high-water mark of the largest
 * job it ever ran for the rest of the session, and on the Discord auto-fit path
 * — five attempts against a byte budget — that grows monotonically toward the
 * iOS ceiling. Throwing the worker away is the only way to give the memory back.
 *
 * It is also the only place cancellation can act on gifski at all. `encode()` is
 * one synchronous WASM call with no callback and no abort; terminating the
 * thread is the abort.
 */

import { encodeWithGifenc } from "../encode/gifenc";
import { encodeWithGifski } from "../encode/gifski";
import { encodePngZip } from "../encode/png-zip";
import { encodeVideo } from "../encode/video";
import type { EncodeCall, EncodeReply } from "./protocol";
import type { DecodedFrame } from "../types";

/**
 * The worker's own global, typed to the members this file uses.
 *
 * `DedicatedWorkerGlobalScope` lives in the `webworker` lib, and enabling that
 * repo-wide would collide with the DOM lib every other file depends on. Naming
 * the surface used here is smaller and states the contract directly.
 */
const scope = self as unknown as {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<{ type: "port"; port: MessagePort }>) => void,
  ): void;
};

scope.addEventListener("message", (event) => {
  if (event.data?.type !== "port") return;
  const port = event.data.port;
  port.onmessage = (call: MessageEvent<EncodeCall>) => {
    void handleEncode(port, call.data);
  };
  port.start();
});

function reply(port: MessagePort, message: EncodeReply): void {
  port.postMessage(message);
}

async function handleEncode(port: MessagePort, call: EncodeCall): Promise<void> {
  const startedAt = performance.now();
  try {
    // `frameBuffers` maps each output frame to a buffer, so a shared frame — the
    // interior of a ping-pong — becomes two entries over one allocation, exactly
    // as it was on the other side.
    const frames: DecodedFrame[] = call.frameBuffers.map((bufferIndex, index) => ({
      rgba: new Uint8Array(call.buffers[bufferIndex]),
      durationMs: call.durations[index],
    }));

    const onFrame = (done: number, total: number) =>
      reply(port, { type: "progress", done, total });

    const blob = await encode(call, frames, onFrame);
    reply(port, { type: "done", blob, encodeMs: performance.now() - startedAt });
  } catch (error) {
    reply(port, {
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function encode(
  call: EncodeCall,
  frames: DecodedFrame[],
  onFrame: (done: number, total: number) => void,
): Promise<Blob> {
  const { request } = call;

  switch (request.kind) {
    case "gif": {
      if (request.encoder === "gifski") {
        // No progress is reported here, and none is invented. gifski exposes no
        // callback and blocks this thread for the whole call, so the honest
        // signal is the indeterminate track the pipeline already switched to.
        const bytes = await encodeWithGifski({
          frames,
          width: request.width,
          height: request.height,
          quality: request.quality,
        });
        return new Blob([toStandaloneBuffer(bytes)], { type: "image/gif" });
      }
      const bytes = encodeWithGifenc({
        frames,
        width: request.width,
        height: request.height,
        colours: request.colours,
        onFrame,
      });
      return new Blob([toStandaloneBuffer(bytes)], { type: "image/gif" });
    }

    case "video": {
      const { blob } = await encodeVideo({
        frames,
        width: request.width,
        height: request.height,
        container: request.container,
        bitrateKbps: request.bitrateKbps,
        onFrame,
      });
      return blob;
    }

    case "png-zip":
      return encodePngZip({
        frames,
        width: request.width,
        height: request.height,
        baseName: request.baseName,
        onFrame,
      });
  }
}

/**
 * Copies into a standalone ArrayBuffer.
 *
 * A `Uint8Array` may be a view onto a larger buffer, and handing that to `Blob`
 * would carry everything behind it — for the gifski path, whatever else the WASM
 * heap happened to be holding.
 */
function toStandaloneBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
