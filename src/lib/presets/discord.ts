/**
 * What Discord actually accepts, per surface.
 *
 * ── Why this file exists rather than four constants ─────────────────────────
 * Both `docs/design-guidelines.md` §10 and `docs/wireframe/discord-preset.html`
 * shipped wrong numbers, and one of them — a "Banner 680×240" that matches no
 * Discord surface at all — would have produced a file Discord letterboxes on
 * every upload while the page claimed "Fits Discord ✓". A promise a visitor can
 * disprove in ten seconds is worse than no promise. So every figure lives here,
 * once, with the source that establishes it and the date it was last read.
 *
 * ── The two rules the shape enforces ────────────────────────────────────────
 *
 *  1. **There is no shared byte budget.** `byteLimit` is per preset, and the type
 *     makes a single `MAX_BYTES` impossible to write: emoji is 256 KB, sticker is
 *     512 KB, and two of the four surfaces have no published limit at all. The
 *     wireframe's "must land under 256 KB" was one number doing four jobs.
 *
 *  2. **`byteLimit: null` is a real answer, not a missing one.** Discord
 *     publishes no maximum file size for server banners, avatars or server
 *     icons. Inventing one — the wireframe's "≤10 MB" — states a device fact
 *     nobody measured. `targetBytes` is what the search aims at instead, and it
 *     is *ours*: it may be used to steer auto-fit and must never be rendered as
 *     Discord's rule. Only `byteLimit` may be called a limit in the UI.
 *
 * ── These numbers move ──────────────────────────────────────────────────────
 * The emoji article changed on 2026-07-30 and the sticker and banner articles on
 * 2026-08-04, inside a fortnight. Re-verify before every content refresh and move
 * `verifiedOn` when you do — the pages render that date rather than promising to
 * keep up, because a maintenance promise is unkeepable for a solo operator on
 * figures that churn this fast.
 */

export type DiscordPresetId = "emoji" | "sticker" | "banner" | "avatar";

/**
 * Where a figure came from. Rendered, not decorative.
 *
 * `community` values are widely-repeated conventions that Discord has never
 * documented. They are useful — the keyword traffic for them is real — but the
 * page has to label them as conventions, which is what this discriminates.
 */
export type FigureSource = "discord" | "community";

export interface DiscordPreset {
  readonly id: DiscordPresetId;
  /** Output width in pixels. */
  readonly width: number;
  readonly height: number;
  readonly dimensionsSource: FigureSource;
  /**
   * True when Discord rejects anything other than exactly these dimensions.
   *
   * Only the sticker pipeline does. Everything else is scaled on display, so the
   * dimensions are a recommendation the preset honours rather than a gate — but
   * an `exact` preset must produce the size even when that means scaling a small
   * source up, because a 200×200 sticker is refused at upload.
   */
  readonly dimensionsExact: boolean;
  /**
   * Discord's published maximum, in bytes, or **null when it publishes none.**
   *
   * Null is the honest state for three of the four surfaces. Nothing may render
   * a number here that Discord did not state.
   */
  readonly byteLimit: number | null;
  /**
   * What auto-fit aims at. Always ours, never presented as Discord's.
   *
   * Where `byteLimit` exists this sits a little under it, so a search that
   * succeeds has margin rather than landing on the ceiling. Where it does not,
   * this is simply a sane size for the surface.
   */
  readonly targetBytes: number;
  /** Hard cap Discord enforces on animation length, in seconds. Sticker only. */
  readonly maxDurationSec: number | null;
  /** Hard cap Discord enforces on frame rate. Sticker only. */
  readonly maxFps: number | null;
  /** The page that establishes the figures above. */
  readonly sourceUrl: string;
  /** ISO date these figures were last read from `sourceUrl`. */
  readonly verifiedOn: string;
}

const KB = 1024;

/**
 * Emoji — the only surface where both locked documents were already right.
 *
 * 128×128 is a recommendation: Discord scales anything larger down on display,
 * so extra pixels spend budget and buy nothing. The 256 KB ceiling is published
 * and is the one figure in this file that has never been in dispute.
 */
const EMOJI: DiscordPreset = {
  id: "emoji",
  width: 128,
  height: 128,
  dimensionsSource: "discord",
  dimensionsExact: false,
  byteLimit: 256 * KB,
  targetBytes: 240 * KB,
  maxDurationSec: null,
  maxFps: null,
  sourceUrl: "https://support.discord.com/hc/en-us/articles/360036479811",
  verifiedOn: "2026-08-04",
};

/**
 * Sticker — the surface with the most rules and the least documentation
 * elsewhere.
 *
 * `design-guidelines.md` §10 put this at 256 KB, which is half the real budget,
 * and **both** locked documents omit the five-second and sixty-frame-per-second
 * caps entirely. Those two are hard rejection criteria at upload, so a preset
 * that ignores them produces a file that fails after the user has done all the
 * work — the exact failure this cluster exists to prevent.
 */
