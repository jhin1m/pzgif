"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  GifWorkbench,
  type WorkbenchContext,
} from "@/components/tool/gif-workbench";
import {
  numberValue,
  type ControlDef,
  type ControlValues,
} from "@/components/tool/settings/control-schema";
import { ToolUnavailable } from "@/components/tool/tool-unavailable";
import { TrimRange, type TrimValue } from "@/components/tool/trim-range";
import { useCapabilities } from "@/hooks/use-capabilities";
import { formatBytes } from "@/lib/format-bytes";
import { TIER_BUDGETS, affordableFrames, type TierBudget } from "@/lib/media/limits";
import type { InputProbe, JobSpec } from "@/lib/media/types";
import { fillNote, type ToolContent } from "@/lib/tools/content";

/**
 * MP4 to GIF — the highest-traffic tool of the four, and the one that exercises
 * the most engine surface: video demux, WebCodecs decode, a trim, and a live
 * price for the result.
 *
 * ── The estimate is the page ───────────────────────────────────────────────
 * "Will this be huge?" is why people abandon a video-to-GIF flow, and it is the
 * question every competitor answers only after the encode. This page answers it
 * before, from two real sample encodes rather than a formula — and answers it as
 * a *range*, because the calibration sweep measured a 22x spread in
 * bytes-per-pixel at identical settings driven purely by content. A point value
 * would be confidently wrong on exactly the flat-art clips people convert most.
 *
 * ── The limits caption is computed, never written ──────────────────────────
 * The wireframe says "up to 150 MB · up to 60 seconds". Both numbers are wrong
 * everywhere: the binding constraint is decoded RGBA held resident, so it is a
 * function of the *output* size and frame count, and it lands at a few seconds
 * on a phone and a couple of minutes on a desktop. `plannedSeconds()` below
 * derives it from `affordableFrames()`, the same function admission control
 * uses, so the caption and the refusal can never disagree.
 *
 * ── iOS is refused before a file is chosen ─────────────────────────────────
 * Gate G8 measured an 80% refusal rate for video input against the iOS budget —
 * every video shape fails, not merely large ones. `plan.md` ratified shipping
 * this page on iOS in a stated unavailable state rather than letting someone
 * pick a clip and watch it fail. That is what `unavailable` renders.
 */

const SLUG = "mp4-to-gif";

/** Below this a converted clip stops being watchable. */
const MIN_WIDTH = 160;

/**
 * Defaults, per device class.
 *
 * The desktop pair is the wireframe's. The mobile pair is not a smaller version
 * of it for tidiness — at 480 px and 15 fps the android tier's budget runs out
 * at under four seconds, which is below meme length, so the tool would refuse
 * almost everything it was offered. 320 px at 10 fps moves the refusal threshold
 * into territory where a real clip fits.
 */
const DESKTOP_DEFAULTS = { width: 480, fps: 15 } as const;
const MOBILE_DEFAULTS = { width: 320, fps: 10 } as const;

/** The wireframe's quality default. gifski's scale, not a percentage. */
const DEFAULT_QUALITY = 80;

/**
 * The values the controls mount with, before any device or file is known.
 *
 * A module constant, deliberately, and **not** derived from the device tier.
 * `GifWorkbench` captures this into state on mount and then only re-derives
 * while the controls are still `untouched()` — comparing them against this same
 * object. Making it depend on `useCapabilities()` broke that: the tier is null
 * on the hydration render, so state captured the desktop pair, and a moment
 * later the defaults became the mobile pair while the state did not. The two
 * disagreed, `untouched()` was false forever, and `valuesForProbe` — the only
 * thing that reads the clip's duration — never ran at all.
 *
 * The device profile is applied in `valuesForProbe` instead, which runs after
 * hydration by construction because it waits on a worker round trip.
 */
const DEFAULT_VALUES: ControlValues = {
  width: DESKTOP_DEFAULTS.width,
  fps: DESKTOP_DEFAULTS.fps,
  quality: DEFAULT_QUALITY,
  trimFrom: 0,
  // Zero means "to the end of the clip", resolved by `trimOf()` against the
  // real duration. It is not a trim end of zero seconds, and nothing may treat
  // it as one — see that function for why the distinction is load-bearing.
  trimTo: 0,
};

/**
 * The selected span, resolved against the clip's real duration.
 *
 * `trimTo` starts at zero because the duration is not knowable until the probe
 * answers, and every reader has to agree on what that zero means. It means "the
 * end", and resolving it in one place is what stops a job being built with
 * `{ from: 0, to: 0 }` — which `trimmedSpan()` faithfully turns into a
 * zero-second span and the decoder faithfully turns into no frames at all.
 *
 * That state is reachable whenever `valuesForProbe` does not run: on a slow
 * probe the visitor may have already touched a control, and `GifWorkbench` then
 * declines to overwrite their input. Depending on that hook for correctness
 * rather than for convenience was the defect.
 */
