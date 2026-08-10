/**
 * The error taxonomy. Every code names a next step; none of them is a dead end.
 *
 * ── Why these carry codes and not sentences ─────────────────────────────────
 * The engine runs inside a worker, where next-intl does not exist and should
 * not. So an error travels as `{ code, params, actions }` and the React layer
 * renders it. That also stops the engine from becoming a second, untranslated
 * copy of the UI copy — the failure mode where a message says one thing on the
 * page and another in a toast.
 *
 * ── Two rules that are checked, not merely stated ───────────────────────────
 *  - **No recovery may mention Pro.** The Pro tier is explicitly out of MVP
 *    scope, so routing a user there routes them nowhere. `errors.test.ts` greps
 *    the message catalogue for it.
 *  - **Every `use-tool` action must name a route that exists.** The wireframe
 *    currently points a rejected PNG at "PNG to GIF", which is not one of the
 *    nine tools — a dead end written by the very copy that exists to prevent
 *    dead ends. Resolving through the registry makes that unrepresentable.
 */

import { ALL_ROUTES, getRoute, type MediaFormat } from "@/lib/tools/registry";
import type {
  AcceptedPlan,
  InputFormat,
  MediaError,
  MediaErrorCode,
  RecoveryAction,
} from "./types";

/**
 * The next-intl key for a specific failure.
 *
 * `browser-unsupported` fans out by reason because the four cases need different
 * copy and one of them must *not* suggest another browser: an iOS user sent to
 * "try Chrome" lands in another WebKit shell with the same memory ceiling, which
 * is a loop rather than a recovery.
 */
export function messageKeyFor(error: MediaError): string {
  if (error.code === "browser-unsupported") {
    const reason = String(error.params?.reason ?? "no-video-decoder");
    const camel = reason.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    return `engine.errors.browserUnsupported.${camel}`;
  }
  return ERROR_MESSAGE_KEYS[error.code];
}

/** next-intl keys, one per code. Kept beside the codes so drift is visible. */
export const ERROR_MESSAGE_KEYS: Record<MediaErrorCode, string> = {
  "unsupported-format": "engine.errors.unsupportedFormat",
  "too-large-for-device": "engine.errors.tooLargeForDevice",
  "decode-failed": "engine.errors.decodeFailed",
  "encode-failed": "engine.errors.encodeFailed",
  oom: "engine.errors.oom",
  cancelled: "engine.errors.cancelled",
  "browser-unsupported": "engine.errors.browserUnsupported",
};

/** Reporting is offered on every failure except the one the user asked for. */
function withReport(code: MediaErrorCode, actions: RecoveryAction[]): RecoveryAction[] {
  return code === "cancelled" ? actions : [...actions, { kind: "report" }];
}

function toMediaFormat(format: InputFormat, extension: string | null): MediaFormat | null {
  if (format === "gif") return "gif";
  if (format === "webp") return "webp";
  if (format === "video") {
    if (extension === "mov" || extension === "webm") return extension;
    return "mp4";
  }
  if (extension === "png") return "png";
  return null;
}

/**
 * Finds a tool that accepts this input, preferring one the current tool links to.
 *
 * Preferring a related route keeps the suggestion inside the same task — someone
 * who dropped an MP4 on the GIF compressor wants MP4 → GIF, not the frame
 * splitter — while still resolving through the registry, so a suggestion can
 * never name a page that does not exist.
 */
export function suggestToolFor(
  format: InputFormat,
  extension: string | null,
  fromSlug?: string,
): string | null {
  const wanted = toMediaFormat(format, extension);
  if (!wanted) return null;

  const accepts = (slug: string) => getRoute(slug)?.inputFormats.includes(wanted) === true;

  const current = fromSlug ? getRoute(fromSlug) : undefined;
  const related = current?.related.find(accepts);
  if (related) return related;

  return ALL_ROUTES.find((route) => route.slug !== fromSlug && accepts(route.slug))?.slug ?? null;
}

export function unsupportedFormatError(options: {
  format: InputFormat;
  extension: string | null;
  fromSlug?: string;
  detail?: string;
}): MediaError {
  const suggestion = suggestToolFor(options.format, options.extension, options.fromSlug);
  const actions: RecoveryAction[] = suggestion
    ? [{ kind: "use-tool", slug: suggestion }]
    : [];

  return {
    code: "unsupported-format",
    params: {
      format: options.extension ?? options.format,
      // The UI needs the destination's own name; it must come from the registry
      // rather than being spelled again here.
      suggestion: suggestion ? (getRoute(suggestion)?.name ?? suggestion) : "",
    },
    actions: withReport("unsupported-format", actions),
    detail: options.detail,
  };
}

