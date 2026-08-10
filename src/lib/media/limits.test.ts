import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  detectTier,
  frameBufferBytes,
  planEncode,
  TIER_BUDGETS,
  type DeviceTier,
} from "./limits";

/**
 * `planEncode` is pure and deterministic, so gate G8's refusal-rate measurement
 * does not need a browser. Running it here instead of in Playwright makes it
 * seconds rather than minutes, and it stays runnable in CI on every change —
 * which matters, because the refusal rate is a *product* number and it must not
 * be allowed to drift silently when a budget or a ladder is edited.
 */

/**
 * A corpus of realistic input shapes.
 *
 * **Modelled, not measured.** These are plausible real-world dimensions and
 * durations for phone captures, screen recordings and downloaded GIFs; they are
 * not a sample of what PZGIF's actual users will upload, because no such sample
 * exists before launch. The refusal rates below are therefore a property of this
 * corpus, and the report must say so rather than presenting them as observed
 * user behaviour.
 */
const CORPUS: Array<{ label: string; sec: number; w: number; h: number }> = [
  // Phone video, portrait — the single most common real upload.
  { label: "iphone-portrait-5s", sec: 5, w: 1080, h: 1920 },
  { label: "iphone-portrait-15s", sec: 15, w: 1080, h: 1920 },
  { label: "iphone-portrait-30s", sec: 30, w: 1080, h: 1920 },
  { label: "iphone-portrait-60s", sec: 60, w: 1080, h: 1920 },
  { label: "android-portrait-10s", sec: 10, w: 720, h: 1280 },
  { label: "android-portrait-45s", sec: 45, w: 1080, h: 1920 },
  // Phone video, landscape.
  { label: "phone-landscape-8s", sec: 8, w: 1920, h: 1080 },
  { label: "phone-landscape-20s", sec: 20, w: 1920, h: 1080 },
  { label: "phone-4k-10s", sec: 10, w: 3840, h: 2160 },
  // Screen recordings — the second big category, usually longer.
  { label: "screen-720p-10s", sec: 10, w: 1280, h: 720 },
  { label: "screen-1080p-15s", sec: 15, w: 1920, h: 1080 },
  { label: "screen-1080p-60s", sec: 60, w: 1920, h: 1080 },
  { label: "screen-1440p-20s", sec: 20, w: 2560, h: 1440 },
  { label: "screen-macbook-30s", sec: 30, w: 1512, h: 982 },
  // Game clips and captures.
  { label: "gameclip-30s", sec: 30, w: 1920, h: 1080 },
  { label: "gameclip-15s", sec: 15, w: 1280, h: 720 },
  // Existing GIFs re-uploaded for compression, expressed as duration x size.
  { label: "gif-reaction-2s", sec: 2, w: 480, h: 270 },
  { label: "gif-reaction-4s", sec: 4, w: 500, h: 500 },
  { label: "gif-meme-6s", sec: 6, w: 640, h: 360 },
  { label: "gif-long-15s", sec: 15, w: 800, h: 600 },
  { label: "gif-tiny-1s", sec: 1, w: 320, h: 240 },
  { label: "gif-square-3s", sec: 3, w: 600, h: 600 },
  { label: "gif-tall-5s", sec: 5, w: 405, h: 720 },
  // Webcam and conferencing exports.
  { label: "webcam-720p-12s", sec: 12, w: 1280, h: 720 },
  { label: "webcam-480p-25s", sec: 25, w: 854, h: 480 },
  // Drone and action cameras — long and large, the worst case.
  { label: "action-1080p-40s", sec: 40, w: 1920, h: 1080 },
  { label: "action-4k-20s", sec: 20, w: 3840, h: 2160 },
  // Short social clips.
  { label: "social-square-7s", sec: 7, w: 1080, h: 1080 },
  { label: "social-vertical-12s", sec: 12, w: 1080, h: 1920 },
  { label: "social-wide-9s", sec: 9, w: 1280, h: 536 },
];

describe("frameBufferBytes", () => {
  it("doubles the RGBA total, because gifski holds a second copy", () => {
    // 10 frames of 100x100 RGBA is 400,000 bytes once, 800,000 resident.
    expect(frameBufferBytes(10, 100, 100)).toBe(800_000);
  });
});

