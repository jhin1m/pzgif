"use client";

/**
 * The benchmark console.
 *
 * The visible UI is deliberately plain — this is a measuring instrument, not a
 * product surface, and `phase-01` says not to invest in making it one. The part
 * that matters is `window.__bench`, which is how Playwright drives every gate
 * from a real browser without a human clicking through a thousand encodes.
 *
 * Files arrive through a real `<input type=file>` via `page.setInputFiles`, not
 * through an in-page `fetch`. A fixture fetched into an ArrayBuffer would skip
 * the `File` plumbing the product actually uses, and any difference between the
 * two would show up as a benchmark that passes while the tool fails.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BenchJobSpec,
  BenchResponse,
  BenchResult,
  ContainerInspection,
  SoakRow,
  SoakSummary,
} from "@/lib/bench/types";
import { median } from "@/lib/bench/measure";

/** Below this, a watchdog at 10x the median would fire on ordinary jitter. */
const MIN_WATCHDOG_MS = 5_000;
const WATCHDOG_MULTIPLE = 10;

interface PairOutcome {
  width: number;
  height: number;
  frames: number;
  gifski: { bytes: number; ms: number; quality: number; url: string };
  gifenc: {
    bytes: number;
    ms: number;
    colours: number;
    attempts: number;
    url: string;
  };
}

interface BenchApi {
  file(): { name: string; size: number; type: string } | null;
  boot(): Promise<{ ok: boolean; ms: number; error: string | null }>;
  inspect(): Promise<ContainerInspection>;
  descriptors(spec: Partial<BenchJobSpec>): Promise<unknown>;
  verifyCompositing(): Promise<unknown>;
  job(spec: Partial<BenchJobSpec>): Promise<BenchResult>;
  pair(spec: Partial<BenchJobSpec>): Promise<PairOutcome>;
  soak(options: {
    runs: number;
    mode: "worker-per-job" | "long-lived-worker";
    spec?: Partial<BenchJobSpec>;
    warmup?: number;
  }): Promise<SoakSummary>;
  respawn(): void;
}

declare global {
  interface Window {
    __bench?: BenchApi;
  }
}

const DEFAULT_SPEC: BenchJobSpec = {
  fixture: "",
  encoder: "gifski",
  width: 480,
  fps: 15,
  quality: 80,
  colours: 256,
};

