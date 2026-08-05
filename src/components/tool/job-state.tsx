"use client";

import type { JobStatus } from "@/hooks/use-media-job";
import { cn } from "@/lib/utils";

/**
 * The six flow states from `docs/wireframe/states.html`, and the container that
 * holds them without moving.
 *
 * ── Five states here, six in the wireframe ──────────────────────────────────
 * `drag-over` is the sixth, and it is deliberately absent from this union: it is
 * a property of the dropzone under a pointer, not of the job, and `Dropzone`
 * already owns it. Modelling it here would mean two components disagreeing about
 * whether a drag is in progress.
 *
 * ── Why `refused` and `error` collapse into one view state ─────────────────
 * They differ in *when* they happened — a refusal is pre-decode admission
 * control, an error is mid-job — but the page shows the same thing for both: the
 * message, and the concrete recovery actions the engine attached. The
 * distinction is preserved in `MediaError.code`, which is what the copy keys
 * off, so nothing is lost by rendering them through one branch.
 */

export type ToolFlowState =
  | "idle"
  | "loaded"
  | "processing"
  | "result"
  | "error";

export function toolFlowState(
  hasFile: boolean,
  status: JobStatus,
): ToolFlowState {
  // File first: a refusal that happened before a file was chosen cannot exist,
  // and clearing the file is how "Start over" returns the page to idle.
  if (!hasFile) return "idle";
  switch (status) {
    case "planning":
    case "running":
      return "processing";
    case "done":
      return "result";
    case "refused":
    case "error":
      return "error";
    default:
      return "loaded";
  }
}

/** True while the engine owns the settings — §5 locks them during a job. */
export function settingsLocked(state: ToolFlowState): boolean {
  return state === "processing";
}

/**
 * The size-reserved stage.
 *
 * Every flow state renders inside this one box, and the box's minimum height is
 * declared once rather than per state. That is the whole mechanism behind "zero
 * layout shift across every state transition": idle → loaded → processing all
 * paint into a container that was already the right size, so nothing below them
 * — including the reserved ad slot — moves.
 *
 * The result state is the one that legitimately grows, because a decoded frame
 * has a real aspect ratio and no honest reservation can predict it. That growth
 * follows a click, so it carries `hadRecentInput` and is excluded from CLS;
 * `e2e/gif-compressor.spec.ts` asserts zero *un-prompted* shift rather than zero
 * pixels moved, which is the measurable form of the same requirement.
 */
export function ToolStage({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      // A stable anchor for tests. The file name and the size delta each render
      // twice — once here, once in the sticky action bar — and the bar is
      // `display: none` rather than absent on desktop, so an unscoped query
      // matches both. Every tool page inherits this, so Phases 6-8 do not each
      // reinvent a brittle structural selector.
      data-tool-stage=""
      className={cn(
        "flex flex-col gap-4",
        // Matches `Dropzone`'s own minimums so the idle state fills the box it
        // is given instead of the box being sized around the dropzone.
        "min-h-44 md:min-h-60 lg:min-h-70",
        className,
      )}
    >
      {children}
    </div>
  );
}
