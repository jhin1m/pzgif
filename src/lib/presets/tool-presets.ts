import type { ControlValues } from "@/components/tool/settings/control-schema";
import type { InputProbe } from "@/lib/media/types";

/**
 * Named starting points for the two tools whose controls have a small↔sharp axis.
 *
 * ── Why a preset returns *every* key ───────────────────────────────────────
 * `SettingsForm` renders a slider as `numberValue(values, id, control.min)`
 * while a page's `buildSpec` reads `numberValue(current, "quality", 80)`. A
 * preset that omitted `quality` would therefore display **1** and run **80** —
 * the displayed-versus-executed divergence this whole feature exists to stop.
 * `colours` is worse: the compressor reads it through `stringValue`, so a
 * numeric `128` fails the type guard and falls back to 256, disabling the
 * preset silently and completely.
 *
 * So the rule is: a preset resolves to every value key it owns, with the
 * runtime type that key's reader expects. A control that a preset makes
 * irrelevant is expressed through `ControlDef.disabled` and the page's own
 * copy — never by leaving the key out. `tool-presets.test.ts` asserts key-set
 * *equality*, so adding a control without updating the presets is a test
 * failure rather than a silent 1-versus-80.
 *
 * ── Why nothing snaps to the ladder ────────────────────────────────────────
 * Admission control does not silently round a requested width down to
 * `WIDTH_LADDER`. `plan.ts` puts the requested width first and only walks rungs
 * strictly *below* it, so an off-ladder width that fits the budget is honoured
 * verbatim. Snapping here would downscale a 500 px GIF to 480 on the
 * compressor's untouched default path, which is a regression dressed as tidiness.
 *
 * ── Why the device never reaches this file ─────────────────────────────────
 * `mp4-to-gif` is the only tool whose values depend on the device tier, and it
 * already holds the tier. It picks its column here and hands the workbench a
 * resolved table, so no component below it grows a capabilities dependency it
 * did not have.
 */

/** Everything a preset is allowed to know. The probe is null until it answers. */
export interface PresetContext {
  readonly probe: InputProbe | null;
}

export interface ToolPreset {
  /** Stable — it is the chip's `data-preset` and the content file's label key. */
  readonly id: string;
  /**
   * The values this preset means, for this file.
   *
   * Merged over the current values by the caller rather than replacing them, so
   * a key no preset owns — `mp4-to-gif`'s trim span — survives a chip click.
   */
  resolve(context: PresetContext): ControlValues;
}

/** A tool's whole chip row: the table, the default, and its hand-written copy. */
export interface ToolPresetGroup {
  readonly items: readonly ToolPreset[];
  /** Restored by Reset, and by dropping a second file. */
  readonly defaultId: string;
  readonly legend: string;
  readonly labels: Readonly<Record<string, string>>;
}

export function presetById(
  group: ToolPresetGroup | undefined,
  id: string | null,
): ToolPreset | undefined {
  if (!group || id === null) return undefined;
  return group.items.find((preset) => preset.id === id);
}

/* ── gif-compressor ─────────────────────────────────────────────────────── */

/**
 * Width slider bounds, shared with the page so the two cannot disagree.
 *
 * The fallback is what the slider shows before the probe answers; the real
 * upper bound is the input's own width.
 */
export const COMPRESSOR_WIDTH_MIN = 120;
export const COMPRESSOR_WIDTH_FALLBACK = 1280;

/** The source width, or the pre-probe fallback, never below the slider floor. */
function sourceWidth(probe: InputProbe | null): number {
  return Math.max(COMPRESSOR_WIDTH_MIN, probe?.width ?? COMPRESSOR_WIDTH_FALLBACK);
}

/**
 * Quality is the only axis these three move, and that is a measured decision.
 *
 * ── Why no preset touches Colours ──────────────────────────────────────────
 * Capping the palette below 256 pins the encoder to `gifenc`, and `gifenc` is
 * worse per byte than gifski at every palette size that still looks acceptable.
 * `bench-results/calibration.json`, at 480 px over identical frames, gifski at
 * quality 80 against gifenc at 128 colours:
 *
 *     flat-art      214 KB → 304 KB   (+42%)
 *     clip-vp9      377 KB → 597 KB   (+59%)
 *     loop-large    625 KB → 696 KB   (+11%)
 *     screen-720p   476 KB → 520 KB   (+9%)
 *     odd-dims      356 KB → 369 KB   (+4%)
 *
 * Five of seven fixtures get *bigger*. A preset called "smaller file" that
 * reliably produces a larger one is the same class of dishonesty as a faked
 * progress bar, so the lever it pulls is the one that actually works. Colours
 * stays a manual control for the case it is genuinely for — a flat diagram
 * whose banding the visitor can see and accept — and never a preset default.
 *
 * The second cost is compounding: `colours < 256` also disables the Quality
 * slider, because Quality is gifski's dial and gifski's alone. So the old
 * `smallest` row simultaneously chose the weaker encoder and removed the strong
 * lever from the panel.
 *
 * ── Why quality alone, and not width or dropped frames ─────────────────────
 * Both of those change what the GIF *is* — its dimensions, its motion — and a
 * visitor who clicks a chip labelled by output size does not expect the frame
 * rate to halve. They stay one deliberate control edit away. On the same bench
 * the quality axis alone carries the saving: 80 → 40 is between -40% and -70%
 * on every fixture measured.
 *
 * `colours` is a **string** here, and that is not an oversight: the page reads
 * it with `stringValue` because it is a `<select>` whose options are strings.
 */
