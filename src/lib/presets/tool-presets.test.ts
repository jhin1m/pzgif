import { describe, expect, it } from "vitest";
import compressorContent from "@/content/gif-compressor.json";
import mp4Content from "@/content/mp4-to-gif.json";
import type { ToolContent } from "@/lib/tools/content";
import type { InputProbe } from "@/lib/media/types";
import {
  COMPRESSOR_DEFAULT_VALUES,
  COMPRESSOR_PRESETS,
  COMPRESSOR_WIDTH_FALLBACK,
  COMPRESSOR_WIDTH_MIN,
  MP4_DESKTOP_DEFAULTS,
  MP4_MOBILE_DEFAULTS,
  mp4ToGifPresets,
  presetById,
  type ToolPreset,
} from "./tool-presets";

/**
 * Pure resolution only.
 *
 * `vitest.config.mts` sets `environment: "node"` and this repository has no DOM
 * harness, so nothing stateful is unit-tested here — the probe race, the chip
 * sync and the disclosure are Playwright's, and claiming a unit test that
 * cannot run is worse than not having one.
 */

function probeOf(width: number, height = 270): InputProbe {
  return {
    format: "gif",
    declaredExtension: "gif",
    width,
    height,
    durationSec: 2.4,
    frameCount: 48,
    codec: null,
    decodable: true,
    rotationDegrees: 0,
  };
}

/**
 * The value keys each tool's presets own, and the runtime type each key's
 * reader expects.
 *
 * `colours` is a string because `gif-compressor-tool.tsx` reads it through
 * `stringValue`; a numeric `128` would fail that guard and fall back to 256.
 * `mp4-to-gif`'s `trimFrom`/`trimTo` are absent on purpose: the span is the
 * user's, and a chip click merges over it rather than replacing it.
 */
const SHAPES = {
  compressor: {
    quality: "number",
    colours: "string",
    width: "number",
    dropFrames: "boolean",
  },
  mp4ToGif: { width: "number", fps: "number", quality: "number" },
} as const;

function assertShape(
  presets: readonly ToolPreset[],
  shape: Readonly<Record<string, string>>,
  context: { probe: InputProbe | null },
) {
  for (const preset of presets) {
    const resolved = preset.resolve(context);
    expect(Object.keys(resolved).sort(), preset.id).toEqual(
      Object.keys(shape).sort(),
    );
    for (const [key, type] of Object.entries(shape)) {
      expect(typeof resolved[key], `${preset.id}.${key}`).toBe(type);
    }
  }
}

describe("gif-compressor presets", () => {
  it("resolves every control key, correctly typed, probe or no probe", () => {
    assertShape(COMPRESSOR_PRESETS, SHAPES.compressor, { probe: probeOf(480) });
    assertShape(COMPRESSOR_PRESETS, SHAPES.compressor, { probe: null });
  });

  it("reproduces today's default values from `balanced` with no probe", () => {
    // The byte-identical anchor. A visitor who touches nothing must get the
    // same job the pre-preset build ran.
    expect(COMPRESSOR_DEFAULT_VALUES).toEqual({
      quality: 80,
      colours: "256",
      width: COMPRESSOR_WIDTH_FALLBACK,
      dropFrames: false,
    });
  });

  it("keeps the source width on the default path, on and off the ladder", () => {
    // 499 is not a `WIDTH_LADDER` rung. Snapping it to 480 is the regression
    // the deleted ladder-snapping rule would have shipped.
    for (const width of [499, 480, 500, 1024]) {
      const balanced = presetById(
        { items: COMPRESSOR_PRESETS, defaultId: "balanced", legend: "", labels: {} },
        "balanced",
      );
      expect(balanced!.resolve({ probe: probeOf(width) }).width).toBe(width);
    }
  });

  it("never resolves below the slider floor", () => {
    for (const preset of COMPRESSOR_PRESETS) {
      const width = preset.resolve({ probe: probeOf(64, 64) }).width;
      expect(width, preset.id).toBeGreaterThanOrEqual(COMPRESSOR_WIDTH_MIN);
    }
  });

  it("gives each preset a distinct meaning", () => {
    const probe = { probe: probeOf(800, 600) };
    const seen = COMPRESSOR_PRESETS.map((preset) =>
      JSON.stringify(preset.resolve(probe)),
    );
    expect(new Set(seen).size).toBe(COMPRESSOR_PRESETS.length);
  });

  it("never caps the palette, on any preset", () => {
    // A capped palette pins the encoder to `gifenc`, which `calibration.json`
    // measured *larger* than gifski at quality 80 on five of seven fixtures —
    // and it disables the Quality slider, removing the lever that does work.
    // A preset that shipped a cap would be a "smaller file" button that grows
    // the file, so this is asserted rather than left to review.
    for (const preset of COMPRESSOR_PRESETS) {
      expect(preset.resolve({ probe: probeOf(480) }).colours, preset.id).toBe(
        "256",
      );
    }
  });

  it("moves quality and nothing else", () => {
    // The chips promise an output-size trade, not a different GIF. Changing the
    // width or the frame count under a chip click is a change to what the file
    // *is*, and both stay one deliberate control edit away.
    const context = { probe: probeOf(480) };
    const [smallest, balanced, sharpest] = COMPRESSOR_PRESETS.map((preset) =>
      preset.resolve(context),
    );

    for (const key of ["colours", "width", "dropFrames"] as const) {
      expect(smallest![key], key).toEqual(balanced![key]);
      expect(sharpest![key], key).toEqual(balanced![key]);
    }

    // Monotone, so the row reads left-to-right as smaller → larger.
    expect(Number(smallest!.quality)).toBeLessThan(Number(balanced!.quality));
    expect(Number(sharpest!.quality)).toBeGreaterThan(Number(balanced!.quality));
  });
});

