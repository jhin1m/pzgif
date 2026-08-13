"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { PresetChips } from "@/components/tool/preset-chips";
import {
  SettingsDisclosure,
  SettingsPanel,
} from "@/components/tool/settings-panel";

/**
 * The settings disclosure, both states, for `/dev/states`.
 *
 * A client island because the gallery page is a server component and the
 * disclosure takes an `onToggle` — and the toggle is the thing worth
 * screenshotting, so a fixed-`open` prop would show the two boxes without
 * showing that either can be reached.
 *
 * `lg:grid-rows-[1fr]` forces the panel open at `≥lg`, which is where the
 * gallery is normally read: shrink the window below 1024px to see the collapsed
 * state, exactly as a visitor on a tablet would.
 */
export function DisclosureStates() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <SettingsPanel className="w-full">
        <SettingsDisclosure
          id="dev-live"
          heading="Settings"
          open={open}
          onToggle={() => setOpen((current) => !current)}
          aside={
            <Button variant="ghost" size="sm">
              Reset
            </Button>
          }
        >
          <Slider label="Colours" min={16} max={256} step={16} defaultValue={128} />
        </SettingsDisclosure>
      </SettingsPanel>

      <SettingsPanel className="w-full">
        <SettingsDisclosure
          id="dev-waiting"
          heading="Settings"
          open={false}
          onToggle={() => {}}
          aside={<Badge variant="neutral">Waiting for a file</Badge>}
        >
          <Slider label="Colours" min={16} max={256} step={16} defaultValue={128} />
        </SettingsDisclosure>
      </SettingsPanel>
    </div>
  );
}

/**
 * The same `PresetChips` the Discord hub uses, with no `dimensions` — which is
 * how a tool page renders it, and the reason there is no second chip component.
 */
export function ToolPresetChipStates() {
  const [selected, setSelected] = useState<string | null>("balanced");

  return (
    <div className="flex flex-col gap-4">
      <PresetChips
        legend="Start from one of these"
        presets={[{ id: "smallest" }, { id: "balanced" }, { id: "sharpest" }]}
        labels={{
          smallest: "Squeeze it hard",
          balanced: "Full palette",
          sharpest: "Keep every detail",
        }}
        selected={selected}
        onSelect={setSelected}
      />
      {/* `selected: null` — the state a tool page is in once a control is
          edited by hand. No chip is pressed, and nothing else changes. */}
      <PresetChips
        legend="…and the same row with nothing selected"
        presets={[{ id: "smallest" }, { id: "balanced" }, { id: "sharpest" }]}
        labels={{
          smallest: "Squeeze it hard",
          balanced: "Full palette",
          sharpest: "Keep every detail",
        }}
        selected={null}
        onSelect={() => {}}
      />
    </div>
  );
}
