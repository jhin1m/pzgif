#!/usr/bin/env node
/**
 * Mechanical enforcement of the single constraint that governs this project.
 *
 * No page may be cross-origin isolated. `COEP: require-corp` breaks Google ad
 * serving and `COEP: credentialless` is unsupported in Safari, so multi-threaded
 * WASM — which needs SharedArrayBuffer, which needs isolation — is out
 * permanently. A change that reintroduces any of it breaks the revenue model,
 * and review is not a reliable place to catch it.
 *
 * Run as part of CI, before the build.
 */

import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();

/**
 * Directories scanned, relative to the repo root.
 *
 * `.github` is in the list because a workflow can set response headers just as
 * easily as application code can, and CI config is exactly where a
 * "temporary" isolation experiment gets parked.
 */
const SCAN_DIRS = ["src", "scripts", "public", ".github", "e2e"];

/**
 * Extensions scanned inside SCAN_DIRS *and* at the repo root.
 *
 * Root files matter more than they look: `vercel.json`, `wrangler.toml`,
 * `netlify.toml` and `public/_headers` are the places a host is actually told to
 * emit a header, and none of them is TypeScript. Scanning by extension rather
 * than by an enumerated file list means a newly added config cannot slip in
 * unscanned — the earlier version of this script listed `vitest.config.ts` while
 * the file on disk was `vitest.config.mts`, and silently checked nothing.
 */
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
  ".yml",
  ".yaml",
  ".toml",
]);

/** Extension-less files that carry header configuration. */
const SCAN_EXTENSIONLESS = new Set(["_headers", "_redirects", "Caddyfile"]);

/**
 * Escape hatch. Put this marker on a line to exempt it — for a comment that has
 * to name the construct in order to warn about it. Whole-file allowlisting is
 * deliberately reserved for the two enforcement files below, because the files
 * most likely to need an exemption are also the ones most likely to reintroduce
 * the problem.
 */
const LINE_PRAGMA = "forbidden-guard-allow";

/**
 * Files allowed to name the banned constructs, because naming them is the whole
 * point of the file. Both entries below exist to *enforce* the same constraint.
 */
const ALLOWLIST = new Set([
  "scripts/check-forbidden-headers.mjs",
  "eslint.config.mjs",
]);

const RULES = [
  {
    pattern: /SharedArrayBuffer/,
    reason:
      "SharedArrayBuffer requires cross-origin isolation, which breaks Google ad serving.",
  },
  {
    pattern: /Cross-Origin-Embedder-Policy|crossOriginEmbedderPolicy/i,
    reason:
      "COEP isolates the page. `require-corp` breaks ads; Safari has no `credentialless`.",
  },
  {
    pattern: /Cross-Origin-Opener-Policy|crossOriginOpenerPolicy/i,
    reason:
      "COOP is half of cross-origin isolation and has no other purpose here.",
  },
  {
    pattern: /gifski-wasm\/multi-thread/,
    reason:
      "The multi-thread gifski build needs SharedArrayBuffer. Use the single-thread build.",
  },
  {
    pattern: /gifski-wasm\/cloudflare/,
    reason:
      "The Cloudflare gifski build targets a server runtime. The free tier runs entirely in the user's tab.",
  },
  {
    pattern: /@ffmpeg\/core-mt/,
    reason:
      "The multi-thread ffmpeg core needs SharedArrayBuffer. Use the single-thread core.",
  },
];

function isScannable(name) {
  return SCAN_EXTENSIONS.has(extname(name)) || SCAN_EXTENSIONLESS.has(name);
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

/** Every scannable file at the repo root, plus the scanned directories. */
function rootFiles() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isScannable(entry.name))
    .map((entry) => join(ROOT, entry.name));
}

const files = [
  ...SCAN_DIRS.flatMap((dir) => [...walk(join(ROOT, dir))]),
  ...rootFiles(),
];

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
  console.error("Forbidden cross-origin-isolation constructs found:\n");
  for (const violation of violations) {
    console.error(`  ${violation.rel}:${violation.line}`);
    console.error(`    ${violation.text}`);
    console.error(`    ${violation.reason}\n`);
  }
  console.error(
    `${violations.length} violation(s). See docs/tech-stack.md §2 before changing this.`,
  );
  process.exit(1);
}

console.log(`No forbidden constructs in ${files.length} scanned files.`);
