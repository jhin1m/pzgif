/**
 * The tier is the single most consequential number in the engine — it decides
 * what is refused — and the worker cannot work it out for itself. These tests
 * pin down that contract, because the failure mode is silent: `maxTouchPoints`
 * is `undefined` in a worker rather than throwing, so an iPhone would simply be
 * handed a desktop budget and the tab would die during decode.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  configureTier,
  detectCapabilities,
  fallbackEncoder,
  resetCapabilities,
  resolveEncoder,
} from "./capability";
import { TIER_BUDGETS } from "./limits";

afterEach(() => resetCapabilities());

describe("configureTier", () => {
  it("overrides whatever the environment would have guessed", () => {
    configureTier("ios");
    expect(detectCapabilities().tier).toBe("ios");
  });

  it("turns video input off on iOS", () => {
    // Ratified 2026-08-05: on iOS the GIF tools ship, video-to-GIF does not.
    configureTier("ios");
    expect(detectCapabilities().videoInput).toBe(false);
    expect(detectCapabilities().ffmpegFallback).toBe(false);
  });

  it("selects the budget the refusal rate was measured against", () => {
    configureTier("ios");
    expect(TIER_BUDGETS[detectCapabilities().tier].budgetBytes).toBe(30 * 1024 * 1024);
  });
});

describe("resolveEncoder", () => {
  const base = { ...detectCapabilities() };

  it("honours an explicit request above everything else", () => {
    expect(resolveEncoder("gifenc", { ...base, engine: "blink" })).toBe("gifenc");
    expect(resolveEncoder("gifski", { ...base, engine: "gecko" })).toBe("gifski");
  });

  it("routes Firefox to gifenc", () => {
    // gifski's WASM measured 12-14x slower under SpiderMonkey — 51.8 s against a
    // 30 s viability floor — while gifenc ran at parity on all three engines.
    expect(resolveEncoder(undefined, { ...base, engine: "gecko" })).toBe("gifenc");
    expect(resolveEncoder(undefined, { ...base, engine: "blink" })).toBe("gifski");
    expect(resolveEncoder(undefined, { ...base, engine: "webkit" })).toBe("gifski");
  });

  it("always has another encoder to fall back to", () => {
    expect(fallbackEncoder("gifski")).toBe("gifenc");
    expect(fallbackEncoder("gifenc")).toBe("gifski");
  });
});
