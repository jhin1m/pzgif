import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAnimatedWebp } from "./webp-riff";

/**
 * The RIFF splitter is the one piece of Phase 7 with no browser to fall back on
 * if it is wrong: a misread offset does not throw, it produces a plausible
 * animation with the frames in the wrong places. So the byte layout is asserted
 * against containers built here — where every field's value is known — and then
 * against the real fixture, which is what the tool will actually be handed.
 */

const encoder = new TextEncoder();

function chunk(id: string, payload: Uint8Array): Uint8Array {
  const size = payload.byteLength;
  // RIFF pads odd payloads to an even boundary and does not count the pad byte.
  const padded = size + (size & 1);
  const out = new Uint8Array(8 + padded);
  out.set(encoder.encode(id), 0);
  new DataView(out.buffer).setUint32(4, size, true);
  out.set(payload, 8);
  return out;
}

function uint24(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
}

function vp8x(width: number, height: number, animated: boolean): Uint8Array {
  return new Uint8Array([
    animated ? 0x02 : 0x00,
    0,
    0,
    0,
    ...uint24(width - 1),
    ...uint24(height - 1),
  ]);
}

function anim(loopCount: number): Uint8Array {
  return new Uint8Array([0, 0, 0, 0, loopCount & 0xff, (loopCount >> 8) & 0xff]);
}

interface FrameSpec {
  x: number;
  y: number;
  width: number;
  height: number;
  durationMs: number;
  /** ANMF flags byte: bit 1 = do not blend, bit 0 = dispose to background. */
  flags: number;
  /** Stand-in image payload. Its bytes are opaque to the parser. Omitted for
   *  the malformed-frame case, where there is no payload at all. */
  image?: { id: "VP8 " | "VP8L"; bytes: number[] };
  alpha?: number[];
}

function anmf(spec: FrameSpec): Uint8Array {
  const header = new Uint8Array([
    // x and y are stored halved, which is the trap this whole helper exists to
    // exercise: the parser has to multiply them back.
    ...uint24(spec.x / 2),
    ...uint24(spec.y / 2),
    ...uint24(spec.width - 1),
    ...uint24(spec.height - 1),
    ...uint24(spec.durationMs),
    spec.flags,
  ]);
  const inner = [
    ...(spec.alpha ? [chunk("ALPH", new Uint8Array(spec.alpha))] : []),
    ...(spec.image
      ? [chunk(spec.image.id, new Uint8Array(spec.image.bytes))]
      : []),
  ];
  const body = new Uint8Array(
    header.byteLength + inner.reduce((sum, part) => sum + part.byteLength, 0),
  );
  body.set(header, 0);
  let at = header.byteLength;
  for (const part of inner) {
    body.set(part, at);
    at += part.byteLength;
  }
  return chunk("ANMF", body);
}

