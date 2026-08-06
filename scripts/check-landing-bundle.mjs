#!/usr/bin/env node
/**
 * Keeps the engine off the landing page, and the handoff off the server.
 *
 * Two rules that a reviewer would otherwise have to remember, and that erode the
 * first time somebody imports something convenient:
 *
 *  1. **The homepage boots no engine.** No media worker, no WASM loader, no
 *     `capability.ts`. Reading 4096 bytes of a dropped file is the whole of that
 *     page's client-side work — everything else belongs to the tool page the
 *     visitor picks. This is the landing page's performance budget, and
 *     Lighthouse ≥ 95 at first paint is what it is spent on.
 *  2. **Nothing imports the handoff from a server component.** `pending-file.ts`
 *     holds mutable module state. Per tab that is the whole design; inside the
 *     Node process it is one variable shared by every request the process
 *     handles, in a module that holds a `File`.
 *
 *     It is safe today for a precise reason, and the precision matters: the
 *     module **is** in the SSR bundle — a `"use client"` module is still
 *     rendered on the server for the initial HTML — but neither entry point is
 *     reachable there. `setPendingFile` runs only from a click handler and
 *     `takePendingFile` only from `useEffect`, and neither fires during a server
 *     render. What would break that is an importer that is *not* a client
 *     module, because its code runs during the render itself. So that is what
 *     is checked.
 *
 *     An earlier version of this rule grepped the server bundles for the
 *     exported names and reported success. It was walking `.next/server/app`
 *     while the module sits in `.next/server/chunks/ssr/` — five files it never
 *     opened. It could not have failed. That is recorded because it is the exact
 *     trap the canary below exists to catch, sprung on the half of the script
 *     that did not have one.
 *
 * ── Why it greps the built output and not the imports ──────────────────────
 * An import graph read from source misses what a bundler actually did — a
 * re-export barrel, a transitive dependency, a `require` inside a dependency.
 * The question is what ships, so the check reads what shipped.
 *
 * ── The canary is not optional ─────────────────────────────────────────────
 * Every marker below is also asserted to be **present** in a tool page's chunks.
 * A string that stops matching — renamed, minified differently, deleted —
 * otherwise turns this whole script into a silent pass, which is worse than not
 * having it: it would report success while checking nothing.
 *
 * Run AFTER `next build`.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const BUILD_DIR = join(process.cwd(), ".next");
const APP_DIR = join(BUILD_DIR, "server", "app");

/** The prerendered HTML of the page under test, and of the page that proves the check works. */
const LANDING_HTML = join(APP_DIR, "en.html");
const CANARY_HTML = join(APP_DIR, "en", "gif-compressor.html");

/**
 * Strings that mean "the engine is in this bundle".
 *
 * Each is a runtime value rather than an identifier, because identifiers are
 * renamed by minification and object-literal keys and string literals are not.
 */
const ENGINE_MARKERS = [
  // `job-controller.ts` names the pipeline worker when it constructs it. Nothing
  // else in the codebase uses this string.
  { marker: "pzgif-pipeline", source: "src/lib/media/job-controller.ts" },
  // Keys of the `Capabilities` object literal in `capability.ts`.
  { marker: "offscreenCanvas", source: "src/lib/media/capability.ts" },
  { marker: "videoEncode", source: "src/lib/media/capability.ts" },
];

/** The module whose importers must all be client modules. */
const HANDOFF_MODULE = "src/lib/handoff/pending-file.ts";
const HANDOFF_IMPORT = "@/lib/handoff/pending-file";
const SOURCE_DIR = join(process.cwd(), "src");

