"use client";

/* eslint-disable @next/next/no-img-element -- The source is a `blob:` URL minted
   in this tab from a file that never had a network URL. `next/image` cannot
   optimise one, and its loader would send the blob through the image optimiser.
   Same reasoning as `gif-workbench.tsx`. */

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dropzone } from "@/components/tool/dropzone";
import { FileChip } from "@/components/tool/file-chip";
import { ToolPicker } from "@/components/home/tool-picker";
import { useObjectUrl } from "@/hooks/use-object-url";
import type { HomeContent } from "@/lib/content/home";
import { formatBytes } from "@/lib/format-bytes";
import { clearPendingFile, setPendingFile } from "@/lib/handoff/pending-file";
import { sniffFile, type SniffResult } from "@/lib/media/sniff";
import type { InputFormat } from "@/lib/media/types";
import { liveRoutesFor } from "@/lib/tools/file-format";
import { liveInputFormats, type ToolDefinition } from "@/lib/tools/registry";

/**
 * The homepage hero — the only part of `/` that hydrates.
 *
 * ── The only work this page does to a file is read 4096 bytes of it ────────
 * `sniffFile()` reads the file's leading bytes and nothing else. No worker
 * boots, no WASM is fetched, `capability.ts` is never called — there is nothing
 * for it to gate, because every live route is GIF-only and a device probe would
 * be a question with one possible answer. The engine is the tool page's job; the
 * landing page's job is to find out what the file is and get out of the way.
 * `pnpm check:landing` is what keeps that true.
 *
 * ── Why sniff at all, when `Dropzone` already gated the drop ───────────────
 * `Dropzone` gates on `detectMediaFormat()`, which reads the **extension**. That
 * is the right first gate — it is synchronous, and it is what the `accept`
 * attribute has to be built from — but an extension is a claim. Every "save as
 * GIF" button on a social network hands out an MP4 named `.gif`. Routed on its
 * name, that file reaches the compressor and dies as `decode-failed`, which is
 * the generic bucket the "never a dead end" rule exists to keep files out of.
 * Sniffed, it is named correctly and refused with a reason.
 *
 * ── One box, four states, one height ───────────────────────────────────────
 * The dropzone and everything that replaces it live inside a single fixed-height
 * container, exactly as the tool pages box their input region. The picker
 * appearing is a state change on the page a visitor lands on first, and a picker
 * that pushed the tool grid down would be CLS on the ranking surface.
 */

type HeroState =
  | { kind: "idle" }
  | { kind: "sniffing"; file: File }
  | {
      kind: "picking";
      file: File;
      sniff: SniffResult;
      routes: readonly ToolDefinition[];
    }
  | { kind: "unsupported"; file: File; sniff: SniffResult }
  /**
   * The read itself failed, which is not the same as an unsupported file.
   *
   * `file.slice().arrayBuffer()` rejects for reasons that have nothing to do
   * with the bytes: the file moved or was deleted between the picker closing
   * and the read starting, or it is a cloud placeholder that is not on this
   * device. Without this state the promise rejects unhandled and the box sits
   * on "Reading…" forever — a dead end in the one component built to prevent
   * them.
   */
  | { kind: "unreadable"; file: File };

/**
 * The format's name, from a map rather than a template key.
 *
 * `t(\`format.${result.format}\`)` compiles for any string, so adding a member
 * to `InputFormat` would render the raw key path to a visitor. Keyed on the
 * union, a new member is a type error at build time instead.
 */
const FORMAT_KEY: Record<InputFormat, string> = {
  gif: "format.gif",
  webp: "format.webp",
  video: "format.video",
  image: "format.image",
  unknown: "format.unknown",
};