describe("planEncode", () => {
  it("refuses rather than returning an over-budget plan", () => {
    const plan = planEncode(60, 1920, 1080, TIER_BUDGETS.ios);
    if (plan) expect(plan.bytes).toBeLessThanOrEqual(TIER_BUDGETS.ios.budgetBytes);
  });

  it("never returns a plan that exceeds the tier's hard frame cap", () => {
    for (const budget of Object.values(TIER_BUDGETS)) {
      for (const item of CORPUS) {
        const plan = planEncode(item.sec, item.w, item.h, budget);
        if (plan) expect(plan.frames).toBeLessThanOrEqual(budget.hardMaxFrames);
      }
    }
  });

  it("produces even output dimensions, which H.264 requires", () => {
    for (const item of CORPUS) {
      const plan = planEncode(item.sec, item.w, item.h, TIER_BUDGETS.desktop);
      if (plan) expect(plan.height % 2).toBe(0);
    }
  });

  it("marks a plan as downgraded only when it is below what was asked", () => {
    const plan = planEncode(2, 640, 360, TIER_BUDGETS.desktop, {
      fps: 20,
      width: 640,
    });
    expect(plan).not.toBeNull();
    expect(plan!.fps).toBe(20);
    expect(plan!.width).toBe(640);
    expect(plan!.downgraded).toBe(false);
  });

  /**
   * G8. `phase-01` pre-commits a decision point: an iOS refusal rate above ~30%
   * is a product decision that must reach the operator **before Phase 5**, not
   * after launch. This test does not enforce a threshold — the number is the
   * deliverable — but it fails if the shape of the answer becomes unreportable.
   */
  it("G8: reports refusal and downgrade rates per tier", () => {
    const report: Record<string, unknown> = {};

    for (const tier of Object.keys(TIER_BUDGETS) as DeviceTier[]) {
      const budget = TIER_BUDGETS[tier];
      const outcomes = CORPUS.map((item) => ({
        label: item.label,
        plan: planEncode(item.sec, item.w, item.h, budget, {
          fps: 20,
          width: 640,
        }),
      }));

      const refused = outcomes.filter((o) => o.plan === null);
      const downgraded = outcomes.filter((o) => o.plan?.downgraded);

      report[tier] = {
        budgetMb: budget.budgetBytes / 1024 / 1024,
        measured: budget.measured,
        total: outcomes.length,
        refused: refused.length,
        refusedPct: +((refused.length / outcomes.length) * 100).toFixed(1),
        downgraded: downgraded.length,
        downgradedPct: +((downgraded.length / outcomes.length) * 100).toFixed(1),
        refusedLabels: refused.map((o) => o.label),
      };
    }

    // Written out rather than asserted: this is a measurement whose value is
    // the number, and an assertion would only encode today's answer as
    // tomorrow's expectation. The artefact is what the Phase 1 report reads.
    mkdirSync("bench-results", { recursive: true });
    writeFileSync(
      "bench-results/g8-refusal-rates.json",
      JSON.stringify(
        {
          gate: "G8",
          corpusSize: CORPUS.length,
          corpusProvenance:
            "Modelled input shapes, not observed uploads. The rates below are a property of this corpus.",
          requested: { fps: 20, width: 640 },
          tiers: report,
        },
        null,
        2,
      ) + "\n",
    );

    for (const tier of Object.keys(TIER_BUDGETS)) {
      expect(report[tier]).toBeDefined();
    }
  });
});

/**
 * Tier detection decides the memory budget, and the budget decides whether a job
 * runs at all. The costly direction is one-sided: classifying a desktop as iOS
 * hands it a smaller budget than it needed, while classifying an iPhone as a
 * desktop hands it seventeen times what it can survive — and the failure there
 * is a killed tab with no message.
 */
describe("detectTier", () => {
  const original = globalThis.navigator;

  function withNavigator(
    fields: { platform?: string; maxTouchPoints?: number; userAgent?: string; deviceMemory?: number },
    assert: () => void,
  ) {
    Object.defineProperty(globalThis, "navigator", {
      value: { platform: "", maxTouchPoints: 0, userAgent: "", ...fields },
      configurable: true,
    });
    try {
      assert();
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: original,
        configurable: true,
      });
    }
  }

  it("classifies an iPhone from its user-agent when touch reports zero", () => {
    // Emulated mobile contexts report `maxTouchPoints: 0`, and so does an iPhone
    // in some privacy configurations. The user-agent still says iPhone.
    withNavigator(
      {
        platform: "MacIntel",
        maxTouchPoints: 0,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      },
      () => expect(detectTier()).toBe("ios"),
    );
  });

  it("classifies an iPad from touch, which is all it gives away", () => {
    // iPadOS reports itself as a Macintosh outright — no `iPad` anywhere in the
    // string — so touch is the only signal left.
    withNavigator(
      {
        platform: "MacIntel",
        maxTouchPoints: 5,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      },
      () => expect(detectTier()).toBe("ios"),
    );
  });

  it("leaves a desktop Mac alone", () => {
    withNavigator(
      {
        platform: "MacIntel",
        maxTouchPoints: 0,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      },
      () => expect(detectTier()).toBe("desktop"),
    );
  });

  it("classifies an Android phone", () => {
    withNavigator(
      {
        platform: "Linux armv8l",
        maxTouchPoints: 5,
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
      },
      () => expect(detectTier()).toBe("android-mobile"),
    );
  });

  it("drops a low-memory desktop to its own tier", () => {
    withNavigator(
      {
        platform: "Win32",
        maxTouchPoints: 0,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        deviceMemory: 4,
      },
      () => expect(detectTier()).toBe("desktop-low-ram"),
    );
  });
});
