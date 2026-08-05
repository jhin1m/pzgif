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
 * It runs as part of `pnpm build` rather than as a separate CI step, because a
 * build that forgot to copy the binaries would otherwise ship a site whose
 * engine 404s.
 *
 * ── Why the sources are resolved by walking, not by subpath ──────────────────
 * `gifski-wasm`'s `exports` map lists only `.`, `./multi-thread`, `./cloudflare`
 * and `./node`. `require.resolve('gifski-wasm/pkg/gifski_wasm_bg.wasm')` is
 * therefore refused with `ERR_PACKAGE_PATH_NOT_EXPORTED` — measured, not
 * assumed. Resolving the package entry and walking to a sibling directory is the
 * documented fallback, and it stays correct under pnpm's symlinked store, where
 * a hardcoded `node_modules/<pkg>/…` path is a layout assumption rather than a
 * fact.
 *
 * Only the single-thread `pkg/` build is ever copied. `pkg-parallel/` is the
 * rayon build; it needs SharedArrayBuffer (forbidden-guard-allow), which needs
 * cross-origin isolation, which breaks ad serving. ESLint bans the import path;
 * this script simply never ships the binary.
 */

import { copyFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const { version: VERSION } = JSON.parse(
  readFileSync(join(process.cwd(), "wasm-version.json"), "utf8"),
);
const DEST = join(process.cwd(), "public", "wasm", VERSION);

/**
 * Each entry names a package and the path to its binary relative to the
 * directory holding the package's resolved entry point.
 */
const SOURCES = [
  {
    package: "gifski-wasm",
    // dist/encode.js -> ../pkg/gifski_wasm_bg.wasm
    relativeToEntryDir: "../pkg/gifski_wasm_bg.wasm",
  },
];

mkdirSync(DEST, { recursive: true });

let copied = 0;
const missing = [];

for (const source of SOURCES) {
  let from;
  try {
    from = join(
      dirname(require.resolve(source.package)),
      source.relativeToEntryDir,
    );
  } catch {
    missing.push(`${source.package} (package not resolvable)`);
    continue;
  }
  if (!existsSync(from)) {
    missing.push(`${source.package} -> ${source.relativeToEntryDir}`);
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
