"use client";

/* eslint-disable @next/next/no-img-element -- Every source here is a `blob:` URL
   produced inside the tab; `next/image`'s loader would try to fetch it through
   the image optimiser. Same reasoning as `gif-workbench.tsx`. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Wand2 } from "lucide-react";
import { AdSlot } from "@/components/ads/ad-slot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DiscordPreview } from "@/components/tool/discord-preview";
import { Dropzone } from "@/components/tool/dropzone";
import { FileChip } from "@/components/tool/file-chip";
import { JobAnnouncer } from "@/components/tool/job-announcer";
import { JobError } from "@/components/tool/job-error";
import {
  settingsLocked,
  ToolStage,
  toolFlowState,
} from "@/components/tool/job-state";
import { NextTools } from "@/components/tool/next-tools";
import { PresetChips } from "@/components/tool/preset-chips";
import { ProgressBar } from "@/components/tool/progress-bar";
import { ResultPanel, ResultSummary } from "@/components/tool/result-panel";
import { SettingsPanel } from "@/components/tool/settings-panel";
import { SettingsForm } from "@/components/tool/settings/settings-form";
import {
  numberValue,
  type ControlDef,
  type ControlValues,
} from "@/components/tool/settings/control-schema";
import {
  budgetTone,
  SizeBudgetBar,
  type BudgetBasis,
} from "@/components/tool/size-budget-bar";
import { StickyActionBar } from "@/components/tool/sticky-action-bar";
import { ToolPage } from "@/components/tool/tool-page";
import { useCapabilities } from "@/hooks/use-capabilities";
import { useHandoffFile } from "@/hooks/use-handoff-file";
import { useJobProgress, useMediaJob } from "@/hooks/use-media-job";
import { useObjectUrl } from "@/hooks/use-object-url";
import { formatBytes } from "@/lib/format-bytes";
import { attemptCap } from "@/lib/media/autofit";
import type { InputProbe } from "@/lib/media/types";
import type { MediaFormat } from "@/lib/tools/registry";
import {
  budgetBytes,
  DISCORD_PRESETS,
  getPreset,
  type DiscordPresetId,
} from "@/lib/presets/discord";
import { MANUAL_DEFAULTS, presetJobSpec, type ManualSettings } from "@/lib/presets/job-spec";
import { fillNote, type ToolContent } from "@/lib/tools/content";

/**
 * The Discord preset cluster: one hub with a chip picker, four dedicated pages,
 * one engine.
 *
 * ── Why this is not `GifWorkbench` with a flag ─────────────────────────────
 * `GifWorkbench`'s primary action is "encode once with these settings". This
 * page's primary action is a *search* — several real encodes, a per-attempt
 * badge, a result that may honestly report that nothing fit. And its settings
 * panel is an override rather than the controls: the target is chosen by a chip
 * above the dropzone, not by sliders beside it, because the target is what
 * decides whether the output is a success. Generalising one component until it
 * could express both would make it a configuration language, which is the
 * failure `phase-05` named and the same reason the compressor kept its own page.
 *
 * ── What is shared, and it is most of it ───────────────────────────────────
 * Every sub-component here is the one the other tools use: the same dropzone,
 * file chip, progress bar, error panel, result summary, reserved ad slots and
 * reserved-height boxes. The job flow differs; the chrome does not.
 *
 * ── Nothing in this file is prose ──────────────────────────────────────────
 * Every sentence arrives through `content.preset`, hand-written per route. The
 * message catalogue carries only what is genuinely identical everywhere —
 * "Cancel", "Settings", the attempt counter's shape.
 */

/** GIF and video in, GIF out. iOS loses the video half — see `accept` below. */
const GIF_INPUTS: readonly MediaFormat[] = ["gif", "webp"];
const VIDEO_INPUTS: readonly MediaFormat[] = ["mp4", "webm", "mov"];