describe("mp4-to-gif presets", () => {
  it("resolves every control key, correctly typed, on both device columns", () => {
    for (const mobile of [false, true]) {
      assertShape(mp4ToGifPresets(mobile), SHAPES.mp4ToGif, {
        probe: probeOf(1920, 1080),
      });
      assertShape(mp4ToGifPresets(mobile), SHAPES.mp4ToGif, { probe: null });
    }
  });

  it("matches the page's own device profile on `balanced`", () => {
    // The profile and the default chip are the same row, so they cannot drift.
    for (const [mobile, profile] of [
      [false, MP4_DESKTOP_DEFAULTS],
      [true, MP4_MOBILE_DEFAULTS],
    ] as const) {
      const balanced = mp4ToGifPresets(mobile).find((p) => p.id === "balanced");
      const resolved = balanced!.resolve({ probe: null });
      expect(resolved.width).toBe(profile.width);
      expect(resolved.fps).toBe(profile.fps);
    }
  });

  it("never asks for more width than the source has", () => {
    // The engine does not upscale; a 240 px clip asked for 480 is downgraded.
    for (const preset of mp4ToGifPresets(false)) {
      expect(preset.resolve({ probe: probeOf(240, 135) }).width, preset.id).toBe(
        240,
      );
    }
  });

  it("gives each preset a distinct meaning on both columns", () => {
    for (const mobile of [false, true]) {
      const seen = mp4ToGifPresets(mobile).map((preset) =>
        JSON.stringify(preset.resolve({ probe: probeOf(1920, 1080) })),
      );
      expect(new Set(seen).size, String(mobile)).toBe(3);
    }
  });

  it("moves fps and quality rather than width on `smoothest`", () => {
    const [smallest, balanced, smoothest] = mp4ToGifPresets(false);
    const at = (preset: ToolPreset) => preset.resolve({ probe: null });
    expect(at(smoothest!).width).toBe(at(balanced!).width);
    expect(at(smoothest!).fps).toBeGreaterThan(Number(at(balanced!).fps));
    expect(at(smallest!).fps).toBeLessThan(Number(at(balanced!).fps));
  });
});

/**
 * The two links to the outside that stop this file from testing itself.
 *
 * `SHAPES` above is hand-written, so on its own it would pass forever no matter
 * what the tools actually render. These tie the tables to the one artefact that
 * is always edited when a control or a chip changes: the hand-written copy.
 */
describe("the tables agree with the hand-written copy", () => {
  const CASES = [
    {
      slug: "gif-compressor",
      content: compressorContent as unknown as ToolContent,
      presets: COMPRESSOR_PRESETS,
      // Copy-only entries in `controls`, not controls in their own right: the
      // compressor swaps Quality's label and hint at runtime depending on which
      // encoder the palette selected.
      copyOnly: ["qualityCappedPalette", "qualityPaletteEncoder"],
      // Value keys no preset owns, and deliberately: the trim span is the
      // visitor's, and a chip merges over it rather than replacing it.
      unowned: [] as string[],
    },
    {
      slug: "mp4-to-gif",
      content: mp4Content as unknown as ToolContent,
      presets: mp4ToGifPresets(false),
      copyOnly: [] as string[],
      unowned: ["trim"],
    },
  ];

  it("labels exactly the presets that exist", () => {
    // `PresetChips` falls back to the raw id when a label is missing, so a
    // typo'd key ships "smallest" to a visitor as visible copy.
    for (const { slug, content, presets } of CASES) {
      const labelled = Object.keys(content.presetChips?.labels ?? {}).sort();
      expect(labelled, slug).toEqual(presets.map((preset) => preset.id).sort());
    }
  });

  it("resolves every control the tool writes copy for", () => {
    // Adding a control means writing its label and hint. This is what makes
    // that edit fail the suite until the presets learn about it too.
    for (const { slug, content, presets, copyOnly, unowned } of CASES) {
      const expected = Object.keys(content.controls)
        .filter((id) => !copyOnly.includes(id) && !unowned.includes(id))
        .sort();
      for (const preset of presets) {
        expect(
          Object.keys(preset.resolve({ probe: null })).sort(),
          `${slug}.${preset.id}`,
        ).toEqual(expected);
      }
    }
  });
});

describe("presetById", () => {
  it("returns undefined for a tool with no table, and for a custom intent", () => {
    // This is how the seven preset-less tools reach today's `valuesForProbe`
    // line: not by an assertion that they are unchanged, but by falling through.
    expect(presetById(undefined, "balanced")).toBeUndefined();
    expect(
      presetById(
        { items: COMPRESSOR_PRESETS, defaultId: "balanced", legend: "", labels: {} },
        null,
      ),
    ).toBeUndefined();
  });
});
