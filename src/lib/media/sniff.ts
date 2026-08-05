/**
 * What this file actually is, decided from its bytes.
 *
 * The extension is a claim, not a fact. A `.gif` that is really an MP4 is
 * common — every "save as GIF" button on a social network hands out an MP4 — and
 * routing it into the GIF decoder produces `decode-failed`, which is the generic
 * bucket the "never a dead end" rule exists to keep files out of. Sniffing lets
 * the refusal say *"this is really an MP4, use MP4 to GIF"* and link there.
 *
 * Only the leading bytes are read, so this costs nothing on a 200 MB file.
 */

import type { InputFormat } from "./types";

/**
 * Enough for every signature below, and for WebP's chunk walk to step over an
 * `ICCP` or `EXIF` chunk before reaching `ANIM`. 64 bytes was too tight: a
 * colour-managed animated WebP would have been classified as a still image and
 * refused.
 */
const HEADER_BYTES = 4096;

export interface SniffResult {
  format: InputFormat;
  /** Lowercased, no dot. Null when the name carries no extension. */
  declaredExtension: string | null;
  /** True when the bytes disagree with the extension. Worth saying out loud. */
  mismatch: boolean;
  /** Only meaningful for `webp`: a still WebP cannot become an animation. */
  animated: boolean | null;
}

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  let out = "";
  for (let index = at; index < at + length && index < bytes.length; index += 1) {
    out += String.fromCharCode(bytes[index]);
  }
  return out;
}

/**
 * Walks WebP's RIFF chunks looking for `ANIM`.
 *
 * A still WebP and an animated one share a container and differ only in whether
 * an `ANIM` chunk is present, so the distinction cannot be made from the first
 * twelve bytes. It has to be made *somewhere*: `webp-to-gif` handed a still
 * image should say "this WebP isn't animated" rather than emit a one-frame GIF,
 * which gifski refuses anyway.
 */
function isAnimatedWebp(bytes: Uint8Array): boolean {
  // Header is 12 bytes; chunks follow as [fourcc:4][size:4][payload:size].
  let offset = 12;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 8 <= bytes.length) {
    const fourcc = ascii(bytes, offset, 4);
    if (fourcc === "ANIM" || fourcc === "ANMF") return true;
    const size = view.getUint32(offset + 4, true);
    if (!Number.isFinite(size) || size <= 0) return false;
    // Chunks are padded to even lengths.
    offset += 8 + size + (size % 2);
  }
  return false;
}

export function sniffBytes(header: Uint8Array, fileName: string): SniffResult {
  const declaredExtension = extensionOf(fileName);
  let format: InputFormat = "unknown";
  let animated: boolean | null = null;

  const magic = ascii(header, 0, 4);

  if (magic === "GIF8") {
    format = "gif";
    animated = true; // A single-frame GIF is still a GIF; the decoder counts.
  } else if (magic === "RIFF" && ascii(header, 8, 4) === "WEBP") {
    format = "webp";
    animated = isAnimatedWebp(header);
  } else if (ascii(header, 4, 4) === "ftyp") {
    // ISO base media: MP4, MOV, 3GP, HEIC. The brand narrows it further, but
    // mediabunny reads all of them and only decodability actually matters.
    format = ascii(header, 8, 4) === "heic" ? "image" : "video";
  } else if (
    header[0] === 0x1a &&
    header[1] === 0x45 &&
    header[2] === 0xdf &&
    header[3] === 0xa3
  ) {
    format = "video"; // Matroska / WebM
  } else if (header[0] === 0x47 && header[188] === 0x47) {
    // MPEG-TS: the 0x47 sync byte repeats every 188 bytes. One byte alone would
    // classify every file starting with the letter "G" as video.
    format = "video";
  } else if (
    header[0] === 0x89 &&
    ascii(header, 1, 3) === "PNG"
  ) {
    format = "image";
  } else if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    format = "image";
  }

  const expected: Record<string, InputFormat> = {
    gif: "gif",
    webp: "webp",
    mp4: "video",
    mov: "video",
    m4v: "video",
    webm: "video",
    mkv: "video",
    png: "image",
    jpg: "image",
    jpeg: "image",
  };
  const claimed = declaredExtension ? expected[declaredExtension] : undefined;

  return {
    format,
    declaredExtension,
    mismatch: claimed !== undefined && format !== "unknown" && claimed !== format,
    animated,
  };
}

export async function sniffFile(file: Blob & { name?: string }): Promise<SniffResult> {
  const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  return sniffBytes(header, file.name ?? "");
}
