"use client";

import { useCallback, useMemo } from "react";
import {
  GifWorkbench,
  type ResultMediaContext,
  type WorkbenchContext,
  type WorkbenchOutput,
} from "@/components/tool/gif-workbench";
import {
  numberValue,
  stringValue,
  type ControlDef,
  type ControlValues,
} from "@/components/tool/settings/control-schema";
import { ToolUnavailable } from "@/components/tool/tool-unavailable";
import { VideoEmbedSnippet } from "@/components/tool/video-embed-snippet";
import { useCapabilities } from "@/hooks/use-capabilities";
import { TIER_BUDGETS } from "@/lib/media/limits";
import type { InputProbe, JobSpec } from "@/lib/media/types";
import { fillNote, type ToolContent } from "@/lib/tools/content";

/**
 * GIF to MP4 — the conversion people make when a GIF is destroying a page.
 *
 * ── Everything hard about this tool is in `encode/video.ts` ────────────────
 * The three traps `phase-07` names — `avc` rather than `annexb` framing, even
 * dimensions for yuv420p, and no fake silent audio track — are all handled in
 * the encoder, along with the codec probe. What is left here is a page: two
 * settings, a `<video>` in the result frame, and the embed snippet.
 *
 * ── Why the container is not decided here ──────────────────────────────────
 * The encoder asks `VideoEncoder.isConfigSupported()` and walks a chain down to
 * VP8 in WebM. A device with no AVC encoder therefore produces a WebM, and the
 * download has to be named for what it is: `output()` below reads the finished
 * blob's own MIME type rather than assuming the request was honoured. Naming a
 * WebM `.mp4` produces a file that nothing on the receiving end will open.
 *
 * ── The snippet is the deliverable, not a nicety ───────────────────────────
 * Almost nobody wants an MP4 for its own sake; they want the thing that replaces
 * a GIF embed without breaking. That is four attributes, and getting any of them
 * wrong means it does not autoplay or it hijacks the screen on iOS. No
 * competitor hands them over.
 */

const SLUG = "gif-to-mp4";

const MIN_WIDTH = 160;
const FALLBACK_WIDTH = 640;

const DEFAULT_VALUES: ControlValues = {
  width: FALLBACK_WIDTH,
  quality: "balanced",
};

/**
 * Bitrate multipliers over the encoder's own per-pixel default.
 *
 * Offered as three named choices rather than a kilobits-per-second field: the
 * number that matters to someone replacing a GIF embed is "does it still look
 * right and is it small", and nobody arrives at this page holding a bitrate.
 * `encodeVideo` computes the base figure from the real frame rate and pixel
 * count, so these scale a measurement rather than replacing it.
 */
const QUALITY_SCALE: Readonly<Record<string, number>> = {
  crisp: 1.8,
  balanced: 1,
  small: 0.55,
};

/** The container the produced blob actually is, read off the blob. */
function outputFor(blob: Blob | null): WorkbenchOutput {
  // WebM only when the encoder said so. `blob.type` is set by `encodeVideo` from
  // the codec it chose, which is the only place the answer exists.
  return blob?.type === "video/webm"
    ? { format: "webm", extension: ".webm" }
    : { format: "mp4", extension: ".mp4" };
}

