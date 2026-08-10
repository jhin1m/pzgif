#!/usr/bin/env node
/**
 * Regenerates `e2e/fixtures/`.
 *
 * The fixtures are **committed**, not generated at test time — a benchmark whose
 * inputs are re-synthesised on every run measures the generator as much as the
 * pipeline, and a Playwright suite that shells out to ffmpeg only passes on
 * machines that have it. This script exists so the corpus is reproducible and
 * reviewable, not so it runs in CI.
 *
 * Everything is synthesised from ffmpeg's own sources. No third-party media, so
 * no licence question attaches to the corpus and `LICENSE-CONTENT` does not have
 * to reason about it.
 *
 * Each fixture below states what it exercises. Do not "tidy" the odd numbers —
 * 499x281, the rotation metadata and the grain are the point of those entries.
 *
 * Requires: ffmpeg (any recent build with libx264, libx265, libvpx-vp9) and
 * gif2webp, cwebp and webpmux from the `webp` package.
 * Run: `node scripts/make-fixtures.mjs`
 *
 * `drawtext` is deliberately unused — Homebrew's default ffmpeg ships without
 * freetype, so a text overlay would make this script fail on the most common
 * install. Asymmetry markers use `drawbox`, which is always available and has
 * the side benefit of being checkable by reading a pixel rather than by eye.
 *
 * **`testsrc2` silently rounds its size to even on both axes** (measured: a
 * request for 499x281 yields 498x280). That would quietly destroy the one
 * fixture whose entire job is to be odd-sized, so anything odd is generated one
 * pixel larger and cropped down. `gradients` and `smptebars` honour odd sizes.
 *
 * That crop must come **after** `format=rgb24`: on yuv420p input the crop filter
 * aligns its output to the chroma grid and rounds an odd request back to even,
 * which is the same defect one layer down.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "e2e", "fixtures");
mkdirSync(OUT, { recursive: true });

const out = (name) => join(OUT, name);
const run = (bin, args) =>
  execFileSync(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
const ff = (args) => run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);

/**
 * A two-pass GIF: build a palette first, then apply it.
 *
 * `paletteuse` without an explicit palette silently falls back to a fixed 216
 * colour web palette, which would make every GIF fixture look like 1998 and
 * would flatten exactly the palette differences `photo-grain.gif` exists to
 * stress.
 */
function gif(inputArgs, filters, name, { colours = 256, dither = "sierra2_4a" } = {}) {
  const palette = out(`.palette-${name}.png`);
  ff([...inputArgs, "-vf", `${filters},palettegen=max_colors=${colours}`, "-frames:v", "1", palette]);
  ff([
    ...inputArgs,
    "-i", palette,
    "-lavfi", `${filters}[x];[x][1:v]paletteuse=dither=${dither}`,
    "-loop", "0",
    out(name),
  ]);
  run("rm", ["-f", palette]);
}

/**
 * One flat-colour still WebP, lossless — a building block for a hand-authored
 * animation, not a fixture in its own right, so it is written to a dotted name
 * and deleted by its caller.
 *
 * `format=rgb24` is not decoration: without it the colour source may negotiate
 * a YUV format with the PNG encoder, and a round trip through limited-range
 * chroma moves a pure primary by a few counts. The test that reads this asserts
 * exact channel values, so it has to stay in RGB the whole way — which is also
 * why the encode is `-lossless` rather than the default.
 */
function solidWebp(hex, size, name) {
  const png = out(`.${name}.png`);
  const webp = out(`.${name}.webp`);
  ff(["-f", "lavfi", "-i", `color=c=0x${hex}:s=${size}`, "-vf", "format=rgb24", "-frames:v", "1", png]);
  run("cwebp", ["-quiet", "-lossless", png, "-o", webp]);
  run("rm", ["-f", png]);
  return webp;
}

