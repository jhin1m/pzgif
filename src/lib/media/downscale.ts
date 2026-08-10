/**
 * Quality-preserving downscaling.
 *
 * This is production code that happens to have been written during the Phase 1
 * spike, not a spike artefact. Everything that produces GIF frames must go
 * through it.
 *
 * ── Why this is not a single `drawImage` ────────────────────────────────────
 * Scaling 1080p straight down to 480px in one `drawImage` is a near-box filter
 * in most engines. It aliases, and on moving content the aliasing turns into
 * shimmer that crawls frame to frame. On a GIF that reads as *worse quality*,
 * and it reads that way more strongly than any palette advantage a better
 * encoder can buy back. Getting this wrong would quietly cancel out the entire
 * reason this project takes on an AGPL dependency.
 *
 * `imageSmoothingQuality: 'high'` helps where it is honoured — and Firefox
 * ignores it outright, which is precisely why the halving chain below is not
 * optional. Repeated halving averages every source pixel into the result no
 * matter what filter the engine actually implements, because at a 2:1 ratio even
 * a box filter samples all four contributing pixels.
 */

/** Below this ratio a single draw is already sampling every source pixel. */
const SINGLE_STEP_RATIO = 2;

/**
 * Reusable scratch canvases for the intermediate halving steps.
 *
 * Two, ping-ponged: a step reads the previous one while writing this one, so a
 * single buffer cannot serve both. They are module-level because a job decodes
 * hundreds of frames through the same chain and reallocating a canvas per frame
 * is a per-frame cost for no benefit.
 */
let scratchA: OffscreenCanvas | null = null;
let scratchB: OffscreenCanvas | null = null;

function scratch(slot: 0 | 1, width: number, height: number): OffscreenCanvas {
  const existing = slot === 0 ? scratchA : scratchB;
  if (existing) {
    // Assigning the same size is not a no-op in every engine — it can still
    // clear the bitmap — so only touch it when it actually changed.
    if (existing.width !== width) existing.width = width;
    if (existing.height !== height) existing.height = height;
    return existing;
  }
  const created = new OffscreenCanvas(width, height);
  if (slot === 0) scratchA = created;
  else scratchB = created;
  return created;
}

function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

/**
 * Releases the scratch canvases.
 *
 * Worth calling when a job ends: the chain for a 1080p source holds two canvases
 * up to half the source size, and on the iOS budget that is not noise.
 */
export function releaseDownscaleScratch(): void {
  scratchA = null;
  scratchB = null;
}

/**
 * Draws `source` into `destination` at the destination's own size, stepping down
 * by halves first whenever the ratio exceeds 2:1.
 *
 * `sourceWidth`/`sourceHeight` are passed explicitly because `CanvasImageSource`
 * spells its intrinsic size differently for each member — `VideoFrame` alone has
 * three notions of size — and guessing wrong scales the image, silently.
 */
export function drawDownscaled(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  destination: OffscreenCanvas,
): void {
  const targetWidth = destination.width;
  const targetHeight = destination.height;

  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error(`Invalid downscale target ${targetWidth}x${targetHeight}`);
  }

  let current: CanvasImageSource = source;
  let currentWidth = sourceWidth;
  let currentHeight = sourceHeight;
  let slot: 0 | 1 = 0;

  // Halve while a single final draw would still be skipping source pixels.
  // Both axes are tested so a chain never starts on an aspect-distorting step.
  while (
    currentWidth >= targetWidth * SINGLE_STEP_RATIO &&
    currentHeight >= targetHeight * SINGLE_STEP_RATIO
  ) {
    const nextWidth = Math.max(targetWidth, currentWidth >> 1);
    const nextHeight = Math.max(targetHeight, currentHeight >> 1);
    // A step that would not shrink anything means the loop cannot converge —
    // bail to the final draw rather than spin.
    if (nextWidth === currentWidth && nextHeight === currentHeight) break;

    const step = scratch(slot, nextWidth, nextHeight);
    const stepCtx = context2d(step);
    // Both the scratch canvases and the caller's destination are reused across
    // frames, and `drawImage` composites source-over — so a pixel that is
    // transparent in this frame keeps whatever the *previous* frame left there.
    // On opaque content that is invisible, which is why it survived; on anything
    // with transparency it burns the old frame in permanently. Clearing first
    // makes each draw a replacement rather than an accumulation.
    stepCtx.clearRect(0, 0, nextWidth, nextHeight);
    stepCtx.drawImage(
      current,
      0,
      0,
      currentWidth,
      currentHeight,
      0,
      0,
      nextWidth,
      nextHeight,
    );

    current = step;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
    slot = slot === 0 ? 1 : 0;
  }

  const destinationCtx = context2d(destination);
  destinationCtx.clearRect(0, 0, targetWidth, targetHeight);
  destinationCtx.drawImage(
    current,
    0,
    0,
    currentWidth,
    currentHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );
}

/**
 * How many halving steps `drawDownscaled` will take for a given ratio.
 *
 * Exists so tests can assert the chain actually engages. A test that only checks
 * output dimensions passes just as happily against a single low-quality draw,
 * which is the exact regression this module exists to prevent.
 */
export function countHalvingSteps(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): number {
  let width = sourceWidth;
  let height = sourceHeight;
  let steps = 0;
  while (
    width >= targetWidth * SINGLE_STEP_RATIO &&
    height >= targetHeight * SINGLE_STEP_RATIO
  ) {
    const nextWidth = Math.max(targetWidth, width >> 1);
    const nextHeight = Math.max(targetHeight, height >> 1);
    if (nextWidth === width && nextHeight === height) break;
    width = nextWidth;
    height = nextHeight;
    steps += 1;
  }
  return steps;
}

/**
 * Fits `sourceWidth x sourceHeight` into `targetWidth` preserving aspect ratio.
 *
 * `even` rounds both axes down to a multiple of two. H.264 in yuv420p rejects
 * odd dimensions, and GIFs are frequently odd-sized — `odd-dims.gif` in the
 * fixture corpus is 499x281 for exactly this reason — so any path that ends at a
 * video encoder must ask for it.
 */
export function fitWidth(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  { even = false }: { even?: boolean } = {},
): { width: number; height: number } {
  const width = Math.max(1, Math.min(targetWidth, sourceWidth));
  const height = Math.max(1, Math.round((width * sourceHeight) / sourceWidth));
  return even
    ? { width: Math.max(2, width & ~1), height: Math.max(2, height & ~1) }
    : { width, height };
}
