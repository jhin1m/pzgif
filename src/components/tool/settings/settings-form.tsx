"use client";

import { useId } from "react";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { SwitchField } from "@/components/ui/switch";
import {
  booleanValue,
  numberValue,
  stringValue,
  type ControlDef,
  type ControlValue,
  type ControlValues,
} from "./control-schema";

/**
 * Renders a control schema with the Phase 3 primitives.
 *
 * ── Disabled, never hidden ─────────────────────────────────────────────────
 * `design-guidelines.md` §5 and the wireframe's state A both insist on it: the
 * panel renders its full set of controls before a file arrives, greyed out. The
 * alternative — showing them once a file loads — moves everything below the
 * panel at the exact moment the user is looking somewhere else, which is the
 * layout jump the whole page is designed around.
 *
 * ── One `disabled` prop, two reasons ───────────────────────────────────────
 * A control is inert either because there is no file yet or because the panel is
 * locked mid-job. The distinction is announced once, at the panel header, rather
 * than repeated on every control — a screen-reader user tabbing through eight
 * disabled controls does not need to hear the same sentence eight times.
 */

export function SettingsForm({
  controls,
  values,
  onChange,
  disabled = false,
  describedBy,
  panelHint,
}: {
  controls: readonly ControlDef[];
  values: ControlValues;
  onChange: (id: string, value: ControlValue) => void;
  /** Panel-wide lock. Composes with each control's own `disabled`. */
  disabled?: boolean;
  /** Id of the element carrying the panel-wide reason ("Add a GIF first"). */
  describedBy?: string;
  /** The same reason as text, for controls that describe themselves by string. */
  panelHint?: string;
}) {
  return (
    <>
      {controls.map((control) => (
        <Control
          key={control.id}
          control={control}
          values={values}
          onChange={onChange}
          disabled={disabled || control.disabled === true}
          describedBy={describedBy}
          panelHint={panelHint}
        />
      ))}
    </>
  );
}

function Control({
  control,
  values,
  onChange,
  disabled,
  describedBy,
  panelHint,
}: {
  control: ControlDef;
  values: ControlValues;
  onChange: (id: string, value: ControlValue) => void;
  disabled: boolean;
  describedBy?: string;
  panelHint?: string;
}) {
  const hintId = useId();

  switch (control.kind) {
    case "slider":
      return (
        <Slider
          label={control.label}
          min={control.min}
          max={control.max}
          step={control.step}
          unit={control.unit}
          showNumberInput={control.showNumberInput}
          // `Slider` describes itself from its own hint. Where there is none,
          // the panel-wide reason is the only description worth having.
          hint={control.hint ?? panelHint}
          disabled={disabled}
          value={numberValue(values, control.id, control.min)}
          onValueChange={(value) => onChange(control.id, value)}
        />
      );

    case "select": {
      const value = stringValue(
        values,
        control.id,
        control.options[0]?.value ?? "",
      );
      return (
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`${hintId}-trigger`}
            className="text-label font-semibold text-fg"
          >
            {control.label}
          </label>
          <SelectRoot
            value={value}
            disabled={disabled}
            onValueChange={(next) => onChange(control.id, next)}
          >
            <SelectTrigger
              id={`${hintId}-trigger`}
              // Both, space-separated. `aria-describedby` takes a list, and
              // making them mutually exclusive silently dropped the panel-wide
              // reason from every control that happened to have a hint.
              aria-describedby={
                [control.hint ? hintId : null, describedBy]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {control.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectRoot>
          {control.hint ? (
            <p id={hintId} className="text-caption text-fg-muted">
              {control.hint}
            </p>
          ) : null}
        </div>
      );
    }

    case "toggle":
      return (
        <div className="flex flex-col gap-2">
          <SwitchField
            label={control.label}
            checked={booleanValue(values, control.id)}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(control.id, checked)}
            describedBy={
              [control.hint ? hintId : null, describedBy]
                .filter(Boolean)
                .join(" ") || undefined
            }
          />
          {control.hint ? (
            <p id={hintId} className="text-caption text-fg-muted">
              {control.hint}
            </p>
          ) : null}
        </div>
      );

    case "custom":
      return (
        <div className="flex flex-col gap-2">
          {control.render({ values, setValue: onChange, disabled })}
          {control.hint ? (
            <p id={hintId} className="text-caption text-fg-muted">
              {control.hint}
            </p>
          ) : null}
        </div>
      );
  }
}
