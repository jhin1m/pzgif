/**
 * Crop, rotate and resize — one unit, because the order is the whole point.
 *
 * The pipeline is **crop → rotate → resize**, always. Resizing first throws away
 * the pixels the crop was about to keep, so the crop then samples an
 * already-degraded image and the result is soft in a way no encoder setting
 * recovers. Splitting these into `crop.ts` and `resize.ts` would put the
 * ordering rule in neither file; here it is expressed as a single class that
 * cannot be called out of order.
 *
 * The final step goes through `drawDownscaled`, never a bare `drawImage`. That
 * is not a preference: a single large-ratio draw is a near-box filter in most
 * engines, and on moving content its aliasing shimmers frame to frame. A GIF
 * reads that as bad quality more strongly than it reads any palette advantage,
 * which would quietly cancel out the reason this project carries an AGPL
 * dependency at all.
 */

import { drawDownscaled } from "../downscale";
import type { CropRect, GeometrySpec, Rotation } from "../types";

function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
  return ctx;
}

function clampCrop(crop: CropRect | undefined, width: number, height: number): CropRect {
  if (!crop) return { x: 0, y: 0, width, height };
  const x = Math.max(0, Math.min(Math.round(crop.x), width - 1));
  const y = Math.max(0, Math.min(Math.round(crop.y), height - 1));
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(crop.width), width - x)),
    height: Math.max(1, Math.min(Math.round(crop.height), height - y)),
  };
}

export interface GeometryOptions {
  /** Round both output axes down to even. H.264 in yuv420p rejects odd sizes. */
  even?: boolean;
  /** Never exceed this width, whatever the spec asked for. The tier ceiling. */
  maxWidth?: number;
}

export class FrameGeometry {
  readonly crop: CropRect;
  readonly rotate: Rotation;
  readonly outputWidth: number;
  readonly outputHeight: number;

  /**
   * The factor a decoder may pre-scale by and still leave this class enough
   * pixels to work with.
   *
   * mediabunny's `CanvasSink` can resize during decode, which is the single
   * cheapest place to shed memory. But it resizes the *whole frame*, so asking
   * it for the final width when a crop is coming would shrink the crop region
   * along with everything else. Scaling by this factor instead lands the crop
   * region at exactly the output size, with the sink still doing the expensive
   * part. Capped at 1 — upscaling to satisfy a crop is inventing detail.
   */
  readonly decodeScale: number;

  private cropCanvas: OffscreenCanvas | null = null;
  private rotateCanvas: OffscreenCanvas | null = null;

  constructor(
    readonly sourceWidth: number,
    readonly sourceHeight: number,
    spec: GeometrySpec,
    options: GeometryOptions = {},
  ) {
    this.crop = clampCrop(spec.crop, sourceWidth, sourceHeight);
    this.rotate = spec.rotate ?? 0;

    const quarterTurn = this.rotate === 90 || this.rotate === 270;
    const rotatedWidth = quarterTurn ? this.crop.height : this.crop.width;
    const rotatedHeight = quarterTurn ? this.crop.width : this.crop.height;

    const wanted = Math.min(
      spec.targetWidth,
      options.maxWidth ?? spec.targetWidth,
      rotatedWidth,
    );
    let width = Math.max(1, Math.round(wanted));
    let height = Math.max(1, Math.round((width * rotatedHeight) / rotatedWidth));
    if (options.even) {
      width = Math.max(2, width & ~1);
      height = Math.max(2, height & ~1);
    }

    this.outputWidth = width;
    this.outputHeight = height;
    this.decodeScale = Math.min(1, width / rotatedWidth);
  }

  /** An output-sized canvas, allocated by the caller so it can be reused. */
  createOutputCanvas(): OffscreenCanvas {
    return new OffscreenCanvas(this.outputWidth, this.outputHeight);
  }

  private scratch(
    slot: "crop" | "rotate",
    width: number,
    height: number,
  ): OffscreenCanvas {
    const existing = slot === "crop" ? this.cropCanvas : this.rotateCanvas;
    if (existing) {
      if (existing.width !== width) existing.width = width;
      if (existing.height !== height) existing.height = height;
      return existing;
    }
    const created = new OffscreenCanvas(width, height);
    if (slot === "crop") this.cropCanvas = created;
    else this.rotateCanvas = created;
    return created;
  }

  /**
   * Draws one frame through crop → rotate → resize into `destination`.
   *
   * `imageWidth`/`imageHeight` are the dimensions of what is being passed in,
   * which may already be smaller than the source if the decoder pre-scaled by
   * `decodeScale`. They are passed explicitly because `CanvasImageSource` spells
   * its intrinsic size differently for every member — `VideoFrame` alone has
   * three notions of size — and guessing wrong rescales the image silently.
   */
  apply(
    image: CanvasImageSource,
    imageWidth: number,
    imageHeight: number,
    destination: OffscreenCanvas,
  ): void {
    const scale = imageWidth / this.sourceWidth;
    const isFullFrame =
      this.crop.x === 0 &&
      this.crop.y === 0 &&
      this.crop.width === this.sourceWidth &&
      this.crop.height === this.sourceHeight;

    let stage: CanvasImageSource = image;
    let stageWidth = imageWidth;
    let stageHeight = imageHeight;

    if (!isFullFrame) {
      // Crop in the incoming image's own coordinate space. Rounding outward on
      // the size keeps a sub-pixel crop from losing its last column.
      const sx = Math.round(this.crop.x * scale);
      const sy = Math.round(this.crop.y * scale);
      const sw = Math.max(1, Math.min(Math.ceil(this.crop.width * scale), imageWidth - sx));
      const sh = Math.max(1, Math.min(Math.ceil(this.crop.height * scale), imageHeight - sy));

      const cropped = this.scratch("crop", sw, sh);
      context2d(cropped).drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
      stage = cropped;
      stageWidth = sw;
      stageHeight = sh;
    }

    if (this.rotate !== 0) {
      const quarterTurn = this.rotate === 90 || this.rotate === 270;
      const rotatedWidth = quarterTurn ? stageHeight : stageWidth;
      const rotatedHeight = quarterTurn ? stageWidth : stageHeight;
      const rotated = this.scratch("rotate", rotatedWidth, rotatedHeight);
      const ctx = context2d(rotated);
      ctx.save();
      ctx.clearRect(0, 0, rotatedWidth, rotatedHeight);
      ctx.translate(rotatedWidth / 2, rotatedHeight / 2);
      ctx.rotate((this.rotate * Math.PI) / 180);
      ctx.drawImage(stage, -stageWidth / 2, -stageHeight / 2);
      ctx.restore();
      stage = rotated;
      stageWidth = rotatedWidth;
      stageHeight = rotatedHeight;
    }

    drawDownscaled(stage, stageWidth, stageHeight, destination);
  }

  /** Drops the scratch canvases. Worth calling when a job ends — on the iOS
   *  budget two source-sized canvases are not noise. */
  release(): void {
    this.cropCanvas = null;
    this.rotateCanvas = null;
  }
}
