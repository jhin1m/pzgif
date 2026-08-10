"use client";

import { useCallback, useMemo } from "react";
import {
  GifWorkbench,
  type WorkbenchContext,
} from "@/components/tool/gif-workbench";
import {
  numberValue,
  type ControlDef,
  type ControlValues,
} from "@/components/tool/settings/control-schema";
import { useCapabilities } from "@/hooks/use-capabilities";
import { TIER_BUDGETS } from "@/lib/media/limits";
import type { InputProbe, JobSpec } from "@/lib/media/types";
import { fillNote, type ToolContent } from "@/lib/tools/content";

/**
 * WebP to GIF — the tool `phase-07` marked "no clean answer", now with one.
 *
 * The open question was decode: `ImageDecoder` is the only browser API that
 * reads animated WebP directly and Safari has never had it, so the page was
 * either going to be broken for a fifth of visitors or cut. `decode/webp-riff.ts`
 * resolves it by splitting the container and handing each frame to
 * `createImageBitmap()`, which every engine has. There is no unsupported state
 * on this page because there is no longer an engine that cannot read the format.
 *
 * What is left is the smallest of the four: WebP in, GIF out, two settings. The
 * conversion is a genuine downgrade — a palette of at most two hundred and
 * fifty-six colours replacing a full-colour image — and the copy says so rather
 * than pretending otherwise, because someone converting *away* from a better
 * format is doing it for a destination that demands it.
 */

const SLUG = "webp-to-gif";

const MIN_WIDTH = 32;
const FALLBACK_WIDTH = 480;

/** The wireframe's convert default. gifski's scale, not a percentage. */
const DEFAULT_QUALITY = 85;

const DEFAULT_VALUES: ControlValues = {
  width: FALLBACK_WIDTH,
  quality: DEFAULT_QUALITY,
};

export function WebpToGifTool({
  content,
  trustLine,
  children,
}: {
  content: ToolContent;
  trustLine: React.ReactNode;
  children: React.ReactNode;
}) {
  const capabilities = useCapabilities();
  const budget = TIER_BUDGETS[capabilities?.tier ?? "desktop"];

  const controls = useCallback(
    ({ probe }: WorkbenchContext): readonly ControlDef[] => {
      const sourceWidth = probe?.width ?? FALLBACK_WIDTH;
      return [
        {
          kind: "slider",
          id: "width",
          label: content.controls.width.label,
          hint: content.controls.width.hint,
          min: MIN_WIDTH,
          max: Math.max(
            MIN_WIDTH + 2,
            Math.min(sourceWidth, budget.defaultMaxWidth),
          ),
          unit: " px",
          showNumberInput: true,
        },
        {
          kind: "slider",
          id: "quality",
          label: content.controls.quality.label,
          hint: content.controls.quality.hint,
          min: 40,
          max: 100,
          step: 5,
          showNumberInput: true,
        },
      ];
    },
    [budget.defaultMaxWidth, content.controls],
  );

  const buildSpec = useCallback(
    (values: ControlValues, probe: InputProbe | null): JobSpec => ({
      toolSlug: SLUG,
      geometry: {
        targetWidth: Math.min(
          numberValue(values, "width", FALLBACK_WIDTH),
          probe?.width ?? FALLBACK_WIDTH,
        ),
      },
      // A WebP carries its own per-frame durations and they are read straight
      // out of the ANMF headers, so nothing here retimes it.
      timing: {},
      output: {
        kind: "gif",
        quality: numberValue(values, "quality", DEFAULT_QUALITY),
        colours: 256,
      },
    }),
    [],
  );

  const valuesForProbe = useCallback(
    (probe: InputProbe, current: ControlValues): ControlValues => ({
      ...current,
      width: Math.max(
        MIN_WIDTH,
        Math.min(probe.width, budget.defaultMaxWidth),
      ),
    }),
    [budget.defaultMaxWidth],
  );

  const notice = useCallback(
    ({ probe }: WorkbenchContext) => {
      if (!probe || probe.frameCount === null) return null;
      return (
        <p className="tabular mt-1 text-caption text-fg-secondary" data-source-note>
          {fillNote(content.notes?.source ?? "", {
            frames: probe.frameCount,
            seconds: (probe.durationSec ?? 0).toFixed(1),
          })}
        </p>
      );
    },
    [content.notes],
  );

  const accept = useMemo(() => ["webp"] as const, []);

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
      downloadSuffix=""
      notice={notice}
      changeableSettings={["width"]}
      applySetting={(setting, value, setValue) => {
        if (setting === "width") setValue("width", value);
      }}
    >
      {children}
    </GifWorkbench>
  );
}
