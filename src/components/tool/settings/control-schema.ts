/**
 * A tool's settings, declared as data.
 *
 * ── What is shared and what is not ──────────────────────────────────────────
 * The *mechanics* of a settings panel are identical across fourteen routes:
 * vertical rhythm, disabled-before-a-file, locked-during-a-job, label/hint
 * pairing, the reset affordance. Sharing those is straightforwardly DRY.
 *
 * The *copy* is not shared. Every label and every hint in a schema is written
 * for one tool — "Halving the width is the single biggest size win" belongs to
 * the compressor and nowhere else. A schema that interpolated a tool name into a
 * generic sentence would be the template-filled-copy failure this project's
 * content rules exist to prevent, applied to the one part of the page a visitor
 * actually reads while deciding.
 *
 * ── The escape hatch is load-bearing, not defensive ─────────────────────────
 * Crop (Phase 6) and trim (Phase 7) need bespoke interactive controls — a drag
 * rectangle over a frame, a two-handle range over a timeline. Neither is a
 * slider with a different label. `kind: "custom"` exists from the start so those
 * phases extend the panel instead of forking it, which is the specific failure
 * `phase-05`'s risk table names.
 */

import type { ReactNode } from "react";

export type ControlValue = number | string | boolean;
export type ControlValues = Readonly<Record<string, ControlValue>>;

interface ControlBase {
  /** Key into the values record. Stable — it is also the test selector. */
  id: string;
  label: string;
  /** Hand-written helper text. Rendered as the control's `aria-describedby`. */
  hint?: string;
  /**
   * Renders inert with a visible reason.
   *
   * Two distinct causes both land here: no file yet, and a setting this
   * browser's encoder cannot honour. Either way §5.1's rule holds — a disabled
   * control keeps its place and says why, rather than vanishing and taking the
   * layout with it.
   */
  disabled?: boolean;
}

export interface SliderControl extends ControlBase {
  kind: "slider";
  min: number;
  max: number;
  step?: number;
  /** Appended to the readout, e.g. " px". Never widens the readout box. */
  unit?: string;
  /** §5.4 pairs a number input for exact entry; suppress where there is no room. */
  showNumberInput?: boolean;
}

export interface SelectControl extends ControlBase {
  kind: "select";
  options: readonly { value: string; label: string }[];
}

export interface ToggleControl extends ControlBase {
  kind: "toggle";
}

export interface CustomControl extends ControlBase {
  kind: "custom";
  render(context: {
    values: ControlValues;
    setValue: (id: string, value: ControlValue) => void;
    disabled: boolean;
  }): ReactNode;
}

export type ControlDef =
  | SliderControl
  | SelectControl
  | ToggleControl
  | CustomControl;

/** Reads a control's value with the right type, or the supplied fallback. */
export function numberValue(
  values: ControlValues,
  id: string,
  fallback: number,
): number {
  const value = values[id];
  return typeof value === "number" ? value : fallback;
}

export function stringValue(
  values: ControlValues,
  id: string,
  fallback: string,
): string {
  const value = values[id];
  return typeof value === "string" ? value : fallback;
}

export function booleanValue(
  values: ControlValues,
  id: string,
  fallback = false,
): boolean {
  const value = values[id];
  return typeof value === "boolean" ? value : fallback;
}
