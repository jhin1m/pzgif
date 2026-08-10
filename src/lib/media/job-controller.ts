/**
 * The page's handle on the engine.
 *
 * It owns three things and deliberately not a fourth:
 *
 *  1. **The pipeline worker**, created once and reused. It holds no WASM heap,
 *     so restarting it would buy nothing and cost a module instantiation.
 *  2. **The encode worker's lifetime.** One per attempt, terminated after it,
 *     because gifski's `WebAssembly.Memory` never shrinks and termination is the
 *     only way to give that memory back.
 *  3. **The hang watchdog.** It has to live outside the thread it is watching —
 *     `encode()` blocks its worker entirely, so nothing inside can time itself
 *     out. G1's soak bounded the hang rate at ~0.12% rather than showing it
 *     absent, which is one job in eight hundred: not a rate to ship without a
 *     recovery path.
 *
 * The fourth thing — frame data — never reaches here. The two workers are wired
 * with a `MessageChannel` and transfer buffers directly; relaying them through
 * the page would structured-clone hundreds of megabytes onto the main thread and
 * destroy the INP the worker split exists to protect.
 */

import { detectTier } from "./limits";
import type { JobEvent, JobRequest, JobSpec, JobStats } from "./types";
import type { PipelineInbound, PipelineOutbound } from "./worker/protocol";

export type JobEventHandler = (event: JobEvent) => void;

/**
 * Per-job telemetry. Deliberately about *paths*, not people.
 *
 * The fallback rate is currently a guess of 1-3%; the ffmpeg path is worth its
 * bundle only if the number is real. The refusal rate per device tier matters
 * more still — gate G8 measured 80% on iOS from a modelled corpus, and the
 * modelled part is what real traffic replaces.
 */
export interface JobTelemetry {
  toolSlug: string;
  outcome: "done" | "refused" | "error" | "cancelled";
  tier: string;
  errorCode?: string;
  stats?: JobStats;
}

export interface JobHandle {
  jobId: number;
  cancel(): void;
}

export class JobController {
  private worker: Worker | null = null;
  private nextJobId = 1;
  private readonly handlers = new Map<number, JobEventHandler>();
  private readonly encoders = new Map<
    number,
    { worker: Worker; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(private readonly onTelemetry: (event: JobTelemetry) => void = () => {}) {}

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    // Module worker resolved through `import.meta.url` — proven in a production
    // Turbopack build by gate G5, including under the real CSP.
    this.worker = new Worker(new URL("./worker/job.worker.ts", import.meta.url), {
      type: "module",
      name: "pzgif-pipeline",
    });
    this.worker.addEventListener("message", (event: MessageEvent<PipelineOutbound>) =>
      this.receive(event.data),
    );
    // Must be the first message. `navigator.maxTouchPoints` is Window-only and
    // it is how iOS is identified, so a worker left to detect its own tier would
    // hand every iPhone a desktop memory budget.
    this.tier = detectTier();
    this.worker.postMessage({ type: "configure", tier: this.tier });
    return this.worker;
  }

  private send(message: PipelineInbound, transfer: Transferable[] = []): void {
    this.ensureWorker().postMessage(message, transfer);
  }

  private receive(message: PipelineOutbound): void {
    switch (message.type) {
      case "need-encoder":
        this.spawnEncoder(message.jobId, message.watchdogMs);
        return;

      case "release-encoder":
        this.disposeEncoder(message.jobId);
        return;

      default: {
        const handler = this.handlers.get(message.jobId);
        handler?.(message);
        if (message.type === "done" || message.type === "error" || message.type === "refused") {
          this.finish(message);
        } else if (message.type === "probed" || message.type === "estimate") {
          // Also terminal. Without this the handler and its captured closure —
          // a React callback, for a readout that fires on every slider move —
          // would accumulate for the life of the page.
          this.handlers.delete(message.jobId);
          this.slugs.delete(message.jobId);
        }
      }
    }
  }

  private finish(message: Extract<JobEvent, { type: "done" | "error" | "refused" }>): void {
    this.disposeEncoder(message.jobId);
    this.handlers.delete(message.jobId);

    this.onTelemetry({
      toolSlug: this.slugs.get(message.jobId) ?? "unknown",
      outcome:
        message.type === "done"
          ? "done"
          : message.type === "refused"
            ? "refused"
            : message.error.code === "cancelled"
              ? "cancelled"
              : "error",
      tier: this.tier,
      errorCode: message.type === "done" ? undefined : message.error.code,
      stats: message.type === "done" ? message.stats : undefined,
    });
    this.slugs.delete(message.jobId);
  }

