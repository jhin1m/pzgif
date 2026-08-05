/**
 * One benchmark job, end to end: probe, decode, downscale, encode, verify.
 *
 * Deliberately mirrors the shape production will have — decode streams, frames
 * accumulate only because gifski cannot stream, progress derives from a real
 * frame index — so the timings measured here describe the pipeline the product
 * will actually ship rather than a benchmark-shaped approximation of it.
 */

import {
  compareCompositingAgainstReference,
  gifFrameSource,
  readGifMetadata,
} from "./decode-gif";
import { decode as decodeGif, decodeFrames } from "modern-gif";
import { probeVideo, videoFrameSource } from "./decode-video";
import { encodeGifencToByteBudget, encodeWithGifenc } from "./encode-gifenc";
import { encodeWithGifski, initGifski } from "./encode-gifski";
import { HeapSampler, roundTripGif, stopwatch } from "./measure";
import { frameBufferBytes } from "@/lib/media/limits";
import type {
  BenchJobSpec,
  BenchResult,
  ContainerInspection,
  DecodedFrame,
  FrameSource,
} from "./types";

const GIF_EXTENSIONS = /\.gif$/i;

export type ProgressSink = (
  stage: string,
  done: number,
  total: number | null,
) => void;

async function openSource(
  file: File,
  spec: BenchJobSpec,
): Promise<{ source: FrameSource; buffer: ArrayBuffer | null }> {
  if (GIF_EXTENSIONS.test(file.name) || file.type === "image/gif") {
    const buffer = await file.arrayBuffer();
    return {
      source: gifFrameSource(buffer, spec.width, { maxFrames: spec.maxFrames }),
      buffer,
    };
  }
  return {
    source: await videoFrameSource(file, spec.width, spec.fps, {
      maxFrames: spec.maxFrames,
    }),
    buffer: null,
  };
}

export async function runBenchJob(
  file: File,
  spec: BenchJobSpec,
  onProgress: ProgressSink = () => {},
): Promise<{ result: BenchResult; gif: Uint8Array | null }> {
  const total = stopwatch();
  const heap = new HeapSampler();
  heap.start();

  const timings = {
    wasmInitMs: 0,
    probeMs: 0,
    decodeMs: 0,
    encodeMs: 0,
    totalMs: 0,
  };

  const fail = (error: unknown, hang = false): {
    result: BenchResult;
    gif: null;
  } => {
    timings.totalMs = total();
    return {
      result: {
        spec,
        ok: false,
        hang,
        error: error instanceof Error ? error.message : String(error),
        outWidth: 0,
        outHeight: 0,
        frames: 0,
        outBytes: 0,
        timings,
        peakJsHeapBytes: heap.stop(),
        frameBufferBytes: 0,
        longestMainThreadTaskMs: null,
        roundTrip: null,
      },
      gif: null,
    };
  };

  try {
    // ── Probe ───────────────────────────────────────────────────────────────
    const probe = stopwatch();
    const { source } = await openSource(file, spec);
    timings.probeMs = probe();
    onProgress("probe", 1, 1);

    // gifski's init is measured separately from the encode. A cold `.wasm`
    // fetch is a real first-visit cost that belongs in the UX numbers, but
    // folding it into encode time would make every warm run look slower than it
    // is and would corrupt the watchdog's median.
    if (spec.encoder === "gifski") {
      const init = stopwatch();
      await initGifski();
      timings.wasmInitMs = init();
    }

    // ── Decode ──────────────────────────────────────────────────────────────
    const decode = stopwatch();
    const frames: DecodedFrame[] = [];
    for await (const frame of source.frames()) {
      frames.push(frame);
      onProgress("decode", frames.length, source.frameCount);
    }
    timings.decodeMs = decode();

    if (frames.length === 0) throw new Error("Decoded zero frames");

    // ── Encode ──────────────────────────────────────────────────────────────
    // Progress goes silent here on purpose. gifski exposes no callback and
    // blocks the worker outright, so there is no counter to report against — and
    // interpolating one would be inventing a percentage. The honest signal is a
    // labelled indeterminate stage.
    onProgress("encode", 0, null);
    const encode = stopwatch();
    const bytes =
      spec.encoder === "gifski"
        ? await encodeWithGifski({
            frames,
            width: source.width,
            height: source.height,
            quality: spec.quality,
          })
        : encodeWithGifenc({
            frames,
            width: source.width,
            height: source.height,
            colours: spec.colours,
          });
    timings.encodeMs = encode();
    onProgress("encode", 1, 1);

    const roundTrip = await roundTripGif(bytes);
    timings.totalMs = total();

    return {
      result: {
        spec,
        ok: true,
        hang: false,
        error: null,
        outWidth: source.width,
        outHeight: source.height,
        frames: frames.length,
        outBytes: bytes.byteLength,
        timings,
        peakJsHeapBytes: heap.stop(),
        frameBufferBytes: frameBufferBytes(
          frames.length,
          source.width,
          source.height,
        ),
        longestMainThreadTaskMs: null,
        roundTrip,
      },
      gif: bytes,
    };
  } catch (error) {
    return fail(error);
  }
}