const COMPRESSOR_QUALITY = {
  /** Between the measured 40 and 60 points, both of which are large savings. */
  smaller: 50,
  /** Today's default. The byte-identical anchor for an untouched visit. */
  balanced: 80,
  best: 95,
} as const;

export const COMPRESSOR_PRESETS: readonly ToolPreset[] = [
  {
    id: "smallest",
    resolve: ({ probe }) => ({
      quality: COMPRESSOR_QUALITY.smaller,
      colours: "256",
      width: sourceWidth(probe),
      dropFrames: false,
    }),
  },
  {
    id: "balanced",
    resolve: ({ probe }) => ({
      quality: COMPRESSOR_QUALITY.balanced,
      colours: "256",
      // Source width unchanged. The page cannot read the device tier, so it
      // cannot honestly offer a width the engine's own cap would then reduce.
      width: sourceWidth(probe),
      dropFrames: false,
    }),
  },
  {
    id: "sharpest",
    resolve: ({ probe }) => ({
      quality: COMPRESSOR_QUALITY.best,
      colours: "256",
      width: sourceWidth(probe),
      dropFrames: false,
    }),
  },
];

/** What the compressor's controls mount with — the `balanced` row, pre-probe. */
export const COMPRESSOR_DEFAULT_VALUES: ControlValues =
  COMPRESSOR_PRESETS[1]!.resolve({ probe: null });

/* ── mp4-to-gif ─────────────────────────────────────────────────────────── */

interface Mp4Row {
  readonly width: number;
  readonly fps: number;
  readonly quality: number;
}

/**
 * Two columns, written out rather than derived from one another.
 *
 * The mobile column is not the desktop column scaled: at 480 px and 15 fps the
 * android tier's budget runs out under four seconds, which is below meme
 * length, so the tool would refuse almost everything it was offered.
 *
 * No row raises the width above `balanced`. The engine never upscales and the
 * tier's `defaultMaxWidth` caps it anyway, so a wider figure would only be
 * reduced again — `smoothest` trades frame rate and quality instead.
 */
const MP4_ROWS = {
  desktop: {
    smallest: { width: 320, fps: 10, quality: 70 },
    balanced: { width: 480, fps: 15, quality: 80 },
    smoothest: { width: 480, fps: 20, quality: 90 },
  },
  mobile: {
    smallest: { width: 240, fps: 8, quality: 70 },
    balanced: { width: 320, fps: 10, quality: 80 },
    smoothest: { width: 320, fps: 15, quality: 90 },
  },
} as const satisfies Record<string, Record<string, Mp4Row>>;

/**
 * The `balanced` row of each column, which is also the device profile the page
 * uses for its own fallbacks. One source, so the default chip and the default
 * value can never drift apart.
 */
export const MP4_DESKTOP_DEFAULTS = MP4_ROWS.desktop.balanced;
export const MP4_MOBILE_DEFAULTS = MP4_ROWS.mobile.balanced;

const MP4_PRESET_ORDER = ["smallest", "balanced", "smoothest"] as const;

/** Resolves the table for a device class. Called by the page, which knows it. */
export function mp4ToGifPresets(isMobileTier: boolean): readonly ToolPreset[] {
  const column = isMobileTier ? MP4_ROWS.mobile : MP4_ROWS.desktop;
  return MP4_PRESET_ORDER.map((id) => ({
    id,
    resolve: ({ probe }: PresetContext): ControlValues => {
      const row = column[id];
      return {
        // Never wider than the source: the engine does not upscale, so a 320 px
        // clip asked for 480 would only be downgraded again.
        width: probe ? Math.min(row.width, probe.width) : row.width,
        fps: row.fps,
        quality: row.quality,
      };
    },
  }));
}
