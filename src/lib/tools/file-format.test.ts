import { describe, expect, it } from "vitest";
import {
  acceptAttribute,
  detectMediaFormat,
  extensionOf,
  formatListLabel,
  toInputFormat,
} from "./file-format";

describe("detectMediaFormat", () => {
  it("reads the extension first", () => {
    expect(detectMediaFormat({ name: "loop.gif", type: "" })).toBe("gif");
    expect(detectMediaFormat({ name: "clip.MOV", type: "" })).toBe("mov");
    expect(detectMediaFormat({ name: "sticker.webp" })).toBe("webp");
  });

  it("falls back to the MIME type when the name carries no extension", () => {
    // Pasted and drag-dropped files routinely arrive as "image" or "blob".
    expect(detectMediaFormat({ name: "image", type: "image/gif" })).toBe("gif");
    expect(detectMediaFormat({ name: "blob", type: "video/quicktime" })).toBe(
      "mov",
    );
  });

  it("prefers the extension over a disagreeing MIME type", () => {
    // Browsers disagree about `.mov`, and Windows reports an empty type for
    // anything without a registered handler. The extension is what the user can
    // see and correct, so it wins.
    expect(detectMediaFormat({ name: "clip.mov", type: "video/mp4" })).toBe(
      "mov",
    );
  });

  it("returns null for anything it cannot place", () => {
    expect(
      detectMediaFormat({ name: "notes.txt", type: "text/plain" }),
    ).toBeNull();
    expect(detectMediaFormat({ name: "unnamed", type: "" })).toBeNull();
  });
});

describe("extensionOf", () => {
  it("lower-cases and drops the dot", () => {
    expect(extensionOf("Loop.GIF")).toBe("gif");
  });

  it("takes the last segment of a multi-dot name", () => {
    expect(extensionOf("archive.tar.gz")).toBe("gz");
  });

  it("returns null when there is no extension", () => {
    expect(extensionOf("README")).toBeNull();
  });
});

describe("toInputFormat", () => {
  it("collapses the three video containers onto one engine format", () => {
    expect(toInputFormat("mp4")).toBe("video");
    expect(toInputFormat("webm")).toBe("video");
    expect(toInputFormat("mov")).toBe("video");
  });

  it("maps the still formats the engine distinguishes", () => {
    expect(toInputFormat("gif")).toBe("gif");
    expect(toInputFormat("webp")).toBe("webp");
    expect(toInputFormat("png")).toBe("image");
    expect(toInputFormat(null)).toBe("unknown");
  });
});

describe("acceptAttribute", () => {
  it("lists extensions, not MIME types", () => {
    // A `.mov` whose reported type is empty is invisible to a MIME filter, and
    // the file then cannot be selected in the picker at all.
    expect(acceptAttribute(["gif", "mp4", "mov"])).toBe(".gif,.mp4,.mov");
  });
});

describe("formatListLabel", () => {
  it("reads as a sentence fragment", () => {
    expect(formatListLabel(["gif"])).toBe("GIF");
    expect(formatListLabel(["gif", "mp4", "webm"])).toBe("GIF, MP4 or WEBM");
  });

  it("spells WebP the way the format does", () => {
    expect(formatListLabel(["webp"])).toBe("WebP");
  });
});
