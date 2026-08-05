"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  GifWorkbench,
  type WorkbenchContext,
} from "@/components/tool/gif-workbench";
import {
  stringValue,
  type ControlDef,
  type ControlValues,
} from "@/components/tool/settings/control-schema";
import { admit } from "@/lib/media/plan";
import type { InputProbe, JobSpec, TimingSpec } from "@/lib/media/types";
import type { ToolContent } from "@/lib/tools/content";

/**
 * Reverse GIF — and the one setting on this site that changes what a job costs.
 *
 * ── Why admission control runs on the page, before the worker ──────────────
 * Ping-pong turns n frames into 2n − 2, and `plan.ts` already budgets for that
 * — but only once the job has been submitted, which means the user learns their
 * doubled job does not fit *after* pressing the button. `phase-06` is explicit
 * that the re-plan has to be surfaced before the run.
 *
 * `admit()` is a pure function of the probe, the spec and the device tier: no
 * canvas, no WASM, no worker. Calling it here is not a second implementation of
 * anything — it is the same function the pipeline calls, given the same
 * arguments, so the two cannot disagree. The tier is detected on the page, which
 * is the only place `navigator.maxTouchPoints` exists at all.
 */

const SLUG = "reverse-gif";

/** Reordering does not ask for a quality trade, so it does not take one. */
const REVERSE_QUALITY = 90;

const DEFAULT_VALUES: ControlValues = { direction: "reverse" };

function directionOf(values: ControlValues): TimingSpec["direction"] {
  return stringValue(values, "direction", "reverse") === "ping-pong"
    ? "ping-pong"
    : "reverse";
}

function specFor(values: ControlValues, probe: InputProbe | null): JobSpec {
  return {
    toolSlug: SLUG,
    // The source's own width: this tool does not resize. Admission control may
    // still reduce it to fit the device, and says so when it does.
    geometry: { targetWidth: probe?.width ?? 640 },
    timing: { direction: directionOf(values) },
    output: { kind: "gif", quality: REVERSE_QUALITY, colours: 256 },
  };
}

export function ReverseGifTool({
  content,
  trustLine,
  children,
}: {
  content: ToolContent;
  trustLine: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("tool");

  const controls = useCallback(
    (): readonly ControlDef[] => [
      {
        kind: "select",
        id: "direction",
        label: content.controls.direction.label,
        hint: content.controls.direction.hint,
        options: content.controls.direction.options ?? [],
      },
    ],
    [content.controls],
  );

  const buildSpec = useCallback(
    (values: ControlValues, probe: InputProbe | null) => specFor(values, probe),
    [],
  );

  /**
   * The plan, before the job.
   *
   * Three outcomes, all of them concrete: it fits as asked; it fits but at a
   * width or frame rate below what was requested, which is stated; or it does
   * not fit at all, which is stated *now* rather than after a press. The refusal
   * text itself is the engine's own message catalogue entry, so this page cannot
   * drift from what the pipeline would have said.
   */
  const notice = useCallback(
    ({ values, probe }: WorkbenchContext) => {
      if (!probe || probe.frameCount === null) return null;

      const admission = admit(probe, specFor(values, probe));
      if (!admission.ok) {
        return (
          <p className="mt-1 text-caption text-warning-text">
            {t("directionWontFit", { frames: probe.frameCount * 2 - 2 })}
          </p>
        );
      }

      const { plan } = admission;
      return (
        <div className="mt-1 flex flex-col gap-1">
          <p className="tabular text-caption text-fg-secondary">
            {t("directionPlan", {
              frames: plan.frames,
              sourceFrames: probe.frameCount,
            })}
          </p>
          {plan.downgraded ? (
            <p className="tabular text-caption text-warning-text">
              {t("directionDowngraded", { width: plan.width })}
            </p>
          ) : null}
        </div>
      );
    },
    [t],
  );

  const accept = useMemo(() => ["gif"] as const, []);

  return (
    <GifWorkbench
      slug={SLUG}
      content={content}
      trustLine={trustLine}
      accept={accept}
      defaultValues={DEFAULT_VALUES}
      controls={controls}
      buildSpec={buildSpec}
      downloadSuffix="-reversed"
      notice={notice}
    >
      {children}
    </GifWorkbench>
  );
}
