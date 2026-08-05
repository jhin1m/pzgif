/**
 * Admission control. Runs **before** a single frame is decoded, every time.
 *
 * gifski cannot stream: it concatenates every frame into one buffer and then
 * copies that buffer into the WASM heap, so peak residency is
 *
 *     2 x frames x out_W x out_H x 4
 *
 * and it is known in full before any work starts. That makes refusal a decision
 * rather than a crash. Catching an OOM afterwards is not a fallback — on iOS it
 * is a killed tab, a lost file and no message.
 *
 * Two behaviours follow, and both are product decisions rather than engineering
 * ones:
 *
 *  - **Downgrade silently-but-visibly.** If the requested width and frame rate
 *    do not fit, the largest pair that does is accepted and reported. The UI
 *    shows those as editable defaults with the budget as the slider ceiling,
 *    which turns a memory constraint into legible behaviour.
 *  - **Never refuse without an offer.** When nothing fits at any width, the
 *    refusal carries a concrete truncated run — "at 320 px, 10 fps, about 6 s" —
 *    because a refusal with no action is a permanent exit for the
 *    highest-intent user in the funnel.
 */

import { detectCapabilities, resolveEncoder, type Capabilities } from "./capability";
import { browserUnsupportedError, decodeFailedError, tooLargeError } from "./errors";
import { isFfmpegAvailable } from "./ffmpeg-fallback";
import {
  FPS_LADDER,
  TIER_BUDGETS,
  WIDTH_LADDER,
  frameBufferBytes,
  type TierBudget,
} from "./limits";
import { FrameGeometry } from "./ops/geometry";
import { directionFrameCount, selectedFrameCount } from "./ops/frame-select";
import type { AcceptedPlan, InputProbe, JobSpec, MediaError } from "./types";

export type Admission =
  | { ok: true; plan: AcceptedPlan }
  | { ok: false; error: MediaError };

/** Frames a decode would produce at `fps`, before any timing op. */
function decodedFrameCount(probe: InputProbe, fps: number): number {
  if (probe.frameCount !== null) return probe.frameCount;
  if (probe.durationSec !== null) return Math.max(1, Math.ceil(probe.durationSec * fps));
  // Neither stated — some WebM carries no duration in its header. The count is
  // unknowable here, so the plan is capped at the tier ceiling and the decoder
  // stops there. Guessing a smaller number would let a job start that cannot
  // fit; refusing outright would reject a clip that may be two seconds long.
  return Number.POSITIVE_INFINITY;
}

interface FrameCounts {
  decodeFrames: number;
  frames: number;
  /** True when the clip was cut short rather than merely scaled down. */
  truncated: boolean;
}

/**
 * Decoded frames and output frames, kept consistent with each other.
 *
 * `outputCeiling` bounds the **output**, and the decode count is solved back
 * from it — never the reverse. Ping-pong turns n decoded frames into 2n-2, so a
 * ceiling applied to the decode count would let a job emit twice what its budget
 * reserved.
 *
 * The ceiling is only ever something the caller asked for: `spec.maxFrames`, or
 * the trimmed offer attached to a refusal. The tier's own cap is deliberately
 * *not* applied here — silently shortening someone's animation to make it fit is
 * the failure mode admission control exists to replace with a question.
 */
function frameCountsFor(
  probe: InputProbe,
  spec: JobSpec,
  fps: number,
  outputCeiling = spec.maxFrames ?? Number.POSITIVE_INFINITY,
): FrameCounts {
  const decoded = decodedFrameCount(probe, fps);
  const selected = selectedFrameCount(decoded, spec.timing);

  const maxDecode =
    spec.timing.direction === "ping-pong"
      ? Math.floor(outputCeiling / 2) + 1
      : outputCeiling;
  const decodeFrames = Math.max(1, Math.min(selected, maxDecode));

  return {
    decodeFrames,
    frames: directionFrameCount(decodeFrames, spec.timing.direction),
    truncated: decodeFrames < selected,
  };
}

function buildPlan(
  probe: InputProbe,
  spec: JobSpec,
  fps: number,
  width: number,
  counts: { decodeFrames: number; frames: number },
  budget: TierBudget,
  capabilities: Capabilities,
  downgraded: boolean,
  truncated: boolean,
): AcceptedPlan {
  const geometry = new FrameGeometry(probe.width, probe.height, {
    ...spec.geometry,
    targetWidth: width,
  }, { even: spec.output.kind === "video", maxWidth: budget.defaultMaxWidth });

  return {
    fps,
    width: geometry.outputWidth,
    height: geometry.outputHeight,
    frames: counts.frames,
    decodeFrames: counts.decodeFrames,
    frameBufferBytes: frameBufferBytes(
      counts.frames,
      geometry.outputWidth,
      geometry.outputHeight,
    ),
    downgraded,
    truncated,
    encoder: spec.output.kind === "gif"
      ? resolveEncoder(spec.output.encoder, capabilities)
      : null,
  };
}

/**
 * The capability gate — the questions no setting change can answer.
 *
 * These run first and separately from the budget search because their answer is
 * "not on this device", not "not at this size". Telling an iOS user to try a
 * smaller width when video is off entirely would be a loop with no exit.
 */