const STICKER: DiscordPreset = {
  id: "sticker",
  width: 320,
  height: 320,
  dimensionsSource: "discord",
  dimensionsExact: true,
  byteLimit: 512 * KB,
  targetBytes: 480 * KB,
  maxDurationSec: 5,
  maxFps: 60,
  sourceUrl: "https://support.discord.com/hc/en-us/articles/4402687377815",
  verifiedOn: "2026-08-04",
};

/**
 * Server banner — 960×540, and the reason `680×240` had to go.
 *
 * 680×240 matches no Discord surface. It is almost certainly a corruption of the
 * 600×240 figure the community quotes for *profile* banners, which is a
 * different surface with different dimensions that Discord documents nowhere.
 * This preset targets the one banner Discord does publish.
 *
 * No byte limit is published. The five-second target is not arbitrary either:
 * a server banner animates for roughly five seconds on load and then holds a
 * still frame, so anything past that is bytes nobody sees.
 */
const BANNER: DiscordPreset = {
  id: "banner",
  width: 960,
  height: 540,
  dimensionsSource: "discord",
  dimensionsExact: false,
  byteLimit: null,
  targetBytes: 5 * 1024 * KB,
  maxDurationSec: 5,
  maxFps: null,
  sourceUrl: "https://support.discord.com/hc/en-us/articles/360028716472",
  verifiedOn: "2026-08-04",
};

/**
 * Avatar — 128×128, and nothing else is documented.
 *
 * §10 gave this a 256 KB limit, which is the emoji figure borrowed. Discord
 * publishes no byte maximum for avatars, so this one aims at a size that uploads
 * comfortably and the page says outright that the number is ours.
 */
const AVATAR: DiscordPreset = {
  id: "avatar",
  width: 128,
  height: 128,
  dimensionsSource: "discord",
  dimensionsExact: false,
  byteLimit: null,
  targetBytes: 512 * KB,
  maxDurationSec: null,
  maxFps: null,
  sourceUrl: "https://support.discord.com/hc/en-us/articles/204156688",
  verifiedOn: "2026-08-04",
};

/** Every preset, in the order the hub's chip picker offers them. */
export const DISCORD_PRESETS: readonly DiscordPreset[] = [
  EMOJI,
  STICKER,
  BANNER,
  AVATAR,
] as const;

const BY_ID = new Map(DISCORD_PRESETS.map((preset) => [preset.id, preset]));

export function getPreset(id: DiscordPresetId): DiscordPreset {
  const preset = BY_ID.get(id);
  // Unreachable through the typed API. Thrown rather than defaulted because a
  // silent fallback to emoji would hand a sticker page the wrong byte budget,
  // which is the one class of bug this whole file exists to make impossible.
  if (!preset) throw new Error(`Unknown Discord preset "${id}"`);
  return preset;
}

/**
 * The size the search must beat.
 *
 * `byteLimit` where Discord published one, our own target where it did not. The
 * distinction matters at the point of *rendering* — see `SizeBudgetBar`, which
 * words itself differently for the two — but for the search itself a ceiling is
 * a ceiling.
 */
export function budgetBytes(preset: DiscordPreset): number {
  return preset.byteLimit ?? preset.targetBytes;
}

/**
 * The registry slug each preset has a dedicated page at.
 *
 * Kept here rather than on the preset itself so `discord.ts` stays a statement
 * about Discord and not about this site's routing — the numbers above are the
 * part that has to survive a re-verification, and a route table churning
 * alongside them would make that diff harder to read.
 */
export const PRESET_ROUTE_SLUGS: Readonly<Record<DiscordPresetId, string>> = {
  emoji: "discord-emoji-gif",
  sticker: "discord-sticker-gif",
  banner: "discord-banner-gif",
  avatar: "discord-avatar-gif",
};

/**
 * The centre crop that gives `sourceWidth × sourceHeight` the preset's aspect
 * ratio, in source pixels.
 *
 * Cropping rather than letterboxing is a decision about what Discord does next:
 * every one of these surfaces crops or scales to its own shape on upload, so a
 * preview that already shows the cropped result is what the user will actually
 * see. It is a *centre* crop because there is no region picker on this page —
 * the related-tools block points at `crop-gif` for anyone who needs to choose.
 *
 * Returns null when the source already has the target aspect ratio, so the
 * common square-to-square case adds no crop stage to the pipeline at all.
 */
export function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  preset: DiscordPreset,
): { x: number; y: number; width: number; height: number } | null {
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = preset.width / preset.height;
  // A pixel of slack. Rounding a 499×281 source to 16:9 lands a fraction off and
  // a crop that shaves one column off each edge is pure loss.
  if (Math.abs(sourceRatio - targetRatio) < 0.005) return null;

  if (sourceRatio > targetRatio) {
    const width = Math.max(1, Math.round(sourceHeight * targetRatio));
    return {
      x: Math.max(0, Math.round((sourceWidth - width) / 2)),
      y: 0,
      width: Math.min(width, sourceWidth),
      height: sourceHeight,
    };
  }

  const height = Math.max(1, Math.round(sourceWidth / targetRatio));
  return {
    x: 0,
    y: Math.max(0, Math.round((sourceHeight - height) / 2)),
    width: sourceWidth,
    height: Math.min(height, sourceHeight),
  };
}
