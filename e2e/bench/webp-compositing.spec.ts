import { expect, test } from "@playwright/test";
import { openEngine, sampleWebpFrames, selectEngineFixture } from "./engine-harness";

/**
 * Correctness of the animated-WebP compositor.
 *
 * An animated WebP is not a sequence of pictures. Each ANMF frame carries a
 * rectangle, an offset, a blend rule and a disposal rule, and `decode/webp.ts`
 * applies them in order to a persistent canvas. `webp-riff.test.ts` covers the
 * *parsing* of those fields against synthesised containers; nothing covered the
 * *applying* of them, and a defect there produces a plausible wrong animation
 * rather than an error — the only failure in the phase that does not announce
 * itself.
 *
 * `anim.webp` cannot cover it. Its 48 frames are all full-canvas at offset 0,0,
 * blending, never disposing, so a decoder that ignored offsets, blend and
 * disposal entirely would still decode it perfectly. `webp-offset-dispose.webp`
 * is authored frame by frame for exactly this:
 *
 *     frame 1  64x64 red     at (0,0)    blend       dispose none
 *     frame 2  16x16 blue    at (32,16)  no-blend    dispose background
 *     frame 3  16x16 green   at (0,32)   blend       dispose none
 *
 * Frame 3's placement is the load-bearing part. Were it full-canvas it would
 * paint over frame 2's rectangle and the disposal would be unobservable — the
 * suite would pass whether or not disposal ran, or ran over the wrong area. By
 * landing somewhere else it leaves frame 2's rectangle showing whatever disposal
 * left there, which is the only way to see it.
 *
 * Read through `sampleWebpFrames`, not through a produced GIF: `e2e/lib/pixel-
 * probe.ts` decodes via `createImageBitmap` and therefore only ever sees frame
 * one, where none of this is visible yet.
 *
 * Runs on all three engines. The compositing is `drawImage` and `clearRect` on a
 * canvas, and canvas alpha behaviour is an engine property, not a library one.
 */

const FIXTURE = "webp-offset-dispose.webp";

/**
 * Points either side of frame 2's rectangle, which spans x 32..47, y 16..31.
 * The edge-adjacent ones are what catch an offset that is off by a pixel or
 * transposed — a `(y, x)` swap puts the patch at (16,32), which the corners
 * alone would not distinguish from a correct decode on a square canvas.
 */
const POINTS = [
  [0, 0], // far from everything: the canvas-wide witness
  [32, 16], // patch top-left
  [47, 31], // patch bottom-right
  [31, 16], // one pixel left of the patch
  [32, 32], // one pixel below the patch
  [0, 32], // frame 3's own rectangle
] as const;

const [OUTSIDE, PATCH_FIRST, PATCH_LAST, LEFT_OF_PATCH, BELOW_PATCH, MARK] = [
  0, 1, 2, 3, 4, 5,
];

/**
 * Names a pixel, so a failure reads `expected "clear", received "blue"` instead
 * of a diff of four integers.
 *
 * The tolerance is for the encoder round trip only. The fixture is lossless and
 * drawn 1:1, so anything beyond a count or two is a real difference and should
 * show up as an `rgb(...)` string rather than being rounded into a name.
 */
function colour([r, g, b, a]: [number, number, number, number]): string {
  if (a === 0) return "clear";
  if (a !== 255) return `alpha-${a}`;
  const near = (value: number, target: number) => Math.abs(value - target) <= 2;
  if (near(r, 255) && near(g, 0) && near(b, 0)) return "red";
  if (near(r, 0) && near(g, 0) && near(b, 255)) return "blue";
  if (near(r, 0) && near(g, 255) && near(b, 0)) return "green";
  return `rgb(${r},${g},${b})`;
}

test("offsets, no-blend and disposal composite as authored", async ({ page }) => {
  await openEngine(page);
  await selectEngineFixture(page, FIXTURE);

  const sample = await sampleWebpFrames(page, POINTS);

  expect(sample.width, "canvas width").toBe(64);
  expect(sample.height, "canvas height").toBe(64);
  expect(sample.frames, "frame count").toHaveLength(3);

  const at = (frame: number, point: number) => colour(sample.frames[frame].pixels[point]);

  // Frame 1 — the full-canvas base. Nothing subtle here; it exists so the later
  // frames have something to be a patch *on*, and so a wholesale decode failure
  // is distinguishable from a compositing one.
  expect(at(0, OUTSIDE), "frame 1 background").toBe("red");
  expect(at(0, PATCH_FIRST), "frame 1 under the patch").toBe("red");
  expect(at(0, MARK), "frame 1 under frame 3's rectangle").toBe("red");

  // Frame 2 — a no-blend patch at an offset. Both corners land inside, both
  // neighbours stay outside: the rectangle is where the container says, and
  // "do not blend" replaced that rectangle rather than the canvas.
  expect(at(1, PATCH_FIRST), "frame 2 patch top-left").toBe("blue");
  expect(at(1, PATCH_LAST), "frame 2 patch bottom-right").toBe("blue");
  expect(at(1, LEFT_OF_PATCH), "frame 2 one pixel left of the patch").toBe("red");
  expect(at(1, BELOW_PATCH), "frame 2 one pixel below the patch").toBe("red");
  expect(at(1, OUTSIDE), "frame 2 far from the patch").toBe("red");

  // Frame 3 — the disposal is visible now, because frame 3 is elsewhere.
  // Cleared inside the disposed rectangle, untouched outside it.
  expect(at(2, PATCH_FIRST), "frame 3 inside the disposed rectangle").toBe("clear");
  expect(at(2, PATCH_LAST), "frame 3 far corner of the disposed rectangle").toBe("clear");
  expect(at(2, LEFT_OF_PATCH), "frame 3 one pixel left of the disposed rectangle").toBe("red");
  expect(at(2, BELOW_PATCH), "frame 3 one pixel below the disposed rectangle").toBe("red");
  expect(at(2, OUTSIDE), "frame 3 far from the disposed rectangle").toBe("red");

  // ...and frame 3's own patch landed at its own offset, which also proves the
  // disposal did not take the incoming frame's rectangle by mistake.
  expect(at(2, MARK), "frame 3 patch").toBe("green");

  // Durations come from the same ANMF headers as the offsets; a splitter that
  // read the wrong field width would corrupt both.
  expect(sample.frames.map((frame) => frame.durationMs)).toEqual([100, 100, 100]);
});
