import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The ad quarantine, enforced mechanically.
 *
 * `design-guidelines.md` §1.3 and §4.2 make the 6px radius a **reserved word**:
 * ad slots only, everything else 4/8/12/16. The mismatch is the deliberate
 * "this is not app UI" signal that keeps a reviewer — and a visitor — able to
 * tell a creative from a product card in under a second, and it is also what
 * keeps accidental clicks and later policy trouble away.
 *
 * §1.3 makes a violation a design-review failure. A rule enforced only by review
 * is a rule that survives until the first busy week, so it is a test failure too
 * (phase-03 step "Ad slot quarantine — enforce it mechanically").
 */

const COMPONENTS_DIR = join(process.cwd(), "src/components");
const GLOBALS_CSS = join(process.cwd(), "src/app/globals.css");

/** Every component file, with the ad components themselves set aside. */
function componentFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "ads") continue;
      componentFiles(path, out);
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name)
    ) {
      out.push(path);
    }
  }
  return out;
}

describe("ad quarantine", () => {
  const productFiles = componentFiles(COMPONENTS_DIR);

  it("finds product components to check", () => {
    // A silently empty sweep would report success while checking nothing.
    expect(productFiles.length).toBeGreaterThan(10);
  });

  it("keeps the 6px ad radius out of every product component", () => {
    for (const file of productFiles) {
      const source = readFileSync(file, "utf8");
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(code, `${file} uses the ad radius`).not.toMatch(
        /rounded-ad|--radius-ad|\b6px\b/,
      );
    }
  });

  it("never lets a product component render an .ad-slot", () => {
    for (const file of productFiles) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/["' ]ad-slot/);
    }
  });

  const css = readFileSync(GLOBALS_CSS, "utf8");
  const adSlotBlock = /\.ad-slot\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

  it("gives the ad slot the full quarantine treatment", () => {
    expect(adSlotBlock).not.toBe("");
    expect(adSlotBlock).toMatch(/border-radius:\s*var\(--radius-ad\)/);
    expect(adSlotBlock).toMatch(/box-shadow:\s*none/);
    // A late fill must not be able to reflow the page (§8.2).
    expect(adSlotBlock).toMatch(/contain:\s*layout size/);
    // §5.10 positions the label absolutely; without this it would position
    // against some unrelated ancestor.
    expect(adSlotBlock).toMatch(/position:\s*relative/);
    // §8.3: 24px clearance from any button, on both sides.
    expect(adSlotBlock).toMatch(/margin-block:\s*24px/);
  });

  it("always labels an ad slot, filled or not", () => {
    expect(css).toMatch(
      /\.ad-slot::before\s*\{[^}]*content:\s*"Advertisement"/,
    );
  });

  it("pins ad slots to the content layer, never above it", () => {
    // §4.4: ad slots live at z-0 and are never sticky or fixed, apart from the
    // single permitted mobile anchor unit.
    expect(adSlotBlock).toMatch(/z-index:\s*var\(--z-content\)/);
    expect(adSlotBlock).not.toMatch(/position:\s*(sticky|fixed)/);
  });
});
