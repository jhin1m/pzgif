"use client";

/**
 * The Phase 4 engine harness.
 *
 * Same reasoning as the benchmark console beside it: the engine is driven from
 * a real browser through `window.__engine`, inside the real app, under the real
 * CSP. What it exposes is the *product* path — `JobController`, both workers,
 * admission control, the error taxonomy — not a test double, because a harness
 * that reimplements the pipeline can pass while the pipeline fails.
 *
 * Files arrive through a real `<input type=file>` rather than an in-page fetch,
 * for the same reason: the `File` plumbing is part of what is being tested.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { JobController } from "@/lib/media/job-controller";
import { detectCapabilities } from "@/lib/media/capability";
import { readGifMetadata } from "@/lib/media/decode/gif";
import { probeVideo } from "@/lib/media/decode/video";
import { probeWebp, webpFrameSource } from "@/lib/media/decode/webp";
import { FrameGeometry } from "@/lib/media/ops/geometry";
import type {
  AcceptedPlan,
  InputProbe,
  JobSpec,
  JobStats,
  MediaError,
  ProgressEvent,
  SizeEstimate,
} from "@/lib/media/types";

/** The job spec a harness caller may send. Partial; defaults fill the rest. */
export type EnginePartialSpec = Partial<JobSpec>;

export interface EngineRunOutcome {
  status: "done" | "refused" | "error";
  plan: AcceptedPlan | null;
  stats: JobStats | null;
  error: MediaError | null;
  progress: ProgressEvent[];
  /** Read back from the produced file, so the assertion is about real output. */
  output:
    | { kind: "gif"; bytes: number; width: number; height: number; frameCount: number; durationsMs: number[] }
    | { kind: "video"; bytes: number; width: number; height: number; durationSec: number | null; codec: string | null }
    | { kind: "zip"; bytes: number; entries: number }
    | null;
  elapsedMs: number;
}

export interface EngineApi {
  file(): { name: string; size: number } | null;
  capabilities(): ReturnType<typeof detectCapabilities>;
  probe(): Promise<InputProbe>;
  run(spec: Partial<JobSpec>): Promise<EngineRunOutcome>;
  estimate(spec: Partial<JobSpec>): Promise<SizeEstimate | MediaError>;
  /** Starts a job and cancels it after `afterMs`. Resolves with the delay. */
  runAndCancel(spec: Partial<JobSpec>, afterMs: number): Promise<{ cancelMs: number; status: string }>;
  /**
   * Reads composited RGBA out of the animated-WebP decoder, at source scale.
   *
   * Deliberately *not* a round trip through a produced GIF. The obvious way to
   * check compositing is to encode one and read it back, but `e2e/lib/pixel-
   * probe.ts` goes through `createImageBitmap`, which returns frame one of an
   * animation and nothing else — and offset and disposal defects are invisible
   * on frame one by construction. This returns the decoder's own output, frame
   * by frame, so the assertion lands on the code under test instead of on an
   * encoder and a probe that cannot see the frames that matter.
   *
   * Samples named points rather than whole frames: the interesting pixels are a
   * handful of coordinates either side of a rectangle edge, and serialising
   * megabytes of RGBA across the CDP boundary to read six of them is waste.
   */
  sampleWebpFrames(points: readonly (readonly [number, number])[]): Promise<WebpFrameSample>;
}

export interface WebpFrameSample {
  width: number;
  height: number;
  frames: {
    durationMs: number;
    /** One `[r, g, b, a]` per requested point, in the order requested. */
    pixels: [number, number, number, number][];
  }[];
}

declare global {
  interface Window {
    __engine?: EngineApi;
  }
}

const DEFAULT_SPEC: JobSpec = {
  toolSlug: "gif-compressor",
  geometry: { targetWidth: 480 },
  timing: {},
  output: { kind: "gif", quality: 80, colours: 256 },
};

function mergeSpec(partial: Partial<JobSpec>): JobSpec {
  return {
    ...DEFAULT_SPEC,
    ...partial,
    geometry: { ...DEFAULT_SPEC.geometry, ...partial.geometry },
    timing: { ...DEFAULT_SPEC.timing, ...partial.timing },
    output: partial.output ?? DEFAULT_SPEC.output,
  };
}

/** Reads the produced file back, so a pass means the output is really valid. */
async function inspectOutput(blob: Blob, spec: JobSpec): Promise<EngineRunOutcome["output"]> {
  if (spec.output.kind === "gif") {
    const metadata = readGifMetadata(await blob.arrayBuffer());
    return {
      kind: "gif",
      bytes: blob.size,
      width: metadata.width,
      height: metadata.height,
      frameCount: metadata.frameCount,
      durationsMs: metadata.rawDelaysMs,
    };
  }
  if (spec.output.kind === "video") {
    const probe = await probeVideo(blob, null);
    return {
      kind: "video",
      bytes: blob.size,
      width: probe.width,
      height: probe.height,
      durationSec: probe.durationSec,
      codec: probe.codec,
    };
  }

  // ZIP: count entries from the end-of-central-directory record.
  const tail = new DataView(await blob.slice(blob.size - 22).arrayBuffer());
  return {
    kind: "zip",
    bytes: blob.size,
    entries: tail.getUint32(0, true) === 0x06054b50 ? tail.getUint16(10, true) : -1,
  };
}

