import type { Page } from "@playwright/test";

/**
 * Pixel evidence for the assertions that structure alone cannot make.
 *
 * `decode-output.ts` walks a GIF's blocks, which proves dimensions, frame counts
 * and timing — but not *which* pixels came out. Two of `phase-06`'s success
 * criteria need exactly that: "the cropped region matches" and "the frame order
 * is reversed". A frame count of 48 is identical whether the frames were
 * reversed or left alone.
 *
 * ── How it stays independent of the code under test ───────────────────────
 * The decode is `createImageBitmap`, the browser's own GIF reader, which shares
 * nothing with `modern-gif` or with either encoder. It returns the **first**
 * frame of an animation, which is all these assertions need.
 *
 * The signature is a coarse 8×8 grid of average RGB. That is deliberate: an
 * exact pixel comparison would fail on palette quantisation alone, and a
 * whole-image average would collapse two different frames into the same number.
 * A grid survives re-encoding and still distinguishes one frame of a moving
 * animation from another.
 */

/** 8×8 cells × 3 channels, each 0-255. */
export type FrameSignature = number[];

export interface SampleRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

const GRID = 8;
const CELL = 8;
const SIZE = GRID * CELL;

/**
 * The first frame of `bytes`, as a signature.
 *
 * `region` samples that rectangle of the source instead of the whole frame,
 * which is how a crop's output is compared against the region it was cut from.
 */
export async function frameSignature(
  page: Page,
  bytes: Uint8Array,
  region?: SampleRegion,
): Promise<FrameSignature> {
  const base64 = Buffer.from(bytes).toString("base64");

  return page.evaluate(
    async ([encoded, area, size, grid, cell]) => {
      const binary = atob(encoded as string);
      const buffer = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        buffer[index] = binary.charCodeAt(index);
      }

      const bitmap = await createImageBitmap(
        new Blob([buffer], { type: "image/gif" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = size as number;
      canvas.height = size as number;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;

      const source = (area as SampleRegion | null) ?? {
        x: 0,
        y: 0,
        width: bitmap.width,
        height: bitmap.height,
      };
      context.drawImage(
        bitmap,
        source.x,
        source.y,
        source.width,
        source.height,
        0,
        0,
        size as number,
        size as number,
      );
      bitmap.close();

      const pixels = context.getImageData(0, 0, size as number, size as number)
        .data;
      const signature: number[] = [];

      for (let row = 0; row < (grid as number); row += 1) {
        for (let column = 0; column < (grid as number); column += 1) {
          let red = 0;
          let green = 0;
          let blue = 0;
          for (let y = 0; y < (cell as number); y += 1) {
            for (let x = 0; x < (cell as number); x += 1) {
              const offset =
                (((row * (cell as number) + y) * (size as number) +
                  column * (cell as number) +
                  x) *
                  4);
              red += pixels[offset];
              green += pixels[offset + 1];
              blue += pixels[offset + 2];
            }
          }
          const count = (cell as number) * (cell as number);
          signature.push(red / count, green / count, blue / count);
        }
      }
      return signature;
    },
    [base64, region ?? null, SIZE, GRID, CELL] as const,
  );
}

/** Mean absolute difference per channel, 0 (identical) to 255. */
export function signatureDistance(a: FrameSignature, b: FrameSignature): number {
  if (a.length !== b.length) {
    throw new Error(`signature length mismatch: ${a.length} vs ${b.length}`);
  }
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    total += Math.abs(a[index] - b[index]);
  }
  return total / a.length;
}
