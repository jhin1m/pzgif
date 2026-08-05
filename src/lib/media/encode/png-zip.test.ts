/**
 * The ZIP container, checked byte by byte.
 *
 * Writing the container by hand instead of taking a dependency moves the risk
 * from "is the library right" to "is the layout right", and a wrong offset in
 * the central directory produces an archive that this code reads back happily
 * and Finder refuses to open. Only an explicit layout check catches that.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { StoreZipWriter, crc32 } from "./png-zip";

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_DIRECTORY_SIGNATURE = 0x06054b50;

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

function build(files: Array<{ name: string; bytes: Uint8Array }>): Uint8Array {
  const zip = new StoreZipWriter();
  const parts: Uint8Array[] = [];
  for (const file of files) {
    parts.push(zip.add(file.name, file.bytes), file.bytes);
  }
  parts.push(zip.finish());
  return concat(parts);
}

describe("crc32", () => {
  it("matches the standard check vector", () => {
    // The canonical CRC-32 test value for "123456789".
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("is zero for empty input", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("StoreZipWriter", () => {
  const files = [
    { name: "frame-1.png", bytes: new Uint8Array([1, 2, 3, 4, 5]) },
    { name: "frame-2.png", bytes: new Uint8Array([9, 9, 9]) },
  ];

  it("writes a local header before every payload", () => {
    const zip = build(files);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint32(0, true)).toBe(LOCAL_HEADER_SIGNATURE);

    const firstEntryLength = 30 + files[0].name.length + files[0].bytes.byteLength;
    expect(view.getUint32(firstEntryLength, true)).toBe(LOCAL_HEADER_SIGNATURE);
  });

  it("stores rather than compressing", () => {
    // Method 0 is what makes this correct for PNG input: deflating an already
    // compressed payload spends CPU to add bytes.
    const zip = build(files);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint32(18, true)).toBe(files[0].bytes.byteLength); // compressed
    expect(view.getUint32(22, true)).toBe(files[0].bytes.byteLength); // uncompressed
  });

  it("points the end record at the real central directory offset", () => {
    // The failure this catches is silent: a wrong offset here still parses in
    // any code that scans forward, and fails in every real unzip tool.
    const zip = build(files);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const endAt = zip.byteLength - 22;

    expect(view.getUint32(endAt, true)).toBe(END_OF_DIRECTORY_SIGNATURE);
    expect(view.getUint16(endAt + 8, true)).toBe(files.length);
    expect(view.getUint16(endAt + 10, true)).toBe(files.length);

    const directorySize = view.getUint32(endAt + 12, true);
    const directoryOffset = view.getUint32(endAt + 16, true);
    expect(directoryOffset + directorySize).toBe(endAt);
    expect(view.getUint32(directoryOffset, true)).toBe(CENTRAL_HEADER_SIGNATURE);
  });

  it("records each entry's own local-header offset", () => {
    const zip = build(files);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const endAt = zip.byteLength - 22;
    const directoryOffset = view.getUint32(endAt + 16, true);

    let at = directoryOffset;
    let expectedLocalOffset = 0;
    for (const file of files) {
      expect(view.getUint32(at, true)).toBe(CENTRAL_HEADER_SIGNATURE);
      expect(view.getUint32(at + 42, true)).toBe(expectedLocalOffset);
      expect(view.getUint32(at + 16, true)).toBe(crc32(file.bytes));
      expect(view.getUint32(at + 20, true)).toBe(file.bytes.byteLength);

      // Every recorded offset must land on a local header, not mid-payload.
      expect(view.getUint32(expectedLocalOffset, true)).toBe(LOCAL_HEADER_SIGNATURE);

      expectedLocalOffset += 30 + file.name.length + file.bytes.byteLength;
      at += 46 + file.name.length;
    }
  });

  it("produces an archive a real unzip implementation accepts", () => {
    // The layout assertions above check what this code believes it wrote. This
    // one checks what an independent implementation can read — the only way to
    // catch a container that is self-consistently wrong, which is the specific
    // risk of writing the format by hand instead of taking the dependency.
    const payloads = [
      { name: "a.png", bytes: new TextEncoder().encode("first payload") },
      { name: "b.png", bytes: new Uint8Array(1024).fill(7) },
      { name: "c.png", bytes: new Uint8Array(0) },
    ];
    const archive = build(payloads);
    const path = join(mkdtempSync(join(tmpdir(), "pzgif-zip-")), "frames.zip");
    writeFileSync(path, archive);

    const output = execFileSync(
      "python3",
      [
        "-c",
        [
          "import sys, zipfile",
          "z = zipfile.ZipFile(sys.argv[1])",
          "assert z.testzip() is None, 'CRC mismatch'",
          "print(','.join(z.namelist()))",
          "print(len(z.read('b.png')))",
        ].join("\n"),
        path,
      ],
      { encoding: "utf8" },
    ).trim().split("\n");

    expect(output[0]).toBe("a.png,b.png,c.png");
    expect(Number(output[1])).toBe(1024);
  });

  it("names entries with the padded index the caller passed", () => {
    const zip = build([{ name: "clip-01.png", bytes: new Uint8Array([7]) }]);
    const name = new TextDecoder().decode(zip.subarray(30, 30 + "clip-01.png".length));
    expect(name).toBe("clip-01.png");
  });
});