export function GifToMp4Tool({
  content,
  trustLine,
  children,
}: {
  content: ToolContent;
  trustLine: React.ReactNode;
  children: React.ReactNode;
}) {
  const capabilities = useCapabilities();
  const budget = TIER_BUDGETS[capabilities?.tier ?? "desktop"];

  /**
   * True once the device has answered and it has no WebCodecs video encoder.
   *
   * Firefox for Android is the measured case. Unlike `mp4-to-gif`'s iOS refusal
   * this is not about memory — the API is simply absent, and no setting will
   * conjure it — so the state says so before a file is chosen rather than after.
   */
  const encoderMissing = capabilities !== null && !capabilities.videoEncode;

  const controls = useCallback(
    ({ probe }: WorkbenchContext): readonly ControlDef[] => {
      const sourceWidth = probe?.width ?? FALLBACK_WIDTH;
      return [
        {
          kind: "slider",
          id: "width",
          label: content.controls.width.label,
          hint: content.controls.width.hint,
          min: MIN_WIDTH,
          max: Math.max(MIN_WIDTH + 2, Math.min(sourceWidth, budget.defaultMaxWidth)),
          unit: " px",
          showNumberInput: true,
        },
        {
          kind: "select",
          id: "quality",
          label: content.controls.quality.label,
          hint: content.controls.quality.hint,
          options: content.controls.quality.options ?? [],
        },
      ];
    },
    [budget.defaultMaxWidth, content.controls],
  );

  const buildSpec = useCallback(
    (values: ControlValues, probe: InputProbe | null): JobSpec => {
      const width = Math.min(
        numberValue(values, "width", FALLBACK_WIDTH),
        probe?.width ?? FALLBACK_WIDTH,
      );
      const scale = QUALITY_SCALE[stringValue(values, "quality", "balanced")] ?? 1;

      return {
        toolSlug: SLUG,
        geometry: { targetWidth: width },
        // A GIF keeps its own per-frame delays; nothing here retimes it. The
        // encoder derives the frame rate from those delays, which is what makes
        // the MP4 play at the speed the GIF did.
        timing: {},
        output: {
          kind: "video",
          container: "mp4",
          // Omitted at "balanced" so the encoder's measured per-pixel figure is
          // used unmodified rather than being multiplied by one.
          ...(scale === 1
            ? {}
            : { bitrateKbps: Math.round(bitrateBaseKbps(width, probe) * scale) }),
        },
      };
    },
    [],
  );

  const valuesForProbe = useCallback(
    (probe: InputProbe, current: ControlValues): ControlValues => ({
      ...current,
      // "No change" is where the slider starts, capped by what the tier admits.
      width: Math.max(
        MIN_WIDTH,
        Math.min(probe.width, TIER_BUDGETS[capabilities?.tier ?? "desktop"].defaultMaxWidth),
      ),
    }),
    [capabilities?.tier],
  );

  const notice = useCallback(
    ({ probe, values }: WorkbenchContext) => {
      if (!probe) return null;
      const width = numberValue(values, "width", FALLBACK_WIDTH);
      // Stated because the engine will do it silently otherwise, and a result
      // one pixel narrower than the number in the box reads as a bug. H.264
      // stores colour at half resolution and rejects odd dimensions.
      const evened = Math.max(2, width & ~1);
      const height = Math.max(
        2,
        Math.round((evened * probe.height) / Math.max(1, probe.width)) & ~1,
      );

      return (
        <p className="tabular mt-1 text-caption text-fg-secondary" data-even-note>
          {fillNote(content.notes?.dimensions ?? "", { width: evened, height })}
        </p>
      );
    },
    [content.notes],
  );

  /** The result is a video, so the frame holds a `<video>`, not an `<img>`. */
  const resultMedia = useCallback(
    ({ url, alt }: ResultMediaContext) => (
      <video
        src={url}
        // The four attributes the snippet also carries. Showing the result under
        // exactly the conditions it will be embedded under is the only way to
        // notice here, rather than on their site, that one of them is missing.
        autoPlay
        muted
        loop
        playsInline
        aria-label={alt}
        className="size-full object-contain"
      />
    ),
    [],
  );

  const accept = useMemo(() => ["gif"] as const, []);

  return (
    <GifWorkbench
      slug={SLUG}
      content={content}
      trustLine={trustLine}
      accept={accept}
      defaultValues={DEFAULT_VALUES}
      valuesForProbe={valuesForProbe}
      controls={controls}
      buildSpec={buildSpec}
      downloadSuffix=""
      output={outputFor}
      resultMedia={resultMedia}
      notice={notice}
      unavailable={
        encoderMissing ? (
          <ToolUnavailable
            title={content.notes?.unavailableTitle ?? ""}
            body={content.notes?.unavailableBody ?? ""}
          />
        ) : undefined
      }
      idleReason={encoderMissing ? content.notes?.unavailableTitle : undefined}
      changeableSettings={["width"]}
      applySetting={(setting, value, setValue) => {
        if (setting === "width") setValue("width", value);
      }}
    >
      <EmbedSnippetBlock content={content} />
      {children}
    </GifWorkbench>
  );
}

/**
 * The encoder's own bits-per-pixel-second figure, recomputed here so the three
 * quality choices scale a real number rather than a guess.
 *
 * Kept in step with `BITS_PER_PIXEL_SECOND` in `encode/video.ts`; the frame rate
 * comes from the GIF's stated duration and frame count, which is what the
 * encoder will derive it from too.
 */
function bitrateBaseKbps(width: number, probe: InputProbe | null): number {
  const height =
    probe && probe.width > 0
      ? Math.round((width * probe.height) / probe.width)
      : Math.round(width * 0.5625);
  const frameRate =
    probe && probe.frameCount && probe.durationSec
      ? Math.max(1, Math.round(probe.frameCount / probe.durationSec))
      : 15;
  return Math.round((width * height * frameRate * 0.09) / 1000);
}

/**
 * The snippet block, rendered above the explainer.
 *
 * Outside the result panel on purpose: the panel's height is reserved against
 * measured numbers at four breakpoints, and adding a code block inside it would
 * overflow that reservation and return CLS to the page. Here it is ordinary page
 * flow below the fixed region, where growing costs nothing.
 */
function EmbedSnippetBlock({ content }: { content: ToolContent }) {
  return (
    <VideoEmbedSnippet
      className="mb-10"
      fileName={content.notes?.embedFileName ?? "your-animation.mp4"}
      label={content.notes?.embedLabel ?? ""}
      caption={content.notes?.embedCaption ?? ""}
    />
  );
}