/**
 * This cluster's own reserved height for the result panel.
 *
 * `ResultPanel` reserves the nine tool pages' done state, and this one is
 * structurally taller: a size-budget meter and an in-message preview sit above
 * the summary that every other tool ends with, and the preview is not a
 * flourish — it is the only place the produced file is shown at all, because
 * this page has no separate media frame.
 *
 * Measured in Chromium against `loop-small.gif` at each band's narrowest point,
 * the same method and the same fixture `result-panel-reservation.spec.ts` uses:
 *
 *     320 → 967    400 → 933    480 → 800    768 → 764
 *
 * The curve runs the same way the tool pages' does — wrapping, not content,
 * dominates, so the narrow bands are the tall ones. Tailwind's spacing step is
 * 4px, so each band is the measurement rounded up and given two steps of slack
 * — enough to absorb a font-metric difference between engines, and not so much
 * that the empty panel becomes a screenful of nothing on a phone.
 *
 * **It has to be applied to all three branches.** Empty, processing and done
 * reserve one box; the whole mechanism is that they are equal, and a `min-h-`
 * passed to only one of them is a layout shift with extra steps. Re-measure
 * whenever this panel gains or loses a row — the spec fails rather than letting
 * the drift return quietly.
 */
const PRESET_RESERVATION =
  "min-h-244 min-[400px]:min-h-236 min-[480px]:min-h-202 md:min-h-193";

export interface DiscordWorkbenchProps {
  slug: string;
  content: ToolContent;
  trustLine: React.ReactNode;
  /** The preset this route is about, and the chip that starts selected. */
  preset: DiscordPresetId;
  /** True on the hub, which lets the visitor switch targets. */
  showPicker?: boolean;
  children: React.ReactNode;
}

