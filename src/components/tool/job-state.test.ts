import { describe, expect, it } from "vitest";
import { settingsLocked, toolFlowState } from "./job-state";
import type { JobStatus } from "@/hooks/use-media-job";

/**
 * The state machine every tool page runs on. Nine tools and five preset routes
 * inherit whatever is wrong here, which is why it is a pure function tested
 * directly rather than something derived inside a component.
 */

describe("toolFlowState", () => {
  it("is idle whenever there is no file, whatever the engine last said", () => {
    // "Start over" clears the file without clearing the engine's last status,
    // and the page must return to the dropzone rather than showing a stale
    // result for a file that is no longer loaded.
    const statuses: JobStatus[] = [
      "idle",
      "planning",
      "running",
      "done",
      "refused",
      "error",
    ];
    for (const status of statuses) {
      expect(toolFlowState(false, status)).toBe("idle");
    }
  });

  it("treats planning and running as one processing state", () => {
    // Admission control runs before the first frame is read. Splitting it into
    // its own visible state would flash a second layout for a step that
    // normally lasts milliseconds.
    expect(toolFlowState(true, "planning")).toBe("processing");
    expect(toolFlowState(true, "running")).toBe("processing");
  });

  it("collapses a refusal and a mid-job failure into one error view", () => {
    // They differ in when they happened, not in what the page shows: the
    // message plus the recovery actions the engine attached.
    expect(toolFlowState(true, "refused")).toBe("error");
    expect(toolFlowState(true, "error")).toBe("error");
  });

  it("maps a loaded file with no job to the settings state", () => {
    expect(toolFlowState(true, "idle")).toBe("loaded");
  });

  it("maps a finished job to the result state", () => {
    expect(toolFlowState(true, "done")).toBe("result");
  });
});

describe("settingsLocked", () => {
  it("locks the panel only while the engine owns the job", () => {
    expect(settingsLocked("processing")).toBe(true);
    for (const state of ["idle", "loaded", "result", "error"] as const) {
      // A locked panel after a failure would trap the user at the exact moment
      // the recovery action tells them to change a setting.
      expect(settingsLocked(state), state).toBe(false);
    }
  });
});