function riff(parts: readonly Uint8Array[]): Uint8Array {
  const bodyLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(12 + bodyLength);
  out.set(encoder.encode("RIFF"), 0);
  new DataView(out.buffer).setUint32(4, bodyLength + 4, true);
  out.set(encoder.encode("WEBP"), 8);
  let at = 12;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

function fourccAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

describe("parseAnimatedWebp", () => {
  it("reads the canvas size, loop count and frame geometry", () => {
    const bytes = riff([
      chunk("VP8X", vp8x(200, 100, true)),
      chunk("ANIM", anim(0)),
      anmf({
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        durationMs: 80,
        flags: 0,
        image: { id: "VP8L", bytes: [1, 2, 3] },
      }),
      anmf({
        x: 40,
        y: 20,
        width: 60,
        height: 30,
        durationMs: 120,
        // Both bits: do not blend, and dispose to background afterwards.
        flags: 0x03,
        image: { id: "VP8L", bytes: [4, 5, 6, 7] },
      }),
    ]);

    const parsed = parseAnimatedWebp(bytes);
    expect(parsed).not.toBeNull();
    expect(parsed!.width).toBe(200);
    expect(parsed!.height).toBe(100);
    expect(parsed!.loopCount).toBe(0);
    expect(parsed!.frames).toHaveLength(2);

    const [first, second] = parsed!.frames;
    expect(first).toMatchObject({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      durationMs: 80,
      blend: "over",
      dispose: "none",
    });
    // The halved-offset trap: 40 and 20 are stored as 20 and 10.
    expect(second).toMatchObject({
      x: 40,
      y: 20,
      width: 60,
      height: 30,
      durationMs: 120,
      blend: "replace",
      dispose: "background",
    });
  });

  it("rebuilds a lossless frame as a simple-format WebP", () => {
    const bytes = riff([
      chunk("VP8X", vp8x(16, 16, true)),
      chunk("ANIM", anim(0)),
      anmf({
        x: 0,
        y: 0,
        width: 16,
        height: 16,
        durationMs: 100,
        flags: 0,
        image: { id: "VP8L", bytes: [9, 9, 9] },
      }),
    ]);

    const frame = parseAnimatedWebp(bytes)!.frames[0].bytes;
    expect(fourccAt(frame, 0)).toBe("RIFF");
    expect(fourccAt(frame, 8)).toBe("WEBP");
    // No alpha chunk, so no VP8X wrapper is needed and none is written.
    expect(fourccAt(frame, 12)).toBe("VP8L");
    // The RIFF size field counts everything after itself, i.e. "WEBP" onwards.
    expect(new DataView(frame.buffer).getUint32(4, true)).toBe(
      frame.byteLength - 8,
    );
    expect([...frame.subarray(20, 23)]).toEqual([9, 9, 9]);
  });

  it("wraps a lossy frame that carries alpha in an extended container", () => {
    const bytes = riff([
      chunk("VP8X", vp8x(32, 24, true)),
      chunk("ANIM", anim(0)),
      anmf({
        x: 0,
        y: 0,
        width: 32,
        height: 24,
        durationMs: 100,
        flags: 0,
        // An odd-length payload, so the pad byte is exercised too.
        alpha: [1, 2, 3],
        image: { id: "VP8 ", bytes: [4, 5, 6, 7] },
      }),
    ]);

    const frame = parseAnimatedWebp(bytes)!.frames[0].bytes;
    // A bare ALPH before VP8 is not valid simple-format WebP; the alpha flag has
    // to be declared in a VP8X header or the transparency is lost.
    expect(fourccAt(frame, 12)).toBe("VP8X");
    expect(frame[20] & 0x10).toBe(0x10);
    // The VP8X canvas size is the *frame's* size, not the animation's.
    const view = new DataView(frame.buffer);
    expect(view.getUint32(4, true)).toBe(frame.byteLength - 8);
    expect(fourccAt(frame, 30)).toBe("ALPH");
    // 30 + 8 header + 3 payload + 1 pad byte.
    expect(fourccAt(frame, 42)).toBe("VP8 ");
  });

  it("clamps a zero duration rather than emitting a frame with no time", () => {
    const bytes = riff([
      chunk("VP8X", vp8x(8, 8, true)),
      chunk("ANIM", anim(0)),
      anmf({
        x: 0,
        y: 0,
        width: 8,
        height: 8,
        // "As fast as possible", which every browser clamps rather than honours.
        durationMs: 0,
        flags: 0,
        image: { id: "VP8L", bytes: [1] },
      }),
    ]);
    expect(parseAnimatedWebp(bytes)!.frames[0].durationMs).toBe(100);
  });

  it("counts frames and total duration without rebuilding any of them", () => {
    // What `probeWebp` asks for. Admission control runs on the answer, so the
    // count and the duration have to be right *before* a byte has been spent
    // rebuilding anything.
    const bytes = riff([
      chunk("VP8X", vp8x(64, 64, true)),
      chunk("ANIM", anim(0)),
      ...[40, 60, 0].map((durationMs) =>
        anmf({
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          durationMs,
          flags: 0,
          image: { id: "VP8L", bytes: [1, 2] },
        }),
      ),
    ]);

    const probed = parseAnimatedWebp(bytes, { rebuild: false })!;
    expect(probed.frameCount).toBe(3);
    // The third frame's zero is clamped to 100, exactly as the decoder will.
    expect(probed.durationMs).toBe(40 + 60 + 100);
    expect(probed.frames).toHaveLength(0);

    // And the full parse agrees with it, which is the invariant that matters:
    // a probe that counted differently from the decode would size the job
    // against frames that never arrive.
    const full = parseAnimatedWebp(bytes)!;
    expect(full.frameCount).toBe(probed.frameCount);
    expect(full.durationMs).toBe(probed.durationMs);
    expect(full.frames).toHaveLength(probed.frameCount);
  });

  it("agrees with itself about a malformed frame, probe or not", () => {
    // The invariant behind the count: admission control sizes the job from the
    // probe and the decoder then produces the frames, so the two passes have to
    // reach the same number. A frame carrying no image payload at all is where
    // they can diverge — the rebuild pass has something to reject and the probe
    // does not — and a probe that counted 48 against a decode of 47 would put
    // the badge, the plan and the stats all at odds with the file.
    const bytes = riff([
      chunk("VP8X", vp8x(32, 32, true)),
      chunk("ANIM", anim(0)),
      anmf({
        x: 0,
        y: 0,
        width: 32,
        height: 32,
        durationMs: 50,
        flags: 0,
        image: { id: "VP8L", bytes: [1, 2] },
      }),
      // No VP8/VP8L chunk. Only the ALPH, which cannot be decoded on its own.
      anmf({
        x: 0,
        y: 0,
        width: 32,
        height: 32,
        durationMs: 50,
        flags: 0,
        alpha: [7, 7],
      }),
      anmf({
        x: 0,
        y: 0,
        width: 32,
        height: 32,
        durationMs: 50,
        flags: 0,
        image: { id: "VP8L", bytes: [3, 4] },
      }),
    ]);

    const probed = parseAnimatedWebp(bytes, { rebuild: false })!;
    const full = parseAnimatedWebp(bytes)!;

    // Two good frames, not three: the malformed one is skipped by both passes
    // rather than counted by one of them.
    expect(probed.frameCount).toBe(2);
    expect(probed.durationMs).toBe(100);
    expect(full.frameCount).toBe(probed.frameCount);
    expect(full.durationMs).toBe(probed.durationMs);
    expect(full.frames).toHaveLength(2);
  });

  it("returns null for anything that is not an animated WebP", () => {
    expect(parseAnimatedWebp(new Uint8Array([1, 2, 3]))).toBeNull();
    // A still WebP: valid RIFF, no animation flag, no ANMF.
    expect(
      parseAnimatedWebp(
        riff([chunk("VP8X", vp8x(8, 8, false)), chunk("VP8L", new Uint8Array([1]))]),
      ),
    ).toBeNull();
    // GIF bytes, which is what a mislabelled `.webp` most often turns out to be.
    expect(parseAnimatedWebp(encoder.encode("GIF89a……"))).toBeNull();
  });

  it("walks the real fixture and rebuilds every frame as a WebP", () => {
    // The synthesised containers above prove the field offsets; this proves the
    // parser survives a file produced by libwebp rather than by this test.
    const bytes = new Uint8Array(
      readFileSync(join(process.cwd(), "e2e", "fixtures", "anim.webp")),
    );
    const parsed = parseAnimatedWebp(bytes);

    expect(parsed, "anim.webp did not parse as an animated WebP").not.toBeNull();
    expect(parsed!.width).toBeGreaterThan(0);
    expect(parsed!.height).toBeGreaterThan(0);
    expect(parsed!.frames.length).toBeGreaterThan(1);

    for (const frame of parsed!.frames) {
      expect(fourccAt(frame.bytes, 0)).toBe("RIFF");
      expect(fourccAt(frame.bytes, 8)).toBe("WEBP");
      // Every rebuilt frame is a complete file, so its own size field has to be
      // right — a decoder that trusts it would otherwise read past the end.
      expect(
        new DataView(
          frame.bytes.buffer,
          frame.bytes.byteOffset,
          frame.bytes.byteLength,
        ).getUint32(4, true),
      ).toBe(frame.bytes.byteLength - 8);
      expect(frame.durationMs).toBeGreaterThanOrEqual(20);
      expect(frame.width).toBeLessThanOrEqual(parsed!.width);
      expect(frame.height).toBeLessThanOrEqual(parsed!.height);
    }
  });
});