export function BenchConsole() {
  const [file, setFile] = useState<File | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [rows, setRows] = useState<BenchResult[]>([]);
  const [pair, setPair] = useState<PairOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const nextIdRef = useRef(1);
  const fileRef = useRef<File | null>(null);
  const longestTaskRef = useRef<number>(0);

  const say = useCallback((line: string) => {
    setLog((previous) => [...previous.slice(-200), line]);
  }, []);

  const spawn = useCallback((): Worker => {
    const worker = new Worker(
      new URL("../../workers/bench.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    return worker;
  }, []);

  const worker = useCallback((): Worker => workerRef.current ?? spawn(), [spawn]);

  const kill = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  /**
   * One request/response round trip.
   *
   * `timeoutMs` cannot interrupt the worker — gifski's encode is a blocking
   * synchronous WASM call with no cancellation — so on expiry the worker is
   * terminated outright. That is the only way to reclaim the thread, and it is
   * exactly what the product will have to do when a job hangs in the wild.
   */
  const request = useCallback(
    <T,>(
      message: Record<string, unknown>,
      accept: (response: BenchResponse) => T | undefined,
      timeoutMs?: number,
    ): Promise<T> => {
      const id = nextIdRef.current++;
      const target = worker();

      return new Promise<T>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
          target.removeEventListener("message", onMessage);
          target.removeEventListener("error", onError);
          if (timer !== null) clearTimeout(timer);
        };

        const onMessage = (event: MessageEvent<BenchResponse>) => {
          const response = event.data;
          if (response.id !== id) return;
          if (response.type === "progress") return;
          if (response.type === "error") {
            cleanup();
            reject(new Error(response.error));
            return;
          }
          const value = accept(response);
          if (value === undefined) return;
          cleanup();
          resolve(value);
        };

        /**
         * A worker killed by the allocator emits `error` and then simply stops
         * answering. Without this the request waits forever, and the harness
         * reports a hang where the truth is an out-of-memory kill — the exact
         * distinction the memory probe exists to draw.
         *
         * The same handling is what the product needs in Phase 4: an OOM has to
         * surface as a stated failure with a smaller-settings suggestion, never
         * as a spinner that never stops.
         */
        const onError = (event: ErrorEvent) => {
          cleanup();
          kill();
          reject(new Error(`WORKER_DIED: ${event.message || "no message"}`));
        };

        target.addEventListener("message", onMessage);
        target.addEventListener("error", onError);

        if (timeoutMs !== undefined) {
          timer = setTimeout(() => {
            cleanup();
            kill();
            reject(new Error("WATCHDOG"));
          }, timeoutMs);
        }

        target.postMessage({ ...message, id });
      });
    },
    [kill, worker],
  );

  // Longest main-thread task during a job. If the worker split were broken this
  // is where it would show — a blocking encode on the main thread cannot hide
  // from longtask entries.
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) return;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longestTaskRef.current = Math.max(longestTaskRef.current, entry.duration);
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const api: BenchApi = {
      file: () => {
        const current = fileRef.current;
        return current
          ? { name: current.name, size: current.size, type: current.type }
          : null;
      },

      boot: () =>
        request<{ ok: boolean; ms: number; error: string | null }>(
          { type: "probe-boot" },
          (response) =>
            response.type === "boot"
              ? { ok: response.ok, ms: response.ms, error: response.error }
              : undefined,
        ),

      inspect: () => {
        const current = fileRef.current;
        if (!current) return Promise.reject(new Error("No file selected"));
        return request<ContainerInspection>(
          { type: "inspect", file: current },
          (response) =>
            response.type === "inspect" ? response.inspection : undefined,
        );
      },

      descriptors: (partial) => {
        const current = fileRef.current;
        if (!current) return Promise.reject(new Error("No file selected"));
        const spec: BenchJobSpec = {
          ...DEFAULT_SPEC,
          fixture: current.name,
          ...partial,
        };
        return request<unknown>(
          { type: "descriptors", spec, file: current },
          (response) =>
            response.type === "descriptors" ? response.descriptors : undefined,
        );
      },

      verifyCompositing: () => {
        const current = fileRef.current;
        if (!current) return Promise.reject(new Error("No file selected"));
        return request<unknown>(
          { type: "verify-compositing", file: current },
          (response) =>
            response.type === "compositing" ? response.comparison : undefined,
        );
      },

      job: async (partial) => {
        const current = fileRef.current;
        if (!current) throw new Error("No file selected");
        longestTaskRef.current = 0;
        const spec: BenchJobSpec = {
          ...DEFAULT_SPEC,
          fixture: current.name,
          ...partial,
        };
        const result = await request<BenchResult>(
          { type: "job", spec, file: current },
          (response) => (response.type === "result" ? response.result : undefined),
        );
        const withMainThread: BenchResult = {
          ...result,
          longestMainThreadTaskMs: longestTaskRef.current || null,
        };
        setRows((previous) => [...previous, withMainThread]);
        return withMainThread;
      },

      pair: async (partial) => {
        const current = fileRef.current;
        if (!current) throw new Error("No file selected");
        const spec: BenchJobSpec = {
          ...DEFAULT_SPEC,
          fixture: current.name,
          ...partial,
        };
        const outcome = await request<PairOutcome>(
          { type: "encode-pair", spec, file: current },
          (response) => {
            if (response.type !== "pair") return undefined;
            return {
              width: response.width,
              height: response.height,
              frames: response.frames,
              gifski: {
                bytes: response.gifski.gif.byteLength,
                ms: response.gifski.ms,
                quality: response.gifski.quality,
                url: URL.createObjectURL(
                  new Blob([response.gifski.gif], { type: "image/gif" }),
                ),
              },
              gifenc: {
                bytes: response.gifenc.gif.byteLength,
                ms: response.gifenc.ms,
                colours: response.gifenc.colours,
                attempts: response.gifenc.attempts,
                url: URL.createObjectURL(
                  new Blob([response.gifenc.gif], { type: "image/gif" }),
                ),
              },
            } satisfies PairOutcome;
          },
        );
        setPair(outcome);
        return outcome;
      },

      soak: async ({ runs, mode, spec: partial, warmup = 5 }) => {
        const current = fileRef.current;
        if (!current) throw new Error("No file selected");
        const spec: BenchJobSpec = {
          ...DEFAULT_SPEC,
          fixture: current.name,
          ...partial,
        };

        // Calibrate the watchdog from real runs before arming it. A fixed
        // threshold would either miss a hang on a slow fixture or call a slow
        // machine a deadlock, and both answers would be wrong about issue #5.
        const warmupMs: number[] = [];
        for (let index = 0; index < warmup; index += 1) {
          const started = performance.now();
          await request<BenchResult>(
            { type: "job", spec, file: current },
            (response) =>
              response.type === "result" ? response.result : undefined,
          );
          warmupMs.push(performance.now() - started);
          if (mode === "worker-per-job") kill();
        }

        const watchdogMs = Math.max(
          MIN_WATCHDOG_MS,
          median(warmupMs) * WATCHDOG_MULTIPLE,
        );

        const soakRows: SoakRow[] = [];
        let hangs = 0;
        let errors = 0;

        for (let run = 1; run <= runs; run += 1) {
          const started = performance.now();
          try {
            const result = await request<BenchResult>(
              { type: "job", spec, file: current },
              (response) =>
                response.type === "result" ? response.result : undefined,
              watchdogMs,
            );
            const ms = performance.now() - started;
            if (!result.ok) errors += 1;
            soakRows.push({
              run,
              fixture: spec.fixture,
              mode,
              ms,
              ok: result.ok,
              hang: false,
              error: result.error,
            });
          } catch (error) {
            const ms = performance.now() - started;
            const hang = error instanceof Error && error.message === "WATCHDOG";
            if (hang) hangs += 1;
            else errors += 1;
            soakRows.push({
              run,
              fixture: spec.fixture,
              mode,
              ms,
              ok: false,
              hang,
              error: hang ? "WATCHDOG" : String(error),
            });
          }
          if (mode === "worker-per-job") kill();
        }

        return {
          runs,
          hangs,
          errors,
          medianMs: median(soakRows.map((row) => row.ms)),
          watchdogMs,
          rows: soakRows,
        } satisfies SoakSummary;
      },

      respawn: kill,
    };

    window.__bench = api;
    return () => {
      delete window.__bench;
    };
  }, [kill, request]);

  useEffect(() => () => kill(), [kill]);

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    fileRef.current = picked;
    setFile(picked);
    if (picked) say(`file: ${picked.name} (${picked.size} bytes)`);
  };

  const guarded = async (label: string, work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const value = await work();
      say(`${label}: ${JSON.stringify(value)}`);
    } catch (error) {
      say(`${label} FAILED: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 24, fontFamily: "ui-monospace, monospace" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>PZGIF benchmark harness</h1>
      <p style={{ marginTop: 8, maxWidth: "70ch", lineHeight: 1.5 }}>
        Dev-only. This route must never be served cross-origin isolated — COOP
        and COEP break ad serving, and a boot-path result measured behind them
        would describe an app this project cannot ship.
      </p>

      <p style={{ marginTop: 16 }}>
        <input type="file" onChange={onPick} data-testid="bench-file" />
      </p>

      <p style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => guarded("boot", () => window.__bench!.boot())}
        >
          G5 boot probe
        </button>
        <button
          type="button"
          disabled={busy || !file}
          onClick={() => guarded("inspect", () => window.__bench!.inspect())}
        >
          Inspect container
        </button>
        <button
          type="button"
          disabled={busy || !file}
          onClick={() => guarded("job", () => window.__bench!.job({}))}
        >
          Run one job
        </button>
        <button
          type="button"
          disabled={busy || !file}
          onClick={() => guarded("pair", () => window.__bench!.pair({}))}
        >
          G6 encoder pair
        </button>
      </p>

      {pair && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>
            Matched-size comparison — {pair.width}x{pair.height}, {pair.frames}{" "}
            frames
          </h2>
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            {(["gifski", "gifenc"] as const).map((which) => (
              <figure key={which} style={{ margin: 0 }}>
                {/* Deliberately a plain <img>: next/image would resample and
                    re-encode, which is the one thing that must not happen to a
                    file being judged on its encoding. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pair[which].url}
                  alt={`${which} output`}
                  style={{ maxWidth: 480, imageRendering: "pixelated" }}
                />
                <figcaption>
                  {which} — {pair[which].bytes} B, {Math.round(pair[which].ms)}{" "}
                  ms
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <table style={{ marginTop: 24, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                "fixture",
                "encoder",
                "out",
                "frames",
                "bytes",
                "decode ms",
                "encode ms",
                "total ms",
                "ok",
              ].map((heading) => (
                <th
                  key={heading}
                  style={{ textAlign: "left", padding: "2px 12px 2px 0" }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td style={{ paddingRight: 12 }}>{row.spec.fixture}</td>
                <td style={{ paddingRight: 12 }}>{row.spec.encoder}</td>
                <td style={{ paddingRight: 12 }}>
                  {row.outWidth}x{row.outHeight}
                </td>
                <td style={{ paddingRight: 12 }}>{row.frames}</td>
                <td style={{ paddingRight: 12 }}>{row.outBytes}</td>
                <td style={{ paddingRight: 12 }}>
                  {Math.round(row.timings.decodeMs)}
                </td>
                <td style={{ paddingRight: 12 }}>
                  {Math.round(row.timings.encodeMs)}
                </td>
                <td style={{ paddingRight: 12 }}>
                  {Math.round(row.timings.totalMs)}
                </td>
                <td>{row.ok ? "yes" : (row.error ?? "no")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <pre
        style={{
          marginTop: 24,
          padding: 12,
          background: "#1112",
          maxHeight: 320,
          overflow: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {log.join("\n")}
      </pre>
    </main>
  );
}