function capabilityRefusal(
  probe: InputProbe,
  spec: JobSpec,
  capabilities: Capabilities,
): MediaError | null {
  if (probe.format === "video") {
    if (capabilities.tier === "ios") {
      return browserUnsupportedError({ reason: "ios-video-budget" });
    }
    if (!capabilities.videoDecode) {
      return browserUnsupportedError({ reason: "no-video-decoder" });
    }
    if (!probe.decodable) {
      // The container parsed but the codec does not decode here — measured for
      // HEVC on Chromium and Firefox, which is what an iPhone actually uploads.
      return decodeFailedError({
        // Offered only when the binaries are actually vendored into this
        // deployment. Advertising a fallback that cannot run is a second dead
        // end layered on the first.
        canOfferFallback: isFfmpegAvailable(),
        detail: `codec ${probe.codec ?? "unknown"} is not decodable on this engine`,
      });
    }
  }

  if (spec.output.kind === "video" && !capabilities.videoEncode) {
    return browserUnsupportedError({ reason: "no-video-encoder" });
  }

  if (probe.format === "webp" && !capabilities.imageDecoder) {
    // Safari has no `ImageDecoder` at any version, so animated WebP has no
    // decode path here until Phase 7 decides on a hand-rolled RIFF splitter.
    return browserUnsupportedError({ reason: "no-image-decoder" });
  }

  return null;
}

export function admit(
  probe: InputProbe,
  spec: JobSpec,
  capabilities: Capabilities = detectCapabilities(),
  budget: TierBudget = TIER_BUDGETS[capabilities.tier],
): Admission {
  const refusal = capabilityRefusal(probe, spec, capabilities);
  if (refusal) return { ok: false, error: refusal };

  const wantedFps = spec.timing.fps ?? FPS_LADDER[0];
  const wantedWidth = Math.min(spec.geometry.targetWidth, budget.defaultMaxWidth);

  const fpsOptions = [wantedFps, ...FPS_LADDER.filter((value) => value < wantedFps)];
  const widthOptions = [
    wantedWidth,
    ...WIDTH_LADDER.filter((value) => value < wantedWidth),
  ];

  for (const fps of fpsOptions) {
    for (const width of widthOptions) {
      let counts = frameCountsFor(probe, spec, fps);

      if (!Number.isFinite(counts.frames)) {
        // The container states no duration — some WebM carries none. Nothing can
        // be sized in advance, so the plan takes the tier's cap and the decoder
        // stops there. That is a truncation the UI must announce, but it beats
        // refusing a clip that might be two seconds long.
        counts = frameCountsFor(probe, spec, fps, budget.hardMaxFrames);
        counts = { ...counts, truncated: true };
      } else if (counts.frames > budget.hardMaxFrames) {
        // Known to be too long. Refuse and offer the trim rather than quietly
        // cutting the animation short.
        continue;
      }

      const candidate = buildPlan(
        probe, spec, fps, width, counts, budget, capabilities,
        fps !== wantedFps || width !== wantedWidth,
        counts.truncated,
      );
      if (candidate.frameBufferBytes <= budget.budgetBytes) {
        return { ok: true, plan: candidate };
      }
    }
  }

  const degraded = truncatedPlan(probe, spec, capabilities, budget);
  const requested = requestedOutputFrames(probe, spec, wantedFps);
  return {
    ok: false,
    error: tooLargeError({
      // Omitted when the container never stated a duration. A refusal message is
      // the last place to put a number nobody measured.
      degraded,
      requestedFrames: Number.isFinite(requested) ? requested : null,
      budgetMb: Math.round(budget.budgetBytes / (1024 * 1024)),
    }),
  };
}

/**
 * The one-click offer attached to every refusal: the smallest rung, trimmed to
 * however much of the clip actually fits.
 *
 * Returns null only when even two frames at the smallest width overflow the
 * budget, which on the current tiers cannot happen — but the null is kept rather
 * than asserted away, because the tiers are measured numbers that will move.
 */
/** What the user actually asked for, uncapped. Infinite when unknowable. */
function requestedOutputFrames(probe: InputProbe, spec: JobSpec, fps: number): number {
  const decoded = decodedFrameCount(probe, fps);
  if (!Number.isFinite(decoded)) return Number.POSITIVE_INFINITY;
  return directionFrameCount(
    selectedFrameCount(decoded, spec.timing),
    spec.timing.direction,
  );
}

export function truncatedPlan(
  probe: InputProbe,
  spec: JobSpec,
  capabilities: Capabilities = detectCapabilities(),
  budget: TierBudget = TIER_BUDGETS[capabilities.tier],
): AcceptedPlan | null {
  const fps = FPS_LADDER[FPS_LADDER.length - 1];
  const width = Math.min(WIDTH_LADDER[WIDTH_LADDER.length - 1], budget.defaultMaxWidth);

  const geometry = new FrameGeometry(
    probe.width,
    probe.height,
    { ...spec.geometry, targetWidth: width },
    { even: spec.output.kind === "video", maxWidth: budget.defaultMaxWidth },
  );

  const bytesPerFrame = 2 * geometry.outputWidth * geometry.outputHeight * 4;
  const affordable = Math.min(
    Math.floor(budget.budgetBytes / bytesPerFrame),
    budget.hardMaxFrames,
  );
  // Solve for decoded frames, not output frames: ping-pong doubles, and offering
  // a run that then decodes twice its own budget would be worse than refusing.
  const counts = frameCountsFor(probe, spec, fps, affordable);
  // gifski refuses a single frame outright, so a one-frame offer is not an offer.
  if (counts.frames < 2) return null;

  return buildPlan(probe, spec, fps, width, counts, budget, capabilities, true, true);
}
