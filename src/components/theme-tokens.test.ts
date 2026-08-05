import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * §2.2: "Never reference a primitive directly in a component. Always go through
 * a semantic token so dark mode works for free."
 *
 * ── Why this is a test and not a convention ────────────────────────────────
 * The `dark:` variant is defined as `&:where([data-theme="dark"] *)`, which
 * matches *any descendant* of a dark subtree — including elements inside a
 * nested light one. `/dev/states` renders both themes on a single page, and it
 * is where this first showed up: a light pane inside a dark document painted its
 * secondary buttons with the dark hover colour. Going through a semantic token
 * makes the theme an element actually sits in the one that wins, which is what
 * the spec asked for in the first place.
 *
 * The exemption below is the single case where a fixed colour is correct.
 */

const COMPONENTS_DIR = join(process.cwd(), "src/components");

/**
 * The before/after label plate sits on top of image content rather than on a
 * page surface, so it must stay dark-on-light in both themes — a themed plate
 * would disappear over half the frames it labels.
 */
const FIXED_COLOUR_EXEMPTIONS = new Set(["tool/before-after-slider.tsx"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      out.push(path);
  }
  return out;
}

const FILES = sourceFiles(COMPONENTS_DIR);

describe("theme tokens", () => {
  it("finds component sources to check", () => {
    expect(FILES.length).toBeGreaterThan(10);
  });

  it("never uses the `dark:` variant in a component", () => {
    for (const file of FILES) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(code, `${file} uses a dark: utility`).not.toMatch(/\bdark:/);
    }
  });

  it("consumes semantic tokens rather than palette primitives", () => {
    for (const file of FILES) {
      if (FIXED_COLOUR_EXEMPTIONS.has(file.slice(COMPONENTS_DIR.length + 1)))
        continue;
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(code, `${file} references a palette primitive`).not.toMatch(
        /(bg|text|border|from|to|via)-(neutral|primary|accent|success|warning|danger)-\d/,
      );
      // `bg-white` and `bg-black` are the same mistake wearing a different name:
      // §5.6 specifies the switch knob as `--bg`, not as white, and a knob that
      // stays white in dark mode is a knob that stopped following the theme.
      expect(code, `${file} hard-codes white or black`).not.toMatch(
        /(bg|text|border)-(white|black)\b/,
      );
    }
  });
});
