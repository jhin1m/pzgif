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
 * Comments stripped first. This file documents itself heavily, and several of
 * those comments quote the very selectors and at-rules the assertions below look
 * for — `[data-theme="dark"] { … }` appears inside the shadow note, and
 * `@utility bg-checker` inside the token note. Searching the raw text finds the
 * prose before it finds the rule.
 */
const GLOBALS_CSS = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** The text of one top-level `{ … }` block, given the text that opens it. */
function blockAfter(source: string, opener: string): string {
  const start = source.indexOf(opener);
  if (start < 0) throw new Error(`No block opened by ${opener}`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index++) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed block opened by ${opener}`);
}

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

describe("the checkerboard motif", () => {
  it("defines --checker-tint in both themes", () => {
    // Both, not just light. A motif that resolves in one theme and falls back to
    // `initial` in the other renders as nothing at all on half the site, and it
    // is invisible in review because review happens in whichever theme is on.
    expect(blockAfter(GLOBALS_CSS, ":root,")).toContain("--checker-tint:");
    expect(blockAfter(GLOBALS_CSS, '[data-theme="dark"] {')).toContain(
      "--checker-tint:",
    );
  });

  it("keeps --checker-tint out of @theme", () => {
    // The header comment's rule, made mechanical: a value inside `@theme` is
    // snapshotted at build time, so a token defined there stops responding to
    // the theme and dark mode silently stops working for it.
    expect(blockAfter(GLOBALS_CSS, "@theme {")).not.toContain("--checker-tint");
  });

  it("builds the motif from the token rather than a literal", () => {
    const utility = blockAfter(GLOBALS_CSS, "@utility bg-checker");
    expect(utility).toContain("var(--checker-tint)");
    expect(utility).toContain("repeating-conic-gradient");
    // 16px tiles: at 8px the pattern reads as noise under 200% zoom.
    expect(utility).toContain("background-size: 16px 16px");
  });

  it("adds no animation — the motif is a signifier, not an effect", () => {
    const utility = blockAfter(GLOBALS_CSS, "@utility bg-checker");
    expect(utility).not.toMatch(/animation|transition/);
  });
});
