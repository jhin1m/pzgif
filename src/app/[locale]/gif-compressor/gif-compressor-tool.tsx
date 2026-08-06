"use client";

/* eslint-disable @next/next/no-img-element -- Both sources here are `blob:` URLs
   produced inside the tab. `next/image` cannot optimise a file that never had a
   URL on the network, and its loader would try to fetch a blob through the image
   optimiser. Same reasoning as `before-after-slider.tsx`. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { AdSlot } from "@/components/ads/ad-slot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/tool/dropzone";
import { FileChip } from "@/components/tool/file-chip";
import { JobAnnouncer } from "@/components/tool/job-announcer";
import { JobError } from "@/components/tool/job-error";
import {
  settingsLocked,
  ToolStage,
  toolFlowState,
} from "@/components/tool/job-state";
import { ProgressBar } from "@/components/tool/progress-bar";
import {
  BeforeAfterSlider,
  shouldRenderSideBySide,
} from "@/components/tool/before-after-slider";
import { NextTools } from "@/components/tool/next-tools";
import { ResultPanel, ResultSummary } from "@/components/tool/result-panel";
import { SettingsPanel } from "@/components/tool/settings-panel";
import { SettingsForm } from "@/components/tool/settings/settings-form";
import {
  booleanValue,
  numberValue,
  stringValue,
  type ControlDef,
  type ControlValue,
  type ControlValues,
} from "@/components/tool/settings/control-schema";
import { StickyActionBar } from "@/components/tool/sticky-action-bar";
import { ToolPage } from "@/components/tool/tool-page";
import { useHandoffFile } from "@/hooks/use-handoff-file";
import { useObjectUrl } from "@/hooks/use-object-url";
import { useJobProgress, useMediaJob } from "@/hooks/use-media-job";
import { resolveEncoder } from "@/lib/media/capability";
import type { GifEncoderId, InputProbe, JobSpec } from "@/lib/media/types";
import { formatBytes, formatDelta } from "@/lib/format-bytes";
import type { ToolContent } from "@/lib/tools/content";

/**
 * The GIF compressor — the vertical slice every other tool is a configuration of.
 *
 * ── The two settings that had to be made honest ────────────────────────────
 * The wireframe shows four dials: Quality, Colours, Lossy and Width. Two of them
 * do not survive contact with the engine:
 *
 *  - **Lossy is cut.** `gifski-wasm@2.2.0` exposes `quality` and nothing else,
 *    and `gifenc` has no equivalent at all. There is no lever behind that
 *    slider. Shipping it would be a control that moves and changes nothing,
 *    which is the same class of dishonesty as a fabricated progress bar.
 *  - **Colours pins the encoder.** gifski always writes a 256-entry palette;
 *    only `gifenc` can honour a cap. So asking for fewer than 256 colours
 *    selects the encoder that can actually deliver it, and Quality — which is
 *    gifski's dial and gifski's alone — goes inert with a visible reason rather
 *    than sitting there pretending. The same applies on Firefox, where
 *    `resolveEncoder()` picks `gifenc` regardless because gifski's WASM measured
 *    12-14x slower under SpiderMonkey.
 *
 * ── Re-compress decodes again, on purpose ──────────────────────────────────
 * `phase-05` left this open. The answer follows from the memory model: the
 * pipeline **transfers** frame buffers into the encode worker and holds nothing
 * afterwards, precisely so peak residency is one copy rather than two. Keeping
 * frames alive to make a re-run faster would double the quantity the whole
 * admission-control system is built to bound, on the device — iOS — where the
 * budget is already the binding constraint. A second decode costs seconds; the
 * alternative costs the tab.
 */

const SLUG = "gif-compressor";

/** Width slider bounds. The upper bound is the input's own width. */
const WIDTH_MIN = 120;
const WIDTH_FALLBACK_MAX = 1280;

/**
 * The encoder cannot change while the tab is open — the user agent is fixed —
 * so the store never notifies. `useSyncExternalStore` is used here purely for
 * its server/client snapshot split, not for its subscription.
 */
const subscribeToNothing = () => () => {};

