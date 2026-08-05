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
import { ProgressBar } from "@/components/tool/progress-bar";
import { ResultPanel, SizeDelta } from "@/components/tool/result-panel";
import { SettingsPanel } from "@/components/tool/settings-panel";
import { SettingsForm } from "@/components/tool/settings/settings-form";
import type {
  ControlDef,
  ControlValue,
  ControlValues,
} from "@/components/tool/settings/control-schema";
import { StickyActionBar } from "@/components/tool/sticky-action-bar";
import { ToolPage } from "@/components/tool/tool-page";
import { useJobProgress, useMediaJob } from "@/hooks/use-media-job";
import type {
  InputProbe,
  JobSpec,
  RecoveryAction,
} from "@/lib/media/types";
import { formatBytes, formatDelta } from "@/lib/format-bytes";
import type { ToolContent } from "@/lib/tools/content";
import type { MediaFormat } from "@/lib/tools/registry";
import { cn } from "@/lib/utils";

/**
 * The GIF-in, GIF-out workbench: one job flow, four tools.
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
  /** Live consequences of the current settings, under the controls. */
  notice?(context: WorkbenchContext): ReactNode;
  /** Replaces the animated source preview. Crop puts its overlay here. */
  preview?(context: WorkbenchContext & { sourceUrl: string }): ReactNode;
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
  notice,
  preview,
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
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [probe, setProbe] = useState<InputProbe | null>(null);
  const [values, setValues] = useState<ControlValues>(defaultValues);
  const [elapsed, setElapsed] = useState(0);

  // Object URLs outlive a render and have to be revoked exactly once, so they
  // are tracked in a ref rather than in state — a state updater would revoke
  // twice under StrictMode's double invocation and leave the second dangling.
  const sourceUrlRef = useRef<string | null>(null);
  const setSource = useCallback((next: File | null) => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = next ? URL.createObjectURL(next) : null;
    setSourceUrl(sourceUrlRef.current);
  }, []);
  useEffect(
    () => () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    },
    [],
  );

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
      setSource(next);
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
    [defaultValues, job, setSource, valuesForProbe],
  );

  const startOver = useCallback(() => {
    job.reset();
    setSource(null);
    setFile(null);
    setProbe(null);
    currentFileRef.current = null;
    setValues(defaultValues);
  }, [defaultValues, job, setSource]);

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

  const context = useMemo<WorkbenchContext>(
    () => ({ values, setValue, probe, file, locked, flow }),
    [file, flow, locked, probe, setValue, values],
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

  const downloadName = file
    ? `${file.name.replace(/\.[^.]+$/, "")}${downloadSuffix}.gif`
    : `output${downloadSuffix}.gif`;

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
              <Dropzone
                toolSlug={slug}
                accept={accept}
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
                <img
                  src={resultUrl}
                  alt={resultAlt}
                  className="size-full object-contain"
                />
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                {/* Both counts are measured from the real blobs — the input the
                    user dropped and the output that exists. Never an estimate. */}
                <SizeDelta
                  from={formatBytes(file.size)}
                  to={formatBytes(resultBlob?.size ?? stats.outBytes)}
                  deltaLabel={formatDelta(file.size, stats.outBytes)}
                />
                <span className="tabular text-caption text-fg-muted">
                  {t("encodedIn", {
                    seconds: (stats.totalMs / 1000).toFixed(1),
                  })}
                </span>
              </div>

              {plan?.downgraded ? (
                <p className="mt-3 text-caption text-fg-secondary">
                  {tPlan("downgraded", { width: plan.width, fps: plan.fps })}
                </p>
              ) : null}
              {plan?.truncated ? (
                <p className="mt-1 text-caption text-fg-secondary">
                  {tPlan("truncated", {
                    seconds: (plan.frames / plan.fps).toFixed(1),
                  })}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {/* Hidden below md: the sticky bar already carries this action,
                    and §5.1 permits exactly one primary per viewport. */}
                <a
                  href={resultUrl}
                  download={downloadName}
                  className={cn(
                    "hidden min-h-12 items-center justify-center gap-2 rounded-control px-6 md:inline-flex",
                    "bg-brand-fill text-body font-semibold text-fg-on-primary shadow-sm",
                    "hover:bg-brand-fill-hover",
                  )}
                >
                  <Download aria-hidden="true" className="size-4.5" />
                  {content.actions.download}
                </a>
                <Button variant="secondary" onClick={run}>
                  {content.actions.rerun}
                </Button>
                <Button variant="ghost" onClick={startOver}>
                  {t("startOver")}
                </Button>
              </div>
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
              {!progress.determinate && elapsed > 0 ? (
                <p className="tabular mt-3 text-caption text-fg-muted">
                  {tStage("elapsed", { seconds: elapsed })}
                </p>
              ) : null}
              <p className="mt-3 text-caption text-fg-muted">
                {t("keepTabOpen")}
              </p>
            </ResultPanel>
          ) : (
            <ResultPanel
              empty
              emptyMessage={content.resultEmpty.message}
              emptyHint={content.resultEmpty.hint}
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
              flow === "idle" ? content.actions.disabledReason : undefined
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
            {flow === "idle" ? content.actions.disabledReason : t("runsLocally")}
          </p>
        </SettingsPanel>
      }
    >
      {children}
    </ToolPage>
  );
}
