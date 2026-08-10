import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISCORD_PRESETS,
  PRESET_ROUTE_SLUGS,
  budgetBytes,
  coverCrop,
  getPreset,
} from "./discord";
import { getRoute } from "../tools/registry";

/**
 * The preset figures are the one part of this cluster a visitor can check
 * against Discord in ten seconds, so they get checked here first.
 *
 * Most of these assertions look like restatements of the config. They are not:
 * each one names a specific figure that was wrong in a locked document, and the
 * failure mode is a well-meaning edit putting it back.
 */

describe("Discord presets", () => {
  it("never states 680×240 anywhere", () => {
    // The most damaging of the documented defects. It matches no Discord
    // surface, so a file produced at that size is letterboxed or cropped on
    // every upload while the page claims it fits.
    for (const preset of DISCORD_PRESETS) {
      expect(`${preset.width}×${preset.height}`, preset.id).not.toBe("680×240");
    }
  });

  it("gives the sticker its own byte budget, not the emoji's", () => {
    // §10 said 256 KB for both. It is 512 KB, and half a budget means auto-fit
    // throws away quality the surface would have accepted.
    expect(getPreset("sticker").byteLimit).toBe(512 * 1024);
    expect(getPreset("emoji").byteLimit).toBe(256 * 1024);
  });

  it("carries the sticker's duration and frame-rate caps", () => {
    // Both locked documents omit these. They are hard rejection criteria at
    // upload, so omitting them produces a file that fails after all the work.
    const sticker = getPreset("sticker");
    expect(sticker.maxDurationSec).toBe(5);
    expect(sticker.maxFps).toBe(60);
  });

  it("requires exactly 320×320 for the sticker and nothing else", () => {
    for (const preset of DISCORD_PRESETS) {
      expect(preset.dimensionsExact, preset.id).toBe(preset.id === "sticker");
    }
    expect(getPreset("sticker").width).toBe(320);
    expect(getPreset("sticker").height).toBe(320);
  });

  it("publishes no byte limit where Discord publishes none", () => {
    // The wireframe's "≤10 MB" for banners and icons is a number nobody
    // measured. Null is the honest answer and the UI has to render it as one.
    expect(getPreset("banner").byteLimit).toBeNull();
    expect(getPreset("avatar").byteLimit).toBeNull();
  });

  it("derives every ceiling from that preset's own record", () => {
    // The rule is "no shared MAX_BYTES", not "no two numbers may coincide" —
    // two surfaces are free to land on the same figure. What must never happen
    // is one preset's ceiling being read off another's record, which is the
    // §10 defect that gave the sticker the emoji's 256 KB.
    for (const preset of DISCORD_PRESETS) {
      expect(budgetBytes(preset), preset.id).toBe(
        preset.byteLimit ?? preset.targetBytes,
      );
    }
    expect(budgetBytes(getPreset("emoji"))).not.toBe(
      budgetBytes(getPreset("sticker")),
    );
  });

  it("keeps our own target below Discord's limit where one exists", () => {
    // A search that lands exactly on the ceiling has no margin for the spread
    // between an estimate and the real encode.
    for (const preset of DISCORD_PRESETS) {
      if (preset.byteLimit === null) continue;
      expect(preset.targetBytes, preset.id).toBeLessThan(preset.byteLimit);
    }
  });

  it("cites a source and a verification date for every preset", () => {
    for (const preset of DISCORD_PRESETS) {
      expect(preset.sourceUrl, preset.id).toMatch(/^https:\/\//);
      expect(preset.verifiedOn, preset.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("routes every preset at a slug the registry knows", () => {
    for (const preset of DISCORD_PRESETS) {
      const slug = PRESET_ROUTE_SLUGS[preset.id];
      expect(getRoute(slug), preset.id).toBeDefined();
    }
  });

  it("refuses an unknown id rather than falling back to emoji", () => {
    // A silent default would hand one surface another's byte budget, which is
    // precisely the class of bug the per-preset shape exists to rule out.
    expect(() => getPreset("nitro" as never)).toThrow();
  });
});

describe("coverCrop", () => {
  const emoji = getPreset("emoji");
  const banner = getPreset("banner");

  it("adds no crop when the source already has the target shape", () => {
    expect(coverCrop(500, 500, emoji)).toBeNull();
    expect(coverCrop(1920, 1080, banner)).toBeNull();
  });

  it("takes the middle of a wide source for a square preset", () => {
    expect(coverCrop(480, 270, emoji)).toEqual({
      x: 105,
      y: 0,
      width: 270,
      height: 270,
    });
  });

  it("takes the middle of a tall source for a square preset", () => {
    expect(coverCrop(270, 480, emoji)).toEqual({
      x: 0,
      y: 105,
      width: 270,
      height: 270,
    });
  });

  it("keeps the crop inside the source", () => {
    for (const [width, height] of [
      [499, 281],
      [1, 1000],
      [1000, 1],
      [33, 47],
    ]) {
      for (const preset of DISCORD_PRESETS) {
        const crop = coverCrop(width, height, preset);
        if (!crop) continue;
        expect(crop.x + crop.width, `${width}x${height} ${preset.id}`)
          .toBeLessThanOrEqual(width);
        expect(crop.y + crop.height, `${width}x${height} ${preset.id}`)
          .toBeLessThanOrEqual(height);
        expect(crop.width).toBeGreaterThan(0);
        expect(crop.height).toBeGreaterThan(0);
      }
    }
  });

  it("tolerates a source that is a rounding error off the target ratio", () => {
    // 499×281 is 1.7758 against 16:9's 1.7778. Shaving a column off each edge
    // to chase that is pure loss.
    expect(coverCrop(499, 281, banner)).toBeNull();
  });

  it("returns null for a degenerate source rather than an empty rectangle", () => {
    expect(coverCrop(0, 0, emoji)).toBeNull();
  });
});

describe("the corrected figures reach the locked documents", () => {
  // Step 2 of the phase: correcting the config while the source of truth still
  // says 680×240 guarantees the wrong number comes back with the next edit.
  const read = (path: string) =>
    readFileSync(join(process.cwd(), path), "utf8");

  /**
   * The document with its amendment blockquotes removed.
   *
   * A correction has to be able to quote the figure it corrects, or the next
   * reader has no way to tell a deliberate change from a typo — and the two
   * locked documents are amended in place rather than rewritten precisely so
   * that history survives. What must not survive is a *live* statement of the
   * wrong number, which is everything outside a `>` block.
   */
  const liveProse = (path: string) =>
    read(path)
      .split("\n")
      .filter((line) => !line.trimStart().startsWith(">"))
      .join("\n");

  it("leaves no 680×240 in the design guidelines or the wireframes", () => {
    for (const path of [
      "docs/design-guidelines.md",
      "docs/wireframe/discord-preset.html",
      "docs/wireframe/index.html",
      "docs/wireframe/states.html",
    ]) {
      expect(liveProse(path), path).not.toMatch(/680\s*[×x]\s*240/);
    }
  });

  it("leaves no Nitro or Boost gating rule in the preset wireframe", () => {
    // Two Discord articles updated within a fortnight of each other contradict
    // each other on animated-emoji gating. Until that resolves the page states
    // no rule at all.
    const html = read("docs/wireframe/discord-preset.html");
    expect(html).not.toMatch(/\bNitro\b/i);
    expect(html).not.toMatch(/\bboost(ed|s)?\b/i);
  });

  it("leaves no Slack preset in the wireframe, which is cut from scope", () => {
    expect(read("docs/wireframe/discord-preset.html")).not.toMatch(/Slack/i);
  });
});