export function HomeHero({ content }: { content: HomeContent }) {
  const t = useTranslations("home");
  const tDropzone = useTranslations("dropzone");
  const [state, setState] = useState<HeroState>({ kind: "idle" });

  /**
   * The file the hero is currently about.
   *
   * Sniffing is asynchronous, and a visitor who drops a second file before the
   * first has been read would otherwise get whichever `slice().arrayBuffer()`
   * happened to settle last. Same guard the workbench keeps around its probe,
   * and for the same reason.
   */
  const currentFile = useRef<File | null>(null);

  const handleFile = useCallback((file: File) => {
    currentFile.current = file;
    setState({ kind: "sniffing", file });

    void sniffFile(file)
      .then((result) => {
        if (currentFile.current !== file) return;
        const routes = liveRoutesFor(result.format);
        setState(
          routes.length > 0
            ? { kind: "picking", file, sniff: result, routes }
            : { kind: "unsupported", file, sniff: result },
        );
      })
      .catch(() => {
        // Not swallowed — turned into a state the visitor can act on. The
        // guard is repeated because a rejection from an abandoned file must
        // not replace the state of the one that superseded it.
        if (currentFile.current !== file) return;
        setState({ kind: "unreadable", file });
      });
  }, []);

  const clear = useCallback(() => {
    currentFile.current = null;
    // A file that was handed over and then abandoned must not follow the
    // visitor to whichever tool they eventually open by another route.
    clearPendingFile();
    setState({ kind: "idle" });
  }, []);

  /**
   * Hands the file to the page that is about to mount.
   *
   * Synchronous, and it has to be: this runs in the click handler that the
   * router is about to act on, and a promise resolving one microtask later would
   * settle *after* the tool page has already mounted, looked for a handoff and
   * found nothing. The failure would be invisible — the tool page renders its
   * own dropzone and looks perfectly normal.
   */
  const stash = useCallback((slug: string) => {
    const file = currentFile.current;
    if (file) setPendingFile(file, slug);
  }, []);

  const file = state.kind === "idle" ? null : state.file;

  /**
   * The dropped file, shown back to the visitor as itself.
   *
   * A `blob:` URL in an `<img>` costs one decode by the browser's own GIF
   * decoder and adds nothing to this page's bundle — no worker, no WASM, no
   * `capability.ts`, so `pnpm check:landing` stays green. `useFirstFrame` would
   * be the wrong tool: it exists because the crop rectangle needs a *still* to
   * place a handle on, and paying a decode plus a canvas round trip to show a
   * frozen frame of an animation is a worse answer to "is this the right file?"
   * than the animation is.
   */
  const previewUrl = useObjectUrl(file);

  const sniffed = "sniff" in state ? state.sniff : null;
  const formatLabel = sniffed ? t(FORMAT_KEY[sniffed.format]) : null;
  const mismatched = sniffed?.mismatch === true && sniffed.declaredExtension;

  /**
   * What a screen reader is told when the box changes under it.
   *
   * A sighted visitor sees the dropzone become a row of choices. This is that
   * event, in words — the same live-region pattern `JobAnnouncer` uses on the
   * tool pages rather than a second mechanism doing the same job.
   */
  const announcement =
    state.kind === "picking"
      ? t("announcePicker", {
          format: formatLabel!,
          size: formatBytes(state.file.size),
          count: state.routes.length,
        })
      : state.kind === "unsupported"
        ? t("announceUnsupported", { format: formatLabel! })
        : "";

  return (
    <section>
      <h1 className="font-display text-display font-bold tracking-[-0.02em] text-fg">
        {content.hero.title}
      </h1>
      <p className="mt-3 max-w-[62ch] text-lead text-fg-secondary">
        {content.hero.lead}
      </p>

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>

      {/* The reservation. Every state below fills this box and none of them
          resizes it, so the tool grid underneath does not move when a file
          arrives. Verified at 320, 375 and 1440 in `e2e/homepage.spec.ts`. */}
      <div
        // The hook every homepage assertion scopes to. The tool names in this
        // box also appear in the nav, the footer and the grid below, so an
        // unscoped `getByRole("link", { name: "Resize GIF" })` resolves to four
        // nodes and fails strict mode before asserting anything.
        data-home-hero
        // Measured, not chosen, and re-measured when the preview was added.
        // Everything except the picture — chip row, heading, the wrapping 44px
        // chips and the card's padding — costs 436px below 640, 232px from 640
        // and 178px from 1024, which is where the two breaks are: those are the
        // widths at which the chips stop wrapping. The bands add a preview of
        // roughly 140/152/202px on top, and `e2e/homepage.spec.ts` fails if any
        // band stops covering its contents.
        className="mt-7 flex h-144 flex-col gap-3 sm:h-96 lg:h-95"
      >
        {state.kind === "idle" ? (
          <Dropzone
            accept={liveInputFormats()}
            onFile={handleFile}
            title={content.hero.dropzoneTitle}
            caption={content.hero.dropzoneCaption}
            className="min-h-0 flex-1"
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3.5 rounded-card border border-line bg-surface-1 p-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <FileChip
                name={file?.name ?? ""}
                size={formatBytes(file?.size ?? 0)}
                removable
                onRemove={clear}
                removeLabel={tDropzone("removeFile")}
              />
              {formatLabel ? (
                <Badge variant="neutral">{formatLabel}</Badge>
              ) : null}
              <Button variant="ghost" size="sm" onClick={clear}>
                {t("chooseDifferent")}
              </Button>
            </div>

            {/* The preview, above the choices, in the order the decision is
                actually made: *this* file, then what to do with it.

                It takes the slack (`flex-1`) rather than a fixed height, so the
                choices below it always get their natural size first and the
                picture absorbs whatever is left at this breakpoint. `min-h-24`
                is what stops that from degrading silently — without a floor, a
                band whose reservation is a few pixels short would squeeze the
                image to nothing and still pass the overflow assertion.

                Not rendered for `unreadable`: the browser has already refused to
                open the file, so an `<img>` pointed at it can only produce a
                broken-image glyph next to the sentence explaining the failure. */}
            {previewUrl && state.kind !== "unreadable" ? (
              <div className="min-h-24 flex-1 overflow-hidden rounded-card border border-line bg-surface-2">
                <img
                  src={previewUrl}
                  alt={t("previewAlt")}
                  className="size-full object-contain"
                />
              </div>
            ) : null}

            {state.kind === "sniffing" ? (
              <p className="text-sm text-fg-muted">{t("reading")}</p>
            ) : state.kind === "unreadable" ? (
              <div className="flex flex-col gap-2">
                <p className="text-body font-medium text-fg">
                  {t("unreadableTitle")}
                </p>
                <p className="max-w-[62ch] text-sm text-fg-secondary">
                  {t("unreadableBody")}
                </p>
              </div>
            ) : state.kind === "picking" ? (
              <ToolPicker
                heading={content.picker.heading}
                routes={state.routes}
                onPick={stash}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-body font-medium text-fg">
                  {content.picker.unsupportedTitle}
                </p>
                <p className="max-w-[62ch] text-sm text-fg-secondary">
                  {content.picker.unsupportedBody}
                </p>
                <span className="w-fit rounded-pill border border-dashed border-line px-3 py-1.5 text-label text-fg-muted">
                  {content.picker.comingSoon}
                </span>
              </div>
            )}

            {/* Outside the branches, because it belongs to *both* of the ones
                that sniffed something. It was previously inside `picking`,
                which is the branch that needs it least: a mislabelled file that
                no tool takes — an MP4 named `.gif`, the case the sniffer was
                built for — lands in `unsupported`, where the visitor was shown
                a "Video" badge and never told their file is not what its name
                says. Silence when the name and the bytes agree; a reassurance
                nobody needed is noise. */}
            {mismatched && sniffed ? (
              <p className="text-caption text-fg-muted">
                {t("mismatch", {
                  extension: sniffed.declaredExtension!.toUpperCase(),
                  format: formatLabel!,
                })}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <p className="mt-3 max-w-[68ch] text-caption text-fg-muted">
        {content.hero.reassurance}
      </p>
    </section>
  );
}
