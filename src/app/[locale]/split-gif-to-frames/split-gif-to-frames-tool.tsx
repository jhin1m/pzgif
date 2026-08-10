"use client";

import { useCallback, useMemo } from "react";
import { Files } from "lucide-react";
import {
  GifWorkbench,
  type ResultMediaContext,
  type WorkbenchContext,
  type WorkbenchOutput,
} from "@/components/tool/gif-workbench";
import {
  clampFrameRange,
  frameRangeCount,
  FrameRangePicker,
} from "@/components/tool/frame-range-picker";
import {
  numberValue,
  type ControlDef,
  type ControlValues,
} from "@/components/tool/settings/control-schema";
import { useCapabilities } from "@/hooks/use-capabilities";
import { formatBytes } from "@/lib/format-bytes";
import { TIER_BUDGETS, affordableFrames } from "@/lib/media/limits";
import type { InputProbe, JobSpec } from "@/lib/media/types";
import { fillNote, type ToolContent } from "@/lib/tools/content";

/**
 * Split GIF to frames — a ZIP of PNGs, one per frame.
 *
 * ── Memory discipline is the whole tool ────────────────────────────────────
 * A minute of GIF at thirty frames a second is eighteen hundred PNGs, and the
 * naive implementation — build every PNG, hold them all, then zip the array —
 * kills a phone tab without warning. `encode/png-zip.ts` streams instead: each
 * frame is drawn, converted by the browser's own PNG encoder, and pushed into
 * the output as a `Blob` part, which lets the browser back the archive with disk
 * rather than with the JS heap. The archive is stored, not deflated, because a
 * PNG is already compressed and re-deflating it spends processor time to add
 * bytes.
 *
 * ── The cap is the device's, not a constant ────────────────────────────────
 * `phase-07` left the frame cap open and suggested five hundred as a guess. The
 * real answer is already measured and already enforced: admission control
 * budgets against `2 x frames x w x h x 4` and refuses above the tier's
 * `hardMaxFrames`. So this page does not invent a second ceiling — it *states*
 * the one that exists, before the file is chosen, and the range picker is how
 * someone lands under it deliberately rather than by being refused.
 */

const SLUG = "split-gif-to-frames";

const DEFAULT_VALUES: ControlValues = {
  rangeFrom: 1,
  rangeTo: 1,
};

/** A ZIP, always. The registry lists `png` too, which is what is *inside* it. */
const ZIP_OUTPUT: WorkbenchOutput = { format: "zip", extension: ".zip" };
const zipOutput = () => ZIP_OUTPUT;

export function SplitGifToFramesTool({
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
      const total = probe?.frameCount ?? null;
      return [
        {
          kind: "custom",
          id: "range",
          label: content.controls.range.label,
          hint: content.controls.range.hint,
          render: ({ values, setValue, disabled }) => (
            <FrameRangePicker
              label={content.controls.range.label}
              totalFrames={total}
              disabled={disabled || total === null}
              value={{
                from: numberValue(values, "rangeFrom", 1),
                to: numberValue(values, "rangeTo", total ?? 1),
              }}
              onChange={(next) => {
                setValue("rangeFrom", next.from);
                setValue("rangeTo", next.to);
              }}
            />
          ),
        },
      ];
    },
    [content.controls],
  );

  const buildSpec = useCallback(
    (values: ControlValues, probe: InputProbe | null): JobSpec => {
      const total = probe?.frameCount ?? 1;
      const range = clampFrameRange(
        {
          from: numberValue(values, "rangeFrom", 1),
          to: numberValue(values, "rangeTo", total),
        },
        total,
      );

      return {
        toolSlug: SLUG,
        // As close to full size as the device allows. Someone extracting frames
        // wants the pixels that are there, so nothing is scaled down on purpose
        // — but admission control still caps every job at the tier's working
        // width, because a wide GIF held one uncompressed frame at a time is
        // exactly what that cap exists for. The caption states the ceiling and
        // the result panel reports the size the frames actually came out at.
        geometry: {
          targetWidth: Math.max(
            1,
            probe?.width || budget.defaultMaxWidth,
          ),
        },
        // The picker is 1-based and inclusive at both ends, because that is how
        // the frames in the archive are numbered. `range` is 0-based and
        // half-open. Converting in one place keeps the off-by-one from being
        // spread across the file.
        timing: { range: { from: range.from - 1, to: range.to } },
        output: { kind: "png-zip" },
      };
    },
    [budget.defaultMaxWidth],
  );

  const valuesForProbe = useCallback(
    (probe: InputProbe, current: ControlValues): ControlValues => ({
      ...current,
      rangeFrom: 1,
      rangeTo: Math.max(1, probe.frameCount ?? 1),
    }),
    [],
  );

  const notice = useCallback(
    ({ probe, values }: WorkbenchContext) => {
      const total = probe?.frameCount ?? null;
      const selected = frameRangeCount({
        from: numberValue(values, "rangeFrom", 1),
        to: numberValue(values, "rangeTo", total ?? 1),
      });

      // The ceiling is what `admit()` will actually allow, which is the byte
      // budget or `hardMaxFrames`, whichever bites first — and at these frame
      // sizes it is nearly always the bytes. Quoting `hardMaxFrames` alone would
      // promise 900 on a desktop and then refuse at 506, which is worse than
      // saying nothing.
      const width = Math.min(probe?.width ?? budget.defaultMaxWidth, budget.defaultMaxWidth);
      const height =
        probe && probe.width > 0
          ? Math.max(1, Math.round((width * probe.height) / probe.width))
          : Math.round(width * 0.5625);
      const cap = affordableFrames(budget, width, height);
      const overCap = total !== null && selected > cap;

      return (
        <p
          className="tabular mt-1 text-caption text-fg-secondary"
          data-cap-note
        >
          {fillNote(
            (overCap ? content.notes?.overCap : content.notes?.cap) ?? "",
            { cap, selected, width },
          )}
        </p>
      );
    },
    [budget, content.notes],
  );

  /**
   * A ZIP has nothing to show, so the frame states what is in it.
   *
   * The alternative — a contact sheet of thumbnails — would need every frame
   * back on the main thread as an image, which is the residency the whole engine
   * is built to avoid, to decorate a box the user is about to leave.
   */
  const resultMedia = useCallback(
    ({ blob, stats }: ResultMediaContext) => (
      <div
        className="flex size-full flex-col items-center justify-center gap-2 px-6 text-center"
        data-zip-summary
      >
        <Files aria-hidden="true" className="size-8 text-fg-muted" />
        <p className="tabular font-sans text-h4 font-semibold text-fg">
          {fillNote(content.notes?.archive ?? "", { count: stats.frames })}
        </p>
        <p className="tabular text-caption text-fg-secondary">
          {fillNote(content.notes?.archiveMeta ?? "", {
            width: stats.width,
            height: stats.height,
            size: formatBytes(blob?.size ?? stats.outBytes),
          })}
        </p>
      </div>
    ),
    [content.notes],
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
      downloadSuffix="-frames"
      output={zipOutput}
      resultMedia={resultMedia}
      notice={notice}
      // `errors.ts` can offer "extract fewer frames"; this page owns the control
      // that honours it, so the offer is not a button that leads nowhere.
      changeableSettings={["frames"]}
      applySetting={(setting, value, setValue) => {
        if (setting !== "frames") return;
        setValue("rangeFrom", 1);
        setValue("rangeTo", Math.max(1, value));
      }}
    >
      {children}
    </GifWorkbench>
  );
}
