import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  openBench,
  runContext,
  selectFixture,
  writeResult,
  RESULTS,
} from "./harness";

/**
 * Gate G6 — the quality proof, prepared for blind judging.
 *
 * This spec **does not decide G6.** It cannot: the gate asks whether gifski is
 * *visibly* better than `gifenc` at matched bytes, and that is a question about
 * human perception. What it produces is the material a human needs to answer it
 * without being able to cheat — unlabelled files, a shuffled answer key, and a
 * tally sheet.
 *
 * `phase-01` pre-registers the protocol, and the pre-registration is the point:
 * judging "is it better" by eye, alone, when you need the answer to be yes, is
 * not a test. Three judges, forced choice, three fixtures spanning the range,
 * and a threshold of **at least 7 of 9 correct identifications**, fixed before
 * any file was generated.
 *
 * The stakes are concrete. gifski is why this entire client bundle is AGPL-3.0.
 * If the difference is not visible, the licence obligation buys nothing and
 * `gifenc` — MIT, no obligations, and already measured faster here — is simply
 * the better choice. `phase-01` also pre-commits what happens then: drop gifski,
 * drop the AGPL obligation, reposition on presets, privacy and the size-budget
 * UX, and cut every "visibly better" claim from the copy in the same commit.
 *
 * Both files come from **one decode**. Two decodes would let a difference in
 * downscaling or frame sampling leak into the comparison, and the judges would
 * be scoring that while believing they were scoring encoders.
 */

/** Three fixtures spanning the range, per the pre-registration. */
const JUDGED = [
  { fixture: "photo-grain.gif", width: 400, note: "photographic, heavy grain" },
  { fixture: "flat-art.gif", width: 400, note: "flat colour, few shades" },
  { fixture: "screen-720p-10s.mp4", width: 400, note: "screen recording" },
];

const PACK = join(RESULTS, "g6-pack");

test("G6 produce the blind-judging pack", async ({ page, browserName }) => {
  test.setTimeout(30 * 60_000);
  // One engine's output is what gets judged; generating three packs would only
  // multiply the judging burden without changing what is being asked.
  test.skip(browserName !== "chromium", "The pack is generated once.");

  await openBench(page);
  const context = await runContext(page, browserName);
  mkdirSync(PACK, { recursive: true });

  const key = [];

  for (const [index, item] of JUDGED.entries()) {
    await selectFixture(page, item.fixture);

    const outcome = await page.evaluate(
      (spec) => window.__bench!.pair(spec),
      { width: item.width, fps: 15, quality: 80 },
    );

    // Deterministic assignment rather than a random one: a judging pack that
    // cannot be regenerated identically cannot be re-checked later.
    const gifskiIsA = index % 2 === 0;

    for (const [slot, which] of [
      ["A", gifskiIsA ? "gifski" : "gifenc"],
      ["B", gifskiIsA ? "gifenc" : "gifski"],
    ] as const) {
      const url = outcome[which].url;
      const bytes = await page.evaluate(async (objectUrl) => {
        const response = await fetch(objectUrl);
        return [...new Uint8Array(await response.arrayBuffer())];
      }, url);
      writeFileSync(
        join(PACK, `${index + 1}-${slot}.gif`),
        Buffer.from(bytes),
      );
    }

    key.push({
      pair: index + 1,
      fixture: item.fixture,
      note: item.note,
      A: gifskiIsA ? "gifski" : "gifenc",
      B: gifskiIsA ? "gifenc" : "gifski",
      dimensions: `${outcome.width}x${outcome.height}`,
      frames: outcome.frames,
      gifskiBytes: outcome.gifski.bytes,
      gifencBytes: outcome.gifenc.bytes,
      gifencColours: outcome.gifenc.colours,
      gifencLadderAttempts: outcome.gifenc.attempts,
      gifskiMs: outcome.gifski.ms,
      gifencMs: outcome.gifenc.ms,
      byteDeltaPct: +(
        ((outcome.gifenc.bytes - outcome.gifski.bytes) / outcome.gifski.bytes) *
        100
      ).toFixed(1),
    });

    // The comparison is only fair if the sizes really are matched. `gifenc` is
    // tuned down a discrete palette ladder, so it lands at or under gifski's
    // count rather than exactly on it — but a pair that ended up wildly apart
    // would be measuring file size, not quality, and must not reach a judge.
    expect(outcome.gifenc.bytes).toBeLessThanOrEqual(outcome.gifski.bytes * 1.02);
  }

  writeResult("g6-answer-key.json", { gate: "G6", context, pairs: key });

  writeFileSync(
    join(PACK, "TALLY-SHEET.md"),
    [
      "# G6 blind judging — tally sheet",
      "",
      "Pre-registered before any file here was generated. Do not read",
      "`bench-results/g6-answer-key.json` until all three judges have finished.",
      "",
      "## What you are being asked",
      "",
      "Each numbered pair contains the same animation encoded two ways, at",
      "**matched file sizes**. For each pair, say which file looks better —",
      "A or B. You must choose one; there is no tie option, and that is",
      "deliberate. Look for banding in gradients, colour noise in flat areas,",
      "and dot patterns in detailed regions.",
      "",
      "Open the files at 100% zoom. Do not scale them in a browser window.",
      "",
      "## Pre-committed threshold",
      "",
      "3 judges x 3 pairs = 9 judgements. gifski must be picked in **at least",
      "7 of 9** for G6 to pass.",
      "",
      "If it does not pass: gifski is dropped, the AGPL obligation goes with it,",
      "and every 'visibly better' claim is cut from the copy in the same commit.",
      "",
      "## Record your answers",
      "",
      "| Judge | Pair 1 | Pair 2 | Pair 3 |",
      "|---|---|---|---|",
      "| 1 | | | |",
      "| 2 | | | |",
      "| 3 | | | |",
      "",
      "Files: `1-A.gif` / `1-B.gif`, `2-A.gif` / `2-B.gif`, `3-A.gif` / `3-B.gif`",
      "",
    ].join("\n"),
  );
});
