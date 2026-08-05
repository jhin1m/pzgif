#!/usr/bin/env node
/**
 * Fails the build when a heavyweight decoder ends up in the client bundle.
 *
 * ffmpeg.wasm is roughly 10 MB and exists only as a last-resort fallback for
 * codecs WebCodecs refuses — a path an estimated 1-3% of jobs take. A static
 * import anywhere would put it in a shared chunk, where 100% of visitors
 * download it, on a site whose ranking depends on Core Web Vitals.
 *
 * `src/lib/media/ffmpeg-fallback.ts` loads it from a runtime-assembled URL
 * precisely so no bundler can follow it. That is a subtle property, easy to
 * undo with an innocent-looking `import { FFmpeg } from "@ffmpeg/ffmpeg"`, and
 * invisible in a diff — so it is asserted here rather than trusted.
 *
 * The markers are the package specifier and ffmpeg-core's own factory symbol.
 * The *URL strings* `/ffmpeg/ffmpeg.mjs` and `/ffmpeg/ffmpeg-core.js` are
 * expected in the bundle and are not markers: they are how the fallback finds a
 * file it deliberately does not bundle.
 *
 * Run AFTER `next build`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CLIENT_CHUNKS = join(process.cwd(), ".next", "static");

/** Substrings that only appear when the code itself has been bundled. */
const MARKERS = ["@ffmpeg/", "createFFmpegCore"];

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (path.endsWith(".js")) files.push(path);
  }
  return files;
}

let chunks;
try {
  chunks = walk(CLIENT_CHUNKS);
} catch (error) {
  console.error("Could not read .next/static. Run `pnpm build` first.");
  console.error(String(error));
  process.exit(1);
}

const offenders = [];
for (const chunk of chunks) {
  const source = readFileSync(chunk, "utf8");
  for (const marker of MARKERS) {
    if (source.includes(marker)) {
      offenders.push(`${chunk.replace(process.cwd() + "/", "")} contains ${marker}`);
    }
  }
}

if (offenders.length > 0) {
  console.error("A heavyweight decoder was bundled into the client:\n");
  for (const offender of offenders) console.error(`  ${offender}`);
  console.error(
    "\nffmpeg must be loaded at runtime from public/ffmpeg/ via " +
      "src/lib/media/ffmpeg-fallback.ts, never imported.",
  );
  process.exit(1);
}

console.log(`No heavyweight decoder in ${chunks.length} client chunk(s).`);