function trimOf(values: ControlValues, durationSec: number): TrimValue {
  const from = Math.max(0, numberValue(values, "trimFrom", 0));
  const stored = numberValue(values, "trimTo", 0);
  const to = stored > 0 ? stored : durationSec;
  return { from, to: Math.max(from, to) };
}

/**
 * How many seconds of output the budget covers at these settings.
 *
 * `affordableFrames()` is the same arithmetic `admit()` runs, read forwards
 * instead of backwards: admission control asks "does this job fit", and the
 * caption asks "how much would fit". One shared function is what stops the page
 * promising a length the engine then refuses.
 */
function plannedSeconds(
  budget: TierBudget,
  width: number,
  height: number,
  fps: number,
): number {
  if (fps <= 0) return 0;
  return affordableFrames(budget, width, height) / fps;
}

/** Output height at `width`, exactly as `FrameGeometry` will compute it. */
function outputHeightOf(width: number, probe: InputProbe | null): number {
  if (!probe || probe.width === 0) return Math.round(width * 0.5625);
  return Math.max(1, Math.round((width * probe.height) / probe.width));
}

export function Mp4ToGifTool({
  content,
  trustLine,
  children,
}: {
  content: ToolContent;
  trustLine: React.ReactNode;
  children: React.ReactNode;
}) {
  const capabilities = useCapabilities();
  const videoRef = useRef<HTMLVideoElement>(null);
  /** The handle the user touched last. Drives which end the preview shows. */
  const seekTargetRef = useRef<number>(0);
  const [seekSec, setSeekSec] = useState(0);

  const tier = capabilities?.tier ?? "desktop";
  const budget = TIER_BUDGETS[tier];
  const isMobileTier = tier === "android-mobile" || tier === "ios";
  const profile = isMobileTier ? MOBILE_DEFAULTS : DESKTOP_DEFAULTS;

  /**
   * True once the device has answered and the answer is no.
   *
   * `capabilities === null` is the pre-hydration state and must render as
   * available: the server has no device, and guessing "unavailable" would show
   * every desktop visitor a refusal for the length of one paint.
   */
  const videoUnavailable = capabilities !== null && !capabilities.videoInput;

  /**
   * Moves the preview to the handle that just moved.
   *
   * A native `<video>` seek is the browser's own decode-from-the-nearest-keyframe
   * — the exact behaviour `phase-07` asks for, at no cost, and without a second
   * decode path competing with the engine's. Building a scrubber on top of
   * `VideoDecoder` would spend the memory the job itself needs, to show a frame
   * the element can already show.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(seekSec)) return;
    try {
      video.currentTime = seekSec;
    } catch {
      // Seeking before metadata loads throws in some engines. The `loadedmetadata`
      // handler below re-applies it, so there is nothing to recover from.
    }
  }, [seekSec]);

  const controls = useCallback(
    ({ probe }: WorkbenchContext): readonly ControlDef[] => {
      const sourceWidth = probe?.width ?? profile.width;
      const duration = probe?.durationSec ?? 0;

      return [
        {
          kind: "custom",
          id: "trim",
          label: content.controls.trim.label,
          hint: content.controls.trim.hint,
          render: ({ values: current, setValue, disabled }) => (
            <TrimRange
              label={content.controls.trim.label}
              durationSec={duration}
              disabled={disabled || duration <= 0}
              value={trimOf(current, duration)}
              onChange={(next) => {
                const movedEnd = next.to !== trimOf(current, duration).to;
                setValue("trimFrom", next.from);
                setValue("trimTo", next.to);
                seekTargetRef.current = movedEnd ? next.to : next.from;
                setSeekSec(seekTargetRef.current);
              }}
            />
          ),
        },
        {
          kind: "slider",
          id: "fps",
          label: content.controls.fps.label,
          hint: content.controls.fps.hint,
          min: 5,
          // 20 is the top of `FPS_LADDER`; admission control cannot admit more,
          // so a slider that went higher would only ever be silently downgraded.
          max: 20,
          unit: " fps",
          showNumberInput: true,
        },
        {
          kind: "slider",
          id: "width",
          label: content.controls.width.label,
          hint: content.controls.width.hint,
          min: MIN_WIDTH,
          // The source's own width, capped by the tier: the engine never
          // upscales, and it will not admit a plan above `defaultMaxWidth`.
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
    [budget.defaultMaxWidth, content.controls, profile.width],
  );

  const buildSpec = useCallback(
    (values: ControlValues, probe: InputProbe | null): JobSpec => {
      const duration = probe?.durationSec ?? 0;
      const { from, to } = trimOf(values, duration);

      return {
        toolSlug: SLUG,
        geometry: { targetWidth: numberValue(values, "width", profile.width) },
        timing: {
          fps: numberValue(values, "fps", profile.fps),
          // Omitted when it covers the whole clip: an unnecessary trim would make
          // the decoder seek to a keyframe it was already going to start from.
          ...(from > 0 || (duration > 0 && to < duration)
            ? { trimSec: { from, to } }
            : {}),
        },
        output: {
          kind: "gif",
          quality: numberValue(values, "quality", DEFAULT_QUALITY),
          // Fixed at 256 rather than offered. gifski always uses a full palette
          // and ignores this, so a Colours control would change the output on
          // Firefox — where `gifenc` is the default — and do nothing anywhere
          // else. A control whose effect depends on the browser is worse than no
          // control; the compressor is where the palette trade is offered.
          colours: 256,
        },
      };
    },
    [profile.fps, profile.width],
  );

  const valuesForProbe = useCallback(
    (probe: InputProbe, current: ControlValues): ControlValues => ({
      ...current,
      // The device profile lands here rather than in `DEFAULT_VALUES`, because
      // this runs after a worker round trip and therefore always after the tier
      // is known. Never wider than the source either: the engine does not
      // upscale, so a 320 px clip asked for 480 would only be downgraded again.
      width: Math.min(profile.width, probe.width),
      fps: profile.fps,
      trimFrom: 0,
      trimTo: probe.durationSec ?? 0,
    }),
    [profile.fps, profile.width],
  );

  /**
   * The two lines under the controls: what this device can hold, and what the
   * current settings are predicted to cost.
   */
  const notice = useCallback(
    ({ values, probe, estimate }: WorkbenchContext) => {
      const width = numberValue(values, "width", profile.width);
      const fps = numberValue(values, "fps", profile.fps);
      const height = outputHeightOf(width, probe);
      const seconds = plannedSeconds(budget, width, height, fps);

      return (
        <div className="mt-1 flex flex-col gap-1.5">
          <p className="tabular text-caption text-fg-secondary" data-limits-note>
            {fillNote(content.notes?.limits ?? "", {
              seconds: seconds.toFixed(0),
              width,
              height,
              fps,
            })}
          </p>
          {/* Two lines, and the split between them is what keeps the box
              still. The figure arrives seconds after the file — long past the
              window that would excuse the shift as prompted — so its slot is
              reserved and holds a *short* sentence that cannot wrap past two
              lines even at 320px. The standing caveat is the long half, and it
              is always rendered, so it costs nothing when the number lands. */}
          <p
            className="tabular min-h-[2.9em] text-caption text-fg-muted"
            data-estimate
          >
            {estimate
              ? fillNote(content.notes?.estimate ?? "", {
                  low: formatBytes(estimate.low),
                  high: formatBytes(estimate.high),
                })
              : null}
          </p>
          <p className="text-caption text-fg-muted" data-estimate-caveat>
            {content.notes?.estimateCaveat}
          </p>
        </div>
      );
    },
    [budget, content.notes, profile.fps, profile.width],
  );

  /** The source preview is a `<video>`, not an `<img>`. */
  const preview = useCallback(
    ({ sourceUrl }: WorkbenchContext & { sourceUrl: string }) => (
      <video
        ref={videoRef}
        src={sourceUrl}
        muted
        playsInline
        preload="metadata"
        // No `controls`: the trim handles are the transport, and a second set of
        // scrub controls inside the frame would compete with them for the same
        // gesture on touch.
        aria-label={content.labels?.sourceAlt}
        className="size-full object-contain"
        onLoadedMetadata={(event) => {
          // Metadata can land after the first seek was requested. Re-applying it
          // here is what makes the preview show the trim start rather than
          // frame zero on a slow file.
          try {
            event.currentTarget.currentTime = seekTargetRef.current;
          } catch {
            // A container that refuses a seek keeps its poster frame. Not worth
            // an error state for a preview.
          }
        }}
      />
    ),
    [content.labels?.sourceAlt],
  );

  const applySetting = useCallback(
    (
      setting: string,
      value: number,
      setValue: (id: string, next: string | number | boolean) => void,
    ) => {
      if (setting === "width" || setting === "fps") setValue(setting, value);
    },
    [],
  );

  const accept = useMemo(() => ["mp4", "webm", "mov"] as const, []);

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
      downloadSuffix="-gif"
      liveEstimate
      notice={notice}
      preview={preview}
      unavailable={
        videoUnavailable ? (
          <ToolUnavailable
            title={content.notes?.unavailableTitle ?? ""}
            body={content.notes?.unavailableBody ?? ""}
            action={
              <Link
                href="/gif-compressor"
                className="text-label font-medium text-brand underline underline-offset-2"
              >
                {content.notes?.unavailableAction ?? ""}
              </Link>
            }
          />
        ) : undefined
      }
      idleReason={
        videoUnavailable ? content.notes?.unavailableTitle : undefined
      }
      changeableSettings={["width", "fps"]}
      applySetting={applySetting}
    >
      {children}
    </GifWorkbench>
  );
}
