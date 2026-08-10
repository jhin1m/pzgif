/**
 * One job, end to end, inside the pipeline worker: probe → admit → decode →
 * ops → encode → package.
 *
 * ── Why encoding is delegated instead of called ────────────────────────────
 * `host.encode()` runs in a *second* worker that is terminated after every
 * attempt. gifski's `WebAssembly.Memory` never shrinks, so a long-lived encode
 * worker holds the high-water mark of the largest job it ever ran for the rest
 * of the session — on the Discord auto-fit path, five attempts in one worker
 * grow monotonically toward the iOS ceiling. Terminating costs ~50-150 ms to
 * respawn and instantiate, which is itself the argument for seeding the auto-fit
 * search from the estimator rather than searching blind.
 *
 * Delegation is also what makes cancellation and the hang watchdog possible at
 * all: `encode()` is one synchronous WASM call that blocks its worker outright,
 * so nothing inside that worker can observe a cancel or a timeout. Something
 * outside has to, and that something cannot be the main thread's UI.
 *
 * ── Why frames are transferred rather than copied ──────────────────────────
 * The frame buffers move to the encode worker by transfer, so the pipeline
 * worker holds nothing during the encode. The cost is that a fallback retry has
 * to decode again — the buffers are gone. That is the right trade: keeping a
 * copy against a ~0.12% hang rate would double peak residency on every single
 * job, and peak residency is the constraint the whole engine is built around.
 */

import { attemptCap, planSearch, REFERENCE_COLOURS, REFERENCE_QUALITY } from "./autofit";
import { stageWeights } from "./calibration";
import { detectCapabilities, fallbackEncoder, resolveEncoder } from "./capability";
import { inputRefusal, openFrameSource, probeInput } from "./decode";
import { cancelledError, decodeFailedError, toMediaError } from "./errors";
import { admit } from "./plan";
import { ProgressReporter } from "./progress";
import { applyDirection } from "./ops/reverse";
import { retime } from "./ops/speed";
import { keepEveryNthFrame } from "./ops/frame-select";
import { firstFrameBitmap } from "./encode/preview";
import { estimateFromSample } from "./estimate";
import { releaseDownscaleScratch } from "./downscale";
import { TIER_BUDGETS } from "./limits";
import type {
  AcceptedPlan,
  AutofitSettings,
  DecodedFrame,
  GifEncoderId,
  JobEvent,
  JobSpec,
  JobStats,
} from "./types";

/** What the encode worker is asked to produce. Mirrors `OutputSpec` plus size. */
export type EncodeRequest =
  | {
      kind: "gif";
      encoder: GifEncoderId;
      width: number;
      height: number;
      quality: number;
      colours: number;
    }
  | { kind: "video"; width: number; height: number; container: "mp4" | "webm"; bitrateKbps?: number }
  | { kind: "png-zip"; width: number; height: number; baseName: string };

export interface EncodeOutcome {
  blob: Blob;
  encodeMs: number;
}

/**
 * The pipeline's window onto everything it does not own: the encode worker, and
 * the channel back to the page.
 *
 * `encode()` rejects with `{ hang: true }` when the watchdog fired, which is the
 * only signal the pipeline gets that the encoder stopped responding — by
 * definition it cannot be reported from inside a blocked worker.
 */
export interface PipelineHost {
  emit(event: JobEvent, transfer?: Transferable[]): void;
  encode(
    request: EncodeRequest,
    frames: DecodedFrame[],
    options: { watchdogMs: number; onFrame: (done: number, total: number) => void },
  ): Promise<EncodeOutcome>;
}

/**
 * How long the encoder may go silent before it is presumed hung.
 *
 * gifski measured ~276 ms per output megapixel on V8 and JavaScriptCore. Ten
 * times that is the same multiplier G1's soak used to distinguish a slow run
 * from a hang, over 2,500 runs with zero false positives. The 20-second floor
 * covers small jobs where the multiplier alone would be tighter than a cold WASM
 * instantiation.
 */
export function watchdogBudgetMs(frames: number, width: number, height: number): number {
  const megapixels = (frames * width * height) / 1_000_000;
  return Math.max(20_000, Math.round(megapixels * 276 * 10));
}

function inputKindOf(format: string): "video" | "gif" | "webp" {
  if (format === "video") return "video";
  if (format === "webp") return "webp";
  return "gif";
}