/**
 * Refusal before decode — the only refusal shape allowed to exist.
 *
 * `degraded` is the whole point. A refusal with no action is a permanent exit
 * for the highest-intent user in the funnel: someone who chose the tool, chose a
 * file, and was told no. Whenever *any* plan fits the budget, the refusal offers
 * to run it, with its real numbers stated up front.
 */
export function tooLargeError(options: {
  degraded: AcceptedPlan | null;
  /** Null when the container never stated a duration — say nothing, not a guess. */
  requestedFrames: number | null;
  budgetMb: number;
  detail?: string;
}): MediaError {
  const actions: RecoveryAction[] = [];
  if (options.degraded) {
    actions.push({ kind: "run-degraded", plan: options.degraded });
    actions.push({ kind: "change-setting", setting: "width", value: options.degraded.width });
  } else {
    // Nothing fits even at the smallest rung, so the only lever left is length.
    actions.push({
      kind: "change-setting",
      setting: "frames",
      value: options.requestedFrames ?? 0,
    });
  }

  return {
    code: "too-large-for-device",
    params: {
      budgetMb: options.budgetMb,
      ...(options.requestedFrames === null ? {} : { frames: options.requestedFrames }),
      ...(options.degraded
        ? {
            degradedWidth: options.degraded.width,
            degradedFps: options.degraded.fps,
            degradedSeconds: +(options.degraded.frames / options.degraded.fps).toFixed(1),
          }
        : {}),
    },
    actions: withReport("too-large-for-device", actions),
    detail: options.detail,
  };
}

export function decodeFailedError(options: {
  canOfferFallback: boolean;
  detail?: string;
}): MediaError {
  const actions: RecoveryAction[] = options.canOfferFallback
    ? [{ kind: "install-fallback-decoder" }]
    : [];
  return {
    code: "decode-failed",
    actions: withReport("decode-failed", actions),
    detail: options.detail,
  };
}

export function encodeFailedError(options: {
  suggestedColours?: number;
  detail?: string;
}): MediaError {
  return {
    code: "encode-failed",
    params: { colours: options.suggestedColours ?? 128 },
    actions: withReport("encode-failed", [
      { kind: "change-setting", setting: "colours", value: options.suggestedColours ?? 128 },
    ]),
    detail: options.detail,
  };
}

export function oomError(options: { suggestedWidth: number; detail?: string }): MediaError {
  return {
    code: "oom",
    params: { width: options.suggestedWidth },
    actions: withReport("oom", [
      { kind: "change-setting", setting: "width", value: options.suggestedWidth },
    ]),
    detail: options.detail,
  };
}

export const cancelledError = (): MediaError => ({
  code: "cancelled",
  actions: [],
});

/**
 * The device cannot do this at all, and no setting change will help.
 *
 * `reason` distinguishes the real cases, because they deserve different copy:
 * Firefox for Android has no `VideoDecoder` whatsoever, while iOS has the codecs
 * and not the memory. Telling an iOS user to switch browsers would send them to
 * another WebKit shell with the same ceiling.
 *
 * `no-image-decoder` was a fourth reason until Phase 7. It said "this browser
 * cannot read animated WebP", which stopped being true of any browser once
 * `decode/webp-riff.ts` replaced `ImageDecoder` — so it was removed rather than
 * left as a message nothing can emit.
 */
export function browserUnsupportedError(options: {
  reason: "no-video-decoder" | "no-video-encoder" | "ios-video-budget";
  detail?: string;
}): MediaError {
  const actions: RecoveryAction[] =
    options.reason === "ios-video-budget" ? [] : [{ kind: "try-other-browser" }];
  return {
    code: "browser-unsupported",
    params: { reason: options.reason },
    actions: withReport("browser-unsupported", actions),
    detail: options.detail,
  };
}

/** Normalises a thrown value into the taxonomy. Nothing escapes as a raw Error. */
export function toMediaError(thrown: unknown, suggestedWidth = 320): MediaError {
  if (thrown && typeof thrown === "object" && "code" in thrown && "actions" in thrown) {
    return thrown as MediaError;
  }
  const message = thrown instanceof Error ? thrown.message : String(thrown);

  // WASM allocation failure surfaces as a RangeError from `Memory.grow` or as
  // "Out of memory" from the engine; both mean the same thing to the user.
  if (/out of memory|Memory\.grow|RangeError|allocation failed/i.test(message)) {
    return oomError({ suggestedWidth, detail: message });
  }
  if (thrown instanceof DOMException && thrown.name === "AbortError") {
    return cancelledError();
  }
  return encodeFailedError({ detail: message });
}
