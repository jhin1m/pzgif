/**
 * Video decoding, via `mediabunny`.
 *
 * One library replaces `mp4box.js`, `mp4-muxer` and `webm-muxer` — the latter
 * two deprecated by their own author. Beyond that consolidation, `CanvasSink`
 * with `poolSize: 1` makes decode memory a constant rather than a function of
 * clip length, which is the biggest lever available on the memory ceiling and it
 * costs nothing.
 *
 * ── Rotation ────────────────────────────────────────────────────────────────
 * `CanvasSink`'s `rotation` option defaults to the container's own metadata, so
 * this file honours portrait video by *not overriding it*. Passing 0, or reading
 * `codedWidth` instead of `displayWidth`, is how every portrait phone upload ends
 * up sideways — and portrait phone video is the single most common real-world
 * input. `portrait-rotated.mp4` exists to catch exactly that, with a dimension
 * check rather than a glance.
 */

import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { canDecodeCodec } from "../capability";
import { FrameGeometry } from "../ops/geometry";
import { selectsFrame, trimmedSpan } from "../ops/frame-select";
import type { DecodedFrame, FrameSource, InputProbe, TimingSpec } from "../types";

/** Matches the GIF decoder's clamp: browsers round shorter delays up to 100 ms. */
const MIN_DELAY_MS = 20;

export interface VideoProbe extends InputProbe {
  /** Coded frame size, before container rotation. Diagnostics only. */
  codedWidth: number;
  codedHeight: number;
}

/**
 * Whether this track can actually be decoded here, not merely demuxed.
 *
 * G7 measured why the distinction matters: every container demuxed on every
 * engine, but HEVC — what an iPhone actually records — failed to *decode* on
 * Chromium and Firefox. A job that only checked the container would accept an
 * iPhone `.mov` and then die mid-decode, which is the generic `decode-failed`
 * bucket the error taxonomy exists to keep files out of.
 *
 * mediabunny's own `canDecode()` is asked first because it knows about the
 * container's codec parameters; `VideoDecoder.isConfigSupported` is the
 * cross-check. The method is called defensively rather than as a hard
 * dependency: a library-version difference here should degrade to the WebCodecs
 * probe, not fail the build.
 */
async function isDecodable(track: unknown, codec: string | null): Promise<boolean> {
  const own = (track as { canDecode?: () => Promise<boolean> }).canDecode;
  if (typeof own === "function") {
    try {
      if (await own.call(track)) return true;
    } catch {
      // Fall through to the WebCodecs probe.
    }
  }
  return codec ? canDecodeCodec(codec) : false;
}

export async function probeVideo(file: Blob, declaredExtension: string | null): Promise<VideoProbe> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("No video track in this file");

  const rotation = await track.getRotation();
  const durationSec = await input.computeDuration();
  const codec = await track.getCodecParameterString();

  const decodable = await isDecodable(track, codec);

  return {
    format: "video",
    declaredExtension,
    codedWidth: track.codedWidth,
    codedHeight: track.codedHeight,
    width: track.displayWidth,
    height: track.displayHeight,
    rotationDegrees: rotation,
    durationSec,
    frameCount: null,
    codec,
    decodable,
  };
}

export interface VideoSourceOptions {
  timing?: TimingSpec;
  maxFrames?: number;
}

/**
 * Streams frames at output size, resampled to `fps`.
 *
 * The sink is asked for `geometry.decodeScale` rather than the final width: when
 * a crop is coming, shrinking the whole frame to the output width first would
 * shrink the crop region with it and the result would be soft. This lands the
 * crop region at exactly the output size while the sink still does the expensive
 * part of the scaling.
 */