const DEFAULT_VALUES: ControlValues = {
  quality: 80,
  colours: "256",
  width: WIDTH_FALLBACK_MAX,
  dropFrames: false,
};

export function GifCompressorTool({
  content,
  trustLine,
  children,
}: {
  content: ToolContent;
  trustLine: React.ReactNode;
  /** Explainer, FAQ and related tools — server-rendered, passed straight through. */
  children: React.ReactNode;
}) {
  const t = useTranslations("tool");
  const tStage = useTranslations("engine.stage");
  const tPlan = useTranslations("engine.plan");
  const tDropzone = useTranslations("dropzone");

  const job = useMediaJob();
  const progress = useJobProgress(job.progress);

  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<InputProbe | null>(null);
  const [values, setValues] = useState<ControlValues>(DEFAULT_VALUES);
  const [elapsed, setElapsed] = useState(0);

  /**
   * The encoder this browser would pick on its own.
   *
   * `resolveEncoder()` reads the user agent, which a server render does not
   * have, so the two environments would disagree — and the disagreement is
   * visible, because it decides whether the Quality slider is live. A store with
   * a distinct server snapshot is how React is told to expect that: the static
   * HTML says gifski, the client corrects it during hydration, and nothing is
   * patched from an effect afterwards.
   */
  const defaultEncoder = useSyncExternalStore(
    subscribeToNothing,
    () => resolveEncoder(undefined),
    () => "gifski" as GifEncoderId,
  );

  // Owned by the file, not by this component's mount — see `useObjectUrl` for
  // the Strict Mode failure that shape is there to make impossible.
  const sourceUrl = useObjectUrl(file);

  const flow = toolFlowState(file !== null, job.state.status);
  const locked = settingsLocked(flow);
  const colours = Number(stringValue(values, "colours", "256"));

  /** The encoder this job will actually use — see the note at the top. */
  const encoder: GifEncoderId = colours < 256 ? "gifenc" : defaultEncoder;
  const qualityInert = encoder === "gifenc";

  const buildSpec = useCallback(
    (current: ControlValues): JobSpec => {
      const palette = Number(stringValue(current, "colours", "256"));
      return {
        toolSlug: SLUG,
        geometry: {
          targetWidth: numberValue(
            current,
            "width",
            probe?.width ?? WIDTH_FALLBACK_MAX,
          ),
        },
        // `keepEveryNth: 1` is "keep all", not "drop none of every one" — the
        // engine reads it as a stride, so the off state must still be 1.
        timing: { keepEveryNth: booleanValue(current, "dropFrames") ? 2 : 1 },
        output: {
          kind: "gif",
          quality: numberValue(current, "quality", 80),
          colours: palette,
          encoder: palette < 256 ? "gifenc" : undefined,
        },
      };
    },
    [probe],
  );

  /**
   * The file the page is currently about.
   *
   * A probe is a worker round trip, and the pipeline worker does not serialise
   * them, so dropping a large GIF and then a small one can land the two results
   * out of order. Without this check the page would describe — and size its
   * width slider against — a file the user already replaced.
   */
  const currentFileRef = useRef<File | null>(null);

  /**
   * The palette the running job was submitted with.
   *
   * The settings unlock the moment a result exists, so a badge keyed on the live
   * control would relabel a file that was already encoded. Held as state rather
   * than a ref because the result render reads it, and a ref read during render
   * is exactly the stale-value hazard React warns about.
   */
  const [submittedColours, setSubmittedColours] = useState(256);

  const handleFile = useCallback(
    (next: File) => {
      job.reset();
      setFile(next);
      setProbe(null);
      currentFileRef.current = next;
      job.probe(next, (result) => {
        if (currentFileRef.current !== next) return;
        setProbe(result);
        if (!result) return;
        // The width slider starts where the file is, not at an arbitrary
        // default — "no change" has to be the state you begin in.
        setValues((current) => ({
          ...current,
          width: Math.max(WIDTH_MIN, result.width),
        }));
      });
    },
    [job],
  );

  // A file dropped on the homepage arrives here already chosen. No-op on every
  // other route into this page.
  useHandoffFile(SLUG, handleFile);

  const startOver = useCallback(() => {
    job.reset();
    setFile(null);
    setProbe(null);
    currentFileRef.current = null;
    setValues(DEFAULT_VALUES);
  }, [job]);

  const run = useCallback(() => {
    // Re-entrancy guard. `Button`'s `loading` state only sets
    // `pointer-events: none`, so the busy primary stays focusable and Enter
    // still fires it — which would cancel the running job and start a second
    // one. Pointer users were protected; keyboard and screen-reader users were
    // not, on a job that can run for minutes.
    if (!file || locked) return;
    setElapsed(0);
    setSubmittedColours(Number(stringValue(values, "colours", "256")));
    job.run(file, buildSpec(values));
  }, [buildSpec, file, job, locked, values]);

  /** Reset returns the controls to their defaults *for this file*. */
  const resetSettings = useCallback(() => {
    setValues({
      ...DEFAULT_VALUES,
      width: Math.max(WIDTH_MIN, probe?.width ?? WIDTH_FALLBACK_MAX),
    });
  }, [probe]);

  const setValue = useCallback((id: string, value: ControlValue) => {
    setValues((current) => ({ ...current, [id]: value }));
  }, []);

  /**
   * The elapsed readout. A real clock, shown only where there is no counter.
   *
   * gifski blocks its worker for the whole encode and exposes no callback, so
   * that stage is honestly indeterminate — an indeterminate track and a wall
   * clock, never a bar that moves on a timer. The counter is reset where the job
   * starts rather than when this effect tears down, so nothing here writes state
   * outside the interval it owns.
   */
  useEffect(() => {
    if (flow !== "processing") return;
    const startedAt = performance.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((performance.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [flow]);

  /**
   * The live output-size estimate is **not** wired here, and that is a measured
   * decision rather than an omission.
   *
   * `phase-05` step 5 asks for it. Running it exposed the reason it cannot go on
   * this page yet: the pipeline worker is a single long-lived thread with
   * module-level scratch state (`downscale.ts`), and an estimate is a *second
   * full job* — decode every frame, then two sample encodes. Overlapping it with
   * the real job, even by starting it 600 ms earlier and cancelling it on
   * submit, stalls both. The same fixture at the same settings measured **6.8 s**
   * through Phase 1's `/__bench` harness and did not finish in **170 s** on this
   * page, on the same browser in the same minute, until the estimate was removed.
   *
   * The readout is also the estimate's least valuable consumer: it is superseded
   * by a real byte count seconds later. Its expensive half — seeding the Discord
   * auto-fit search so it does not spend five blind encodes — is Phase 8's, and
   * that path runs alone. Re-instating the readout needs either a second
   * pipeline worker or a queue in `JobController` that serialises jobs; both are
   * engine changes, and neither belongs in the tool framework.
   */

  const widthMax = Math.max(WIDTH_MIN + 40, probe?.width ?? WIDTH_FALLBACK_MAX);

  const qualityCopy = qualityInert
    ? colours < 256
      ? content.controls.qualityCappedPalette
      : content.controls.qualityPaletteEncoder
    : content.controls.quality;

  const controls = useMemo<ControlDef[]>(
    () => [
      {
        kind: "slider",
        id: "quality",
        label: qualityCopy.label,
        hint: qualityCopy.hint,
        min: 1,
        max: 100,
        disabled: qualityInert,
      },
      {
        kind: "select",
        id: "colours",
        label: content.controls.colours.label,
        hint: content.controls.colours.hint,
        options: content.controls.colours.options ?? [],
      },
      {
        kind: "slider",
        id: "width",
        label: content.controls.width.label,
        hint: content.controls.width.hint,
        min: WIDTH_MIN,
        max: widthMax,
        unit: " px",
      },
      {
        kind: "toggle",
        id: "dropFrames",
        label: content.controls.dropFrames.label,
        hint: content.controls.dropFrames.hint,
      },
    ],
    [content.controls, qualityCopy, qualityInert, widthMax],
  );

  const { plan, stats, resultUrl, resultBlob, error } = job.state;
  const showError = error !== null && (flow === "error" || flow === "loaded");

  const stageLabel = locked
    ? progress.determinate
      ? tStage(progress.stage)
      : tStage("preparing")
    : null;

  const outcome =
    flow === "result" && stats && file
      ? t("announceResult", {
          from: formatBytes(file.size),
          to: formatBytes(stats.outBytes),
          delta: formatDelta(file.size, stats.outBytes),
        })
      : null;

  const downloadName = file
    ? `${file.name.replace(/\.gif$/i, "")}-compressed.gif`
    : "compressed.gif";

  const primaryLabel = flow === "result" ? content.actions.download : content.actions.run;

  return (
    <ToolPage
      title={content.title}
      lead={content.lead}
      trustLine={trustLine}
      actionBarVisible={file !== null}
      announcer={
        <JobAnnouncer
          progress={job.progress}
          stageLabel={stageLabel}
          outcome={outcome}
        />
      }
      actionBar={
        <StickyActionBar
          meta={
            file ? (
              <>
                <span className="block truncate">{file.name}</span>
                <span className="tabular block">
                  {stats
                    ? `${formatBytes(stats.outBytes)} · ${formatDelta(file.size, stats.outBytes)}`
                    : formatBytes(file.size)}
                </span>
              </>
            ) : null
          }
        >
          {flow === "result" && resultUrl ? (
            <a
              href={resultUrl}
              download={downloadName}
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-control bg-brand-fill px-6 text-body font-semibold text-fg-on-primary shadow-sm"
            >
              <Download aria-hidden="true" className="size-4.5" />
              {primaryLabel}
            </a>
          ) : (
            <Button
              size="xl"
              onClick={run}
              loading={locked}
              loadingLabel={content.actions.running}
            >
              {primaryLabel}
            </Button>
          )}
        </StickyActionBar>
      }
      stage={
        <ToolStage>
          {/* The input region, one fixed height for every state it can hold.
              The dropzone and the loaded chip-plus-preview both stretch to fill
              it, so a file arriving moves nothing below — see the note on the
              preview for why `hadRecentInput` does not cover this transition. */}
          <div className="flex h-60 flex-col gap-3 md:h-72 lg:h-84">
            {flow === "idle" ? (
              <Dropzone
                toolSlug={SLUG}
                accept={["gif"]}
                onFile={handleFile}
                title={content.dropzone.title}
                caption={content.dropzone.caption}
                className="min-h-0 flex-1"
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <FileChip
                    name={file?.name ?? ""}
                    size={formatBytes(file?.size ?? 0)}
                    removable={!locked}
                    onRemove={startOver}
                    removeLabel={tDropzone("removeFile")}
                  />
                  <Badge variant="neutral" className="tabular">
                    {probe
                      ? probe.frameCount === null
                        ? t("sourceMetaUnknown", {
                            width: probe.width,
                            height: probe.height,
                          })
                        : t("sourceMeta", {
                            width: probe.width,
                            height: probe.height,
                            frames: probe.frameCount,
                          })
                      : "…"}
                  </Badge>
                  {!locked ? (
                    <Button variant="ghost" size="sm" onClick={startOver}>
                      {t("chooseDifferent")}
                    </Button>
                  ) : null}
                </div>

                {/* The source, playing, while the settings are tuned.

                    ── Why a fixed box and not the source aspect ratio ────────
                    An aspect-ratio box is sized by the file, so the idle
                    (dropzone) and loaded (preview) states would occupy
                    different heights and everything below — the reserved ad
                    slot, the explainer, the FAQ — would move when a file
                    arrives. That shift is *not* excused by `hadRecentInput`:
                    the click that opens the OS file picker happens seconds
                    before the `change` event, far outside Chromium's 500 ms
                    input window, so it scores as un-prompted CLS on the
                    ordinary path. Both branches stretch to fill one fixed
                    parent instead, and `object-contain` letterboxes any aspect
                    ratio inside it.

                    It stays rendered in the result state for the same reason:
                    collapsing it there would move the result panel and the ad
                    below it, seconds after the click that started the job. */}
                <div className="min-h-0 flex-1 overflow-hidden rounded-card border border-line bg-surface-2">
                  {sourceUrl ? (
                    <img
                      src={sourceUrl}
                      alt={t("sourcePreviewAlt")}
                      className="size-full object-contain"
                    />
                  ) : null}
                </div>
              </>
            )}
          </div>

          {showError && error ? (
            <JobError
              error={error}
              onRunDegraded={(degraded) => {
                if (!file) return;
                setElapsed(0);
                setSubmittedColours(
                  Number(stringValue(values, "colours", "256")),
                );
                const spec = buildSpec(values);
                job.run(file, {
                  ...spec,
                  geometry: { ...spec.geometry, targetWidth: degraded.width },
                  timing: { ...spec.timing, fps: degraded.fps },
                  maxFrames: degraded.frames,
                });
              }}
              // Only the settings this tool actually has. `errors.ts` can also
              // ask for `frames` or `fps`, and this page has no control for
              // either — `JobError` renders a button only for the settings it
              // is told about, so an offer that could not be honoured is never
              // shown rather than shown and inert.
              settings={["width", "colours"]}
              onChangeSetting={(setting, value) => {
                if (setting === "width") setValue("width", value);
                if (setting === "colours") setValue("colours", String(value));
              }}
            />
          ) : null}

          {flow === "result" && stats && resultUrl && sourceUrl && file ? (
            <ResultPanel>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-sans text-h4 font-semibold text-fg">
                  {t("done")}
                </span>
                <Badge variant="neutral" className="tabular">
                  {/* Read from `stats`/`plan`, never from the live controls:
                      the settings are unlocked in the result state, so a badge
                      keyed on `values` would relabel a file that was already
                      encoded. */}
                  {t("encoderBadge", {
                    encoder: stats.encoder,
                    colours:
                      stats.encoder === "gifski"
                        ? 256
                        : submittedColours,
                  })}
                </Badge>
              </div>

              {/* A fixed frame, for the same reason the source preview above is
                  one: the panel's height has to be reserved before the file is
                  known, and a frame sized from the decoded aspect ratio is not
                  knowable then. `gif-workbench.tsx` already boxes its result
                  image this way; the compressor was the outlier, and the 185px
                  the panel grew by was the whole of its measured CLS. */}
              <div className="mt-4 h-60 md:h-72">
              <BeforeAfterSlider
                className="h-full"
                fill
                beforeSrc={sourceUrl}
                afterSrc={resultUrl}
                beforeLabel={t("beforeLabel", { size: formatBytes(file.size) })}
                afterLabel={t("afterLabel", {
                  size: formatBytes(stats.outBytes),
                })}
                beforeAlt={t("sourcePreviewAlt")}
                afterAlt={t("resultPreviewAlt")}
                aspectRatio={stats.width / stats.height}
                sideBySide={shouldRenderSideBySide({
                  frames: stats.frames,
                  width: stats.width,
                  height: stats.height,
                })}
              />
              </div>

              {/* Both counts are measured from the real blobs — the input the
                  user dropped and the output that exists. Never the estimate. */}
              <ResultSummary
                className="mt-5"
                fromBytes={file.size}
                toBytes={resultBlob?.size ?? stats.outBytes}
                savedLine={content.result.savedLine}
                encodedIn={t("encodedIn", {
                  seconds: (stats.totalMs / 1000).toFixed(1),
                })}
                downloadHref={resultUrl}
                downloadName={downloadName}
                downloadLabel={content.actions.download}
                notes={
                  <>
                    {plan?.downgraded ? (
                      <p className="mt-3 text-caption text-fg-secondary">
                        {tPlan("downgraded", {
                          width: plan.width,
                          fps: plan.fps,
                        })}
                      </p>
                    ) : null}
                    {plan?.truncated ? (
                      <p className="mt-1 text-caption text-fg-secondary">
                        {tPlan("truncated", {
                          seconds: (plan.frames / plan.fps).toFixed(1),
                        })}
                      </p>
                    ) : null}
                  </>
                }
                next={
                  <NextTools
                    slug={SLUG}
                    label={t("nextTools")}
                    // The compressor produces a GIF and nothing else, so the
                    // format is a literal rather than a lookup.
                    result={
                      resultBlob
                        ? {
                            blob: resultBlob,
                            name: downloadName,
                            format: "gif",
                          }
                        : null
                    }
                  />
                }
              >
                <Button variant="secondary" onClick={run}>
                  {content.actions.rerun}
                </Button>
                <Button variant="ghost" onClick={startOver}>
                  {t("startOver")}
                </Button>
              </ResultSummary>
            </ResultPanel>
          ) : flow === "processing" ? (
            <ResultPanel>
              <p className="font-sans text-h4 font-semibold text-fg">
                {stageLabel}
              </p>
              <ProgressBar
                className="mt-4"
                label={t("progressLabel")}
                {...(progress.determinate
                  ? {
                      determinate: true as const,
                      value: Math.round(progress.value * 100),
                    }
                  : { determinate: false as const })}
                cancel={
                  <Button variant="danger" size="sm" onClick={job.cancel}>
                    {t("cancel")}
                  </Button>
                }
              />
              {/* Always rendered, empty until the first second elapses. A row
                  that appears one second into a job pushes everything under it
                  down, and a job that has been running for a second is long past
                  the 500 ms window that would excuse the shift as prompted. */}
              <p className="tabular mt-3 min-h-[1.45em] text-caption text-fg-muted">
                {!progress.determinate && elapsed > 0
                  ? tStage("elapsed", { seconds: elapsed })
                  : null}
              </p>
              <p className="mt-3 text-caption text-fg-muted">
                {t("keepTabOpen")}
              </p>
            </ResultPanel>
          ) : (
            <ResultPanel
              empty
              emptyMessage={content.resultEmpty.message}
              emptyHint={content.resultEmpty.hint}
              emptyRows={content.result.emptyRows}
            />
          )}

          {/* §8.1: reserved from first paint, below the result panel, 24px clear
              of the Download button via `.ad-slot`'s own margin. */}
          <AdSlot variant="rect" name="result-rect" />
        </ToolStage>
      }
      settings={
        <SettingsPanel>
          <div className="flex items-center justify-between gap-3">
            <span className="font-sans text-h4 font-semibold text-fg">
              {t("settings")}
            </span>
            {flow === "idle" ? (
              <Badge variant="neutral">{t("waitingForFile")}</Badge>
            ) : locked ? (
              <Badge variant="neutral">{t("lockedWhileEncoding")}</Badge>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetSettings}
              >
                {t("reset")}
              </Button>
            )}
          </div>

          <SettingsForm
            controls={controls}
            values={values}
            onChange={setValue}
            disabled={flow === "idle" || locked}
            describedBy="compressor-primary-reason"
            panelHint={flow === "idle" ? content.actions.disabledReason : undefined}
          />

          {/* Hidden below md — the sticky bar carries the primary there. */}
          <Button
            className="mt-2 hidden w-full md:inline-flex"
            size="lg"
            variant={flow === "result" ? "secondary" : "primary"}
            onClick={run}
            loading={locked}
            loadingLabel={content.actions.running}
            // `aria-disabled`, never the native `disabled`: a disabled button
            // leaves the tab order, and most screen readers then never announce
            // its `aria-describedby` — so "Add a GIF first." would exist for
            // sighted users only, which is the opposite of what §5.1 asks for.
            // `run()` guards itself, so a click that arrives anyway is inert.
            aria-disabled={flow === "idle" || locked || undefined}
            aria-describedby="compressor-primary-reason"
          >
            {flow === "result" ? content.actions.rerun : content.actions.run}
          </Button>
          <p
            id="compressor-primary-reason"
            // Visually hidden below `md`, where the sticky bar carries the
            // primary — but never `display: none`, because it is the
            // `aria-describedby` target and that would make it unreadable.
            className="sr-only text-center text-caption text-fg-muted md:not-sr-only md:block"
          >
            {flow === "idle" ? content.actions.disabledReason : t("runsLocally")}
          </p>
        </SettingsPanel>
      }
    >
      {children}
    </ToolPage>
  );
}
