"use client";

/**
 * The React binding for the engine.
 *
 * ── Why progress does not live in React state ──────────────────────────────
 * A job emits progress at 10 Hz. Putting that in `useState` re-renders every
 * component under the hook — the settings panel, the file chip, the ad slot's
 * container — ten times a second, for a number only the progress bar reads. That
 * is a measurable INP regression on the exact interaction the whole worker
 * architecture exists to keep smooth.
 *
 * So progress goes into a tiny external store and components subscribe to it
 * with `useSyncExternalStore`. Only what renders the number re-renders. The rest
 * of the job — accepted plan, result, error — is ordinary state, because those
 * change a handful of times per job and every part of the UI cares.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { JobController, type JobTelemetry } from "@/lib/media/job-controller";
import type {
  AcceptedPlan,
  AutofitAttempt,
  InputProbe,
  JobEvent,
  JobSpec,
  JobStats,
  MediaError,
  ProgressEvent,
  SizeEstimate,
} from "@/lib/media/types";

export type JobStatus = "idle" | "planning" | "running" | "done" | "refused" | "error";

export interface JobState {
  status: JobStatus;
  plan: AcceptedPlan | null;
  /** Object URL for the produced file. Revoked when the job is reset. */
  resultUrl: string | null;
  resultBlob: Blob | null;
  stats: JobStats | null;
  error: MediaError | null;
  estimate: SizeEstimate | null;
  previewUrl: string | null;
  /**
   * The auto-fit attempt currently encoding, or null.
   *
   * Ordinary React state rather than the progress store: it changes once per
   * attempt, not ten times a second, and the badge that renders it sits beside
   * the panel title rather than inside the bar.
   */
  attempt: AutofitAttempt | null;
}

const IDLE: JobState = {
  status: "idle",
  plan: null,
  resultUrl: null,
  resultBlob: null,
  stats: null,
  error: null,
  estimate: null,
  previewUrl: null,
  attempt: null,
};

const NO_PROGRESS: ProgressEvent = {
  stage: "probe",
  determinate: false,
  value: 0,
  done: 0,
  total: null,
};

/** The external store progress flows through. One per hook instance. */
export interface ProgressStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ProgressEvent;
  set(event: ProgressEvent): void;
}

function createProgressStore(): ProgressStore {
  let snapshot = NO_PROGRESS;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    set(event) {
      snapshot = event;
      for (const listener of listeners) listener();
    },
  };
}

/** Subscribes only the component that renders progress. */
export function useJobProgress(store: ProgressStore): ProgressEvent {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => NO_PROGRESS);
}

export interface UseMediaJobOptions {
  onTelemetry?: (event: JobTelemetry) => void;
}