export function EngineConsole() {
  const [file, setFile] = useState<File | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const fileRef = useRef<File | null>(null);
  const controllerRef = useRef<JobController | null>(null);

  const say = useCallback((line: string) => {
    setLines((previous) => [...previous.slice(-100), line]);
  }, []);

  const controller = useCallback((): JobController => {
    controllerRef.current ??= new JobController();
    return controllerRef.current;
  }, []);

  useEffect(() => {
    const api: EngineApi = {
      file: () =>
        fileRef.current ? { name: fileRef.current.name, size: fileRef.current.size } : null,

      capabilities: () => detectCapabilities(),

      probe: () =>
        new Promise((resolve, reject) => {
          const current = fileRef.current;
          if (!current) return reject(new Error("No file selected"));
          controller().probe(current, (event) => {
            if (event.type === "probed") resolve(event.probe);
            if (event.type === "error") reject(new Error(event.error.code));
          });
        }),

      run: (partial) =>
        new Promise((resolve) => {
          const current = fileRef.current;
          if (!current) throw new Error("No file selected");
          const spec = mergeSpec(partial);
          const progress: ProgressEvent[] = [];
          const startedAt = performance.now();
          let plan: AcceptedPlan | null = null;

          controller().run(current, spec, (event) => {
            switch (event.type) {
              case "accepted":
                plan = event.plan;
                return;
              case "progress":
                progress.push(event.progress);
                return;
              case "refused":
              case "error":
                say(`${event.type}: ${event.error.code}`);
                resolve({
                  status: event.type,
                  plan,
                  stats: null,
                  error: event.error,
                  progress,
                  output: null,
                  elapsedMs: performance.now() - startedAt,
                });
                return;
              case "done":
                void inspectOutput(event.blob, spec).then((output) => {
                  say(`done: ${event.stats.outBytes} bytes`);
                  resolve({
                    status: "done",
                    plan,
                    stats: event.stats,
                    error: null,
                    progress,
                    output,
                    elapsedMs: performance.now() - startedAt,
                  });
                });
                return;
              default:
                return;
            }
          });
        }),

      estimate: (partial) =>
        new Promise((resolve) => {
          const current = fileRef.current;
          if (!current) throw new Error("No file selected");
          controller().estimate(current, mergeSpec(partial), (event) => {
            if (event.type === "estimate") resolve(event.estimate);
            if (event.type === "refused" || event.type === "error") resolve(event.error);
          });
        }),

      sampleWebpFrames: async (points) => {
        const current = fileRef.current;
        if (!current) throw new Error("No file selected");
        const probe = await probeWebp(current, "webp");
        // Source scale, so a requested coordinate means the same pixel the
        // fixture was authored around. Any resize here would resample the very
        // rectangle edges the assertions are about.
        const geometry = new FrameGeometry(probe.width, probe.height, {
          targetWidth: probe.width,
        });
        const source = await webpFrameSource(current, geometry);

        const frames: WebpFrameSample["frames"] = [];
        for await (const frame of source.frames()) {
          frames.push({
            durationMs: frame.durationMs,
            pixels: points.map(([x, y]) => {
              const at = (y * geometry.outputWidth + x) * 4;
              return [
                frame.rgba[at],
                frame.rgba[at + 1],
                frame.rgba[at + 2],
                frame.rgba[at + 3],
              ];
            }),
          });
        }
        return { width: geometry.outputWidth, height: geometry.outputHeight, frames };
      },

      runAndCancel: (partial, afterMs) =>
        new Promise((resolve) => {
          const current = fileRef.current;
          if (!current) throw new Error("No file selected");
          let cancelledAt = 0;
          let settled = false;

          const handle = controller().run(current, mergeSpec(partial), (event) => {
            if (event.type === "error" || event.type === "done" || event.type === "refused") {
              if (settled) return;
              settled = true;
              resolve({
                cancelMs: performance.now() - cancelledAt,
                status: event.type === "done" ? "done" : (event as { error: MediaError }).error.code,
              });
            }
          });

          setTimeout(() => {
            cancelledAt = performance.now();
            handle.cancel();
            // A cancel that produces no event at all is also a failure, so the
            // wait is bounded rather than open-ended.
            setTimeout(() => {
              if (settled) return;
              settled = true;
              resolve({ cancelMs: performance.now() - cancelledAt, status: "no-event" });
            }, 3_000);
          }, afterMs);
        }),
    };

    window.__engine = api;
    return () => {
      delete window.__engine;
    };
  }, [controller, say]);

  useEffect(
    () => () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    },
    [],
  );

  return (
    <section style={{ fontFamily: "monospace", padding: 16, borderTop: "1px solid #888" }}>
      <h2>Engine harness</h2>
      <input
        data-testid="engine-file"
        type="file"
        onChange={(event) => {
          const selected = event.target.files?.[0] ?? null;
          fileRef.current = selected;
          setFile(selected);
        }}
      />
      <p>{file ? `${file.name} (${file.size} bytes)` : "no file"}</p>
      <pre style={{ maxHeight: 200, overflow: "auto" }}>{lines.join("\n")}</pre>
    </section>
  );
}
