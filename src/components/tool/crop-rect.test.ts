import { describe, expect, it } from "vitest";
import {
  MIN_CROP_SIZE,
  applyAspect,
  aspectValue,
  clampCropRect,
  fullFrameRect,
  moveCropRect,
  resizeCropRect,
} from "./crop-rect";

/**
 * The crop rectangle's rules, checked without a browser.
 *
 * These are the invariants three separate input methods depend on. A pointer
 * drag, an arrow key and a typed number all route through these functions, so a
 * bug here is a bug that only shows up as "the box jumped" in one of them.
 */

const BOUNDS = { width: 480, height: 270 };

describe("clampCropRect", () => {
  it("rounds both dimensions down to even pixels", () => {
    // H.264 in yuv420p rejects odd dimensions, so an odd crop is a GIF that
    // cannot later become an MP4 — and it fails in a tool that never mentions
    // cropping.
    const rect = clampCropRect({ x: 3, y: 5, width: 101, height: 51 }, BOUNDS);
    expect(rect.width % 2).toBe(0);
    expect(rect.height % 2).toBe(0);
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(50);
  });

  it("keeps the rectangle inside the frame", () => {
    const rect = clampCropRect(
      { x: 470, y: 260, width: 200, height: 200 },
      BOUNDS,
    );
    expect(rect.x + rect.width).toBeLessThanOrEqual(BOUNDS.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(BOUNDS.height);
  });

  it("never returns something too small to encode", () => {
    const rect = clampCropRect({ x: 10, y: 10, width: 1, height: 0 }, BOUNDS);
    expect(rect.width).toBeGreaterThanOrEqual(MIN_CROP_SIZE);
    expect(rect.height).toBeGreaterThanOrEqual(MIN_CROP_SIZE);
  });
});

describe("resizeCropRect", () => {
  it("moves only the edges the handle owns", () => {
    const start = { x: 100, y: 60, width: 200, height: 100 };
    const next = resizeCropRect(start, "e", 40, 0, BOUNDS);
    expect(next.x).toBe(start.x);
    expect(next.y).toBe(start.y);
    expect(next.height).toBe(start.height);
    expect(next.width).toBe(240);
  });

  it("anchors the far edge when dragging from the west", () => {
    const start = { x: 100, y: 60, width: 200, height: 100 };
    const next = resizeCropRect(start, "w", 50, 0, BOUNDS);
    expect(next.x).toBe(150);
    expect(next.x + next.width).toBe(start.x + start.width);
  });

  it("stops rather than inverting when dragged past the opposite edge", () => {
    const start = { x: 100, y: 60, width: 200, height: 100 };
    const next = resizeCropRect(start, "w", 400, 0, BOUNDS);
    expect(next.width).toBeGreaterThanOrEqual(MIN_CROP_SIZE);
    expect(next.x).toBeLessThan(start.x + start.width);
  });

  it("holds a square while a corner is dragged", () => {
    const start = { x: 40, y: 40, width: 100, height: 100 };
    const next = resizeCropRect(start, "se", 60, 0, BOUNDS, 1);
    expect(next.width).toBe(next.height);
    // The anchor is the corner not being dragged.
    expect(next.x).toBe(start.x);
    expect(next.y).toBe(start.y);
  });

  it("keeps a held ratio inside the frame", () => {
    const start = { x: 0, y: 0, width: 400, height: 200 };
    const next = resizeCropRect(start, "se", 400, 400, BOUNDS, 16 / 9);
    expect(next.x + next.width).toBeLessThanOrEqual(BOUNDS.width);
    expect(next.y + next.height).toBeLessThanOrEqual(BOUNDS.height);
    expect(next.width / next.height).toBeCloseTo(16 / 9, 1);
  });
});

describe("moveCropRect", () => {
  it("keeps the size and stops at the edge", () => {
    const start = { x: 100, y: 60, width: 200, height: 100 };
    const next = moveCropRect(start, 1000, 1000, BOUNDS);
    expect(next.width).toBe(start.width);
    expect(next.height).toBe(start.height);
    expect(next.x).toBe(BOUNDS.width - start.width);
    expect(next.y).toBe(BOUNDS.height - start.height);
  });
});

describe("fullFrameRect", () => {
  it("is the whole frame when the shape is free", () => {
    expect(fullFrameRect(BOUNDS, null)).toEqual({
      x: 0,
      y: 0,
      width: 480,
      height: 270,
    });
  });

  it("centres the largest rectangle matching the preset", () => {
    const square = fullFrameRect(BOUNDS, 1);
    expect(square.width).toBe(square.height);
    expect(square.height).toBeLessThanOrEqual(BOUNDS.height);
    expect(square.x).toBe(Math.round((BOUNDS.width - square.width) / 2));
  });
});

describe("applyAspect", () => {
  it("fits inside the rectangle it was given", () => {
    const next = applyAspect(
      { x: 0, y: 0, width: 300, height: 300 },
      16 / 9,
      BOUNDS,
    );
    expect(next.width).toBeLessThanOrEqual(300);
    expect(next.height).toBeLessThanOrEqual(300);
    expect(next.width / next.height).toBeCloseTo(16 / 9, 1);
  });
});

describe("aspectValue", () => {
  it("maps the presets and treats anything else as free", () => {
    expect(aspectValue("1:1")).toBe(1);
    expect(aspectValue("16:9")).toBeCloseTo(16 / 9);
    expect(aspectValue("4:3")).toBeCloseTo(4 / 3);
    expect(aspectValue("free")).toBeNull();
  });
});
