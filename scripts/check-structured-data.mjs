#!/usr/bin/env node
/**
 * Mechanical guard on the JSON-LD this site emits.
 *
 * Two structured-data decisions in this project are load-bearing and both are
 * the kind a later "SEO fix" quietly reverses:
 *
 *  1. **No `aggregateRating` / `review`.** Google grants a star rating only to
 *     markup that carries one, PZGIF has no reviews, and fabricating them to earn
 *     the star is a structured-data spam violation that risks a manual action
 *     against a site whose entire model is organic search. The upside is
 *     cosmetic; the downside is catastrophic. So the rating stays absent, and a
 *     future session cannot "complete" the markup by inventing one without this
 *     failing first. See `components/content/tool-json-ld.tsx`.
 *  2. **No `FAQPage` / `HowTo`.** Both were removed from Google Search — FAQ
 *     results on 2026-05-07, HowTo earlier — and `design-guidelines.md` §10's
 *     original request for `FAQPage` is obsolete. The visible FAQ UI stays; the
 *     dead JSON-LD does not come back. See `components/content/faq-section.tsx`.
 *
 * ── Why it matches *quoted* usage rather than the bare word ──────────────────
 * The two components above have to name these constructs in prose to explain why
 * they are absent. A bare-word grep would trip on that documentation and force
 * either a pile of inline pragmas through the comments or a whole-file
 * allowlist — and allowlisting the JSON-LD files is exactly wrong, because they
 * are where a rating would be added. So the rules target the shape real markup
 * takes: a schema.org type in quotes (`"FAQPage"`) or a property used as a key
 * (`aggregateRating:` / `"aggregateRating"`). The deliberate-absence comments
 * write the same names in backticks, which no rule matches.
 *
 * Run as part of CI, before the build.
 */

import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();

/** Mirrors `check-forbidden-headers.mjs`: everywhere markup could be authored. */
const SCAN_DIRS = ["src", "scripts", "public", ".github", "e2e"];

const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
]);

/**
 * Escape hatch, for the rare line that must write real markup shape in a comment
 * or a test. Reserved narrowly; the doc comments do not need it because they use
 * backticks, which no rule below matches.
 */
const LINE_PRAGMA = "structured-data-guard-allow";

/** This file names the constructs to forbid them, so it exempts itself. */
const ALLOWLIST = new Set(["scripts/check-structured-data.mjs"]);

const RULES = [
  {
    // Property key form (`aggregateRating:` or `"aggregateRating"`), which is how
    // a rating is actually added. Backticked prose does not match either arm.
    pattern: /["']aggregateRating["']|\baggregateRating\s*:/,
    reason:
      "No ratings exist. Self-serving `aggregateRating` markup is a structured-data manual action risk. Do not add one to earn a star.",
  },
  {
    pattern: /["']FAQPage["']/,
    reason:
      "FAQ rich results were removed from Google Search on 2026-05-07. Keep the FAQ UI; do not emit FAQPage JSON-LD.",
  },
  {
    pattern: /["']HowTo["']/,
    reason:
      "HowTo rich results were removed from Google Search. Do not emit HowTo JSON-LD.",
  },
];

function isScannable(name) {
  return SCAN_EXTENSIONS.has(extname(name));
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      yield* walk(full);
    } else if (isScannable(entry.name)) {
      yield full;
    }
  }
}

const files = SCAN_DIRS.flatMap((dir) => [...walk(join(ROOT, dir))]);

if (files.length === 0) {
  console.error("Scanned nothing — the guard is misconfigured, not passing.");
  process.exit(1);
}

const violations = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  if (ALLOWLIST.has(rel)) continue;

  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (line.includes(LINE_PRAGMA)) return;
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        violations.push({
          rel,
          line: index + 1,
          text: line.trim(),
          reason: rule.reason,
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error("Forbidden structured-data markup found:\n");
  for (const violation of violations) {
    console.error(`  ${violation.rel}:${violation.line}`);
    console.error(`    ${violation.text}`);
    console.error(`    ${violation.reason}\n`);
  }
  console.error(
    `${violations.length} violation(s). See phase-09 §"Structured data" before changing this.`,
  );
  process.exit(1);
}

console.log(
  `No forbidden structured-data markup in ${files.length} scanned files.`,
);