function fail(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

function readOrDie(path, hint) {
  if (!existsSync(path)) {
    fail([
      `Missing ${relative(process.cwd(), path)}.`,
      hint,
    ]);
  }
  return readFileSync(path, "utf8");
}

/** The client chunks a prerendered page actually loads, as file contents. */
function chunksOf(htmlPath) {
  const html = readOrDie(htmlPath, "Run `pnpm build` first.");
  const sources = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(
    (match) => match[1],
  );
  if (sources.length === 0) {
    fail([
      `${relative(process.cwd(), htmlPath)} references no scripts.`,
      "That means the HTML shape changed and this guard is reading nothing.",
    ]);
  }

  const chunks = [];
  for (const source of sources) {
    // "/_next/static/chunks/x.js" → "<build>/static/chunks/x.js"
    const file = join(BUILD_DIR, source.replace(/^\/_next\//, ""));
    if (!existsSync(file)) continue;
    chunks.push({ name: source, code: readFileSync(file, "utf8") });
  }
  if (chunks.length === 0) {
    fail([
      `Resolved none of ${sources.length} script tags in ${relative(process.cwd(), htmlPath)} to a file.`,
      "The static output layout changed; this guard must not report success.",
    ]);
  }
  return chunks;
}

function walk(dir, extensions, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, extensions, out);
    else if (extensions.some((extension) => full.endsWith(extension))) out.push(full);
  }
  return out;
}

/* ── 1. The canary: every marker is findable somewhere it should be ───────── */

const canary = chunksOf(CANARY_HTML);
const blind = ENGINE_MARKERS.filter(
  ({ marker }) => !canary.some((chunk) => chunk.code.includes(marker)),
);

if (blind.length > 0) {
  fail([
    "These markers no longer appear in the compressor's own bundle:\n",
    ...blind.map(({ marker, source }) => `  "${marker}"  (${source})`),
    "",
    "The compressor *does* boot the engine, so a marker missing there is a",
    "broken check rather than a clean bundle. Update the marker to something",
    "that survives in the built output — a string literal or an object key,",
    "never an identifier.",
  ]);
}

/* ── 2. The homepage carries none of them ─────────────────────────────────── */

const landing = chunksOf(LANDING_HTML);
const leaked = [];
for (const { marker, source } of ENGINE_MARKERS) {
  for (const chunk of landing) {
    if (chunk.code.includes(marker)) leaked.push({ marker, source, chunk: chunk.name });
  }
}

if (leaked.length > 0) {
  fail([
    "The landing page loads the media engine:\n",
    ...leaked.map(
      ({ marker, source, chunk }) => `  ${chunk}\n    contains "${marker}" from ${source}`,
    ),
    "",
    "The homepage's client-side budget is `sniff.ts` and nothing else. Something",
    "it imports now reaches the worker, the WASM loader or capability detection —",
    "usually a shared component that grew an engine import, or a barrel file.",
  ]);
}

/* ── 3. Every importer of the handoff is a client module ──────────────────── */

const sources = walk(SOURCE_DIR, [".ts", ".tsx"]).filter(
  (file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"),
);
if (sources.length === 0) {
  fail(["Found no source files to check. The source layout changed."]);
}

const importers = sources.filter(
  (file) =>
    relative(process.cwd(), file) !== HANDOFF_MODULE &&
    readFileSync(file, "utf8").includes(HANDOFF_IMPORT),
);

// The canary, same reasoning as the one above: a rule that finds nothing to
// check has to say so. If the module were renamed, or the alias changed to a
// relative path, this loop would iterate zero times and pass in silence.
if (importers.length === 0) {
  fail([
    `Nothing imports "${HANDOFF_IMPORT}".`,
    "",
    "Either the handoff was removed — in which case delete this rule — or it",
    "moved and this check is now looking for a module that no longer exists.",
    "A guard that checks nothing must not report success.",
  ]);
}

const onServer = importers.filter((file) => {
  // `"use client"` has to be the first statement, so the directive is at the
  // top of the file modulo comments and blank lines.
  const head = readFileSync(file, "utf8").slice(0, 2000);
  return !/^\s*(?:\/\*[\s\S]*?\*\/|\/\/.*\n|\s)*["']use client["']/.test(head);
});

if (onServer.length > 0) {
  fail([
    "A server module imports the handoff singleton:\n",
    ...onServer.map((file) => `  ${relative(process.cwd(), file)}`),
    "",
    "`pending-file.ts` holds a module-level `File`. Per tab that is the whole",
    'design; in the Node process it is one variable shared across every request.',
    'A `"use client"` importer never runs its handoff code on the server — a',
    "server component's does, during the render itself.",
  ]);
}

console.log(
  `Landing page clean across ${landing.length} chunk(s); ` +
    `all ${importers.length} handoff importer(s) are client modules.`,
);
