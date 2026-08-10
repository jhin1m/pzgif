/**
 * A RIFF walker for animated WebP, and a rebuilder that turns each of its frames
 * back into a standalone WebP file.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `ImageDecoder` is the only browser API that decodes animated WebP, and Safari
 * has never shipped it at any version — Firefox only from 133. Six of nine tools
 * take GIF, but `webp-to-gif` takes this, and `plan.md` is explicit that a
 * knowingly-broken ranking page is not an option: a visitor arriving from a
 * search result, dropping a file and being told "not supported" pogo-sticks
 * straight back to Google, which is the strongest negative signal a zero-
 * authority domain can generate.
 *
 * ── Why it does not need a WASM decoder ─────────────────────────────────────
 * `phase-07` costed this as a splitter feeding `@jsquash/webp`, a new dependency
 * with its own `.wasm` to vendor, cache and boot through the CSP. That turns out
 * to be unnecessary. An animated WebP is a RIFF container holding one compressed
 * *still* image per frame, and every browser — Safari very much included —
 * decodes still WebP natively. So each frame's payload is wrapped back into a
 * minimal single-image WebP container and handed to `createImageBitmap()`, which
 * exists in workers everywhere this engine runs.
 *
 * That also means one decode path on every browser, which is the same call
 * already ratified for GIF: the alternative — `ImageDecoder` on Chromium and
 * this everywhere else — ships the least-exercised code to the engine that is
 * hardest to debug.
 *
 * This file does **no** decoding and touches no canvas. It is bytes in, bytes
 * out, so its correctness is testable in Node.
 *
 * Format reference: https://developers.google.com/speed/webp/docs/riff_container
 */

/** Frame disposal, from the ANMF flags byte. */
export type WebpDispose = "none" | "background";
/** Frame blending, from the ANMF flags byte. */
export type WebpBlend = "over" | "replace";

export interface WebpFrame {
  /** Offset into the canvas, in pixels. Always even — ANMF stores it halved. */
  x: number;
  y: number;
  width: number;
  height: number;
  durationMs: number;
  /** `over` alpha-blends onto what is already there; `replace` overwrites. */
  blend: WebpBlend;
  /** What to do to this frame's rectangle *after* it has been shown. */
  dispose: WebpDispose;
  /** A complete, standalone WebP file holding only this frame. */
  bytes: Uint8Array;
}

export interface AnimatedWebp {
  /** Canvas size, from VP8X. Frames may be smaller and offset within it. */
  width: number;
  height: number;
  /** 0 means forever, which is what almost every animated WebP says. */
  loopCount: number;
  /** ANMF chunks in the container. Equals `frames.length` unless `rebuild` was
   *  off, in which case `frames` is empty and this still holds the real count. */
  frameCount: number;
  /** Total playback time, in milliseconds, after the per-frame clamp. */
  durationMs: number;
  /** Empty when parsed with `{ rebuild: false }`. */
  frames: WebpFrame[];
}

export interface ParseOptions {
  /**
   * Whether to rebuild each frame into a standalone WebP file.
   *
   * Off for probing. Rebuilding allocates roughly the compressed size of the
   * whole animation a second time, and a probe runs **before** admission control
   * — which is the one point in the pipeline whose entire job is to decide
   * whether this device can afford the memory. Spending a file's worth of it to
   * answer a question that only needs the headers is the wrong order.
   */
  rebuild?: boolean;
}

/** Matches the GIF and video decoders, so a round trip keeps its apparent speed. */
const DEFAULT_DELAY_MS = 100;
const MIN_DELAY_MS = 20;

function fourcc(data: Uint8Array, offset: number): string {
  return String.fromCharCode(
    data[offset],
    data[offset + 1],
    data[offset + 2],
    data[offset + 3],
  );
}

function uint32(data: Uint8Array, offset: number): number {
  return (
    (data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)) >>>
    0
  );
}

/** WebP stores sizes and offsets as 24-bit little-endian throughout. */
function uint24(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
}

interface Chunk {
  id: string;
  /** Offset of the payload, not of the header. */
  start: number;
  size: number;
}

