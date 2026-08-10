"use client";

/* eslint-disable @next/next/no-img-element -- Every source here is a `blob:` URL
   produced inside the tab. `next/image` cannot optimise a file that never had a
   URL on the network, and its loader would try to fetch a blob through the image
   optimiser. Same reasoning as `before-after-slider.tsx`. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
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
  type ToolFlowState,
} from "@/components/tool/job-state";
import { NextTools } from "@/components/tool/next-tools";
import { ProgressBar } from "@/components/tool/progress-bar";
import { ResultPanel, ResultSummary } from "@/components/tool/result-panel";
import { SettingsPanel } from "@/components/tool/settings-panel";
import { SettingsForm } from "@/components/tool/settings/settings-form";
import type {
  ControlDef,
  ControlValue,
  ControlValues,
} from "@/components/tool/settings/control-schema";
import { StickyActionBar } from "@/components/tool/sticky-action-bar";
import { ToolPage } from "@/components/tool/tool-page";
import { useHandoffFile } from "@/hooks/use-handoff-file";
import { useJobProgress, useMediaJob } from "@/hooks/use-media-job";
import { useObjectUrl } from "@/hooks/use-object-url";
import type {
  InputProbe,
  JobSpec,
  JobStats,
  RecoveryAction,
  SizeEstimate,
} from "@/lib/media/types";
import { formatBytes, formatDelta } from "@/lib/format-bytes";
import type { ToolContent } from "@/lib/tools/content";
import type { MediaFormat } from "@/lib/tools/registry";

/**
 * The workbench: one job flow, eight tools.
 *
 * The name is still `GifWorkbench` because GIF is on one side of every job it
 * runs — in for resize, crop, speed, reverse, `gif-to-mp4` and
 * `split-gif-to-frames`, out for `mp4-to-gif` and `webp-to-gif`. What Phase 7
 * changed is that the *other* side is no longer always GIF too, which is what
 * `output` below describes.
 *
 * ── Why this exists, and why the compressor is not folded into it ──────────
 * Resize, crop, speed and reverse differ in exactly three places — which
 * controls the panel shows, what `JobSpec` those controls build, and what the
 * download is called. Everything else (probe on drop, admission refusals,
 * progress, cancel, the elapsed clock, the reserved boxes, the sticky bar) is
 * the same code four times over, and four copies of a job flow drift the moment
 * one of them is fixed.
 *
 * The compressor deliberately stays on its own component. Its settings panel is
 * not a schema: the Colours control *selects the encoder*, which makes the
 * Quality slider inert with a visible reason, and it renders a before/after
 * slider at matched dimensions that only a same-size job can honestly show.
 * Generalising this component until it could express that would make it a
 * configuration language, which is the failure `phase-05` named — so the
 * compressor keeps its bespoke page and this holds the four that genuinely are
 * configuration.
 *
 * ── Nothing here is prose ──────────────────────────────────────────────────
 * Every word a visitor reads arrives through `content` (hand-written, per tool)
 * or through the message catalogue (genuinely identical chrome: "Cancel",
 * "Settings"). This file contains no sentence that could end up on two pages.
 */

/** True while every control still holds the value it was mounted with. */
function untouched(current: ControlValues, defaults: ControlValues): boolean {
  const keys = new Set([...Object.keys(current), ...Object.keys(defaults)]);
  for (const key of keys) {
    if (current[key] !== defaults[key]) return false;
  }
  return true;
}

/** The settings `errors.ts` can ask a tool to change on the user's behalf. */
type ChangeableSetting = Extract<
  RecoveryAction,
  { kind: "change-setting" }
>["setting"];

/** What a tool's callbacks are told about the page's current state. */
export interface WorkbenchContext {
  values: ControlValues;
  setValue(id: string, value: ControlValue): void;
  /** Null until the probe answers, and null again if it failed. */
  probe: InputProbe | null;
  file: File | null;
  /** True while the engine owns the settings. */
  locked: boolean;
  flow: ToolFlowState;
  /**
   * The last live size prediction, or null.
   *
   * Only ever non-null on a page that opted into `liveEstimate`, and always a
   * range: the calibration data shows a 22x spread in bytes-per-pixel at
   * identical settings driven purely by content, so a point value would be
   * confidently wrong exactly where it is read most carefully. Label it an
   * estimate wherever it is rendered.
   */
  estimate: SizeEstimate | null;
}

