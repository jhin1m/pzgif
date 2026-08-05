"use client";

import { useCallback, useMemo } from "react";
import { CropFields } from "@/components/tool/crop-fields";
import { CropOverlay } from "@/components/tool/crop-overlay";
import {
  aspectValue,
  clampCropRect,
  fullFrameRect,
  type CropBounds,
} from "@/components/tool/crop-rect";
import {
  GifWorkbench,
  type WorkbenchContext,
} from "@/components/tool/gif-workbench";
import {
  booleanValue,
  numberValue,
  stringValue,
  type ControlDef,
  type ControlValue,
  type ControlValues,
} from "@/components/tool/settings/control-schema";
import { useFirstFrame } from "@/hooks/use-first-frame";
import type { CropRect, InputProbe, JobSpec } from "@/lib/media/types";
import type { ToolContent } from "@/lib/tools/content";

/**
 * Crop GIF — the one tool in this phase with a genuinely new control.
 *
 * ── Where the rectangle lives ──────────────────────────────────────────────
 * In the workbench's control values, as four plain numbers, because three
 * different inputs write to it: the overlay's drag, the overlay's arrow keys and
 * the number fields in the settings panel. Anything else — state inside the
 * overlay, a context, a ref — makes one of those three the owner and the other
 * two observers, which is where drag-and-type controls normally start
 * disagreeing about rounding.
 *
 * All three routes go through `crop-rect.ts`, so the clamping, the minimum size
 * and the even-pixel rounding are the same arithmetic whichever one you use.
 */

const SLUG = "crop-gif";
const FALLBACK_BOUNDS: CropBounds = { width: 480, height: 270 };

/** Cropping does not ask for a quality trade, so it does not take one. */
const CROP_QUALITY = 90;

const DEFAULT_VALUES: ControlValues = {
  aspect: "free",
  cropX: 0,
  cropY: 0,
  cropWidth: FALLBACK_BOUNDS.width,
  cropHeight: FALLBACK_BOUNDS.height,
  play: false,
};

function boundsOf(probe: InputProbe | null): CropBounds {
  if (!probe || probe.width === 0 || probe.height === 0) return FALLBACK_BOUNDS;
  return { width: probe.width, height: probe.height };
}

function rectOf(values: ControlValues, bounds: CropBounds): CropRect {
  return clampCropRect(
    {
      x: numberValue(values, "cropX", 0),
      y: numberValue(values, "cropY", 0),
      width: numberValue(values, "cropWidth", bounds.width),
      height: numberValue(values, "cropHeight", bounds.height),
    },
    bounds,
  );
}

function writeRect(
  setValue: (id: string, value: ControlValue) => void,
  rect: CropRect,
): void {
  setValue("cropX", rect.x);
  setValue("cropY", rect.y);
  setValue("cropWidth", rect.width);
  setValue("cropHeight", rect.height);
}

export function CropGifTool({
  content,
  trustLine,
  children,
}: {
  content: ToolContent;
  trustLine: React.ReactNode;
  children: React.ReactNode;
}) {
  const controls = useCallback(
    ({ values, setValue, probe }: WorkbenchContext): readonly ControlDef[] => {
      const bounds = boundsOf(probe);
      const aspect = aspectValue(stringValue(values, "aspect", "free"));

      return [
        {
          kind: "custom",
          id: "crop",
          label: content.controls.rect.label,
          hint: content.controls.rect.hint,
          render: ({ disabled }) => (
            <CropFields
              rect={rectOf(values, bounds)}
              bounds={bounds}
              aspect={aspect}
              disabled={disabled}
              label={content.controls.rect.label}
              presets={content.controls.aspect.options ?? []}
              onChange={(next) => writeRect(setValue, next)}
              onAspectChange={(preset, next) => {
                setValue("aspect", preset);
                writeRect(setValue, next);
              }}
            />
          ),
        },
        {
          kind: "toggle",
          id: "play",
          label: content.controls.play.label,
          hint: content.controls.play.hint,
        },
      ];
    },
    [content.controls],
  );

  const buildSpec = useCallback(
    (values: ControlValues, probe: InputProbe | null): JobSpec => {
      const rect = rectOf(values, boundsOf(probe));
      return {
        toolSlug: SLUG,
        // The crop runs before the resize inside `FrameGeometry`, and asking for
        // the crop's own width as the target means no resize happens at all —
        // the region is written out at the resolution it was cut from.
        geometry: { crop: rect, targetWidth: rect.width },
        timing: {},
        output: { kind: "gif", quality: CROP_QUALITY, colours: 256 },
      };
    },
    [],
  );

  const valuesForProbe = useCallback(
    (probe: InputProbe, current: ControlValues): ControlValues => {
      const bounds = boundsOf(probe);
      // Starts as the whole frame: "no crop" is the state you begin in, and the
      // rectangle is then dragged inwards rather than conjured from a corner.
      const rect = fullFrameRect(
        bounds,
        aspectValue(stringValue(current, "aspect", "free")),
      );
      return {
        ...current,
        cropX: rect.x,
        cropY: rect.y,
        cropWidth: rect.width,
        cropHeight: rect.height,
      };
    },
    [],
  );

  const preview = useCallback(
    ({ values, setValue, probe, file, locked, sourceUrl }: WorkbenchContext & {
      sourceUrl: string;
    }) => (
      <CropPreview
        file={file}
        sourceUrl={sourceUrl}
        alt={content.labels?.sourceAlt ?? ""}
        bounds={boundsOf(probe)}
        rect={rectOf(values, boundsOf(probe))}
        aspect={aspectValue(stringValue(values, "aspect", "free"))}
        playing={booleanValue(values, "play")}
        disabled={locked}
        onChange={(next) => writeRect(setValue, next)}
      />
    ),
    [content.labels],
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
      downloadSuffix="-cropped"
      preview={preview}
    >
      {children}
    </GifWorkbench>
  );
}

/**
 * Separated so the first-frame decode can live in a hook.
 *
 * `preview` is called during the workbench's render, and a hook cannot be called
 * from there — so the callback returns an element and the element does the work.
 */
function CropPreview({
  file,
  sourceUrl,
  alt,
  bounds,
  rect,
  aspect,
  playing,
  disabled,
  onChange,
}: {
  file: File | null;
  sourceUrl: string;
  alt: string;
  bounds: CropBounds;
  rect: CropRect;
  aspect: number | null;
  playing: boolean;
  disabled: boolean;
  onChange(rect: CropRect): void;
}) {
  const stillUrl = useFirstFrame(file);

  return (
    <CropOverlay
      stillSrc={stillUrl}
      animatedSrc={sourceUrl}
      playing={playing}
      alt={alt}
      sourceWidth={bounds.width}
      sourceHeight={bounds.height}
      rect={rect}
      aspect={aspect}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