/**
 * Walks the chunks in `[from, to)`.
 *
 * RIFF pads every odd-sized payload to an even boundary, and the pad byte is not
 * counted in the size field. Missing that misaligns every subsequent chunk,
 * which presents as a plausible-looking parse that yields garbage — so it is
 * handled here once rather than at each of the three call sites.
 */
function* chunks(data: Uint8Array, from: number, to: number): Generator<Chunk> {
  let offset = from;
  while (offset + 8 <= to) {
    const id = fourcc(data, offset);
    const size = uint32(data, offset + 4);
    const start = offset + 8;
    if (start + size > to) return;
    yield { id, start, size };
    offset = start + size + (size & 1);
  }
}

function isRiffWebp(data: Uint8Array): boolean {
  return (
    data.length >= 12 && fourcc(data, 0) === "RIFF" && fourcc(data, 8) === "WEBP"
  );
}

/** A `RIFF….WEBP` header for a payload of `bodyLength` bytes. */
function riffHeader(bodyLength: number): Uint8Array {
  const header = new Uint8Array(12);
  header.set([0x52, 0x49, 0x46, 0x46]); // "RIFF"
  // The size field covers everything after it, i.e. "WEBP" plus the body.
  new DataView(header.buffer).setUint32(4, bodyLength + 4, true);
  header.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  return header;
}

/** A chunk header. The payload follows, then a pad byte when the size is odd. */
function chunkHeader(id: string, size: number): Uint8Array {
  const header = new Uint8Array(8);
  for (let index = 0; index < 4; index += 1) header[index] = id.charCodeAt(index);
  new DataView(header.buffer).setUint32(4, size, true);
  return header;
}