  private readonly slugs = new Map<number, string>();
  private tier = "unknown";

  private spawnEncoder(jobId: number, watchdogMs: number): void {
    this.disposeEncoder(jobId);

    const worker = new Worker(new URL("./worker/encode.worker.ts", import.meta.url), {
      type: "module",
      name: `pzgif-encode-${jobId}`,
    });
    const channel = new MessageChannel();
    worker.postMessage({ type: "port", port: channel.port2 }, [channel.port2]);
    this.send({ type: "encoder-port", jobId, port: channel.port1 }, [channel.port1]);

    const timer = setTimeout(() => {
      // The encoder has gone silent past ten times its expected runtime. Killing
      // the thread is the only abort gifski has, and it converts a frozen tab
      // into a job that finishes on the other encoder.
      this.disposeEncoder(jobId);
      this.send({ type: "encoder-failed", jobId, reason: "hang" });
    }, watchdogMs);

    worker.addEventListener("error", (event) => {
      this.disposeEncoder(jobId);
      this.send({
        type: "encoder-failed",
        jobId,
        reason: "error",
        message: event.message,
      });
    });

    this.encoders.set(jobId, { worker, timer });
  }

  private disposeEncoder(jobId: number): void {
    const existing = this.encoders.get(jobId);
    if (!existing) return;
    clearTimeout(existing.timer);
    existing.worker.terminate();
    this.encoders.delete(jobId);
  }

  private start(request: (jobId: number) => JobRequest, spec: JobSpec, onEvent: JobEventHandler): JobHandle {
    const jobId = this.nextJobId;
    this.nextJobId += 1;
    this.handlers.set(jobId, onEvent);
    this.slugs.set(jobId, spec.toolSlug);
    this.send(request(jobId));
    return { jobId, cancel: () => this.cancel(jobId) };
  }

  run(file: File, spec: JobSpec, onEvent: JobEventHandler): JobHandle {
    return this.start((jobId) => ({ type: "run", jobId, spec, file }), spec, onEvent);
  }

  estimate(file: File, spec: JobSpec, onEvent: JobEventHandler): JobHandle {
    return this.start((jobId) => ({ type: "estimate", jobId, spec, file }), spec, onEvent);
  }

  /**
   * Runs the Discord auto-fit search: repeated real encodes until one lands
   * under `budgetBytes`.
   *
   * Shares `run`'s lifecycle exactly — one handler, one telemetry record, one
   * cancel — because from the page's point of view it is one job that happens to
   * encode more than once. The repeated spawn-and-terminate of encode workers is
   * already what `spawnEncoder` does per `need-encoder`, so nothing here changes:
   * gifski's WASM heap is reclaimed between attempts rather than accumulating
   * toward the ceiling across them.
   */
  autofit(
    file: File,
    spec: JobSpec,
    budgetBytes: number,
    onEvent: JobEventHandler,
  ): JobHandle {
    return this.start(
      (jobId) => ({ type: "autofit", jobId, spec, file, budgetBytes }),
      spec,
      onEvent,
    );
  }

  /**
   * Identifies a file without decoding it.
   *
   * The tool page needs this the moment a file is dropped — to say "this is
   * really an MP4" before any setting is offered, and to refuse an iOS video
   * upload at the picker rather than after a plan has been drawn.
   */
  probe(file: File, onEvent: JobEventHandler): JobHandle {
    const jobId = this.nextJobId;
    this.nextJobId += 1;
    this.handlers.set(jobId, onEvent);
    this.send({ type: "probe", jobId, file });
    return { jobId, cancel: () => this.cancel(jobId) };
  }

  cancel(jobId: number): void {
    // Both halves: the decode loop stops between frames, and a blocked encoder
    // is stopped by termination. Either way the 500 ms budget is met without
    // waiting for the current work to finish.
    this.send({ type: "cancel", jobId });

    const hadEncoder = this.encoders.has(jobId);
    this.disposeEncoder(jobId);
    if (hadEncoder) {
      // Terminating the worker destroys the port the pipeline is waiting on
      // without closing it, so the pending encode would never settle and the job
      // would sit at "encoding" forever. The pipeline has to be told.
      this.send({ type: "encoder-failed", jobId, reason: "error", message: "cancelled" });
    }
  }

  /** The tier this controller detected, for the UI to explain its own limits. */
  deviceTier(): string {
    this.ensureWorker();
    return this.tier;
  }

  /** Tears everything down. Called when the last consumer unmounts. */
  dispose(): void {
    for (const jobId of [...this.encoders.keys()]) this.disposeEncoder(jobId);
    this.worker?.terminate();
    this.worker = null;
    this.handlers.clear();
  }
}
