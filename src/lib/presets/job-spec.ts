/**
 * Turning a Discord preset plus a probed file into a `JobSpec`.
 *
 * ── Why this is not inline in the page ─────────────────────────────────────
 * Four of the rules here are Discord's rejection criteria, and three of them are
 * invisible in the output: a sticker that is 320×320 and 400 KB and six seconds
 * long looks correct in every way the result panel can show and is refused at
 * upload. A defect in this function produces a file that appears to work, which
 * is the class of bug a unit test earns its keep on.
 *
 * ── The order the constraints are applied ──────────────────────────────────
 * Shape first, then length, then rate. Cropping to the preset's aspect ratio
 * changes nothing about duration; trimming to the duration cap changes how many
 * frames exist; and only then is it meaningful to ask whether the frame rate is
 * over the ceiling. Doing it the other way round caps the rate of a clip that is
 * about to be cut, which is arithmetic on a number that will not survive.
 */

import type { InputProbe, JobSpec, TimingSpec } from "../media/types";
import { coverCrop, type DiscordPreset } from "./discord";

/** The settings the manual-override panel owns. */
export interface ManualSettings {
  quality: number;
  colours: number;
  keepEveryNth: number;
}

export const MANUAL_DEFAULTS: ManualSettings = {
  quality: 80,
  colours: 256,
  keepEveryNth: 1,
};

/**
 * The timing constraints this preset imposes on this file.
 *
 * Only the sticker has any, and both of its caps are hard rejection criteria
 * that neither locked document mentions.
 *
 * **The duration cap is expressed differently per input kind, and that is not an
 * inconsistency.** A video is trimmed in *seconds*, because the decoder can seek
 * — asking for the first five seconds of a sixty-second clip reads five seconds
 * of it. A GIF has no seek, so the same cap has to be expressed as a frame
 * range, which `frame-select.ts` enforces while decoding. Using `trimSec` for a
 * GIF would decode all sixty seconds and discard most of them, on the tier least
 * able to afford it.
 */
export function presetTiming(
  preset: DiscordPreset,
  probe: InputProbe | null,
): TimingSpec {
  const timing: TimingSpec = {};
  if (!probe) return timing;

  const duration = probe.durationSec;
  if (preset.maxDurationSec !== null && duration !== null && duration > preset.maxDurationSec) {
    if (probe.format === "video") {
      timing.trimSec = { from: 0, to: preset.maxDurationSec };
    } else if (probe.frameCount !== null && probe.frameCount > 0) {
      // Round up: a frame boundary that lands a few milliseconds past the cap is
      // still one frame of a five-second sticker, and rounding down would drop a
      // frame from every animation whose length is not an exact multiple.
      const kept = Math.max(
        1,
        Math.ceil((probe.frameCount * preset.maxDurationSec) / duration),
      );
      timing.range = { from: 0, to: Math.min(probe.frameCount, kept) };
    }
  }

  if (preset.maxFps !== null) {
    if (probe.format === "video") {
      // The decoder resamples video to a requested rate, so the cap is simply a
      // ceiling on what to ask for.
      timing.fps = preset.maxFps;
    } else if (probe.frameCount !== null && duration !== null && duration > 0) {
      // A GIF keeps its own frame delays — nothing resamples it — so the only
      // lever is dropping frames. Rare in practice: browsers clamp very short
      // delays anyway. Enforced regardless, because "rare" is not "never" and
      // the rejection it causes is silent.
      const sourceFps = probe.frameCount / duration;
      if (sourceFps > preset.maxFps) {
        timing.keepEveryNth = Math.ceil(sourceFps / preset.maxFps);
      }
    }
  }

  return timing;
}

/**
 * The job that produces this preset's output from this file.
 *
 * `manual` is absent on the auto-fit path, where the search owns quality,
 * palette and stride — passing defaults in would make the seed look like a user
 * choice the search then overrode.
 */
export function presetJobSpec(
  slug: string,
  preset: DiscordPreset,
  probe: InputProbe | null,
  manual?: ManualSettings,
): JobSpec {
  const crop = probe ? coverCrop(probe.width, probe.height, preset) : null;
  const timing = presetTiming(preset, probe);

  if (manual && manual.keepEveryNth > 1) {
    // The user's stride composes with the preset's rather than replacing it: a
    // 60 FPS sticker that also has "keep every 2nd frame" set needs both.
    timing.keepEveryNth = (timing.keepEveryNth ?? 1) * manual.keepEveryNth;
  }

  return {
    toolSlug: slug,
    geometry: {
      ...(crop ? { crop } : {}),
      targetWidth: preset.width,
      /**
       * Every preset pins its width, and only the sticker enlarges.
       *
       * **Pinning** is uniform because a preset's width is chosen by the
       * destination rather than by the visitor. Admission control's default is
       * to shed width first, which is right for a tool whose width somebody
       * picked — a smaller GIF is a smaller version of what they asked for — and
       * wrong here, where it produces a differently-shaped file that no longer
       * matches the surface the page named. Shedding frame rate instead keeps
       * the promise the page made.
       *
       * This is not hypothetical. The 960×540 banner is the largest canvas on
       * the site, and an auto-fit job is admitted against two thirds of the
       * frame budget because it holds its frames resident across attempts.
       * Without the pin, a desktop-tier banner came out at 640×360 — the right
       * shape at the wrong size, with nothing on screen saying so.
       *
       * **Enlarging** stays sticker-only. Everywhere else the engine's refusal
       * to invent detail stands: a 64×64 source makes a 64×64 emoji, which
       * Discord accepts and which is sharper than the same drawing blown up.
       */
      pinWidth: true,
      ...(preset.dimensionsExact ? { upscale: true } : {}),
    },
    timing,
    output: {
      kind: "gif",
      quality: manual?.quality ?? MANUAL_DEFAULTS.quality,
      colours: manual?.colours ?? MANUAL_DEFAULTS.colours,
    },
    // Lets the 960×540 server banner past the tier's default ceiling. The byte
    // budget is untouched and still decides whether the plan is admitted.
    widthCeiling: preset.width,
  };
}
