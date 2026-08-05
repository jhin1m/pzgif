/**
 * PNG frames in a ZIP — the `split-gif-to-frames` output.
 *
 * ── Why the ZIP is written here instead of by a library ─────────────────────
 * The plan named `fflate`'s `ZipPassThrough`, chosen for one property: it stores
 * without re-deflating, because PNG is already compressed and deflating it again
 * spends CPU to add bytes. Once compression is off the ZIP container is a header
 * format — a local header, the payload, a central directory, an end record — and
 * writing those directly is about a hundred lines with no dependency, no
 * bundle cost and no version to track. That is the whole of what the dependency
 * was for, so it is not carried.
 *
 * Everything a compressed writer would need — deflate, streaming state, format
 * negotiation — is absent here on purpose. If a future tool needs real
 * compression, add the library then.
 *
 * ── Why the output accumulates as Blob parts ────────────────────────────────
 * Never one growing `Uint8Array`. A 60-second 30 fps GIF is 1800 PNGs, and a
 * single resizing typed array holds all of them in the JS heap at once, then
 * doubles during each grow. Handing the browser a list of parts lets it back the
 * result with disk, which is the difference between a large download and a dead
 * tab.
 */

import type { DecodedFrame } from "../types";

/** ZIP's 16-bit entry count and 32-bit sizes. Zip64 is not implemented. */
const MAX_ENTRIES = 0xffff;
const MAX_UINT32 = 0xffffffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface Entry {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}

/**
 * Assembles a stored (uncompressed) ZIP one entry at a time.
 *
 * Split out from the encoder so the container can be tested without a canvas:
 * the risk in hand-writing a ZIP is byte layout — a wrong offset in the central
 * directory produces a file that this code reads back happily and Finder refuses
 * to open. `png-zip.test.ts` checks the layout against payloads it can predict.
 */
export class StoreZipWriter {
  private readonly entries: Entry[] = [];
  private offset = 0;
  private readonly encoder = new TextEncoder();

  /** Records an entry and returns the header that must precede its bytes. */
  add(name: string, bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    if (this.entries.length >= MAX_ENTRIES) {
      throw new Error(`Too many entries for one archive: ${this.entries.length + 1}`);
    }
    if (bytes.byteLength > MAX_UINT32) throw new Error("Entry too large for ZIP");

    const entry: Entry = {
      nameBytes: this.encoder.encode(name),
      crc: crc32(bytes),
      size: bytes.byteLength,
      offset: this.offset,
    };
    this.entries.push(entry);

    const header = localHeader(entry);
    this.offset += header.byteLength + bytes.byteLength;
    return header;
  }

  /** The central directory and end record. Everything after this is invalid. */
  finish(): Uint8Array<ArrayBuffer> {
    return centralDirectory(this.entries, this.offset);
  }
}

function localHeader(entry: Entry): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(30 + entry.nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true); // local file header signature
  view.setUint16(4, 20, true); // version needed: 2.0
  view.setUint16(6, 0, true); // no flags — names are ASCII, sizes known up front
  view.setUint16(8, 0, true); // method 0 = stored
  view.setUint16(10, 0, true); // modification time
  view.setUint16(12, 0x21, true); // modification date = 1980-01-01, the epoch ZIP allows
  view.setUint32(14, entry.crc, true);
  view.setUint32(18, entry.size, true);
  view.setUint32(22, entry.size, true);
  view.setUint16(26, entry.nameBytes.length, true);
  view.setUint16(28, 0, true); // no extra field
  header.set(entry.nameBytes, 30);
  return header;
}

function centralDirectory(entries: Entry[], directoryOffset: number): Uint8Array<ArrayBuffer> {
  const size = entries.reduce((sum, entry) => sum + 46 + entry.nameBytes.length, 0);
  const directory = new Uint8Array(size + 22);
  const view = new DataView(directory.buffer);

  let at = 0;
  for (const entry of entries) {
    view.setUint32(at, 0x02014b50, true); // central directory header signature
    view.setUint16(at + 4, 20, true); // version made by
    view.setUint16(at + 6, 20, true); // version needed
    view.setUint16(at + 8, 0, true);
    view.setUint16(at + 10, 0, true); // stored
    view.setUint16(at + 12, 0, true);
    view.setUint16(at + 14, 0x21, true);
    view.setUint32(at + 16, entry.crc, true);
    view.setUint32(at + 20, entry.size, true);
    view.setUint32(at + 24, entry.size, true);
    view.setUint16(at + 28, entry.nameBytes.length, true);
    view.setUint16(at + 30, 0, true); // extra length
    view.setUint16(at + 32, 0, true); // comment length
    view.setUint16(at + 34, 0, true); // disk number
    view.setUint16(at + 36, 0, true); // internal attributes
    view.setUint32(at + 38, 0, true); // external attributes
    view.setUint32(at + 42, entry.offset, true);
    directory.set(entry.nameBytes, at + 46);
    at += 46 + entry.nameBytes.length;
  }

  view.setUint32(at, 0x06054b50, true); // end of central directory
  view.setUint16(at + 4, 0, true);
  view.setUint16(at + 6, 0, true);
  view.setUint16(at + 8, entries.length, true);
  view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 12, size, true);
  view.setUint32(at + 16, directoryOffset, true);
  view.setUint16(at + 20, 0, true); // no comment

  return directory;
}

export interface PngZipArgs {
  frames: readonly DecodedFrame[];
  width: number;
  height: number;
  /** Stem for the entries, e.g. `my-animation` → `my-animation-0001.png`. */
  baseName: string;
  onFrame?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export async function encodePngZip({
  frames,
  width,
  height,
  baseName,
  onFrame,
  signal,
}: PngZipArgs): Promise<Blob> {
  if (frames.length === 0) throw new Error("No frames to package");
  if (frames.length > MAX_ENTRIES) {
    throw new Error(`Too many frames for one archive: ${frames.length}`);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");

  const zip = new StoreZipWriter();
  const parts: BlobPart[] = [];
  const digits = String(frames.length).length;

  for (const [index, frame] of frames.entries()) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");

    // See `encode/video.ts` for why this narrowing is sound.
    const view = new Uint8ClampedArray(
      frame.rgba.buffer,
      frame.rgba.byteOffset,
      frame.rgba.byteLength,
    ) as Uint8ClampedArray<ArrayBuffer>;
    ctx.putImageData(new ImageData(view, width, height), 0, 0);

    const png = await canvas.convertToBlob({ type: "image/png" });
    // Read once for the checksum, then keep the Blob rather than the bytes —
    // the Blob is the browser's to page out, the bytes are ours to hold.
    const bytes = new Uint8Array(await png.arrayBuffer());
    const name = `${baseName}-${String(index + 1).padStart(digits, "0")}.png`;
    parts.push(zip.add(name, bytes), png);

    onFrame?.(index + 1, frames.length);
  }

  parts.push(zip.finish());
  return new Blob(parts, { type: "application/zip" });
}