/** The 10-byte VP8X payload for a single frame that carries alpha. */
function vp8xPayload(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  // Bit 4 is the alpha flag. Nothing else applies: this container holds one
  // still image with no animation, no ICC profile and no metadata.
  payload[0] = 0x10;
  const w = width - 1;
  const h = height - 1;
  payload[4] = w & 0xff;
  payload[5] = (w >> 8) & 0xff;
  payload[6] = (w >> 16) & 0xff;
  payload[7] = h & 0xff;
  payload[8] = (h >> 8) & 0xff;
  payload[9] = (h >> 16) & 0xff;
  return payload;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/**
 * Rebuilds one ANMF frame as a file a still-image decoder will accept.
 *
 * Three shapes, and the third is the one that is easy to get wrong:
 *
 *  - `VP8L` alone — lossless. The simple container is enough; VP8L carries its
 *    own alpha.
 *  - `VP8 ` alone — lossy, opaque. Simple container again.
 *  - `ALPH` plus `VP8 ` — lossy with transparency. This *requires* the extended
 *    container: a bare `ALPH` chunk before a `VP8 ` chunk in a simple-format
 *    file is not valid WebP, and the alpha is silently dropped or the file is
 *    rejected outright. So a VP8X header goes in front with the alpha flag set.
 */
function rebuildFrame(
  data: Uint8Array,
  frameChunks: readonly Chunk[],
  width: number,
  height: number,
): Uint8Array | null {
  const alpha = frameChunks.find((chunk) => chunk.id === "ALPH");
  const image = frameChunks.find(
    (chunk) => chunk.id === "VP8 " || chunk.id === "VP8L",
  );
  if (!image) return null;

  const imageBytes = data.subarray(image.start, image.start + image.size);
  const body: Uint8Array[] = [];

  if (alpha) {
    const alphaBytes = data.subarray(alpha.start, alpha.start + alpha.size);
    body.push(chunkHeader("VP8X", 10), vp8xPayload(width, height));
    body.push(chunkHeader("ALPH", alpha.size), alphaBytes);
    if (alpha.size & 1) body.push(new Uint8Array(1));
  }

  body.push(chunkHeader(image.id, image.size), imageBytes);
  if (image.size & 1) body.push(new Uint8Array(1));

  const bodyLength = body.reduce((sum, part) => sum + part.byteLength, 0);
  return concat([riffHeader(bodyLength), ...body]);
}

function toDelayMs(raw: number): number {
  // Zero is common and means "as fast as possible", which every browser clamps
  // rather than honouring. Matching the GIF decoder's clamp keeps a WebP→GIF
  // round trip playing at the speed it played at before.
  return raw < MIN_DELAY_MS ? DEFAULT_DELAY_MS : raw;
}

/**
 * Reads an animated WebP into its frames. Returns null when the bytes are not
 * an animated WebP, which is a real answer rather than an error: a still WebP
 * reaches this file only through a mislabelled input, and `probeInput` already
 * routes those to the still-image path.
 */
export function parseAnimatedWebp(
  data: Uint8Array,
  { rebuild = true }: ParseOptions = {},
): AnimatedWebp | null {
  if (!isRiffWebp(data)) return null;

  // The RIFF size field is authoritative over the buffer length: a file with
  // trailing junk — a surprisingly common result of naive concatenation — would
  // otherwise be walked past its own end.
  const declared = uint32(data, 4) + 8;
  const end = Math.min(data.length, Number.isFinite(declared) ? declared : data.length);

  let width = 0;
  let height = 0;
  let loopCount = 0;
  let animated = false;
  let frameCount = 0;
  let durationMs = 0;
  const frames: WebpFrame[] = [];

  for (const chunk of chunks(data, 12, end)) {
    switch (chunk.id) {
      case "VP8X": {
        if (chunk.size < 10) return null;
        animated = (data[chunk.start] & 0x02) !== 0;
        width = uint24(data, chunk.start + 4) + 1;
        height = uint24(data, chunk.start + 7) + 1;
        break;
      }

      case "ANIM": {
        if (chunk.size < 6) break;
        loopCount = data[chunk.start + 4] | (data[chunk.start + 5] << 8);
        break;
      }

      case "ANMF": {
        if (chunk.size < 16) break;
        const at = chunk.start;
        // x and y are stored halved, so they are always even. Multiplying rather
        // than trusting the raw value is not optional — a frame at column 100
        // stores 50, and drawing it at 50 shifts every offset frame left.
        const x = uint24(data, at) * 2;
        const y = uint24(data, at + 3) * 2;
        const frameWidth = uint24(data, at + 6) + 1;
        const frameHeight = uint24(data, at + 9) + 1;
        const duration = toDelayMs(uint24(data, at + 12));
        const flags = data[at + 15];

        const inner = [...chunks(data, at + 16, chunk.start + chunk.size)];

        // A frame with no image payload is a malformed file, and it is skipped
        // — keeping the rest of the animation rather than losing all of it.
        //
        // This has to be decided **before** the counters and independently of
        // `rebuild`, because the probe and the decode must agree on how many
        // frames exist. Gating it on `rebuild` made the probe count a frame the
        // decode then dropped, so a malformed 48-frame file probed as 48 and
        // decoded as 47 — and the badge, `plan.frames` and `stats.frames` all
        // disagreed with the file.
        const hasImage = inner.some(
          (part) => part.id === "VP8 " || part.id === "VP8L",
        );
        if (!hasImage) break;

        frameCount += 1;
        durationMs += duration;
        // Everything past here is the rebuild pass. A probe has what it came
        // for and must not pay for a frame it will not decode.
        if (!rebuild) break;

        const bytes = rebuildFrame(data, inner, frameWidth, frameHeight);
        if (!bytes) break;

        frames.push({
          x,
          y,
          width: frameWidth,
          height: frameHeight,
          durationMs: duration,
          // Bit 1 set means "do not blend" — overwrite the rectangle.
          blend: (flags & 0x02) !== 0 ? "replace" : "over",
          // Bit 0 set means "dispose to background", i.e. clear the rectangle
          // once this frame has been shown.
          dispose: (flags & 0x01) !== 0 ? "background" : "none",
          bytes,
        });
        break;
      }

      default:
        break;
    }
  }

  if (!animated || frameCount === 0 || width <= 0 || height <= 0) return null;
  return { width, height, loopCount, frameCount, durationMs, frames };
}
