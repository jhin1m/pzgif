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
import type { InputProbe, JobSpec } from "@/lib/media/types";
import type { ToolContent } from "@/lib/tools/content";

/**
 * GIF speed changer — two genuinely different operations, both offered.
 *
 * ── Retime and drop are not the same request ───────────────────────────────
 * "Speed up" means one of two things and people mean different ones. Retiming
 * keeps every frame and shortens its delay: smooth, same size. Dropping frames
 * removes frames and keeps the delays: choppier, smaller.
 *
 * ── Drop mode needs *both* levers, which is not obvious ────────────────────
 * `keepEveryNth` on its own does **not** speed a GIF up. `decode/gif.ts` carries
 * a dropped frame's delay into the next kept one, deliberately, so that "keep 1
 * in 3" thins an animation without also playing it three times faster — which is
 * exactly right for the compressor's frame-thinning toggle, and exactly wrong
 * here. Measured: a 48-frame, 50 ms GIF at `keepEveryNth: 2` came out 24 frames
 * at 100 ms, still 2.4 s long.
 *
 * So drop mode sets the stride *and* retimes by the same factor: the merged
 * 100 ms delays are divided back to the original 50 ms, leaving half the frames
 * playing at the original pace and finishing in half the time. That is the file
 * a user asking for "2×, drop frames" expects, and it is why the E2E asserts the
 * per-frame delay rather than only the frame count.
 *
 * ── The delay floor is stated before the run, from the file's own numbers ──
 * GIF delays are stored in hundredths of a second and browsers clamp very short
 * ones upwards, so past roughly 20 ms per frame a further speed-up cannot be
 * expressed as timing at all. `ops/speed.ts` handles that by dropping the frames
 * that fall under the floor and carrying their time forward — which is correct,
 * but silent. The notice here says it will happen, with this file's measured
 * per-frame delay rather than a general caution.
 *
 * Drop mode is offered only at whole-number speeds: `keepEveryNth` is a stride,
 * and a stride of 1.5 is not a thing. Below 1× it is not offered at all, because
 * you cannot slow a GIF down by removing frames.
 */

const SLUG = "gif-speed-changer";

/** Matches `ops/speed.ts` and `decode/gif.ts`. Kept in sync by the copy above. */
const MIN_DELAY_MS = 20;

/** Speed changes do not ask for a quality trade, so they do not take one. */
const SPEED_QUALITY = 90;

const DEFAULT_VALUES: ControlValues = { speed: "2", method: "retime" };

function speedOf(values: ControlValues): number {
  const parsed = Number(stringValue(values, "speed", "2"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** Whether dropping frames can express this speed at all. */
function dropAvailable(speed: number): boolean {
  return speed >= 2 && Number.isInteger(speed);
}

function methodOf(values: ControlValues, speed: number): "retime" | "drop" {
  const requested = stringValue(values, "method", "retime");
  return requested === "drop" && dropAvailable(speed) ? "drop" : "retime";
}

/** The file's mean per-frame delay. Null when the probe could not say. */
function averageDelayMs(probe: InputProbe | null): number | null {
  if (!probe || !probe.frameCount || probe.durationSec === null) return null;
  if (probe.frameCount === 0) return null;
  return (probe.durationSec * 1000) / probe.frameCount;
}

export function GifSpeedChangerTool({
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
    ({ values }: WorkbenchContext): readonly ControlDef[] => {
      const speed = speedOf(values);
      const canDrop = dropAvailable(speed);
      // The copy changes with the state rather than the control vanishing: §5.1
      // wants a disabled control to keep its place and say why.
      const methodCopy = canDrop
        ? content.controls.method
        : content.controls.methodRetimeOnly;

      return [
        {
          kind: "select",
          id: "speed",
          label: content.controls.speed.label,
          hint: content.controls.speed.hint,
          options: content.controls.speed.options ?? [],
        },
        {
          kind: "select",
          id: "method",
          label: methodCopy.label,
          hint: methodCopy.hint,
          options: content.controls.method.options ?? [],
          disabled: !canDrop,
        },
      ];
    },
    [content.controls],
  );

  const buildSpec = useCallback(
    (values: ControlValues, probe: InputProbe | null): JobSpec => {
      const speed = speedOf(values);
      return {
        toolSlug: SLUG,
        // The source's own width: this tool does not resize. Admission control
        // may still reduce it to fit the device, and says so when it does.
        geometry: { targetWidth: probe?.width ?? 640 },
        timing:
          methodOf(values, speed) === "drop"
            ? { keepEveryNth: speed, speed }
            : { speed },
        output: { kind: "gif", quality: SPEED_QUALITY, colours: 256 },
      };
    },
    [],
  );

  /**
   * What the chosen settings will actually produce, from the file's own numbers.
   *
   * Two separate facts: the frame count and duration to expect, and — only when
   * it applies — that the delay floor is about to remove frames the user did not
   * ask to lose.
   */
  const notice = useCallback(
    ({ values, probe }: WorkbenchContext) => {
      const delay = averageDelayMs(probe);
      if (!probe || delay === null || probe.frameCount === null) return null;

      const speed = speedOf(values);
      const method = methodOf(values, speed);
      const seconds = ((probe.durationSec ?? 0) / speed).toFixed(1);

      const plan =
        method === "drop"
          ? t("speedPlanDrop", {
              frames: Math.ceil(probe.frameCount / speed),
              sourceFrames: probe.frameCount,
              seconds,
            })
          : t("speedPlanRetime", { frames: probe.frameCount, seconds });

      const target = delay / speed;
      const hitsFloor = method === "retime" && target < MIN_DELAY_MS;

      return (
        <div className="mt-1 flex flex-col gap-1">
          <p className="tabular text-caption text-fg-secondary">{plan}</p>
          {hitsFloor ? (
            <p className="tabular text-caption text-warning-text">
              {t("speedFloorNotice", {
                sourceMs: Math.round(delay),
                targetMs: Math.round(target),
                floorMs: MIN_DELAY_MS,
              })}
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
      downloadSuffix="-speed"
      notice={notice}
    >
      {children}
    </GifWorkbench>
  );
}
