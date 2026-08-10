/**
 * Admission control is the one thing in the engine that must be right *before*
 * any work happens, so it is tested at the boundary conditions rather than in
 * the middle: what fits exactly, what does not fit at all, and what a device
 * that cannot do the job at any size is told.
 */

import { describe, expect, it } from "vitest";
import { TIER_BUDGETS, frameBufferBytes } from "./limits";
import { admit, truncatedPlan } from "./plan";
import { directionFrameCount } from "./ops/frame-select";
import type { Capabilities } from "./capability";
import type { InputProbe, JobSpec } from "./types";

const DESKTOP: Capabilities = {
  tier: "desktop",
  engine: "blink",
  videoDecode: true,
  videoEncode: true,
  imageDecoder: true,
  offscreenCanvas: true,
  webAssembly: true,
  videoInput: true,
  ffmpegFallback: true,
};

const IOS: Capabilities = {
  ...DESKTOP,
  tier: "ios",
  engine: "webkit",
  imageDecoder: false,
  videoInput: false,
  ffmpegFallback: false,
};

const FIREFOX_ANDROID: Capabilities = {
  ...DESKTOP,
  tier: "android-mobile",
  engine: "gecko",
  videoDecode: false,
  videoEncode: false,
  videoInput: false,
};

function gifProbe(overrides: Partial<InputProbe> = {}): InputProbe {
  return {
    format: "gif",
    declaredExtension: "gif",
    width: 800,
    height: 600,
    durationSec: 4,
    frameCount: 60,
    codec: "gif",
    decodable: true,
    rotationDegrees: 0,
    ...overrides,
  };
}

function videoProbe(overrides: Partial<InputProbe> = {}): InputProbe {
  return {
    format: "video",
    declaredExtension: "mp4",
    width: 1920,
    height: 1080,
    durationSec: 10,
    frameCount: null,
    codec: "avc1.640028",
    decodable: true,
    rotationDegrees: 0,
    ...overrides,
  };
}

function spec(overrides: Partial<JobSpec> = {}): JobSpec {
  return {
    toolSlug: "gif-compressor",
    geometry: { targetWidth: 480 },
    timing: {},
    output: { kind: "gif", quality: 80, colours: 256 },
    ...overrides,
  };
}

