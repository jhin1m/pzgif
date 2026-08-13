"use client";

import { PresetChip } from "@/components/ui/preset-chip";

/**
 * The preset picker: a single-select group of toggle buttons.
 *
 * ── Why it sits above the dropzone ─────────────────────────────────────────
 * The active preset changes what "success" means on this page. A visitor who
 * drops a file before choosing one has been shown a verdict against a target
 * they did not pick, and the verdict is the product.
 *
 * ── Why toggles and not radios ─────────────────────────────────────────────
 * `PresetChip` is a `<button aria-pressed>`, decided back in Phase 3. A radio
 * group announces as a form field being filled in; this announces as a control
 * being switched, which is what it is — the file stays loaded and the page
 * re-prices it against the new target. The trade is that single-selection has to
 * be enforced here rather than by the platform, which is one line, and the group
 * keeps a `role="group"` with a real label so the set still reads as a set.
 *
 * The Discord chips render the dimensions but **never a byte figure**. Three of
 * the four surfaces have no published limit, so a chip row that showed one per
 * preset would have to invent two of them — which is the wireframe's "≤10 MB"
 * defect reappearing in the smallest possible type.
 *
 * ── One component, two callers ─────────────────────────────────────────────
 * The tool pages' "start from one of these" row is the same control with the
 * same semantics, so it is this component rather than a second one: `dimensions`
 * was already optional and `legend` was already a plain hand-written string, so
 * widening cost three prop types. A second chip component would have meant a
 * second set of a11y semantics and a second `/dev/states` row to keep in step.
 */

export interface PresetChipsProps {
  /** Hand-written per page. The `<legend>` of the group. */
  legend: string;
  /** Ids in the order they are offered. `dimensions` is the Discord row only. */
  presets: readonly { readonly id: string; readonly dimensions?: string }[];
  /** Chip label per preset, written for this page. */
  labels: Readonly<Record<string, string>>;
  /** Null renders no pressed chip — the state where the values are the user's. */
  selected: string | null;
  onSelect(id: string): void;
  /** True while a job owns the settings — switching mid-encode is not offered. */
  disabled?: boolean;
}

export function PresetChips({
  legend,
  presets,
  labels,
  selected,
  onSelect,
  disabled = false,
}: PresetChipsProps) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2.5 text-label font-medium text-fg">{legend}</legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label={legend}>
        {presets.map((preset) => (
          <PresetChip
            key={preset.id}
            label={labels[preset.id] ?? preset.id}
            dimensions={preset.dimensions}
            selected={preset.id === selected}
            disabled={disabled}
            onClick={() => onSelect(preset.id)}
            data-preset={preset.id}
          />
        ))}
      </div>
    </fieldset>
  );
}