export interface EncodePair {
  width: number;
  height: number;
  frames: number;
  gifski: { bytes: Uint8Array; ms: number; quality: number };
  gifenc: { bytes: Uint8Array; ms: number; colours: number; attempts: number };
}

/**
 * Decodes once, encodes with both encoders, and matches gifenc to gifski's byte
 * count. This is the G6 pack generator.
 *
 * Decoding once is the whole point. Two separate decodes would let any
 * difference in downscaling, frame sampling or delay handling leak into the
 * comparison, and the judges would be scoring that difference while believing
 * they were scoring the encoders.
 */
export async function runEncodePair(
  file: File,
  spec: BenchJobSpec,
  onProgress: ProgressSink = () => {},
): Promise<EncodePair> {
  const { source } = await openSource(file, spec);

  const frames: DecodedFrame[] = [];
  for await (const frame of source.frames()) {
    frames.push(frame);
    onProgress("decode", frames.length, source.frameCount);
  }
  if (frames.length === 0) throw new Error("Decoded zero frames");

  onProgress("encode-gifski", 0, null);
  const gifskiClock = stopwatch();
  const gifskiBytes = await encodeWithGifski({
    frames,
    width: source.width,
    height: source.height,
    quality: spec.quality,
  });
  const gifskiMs = gifskiClock();

  onProgress("encode-gifenc", 0, null);
  const gifencClock = stopwatch();
  const tuned = encodeGifencToByteBudget(
    { frames, width: source.width, height: source.height },
    gifskiBytes.byteLength,
  );
  const gifencMs = gifencClock();

  return {
    width: source.width,
    height: source.height,
    frames: frames.length,
    gifski: { bytes: gifskiBytes, ms: gifskiMs, quality: spec.quality },
    gifenc: {
      bytes: tuned.bytes,
      ms: gifencMs,
      colours: tuned.colours,
      attempts: tuned.attempts,
    },
  };
}

/**
 * Content descriptors — the estimator's missing input features.
 *
 * GIF size is dominated by *content*, not by settings. Two clips at identical
 * width, frame rate and quality can differ several-fold in output bytes because
 * one is flat vector art and the other is grainy footage. An estimator keyed
 * only on the settings the UI exposes ignores the dominant variable, so the
 * "≈ 1.8 MB" readout would be confidently wrong on exactly the inputs users care
 * about. These are measured here so Phase 4 can key on them.
 */
export interface ContentDescriptors {
  frames: number;
  width: number;
  height: number;
  /** Shannon entropy in bits of the RGB565-quantised colour histogram, 0-16. */
  paletteEntropyBits: number;
  /** Distinct RGB565 colours across the sampled frames. */
  distinctColours: number;
  /** Mean absolute luma difference between consecutive frames, 0-255. */
  meanInterFrameDelta: number;
  /** Share of pixels whose 3x3 neighbourhood is uniform. High means flat art. */
  flatPixelRatio: number;
  classification: "flat" | "mixed" | "photographic";
}

