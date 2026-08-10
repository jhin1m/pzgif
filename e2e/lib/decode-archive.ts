/**
 * Node-side reading of a ZIP produced by `encode/png-zip.ts`.
 *
 * ── Why this is hand-written too ────────────────────────────────────────────
 * Same reason as `decode-output.ts`. The thing under test is a hand-written ZIP
 * writer, and the risk in hand-writing a ZIP is byte layout: a wrong offset in
 * the central directory produces an archive that the code which wrote it reads
 * back perfectly and that Finder refuses to open. A reader sharing assumptions
 * with the writer cannot catch that. This one walks the central directory the
 * way an unzip tool does — from the end-of-central-directory record backwards —
 * rather than from the front, so a stale directory offset fails here.
 *
 * Spec: APPNOTE.TXT, sections 4.3.6 (central directory) and 4.3.16 (EOCD).
 */

export interface ZipEntry {
  name: string;
  /** 0 is STORE. Anything else means the writer started compressing. */
  method: number;
  size: number;
  /** The entry's bytes, read through its *local* header. */
  bytes: Uint8Array;
}

export interface ZipSummary {
  entries: ZipEntry[];
  byteLength: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** True when the bytes carry a PNG signature. */
export function isPng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return signature.every((byte, index) => bytes[index] === byte);
}

export function summariseZip(bytes: Uint8Array): ZipSummary {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // The EOCD is the last thing in the file, and the only way in. Scanning
  // backwards for it is what every real unzip does, and it is why a writer that
  // appends anything after `finish()` produces an unopenable archive.
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("No end-of-central-directory record: not a ZIP");

  const count = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);

  const entries: ZipEntry[] = [];
  let at = directoryOffset;

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) {
      throw new Error(`Central directory entry ${index} has a bad signature`);
    }
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = Buffer.from(
      bytes.subarray(at + 46, at + 46 + nameLength),
    ).toString("utf8");

    // Follow the offset the directory states rather than assuming entries are
    // laid out end to end. A directory whose offsets are wrong is exactly the
    // failure this file exists to catch, and reading sequentially would miss it.
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error(`Entry "${name}" points at ${localOffset}, which is not a local header`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const payloadAt = localOffset + 30 + localNameLength + localExtraLength;

    entries.push({
      name,
      method,
      size,
      bytes: bytes.subarray(payloadAt, payloadAt + size),
    });

    at += 46 + nameLength + extraLength + commentLength;
  }

  return { entries, byteLength: bytes.byteLength };
}