/**
 * What the tool produces, for the three places the answer is not "a GIF".
 *
 * Answered by the page, not by the registry: `split-gif-to-frames` has two
 * entries in `outputFormats`, so the registry cannot say which one a given run
 * produced. Getting it wrong is not cosmetic — `format` is what
 * `chainTargets()` filters on, and a wrong value offers a `.zip` to a tool that
 * will fail on it with `decode-failed`.
 */
export interface WorkbenchOutput {
  /** Registry format of the produced file. Drives the next-tools chips. */
  format: MediaFormat;
  /** Download extension, leading dot included. */
  extension: string;
}

/** GIF in, GIF out — the six tools that need no descriptor of their own. */
const GIF_OUTPUT: WorkbenchOutput = { format: "gif", extension: ".gif" };
const gifOutput = () => GIF_OUTPUT;

/** Everything the done state's media frame is given to render itself. */
export interface ResultMediaContext {
  /** Object URL for the produced blob. Revoked when the job is reset. */
  url: string;
  blob: Blob | null;
  stats: JobStats;
  /** The page's own `resultAlt`, already resolved against the catalogue. */
  alt: string;
}

export interface GifWorkbenchProps {
  slug: string;
  content: ToolContent;
  /** `<TrustLine />`, server-rendered and passed through. */
  trustLine: ReactNode;
  accept: readonly MediaFormat[];
  /** Control values before any file exists. */
  defaultValues: ControlValues;
  /**
   * Values re-derived once the file's real dimensions are known.
   *
   * A width slider has to start at the source width — "no change" must be the
   * state you begin in — and a crop rectangle has to start at the whole frame.
   * Neither is knowable before the probe answers.
   */
  valuesForProbe?(probe: InputProbe, current: ControlValues): ControlValues;
  controls(context: WorkbenchContext): readonly ControlDef[];
  buildSpec(values: ControlValues, probe: InputProbe | null): JobSpec;
  /** Appended to the input's stem, e.g. `-resized`. */
  downloadSuffix: string;
  /**
   * What this tool produces, given the finished blob — or null before there is
   * one, which is when the sticky bar still has to name a download.
   *
   * A function rather than a constant because one tool genuinely cannot answer
   * it in advance. `gif-to-mp4` asks the browser which codec it can encode and
   * falls back to VP8 in WebM where AVC is unavailable, so the container is a
   * property of the device, decided inside the encode worker. A file named
   * `.mp4` that actually holds WebM is one nothing will open.
   *
   * Defaults to GIF in, GIF out.
   */
  output?(blob: Blob | null): WorkbenchOutput;
  /**
   * Fills the done state's media frame. Defaults to an `<img>`.
   *
   * A render prop rather than a `kind` enum because the three cases share no
   * shape: `<img>` for a GIF, `<video>` with the playback attributes for an MP4,
   * and — for a ZIP, which has nothing to show — a summary of what is inside it.
   *
   * **Whatever it returns must fill the frame and not resize it.** The frame is
   * a fixed `h-60 md:h-72` box inside a panel whose height is reserved from
   * first paint against measured numbers; a child that sizes itself from its
   * content puts CLS back on the tool pages.
   */
  resultMedia?(context: ResultMediaContext): ReactNode;
  /** Live consequences of the current settings, under the controls. */
  notice?(context: WorkbenchContext): ReactNode;
  /** Replaces the animated source preview. Crop puts its overlay here. */
  preview?(context: WorkbenchContext & { sourceUrl: string }): ReactNode;
  /**
   * Replaces the dropzone when this device cannot run this tool at all.
   *
   * Rendered *instead of* the dropzone, inside the same fixed-height box, so the
   * page says so above the fold and nothing moves. That is the whole point:
   * `plan.md`'s iOS decision obliges `mp4-to-gif` to refuse before a file is
   * chosen, because a refusal that arrives after someone picked a clip is a
   * broken tool with extra steps — and iOS Safari is a large share of the mobile
   * traffic a GIF utility attracts.
   *
   * The device is only knowable after hydration, so this must be decided in an
   * effect and the server must render the dropzone. Swapping one fixed box for
   * another costs no layout shift.
   */
  unavailable?: ReactNode;
  /**
   * Replaces `content.actions.disabledReason` beside the idle primary.
   *
   * The stock reason is "add a file first", which is the wrong sentence on a
   * device that will not accept one. It is `aria-describedby` on the primary, so
   * a screen-reader user on iOS would otherwise be told to do the one thing the
   * page has just said is impossible.
   */
  idleReason?: string;
  /**
   * Re-prices the job as the settings move, through `runEstimate`.
   *
   * Off by default, and deliberately: an estimate is a full decode plus two
   * sample encodes, which on the four GIF→GIF tools would spend a job's worth of
   * memory to predict a number those pages do not show. `mp4-to-gif` turns it on
   * because "will this be huge?" is the question that decides whether a
   * video-to-GIF conversion happens at all.
   */
  liveEstimate?: boolean;
  /** Which of `errors.ts`'s offers this tool has a control for. */
  changeableSettings?: readonly ChangeableSetting[];
  applySetting?(
    setting: ChangeableSetting,
    value: number,
    setValue: (id: string, value: ControlValue) => void,
  ): void;
  /** Explainer, FAQ and related tools — server-rendered, passed straight on. */
  children: ReactNode;
}