export async function computeDescriptors(
  file: File,
  spec: BenchJobSpec,
): Promise<ContentDescriptors> {
  const { source } = await openSource(file, spec);

  const histogram = new Map<number, number>();
  let previousLuma: Uint8Array | null = null;
  let deltaSum = 0;
  let deltaCount = 0;
  let flatPixels = 0;
  let totalPixels = 0;
  let frames = 0;

  const { width, height } = source;

  for await (const frame of source.frames()) {
    frames += 1;
    const rgba = frame.rgba;
    const luma = new Uint8Array(width * height);

    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const offset = pixel * 4;
      const r = rgba[offset];
      const g = rgba[offset + 1];
      const b = rgba[offset + 2];
      // RGB565, matching what `gifenc`'s quantiser actually sees.
      const key = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
      histogram.set(key, (histogram.get(key) ?? 0) + 1);
      luma[pixel] = (r * 77 + g * 150 + b * 29) >> 8;
    }

    // Flatness from horizontal and vertical neighbours only — a full 3x3 window
    // costs several times more for a measurement that moves by a percent.
    for (let y = 1; y < height; y += 1) {
      for (let x = 1; x < width; x += 1) {
        const at = y * width + x;
        if (
          Math.abs(luma[at] - luma[at - 1]) <= 2 &&
          Math.abs(luma[at] - luma[at - width]) <= 2
        ) {
          flatPixels += 1;
        }
        totalPixels += 1;
      }
    }

    if (previousLuma) {
      let sum = 0;
      for (let pixel = 0; pixel < luma.length; pixel += 1) {
        sum += Math.abs(luma[pixel] - previousLuma[pixel]);
      }
      deltaSum += sum / luma.length;
      deltaCount += 1;
    }
    previousLuma = luma;
  }

  const samples = frames * width * height;
  let entropy = 0;
  for (const count of histogram.values()) {
    const probability = count / samples;
    entropy -= probability * Math.log2(probability);
  }

  const flatPixelRatio = totalPixels > 0 ? flatPixels / totalPixels : 0;
  const classification: ContentDescriptors["classification"] =
    flatPixelRatio > 0.7 ? "flat" : flatPixelRatio > 0.35 ? "mixed" : "photographic";

  return {
    frames,
    width,
    height,
    paletteEntropyBits: +entropy.toFixed(3),
    distinctColours: histogram.size,
    meanInterFrameDelta: +(deltaCount > 0 ? deltaSum / deltaCount : 0).toFixed(3),
    flatPixelRatio: +flatPixelRatio.toFixed(4),
    classification,
  };
}

/**
 * Runs the streaming compositor against `modern-gif`'s own `decodeFrames()` and
 * reports whether they agree pixel for pixel.
 *
 * Bounded to a modest frame count: the reference implementation is O(n) in
 * memory at source size, which is exactly why it is not the production path.
 */
export async function verifyCompositing(
  file: File,
  maxFrames = 24,
): Promise<ReturnType<typeof compareCompositingAgainstReference>> {
  const buffer = await file.arrayBuffer();
  const gif = decodeGif(buffer);
  const reference = decodeFrames(buffer, {
    gif,
    range: [0, Math.min(maxFrames, gif.frames.length) - 1],
  });

  // Native size, so nothing is resampled and any difference is compositing.
  const source = gifFrameSource(buffer, gif.width, { maxFrames });
  const produced: Uint8Array[] = [];
  for await (const frame of source.frames()) produced.push(frame.rgba);

  return compareCompositingAgainstReference(buffer, reference, produced);
}

/** Container and rotation facts for G7, independent of any encode. */
export async function inspectContainer(
  file: File,
): Promise<ContainerInspection> {
  try {
    if (GIF_EXTENSIONS.test(file.name) || file.type === "image/gif") {
      const metadata = readGifMetadata(await file.arrayBuffer());
      return { kind: "gif", ok: true, error: null, details: { ...metadata } };
    }
    const probe = await probeVideo(file);
    return { kind: "video", ok: true, error: null, details: { ...probe } };
  } catch (error) {
    return {
      kind: GIF_EXTENSIONS.test(file.name) ? "gif" : "video",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      details: {},
    };
  }
}
