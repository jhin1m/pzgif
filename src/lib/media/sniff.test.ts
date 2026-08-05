/**
 * Sniffing exists to stop one specific dead end: a file whose extension lies.
 * Every case here is one the tool would otherwise report as `decode-failed`,
 * which tells the user nothing they can act on.
 */

import { describe, expect, it } from "vitest";
import { sniffBytes } from "./sniff";

function bytes(...values: Array<number | string>): Uint8Array {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number") out.push(value);
    else for (const char of value) out.push(char.charCodeAt(0));
  }
  return new Uint8Array([...out, ...new Array(64 - out.length).fill(0)]);
}

describe("sniffBytes", () => {
  it("identifies a GIF", () => {
    expect(sniffBytes(bytes("GIF89a"), "loop.gif").format).toBe("gif");
    expect(sniffBytes(bytes("GIF87a"), "loop.gif").format).toBe("gif");
  });

  it("identifies an MP4 wearing a .gif extension, and says the name is wrong", () => {
    // Social platforms hand out MP4s from "save as GIF" buttons constantly.
    const result = sniffBytes(bytes(0, 0, 0, 0x20, "ftypisom"), "animation.gif");
    expect(result.format).toBe("video");
    expect(result.mismatch).toBe(true);
    expect(result.declaredExtension).toBe("gif");
  });

  it("identifies Matroska and WebM", () => {
    expect(sniffBytes(bytes(0x1a, 0x45, 0xdf, 0xa3), "clip.webm").format).toBe("video");
  });

  it("separates animated WebP from still WebP", () => {
    // `webp-to-gif` handed a still image must say so rather than emit a
    // one-frame GIF, which gifski refuses anyway.
    // A real animated WebP is RIFF → WEBP → VP8X (10-byte payload) → ANIM, and
    // the walker has to step over that payload to find the ANIM chunk.
    const animated = sniffBytes(
      bytes("RIFF", 0x40, 0, 0, 0, "WEBPVP8X", 0x0a, 0, 0, 0, ...new Array(10).fill(0), "ANIM"),
      "sticker.webp",
    );
    expect(animated.format).toBe("webp");
    expect(animated.animated).toBe(true);

    const still = sniffBytes(
      bytes("RIFF", 0x20, 0, 0, 0, "WEBPVP8 ", 0x0a, 0, 0, 0),
      "photo.webp",
    );
    expect(still.format).toBe("webp");
    expect(still.animated).toBe(false);
  });

  it("identifies still images so they get a named refusal", () => {
    expect(sniffBytes(bytes(0x89, "PNG"), "shot.png").format).toBe("image");
    expect(sniffBytes(bytes(0xff, 0xd8, 0xff, 0xe0), "photo.jpg").format).toBe("image");
  });

  it("reports unknown rather than guessing", () => {
    const result = sniffBytes(bytes("not a media file"), "mystery.bin");
    expect(result.format).toBe("unknown");
    expect(result.mismatch).toBe(false);
  });

  it("does not flag a mismatch when the extension is simply absent", () => {
    const result = sniffBytes(bytes("GIF89a"), "clipboard-paste");
    expect(result.declaredExtension).toBeNull();
    expect(result.mismatch).toBe(false);
  });
});
