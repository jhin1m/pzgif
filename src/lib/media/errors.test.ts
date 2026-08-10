/**
 * The error taxonomy's two invariants, checked rather than asserted in prose.
 *
 * Both exist because the wireframe copy already violated one of them: it points
 * a rejected PNG at "PNG to GIF", a tool that is not in the nine-tool MVP. A
 * dead end written by the copy that exists to prevent dead ends is exactly what
 * a test can stop from shipping twice.
 */

import { describe, expect, it } from "vitest";
import messages from "../../../messages/en.json";
import { getRoute } from "@/lib/tools/registry";
import {
  ERROR_MESSAGE_KEYS,
  browserUnsupportedError,
  decodeFailedError,
  encodeFailedError,
  messageKeyFor,
  oomError,
  suggestToolFor,
  tooLargeError,
  unsupportedFormatError,
} from "./errors";
import type { MediaError, MediaErrorCode } from "./types";

function lookup(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      messages,
    );
}

function allStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (node && typeof node === "object") {
    for (const value of Object.values(node)) allStrings(value, out);
  }
  return out;
}

const SAMPLES: MediaError[] = [
  unsupportedFormatError({ format: "video", extension: "mp4", fromSlug: "gif-compressor" }),
  tooLargeError({ degraded: null, requestedFrames: 400, budgetMb: 30 }),
  decodeFailedError({ canOfferFallback: false }),
  encodeFailedError({}),
  oomError({ suggestedWidth: 320 }),
  browserUnsupportedError({ reason: "ios-video-budget" }),
  browserUnsupportedError({ reason: "no-video-decoder" }),
  browserUnsupportedError({ reason: "no-video-encoder" }),
];

describe("error message catalogue", () => {
  it("has a translation for every code", () => {
    for (const code of Object.keys(ERROR_MESSAGE_KEYS) as MediaErrorCode[]) {
      if (code === "browser-unsupported") continue; // fanned out by reason below
      expect(typeof lookup(ERROR_MESSAGE_KEYS[code]), code).toBe("string");
    }
  });

  it("has a translation for every error a builder can produce", () => {
    for (const error of SAMPLES) {
      expect(typeof lookup(messageKeyFor(error)), error.code).toBe("string");
    }
  });

  it("never mentions Pro anywhere in the engine copy", () => {
    // The Pro tier is out of MVP scope, so routing a user there routes them
    // nowhere. This covers actions and stage labels too, not only errors.
    const engineStrings = allStrings(messages.engine);
    const offenders = engineStrings.filter((text) => /\bPro\b/.test(text));
    expect(offenders).toEqual([]);
  });
});

describe("recovery actions", () => {
  it("only ever names tools that exist", () => {
    for (const error of SAMPLES) {
      for (const action of error.actions) {
        if (action.kind === "use-tool") {
          expect(getRoute(action.slug), action.slug).toBeDefined();
        }
      }
    }
  });

  it("offers a real next step for every failure except cancellation", () => {
    for (const error of SAMPLES) {
      expect(error.actions.length, error.code).toBeGreaterThan(0);
      expect(error.actions.some((action) => action.kind === "report"), error.code).toBe(true);
    }
  });

  it("routes a video dropped on a GIF tool to a tool that takes video", () => {
    const slug = suggestToolFor("video", "mp4", "gif-compressor");
    expect(slug).not.toBeNull();
    expect(getRoute(slug!)?.inputFormats).toContain("mp4");
  });

  it("does not tell an iOS user to switch browsers", () => {
    // Every iOS browser is WebKit with the same memory ceiling, so "try another
    // browser" would be a loop with no exit.
    const error = browserUnsupportedError({ reason: "ios-video-budget" });
    expect(error.actions.some((action) => action.kind === "try-other-browser")).toBe(false);
  });

  it("offers a degraded run whenever one fits", () => {
    const error = tooLargeError({
      degraded: {
        fps: 8,
        width: 240,
        height: 135,
        frames: 60,
        decodeFrames: 60,
        frameBufferBytes: 15_552_000,
        downgraded: true,
        truncated: true,
        encoder: "gifski",
      },
      requestedFrames: 900,
      budgetMb: 30,
    });
    expect(error.actions.some((action) => action.kind === "run-degraded")).toBe(true);
    expect(error.params?.degradedSeconds).toBe(7.5);
  });
});
