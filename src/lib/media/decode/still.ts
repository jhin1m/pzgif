/**
 * Still images.
 *
 * No MVP tool takes a still image as input, so this file exists to make the
 * *refusal* accurate rather than to decode anything useful. A PNG dropped on the
 * GIF compressor should be told it is a PNG and pointed at a tool that takes
 * one — which, in a nine-tool MVP, may be none of them. Saying "we don't have a
 * tool for that yet" is a dead end the user can act on; "decode failed" is not.
 *
 * `createImageBitmap` is used rather than `@jsquash/*`: every browser this
 * project supports decodes PNG, JPEG and still WebP natively inside a worker,
 * and a WASM codec would be a megabyte of download to learn an image's size.
 */

import type { InputProbe } from "../types";

export async function probeStill(
  file: Blob,
  declaredExtension: string | null,
): Promise<InputProbe> {
  const bitmap = await createImageBitmap(file);
  try {
    return {
      format: "image",
      declaredExtension,
      width: bitmap.width,
      height: bitmap.height,
      durationSec: null,
      frameCount: 1,
      codec: file.type || null,
      decodable: true,
      rotationDegrees: 0,
    };
  } finally {
    bitmap.close();
  }
}
