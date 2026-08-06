import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import home from "@/content/home.json";
import { liveRoutes } from "@/lib/tools/registry";
import { homeContent } from "./home";

/**
 * The homepage is the one page whose copy is read by people who have not
 * decided to trust the site yet, so every claim on it is load-bearing. These
 * assertions are the mechanical half of the Phase 11 copy audit, applied early
 * because the homepage is also the surface a wrong number is hardest to walk
 * back from.
 */

const CONTENT = homeContent(home);

interface CalibrationRow {
  frames: number;
  width: number;
  height: number;
  encoder: string;
  encodeMs: number;
}

const CALIBRATION = JSON.parse(
  readFileSync(new URL("../../../bench-results/calibration.json", import.meta.url), "utf8"),
) as {
  context: { cpuCores: number; deviceMemoryGb: number };
  rows: readonly CalibrationRow[];
};

/** Every string in the file, flattened, so a rule can be applied to all of it. */
function allProse(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) allProse(item, out);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) allProse(item, out);
  return out;
}

const PROSE = allProse(CONTENT);

describe("the homepage copy", () => {
  it("validates against the schema", () => {
    expect(() => homeContent(home)).not.toThrow();
  });

  it("rejects a file with a section missing", () => {
    // The validator's whole job. A homepage that renders a blank hero because a
    // key was renamed fails silently, and silence is the failure mode here.
    const withoutHero: Record<string, unknown> = { ...CONTENT };
    delete withoutHero.hero;
    expect(() => homeContent(withoutHero)).toThrow(/hero\.title/);
  });

  it("claims no tool count the registry cannot support", () => {
    // The grid renders `liveRoutes()`, which grows every ship. A sub-head built
    // around a fixed number needs rewriting each time, and the one that does not
    // get rewritten is the one that ships a lie. The cheapest way to pass this
    // is to state no number at all.
    const live = liveRoutes().length;
    const numbers = [
      ...CONTENT.grid.subhead.matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi),
    ].map((match) => match[1].toLowerCase());
    const WORDS: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    };
    for (const token of numbers) {
      const value = WORDS[token] ?? Number(token);
      expect(value, `grid subhead says "${token}", ${live} routes are live`).toBe(
        live,
      );
    }
  });

  it("repeats none of the wireframe's documented copy defects", () => {
    // Four are recorded in the parent plan; the fifth was found while planning
    // this phase. All five are banned by name rather than by pattern, because a
    // pattern would not have caught "Nine tools. All of them run locally."
    const banned = [
      /nine tools/i,
      /up to 80\s*%/i,
      /a tenth of the size/i,
      /150\s*MB/i,
      /\bwebp\b/i,
      /\bslack\b/i,
    ];
    for (const line of PROSE) {
      for (const pattern of banned) {
        expect(line, `banned by ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("attaches evidence to every tile that states a figure", () => {
    // The rule the "why" block exists under: an architectural fact needs no
    // measurement because there is nothing to measure, but a number without the
    // hardware it was measured on is not a measurement.
    for (const tile of CONTENT.why) {
      const statesFigure = /\d/.test(tile.body);
      if (statesFigure) {
        expect(tile.evidence, `"${tile.heading}" states a figure`).toBeTruthy();
      }
      if (tile.evidence) {
        expect(tile.evidence, tile.heading).toMatch(/core|GB|laptop|device/i);
      }
    }
  });

  it("quotes only figures that a bench run actually produced", () => {
    // The assertion above checks that a figure *carries* evidence. This one
    // checks the figure is real, and it exists because the first draft of this
    // tile said "0.76 s" — a number in the right shape, on the right hardware,
    // that no run in `bench-results/` ever produced. Prose review does not catch
    // that; only the data does.
    //
    // Read from disk rather than imported: `bench-results/` is generated output
    // outside `src/`, and pulling it through the module graph would make a
    // benchmark artefact a build input.
    for (const tile of CONTENT.why) {
      if (!tile.evidence) continue;

      const frames = /\b(\d+)-frame\b/.exec(tile.evidence);
      const size = /\b(\d+)×(\d+)\b/.exec(tile.evidence);
      const seconds = /\b(\d+\.\d+)\s*s\b/.exec(tile.evidence);
      if (!seconds) continue;

      expect(frames, `"${tile.heading}" times a job without saying how long it was`).toBeTruthy();
      expect(size, `"${tile.heading}" times a job without saying how large it was`).toBeTruthy();

      const wantMs = Number(seconds[1]) * 1000;
      const match = CALIBRATION.rows.find(
        (row) =>
          row.frames === Number(frames![1]) &&
          row.width === Number(size![1]) &&
          row.height === Number(size![2]) &&
          // The quote is rounded to two decimals, so the row it came from is the
          // one within half of the last digit it shows.
          Math.abs(row.encodeMs - wantMs) <= 5,
      );

      expect(
        match,
        `"${tile.evidence}" matches no row in bench-results/calibration.json`,
      ).toBeTruthy();
    }
  });

  it("names the hardware the quoted run was measured on", () => {
    // A throughput number without the machine is not a measurement. This ties
    // the words to `calibration.json`'s recorded context, so re-running the
    // benchmark on a different laptop fails the suite instead of silently
    // leaving the page describing hardware nobody used.
    for (const tile of CONTENT.why) {
      if (!tile.evidence || !/\d+\.\d+\s*s\b/.test(tile.evidence)) continue;
      expect(tile.evidence).toContain(`${CALIBRATION.context.cpuCores}-core`);
      expect(tile.evidence).toContain(`${CALIBRATION.context.deviceMemoryGb} GB`);
    }
  });

  it("claims no superiority over another encoder while G6 is unscored", () => {
    // Parent plan.md:95-99 — whether gifski is *visibly* better than gifenc at
    // matched bytes is an open gate. Naming what gifski does is a description;
    // saying it beats the alternative is a result nobody has scored.
    for (const line of PROSE) {
      expect(line).not.toMatch(/better than|beats|outperform|superior to/i);
      expect(line).not.toMatch(/\bbest\b/i);
    }
  });

  it("uses no exclamation marks and no marketing superlatives", () => {
    // The wireframe's voice, kept: short sentences, concrete nouns, second
    // person. It is also the voice a privacy claim has to be made in to be
    // believed.
    for (const line of PROSE) {
      expect(line).not.toContain("!");
      expect(line).not.toMatch(
        /\b(amazing|awesome|blazing|effortless|magic|powerful|seamless|ultimate)\b/i,
      );
    }
  });
});