export function DiscordWorkbench({
  slug,
  content,
  trustLine,
  preset: initialPreset,
  showPicker = false,
  children,
}: DiscordWorkbenchProps) {
  const t = useTranslations("tool");
  const tPreset = useTranslations("preset");
  const tStage = useTranslations("engine.stage");
  const tDropzone = useTranslations("dropzone");

  const copy = content.preset;
  if (!copy) {
    // A preset route wired to a tool's content file. Thrown rather than rendered
    // blank: the failure is silent otherwise, and what ships is a page missing
    // the one thing that makes it a preset page.
    throw new Error(`${slug} has no preset copy`);
  }

  const capabilities = useCapabilities();
  const job = useMediaJob();
  const progress = useJobProgress(job.progress);

  const [presetId, setPresetId] = useState<DiscordPresetId>(initialPreset);
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<InputProbe | null>(null);
  const [manual, setManual] = useState<ManualSettings>(MANUAL_DEFAULTS);
  const [elapsed, setElapsed] = useState(0);

  const preset = getPreset(presetId);
  const budget = budgetBytes(preset);
  const sourceUrl = useObjectUrl(file);

  const flow = toolFlowState(file !== null, job.state.status);
  const locked = settingsLocked(flow);

  /**
   * What this device will take.
   *
   * iOS keeps the GIF half and loses the video half. `plan.md` ratified that
   * after gate G8 measured an 80% refusal rate for video input against the 30 MB
   * budget — every video shape fails there, not merely large ones. The Discord
   * routes degrade rather than going dark, because their GIF path works
   * perfectly and a dark page would cost the cluster its whole mobile audience.
   *
   * `capabilities === null` is the pre-hydration state and must render as the
   * full list: the server has no device, and guessing would show every desktop
   * visitor a narrower dropzone for the length of one paint.
   */
  const accept = useMemo<readonly MediaFormat[]>(
    () =>
      capabilities !== null && !capabilities.videoInput
        ? GIF_INPUTS
        : [...GIF_INPUTS, ...VIDEO_INPUTS],
    [capabilities],
  );

  const maxAttempts = attemptCap(capabilities?.tier ?? "desktop");

  const currentFileRef = useRef<File | null>(null);

  const handleFile = useCallback(
    (next: File) => {
      job.reset();
      setFile(next);
      setProbe(null);
      currentFileRef.current = next;
      job.probe(next, (result) => {
        // A probe is a worker round trip and they are not serialised, so a large
        // file followed by a small one can land out of order.
        if (currentFileRef.current !== next) return;
        setProbe(result);
      });
    },
    [job],
  );

  useHandoffFile(slug, handleFile);

  const startOver = useCallback(() => {
    job.reset();
    setFile(null);
    setProbe(null);
    currentFileRef.current = null;
    setManual(MANUAL_DEFAULTS);
  }, [job]);

  const runAutofit = useCallback(() => {
    if (!file || locked) return;
    setElapsed(0);
    job.autofit(file, presetJobSpec(slug, preset, probe), budget);
  }, [budget, file, job, locked, preset, probe, slug]);

  const runManual = useCallback(() => {
    if (!file || locked) return;
    setElapsed(0);
    // A single real encode at the chosen settings — *not* a claim that it fits.
    // The budget bar reads the produced blob afterwards, which is the only thing
    // that can honestly answer the question the page exists to answer.
    job.run(file, presetJobSpec(slug, preset, probe, manual));
  }, [file, job, locked, manual, preset, probe, slug]);

  /** Switching target re-prices the same file rather than discarding it. */
  const selectPreset = useCallback(
    (next: DiscordPresetId) => {
      if (locked) return;
      setPresetId(next);
      job.reset();
    },
    [job, locked],
  );

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
   * The estimate is what seeds the search, and it is also the only thing that
   * can fill the budget bar before an encode exists. Same debounce and same
   * reasoning as `GifWorkbench`: each estimate is a full decode plus two sample
   * encodes, and an undebounced slider would start and abandon one per frame.
   */
  const runEstimate = job.estimate;
  useEffect(() => {
    if (!file || flow !== "loaded") return;
    const timer = setTimeout(
      () => runEstimate(file, presetJobSpec(slug, preset, probe, manual)),
      500,
    );
    return () => clearTimeout(timer);
  }, [file, flow, manual, preset, probe, runEstimate, slug]);

  const { stats, resultUrl, resultBlob, error, estimate, attempt } = job.state;
  const showError = error !== null && (flow === "error" || flow === "loaded");

  /**
   * What the bar is allowed to say.
   *
   * A real blob outranks an estimate, always. Before one exists the bar shows
   * the estimator's band and can reach "close" but never "fits" — `budgetTone`
   * is what enforces that, and it is one function so the badge and the meter
   * cannot disagree.
   */
  const size: BudgetBasis | null =
    stats && flow === "result"
      ? { basis: "measured", bytes: resultBlob?.size ?? stats.outBytes }
      : estimate
        ? { basis: "range", low: estimate.low, high: estimate.high }
        : null;

  const tone = size ? budgetTone(size, preset.byteLimit) : "unknown";
  const overBy =
    size && preset.byteLimit !== null
      ? (size.basis === "measured" ? size.bytes : size.high) - preset.byteLimit
      : 0;

  const budgetFigures = {
    size: size
      ? size.basis === "measured"
        ? formatBytes(size.bytes)
        : `${formatBytes(size.low)}–${formatBytes(size.high)}`
      : "—",
    limit: preset.byteLimit === null ? "—" : formatBytes(preset.byteLimit),
    over: formatBytes(Math.max(0, overBy)),
    spare: formatBytes(Math.max(0, -overBy)),
  };

  /**
   * The "it did not fit" sentence, and when it is *not* the honest one.
   *
   * The search reports `fits: false` against whatever ceiling it was given, and
   * for a surface Discord publishes no maximum for that ceiling is ours rather
   * than Discord's. Saying "still over" there would present a target this page
   * chose as a rule Discord enforces — the exact confusion the `unknown` state
   * exists to prevent — and the sentence interpolates `{over}`, which against a
   * null limit renders as an authoritative-looking "0 B".
   *
   * So the unfitted line is reserved for the two surfaces with a published
   * ceiling. Elsewhere the meter reports the weight and says no maximum exists.
   */
  const missedPublishedLimit =
    preset.byteLimit !== null && stats?.autofit?.fits === false;

  const budgetMessage = fillNote(
    missedPublishedLimit ? copy.unfitted : copy.states[tone],
    budgetFigures,
  );

  const downloadName = file
    ? `${file.name.replace(/\.[^.]+$/, "")}-${preset.id}.gif`
    : `discord-${preset.id}.gif`;

  const stageLabel = locked
    ? progress.determinate
      ? tStage(progress.stage)
      : tStage("preparing")
    : null;

  const controls = useMemo<readonly ControlDef[]>(
    () => [
      {
        kind: "slider",
        id: "quality",
        label: content.controls.quality.label,
        hint: content.controls.quality.hint,
        min: 40,
        max: 100,
        step: 5,
        showNumberInput: true,
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
        id: "keepEveryNth",
        label: content.controls.keepEveryNth.label,
        hint: content.controls.keepEveryNth.hint,
        min: 1,
        max: 4,
        showNumberInput: true,
      },
    ],
    [content.controls],
  );

  const values: ControlValues = {
    quality: manual.quality,
    colours: String(manual.colours),
    keepEveryNth: manual.keepEveryNth,
  };

  const setValue = useCallback((id: string, value: string | number | boolean) => {
    setManual((current) => {
      if (id === "colours") return { ...current, colours: Number(value) };
      const next = { ...current, [id]: value } as unknown as ControlValues;
      return {
        quality: numberValue(next, "quality", current.quality),
        colours: current.colours,
        keepEveryNth: numberValue(next, "keepEveryNth", current.keepEveryNth),
      };
    });
  }, []);

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
          outcome={flow === "result" ? budgetMessage : null}
        />
      }
      actionBar={
        <StickyActionBar
          meta={
            file ? (
              <>
                <span className="block truncate">{file.name}</span>
                <span className="tabular block">
                  {budgetFigures.size}
                  {preset.byteLimit === null ? "" : ` / ${budgetFigures.limit}`}
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
              onClick={runAutofit}
              loading={locked}
              loadingLabel={copy.autofitRunning}
            >
              {copy.autofit}
            </Button>
          )}
        </StickyActionBar>
      }
      stage={
        <ToolStage>
          {showPicker ? (
            <PresetChips
              legend={copy.legend ?? ""}
              presets={DISCORD_PRESETS}
              labels={copy.chips ?? {}}
              selected={presetId}
              onSelect={selectPreset}
              disabled={locked}
            />
          ) : null}

          {/* One fixed height across every intake state, so a file arriving
              moves nothing below it. Same reservation as every tool page. */}
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
                    <img
                      src={sourceUrl}
                      alt={content.labels?.sourceAlt ?? t("sourcePreviewAlt")}
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
              // A pinned preset that will not fit is refused with a *shorter*
              // run at the right dimensions, never a narrower one — a
              // differently-shaped file is not an offer for a surface that
              // named its shape. Honouring it here is what keeps a refusal from
              // being the dead end the error taxonomy exists to prevent.
              onRunDegraded={(degraded) => {
                if (!file) return;
                setElapsed(0);
                job.autofit(
                  file,
                  {
                    ...presetJobSpec(slug, preset, probe),
                    maxFrames: degraded.frames,
                  },
                  budget,
                );
              }}
            />
          ) : null}

          {flow === "result" && stats && resultUrl && file ? (
            <ResultPanel className={PRESET_RESERVATION}>
              <SizeBudgetBar
                heading={copy.budgetHeading}
                limitBytes={preset.byteLimit}
                size={size ?? { basis: "measured", bytes: stats.outBytes }}
                message={budgetMessage}
                meterLabel={fillNote(copy.meterLabel, budgetFigures)}
              />

              <div className="mt-5">
                <DiscordPreview
                  url={resultUrl}
                  alt={content.labels?.resultAlt ?? t("resultPreviewAlt")}
                  caption={copy.previewCaption}
                  message={copy.previewMessage}
                  samples={copy.previewSamples}
                />
              </div>

              <ResultSummary
                className="mt-5"
                fromBytes={file.size}
                toBytes={resultBlob?.size ?? stats.outBytes}
                savedLine={content.result.savedLine}
                grewLine={t("grewLine")}
                encodedIn={t("encodedIn", {
                  seconds: (stats.totalMs / 1000).toFixed(1),
                })}
                downloadHref={resultUrl}
                downloadName={downloadName}
                downloadLabel={content.actions.download}
                notes={
                  <>
                    <p className="mt-3 text-caption text-fg-secondary" data-next-step>
                      {copy.nextStep}
                    </p>
                    {stats.autofit ? (
                      <p className="tabular mt-1 text-caption text-fg-muted" data-attempts>
                        {tPreset("settled", {
                          attempts: stats.autofit.attempts,
                          width: stats.width,
                          height: stats.height,
                          frames: stats.frames,
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
                        ? { blob: resultBlob, name: downloadName, format: "gif" }
                        : null
                    }
                  />
                }
              >
                <Button variant="secondary" onClick={runAutofit}>
                  {content.actions.rerun}
                </Button>
                <Button variant="ghost" onClick={startOver}>
                  {t("startOver")}
                </Button>
              </ResultSummary>
            </ResultPanel>
          ) : flow === "processing" ? (
            <ResultPanel className={PRESET_RESERVATION}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-sans text-h4 font-semibold text-fg">
                  {stageLabel}
                </p>
                {/* "of up to", not "of": the search stops the moment something
                    fits, so the maximum is a device cap rather than a
                    prediction of how much work is left. */}
                <Badge variant="accent" className="tabular">
                  {attempt
                    ? tPreset("attempt", { index: attempt.index, max: attempt.max })
                    : tPreset("attemptPending", { max: maxAttempts })}
                </Badge>
              </div>
              <ProgressBar
                className="mt-4"
                label={content.labels?.progress ?? t("progressLabel")}
                {...(progress.determinate
                  ? { determinate: true as const, value: Math.round(progress.value * 100) }
                  : { determinate: false as const })}
                cancel={
                  <Button variant="danger" size="sm" onClick={job.cancel}>
                    {t("cancel")}
                  </Button>
                }
              />
              <p className="tabular mt-3 min-h-[1.45em] text-caption text-fg-muted">
                {!progress.determinate && elapsed > 0
                  ? tStage("elapsed", { seconds: elapsed })
                  : null}
              </p>
              <p className="mt-3 text-caption text-fg-muted">{t("keepTabOpen")}</p>
            </ResultPanel>
          ) : (
            <ResultPanel
              empty
              className={PRESET_RESERVATION}
              emptyMessage={content.resultEmpty.message}
              emptyHint={content.resultEmpty.hint}
              emptyRows={content.result.emptyRows}
            />
          )}

          <AdSlot variant="rect" name="result-rect" />
        </ToolStage>
      }
      settings={
        <SettingsPanel>
          <div className="flex items-center justify-between gap-3">
            <span className="font-sans text-h4 font-semibold text-fg">
              {copy.budgetHeading}
            </span>
            {locked ? <Badge variant="neutral">{t("lockedWhileEncoding")}</Badge> : null}
          </div>

          {/* The meter, above the controls and before any encode. Its reserved
              slot is always rendered so the estimate landing a second after the
              file does not push the panel around. */}
          <div className="mt-4 min-h-31">
            {size ? (
              <SizeBudgetBar
                heading={copy.budgetHeading}
                limitBytes={preset.byteLimit}
                size={size}
                message={budgetMessage}
                meterLabel={fillNote(copy.meterLabel, budgetFigures)}
                className="[&>span:first-child]:sr-only"
              />
            ) : (
              <p className="text-caption text-fg-muted">
                {flow === "idle"
                  ? content.actions.disabledReason
                  : tStage("preparing")}
              </p>
            )}
          </div>

          <Button
            className="mt-4 w-full"
            size="lg"
            onClick={runAutofit}
            loading={locked}
            loadingLabel={copy.autofitRunning}
            aria-disabled={flow === "idle" || locked || undefined}
            aria-describedby={`${slug}-primary-reason`}
          >
            <Wand2 aria-hidden="true" className="size-4.5" />
            {copy.autofit}
          </Button>
          <p
            id={`${slug}-primary-reason`}
            className="mt-2 text-center text-caption text-fg-muted"
          >
            {flow === "idle" ? content.actions.disabledReason : t("runsLocally")}
          </p>

          <div className="mt-6 border-t border-line pt-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-label font-semibold text-fg">
                {tPreset("manual")}
              </span>
              <Badge variant="neutral">{tPreset("optional")}</Badge>
            </div>

            <div className="mt-4">
              <SettingsForm
              controls={controls}
              values={values}
              onChange={setValue}
              disabled={flow === "idle" || locked}
              describedBy={`${slug}-primary-reason`}
              />
            </div>

            <Button
              className="mt-4 w-full"
              variant="secondary"
              onClick={runManual}
              aria-disabled={flow === "idle" || locked || undefined}
            >
              {content.actions.run}
            </Button>
          </div>

          <p className="mt-5 text-caption text-fg-muted" data-crop-note>
            {copy.cropNote}
          </p>
          <p className="mt-2 text-caption text-fg-muted" data-verified>
            {fillNote(copy.verified, { date: preset.verifiedOn })}
          </p>
        </SettingsPanel>
      }
    >
      {children}
    </ToolPage>
  );
}