async function decodeAll(
  file: File,
  spec: JobSpec,
  plan: AcceptedPlan,
  probe: Awaited<ReturnType<typeof probeInput>>,
  reporter: ProgressReporter,
  host: PipelineHost,
  jobId: number,
  signal: AbortSignal,
): Promise<{ frames: DecodedFrame[]; width: number; height: number }> {
  // `decodeFrames`, not `frames`: the plan's frame count is what the *output*
  // will hold after reordering, and ping-pong turns n decoded frames into 2n-2.
  const { source, geometry } = await openFrameSource(
    file,
    probe,
    spec,
    plan.width,
    plan.fps,
    plan.decodeFrames,
  );

  reporter.enter("decode");
  const frames: DecodedFrame[] = [];

  try {
    for await (const frame of source.frames(signal)) {
      if (signal.aborted) throw cancelledError();
      frames.push(frame);
      reporter.report(frames.length, source.frameCount);

      if (frames.length === 1) {
        // The first frame is the preview. Sending it now means the result panel
        // has something real to show while the rest of the job runs, and it costs
        // one bitmap rather than an encode.
        const bitmap = await firstFrameBitmap(frame, source.width, source.height);
        host.emit({ type: "preview", jobId, bitmap }, [bitmap]);
      }
    }
  } catch (error) {
    if (signal.aborted) throw cancelledError();
    // Anything thrown while reading the file is a decode failure, and saying so
    // matters: the generic path would offer "lower Colors to 128", a setting
    // change that cannot help a file we could not read.
    throw decodeFailedError({
      canOfferFallback: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    geometry.release();
    releaseDownscaleScratch();
  }

  if (frames.length === 0) {
    throw decodeFailedError({ canOfferFallback: false, detail: "decoded zero frames" });
  }
  return { frames, width: source.width, height: source.height };
}

function applyTimingOps(frames: DecodedFrame[], spec: JobSpec): DecodedFrame[] {
  const { frames: retimed } = retime(frames, spec.timing.speed);
  return applyDirection(retimed, spec.timing.direction);
}

function encodeRequestFor(
  spec: JobSpec,
  plan: AcceptedPlan,
  width: number,
  height: number,
  encoder: GifEncoderId,
  baseName: string,
): EncodeRequest {
  switch (spec.output.kind) {
    case "gif":
      return {
        kind: "gif",
        encoder,
        width,
        height,
        quality: spec.output.quality,
        colours: spec.output.colours,
      };
    case "video":
      return {
        kind: "video",
        width,
        height,
        container: spec.output.container,
        bitrateKbps: spec.output.bitrateKbps,
      };
    case "png-zip":
      return { kind: "png-zip", width, height, baseName };
  }
}

function baseNameOf(file: File): string {
  const dot = file.name.lastIndexOf(".");
  const stem = dot > 0 ? file.name.slice(0, dot) : file.name;
  // Kept ASCII and path-free: the name ends up inside a ZIP central directory,
  // which has no encoding flag set here, and inside a download filename.
  return stem.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60) || "frame";
}

export async function runJob(
  jobId: number,
  file: File,
  spec: JobSpec,
  host: PipelineHost,
  signal: AbortSignal,
): Promise<void> {
  const startedAt = performance.now();
  const capabilities = detectCapabilities();
  let reporter: ProgressReporter | null = null;

  try {
    const probe = await probeInput(file);
    const encoder = resolveEncoder(
      spec.output.kind === "gif" ? spec.output.encoder : undefined,
      capabilities,
    );
    reporter = new ProgressReporter(
      stageWeights(
        inputKindOf(probe.format),
        spec.output.kind === "gif" ? encoder : "other",
      ),
      (progress) => host.emit({ type: "progress", jobId, progress }),
    );
    reporter.enter("probe");

    // What the bytes say, not what the extension claims. A `.gif` that is really
    // an MP4 gets routed to the tool that takes MP4s, with a reason — rather
    // than failing later in the generic `decode-failed` bucket.
    const wrongInput = inputRefusal(probe, spec);
    if (wrongInput) {
      host.emit({ type: "refused", jobId, error: wrongInput });
      return;
    }

    const admission = admit(probe, spec, capabilities);
    if (!admission.ok) {
      host.emit({ type: "refused", jobId, error: admission.error });
      return;
    }
    const plan = admission.plan;
    host.emit({ type: "accepted", jobId, plan });

    const decodeStartedAt = performance.now();
    const decoded = await decodeAll(file, spec, plan, probe, reporter, host, jobId, signal);
    const decodeMs = performance.now() - decodeStartedAt;
    if (signal.aborted) throw cancelledError();

    const frames = applyTimingOps(decoded.frames, spec);
    // Read before handing the array over: `host.encode` transfers the buffers
    // and empties the array, so anything the stats need has to be taken first.
    let outputFrameCount = frames.length;
    const baseName = baseNameOf(file);

    reporter.enter("encode");
    const watchdogMs = watchdogBudgetMs(frames.length, decoded.width, decoded.height);

    let chosenEncoder = plan.encoder ?? encoder;
    let fellBack = false;
    let outcome: EncodeOutcome;

    try {
      outcome = await host.encode(
        encodeRequestFor(spec, plan, decoded.width, decoded.height, chosenEncoder, baseName),
        frames,
        { watchdogMs, onFrame: (done, total) => reporter?.report(done, total) },
      );
    } catch (error) {
      // A hang is the only failure worth re-running: it is a known upstream
      // defect in one encoder, and the other one is right there. Any other
      // failure would just fail again.
      const hung = (error as { hang?: boolean }).hang === true;
      if (!hung || spec.output.kind !== "gif" || signal.aborted) throw error;

      fellBack = true;
      chosenEncoder = fallbackEncoder(chosenEncoder);
      reporter.enter("retry");

      // The frames were transferred to the worker that hung, so they are gone.
      // Decoding again is the price of never holding a second copy.
      const redecoded = await decodeAll(
        file, spec, plan, probe, reporter, host, jobId, signal,
      );
      const retryFrames = applyTimingOps(redecoded.frames, spec);
      outputFrameCount = retryFrames.length;
      reporter.enter("encode");
      outcome = await host.encode(
        encodeRequestFor(spec, plan, redecoded.width, redecoded.height, chosenEncoder, baseName),
        retryFrames,
        {
          watchdogMs: watchdogBudgetMs(retryFrames.length, redecoded.width, redecoded.height),
          onFrame: (done, total) => reporter?.report(done, total),
        },
      );
    }

    // The last gate before the result is announced. A cancel that landed during
    // the encode must not surface as a finished job minutes later.
    if (signal.aborted) throw cancelledError();
    reporter.finish();

    const stats: JobStats = {
      outBytes: outcome.blob.size,
      frames: outputFrameCount,
      width: decoded.width,
      height: decoded.height,
      encoder:
        spec.output.kind === "gif"
          ? chosenEncoder
          : spec.output.kind === "video"
            ? "mediabunny"
            : "fflate",
      decodeMs: Math.round(decodeMs),
      encodeMs: Math.round(outcome.encodeMs),
      totalMs: Math.round(performance.now() - startedAt),
      decodePath: "native",
      encoderFellBack: fellBack,
    };

    host.emit({ type: "done", jobId, blob: outcome.blob, stats });
  } catch (error) {
    if (signal.aborted) {
      host.emit({ type: "error", jobId, error: cancelledError() });
      return;
    }
    host.emit({ type: "error", jobId, error: toMediaError(error) });
  }
}

/**
 * The share of the frame budget an auto-fit job may decode into.
 *
 * A normal job transfers its frames to the encode worker and holds nothing. An
 * auto-fit job cannot: it may need those frames again for a second attempt, and
 * re-decoding a ten-second clip three times is slow enough to read as a hang.
 * So the frames stay resident and each attempt encodes a *copy*, which is one
 * more full-size buffer alive at once than `frameBufferBytes()` accounts for.
 *
 * Two thirds is that third buffer, budgeted before anything is decoded rather
 * than discovered as an OOM on the device with the least room to spare.
 */
const AUTOFIT_BUDGET_SHARE = 2 / 3;

/** Copies the frame list so the originals survive the transfer to the encoder. */
function copyFrames(frames: readonly DecodedFrame[]): DecodedFrame[] {
  return frames.map((frame) => ({
    rgba: new Uint8Array(frame.rgba),
    durationMs: frame.durationMs,
  }));
}

/**
 * Encodes repeatedly until the output lands under `budgetBytes`.
 *
 * ── What makes this honest ─────────────────────────────────────────────────
 * Every attempt is a real encode of the real frames at real settings, so "try 3
 * of 5" counts work that happened. The search *stops* the moment something fits,
 * which is why the count is reported as "of up to 5" in the UI — the maximum is
 * a device cap, not a prediction.
 *
 * Nothing here reports that a file fits without having produced it. That is the
 * point of running the search at all rather than trusting the estimator: the
 * sampled estimate carries a ±20% band, and a "Fits ✓" drawn from the middle of
 * that band is wrong one time in several on exactly the files that sit near the
 * ceiling.
 *
 * ── When nothing fits ──────────────────────────────────────────────────────
 * The smallest attempt is returned with `fits: false`. It is still a real file
 * and still downloadable — the user may want it for a surface with a looser
 * limit — and the page says plainly that Discord will reject it. Throwing away
 * the work and showing an error would be a worse answer to the same fact.
 */
export async function runAutofit(
  jobId: number,
  file: File,
  spec: JobSpec,
  budgetBytes: number,
  host: PipelineHost,
  signal: AbortSignal,
): Promise<void> {
  const startedAt = performance.now();
  const capabilities = detectCapabilities();
  const tierBudget = TIER_BUDGETS[capabilities.tier];
  let reporter: ProgressReporter | null = null;
  let frames: DecodedFrame[] = [];

  try {
    const probe = await probeInput(file);
    let encoder = resolveEncoder(
      spec.output.kind === "gif" ? spec.output.encoder : undefined,
      capabilities,
    );
    reporter = new ProgressReporter(
      stageWeights(inputKindOf(probe.format), encoder),
      (progress) => host.emit({ type: "progress", jobId, progress }),
    );
    reporter.enter("probe");

    const wrongInput = inputRefusal(probe, spec);
    if (wrongInput) {
      host.emit({ type: "refused", jobId, error: wrongInput });
      return;
    }

    const admission = admit(probe, spec, capabilities, {
      ...tierBudget,
      budgetBytes: Math.floor(tierBudget.budgetBytes * AUTOFIT_BUDGET_SHARE),
    });
    if (!admission.ok) {
      host.emit({ type: "refused", jobId, error: admission.error });
      return;
    }
    const plan = admission.plan;
    host.emit({ type: "accepted", jobId, plan });

    const decodeStartedAt = performance.now();
    const decoded = await decodeAll(file, spec, plan, probe, reporter, host, jobId, signal);
    const decodeMs = performance.now() - decodeStartedAt;
    if (signal.aborted) throw cancelledError();

    frames = applyTimingOps(decoded.frames, spec);
    const { width, height } = decoded;

    /** One attempt, on a copy, in a worker of its own. */
    const encodeAt = async (settings: AutofitSettings): Promise<EncodeOutcome> => {
      const attemptFrames = copyFrames(keepEveryNthFrame(frames, settings.keepEveryNth));
      reporter?.enter("encode");
      return host.encode(
        {
          kind: "gif",
          encoder,
          width,
          height,
          quality: settings.quality,
          colours: settings.colours,
        },
        attemptFrames,
        {
          watchdogMs: watchdogBudgetMs(attemptFrames.length, width, height),
          onFrame: (done, total) => reporter?.report(done, total),
        },
      );
    };

    // The seed, from two sample encodes rather than a formula. Without it the
    // search starts at the top of the ladder and spends an encode per rung
    // discovering what this already knows.
    const reference = await estimateFromSample(
      frames,
      {
        width,
        height,
        frames: frames.length,
        encoder,
        quality: REFERENCE_QUALITY,
        colours: REFERENCE_COLOURS,
      },
      async (sample) => {
        const outcome = await host.encode(
          {
            kind: "gif",
            encoder,
            width,
            height,
            quality: REFERENCE_QUALITY,
            colours: REFERENCE_COLOURS,
          },
          copyFrames(sample),
          { watchdogMs: watchdogBudgetMs(sample.length, width, height), onFrame: () => {} },
        );
        return outcome.blob.size;
      },
    );
    if (signal.aborted) throw cancelledError();

    const max = attemptCap(capabilities.tier);
    const search = planSearch(reference?.bytes ?? 0, budgetBytes, encoder, max);

    let best: { blob: Blob; settings: AutofitSettings; encodeMs: number } | null = null;
    let attempts = 0;
    let fellBack = false;

    for (const [index, settings] of search.entries()) {
      if (signal.aborted) throw cancelledError();
      host.emit({
        type: "attempt",
        jobId,
        attempt: { ...settings, index: index + 1, max },
      });
      attempts += 1;

      let outcome: EncodeOutcome;
      try {
        outcome = await encodeAt(settings);
      } catch (error) {
        const hung = (error as { hang?: boolean }).hang === true;
        if (!hung || signal.aborted) throw error;
        // The frames are still here — only the copy went to the worker that
        // hung — so the retry costs one encode rather than a second decode.
        fellBack = true;
        encoder = fallbackEncoder(encoder);
        reporter.enter("retry");
        outcome = await encodeAt(settings);
      }

      // Strictly smaller, so an equal-sized later attempt does not replace a
      // higher-quality earlier one. The ladder descends in quality, so the first
      // attempt at a given size is always the best-looking one.
      if (!best || outcome.blob.size < best.blob.size) {
        best = { blob: outcome.blob, settings, encodeMs: outcome.encodeMs };
      }
      if (outcome.blob.size <= budgetBytes) break;
    }

    if (signal.aborted) throw cancelledError();
    if (!best) {
      // `planSearch` never returns an empty list, so reaching this means the
      // loop was skipped for a reason the taxonomy should carry rather than a
      // crash with no state.
      throw decodeFailedError({ canOfferFallback: false, detail: "no auto-fit attempt ran" });
    }

    const outputFrames = keepEveryNthFrame(frames, best.settings.keepEveryNth).length;
    reporter.finish();

    const stats: JobStats = {
      outBytes: best.blob.size,
      frames: outputFrames,
      width,
      height,
      encoder,
      decodeMs: Math.round(decodeMs),
      encodeMs: Math.round(best.encodeMs),
      totalMs: Math.round(performance.now() - startedAt),
      decodePath: "native",
      encoderFellBack: fellBack,
      autofit: {
        ...best.settings,
        attempts,
        fits: best.blob.size <= budgetBytes,
      },
    };

    host.emit({ type: "done", jobId, blob: best.blob, stats });
  } catch (error) {
    if (signal.aborted) {
      host.emit({ type: "error", jobId, error: cancelledError() });
      return;
    }
    host.emit({ type: "error", jobId, error: toMediaError(error) });
  } finally {
    // The resident set is the whole reason this job is admitted against a
    // tighter budget. Holding it a moment longer than the search needs would
    // spend that concession on nothing.
    frames.length = 0;
    releaseDownscaleScratch();
  }
}

/**
 * Decodes just enough to price the job, without encoding it.
 *
 * Used by the live readout and, more importantly, to seed the Discord auto-fit
 * search: without it the search is blind and spends five real encodes finding
 * what two sample encodes could have told it.
 */
export async function runEstimate(
  jobId: number,
  file: File,
  spec: JobSpec,
  host: PipelineHost,
  signal: AbortSignal,
): Promise<void> {
  try {
    const probe = await probeInput(file);
    const capabilities = detectCapabilities();
    const admission = admit(probe, spec, capabilities);
    if (!admission.ok) {
      host.emit({ type: "refused", jobId, error: admission.error });
      return;
    }

    const plan = admission.plan;
    const { source, geometry } = await openFrameSource(
      file, probe, spec, plan.width, plan.fps, plan.decodeFrames,
    );

    const frames: DecodedFrame[] = [];
    try {
      for await (const frame of source.frames(signal)) {
        frames.push(frame);
      }
    } finally {
      geometry.release();
    }
    if (signal.aborted) return;

    const encoder = plan.encoder ?? "gifenc";
    const quality = spec.output.kind === "gif" ? spec.output.quality : 80;
    const colours = spec.output.kind === "gif" ? spec.output.colours : 256;

    /**
     * Sample encodes go through the *disposable* encode worker, never inline.
     *
     * Calling gifski here would instantiate its WASM heap inside the long-lived
     * pipeline worker — the heap that never shrinks — and the whole reason the
     * encode worker exists is that termination is the only way to reclaim it.
     * The sample is a handful of frames, so copying them (rather than
     * transferring the originals away) costs a few megabytes and keeps the full
     * decode intact for the second sample.
     */
    const encodeSample = async (sample: readonly DecodedFrame[]): Promise<number> => {
      const copies = sample.map((frame) => ({
        rgba: new Uint8Array(frame.rgba),
        durationMs: frame.durationMs,
      }));
      const outcome = await host.encode(
        { kind: "gif", encoder, width: source.width, height: source.height, quality, colours },
        copies,
        { watchdogMs: watchdogBudgetMs(copies.length, source.width, source.height), onFrame: () => {} },
      );
      return outcome.blob.size;
    };

    const estimate = await estimateFromSample(
      frames,
      {
        width: source.width,
        height: source.height,
        frames: frames.length,
        encoder,
        quality,
        colours,
      },
      encodeSample,
    );

    // Dropped as soon as the samples are taken: an estimate that keeps a full
    // decode resident is competing for the budget the job itself needs.
    frames.length = 0;
    releaseDownscaleScratch();

    if (signal.aborted) return;
    if (!estimate) {
      // No number is a real answer. "≈ 0 KB" would not be.
      host.emit({
        type: "error",
        jobId,
        error: decodeFailedError({ canOfferFallback: false, detail: "no estimate available" }),
      });
      return;
    }
    host.emit({ type: "estimate", jobId, estimate });
  } catch (error) {
    if (signal.aborted) {
      host.emit({ type: "error", jobId, error: cancelledError() });
      return;
    }
    host.emit({ type: "error", jobId, error: toMediaError(error) });
  }
}
