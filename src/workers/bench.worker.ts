/**
 * The Phase 1 benchmark worker.
 *
 * Everything — demux, decode, downscale, encode, verification — happens in here.
 * The page only starts jobs and renders rows. That split is not tidiness: the
 * INP and longest-main-thread-task numbers this spike reports are only
 * meaningful if the pipeline sits off the main thread exactly the way production
 * will put it there.
 */

import { initGifski } from "@/lib/bench/encode-gifski";
import { stopwatch } from "@/lib/bench/measure";
import {
  computeDescriptors,
  inspectContainer,
  runBenchJob,
  runEncodePair,
  verifyCompositing,
} from "@/lib/bench/run-job";
import type { BenchRequest, BenchResponse } from "@/lib/bench/types";

/**
 * The worker's own global, typed to the two calls this file makes.
 *
 * `DedicatedWorkerGlobalScope` comes from the `webworker` lib, and adding that
 * lib repo-wide would collide with the DOM lib every other file depends on.
 * Naming the surface used here is smaller and states the contract directly.
 */
const scope = self as unknown as {
  postMessage(message: BenchResponse, transfer?: Transferable[]): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<BenchRequest>) => void,
  ): void;
};

function reply(message: BenchResponse, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

scope.addEventListener("message", (event) => {
  void handle(event.data);
});

async function handle(request: BenchRequest): Promise<void> {
  try {
    switch (request.type) {
      case "probe-boot": {
        // G5. Instantiating the module is the whole test: it is what the CSP
        // can refuse, and `'wasm-unsafe-eval'` failing shows up here and
        // nowhere else.
        const elapsed = stopwatch();
        try {
          await initGifski();
          reply({ type: "boot", id: request.id, ok: true, ms: elapsed(), error: null });
        } catch (error) {
          reply({
            type: "boot",
            id: request.id,
            ok: false,
            ms: elapsed(),
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      case "job": {
        const { result, gif } = await runBenchJob(
          request.file,
          request.spec,
          (stage, done, total) =>
            reply({ type: "progress", id: request.id, stage, done, total }),
        );
        const buffer = gif ? toTransferable(gif) : null;
        reply(
          { type: "result", id: request.id, result, gif: buffer },
          buffer ? [buffer] : [],
        );
        return;
      }

      case "encode-pair": {
        // G6. One decode, two encodes: gifski at its requested quality, then
        // gifenc tuned down its palette ladder until it lands at or under
        // gifski's byte count. Comparing the two at their own defaults would
        // compare two different file sizes, which is not a quality comparison
        // at all.
        const pair = await runEncodePair(
          request.file,
          request.spec,
          (stage, done, total) =>
            reply({ type: "progress", id: request.id, stage, done, total }),
        );
        const gifski = toTransferable(pair.gifski.bytes);
        const gifenc = toTransferable(pair.gifenc.bytes);
        reply(
          {
            type: "pair",
            id: request.id,
            width: pair.width,
            height: pair.height,
            frames: pair.frames,
            gifski: {
              gif: gifski,
              ms: pair.gifski.ms,
              quality: pair.gifski.quality,
            },
            gifenc: {
              gif: gifenc,
              ms: pair.gifenc.ms,
              colours: pair.gifenc.colours,
              attempts: pair.gifenc.attempts,
            },
          },
          [gifski, gifenc],
        );
        return;
      }

      case "descriptors": {
        reply({
          type: "descriptors",
          id: request.id,
          descriptors: await computeDescriptors(request.file, request.spec),
        });
        return;
      }

      case "verify-compositing": {
        reply({
          type: "compositing",
          id: request.id,
          comparison: await verifyCompositing(request.file),
        });
        return;
      }

      case "inspect": {
        reply({
          type: "inspect",
          id: request.id,
          inspection: await inspectContainer(request.file),
        });
        return;
      }
    }
  } catch (error) {
    reply({
      type: "error",
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Copies into a standalone ArrayBuffer so it can be transferred.
 *
 * A `Uint8Array` may be a view onto a larger buffer, and transferring that would
 * hand the receiver everything behind it — including, for the gifski path,
 * whatever else the WASM heap happened to be holding.
 */
function toTransferable(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export type { BenchRequest, BenchResponse };