const steps = [
  // ── Video inputs ──────────────────────────────────────────────────────────
  [
    "screen-720p-10s.mp4",
    "H.264 720p30 10s. The headline throughput case (G2). Screen-recording-like content: large flat regions, hard edges and text, which is where palette quantisation is easiest and motion estimation is cheapest.",
    () =>
      ff([
        "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=10",
        "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-crf", "23",
        "-an", out("screen-720p-10s.mp4"),
      ]),
  ],
  [
    "phone-1080p-5s.mov",
    "HEVC 1080p in MOV — what an iPhone actually uploads. Exercises HEVC decode support and the memory ceiling (1080p RGBA is 8.29 MB/frame).",
    () =>
      ff([
        "-f", "lavfi", "-i", "mandelbrot=size=1920x1080:rate=30",
        "-t", "5", "-c:v", "libx265", "-tag:v", "hvc1", "-pix_fmt", "yuv420p",
        "-crf", "28", "-an", out("phone-1080p-5s.mov"),
      ]),
  ],
  [
    "clip-vp9-5s.webm",
    "VP9 in WebM 720p. The non-MP4 demux path.",
    () =>
      ff([
        "-f", "lavfi", "-i", "smptebars=size=1280x720:rate=25",
        "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25",
        "-filter_complex", "[0:v][1:v]blend=all_mode=difference",
        "-t", "5", "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0",
        "-pix_fmt", "yuv420p", "-an", out("clip-vp9-5s.webm"),
      ]),
  ],
  [
    "portrait-rotated.mp4",
    "Portrait phone video: 1920x1080 coded frames carrying a 90-degree display matrix. Without honouring container rotation this produces a sideways GIF, and it is the most common real-world video input there is (G7). The pass condition is programmatic and needs no eye: the coded frame is landscape, so an output whose height exceeds its width proves the rotation was applied. The two edge bars — yellow along the coded top, red along the coded left — let a human confirm the direction as well.",
    () => {
      // Two passes. `-display_rotation` is an *input* option in ffmpeg 8 — it
      // declares how an input should be interpreted — so the rotation is stamped
      // by re-muxing an already-encoded file with `-c copy`, which carries the
      // declaration through into a real Display Matrix side-data box. Setting
      // `-metadata:s:v rotate=90` on the output instead writes nothing at all on
      // this ffmpeg; verified with ffprobe, not assumed.
      const flat = out(".portrait-flat.mp4");
      ff([
        "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=4",
        "-vf", "drawbox=x=0:y=0:w=1920:h=90:color=yellow@1:t=fill,drawbox=x=0:y=0:w=90:h=1080:color=red@1:t=fill",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-an", flat,
      ]);
      ff(["-display_rotation", "90", "-i", flat, "-c", "copy", out("portrait-rotated.mp4")]);
      run("rm", ["-f", flat]);
    },
  ],

  // ── GIF inputs ────────────────────────────────────────────────────────────
  [
    "loop-small.gif",
    "480x270, 48 frames at 20 fps. The wireframe's canonical compressor example and the mobile survival case (G3). Light grain is added on purpose: clean synthetic content compresses to a few hundred KB, which would make the canonical compressor demo a fixture with almost nothing left to compress. The grain puts it in the size range a real uploaded GIF occupies.",
    () =>
      gif(
        ["-f", "lavfi", "-i", "testsrc2=size=480x270:rate=20:duration=2.4"],
        "noise=alls=3:allf=t,format=rgb24",
        "loop-small.gif",
      ),
  ],
  [
    "loop-large.gif",
    "800x600, 200 frames. The memory ceiling and deadlock stress case (G1, G4). 200 x 800 x 600 x 4 = 384 MB of decoded RGBA, doubled by gifski's copy.",
    () =>
      gif(
        ["-f", "lavfi", "-i", "testsrc2=size=800x600:rate=25:duration=8"],
        "format=rgb24",
        "loop-large.gif",
      ),
  ],
  [
    "photo-grain.gif",
    "Photographic content with heavy grain — the worst case for palette quality, and half of the G6 quality proof. Grain defeats flat-region quantisation and is where gifski's dithering should be most visible.",
    () =>
      gif(
        [
          "-f", "lavfi",
          "-i", "gradients=size=560x315:rate=15:duration=3:c0=0x8B2E1F:c1=0x1F3A8B:c2=0xD9A441:nb_colors=3",
        ],
        "noise=alls=42:allf=t+u,hue=H=2*PI*t/3,format=rgb24",
        "photo-grain.gif",
      ),
  ],
  [
    "flat-art.gif",
    "Flat colour, few shades — the best case, and the other half of G6. Also the fixture that validates the '32 colours is usually enough' advice the copy will make.",
    () =>
      gif(
        [
          "-f", "lavfi",
          "-i", "testsrc2=size=560x316:rate=12:duration=3",
        ],
        "format=rgb24,crop=560:315:0:0,elbg=codebook_length=8:nb_steps=6:seed=1",
        "flat-art.gif",
        { colours: 32, dither: "none" },
      ),
  ],
  [
    "odd-dims.gif",
    "499x281 — odd on both axes. H.264 yuv420p rejects odd dimensions, so this is the regression guard for the even-dimension rounding that GIF-to-MP4 depends on.",
    () =>
      gif(
        ["-f", "lavfi", "-i", "testsrc2=size=500x282:rate=15:duration=2"],
        "format=rgb24,crop=499:281:0:0",
        "odd-dims.gif",
      ),
  ],

  // ── Animated WebP ─────────────────────────────────────────────────────────
  [
    "anim.webp",
    "Animated WebP, from loop-small.gif so the two share content and the webp-to-gif round trip is checkable. ffmpeg has no libwebp encoder in the common Homebrew build, so this uses gif2webp from the webp package. Encoded lossy on purpose — gif2webp defaults to lossless, which is not what animated WebP on the web actually is, and lossy is what exercises the VP8 (not VP8L) branch of any ANMF splitter.",
    () =>
      run("gif2webp", ["-lossy", "-q", "75", "-m", "4", out("loop-small.gif"), "-o", out("anim.webp")]),
  ],
  [
    "webp-offset-dispose.webp",
    "The compositing fixture. `anim.webp`'s frames are all full-canvas, at offset 0,0, blending, never disposing — so it exercises none of the three rules that make an animated WebP a sequence of patches rather than pictures, and a decoder that ignored all three would still pass on it. This one is authored frame by frame with webpmux so each rule is isolated: frame 2 is a 16x16 patch at (32,16) with no-blend and dispose-to-background, and frame 3 is a 16x16 patch somewhere else entirely — deliberately NOT covering frame 2's rectangle, which is what makes the disposal observable at all. Three flat primaries and lossless encoding, because the test reads exact channel values.",
    () => {
      const base = solidWebp("FF0000", "64x64", "wod-base");
      const dot = solidWebp("0000FF", "16x16", "wod-dot");
      const mark = solidWebp("00FF00", "16x16", "wod-mark");
      // `+di+xi+yi+mi[bi]` — mi is dispose (0 none, 1 background) and bi is
      // `+b` blend or `-b` no-blend. The blend flag has no `+` separator of its
      // own; `+n` is not the spelling and webpmux rejects it.
      run("webpmux", [
        "-frame", base, "+100+0+0+0+b",
        "-frame", dot, "+100+32+16+1-b",
        "-frame", mark, "+100+0+32+0+b",
        "-loop", "0",
        "-bgcolor", "255,255,255,255",
        "-o", out("webp-offset-dispose.webp"),
      ]);
      run("rm", ["-f", base, dot, mark]);
    },
  ],
];

