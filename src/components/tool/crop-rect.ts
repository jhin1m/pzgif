/**
 * The crop rectangle's arithmetic, kept out of the component that draws it.
 *
 * Every rule the overlay has to obey — stay inside the frame, never invert,
 * never go below a usable size, hold an aspect ratio, land on even pixels — is a
 * pure function of numbers. Putting them here means the pointer path, the
 * keyboard path and the four number inputs all resolve through *one*
 * implementation, which is the only way three input methods can be guaranteed to
 * produce the same rectangle. It is also the half that can be unit-tested
 * without a browser.
 *
 * **Even dimensions are load-bearing.** H.264 in `yuv420p` rejects odd width or
 * height, so a 499×281 crop that is later fed to GIF → MP4 fails at the encoder
 * with an error that has nothing to do with cropping. Rounding here means that
 * cannot happen — and rounding *down* means the rectangle never grows past the
 * edge the user dragged it to.
 */

import type { CropRect } from "@/lib/media/types";

/** Small enough to crop a detail out of a large GIF, large enough to encode. */
export const MIN_CROP_SIZE = 16;

export type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const CROP_HANDLES: readonly CropHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

export interface CropBounds {
  width: number;
  height: number;
}

function evenDown(value: number): number {
  return Math.max(MIN_CROP_SIZE, Math.floor(value / 2) * 2);
}

/**
 * Forces a rectangle to be legal: integer, even-sized, inside the frame.
 *
 * Order matters. The size is settled first and then the origin is pulled back to
 * fit, because doing it the other way round lets a rectangle dragged past the
 * right edge silently lose width it was never asked to give up.
 */
export function clampCropRect(rect: CropRect, bounds: CropBounds): CropRect {
  const width = Math.min(evenDown(rect.width), evenDown(bounds.width));
  const height = Math.min(evenDown(rect.height), evenDown(bounds.height));
  const x = Math.max(0, Math.min(Math.round(rect.x), bounds.width - width));
  const y = Math.max(0, Math.min(Math.round(rect.y), bounds.height - height));

  return { x, y, width, height };
}

/**
 * Reshapes a rectangle to `aspect` (width ÷ height), keeping `anchor` fixed.
 *
 * The anchor is the corner the user is *not* dragging. Without it an aspect
 * preset would move the edge under the pointer, which reads as the rectangle
 * fighting the drag.
 */
export function applyAspect(
  rect: CropRect,
  aspect: number,
  bounds: CropBounds,
  anchor: { x: "left" | "right"; y: "top" | "bottom" } = { x: "left", y: "top" },
): CropRect {
  if (!Number.isFinite(aspect) || aspect <= 0) return clampCropRect(rect, bounds);

  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  // Fit the requested ratio inside both the current rectangle's larger axis and
  // the frame, so an aspect change can never push the crop out of the image.
  let width = rect.width;
  let height = width / aspect;
  if (height > rect.height) {
    height = rect.height;
    width = height * aspect;
  }
  width = Math.min(width, bounds.width);
  height = Math.min(width / aspect, bounds.height);
  width = height * aspect;

  const x = anchor.x === "left" ? rect.x : right - width;
  const y = anchor.y === "top" ? rect.y : bottom - height;

  return clampCropRect({ x, y, width, height }, bounds);
}

/** The whole frame, or the largest centred rectangle matching `aspect`. */
export function fullFrameRect(bounds: CropBounds, aspect: number | null): CropRect {
  const full = clampCropRect(
    { x: 0, y: 0, width: bounds.width, height: bounds.height },
    bounds,
  );
  if (aspect === null) return full;

  const fitted = applyAspect(full, aspect, bounds);
  return clampCropRect(
    {
      ...fitted,
      x: Math.round((bounds.width - fitted.width) / 2),
      y: Math.round((bounds.height - fitted.height) / 2),
    },
    bounds,
  );
}

/** Slides a rectangle without resizing it. */
export function moveCropRect(
  start: CropRect,
  dx: number,
  dy: number,
  bounds: CropBounds,
): CropRect {
  return clampCropRect({ ...start, x: start.x + dx, y: start.y + dy }, bounds);
}

/**
 * Drags one handle by `(dx, dy)` in source pixels.
 *
 * The edges the handle does not touch stay exactly where they were — that is
 * what makes a resize feel anchored rather than like a move. When an aspect
 * ratio is held, the axis the handle does not drive follows, anchored at the
 * opposite edge.
 */
export function resizeCropRect(
  start: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  bounds: CropBounds,
  aspect: number | null = null,
): CropRect {
  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");

  let left = start.x + (west ? dx : 0);
  let right = start.x + start.width + (east ? dx : 0);
  let top = start.y + (north ? dy : 0);
  let bottom = start.y + start.height + (south ? dy : 0);

  // A drag past the opposite edge does not invert the rectangle; it stops. An
  // inverting crop is a rectangle whose meaning changed mid-gesture.
  if (right - left < MIN_CROP_SIZE) {
    if (west) left = right - MIN_CROP_SIZE;
    else right = left + MIN_CROP_SIZE;
  }
  if (bottom - top < MIN_CROP_SIZE) {
    if (north) top = bottom - MIN_CROP_SIZE;
    else bottom = top + MIN_CROP_SIZE;
  }

  left = Math.max(0, Math.min(left, bounds.width - MIN_CROP_SIZE));
  top = Math.max(0, Math.min(top, bounds.height - MIN_CROP_SIZE));
  right = Math.min(bounds.width, Math.max(right, left + MIN_CROP_SIZE));
  bottom = Math.min(bounds.height, Math.max(bottom, top + MIN_CROP_SIZE));

  const dragged: CropRect = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
  if (aspect === null) return clampCropRect(dragged, bounds);

  return applyAspect(dragged, aspect, bounds, {
    x: west ? "right" : "left",
    y: north ? "bottom" : "top",
  });
}

/** Aspect presets, as `width / height`. `null` is "free". */
export function aspectValue(preset: string): number | null {
  switch (preset) {
    case "1:1":
      return 1;
    case "16:9":
      return 16 / 9;
    case "4:3":
      return 4 / 3;
    default:
      return null;
  }
}
