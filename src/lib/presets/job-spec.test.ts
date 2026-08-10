import { describe, expect, it } from "vitest";
import { getPreset } from "./discord";
import { MANUAL_DEFAULTS, presetJobSpec, presetTiming } from "./job-spec";
import type { InputProbe } from "../media/types";

/**
 * Three of the four sticker rules are invisible in the produced file — a
 * six-second 320×320 sticker under 512 KB looks correct everywhere the result
 * panel can show it, and is refused at upload. This is where they are checked.
 */

function probe(overrides: Partial<InputProbe> = {}): InputProbe {
  return {
    format: "gif",
    declaredExtension: "gif",
    width: 480,
    height: 270,
    durationSec: 2,
    frameCount: 40,
    codec: "gif",
    decodable: true,
    rotationDegrees: 0,
    ...overrides,
  };
}

describe("presetTiming", () => {
  const sticker = getPreset("sticker");
  const emoji = getPreset("emoji");

  it("leaves an emoji alone — it has no duration or rate cap", () => {
    expect(presetTiming(emoji, probe({ durationSec: 60, frameCount: 600 }))).toEqual({});
  });

  it("leaves a sticker that is already short enough alone", () => {
    expect(presetTiming(sticker, probe({ durationSec: 3, frameCount: 30 }))).toEqual({});
  });

  it("trims a long video in seconds, so the decoder can seek", () => {
    const timing = presetTiming(
      sticker,
      probe({ format: "video", durationSec: 60, frameCount: null }),
    );
    expect(timing.trimSec).toEqual({ from: 0, to: 5 });
    expect(timing.range).toBeUndefined();
  });

  it("trims a long GIF by frame range, because a GIF cannot seek", () => {
    // `trimSec` on a GIF would decode all sixty seconds and throw most away, on
    // the tier least able to afford it.
    const timing = presetTiming(sticker, probe({ durationSec: 20, frameCount: 200 }));
    expect(timing.trimSec).toBeUndefined();
    expect(timing.range).toEqual({ from: 0, to: 50 });
  });

  it("never asks for more frames than the GIF has", () => {
    const timing = presetTiming(sticker, probe({ durationSec: 6, frameCount: 7 }));
    expect(timing.range!.to).toBeLessThanOrEqual(7);
  });

  it("caps a video's frame rate at the preset's ceiling", () => {
    const timing = presetTiming(
      sticker,
      probe({ format: "video", durationSec: 2, frameCount: null }),
    );
    expect(timing.fps).toBe(60);
  });

  it("drops frames to bring a very fast GIF under the rate cap", () => {
    // A GIF keeps its own delays, so nothing resamples it — the only lever is
    // the stride. 300 frames in 2 seconds is 150 fps.
    const timing = presetTiming(sticker, probe({ durationSec: 2, frameCount: 300 }));
    expect(timing.keepEveryNth).toBe(3);
    expect(timing.fps).toBeUndefined();
  });

  it("says nothing about timing when the file has not been probed", () => {
    expect(presetTiming(sticker, null)).toEqual({});
  });
});

describe("presetJobSpec", () => {
  const emoji = getPreset("emoji");
  const sticker = getPreset("sticker");
  const banner = getPreset("banner");

  it("centre-crops a wide source to the preset's shape", () => {
    const spec = presetJobSpec("discord-emoji-gif", emoji, probe());
    expect(spec.geometry.crop).toEqual({ x: 105, y: 0, width: 270, height: 270 });
    expect(spec.geometry.targetWidth).toBe(128);
  });

  it("adds no crop when the source already has the preset's shape", () => {
    const spec = presetJobSpec("discord-emoji-gif", emoji, probe({ width: 500, height: 500 }));
    expect(spec.geometry.crop).toBeUndefined();
  });

  it("pins the width on every preset, so a tight budget costs frames not shape", () => {
    // The banner is why this is uniform. At 960×540 against the two-thirds
    // budget an auto-fit job is admitted under, the unpinned version came out
    // 640×360 — the right shape at the wrong size, with nothing saying so.
    for (const preset of [emoji, sticker, banner]) {
      expect(
        presetJobSpec("discord-x", preset, probe()).geometry.pinWidth,
        preset.id,
      ).toBe(true);
    }
  });

  it("enlarges only for the sticker", () => {
    // Discord refuses anything but exactly 320×320 there, so an honest 200×200
    // sticker is a file the destination will not take. Everywhere else the
    // engine's refusal to invent detail stands.
    expect(presetJobSpec("discord-sticker-gif", sticker, probe()).geometry.upscale).toBe(true);
    expect(presetJobSpec("discord-emoji-gif", emoji, probe()).geometry.upscale).toBeUndefined();
    expect(presetJobSpec("discord-banner-gif", banner, probe()).geometry.upscale).toBeUndefined();
  });

  it("raises the width ceiling to the preset's own width", () => {
    // 960 is above every tier's default. Without this the banner preset would
    // silently emit 640×360 and claim it fits a shape it does not.
    expect(presetJobSpec("discord-banner-gif", banner, probe()).widthCeiling).toBe(960);
  });

  it("uses the reference settings when no manual override is given", () => {
    const spec = presetJobSpec("discord-emoji-gif", emoji, probe());
    expect(spec.output).toMatchObject({
      kind: "gif",
      quality: MANUAL_DEFAULTS.quality,
      colours: MANUAL_DEFAULTS.colours,
    });
  });

  it("composes the user's frame stride with the preset's own", () => {
    // A 150 fps sticker already needs every third frame to clear the rate cap.
    // A user asking for every second frame on top of that wants every sixth —
    // replacing rather than composing would put the file back over 60 fps.
    const spec = presetJobSpec(
      "discord-sticker-gif",
      sticker,
      probe({ durationSec: 2, frameCount: 300 }),
      { ...MANUAL_DEFAULTS, keepEveryNth: 2 },
    );
    expect(spec.timing.keepEveryNth).toBe(6);
  });

  it("builds a usable spec before the file has been probed", () => {
    // The settings panel renders before the worker answers, and a spec built
    // from a null probe has to be coherent rather than throwing.
    const spec = presetJobSpec("discord-emoji-gif", emoji, null);
    expect(spec.geometry.targetWidth).toBe(128);
    expect(spec.geometry.crop).toBeUndefined();
  });
});