/**
 * Named arguments regenerate only those fixtures; everything else is measured
 * where it already sits, so the manifest still describes the whole corpus.
 *
 * This is not a convenience. **ffmpeg is not byte-reproducible here** — measured
 * on one machine across two consecutive runs, `photo-grain.gif` moved 6.5 → 8.3
 * MB and `clip-vp9-5s.webm` changed content at identical size. `noise=alls=42`
 * sets strength, not a seed, and libvpx's threading is not deterministic. A
 * blanket rerun to add one fixture therefore silently replaces the corpus that
 * G6's judging pack was scored against, which would invalidate the scores
 * without touching a single line of code.
 *
 * So: `node scripts/make-fixtures.mjs webp-offset-dispose.webp` to add one, and
 * a bare run only when replacing the corpus is the actual intent.
 */
const only = new Set(process.argv.slice(2));
const regenerate = (name) => only.size === 0 || only.has(name);

let total = 0;
const manifest = [];

for (const [name, why, make] of steps) {
  process.stdout.write(`  ${name} … `);
  const exists = existsSync(out(name));
  if (!regenerate(name) && exists) {
    const bytes = statSync(out(name)).size;
    total += bytes;
    manifest.push({ name, bytes, why });
    console.log(`${(bytes / 1024).toFixed(0)} KB (kept)`);
    continue;
  }
  try {
    make();
  } catch (error) {
    console.log("FAILED");
    console.error(String(error.stderr ?? error.message));
    process.exit(1);
  }
  const bytes = statSync(out(name)).size;
  total += bytes;
  manifest.push({ name, bytes, why });
  console.log(`${(bytes / 1024).toFixed(0)} KB`);
}

writeFileSync(
  out("manifest.json"),
  JSON.stringify({ generatedBy: "scripts/make-fixtures.mjs", fixtures: manifest }, null, 2) + "\n",
);

const stray = readdirSync(OUT).filter(
  (f) => !manifest.some((m) => m.name === f) && f !== "manifest.json" && f !== "README.md",
);
if (stray.length > 0) {
  console.warn(`\nUntracked files in e2e/fixtures/: ${stray.join(", ")}`);
}

console.log(`\nTotal ${(total / 1024 / 1024).toFixed(1)} MB across ${manifest.length} fixtures.`);
