"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { GifWorkbench, type WorkbenchContext } from "@/components/tool/gif-workbench";
import {
  numberValue,
  stringValue,
  type ControlDef,
  type ControlValues,
} from "@/components/tool/settings/control-schema";
import type { InputProbe, JobSpec } from "@/lib/media/types";
import type { ToolContent } from "@/lib/tools/content";

/**
 * Resize GIF — the tool that proves a new page is configuration.
 *
 * `phase-06` step 1 makes this the test of whether Phase 5's framework holds:
 * nothing under `components/tool/` other than the shared workbench, and nothing
 * in the engine, was touched to add it. What is here is a control schema, a
 * `JobSpec` builder, and a live readout of the size those two produce.
 *
 * ── One dimension, not two ─────────────────────────────────────────────────
 * `FrameGeometry` derives the output height from the width and the source's
 * aspect ratio, and there is no stretch path in the engine. Rather than ship an
 * aspect-ratio *lock* whose unlocked state cannot do anything — the same class of
 * dead control as the Lossy slider the compressor cut — the ratio is stated as a
 * fact and the computed height is shown live. Changing a GIF's shape is the crop
 * tool's job, and the copy sends people there.
 */

const SLUG = "resize-gif";

/** Below this a GIF stops being an animation and starts being a favicon. */
const MIN_WIDTH = 16;
const FALLBACK_WIDTH = 640;

/**
 * Resize re-encodes every frame, so it is the one GIF→GIF tool where quality is
 * not the user's decision to make: they asked for different dimensions, not for
 * a smaller file. 90 keeps the second generation of quantisation as close to
 * invisible as gifski gets; the compressor is where the trade is offered.
 */
const RESIZE_QUALITY = 90;

const DEFAULT_VALUES: ControlValues = {
  mode: "pixels",
  width: FALLBACK_WIDTH,
  scale: "50",
};

/** The width the current settings ask for, in source pixels. */
function targetWidthOf(values: ControlValues, probe: InputProbe | null): number {
  const sourceWidth = probe?.width ?? FALLBACK_WIDTH;
  if (stringValue(values, "mode", "pixels") === "percent") {
    const percent = Number(stringValue(values, "scale", "50"));
    return Math.max(MIN_WIDTH, Math.round((sourceWidth * percent) / 100));
  }
  return Math.max(
    MIN_WIDTH,
    Math.min(numberValue(values, "width", sourceWidth), sourceWidth),
  );
}

/** Height follows the source ratio, exactly as `FrameGeometry` will compute it. */
function outputHeightOf(width: number, probe: InputProbe | null): number {
  if (!probe || probe.width === 0) return 0;
  return Math.max(1, Math.round((width * probe.height) / probe.width));
}

export function ResizeGifTool({
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
    ({ values, probe }: WorkbenchContext): readonly ControlDef[] => {
      const byPercent = stringValue(values, "mode", "pixels") === "percent";
      const sourceWidth = probe?.width ?? FALLBACK_WIDTH;

      return [
        {
          kind: "select",
          id: "mode",
          label: content.controls.mode.label,
          hint: content.controls.mode.hint,
          options: content.controls.mode.options ?? [],
        },
        byPercent
          ? {
              kind: "select",
              id: "scale",
              label: content.controls.scale.label,
              hint: content.controls.scale.hint,
              options: content.controls.scale.options ?? [],
            }
          : {
              kind: "slider",
              id: "width",
              label: content.controls.width.label,
              hint: content.controls.width.hint,
              min: MIN_WIDTH,
              // The source's own width is the ceiling: the engine will not
              // upscale, so a slider that went past it would be a control whose
              // top half does nothing.
              max: Math.max(MIN_WIDTH + 2, sourceWidth),
              unit: " px",
              showNumberInput: true,
            },
      ];
    },
    [content.controls],
  );

  const buildSpec = useCallback(
    (values: ControlValues, probe: InputProbe | null): JobSpec => ({
      toolSlug: SLUG,
      geometry: { targetWidth: targetWidthOf(values, probe) },
      timing: {},
      output: { kind: "gif", quality: RESIZE_QUALITY, colours: 256 },
    }),
    [],
  );

  const valuesForProbe = useCallback(
    (probe: InputProbe, current: ControlValues): ControlValues => ({
      ...current,
      // "No change" has to be the state you start in.
      width: Math.max(MIN_WIDTH, probe.width),
    }),
    [],
  );

  /**
   * The output size, computed from the same function the job uses.
   *
   * Shown before the run because the number is the whole decision on this page,
   * and because a percentage without its pixel equivalent is not an answer to
   * "will this fit the box I was given".
   */
  const notice = useCallback(
    ({ values, probe }: WorkbenchContext) => {
      if (!probe) return null;
      const width = targetWidthOf(values, probe);
      const height = outputHeightOf(width, probe);
      const percent = Math.round((width / probe.width) * 100);

      return (
        <p className="tabular mt-1 text-caption text-fg-secondary">
          {t("outputSize", { width, height, percent })}
        </p>
      );
    },
    [t],
  );

  const applySetting = useCallback(
    (
      setting: string,
      value: number,
      setValue: (id: string, next: string | number | boolean) => void,
    ) => {
      if (setting !== "width") return;
      // A refusal's "set width to 320" offer has to land on a control the user
      // can see move, so the mode switches back to pixels with it.
      setValue("mode", "pixels");
      setValue("width", value);
    },
    [],
  );

  const accept = useMemo(() => ["gif"] as const, []);

  return (
    <GifWorkbench
      slug={SLUG}
      content={content}
      trustLine={trustLine}
      accept={accept}
      defaultValues={DEFAULT_VALUES}
      valuesForProbe={valuesForProbe}
      controls={controls}
      buildSpec={buildSpec}
      downloadSuffix="-resized"
      notice={notice}
      changeableSettings={["width"]}
      applySetting={applySetting}
    >
      {children}
    </GifWorkbench>
  );
}