export function GifWorkbench({
  slug,
  content,
  trustLine,
  accept,
  defaultValues,
  valuesForProbe,
  controls,
  buildSpec,
  downloadSuffix,
  output = gifOutput,
  resultMedia,
  notice,
  preview,
  unavailable,
  idleReason,
  liveEstimate = false,
  changeableSettings,
  applySetting,
  children,
}: GifWorkbenchProps) {
  const t = useTranslations("tool");
  const tStage = useTranslations("engine.stage");
  const tPlan = useTranslations("engine.plan");
  const tDropzone = useTranslations("dropzone");

  const job = useMediaJob();
  const progress = useJobProgress(job.progress);

  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<InputProbe | null>(null);
  const [values, setValues] = useState<ControlValues>(defaultValues);
  const [elapsed, setElapsed] = useState(0);

  // Owned by the file, not by this component's mount — see `useObjectUrl` for
  // the Strict Mode failure that shape is there to make impossible.
  const sourceUrl = useObjectUrl(file);

  const flow = toolFlowState(file !== null, job.state.status);
  const locked = settingsLocked(flow);

  const setValue = useCallback((id: string, value: ControlValue) => {
    setValues((current) => ({ ...current, [id]: value }));
  }, []);

  /**
   * The file the page is currently about.
   *
   * A probe is a worker round trip and the pipeline worker does not serialise
   * them, so dropping a large GIF and then a small one can land the two results
   * out of order. Without this check the page would size its controls against a
   * file the user already replaced.
   */
  const currentFileRef = useRef<File | null>(null);

  const handleFile = useCallback(
    (next: File) => {
      job.reset();
      setFile(next);
      setProbe(null);
      currentFileRef.current = next;
      job.probe(next, (result) => {
        if (currentFileRef.current !== next) return;
        setProbe(result);
        if (!result || !valuesForProbe) return;
        // Sizing the controls to the file is a *default*, not a correction, so
        // it applies only while they are still untouched.
        //
        // A probe is a worker round trip, and on a large GIF it lands after the
        // page is already interactive. Measured on `/crop-gif`: a rectangle
        // typed before the probe returned was silently reverted to the whole
        // frame a moment later, which reads as the control fighting the user.
        setValues((current) =>
          untouched(current, defaultValues) ? valuesForProbe(result, current) : current,
        );
      });
    },
    [defaultValues, job, valuesForProbe],
  );

  // A file dropped on the homepage arrives here already chosen. No-op on every
  // other route into this page.
  useHandoffFile(slug, handleFile);

  const startOver = useCallback(() => {
    job.reset();
    setFile(null);
    setProbe(null);
    currentFileRef.current = null;
    setValues(defaultValues);
  }, [defaultValues, job]);

  const run = useCallback(() => {
    // Re-entrancy guard. `Button`'s `loading` state only sets
    // `pointer-events: none`, so the busy primary stays focusable and Enter
    // still fires it — which would cancel the running job and start a second
    // one. Pointer users were protected; keyboard users were not.
    if (!file || locked) return;
    setElapsed(0);
    job.run(file, buildSpec(values, probe));
  }, [buildSpec, file, job, locked, probe, values]);

  /** Reset returns the controls to their defaults *for this file*. */
  const resetSettings = useCallback(() => {
    setValues(
      probe && valuesForProbe
        ? valuesForProbe(probe, defaultValues)
        : defaultValues,
    );
  }, [defaultValues, probe, valuesForProbe]);

  /**
   * The elapsed readout. A real clock, shown only where there is no counter.
   *
   * gifski blocks its worker for the whole encode and exposes no callback, so
   * that stage is honestly indeterminate — an indeterminate track and a wall
   * clock, never a bar that moves on a timer.
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
   * Re-prices the job a beat after the settings stop moving.
   *
   * The delay is not politeness. Each estimate decodes the whole selection and
   * runs two sample encodes, and `useMediaJob` cancels the previous one when a
   * new one starts — so a dragged slider without this would start and abandon a
   * decode per animation frame, each admitted against the same budget.
   *
   * Only while a file is loaded and idle: during a job the settings are locked
   * and the estimate cannot change, and after one the real byte count exists,
   * which is strictly better than any prediction of it.
   */
  // `job.estimate` and not `job`: `useMediaJob` returns a fresh object literal
  // on every render, so depending on the whole thing re-arms this effect every
  // time anything re-renders — and each estimate's own `setState` is a render.
  // That is a loop with a 500 ms period that never stops: a file sitting idle
  // would decode itself and run two sample encodes, forever. `estimate` is a
  // `useCallback` with stable deps, which is the identity that actually matters.
  const runEstimate = job.estimate;
  useEffect(() => {
    if (!liveEstimate || !file || flow !== "loaded") return;
    const timer = setTimeout(() => runEstimate(file, buildSpec(values, probe)), 500);
    return () => clearTimeout(timer);
  }, [buildSpec, file, flow, liveEstimate, probe, runEstimate, values]);

  const context = useMemo<WorkbenchContext>(
    () => ({
      values,
      setValue,
      probe,
      file,
      locked,
      flow,
      estimate: job.state.estimate,
    }),
    [file, flow, job.state.estimate, locked, probe, setValue, values],
  );

  const controlDefs = controls(context);
  const noticeNode = notice?.(context) ?? null;

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

  const produced = output(resultBlob);
  const downloadName = file
    ? `${file.name.replace(/\.[^.]+$/, "")}${downloadSuffix}${produced.extension}`
    : `output${downloadSuffix}${produced.extension}`;

  const sourceAlt = content.labels?.sourceAlt ?? t("sourcePreviewAlt");
  const resultAlt = content.labels?.resultAlt ?? t("resultPreviewAlt");

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
              {content.actions.download}
            </a>
          ) : (
            <Button
              size="xl"
              onClick={run}
              loading={locked}
              loadingLabel={content.actions.running}
            >
              {content.actions.run}
            </Button>
          )}
        </StickyActionBar>
      }
      stage={
        <ToolStage>
          {/* One fixed height for every state the input region can hold, so a
              file arriving moves nothing below it. The click that opens the OS
              file picker happens seconds before the `change` event — far
              outside Chromium's 500 ms input window — so that transition scores
              as un-prompted CLS unless both branches fill the same box. */}
          <div className="flex h-60 flex-col gap-3 md:h-72 lg:h-84">
            {flow === "idle" ? (
              (unavailable ?? (
                <Dropzone
                  toolSlug={slug}
                  accept={accept}
                  onFile={handleFile}
                  title={content.dropzone.title}
                  caption={content.dropzone.caption}
                  className="min-h-0 flex-1"
                />
              ))
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

                <div className="relative min-h-0 flex-1 overflow-hidden rounded-card border border-line bg-surface-2">
                  {sourceUrl ? (
                    (preview?.({ ...context, sourceUrl }) ?? (
                      <img
                        src={sourceUrl}
                        alt={sourceAlt}
                        className="size-full object-contain"
                      />
                    ))
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
                const spec = buildSpec(values, probe);
                job.run(file, {
                  ...spec,
                  geometry: { ...spec.geometry, targetWidth: degraded.width },
                  timing: { ...spec.timing, fps: degraded.fps },
                  maxFrames: degraded.frames,
                });
              }}
              // Only the settings this tool actually has. `errors.ts` can also
              // offer `colours`, `fps` and `frames`; a button for a control the
              // page does not own would be an offer that cannot be honoured.
              settings={changeableSettings}
              onChangeSetting={(setting, value) =>
                applySetting?.(setting, value, setValue)
              }
            />
          ) : null}

          {flow === "result" && stats && resultUrl && file ? (
            <ResultPanel>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-sans text-h4 font-semibold text-fg">
                  {t("done")}
                </span>
                {/* Read from `stats`, never from the live controls: the settings
                    unlock the moment a result exists, so a badge keyed on
                    `values` would relabel a file that was already encoded. */}
                <Badge variant="neutral" className="tabular">
                  {t("outputMeta", {
                    width: stats.width,
                    height: stats.height,
                    frames: stats.frames,
                  })}
                </Badge>
              </div>

              {/* Fixed box, same reasoning as the source preview: the result is
                  a different shape on three of these four tools, and an
                  aspect-ratio box would move the ad slot below it. */}
              <div className="mt-4 h-60 overflow-hidden rounded-card border border-line bg-surface-2 md:h-72">
                {resultMedia?.({
                  url: resultUrl,
                  blob: resultBlob,
                  stats,
                  alt: resultAlt,
                }) ?? (
                  <img
                    src={resultUrl}
                    alt={resultAlt}
                    className="size-full object-contain"
                  />
                )}
              </div>

              {/* Both counts are measured from the real blobs — the input the
                  user dropped and the output that exists. Never an estimate. */}
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
                    slug={slug}
                    label={t("nextTools")}
                    result={
                      resultBlob
                        ? {
                            blob: resultBlob,
                            name: downloadName,
                            format: produced.format,
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
                label={content.labels?.progress ?? t("progressLabel")}
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

          {/* §8.1: reserved from first paint, below the result panel. */}
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
              <Button variant="ghost" size="sm" onClick={resetSettings}>
                {t("reset")}
              </Button>
            )}
          </div>

          <SettingsForm
            controls={controlDefs}
            values={values}
            onChange={setValue}
            disabled={flow === "idle" || locked}
            describedBy={`${slug}-primary-reason`}
            panelHint={
              flow === "idle"
                ? (idleReason ?? content.actions.disabledReason)
                : undefined
            }
          />

          {noticeNode}

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
            // its `aria-describedby` — so the reason would exist for sighted
            // users only. `run()` guards itself, so a stray click is inert.
            aria-disabled={flow === "idle" || locked || undefined}
            aria-describedby={`${slug}-primary-reason`}
          >
            {flow === "result" ? content.actions.rerun : content.actions.run}
          </Button>
          <p
            id={`${slug}-primary-reason`}
            // Visually hidden below `md`, where the sticky bar carries the
            // primary — but never `display: none`, because it is the
            // `aria-describedby` target and that would make it unreadable.
            className="sr-only text-center text-caption text-fg-muted md:not-sr-only md:block"
          >
            {flow === "idle"
              ? (idleReason ?? content.actions.disabledReason)
              : t("runsLocally")}
          </p>
        </SettingsPanel>
      }
    >
      {children}
    </ToolPage>
  );
}
