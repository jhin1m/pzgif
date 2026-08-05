#!/usr/bin/env node
/**
 * Copies the `.wasm` binaries out of node_modules into `public/wasm/<version>/`.
 *
 * The binaries are served from an explicit, origin-anchored URL rather than
 * resolved through a bundler import, which sidesteps every Turbopack-vs-webpack
 * asset-resolution difference — including the worker+WASM origin bug fixed in
 * Next 16.2. That URL is also what carries the `immutable` cache header, which
 * is only safe because the version segment is in the path (the filenames carry
 * no content hash).
 *
 * Bump `wasm-version.json` whenever these files change. That file is the single
 * source for the segment; `src/lib/site-config.ts` reads the same value.
 *
 * The sources list is empty until Phase 4 vendors the encoders. Running this now
 * is a no-op that keeps the wiring, the destination directory and the build step
 * in place, so the first real binary is a one-line change. It runs as part of
 * `pnpm build` rather than as a separate CI step, because a build that forgot to
 * copy the binaries would otherwise ship a site whose engine 404s.
 */

import { copyFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const { version: VERSION } = JSON.parse(
  readFileSync(join(process.cwd(), "wasm-version.json"), "utf8"),
);
const DEST = join(process.cwd(), "public", "wasm", VERSION);

/** Paths relative to the repo root, resolved from node_modules. */
const SOURCES = [
  // Phase 4: "node_modules/gifski-wasm/dist/gifski.wasm", …
];

mkdirSync(DEST, { recursive: true });

let copied = 0;
const missing = [];

for (const source of SOURCES) {
  const from = join(process.cwd(), source);
  if (!existsSync(from)) {
    missing.push(source);
    continue;
  }
  copyFileSync(from, join(DEST, basename(from)));
  copied += 1;
}

if (missing.length > 0) {
  console.error("Missing WASM sources — did an install step fail?\n");
  for (const source of missing) console.error(`  ${source}`);
  process.exit(1);
}

console.log(`Copied ${copied} wasm file(s) to public/wasm/${VERSION}/.`);
