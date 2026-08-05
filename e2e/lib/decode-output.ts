/**
 * Node-side decoding of what the tool actually produced.
 *
 * ── Why this file has to exist ──────────────────────────────────────────────
 * `plan.md` and phases 5 through 11 all say the same thing: assert on the
 * decoded output, never on the DOM. Playwright runs in Node, which cannot decode
 * a GIF, so without something here every one of those criteria silently degrades
 * into "a download button appeared" — which is exactly what a broken encoder
 * also produces.
 *
 * ── Why it is a hand-written parser and not a library ──────────────────────
 * A GIF header is a fixed-layout structure and the frame list is a walk over
 * block markers; the whole thing is under 150 lines. Reaching for a decoder
 * would pull a dependency into the test suite whose job is to *check* the
 * decoder — and if the assertion library and the implementation ever shared a
 * bug, the test would pass on a broken file. Parsing the bytes directly means
 * these assertions have no opinion in common with `modern-gif`.
 *
 * The spec is GIF89a: https://www.w3.org/Graphics/GIF/spec-gif89a.txt
 */

/** What a GIF's own bytes say about it. */
export interface GifSummary {
  width: number;
  height: number;
  /** Image Descriptor blocks — one per frame. */
  frames: number;
  /** Per-frame delays in milliseconds, in file order. */
  delaysMs: number[];
  /** Total playback time. `sum(delaysMs)`. */
  durationMs: number;
  /** True when a Netscape application extension asks for infinite looping. */
  loops: boolean;
  byteLength: number;
}

const GIF87A = "GIF87a";
const GIF89A = "GIF89a";

/** True when the bytes begin with a GIF signature. Cheap, and checked first. */
export function isGif(bytes: Uint8Array): boolean {
  const header = Buffer.from(bytes.subarray(0, 6)).toString("latin1");
  return header === GIF87A || header === GIF89A;
}

/**
 * Walks a GIF and reports what is really in it.
 *
 * Throws rather than returning a partial summary: a file this cannot walk to
 * its trailer is a malformed GIF, and that is a test failure with a useful
 * message rather than a frame count of zero that reads like an assertion bug.
 */
export function summariseGif(bytes: Uint8Array): GifSummary {
  if (!isGif(bytes)) {
    throw new Error(
      `Not a GIF: first bytes were ${Buffer.from(bytes.subarray(0, 6)).toString("hex")}`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);

  const packed = bytes[10];
  let offset = 13;
  // Global Colour Table, when the packed field says one is present.
  if ((packed & 0x80) !== 0) offset += 3 * 2 ** ((packed & 0x07) + 1);

  const delaysMs: number[] = [];
  let frames = 0;
  let loops = false;
  /** Delay from the Graphic Control Extension that precedes the next frame. */
  let pendingDelayMs = 0;

  const skipSubBlocks = () => {
    while (offset < bytes.length) {
      const size = bytes[offset];
      offset += 1;
      if (size === 0) return;
      offset += size;
    }
  };

  while (offset < bytes.length) {
    const marker = bytes[offset];
    offset += 1;

    // Trailer.
    if (marker === 0x3b) break;

    // Extension introducer.
    if (marker === 0x21) {
      const label = bytes[offset];
      offset += 1;

      if (label === 0xf9) {
        // Graphic Control Extension: block size, packed, delay (1/100 s), …
        const blockSize = bytes[offset];
        pendingDelayMs = view.getUint16(offset + 2, true) * 10;
        offset += blockSize + 1;
        // Terminator for the sub-block chain.
        skipSubBlocks();
        continue;
      }

      if (label === 0xff) {
        const blockSize = bytes[offset];
        const identifier = Buffer.from(
          bytes.subarray(offset + 1, offset + 1 + blockSize),
        ).toString("latin1");
        offset += blockSize + 1;
        if (identifier.startsWith("NETSCAPE")) loops = true;
        skipSubBlocks();
        continue;
      }

      skipSubBlocks();
      continue;
    }

    // Image Descriptor — this, and only this, is a frame.
    if (marker === 0x2c) {
      frames += 1;
      delaysMs.push(pendingDelayMs);
      pendingDelayMs = 0;

      const localPacked = bytes[offset + 8];
      offset += 9;
      if ((localPacked & 0x80) !== 0) {
        offset += 3 * 2 ** ((localPacked & 0x07) + 1);
      }
      // LZW minimum code size, then the image data sub-blocks.
      offset += 1;
      skipSubBlocks();
      continue;
    }

    throw new Error(
      `Unexpected block marker 0x${marker.toString(16)} at byte ${offset - 1}`,
    );
  }

  if (frames === 0) throw new Error("GIF contains no image descriptors");

  return {
    width,
    height,
    frames,
    delaysMs,
    durationMs: delaysMs.reduce((total, delay) => total + delay, 0),
    loops,
    byteLength: bytes.byteLength,
  };
}
