/**
 * Admission control: what a device can be asked to encode.
 *
 * ── Why the budget is frame-buffer bytes, never input file size ──────────────
 * A 2 MB GIF and a 2 MB MP4 place wildly different demands on memory, and
 * neither number predicts the one that matters. The binding constraint is
 * decoded RGBA held resident:
 *
 *     peak ~= 2 x frames x width x height x 4
 *
 * The factor of two is gifski's, and it is not avoidable from the JS side: the
 * glue concatenates every frame into one array, then copies that array again
 * into the WASM heap. `resizeWidth` does not help — it resizes *after* the
 * full-size buffer is already in the heap — so downscaling has to happen in JS
 * before the encoder is called.
 *
 * Because the encoder cannot stream, the budget has to be enforced **before**
 * decoding starts. Catching an OOM afterwards is not a fallback; on iOS it is a
 * killed tab and a lost file with no message.
 *
 * ── Provenance of the numbers ───────────────────────────────────────────────
 * The tier budgets below are the research report's starting estimates, derived
 * from published iOS Safari page-crash thresholds (~100 MB on an iPhone SE 3,
 * ~200 MB on an iPad 8) minus headroom for the DOM, ad iframes and the separate
 * canvas allocation bucket.
 *
 * **They are estimates, and the mobile tiers are still unmeasured.** Phase 1
 * gates G3 and G4 exist to replace them with figures measured on real hardware;
 * the desktop tiers are measurable in the harness, the mobile ones are not
 * without the devices. Anything still carrying `measured: false` when a limit is
 * shown to a user is a number we made up, and the copy must not present it as
 * a device fact.
 */

export type DeviceTier =
  | "desktop"
  | "desktop-low-ram"
  | "android-mobile"
  | "ios";

export interface TierBudget {
  tier: DeviceTier;
  /** Frame-buffer budget in bytes, already including gifski's 2x factor. */
  budgetBytes: number;
  defaultMaxWidth: number;
  hardMaxFrames: number;
  /** False until a gate has measured this tier on real hardware. */
  measured: boolean;
}

export const TIER_BUDGETS: Record<DeviceTier, TierBudget> = {
  desktop: {
    tier: "desktop",
    budgetBytes: 500 * 1024 * 1024,
    defaultMaxWidth: 640,
    hardMaxFrames: 900,
    measured: false,
  },
  "desktop-low-ram": {
    tier: "desktop-low-ram",
    budgetBytes: 200 * 1024 * 1024,
    defaultMaxWidth: 480,
    hardMaxFrames: 400,
    measured: false,
  },
  "android-mobile": {
    tier: "android-mobile",
    budgetBytes: 120 * 1024 * 1024,
    defaultMaxWidth: 480,
    hardMaxFrames: 230,
    measured: false,
  },
  ios: {
    tier: "ios",
    budgetBytes: 30 * 1024 * 1024,
    defaultMaxWidth: 480,
    hardMaxFrames: 57,
    measured: false,
  },
};

/**
 * Classifies the current device.
 *
 * iOS is detected by touch capability rather than by `deviceMemory`, because
 * Safari does not implement `deviceMemory` at all — so an iPad, which reports
 * itself as a Mac, would otherwise be classified desktop and handed a budget
 * seventeen times what it can survive.
 */
export function detectTier(): DeviceTier {
  if (typeof navigator === "undefined") return "desktop";

  const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? "");
  const touchPoints = navigator.maxTouchPoints ?? 0;
  if (isApple && touchPoints > 0) return "ios";

  const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;

  const isMobile = touchPoints > 0 && /Android|Mobile/.test(navigator.userAgent);
  if (isMobile) return "android-mobile";

  if (typeof deviceMemory === "number" && deviceMemory <= 4) {
    return "desktop-low-ram";
  }
  return "desktop";
}

/** Bytes held resident to encode this many frames at this size. */
export function frameBufferBytes(
  frames: number,
  width: number,
  height: number,
): number {
  return 2 * frames * width * height * 4;
}

export interface EncodePlan {
  fps: number;
  width: number;
  height: number;
  frames: number;
  bytes: number;
  /** True when the plan is below what the caller originally asked for. */
  downgraded: boolean;
}

/**
 * The rungs admission control walks, largest first.
 *
 * Exported because `plan.ts` searches the same ladders for real jobs while this
 * file's `planEncode()` remains the shape gate G8 measured the refusal rate
 * against. Two private copies would let the measured number and the shipped
 * behaviour drift apart silently.
 */
export const FPS_LADDER = [20, 15, 12, 10, 8] as const;
export const WIDTH_LADDER = [640, 480, 400, 320, 240] as const;

/**
 * Finds the largest settings that fit the budget, or null if nothing does.
 *
 * Returning null is a real product state, not an error: the honest response is
 * to refuse before decoding and say which concrete change would make it fit —
 * trim the clip, drop the width — rather than to start work that will kill the
 * tab. G8 exists to measure how often this happens on a realistic corpus,
 * because a refusal rate the operator only discovers after launch is a product
 * decision taken by accident.
 */
export function planEncode(
  durationSec: number,
  sourceWidth: number,
  sourceHeight: number,
  budget: TierBudget,
  requested?: { fps?: number; width?: number },
): EncodePlan | null {
  const wantedFps = requested?.fps ?? FPS_LADDER[0];
  const wantedWidth = requested?.width ?? budget.defaultMaxWidth;

  const fpsOptions = [wantedFps, ...FPS_LADDER.filter((f) => f < wantedFps)];
  const widthOptions = [
    Math.min(wantedWidth, budget.defaultMaxWidth),
    ...WIDTH_LADDER.filter((w) => w < Math.min(wantedWidth, budget.defaultMaxWidth)),
  ];

  for (const fps of fpsOptions) {
    for (const width of widthOptions) {
      const height = Math.max(
        2,
        Math.round((width * sourceHeight) / sourceWidth) & ~1,
      );
      const frames = Math.max(1, Math.ceil(durationSec * fps));
      if (frames > budget.hardMaxFrames) continue;

      const bytes = frameBufferBytes(frames, width, height);
      if (bytes <= budget.budgetBytes) {
        return {
          fps,
          width,
          height,
          frames,
          bytes,
          downgraded: fps !== wantedFps || width !== wantedWidth,
        };
      }
    }
  }

  return null;
}