export async function videoFrameSource(
  file: Blob,
  geometry: FrameGeometry,
  fps: number,
  { timing = {}, maxFrames }: VideoSourceOptions = {},
): Promise<FrameSource> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("No video track in this file");

  const clipSec = await input.computeDuration();
  const sinkWidth = Math.max(1, Math.round(track.displayWidth * geometry.decodeScale));
  const sinkHeight = Math.max(1, Math.round(track.displayHeight * geometry.decodeScale));

  // The trim is a seek, not a filter. `canvases(from, to)` starts the decoder at
  // the nearest keyframe before `from`, so a three-second cut out of a
  // sixty-second clip costs three seconds of decode rather than sixty.
  const span = trimmedSpan(clipSec, timing) ?? { fromSec: 0, durationSec: clipSec };
  const durationSec = span.durationSec;

  const sampled = Math.max(1, Math.floor(durationSec * fps));
  let selected = 0;
  for (let index = 0; index < sampled; index += 1) {
    if (selectsFrame(index, timing)) selected += 1;
  }
  const total = maxFrames ? Math.min(maxFrames, selected) : selected;

  return {
    width: geometry.outputWidth,
    height: geometry.outputHeight,
    frameCount: total,
    async *frames(signal?: AbortSignal): AsyncGenerator<DecodedFrame> {
      const sink = new CanvasSink(track, {
        width: sinkWidth,
        height: sinkHeight,
        fit: "contain",
        // `rotation` is deliberately not passed: its default is the container's
        // own metadata, which is exactly what must be honoured.
        poolSize: 1,
      });

      const out = geometry.createOutputCanvas();
      const outCtx = out.getContext("2d", { willReadFrequently: true });
      if (!outCtx) throw new Error("OffscreenCanvas 2D context unavailable");

      const stepSec = 1 / fps;
      const fallbackDurationMs = Math.round(1000 / fps);
      let sampleIndex = 0;
      let emitted = 0;
      // The clock starts at the trim, not at zero.
      //
      // mediabunny documents `startTimestamp` as inclusive and says nothing
      // about whether a sample before it can be handed back — a decoder has to
      // seek to the keyframe at or before the cut, and whether those leading
      // frames are filtered out or yielded is an implementation detail we have
      // not verified against its source. Starting the clock at `fromSec` is
      // correct under either reading: the guard is load-bearing if they are
      // yielded and a no-op if they are not, and getting it wrong the other way
      // puts up to a keyframe interval of unrequested footage at the head of the
      // output.
      let nextSampleSec = span.fromSec;
      // Iterating in presentation order and sampling against a clock rather than
      // trusting decode order: Safari below 26.4 can emit H.264 out of order, and
      // a resampler that assumes monotonic timestamps silently reorders the
      // animation instead of failing.
      let lastTimestamp = -Infinity;

      // One frame of lookahead, so each frame's duration is the real gap to the
      // next one rather than a constant derived from the requested frame rate.
      // Without it, a 10 fps source asked for 15 fps emits fewer frames that each
      // claim 66 ms, and the GIF plays faster than the video it came from.
      let pending: { rgba: Uint8Array; timestamp: number } | null = null;

      const takeSnapshot = (): Uint8Array =>
        new Uint8Array(
          outCtx.getImageData(0, 0, geometry.outputWidth, geometry.outputHeight).data.buffer,
        );

      // The range is passed only when a trim asked for one. `canvases()` treats
      // its end as exclusive, so handing it the clip's own computed duration on
      // an untrimmed job can drop the final frame — a behaviour change for every
      // existing caller, in exchange for nothing.
      const canvases = timing.trimSec
        ? sink.canvases(span.fromSec, span.fromSec + durationSec)
        : sink.canvases();

      for await (const wrapped of canvases) {
        if (signal?.aborted) return;
        if (emitted >= total) return;
        if (wrapped.timestamp < lastTimestamp) continue;
        lastTimestamp = wrapped.timestamp;
        if (wrapped.timestamp + 1e-6 < nextSampleSec) continue;

        // Advance the clock **to** the accepted frame, not by one step from where
        // it was. A variable-frame-rate source — every screen recording, most
        // phone video — leaves gaps, and a clock that only ever adds one step
        // falls permanently behind after the first gap, after which every
        // remaining frame is accepted and the clip ends early.
        nextSampleSec = Math.max(nextSampleSec + stepSec, wrapped.timestamp + stepSec);

        const index = sampleIndex;
        sampleIndex += 1;
        if (!selectsFrame(index, timing)) continue;

        geometry.apply(wrapped.canvas, sinkWidth, sinkHeight, out);
        const rgba = takeSnapshot();

        if (pending) {
          const gapMs = Math.round((wrapped.timestamp - pending.timestamp) * 1000);
          emitted += 1;
          yield {
            rgba: pending.rgba,
            durationMs: gapMs >= MIN_DELAY_MS ? gapMs : fallbackDurationMs,
          };
          if (emitted >= total) return;
        }
        pending = { rgba, timestamp: wrapped.timestamp };
      }

      // The last frame has no successor to measure against, so it keeps the
      // requested step. That is a real interval, not a guess about content.
      if (pending && emitted < total) {
        yield { rgba: pending.rgba, durationMs: fallbackDurationMs };
      }
    },
  };
}