describe("admit", () => {
  it("accepts an ordinary GIF at the requested size", () => {
    const result = admit(gifProbe(), spec(), DESKTOP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.width).toBe(480);
    expect(result.plan.frames).toBe(60);
    expect(result.plan.downgraded).toBe(false);
    expect(result.plan.truncated).toBe(false);
  });

  it("budgets for the frames ping-pong will actually produce", () => {
    // The failure this guards against is an OOM *after* the user was told the
    // job would fit: ping-pong doubles the output, so budgeting the input count
    // would under-count by half.
    const plain = admit(gifProbe(), spec(), DESKTOP);
    const pinged = admit(
      gifProbe(),
      spec({ timing: { direction: "ping-pong" } }),
      DESKTOP,
    );
    expect(plain.ok && pinged.ok).toBe(true);
    if (!plain.ok || !pinged.ok) return;
    expect(pinged.plan.frames).toBe(plain.plan.frames * 2 - 2);
    expect(pinged.plan.frameBufferBytes).toBeGreaterThan(plain.plan.frameBufferBytes);
    // And the decoder is told the *pre*-reordering count. Handing it the output
    // count would decode twice what the budget reserved.
    expect(pinged.plan.decodeFrames).toBe(plain.plan.frames);
  });

  it("keeps decodeFrames and frames consistent under every timing op", () => {
    for (const timing of [
      {},
      { direction: "reverse" as const },
      { direction: "ping-pong" as const },
      { keepEveryNth: 4 },
      { range: { from: 2, to: 20 } },
      { direction: "ping-pong" as const, keepEveryNth: 2 },
    ]) {
      const result = admit(gifProbe(), spec({ timing }), DESKTOP);
      expect(result.ok, JSON.stringify(timing)).toBe(true);
      if (!result.ok) continue;
      const expected = directionFrameCount(result.plan.decodeFrames, timing.direction);
      expect(result.plan.frames, JSON.stringify(timing)).toBe(expected);
    }
  });

  it("caps an unknown-duration container instead of refusing it", () => {
    // Some WebM states no duration. Refusing outright would reject a clip that
    // might be two seconds long; the honest answer is to take what fits and say
    // the result was trimmed.
    const result = admit(
      videoProbe({ durationSec: null, frameCount: null }),
      spec({ toolSlug: "mp4-to-gif" }),
      DESKTOP,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.truncated).toBe(true);
    expect(result.plan.frames).toBeLessThanOrEqual(TIER_BUDGETS.desktop.hardMaxFrames);
  });

  it("counts dropped frames out of the budget", () => {
    const every = admit(gifProbe(), spec({ timing: { keepEveryNth: 3 } }), DESKTOP);
    expect(every.ok).toBe(true);
    if (!every.ok) return;
    expect(every.plan.frames).toBe(20);
  });

  it("downgrades rather than refusing when the requested size does not fit", () => {
    // 300 frames at 640px is over the iOS budget many times over, but the iOS
    // tier caps width anyway; use the low-RAM desktop tier where the ladder is
    // what does the work.
    const result = admit(
      gifProbe({ frameCount: 300, durationSec: 20 }),
      spec({ geometry: { targetWidth: 640 } }),
      DESKTOP,
      TIER_BUDGETS["desktop-low-ram"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.downgraded).toBe(true);
    expect(result.plan.width).toBeLessThan(640);
    expect(result.plan.frameBufferBytes).toBeLessThanOrEqual(
      TIER_BUDGETS["desktop-low-ram"].budgetBytes,
    );
  });

  it("refuses before decode when nothing fits, and offers a trimmed run", () => {
    const result = admit(
      gifProbe({ frameCount: 2000, durationSec: 100 }),
      spec(),
      IOS,
      TIER_BUDGETS.ios,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("too-large-for-device");

    const degraded = result.error.actions.find((action) => action.kind === "run-degraded");
    expect(degraded).toBeDefined();
    if (degraded?.kind !== "run-degraded") return;
    expect(degraded.plan.truncated).toBe(true);
    expect(degraded.plan.frames).toBeGreaterThanOrEqual(2);
    expect(degraded.plan.frameBufferBytes).toBeLessThanOrEqual(TIER_BUDGETS.ios.budgetBytes);
  });

  it("refuses video on iOS with a device reason, not a size one", () => {
    // Ratified 2026-08-05: on iOS the GIF tools ship and video-to-GIF does not.
    // Telling that user to pick a smaller width would be a loop with no exit.
    const result = admit(videoProbe(), spec({ toolSlug: "mp4-to-gif" }), IOS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("browser-unsupported");
    expect(result.error.params?.reason).toBe("ios-video-budget");
    expect(result.error.actions.some((action) => action.kind === "try-other-browser")).toBe(false);
  });

  it("refuses video where the engine has no decoder at all", () => {
    const result = admit(videoProbe(), spec({ toolSlug: "mp4-to-gif" }), FIREFOX_ANDROID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.params?.reason).toBe("no-video-decoder");
  });

  it("refuses an undecodable codec before decoding, not during", () => {
    // HEVC demuxes everywhere and decodes on neither Chromium nor Firefox — and
    // HEVC is what an iPhone records.
    const result = admit(
      videoProbe({ codec: "hvc1.1.6.L93.B0", decodable: false }),
      spec({ toolSlug: "mp4-to-gif" }),
      DESKTOP,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("decode-failed");
  });

  it("admits animated WebP where ImageDecoder is absent", () => {
    // This used to be a refusal, and the refusal was the whole reason
    // `webp-to-gif` was at risk of being cut: `ImageDecoder` is the only browser
    // API that reads animated WebP and Safari has never shipped it at any
    // version. Phase 7 replaced that decoder with the RIFF splitter in
    // `decode/webp-riff.ts`, which feeds `createImageBitmap()` — present
    // everywhere — so there is no longer an engine on which the format cannot be
    // read, and no capability left to refuse on.
    //
    // Asserted on iOS specifically, which is the tier with `imageDecoder: false`
    // *and* the tightest budget: a small enough job has to be admitted there, or
    // the page is broken on the traffic it was cut for in the first place.
    const result = admit(
      gifProbe({
        format: "webp",
        declaredExtension: "webp",
        width: 240,
        height: 135,
        frameCount: 24,
        durationSec: 1.2,
      }),
      spec({ toolSlug: "webp-to-gif", geometry: { targetWidth: 240 } }),
      IOS,
    );
    expect(result.ok).toBe(true);
  });

  it("rounds video output to even dimensions", () => {
    // H.264 in yuv420p rejects odd sizes, and GIFs are frequently odd-sized.
    const result = admit(
      gifProbe({ width: 499, height: 281 }),
      spec({
        toolSlug: "gif-to-mp4",
        geometry: { targetWidth: 499 },
        output: { kind: "video", container: "mp4" },
      }),
      DESKTOP,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.width % 2).toBe(0);
    expect(result.plan.height % 2).toBe(0);
  });

  it("never accepts a plan that exceeds its own budget", () => {
    for (const budget of Object.values(TIER_BUDGETS)) {
      const result = admit(
        gifProbe({ frameCount: 200, durationSec: 13 }),
        spec({ geometry: { targetWidth: 640 } }),
        DESKTOP,
        budget,
      );
      if (!result.ok) continue;
      expect(
        frameBufferBytes(result.plan.frames, result.plan.width, result.plan.height),
        budget.tier,
      ).toBeLessThanOrEqual(budget.budgetBytes);
      expect(result.plan.frames, budget.tier).toBeLessThanOrEqual(budget.hardMaxFrames);
    }
  });
});

describe("truncatedPlan", () => {
  it("stays inside the budget it was built for", () => {
    const plan = truncatedPlan(
      gifProbe({ frameCount: 5000, durationSec: 300 }),
      spec(),
      IOS,
      TIER_BUDGETS.ios,
    );
    expect(plan).not.toBeNull();
    expect(plan!.frameBufferBytes).toBeLessThanOrEqual(TIER_BUDGETS.ios.budgetBytes);
    expect(plan!.frames).toBeLessThanOrEqual(TIER_BUDGETS.ios.hardMaxFrames);
  });
});

/**
 * The three flags the Discord presets added to the spec.
 *
 * Each one exists because a preset's output size is decided by its destination
 * rather than by the visitor, which inverts an assumption admission control was
 * built on: that a smaller version of the requested file is always an acceptable
 * substitute for it. For a 320×320 Discord sticker it is not — a 240×240 sticker
 * is a rejected upload, not a smaller one.
 */
describe("a job whose destination fixes its size", () => {
  it("may exceed the tier's default width when it states a ceiling", () => {
    // Discord publishes 960×540 for the server banner, which is above every
    // tier's `defaultMaxWidth`. Without the ceiling the preset would silently
    // emit 640×360 and claim it fits a shape it does not.
    const result = admit(
      gifProbe({ width: 1920, height: 1080, frameCount: 20, durationSec: 2 }),
      spec({ geometry: { targetWidth: 960 }, widthCeiling: 960 }),
      DESKTOP,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.width).toBe(960);
    expect(result.plan.height).toBe(540);
  });

  it("still refuses a ceiling the byte budget cannot hold", () => {
    // The ceiling raises what may be *considered*, never what may be admitted.
    // The memory constraint is unchanged and still has the last word.
    const result = admit(
      gifProbe({ width: 1920, height: 1080, frameCount: 5000, durationSec: 200 }),
      spec({ geometry: { targetWidth: 960, pinWidth: true }, widthCeiling: 960 }),
      IOS,
      TIER_BUDGETS.ios,
    );
    expect(result.ok).toBe(false);
  });

  it("sheds frame rate rather than width when the width is pinned", () => {
    const pinned = admit(
      videoProbe({ width: 1920, height: 1080, durationSec: 5, frameCount: null }),
      spec({
        geometry: { targetWidth: 320, pinWidth: true },
        timing: { fps: 20 },
      }),
      DESKTOP,
      { ...TIER_BUDGETS.desktop, budgetBytes: 30 * 1024 * 1024 },
    );
    expect(pinned.ok).toBe(true);
    if (!pinned.ok) return;
    expect(pinned.plan.width).toBe(320);
    expect(pinned.plan.fps).toBeLessThan(20);
  });

  it("keeps the pinned width in the offer attached to a refusal", () => {
    // A refusal's whole value is the concrete alternative it carries. Offering
    // a narrower run offers a file the destination rejects, which is no offer.
    const plan = truncatedPlan(
      gifProbe({ width: 1000, height: 1000, frameCount: 5000, durationSec: 300 }),
      spec({ geometry: { targetWidth: 320, pinWidth: true } }),
      IOS,
      TIER_BUDGETS.ios,
    );
    expect(plan).not.toBeNull();
    expect(plan!.width).toBe(320);
    expect(plan!.truncated).toBe(true);
  });

  it("scales a small source up only when the spec asks for it", () => {
    const small = gifProbe({ width: 200, height: 200, frameCount: 10, durationSec: 1 });

    const honest = admit(small, spec({ geometry: { targetWidth: 320 } }), DESKTOP);
    expect(honest.ok).toBe(true);
    if (honest.ok) expect(honest.plan.width).toBe(200);

    // Discord refuses anything but exactly 320×320, so an honest 200×200
    // sticker is a file the destination will not take.
    const upscaled = admit(
      small,
      spec({ geometry: { targetWidth: 320, upscale: true, pinWidth: true }, widthCeiling: 320 }),
      DESKTOP,
    );
    expect(upscaled.ok).toBe(true);
    if (upscaled.ok) {
      expect(upscaled.plan.width).toBe(320);
      expect(upscaled.plan.height).toBe(320);
    }
  });
});
