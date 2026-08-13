"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Who owns the control values right now.
 *
 * This replaces the value-equality guard the workbench used to run
 * (`untouched(current, defaults)`), which could not tell "the user typed the
 * default back in" apart from "the user has not touched anything", and had no
 * way at all to express "the user picked a named preset".
 */
export type ToolIntent =
  /**
   * The page owns them. A probe landing may re-derive them, and `presetId`
   * names the preset to re-resolve — or is null on the seven tools with no
   * table, which is what makes them fall through to `valuesForProbe`.
   */
  | { readonly kind: "auto"; readonly presetId: string | null }
  /** The user owns them. Nothing may overwrite them behind their back. */
  | { readonly kind: "custom" };

export interface ToolIntentApi {
  /** The pressed chip, or null while the values are the user's own. */
  presetId: string | null;
  /**
   * The intent as of *now*.
   *
   * Read this inside a callback, never `presetId`. The probe callback is handed
   * to `job.probe()` when the file is dropped and is never recreated, so a state
   * value read inside it is the value from drop time — which is precisely the
   * race the old guard avoided by evaluating inside the functional updater.
   */
  readIntent(): ToolIntent;
  selectPreset(id: string): void;
  /** Any edit to any control. The user now owns the values. */
  markCustom(): void;
  /** Reset, and dropping a second file: the next probe sizes the controls again. */
  restoreDefault(): void;
}

/**
 * Intent in a ref, mirrored into state for the chip's pressed styling.
 *
 * Refs do not re-render and state is stale inside a long-lived callback, so
 * both are needed and exactly one function writes them — nothing else may touch
 * the ref, or the two drift and the pressed chip stops describing the job.
 */
export function useToolIntent(defaultPresetId: string | null): ToolIntentApi {
  const initial: ToolIntent = { kind: "auto", presetId: defaultPresetId };
  const intentRef = useRef<ToolIntent>(initial);
  const [presetId, setPresetId] = useState<string | null>(defaultPresetId);

  const setIntent = useCallback((next: ToolIntent) => {
    intentRef.current = next;
    setPresetId(next.kind === "auto" ? next.presetId : null);
  }, []);

  const readIntent = useCallback(() => intentRef.current, []);

  const selectPreset = useCallback(
    (id: string) => setIntent({ kind: "auto", presetId: id }),
    [setIntent],
  );

  const markCustom = useCallback(
    () => setIntent({ kind: "custom" }),
    [setIntent],
  );

  const restoreDefault = useCallback(
    () => setIntent({ kind: "auto", presetId: defaultPresetId }),
    [defaultPresetId, setIntent],
  );

  return { presetId, readIntent, selectPreset, markCustom, restoreDefault };
}