export function useMediaJob({ onTelemetry }: UseMediaJobOptions = {}) {
  const [state, setState] = useState<JobState>(IDLE);
  const progress = useMemo(() => createProgressStore(), []);
  const controllerRef = useRef<JobController | null>(null);
  const handleRef = useRef<{ cancel(): void } | null>(null);
  // Tracked separately from the job: an estimate and a job can be in flight at
  // once, and cancelling one must not cancel the other.
  const estimateRef = useRef<{ cancel(): void } | null>(null);
  // Object URLs outlive React state updates, so they are tracked separately and
  // revoked deterministically. Leaking them keeps whole result files alive.
  const urlsRef = useRef<string[]>([]);
  const telemetryRef = useRef(onTelemetry);
  // Assigned in an effect rather than during render: the controller is created
  // lazily and reads this ref long after the render that supplied the callback.
  useEffect(() => {
    telemetryRef.current = onTelemetry;
  }, [onTelemetry]);

  const controller = useCallback((): JobController => {
    if (!controllerRef.current) {
      controllerRef.current = new JobController((event) => telemetryRef.current?.(event));
    }
    return controllerRef.current;
  }, []);

  const trackUrl = useCallback((blob: Blob): string => {
    const url = URL.createObjectURL(blob);
    urlsRef.current.push(url);
    return url;
  }, []);

  const revokeAll = useCallback(() => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current = [];
  }, []);

  useEffect(
    () => () => {
      revokeAll();
      controllerRef.current?.dispose();
      controllerRef.current = null;
    },
    [revokeAll],
  );

  const reset = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
    estimateRef.current?.cancel();
    estimateRef.current = null;
    revokeAll();
    progress.set(NO_PROGRESS);
    setState(IDLE);
  }, [progress, revokeAll]);

  /**
   * The event handler shared by `run` and `autofit`.
   *
   * One function rather than two because from the page's side the two jobs have
   * the same life: they plan, they report progress, they end in a blob or an
   * error. Auto-fit adds one event — which attempt is encoding — and duplicating
   * two hundred lines of state machine to carry it is how the cancelled-job
   * handling in one copy stops matching the other.
   */
  const jobEvents = useCallback(
    (event: JobEvent) => {
        switch (event.type) {
          case "accepted":
            setState((previous) => ({ ...previous, status: "running", plan: event.plan }));
            return;
          case "progress":
            progress.set(event.progress);
            return;
          case "attempt":
            setState((previous) => ({ ...previous, attempt: event.attempt }));
            return;
          case "preview": {
            // Painted once into a canvas-backed blob so the bitmap can be closed;
            // an open `ImageBitmap` holds a platform buffer the GC is slow about.
            const canvas = document.createElement("canvas");
            canvas.width = event.bitmap.width;
            canvas.height = event.bitmap.height;
            canvas.getContext("2d")?.drawImage(event.bitmap, 0, 0);
            event.bitmap.close();
            canvas.toBlob((blob) => {
              if (!blob) return;
              const url = trackUrl(blob);
              setState((previous) => ({ ...previous, previewUrl: url }));
            });
            return;
          }
          case "estimate":
            setState((previous) => ({ ...previous, estimate: event.estimate }));
            return;
          case "refused":
            setState((previous) => ({ ...previous, status: "refused", error: event.error }));
            return;
          case "error":
            if (event.error.code === "cancelled") {
              // The worker acknowledging a cancel is not a failure. Showing it as
              // one would put every cancelled job into the error state, which is
              // the opposite of "leaves a clean pre-job state".
              setState((previous) => ({ ...IDLE, previewUrl: previous.previewUrl }));
              return;
            }
            setState((previous) => ({ ...previous, status: "error", error: event.error }));
            return;
          case "done":
            setState((previous) => ({
              ...previous,
              status: "done",
              // The badge describes work in flight. Leaving it set would label a
              // finished result with the attempt that produced it, which reads
              // as though the search were still running.
              attempt: null,
              resultBlob: event.blob,
              resultUrl: trackUrl(event.blob),
              stats: event.stats,
            }));
            return;
          default:
            return;
        }
    },
    [progress, trackUrl],
  );

  const run = useCallback(
    (file: File, spec: JobSpec) => {
      reset();
      setState({ ...IDLE, status: "planning" });
      handleRef.current = controller().run(file, spec, jobEvents);
    },
    [controller, jobEvents, reset],
  );

  /**
   * The Discord auto-fit search. Same lifecycle as `run`, several real encodes.
   *
   * `budgetBytes` is the preset's own ceiling and is never a shared constant —
   * see `lib/presets/discord.ts` for why there cannot be one.
   */
  const autofit = useCallback(
    (file: File, spec: JobSpec, budgetBytes: number) => {
      reset();
      setState({ ...IDLE, status: "planning" });
      handleRef.current = controller().autofit(file, spec, budgetBytes, jobEvents);
    },
    [controller, jobEvents, reset],
  );

  const estimate = useCallback(
    (file: File, spec: JobSpec) => {
      // Each estimate is a full decode. Dragging a slider without cancelling the
      // last one would start N overlapping decodes in one worker, each admitted
      // against the same budget — admission control is per job, residency is per
      // worker.
      estimateRef.current?.cancel();
      const handle = controller().estimate(file, spec, (event) => {
        if (event.type === "estimate") {
          // The error is cleared alongside the new figure, and that is not
          // tidiness. A refusal here is a statement about the *settings* — "this
          // will not fit" — and settings move. Without this, dragging a width
          // slider past the budget and back left the refusal on screen for the
          // rest of the session, describing a job the page is no longer offering
          // to run.
          setState((previous) => ({
            ...previous,
            estimate: event.estimate,
            error: null,
          }));
        }
        if (event.type === "refused" || event.type === "error") {
          if (event.error.code === "cancelled") return;
          // The stale estimate goes with it: showing last-known bytes beside a
          // refusal is two halves of the panel disagreeing about what happens
          // if the button is pressed.
          setState((previous) => ({ ...previous, estimate: null, error: event.error }));
        }
      });
      estimateRef.current = handle;
    },
    [controller],
  );

  /**
   * Identifies a file without decoding it.
   *
   * Runs the moment a file is accepted, because two things the page must show
   * before offering a single setting depend on it: the real dimensions and frame
   * count for the file chip, and whether this device can take this input at all.
   * Refusing an iOS visitor's video at the picker is honest; letting them choose
   * settings and then refusing is a broken tool with extra steps.
   *
   * A probe failure is deliberately swallowed into `null` rather than pushed
   * into the error state. It is metadata for a caption — the job itself will
   * fail with a proper taxonomy entry if the file is genuinely unreadable, and
   * surfacing the same problem twice, once without a recovery action, is worse
   * than surfacing it once with one.
   */
  const probe = useCallback(
    (file: File, onProbe: (result: InputProbe | null) => void) => {
      return controller().probe(file, (event) => {
        switch (event.type) {
          case "probed":
            onProbe(event.probe);
            return;
          case "error":
          case "refused":
            onProbe(null);
            return;
          default:
            return;
        }
      });
    },
    [controller],
  );

  const cancel = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
    progress.set(NO_PROGRESS);
    // Back to the pre-job state, not to a half-finished one: a cancelled job
    // that leaves a stale progress bar or a partial result reads as a crash.
    setState((previous) => ({ ...IDLE, previewUrl: previous.previewUrl }));
  }, [progress]);

  return { state, progress, run, autofit, estimate, probe, cancel, reset };
}
