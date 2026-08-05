import type { InputFormat } from "@/lib/media/types";
import type { MediaFormat } from "./registry";

/**
 * Cheap, synchronous format identification for the *input* boundary.
 *
 * This is a filename-and-MIME check, deliberately not a byte sniff. It answers
 * one question — "should this tool accept the drop at all?" — and it has to
 * answer it in the drop handler, before any async work, so the dropzone can show
 * the invalid state on the same frame as the drop.
 *
 * The authoritative check is still `src/lib/media/sniff.ts`, which reads magic
 * bytes once the file is accepted. A file that passes here and fails there is a
 * mislabelled file, and the engine's error taxonomy already covers it.
 */

const EXTENSION_FORMATS: Record<string, MediaFormat> = {
  gif: "gif",
  mp4: "mp4",
  m4v: "mp4",
  webm: "webm",
  mov: "mov",
  qt: "mov",
  webp: "webp",
  png: "png",
  zip: "zip",
};

const MIME_FORMATS: Record<string, MediaFormat> = {
  "image/gif": "gif",
  "image/webp": "webp",
  "image/png": "png",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "application/zip": "zip",
};

/** Lower-cased extension without the dot, or null when there isn't one. */
export function extensionOf(fileName: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match ? match[1].toLowerCase() : null;
}

/**
 * The extension wins over the MIME type.
 *
 * Not arbitrary: browsers disagree about the type they report for `.mov`
 * (`video/quicktime`, `video/mp4`, or empty), and Windows hands back an empty
 * string for anything without a registered handler. The extension is what the
 * user can see and correct.
 */
export function detectMediaFormat(file: {
  name: string;
  type?: string;
}): MediaFormat | null {
  const extension = extensionOf(file.name);
  if (extension && extension in EXTENSION_FORMATS) {
    return EXTENSION_FORMATS[extension];
  }
  const mime = (file.type ?? "").toLowerCase();
  return MIME_FORMATS[mime] ?? null;
}

/** Bridges the registry's format vocabulary to the engine's coarser one. */
export function toInputFormat(format: MediaFormat | null): InputFormat {
  switch (format) {
    case "gif":
      return "gif";
    case "webp":
      return "webp";
    case "mp4":
    case "webm":
    case "mov":
      return "video";
    case "png":
      return "image";
    default:
      return "unknown";
  }
}

/**
 * The `accept` attribute for a file input.
 *
 * Extensions rather than MIME types, for the same reason `detectMediaFormat`
 * prefers them: a `.mov` whose reported type is empty is invisible to a
 * MIME-based filter, and the file then cannot be selected at all.
 */
export function acceptAttribute(formats: readonly MediaFormat[]): string {
  return formats.map((format) => `.${format}`).join(",");
}

/** "GIF", or "GIF, MP4 or WebM" — for a caption, not for a sentence. */
export function formatListLabel(formats: readonly MediaFormat[]): string {
  const labels = formats.map((format) =>
    format === "webp" ? "WebP" : format.toUpperCase(),
  );
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`;
}
