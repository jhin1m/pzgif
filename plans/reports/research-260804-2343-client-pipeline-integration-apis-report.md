# PZGIF — Client Pipeline Integration APIs (implementation-grade research)

Date: 2026-08-04 · Scope: A(gifski-wasm) B(WebCodecs/demux/mux) C(worker+memory) D(benchmark) E(ffmpeg fallback) + 2 late additions (animated WebP, client-side ZIP).
All version/size numbers below were fetched live from `registry.npmjs.org`, `raw.githubusercontent.com`, MDN BCD, and WebKit source on 2026-08-04. Anything not verified is marked **unverified**.

## TL;DR — the three findings that change the plan

1. **`gifski-wasm` is AGPL-3.0-or-later and you ship it to the browser. Shipping it inside a closed-source Next.js bundle is a license violation.** Two lawful options only: buy the commercial license (**$950/yr solo**, explicitly includes gifski) or publish the client bundle under AGPL. Budget/decide before Phase 1. §A1.
2. **`ImageDecoder` does not exist in Safari — any version, desktop or iOS.** Verified from WebKit source: `Source/WebCore/Modules/webcodecs/` contains 44 IDL files and **no `ImageDecoder.idl`**. Every GIF-input tool (6 of 9 MVP tools) needs a JS/WASM GIF decoder fallback on Safari. §B7, §B9.
3. **`mp4-muxer` and `webm-muxer` are officially DEPRECATED by their own author in favour of `mediabunny`** (MPL-2.0, v1.52.3, published 2026-08-03). `mediabunny` also supersedes `mp4box.js` + any WebM demuxer, and its `CanvasSink` solves the memory problem in §C11 for free. Recommend swapping the demux/mux layer to a single `mediabunny` dependency. §B5, §B6, §B8.

Secondary but serious: **gifski-wasm cannot stream.** Its API concatenates every frame into one `Uint8Array` and then copies that whole buffer into the WASM heap — peak RSS = 2× (all frames × w × h × 4). This makes pre-downscaling to output GIF size mandatory, not an optimisation. §A2, §C11.

---

# A. gifski-wasm

## A1. Package, version, maintenance, LICENSING VERDICT

| Field | Value | Source |
|---|---|---|
| Package | **`gifski-wasm`** (`@gifski/wasm` does not exist — 404 on npm) | registry.npmjs.org |
| Latest version | **2.2.0**, published **2025-02-05** | registry.npmjs.org |
| License | **AGPL-3.0-or-later** | package.json `"license"`, GitHub license API = `agpl-3.0` |
| Repo | github.com/jamsinclair/gifski-wasm — 24 stars, 1 open issue, last commit **2025-02-05** (18 months stale) | GitHub API |
| Rust core | `gifski-lite` (jamsinclair fork), pinned to gifski **1.32.0**; upstream gifski is now **1.35.0** | gifski-lite/Cargo.toml vs ImageOptim/gifski/Cargo.toml |
| Single-thread wasm size | **292,735 B raw / 120,464 B gzip** (measured) | downloaded + gzip -9 |
| Multi-thread wasm size | 337,800 B raw | tarball listing |

### The licensing verdict — DO NOT SKIP

**Upstream gifski is AGPL-3.0-or-later.** From `ImageOptim/gifski` README verbatim:

> "AGPL 3 or later. I can offer alternative licensing options, including [commercial licenses](https://supso.org/projects/pngquant). Let me know if you'd like to use it in a product incompatible with this license."

`Cargo.toml`: `license = "AGPL-3.0-or-later"`. The fork `gifski-lite` is also `AGPL-3.0-or-later`. The npm wrapper `gifski-wasm` is `AGPL-3.0-or-later`. There is no permissively-licensed layer anywhere in the chain.

**Why the "AGPL §13 only triggers on modification" argument does NOT save you here.** That argument applies to *server-side* SaaS use of unmodified AGPL code. PZGIF is client-side: you **convey** the `.wasm` binary and the wasm-bindgen JS glue to every visitor's browser. Conveyance triggers GPLv3 §5/§6 (which AGPLv3 incorporates), not §13. For browser code AGPL and GPL are functionally identical — you distribute, so you must offer Corresponding Source for the **work as a whole**.

**Is your app "the work as a whole"?** Your worker will `import encode from 'gifski-wasm'`, which imports `pkg/gifski_wasm.js` (wasm-bindgen glue generated *from* the AGPL Rust crate and shipping in the same JS module graph as your code, bundled into the same chunk). That is a combined work by any conservative reading. The "mere aggregation" defence that works for `child_process.spawn('gifski')` server-side does not apply to a linked WASM module in the same bundle.

**Verdict: shipping `gifski-wasm` in a closed-source, ad-monetised PZGIF frontend is a license violation.** Pick one before writing code:

| Option | Cost | Consequence | Rank |
|---|---|---|---|
| **A. Buy the commercial license** from supso.org/projects/pngquant | **$950/yr** (Solo and 2–10 people tiers are both $950) | Fully closed-source, no obligations. Page states verbatim: *"Bonus! This also includes a license for the gif.ski encoder that creates highest-quality GIFs using pngquant."* Also covers `imagequant`, which is a gifski dependency and separately GPL-3-or-later + commercial from the same vendor. | **1** — recommended. $950/yr is trivial vs. the ad revenue this differentiator underwrites, and it removes all ambiguity for both the client tier and the Phase-2 server tier. |
| **B. Publish the PZGIF client bundle under AGPL-3.0** | $0 | Legal and free. AGPL does **not** forbid ads, commercial use, or charging money. Your moat is SEO content + domain + traffic, not the tool code — competitors can already copy an ezgif clone in a weekend. Downside: Pro/API server code must be kept in a genuinely separate, non-combined work, and you hand competitors your exact frontend. | 2 — viable fallback if $950 is unacceptable at MVP. |
| **C. Drop gifski, use `gifenc` (MIT) for final output** | $0 | Destroys differentiator #1 in tech-stack.md §1. Visibly worse GIFs. | 3 — only if both A and B are rejected. |
| **D. gifski server-side only (subprocess), `gifenc` client-side** | Server cost | `child_process` invocation of an unmodified gifski binary is the standard mere-aggregation position, and AGPL §13 does not fire on unmodified code. But this contradicts the "free tier = 100% client-side" product shape. | 4 |

**Do not** attempt "we only load the .wasm at runtime from /public so it isn't linked." The wasm-bindgen glue still ships in your bundle, and runtime loading is still conveyance. This is a fig leaf, not a defence.

**Not legal advice.** Get a lawyer's sign-off on option B if you choose it. Option A makes the question moot for $950.

### Maintenance / adoption risk (independent of licensing)

- 24 stars, one maintainer, **no commits in 18 months**, core pinned to gifski 1.32.0 while upstream is 1.35.0.
- **Open issue #5, "Occasionally does not output GIF / Encoder deadlocks"** (github.com/jamsinclair/gifski-wasm/issues/5, opened 2024-06-17, still open, zero comments). Maintainer's own words: *"In some scenarios the channels and/or threads reach a deadlock and the program will not complete. This is due to the hacks I implemented to get this to compile. Help from others would be greatly appreciated."* gifski internally uses `crossbeam-channel` + `ordered-channel` even in the non-rayon build, so **assume the single-thread path can deadlock too until the benchmark spike proves otherwise.** Make "1000 consecutive encodes, zero hangs" an explicit Phase-1 gate (§D).
- `gifski-lite`'s own README: *"⚠️ This is a highly experimental fork and is not recommended for production use."* 8 stars, last push 2024-06-23.
- **Mitigation:** vendor it. Fork `gifski-wasm` + `gifski-lite` into the repo under your own build, pinned. You will likely need to anyway (progress callback, §C12). Note: forking makes you a modifier, which is irrelevant under option A and already-accepted under option B.

## A2. Actual JS API

Verified from `src/encode.ts`, `src/lib.rs`, `pkg/gifski_wasm.d.ts`, `pkg/gifski_wasm.js` at `jamsinclair/gifski-wasm@main`.

```ts
// Package exports map (package.json):
//   "."             -> dist/encode.js        (SINGLE-THREAD, pkg/)        <-- use this
//   "./multi-thread"-> dist/encode-multi-thread.js (pkg-parallel/, rayon) <-- NEVER import
//   "./cloudflare"  -> dist/cloudflare.js
//   "./node"        -> dist/node.js

import encode, { init } from 'gifski-wasm';
import type { EncodeOptions } from 'gifski-wasm';
```

**Options type (verbatim from `src/encode.ts`):**

```ts
type BaseEncodeOptions = {
  frames: Array<Uint8Array | ImageData>
        | Array<{ imageData: Uint8Array | ImageData; duration: number }>;
  width: number;          // frame width in px (ALL frames must match)
  height: number;         // frame height in px
  quality?: number;       // 1-100, default 80
  repeat?: number;        // >=0 => Repeat::Finite(n); omitted/negative => Repeat::Infinite
  resizeWidth?: number;   // gifski-internal resize, applied AFTER frames are in wasm heap
  resizeHeight?: number;
};
export type EncodeOptions =
  | (BaseEncodeOptions & { fps: number;  frameDurations?: never })
  | (BaseEncodeOptions & { fps?: never;  frameDurations: number[] | Uint32Array }); // ms per frame
```

**Frame format: raw RGBA8, tightly packed, `width*height*4` bytes per frame.** Not PNG. `ImageData` is accepted and `.data` is read off it. `lib.rs` asserts `num_of_frames == frames.len() / (width*height*4)` and panics otherwise.

**Working snippet for the worker (explicit wasm URL — required for Turbopack, see A4):**

```ts
// src/workers/gif-encode.worker.ts
import encode, { init } from 'gifski-wasm';

let ready: Promise<unknown> | null = null;
function ensureInit() {
  // Absolute URL. Do NOT rely on new URL('gifski_wasm_bg.wasm', import.meta.url).
  ready ??= init(new URL('/wasm/gifski_wasm_bg.wasm', self.location.origin));
  return ready;
}

export async function encodeGif(
  frames: Uint8Array[],        // each exactly w*h*4 RGBA bytes, already downscaled
  w: number, h: number,
  durationsMs: number[],       // per-frame, ms
  quality = 80,
): Promise<Uint8Array> {
  await ensureInit();
  return encode({ frames, width: w, height: h, frameDurations: durationsMs, quality, repeat: 0 });
  // repeat: 0 => Repeat::Finite(0) i.e. play once. OMIT `repeat` for infinite loop (the GIF default).
}
```

**Gotchas, all verified in source:**

| Gotcha | Detail |
|---|---|
| **Minimum 2 frames** | `if (frames.length === 1) throw new Error('At least 2 frames are required...')`, and `lib.rs` `panic!` too. Single-frame GIF must go through another encoder. |
| **`fps` XOR `frameDurations`** | Providing both throws. Providing neither throws. |
| **`repeat` semantics are inverted from intuition** | `repeat: 0` → `Repeat::Finite(0)` = play once, no loop. **Omit `repeat` entirely for an infinite loop.** `repeat: -1` also → infinite. |
| **No progress callback at all** | `lib.rs` calls `writer.write(&mut buffer, &mut progress::NoProgress {})`. Zero progress events. See §C12. |
| **Synchronous + blocking** | `encode()` is one synchronous WASM call. It blocks the worker thread for the entire encode. No cancellation. Only kill switch = `worker.terminate()`. |
| **Double memory copy — THE big one** | `framesToBuffer()` allocates `new Uint8Array(sum of all frame lengths)` and copies every frame in; then `passArray8ToWasm0()` `malloc`s the same size in the WASM heap and copies again. **Peak = 2 × total RGBA bytes**, plus the source frames if you still hold them (→ 3×). Full-resolution 1080p is impossible: 1920·1080·4 = 8.29 MB/frame, 150 frames = 1.24 GB × 2 = 2.5 GB. |
| **`resizeWidth`/`resizeHeight` do NOT save memory** | The resize happens inside gifski after the full-size buffer is already in the heap. Downscale on the JS side (OffscreenCanvas / mediabunny `CanvasSink`) *before* calling `encode`. |
| **Return value is already copied out** | Glue does `getArrayU8FromWasm0(...).slice()` then `__wbindgen_free`. The returned `Uint8Array` is detached from WASM memory and is safe to `postMessage`-transfer. |
| **No memory cleanup API** | The wasm instance is a module-level singleton (`let wasm;` in the glue) and its `WebAssembly.Memory` never shrinks. After a big encode the worker holds the high-water mark forever. **Terminate and respawn the encode worker after each job** — the module is 120 KB gzip, re-init is cheap. |
| **Errors are Rust `panic!`** | They surface as `unreachable` / `RuntimeError` with poor messages unless the `debug` feature (`console_error_panic_hook`) is compiled in. Validate inputs in JS *before* calling. |

## A3. SharedArrayBuffer / threads

**Confirmed: the default entry point is single-threaded and needs no SAB, no COOP, no COEP.**

Evidence:
- `package.json` `exports["."] === "./dist/encode.js"`, which imports `../pkg/gifski_wasm.js` (the non-parallel build). The rayon build lives only under `pkg-parallel/` and is reachable only via `import ... from 'gifski-wasm/multi-thread'`.
- `pkg/gifski_wasm.js` `__wbg_get_imports()` returns exactly `{ wbg: { __wbindgen_throw } }`. **No `memory` import** → the module creates its own non-shared `WebAssembly.Memory`. No `wasm-bindgen-rayon`, no `workerHelpers`.
- `Cargo.toml`: `parallel = ["gifski-lite/parallel", "wasm-bindgen-rayon"]` is an opt-in feature; `build.sh` (the default build) is plain `wasm-pack build --target web -d pkg .` with no `--features parallel`.
- The README's multithreading section explicitly demands `COOP: same-origin` + `COEP: require-corp`. **That path is banned by the project constraint. Add an ESLint `no-restricted-imports` rule banning `gifski-wasm/multi-thread` and `gifski-wasm/cloudflare`.**

The `wasm-feature-detect` dependency (1.8.0, Apache-2.0) is only used by the multi-thread entry; it will tree-shake out of a single-thread-only build.

## A4. Bundling in Next.js App Router (Next 16.3.0 as of 2026-08-03)

**Recommendation: copy the `.wasm` to `public/wasm/` and pass an explicit absolute URL to `init()`. Do not let the bundler resolve it.**

Why: the wasm-bindgen glue's fallback is `input = new URL('gifski_wasm_bg.wasm', import.meta.url)`. Webpack 5 handles this (emits the asset). **Turbopack does not** — it is a long-standing, still-live class of bug. Next.js issue #84782 ("Web Worker fails to load WASM with Turbopack: 'Failed to execute fetch on WorkerGlobalScope' (blob URL context)") was auto-closed by a stale bot on 2026-01-21 with the reporters' repros unresolved; a commenter on 2025-12-26 reports it still broken on Turbopack 16.1.1. Root cause per reporter: *"Turbopack transforms `self.location.origin + '/file.js'` → `'./file.js'` during worker bundling; this breaks resolution since blob URLs can't resolve relative paths."* Next 16 defaults to Turbopack, so you will hit this.

The explicit-URL approach sidesteps the bundler entirely and works identically under webpack, Turbopack, dev, and prod.

**Setup:**

```jsonc
// package.json
{
  "scripts": {
    // runs before dev and build; keeps public/ in sync with the pinned package version
    "prebuild": "node scripts/copy-wasm.mjs",
    "predev":   "node scripts/copy-wasm.mjs"
  }
}
```

```js
// scripts/copy-wasm.mjs
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
mkdirSync('public/wasm', { recursive: true });
copyFileSync(
  require.resolve('gifski-wasm/pkg/gifski_wasm_bg.wasm'),  // may need a path-based resolve; the
  'public/wasm/gifski_wasm_bg.wasm',                       // package `exports` map does not list pkg/
);
```

> Note: `gifski-wasm`'s `exports` map only exposes `.`, `./multi-thread`, `./cloudflare`, `./node`, so `require.resolve('gifski-wasm/pkg/...')` may be blocked by export-map enforcement. Fall back to `path.join(path.dirname(require.resolve('gifski-wasm')), '../pkg/gifski_wasm_bg.wasm')` or just check the file into `public/wasm/` and pin the version in a comment. Verify during Phase 1.

**Worker instantiation** — classic pattern that works on both bundlers:

```ts
// Module-scope in a client component:
const worker = new Worker(new URL('../workers/gif-encode.worker.ts', import.meta.url), { type: 'module' });
```
If Turbopack chokes on the worker URL too, the escape hatch is to build the worker as a separate entry and serve it from `public/` as well. Decide this in Phase 1, not later.

**Config:**
- Webpack path (if you opt out of Turbopack with `next build --no-turbopack` / `next dev --webpack`): add `config.experiments = { ...config.experiments, asyncWebAssembly: true }` in `next.config.js`. Not needed with the explicit-URL approach, but harmless.
- Turbopack: **no config needed** with the explicit-URL approach. There is no way to add `.wasm` asset rules to Turbopack anyway (it does not accept webpack loaders for wasm assets) — which is precisely why `public/` is the recommendation.

**Vercel / MIME / CSP:**
- Vercel serves `public/*.wasm` as `application/wasm` — this matters because the glue tries `WebAssembly.instantiateStreaming` first and only falls back (with a console warning) if the Content-Type is wrong. Verify with `curl -I https://<deploy>/wasm/gifski_wasm_bg.wasm` in CI. **Add this as a Playwright/CI assertion**; a silent MIME regression turns into a silent perf regression.
- **CSP: you must allow `'wasm-unsafe-eval'` in `script-src`.** Without it, `WebAssembly.instantiate` throws `CompileError: Refused to compile or instantiate WebAssembly module because 'unsafe-eval' is not an allowed source of script`. `'wasm-unsafe-eval'` is the narrow, correct directive (do not use blanket `'unsafe-eval'`). Also `worker-src 'self' blob:`.
- Add a long-cache header for `/wasm/*` (immutable, filename is version-pinned by your copy script — or add a content hash).

---

# B. WebCodecs, demuxing, muxing

## B9 (answered first — it gates everything). Safari / iOS reality check

**Verified from MDN browser-compat-data (`raw.githubusercontent.com/mdn/browser-compat-data/main/api/*.json`) on 2026-08-04, cross-checked against WebKit source.**

| API | Chrome | Edge | Firefox (desktop) | Firefox Android | Safari (macOS) | Safari iOS |
|---|---|---|---|---|---|---|
| `VideoDecoder` | 94 | 94 | 130 | **NO** | **16.4** | 16.4 |
| `VideoEncoder` | 94 | 94 | 130 | **NO** | **16.4** | 16.4 |
| `EncodedVideoChunk` | 94 | 94 | 130 | **NO** | 16.4 | 16.4 |
| `VideoFrame` | 94 | 94 | 130 | yes | 16.4 | 16.4 |
| `OffscreenCanvas` | 69 | 69 | 105 | yes | 16.4 | 16.4 |
| `ImageBitmap` | 50 | 50 | 42 | yes | 15 | 15 |
| **`ImageDecoder`** | 94 | 94 | **133** | 133 | **NO — never shipped** | **NO** |

**`ImageDecoder` in Safari: definitively absent.** Primary-source confirmation beyond MDN — `github.com/WebKit/WebKit/contents/Source/WebCore/Modules/webcodecs` lists **44 `.idl` files**, including `WebCodecsVideoDecoder.idl`, `WebCodecsAudioDecoder.idl`, `WebCodecsEncodedVideoChunk.idl` — and **no `ImageDecoder.idl`**. `raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/Modules/webcodecs/ImageDecoder.idl` returns **404**; `WebCodecsVideoDecoder.idl` returns 200. There is no WebKit implementation in tree, therefore no plausible near-term ship.

Note also: Safari 26.0 added `AudioEncoder`/`AudioDecoder` (per webkit.org/blog/17333) — i.e. WebKit is actively working on WebCodecs and *still* chose not to do `ImageDecoder`. Safari 26.4 fixed "WebCodecs VideoDecoder could output H264 frames in the wrong order" (webkit.org/blog/17862) — worth knowing: **on Safari < 26.4, H.264 decode output order can be wrong**, so you must sort decoded frames by `timestamp` rather than trusting output order. Do that unconditionally; it's cheap.

**What works where:**

| Pipeline stage | Chrome/Edge | Firefox desktop | Firefox Android | Safari 26+ / iOS 26+ |
|---|---|---|---|---|
| MP4/WebM demux (`mediabunny`, pure JS) | ✅ | ✅ | ✅ | ✅ |
| Video decode (`VideoDecoder`) | ✅ | ✅ | ❌ **fallback** | ✅ |
| Animated GIF decode (`ImageDecoder`) | ✅ | ✅ (133+) | ✅ (133+) | ❌ **fallback** |
| Frame ops (OffscreenCanvas in worker) | ✅ | ✅ | ✅ | ✅ |
| GIF encode (gifski-wasm, single-thread) | ✅ | ✅ | ✅ | ✅ (memory-capped) |
| Video encode (`VideoEncoder`) | ✅ | ✅ | ❌ **fallback** | ✅ |

**Two mandatory fallback paths, not one:**
1. **Safari (all versions) + Firefox < 133 → animated GIF/WebP decode.** Pure-JS decoder. This is the *common* case, not an edge case: 6 of 9 MVP tools take a GIF as input, and Safari+iOS is ~20-30% of a consumer tool site's traffic. **This is the single highest-volume fallback in the product.** See §B7.
2. **Firefox Android → all video decode/encode.** `VideoDecoder`/`VideoEncoder` are flatly absent (`firefox_android: NO`). Route to `@ffmpeg/core` single-thread, or (better, given a 10 MB gzip download on mobile data) to a "not supported on this browser, try Chrome" message + Pro upsell. Firefox Android is ~0.5% of mobile traffic; do not spend engineering on it. **Recommend: detect and show an honest unsupported message.**

**iOS Safari memory — the hard ceiling.**

| Limit | Value | Source |
|---|---|---|
| Page crash threshold, iPhone SE 3rd gen, iOS 26.2 | **~100 MB** | lapcatsoftware.com/articles/2026/1/7.html (measured, Jan 2026) |
| Page crash threshold, iPad 8th gen, iOS 26.2 | **~200 MB** | same |
| Total canvas memory cap | **224 MB** (iOS 12) → **384 MB** (iOS 15) — device- and version-dependent; error is literally `Total canvas memory use exceeds the maximum limit` | developer.apple.com/forums/thread/112218, pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit/ |
| WebGL/WASM heap | ~300–500 MB, `WebAssembly.Memory` with `maximum: 2048MB` OOMs at *construction* | godotengine/godot#70621 |

**These are far below the tech-stack.md "mobile: ~50 MB input" assumption, because the binding constraint is not input file size — it is decoded RGBA frames in flight.** ~100 MB total page budget on a low-end iPhone, against a gifski buffer that is 2× all frames, means:

- Safe iOS budget for the gifski frame buffer: **≤ 30 MB total RGBA**, i.e. `frames × w × h × 4 ≤ 30 MB`.
- At 480×270 (0.518 MB/frame): **~58 frames**. At 15 fps that is **~3.8 seconds of GIF**.
- At 320×180 (0.23 MB/frame): ~130 frames ≈ 8.6 s.

**Consequence: on iOS you must clamp output dimensions and frame count aggressively, and say so in the UI ("Long clips need the desktop version / Pro").** Do not advertise "up to 60s, up to 1080p" on mobile. Also: `navigator.deviceMemory` is **not implemented in Safari** — you cannot feature-detect your way to a budget on iOS. Use UA/platform detection (`navigator.maxTouchPoints > 0 && /Mac|iP/.test(navigator.platform)`) plus a conservative fixed budget, and wrap the whole encode in a try/catch that surfaces "ran out of memory — try a smaller size" rather than a white screen.

## B7. `ImageDecoder` for animated GIF — API + fallback

**Support matrix (repeat of the critical row): Chrome/Edge 94+, Firefox 133+, Safari NEVER (desktop + iOS).**

`ImageDecoder.isTypeSupported(type)` is the correct runtime probe (MDN: `Web/API/ImageDecoder/isTypeSupported_static`), but guard the existence of the constructor first — on Safari `ImageDecoder` is `undefined` and the static call throws.

**Canonical animated-GIF frame iteration:**

```ts
// Runs in a worker. Returns per-frame RGBA + duration, downscaled to output size.
export async function* decodeAnimatedImage(
  file: Blob, outW: number, outH: number,
): AsyncGenerator<{ rgba: Uint8Array; durationMs: number }> {
  const dec = new ImageDecoder({
    data: await file.arrayBuffer(),
    type: file.type,               // 'image/gif' | 'image/webp' | 'image/avif' | 'image/png'
    preferAnimation: true,         // REQUIRED: without it you may get the still track
  });
  await dec.completed;             // wait for full metadata; frameCount is unreliable before this
  const track = dec.tracks.selectedTrack!;
  const total = track.frameCount;  // ImageTrack.frameCount; .animated is the boolean guard
  // track.repetitionCount => loop count, propagate to the GIF `repeat` option

  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  for (let i = 0; i < total; i++) {
    const { image } = await dec.decode({ frameIndex: i, completeFramesOnly: true });
    // image is a VideoFrame. image.duration is in MICROSECONDS and may be null.
    const durationMs = image.duration != null ? image.duration / 1000 : 100; // GIF default 100ms
    ctx.drawImage(image, 0, 0, outW, outH);   // downscale here, NOT in gifski
    image.close();                            // MANDATORY — see §C10
    yield { rgba: new Uint8Array(ctx.getImageData(0, 0, outW, outH).data.buffer), durationMs };
  }
  dec.close();
}
```

Gotchas:
- `preferAnimation: true` is required or you may decode only the first frame.
- `VideoFrame.duration` is **microseconds**, and can be `null`. GIF spec default when the GCE delay is 0 is browser-dependent; browsers clamp `0` and `1` (10 ms) up to 100 ms. Do the same clamp yourself so your output matches how browsers render the input.
- `ImageDecoder` frames are **composited** by the browser (disposal methods and frame offsets already applied), so every frame is full-canvas RGBA. A raw JS GIF parser (`gifuct-js`) gives you *un*composited sub-rectangles and you must implement disposal yourself — a real behaviour difference between the primary and fallback paths. Budget test fixtures for this.

**Fallback for Safari / Firefox < 133 — ranked:**

| Option | Version / license | Verdict |
|---|---|---|
| **`modern-gif`** | **2.1.0, MIT, published 2026-04-16** | **Rank 1.** Only actively-maintained option; TypeScript; decoder *and* encoder; ships a worker. Recent release cadence matters more than anything else here. |
| `gifuct-js` | 2.1.2, MIT, 2021-11-04 | Rank 2. Widely used, battle-tested, but 5 years stale and you must implement GIF disposal-method compositing yourself. |
| `omggif` | 1.0.10, MIT, 2019 | Rank 3. Lowest level, tiny, most work. |
| `@ffmpeg/core` | see §E15 | Rank 4. 10 MB gzip to decode a GIF is absurd. Never for this. |

**Cost of the fallback:** a pure-JS GIF decode is roughly an order of magnitude slower than the native path but GIF is LZW — it is not that expensive. Measure it in the Phase-1 benchmark on a real iPhone; treat "Safari GIF decode ≤ 3× the Chrome `ImageDecoder` time for the same fixture" as a pass criterion.

**Design implication:** because 6 of 9 MVP tools take a GIF as input, the fallback decoder is not optional and is not a "nice to have". It is on the critical path for ~20-30% of your traffic. Build it in Phase 1 alongside the primary path, behind one `decodeAnimatedImage()` interface, and make the benchmark run both.

## B7b. Animated WebP — the `webp→gif` tool (added by coordinator)

**Confirmed: `@jsquash/webp` is still-image only.** Its README defines exactly one decode entry point:

> `decode(data: ArrayBuffer): Promise<ImageData>` — "Decodes WebP binary ArrayBuffer to raw RGB image data."

One `ImageData`, no frame list, no durations. It wraps libwebp's simple decode API, not `libwebpdemux`. It cannot decode animated WebP. (`@jsquash/webp` 1.5.0, Apache-2.0, 2025-05-12.)

**`ImageDecoder` DOES decode animated WebP** — same API as GIF above, `type: 'image/webp'`, `preferAnimation: true`, `track.animated === true`, `track.frameCount > 1`. Chromium's `ImageDecoder` is backed by the same image decoders as `<img>`, so it covers **GIF, PNG/APNG, JPEG, WebP, AVIF**. Probe with `await ImageDecoder.isTypeSupported('image/webp')`.

So the support matrix for animated WebP decode is **identical to animated GIF**: Chrome/Edge 94+, Firefox 133+, **Safari never**.

**Fallback options for animated WebP on Safari, ranked:**

| Option | Assessment |
|---|---|
| **1. Hand-rolled RIFF/ANMF splitter + `@jsquash/webp.decode()` per frame** | **Recommended.** An animated WebP is a RIFF container: `RIFF....WEBPVP8X` header, then `ANIM` (loop count + background), then N × `ANMF` chunks. Each `ANMF` has a 16-byte header (x/y offset ×3 bytes, w-1/h-1 ×3 bytes, duration ×3 bytes little-endian ms, 1 flags byte) followed by an embedded `VP8 `/`VP8L`/`ALPH` payload. You re-wrap each payload in a minimal `RIFF....WEBP` header and hand it to `@jsquash/webp.decode()` — a dependency you already ship. ~150 lines, zero new deps, exact frame durations. You must implement the ANMF blend (`0`=blend over previous, `1`=do-not-blend) and dispose (`0`=none, `1`=fill background) bits yourself — same compositing work the GIF fallback needs, so share the compositor. **DRY: one `compositeFrames()` used by both GIF and WebP fallbacks.** |
| 2. `@ffmpeg/core` single-thread | Works, zero new logic, but 10 MB gzip download to decode one WebP. Only acceptable as an emergency unblock. |
| 3. `webpxmux` (0.0.2, MIT, **2020**) / `libwebp-wasm` (0.1.6, MIT, **2023**) / `webp-hero` (0.0.2, ISC, **2022**) | All effectively abandoned, pre-1.0, tiny user bases. Do not adopt. |
| 4. Draw `<img src=blob:...>` to canvas on a timer | Safari renders animated WebP in `<img>` since 14, but there is **no API to step frames or read durations** — timing will be wrong and non-deterministic. Reject. |

**Recommendation:** ship `webp→gif` with `ImageDecoder` on Chrome/Firefox and the hand-rolled ANMF splitter on Safari. If Phase-1 timeboxing is tight, **descope `webp→gif` on Safari to a clear "not supported in Safari yet" state rather than pulling in ffmpeg.wasm** — animated WebP input is a low-volume tool compared to GIF input.

## Client-side ZIP for "split GIF to frames" (added by coordinator)

Requirement: hundreds of PNGs, generated one at a time in a worker, must not all be held in RAM (iOS budget is ~100 MB total, §B9).

| Library | Version / license / last publish | Streaming | Unzip too? | Size | Verdict |
|---|---|---|---|---|---|
| **`fflate`** | **0.8.3, MIT, 2026-05-16**, zero deps | Yes — `Zip` + `ZipPassThrough`, incremental `push()`, chunks via callback | **Yes** | ~8 kB | **Rank 1** |
| `client-zip` | 2.5.0, MIT, 2025-03-14, zero deps | Yes — returns a `Response` with a `ReadableStream` body; STORE-only | No | ~2.5 kB | Rank 2 |
| `@zip.js/zip.js` | 2.8.34, BSD-3, 2026-07-22, zero deps | Yes, both directions, built-in worker pool | Yes | Largest | Rank 3 |
| `jszip` | 3.10.1, **(MIT OR GPL-3.0-or-later)**, **2022-08-02** | No — buffers everything | Yes | Medium | **Reject** — 4 years stale, buffers all files in memory (exactly the failure mode you must avoid), and the dual MIT/GPL license needs an explicit MIT election. |

**Recommendation: `fflate@0.8.3`.** One dependency covers both directions (you will want unzip for a future "images→GIF" tool — YAGNI says don't build it now, but it costs nothing to pick the lib that can), it is the only top-2 option still being published in 2026, and `ZipPassThrough` gives **STORE (no deflate)** which is correct here: PNGs are already DEFLATE-compressed, so re-deflating burns CPU for ~0% gain.

```ts
// worker: stream frames into a zip without holding them all
import { Zip, ZipPassThrough } from 'fflate';

const parts: Uint8Array[] = [];
const zip = new Zip((err, chunk, final) => {
  if (err) throw err;
  parts.push(chunk);                       // Blob parts spill to disk in Chrome/Safari for large sizes
  if (final) postMessage({ blob: new Blob(parts, { type: 'application/zip' }) });
});

for await (const { index, pngBytes } of frames) {
  const f = new ZipPassThrough(`frame-${String(index).padStart(4, '0')}.png`); // STORE, no recompress
  zip.add(f);
  f.push(pngBytes, true);                  // true = last chunk for this entry
  // pngBytes goes out of scope here -> GC'd. Never build an array of all PNGs.
  postMessage({ type: 'progress', done: index + 1, total });
}
zip.end();
```

Notes:
- Accumulate output into `Blob` **parts**, not one growing `Uint8Array`. `new Blob([...parts])` lets the browser back large blobs with disk instead of RAM. Then `URL.createObjectURL(blob)` for download.
- Cap frame count in the UI (e.g. 500) with an explicit message. A 60 s 30 fps GIF is 1800 PNGs and will kill a phone.
- Use `canvas.convertToBlob({ type: 'image/png' })` on the `OffscreenCanvas` (available Safari 16.4+) rather than `@jsquash/png` — native, no WASM, and it is already the right format.

---

# B5/B6/B8. Demux and mux — **replace four packages with one**

## The recommendation

| Locked stack says | Status (verified 2026-08-04) | Recommendation |
|---|---|---|
| `mp4box.js` (`mp4box@2.4.1`, BSD-3-Clause, 2026-06-19) | Maintained, fine | Replaceable |
| "WebM demuxer" (unnamed) | `webm-demuxer` **does not exist on npm**. `jswebm@0.1.2` (MIT) last published **2020-08-01** — abandoned | **No viable standalone option** |
| `mp4-muxer@5.2.2` | **DEPRECATED by author** | Replace |
| `webm-muxer@5.1.4` | **DEPRECATED by author** | Replace |

`mp4-muxer`'s own README, verbatim:

> "⚠️ This library is deprecated ⚠️ — mp4-muxer has been deprecated in favor of Mediabunny, which entirely supersedes it. […] mp4-muxer is no longer being maintained and will not receive any new features or bug fixes."

`webm-muxer` says the same. Both are by Vanilagy, who now maintains **`mediabunny`**.

**Adopt `mediabunny@1.52.3`** (MPL-2.0, published **2026-08-03** — i.e. this week; zero dependencies; tree-shakable to ~5 kB gzip minimum).

| Dimension | Assessment |
|---|---|
| Coverage | Read **and** write: MP4, MOV, M4V/M4A, fragmented MP4/CMAF, MKV, WebM, Ogg, **MPEG-TS**, **HLS**, MP3, WAV, ADTS, FLAC. Video codecs: AVC/H.264, HEVC, VP8, VP9, AV1, ProRes. This is a *much* wider net than mp4box alone, which directly shrinks the ffmpeg.wasm fallback rate (§E14). |
| License | **MPL-2.0** — file-level weak copyleft. README verbatim: *"free to use for any purpose, including closed-source commercial use"*; obligation only if you modify Mediabunny's own source files and distribute. **No conflict with a closed-source ad-supported site.** Contrast with gifski. |
| Maintenance | Published within 24h of this research; sponsored by Remotion, Mux, ElevenLabs, Screen Studio, Tella. Lowest abandonment risk in this whole report. |
| Fit | Handles container rotation metadata, streaming I/O, and — critically — `CanvasSink` does decode + rotate + crop + resize + canvas pooling in one API, which is exactly the "frame ops" box in the locked pipeline diagram. |

**This is not re-litigating the locked architecture** — the locked doc names `mp4box.js` *and* an unnamed "WebM demuxer" *and* an unnamed muxer. Two of the concrete candidates are formally deprecated and the third does not exist. `mediabunny` is the maintained implementation of the same architectural box: pure-JS demux/mux around native WebCodecs. Nothing about SAB/COEP/WebCodecs changes.

## B5. mp4box.js wiring (keep this if you reject mediabunny)

`mp4box@2.4.1` (npm package name is **`mp4box`**, not `mp4box.js` — that 404s). Canonical wiring, verbatim from the W3C WebCodecs sample `w3c/webcodecs/samples/video-decode-display/demuxer_mp4.js`:

```js
// 1. Feed bytes. MP4Box requires ArrayBuffer with a `fileStart` byte offset property.
write(chunk) {
  const buffer = new ArrayBuffer(chunk.byteLength);
  new Uint8Array(buffer).set(chunk);
  buffer.fileStart = this.#offset;
  this.#offset += buffer.byteLength;
  this.#file.appendBuffer(buffer);
}
close() { this.#file.flush(); this.#onEndOfStream(); }

// 2. Extract the codec description (avcC/hvcC/vpcC/av1C) — this is the fiddly bit.
#description(track) {
  const trak = this.#file.getTrackById(track.id);
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array(stream.buffer, 8);   // strip the 8-byte box header
    }
  }
  throw new Error("avcC, hvcC, vpcC, or av1C box not found");
}

// 3. On moov parsed -> build VideoDecoderConfig, then start sample extraction.
#onReady(info) {
  const track = info.videoTracks[0];
  this.#onConfig({
    // Browsers don't parse full vp8 codec strings (e.g. `vp08.00.41.08`), only `vp8`.
    codec: track.codec.startsWith('vp08') ? 'vp8' : track.codec,
    codedHeight: track.video.height,
    codedWidth:  track.video.width,
    description: this.#description(track),
  });
  this.#file.setExtractionOptions(track.id);
  this.#file.start();
}

// 4. Samples -> EncodedVideoChunk. Timestamps must be MICROSECONDS.
#onSamples(track_id, ref, samples) {
  for (const sample of samples) {
    this.#onChunk(new EncodedVideoChunk({
      type: sample.is_sync ? "key" : "delta",
      timestamp: 1e6 * sample.cts / sample.timescale,
      duration:  1e6 * sample.duration / sample.timescale,
      data: sample.data,
    }));
  }
}
```

Keyframe/flush discipline:
- `decoder.configure(config)` **must** happen before the first `decode()`, and the first chunk after configure/reset **must** be `type: 'key'`. Use `sample.is_sync`. For a trimmed export starting mid-clip, seek back to the preceding sync sample and discard decoded frames before the in-point.
- Backpressure: watch `decoder.decodeQueueSize` and await the `dequeue` event (Chrome 106+, Firefox 130+, Safari 16.4+) before pushing more. Without this you will queue every chunk and OOM.
- `await decoder.flush()` at end of stream to drain trailing frames, then `decoder.close()`.
- **Sort output frames by `timestamp`** — Safari < 26.4 had an H.264 output-reordering bug (fixed per webkit.org/blog/17862). Cheap insurance.

## B5-alt / B6. The mediabunny version (recommended)

Replaces both B5 and B6 with one API and no `avcC` byte-surgery:

```ts
import { Input, ALL_FORMATS, BlobSource, CanvasSink } from 'mediabunny';

const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
const track = await input.getPrimaryVideoTrack();
if (!track) throw new Error('no video track');

const totalDuration = await input.computeDuration();       // seconds -> real progress denominator

// Decode + rotate + crop + downscale to the GIF output size in one step, with a canvas pool.
const sink = new CanvasSink(track, {
  width: outW, height: outH, fit: 'contain',
  rotation: await track.getRotation(),   // honours container rotation metadata
  poolSize: 1,                           // ring buffer; docs: "a pool size of 1 is sufficient" for iterators
});

for await (const { canvas, timestamp, duration } of sink.canvases(startSec, endSec)) {
  // canvas is an OffscreenCanvas already at output size -> read RGBA straight out
  const rgba = canvas.getContext('2d')!.getImageData(0, 0, outW, outH).data;
  push(new Uint8Array(rgba), duration * 1000);
  onProgress(timestamp / totalDuration);   // REAL progress, §C12
}
```

`CanvasSink` options (verified from mediabunny.dev/guide/media-sinks): `width`, `height`, `fit: 'fill'|'contain'|'cover'`, `rotation: 0|90|180|270`, `crop` (applied after rotation, before resize), `poolSize`, `alpha`. Yields `WrappedCanvas = { canvas, timestamp, duration }`.

**Why this matters beyond convenience:** `poolSize: 1` means the decoded-frame memory is a *constant*, not O(frames). Combined with pushing RGBA straight into the gifski buffer, this is the single biggest lever on the §C11 memory problem, and it comes free.

If you need lower-level control (e.g. custom seek), use `EncodedPacketSink` (`for await (const packet of sink.packets())`) or `VideoSampleSink` (`for await (const sample of sink.samples())` — **must call `sample.close()` inside the loop**, per the docs).

## B8. GIF → MP4 / WebM output

**Muxer: `mediabunny` (`Output` + `Mp4OutputFormat` / `WebMOutputFormat` + `BufferTarget`).** `mp4-muxer` and `webm-muxer` are deprecated (above); do not start new code on them.

```ts
import { Output, Mp4OutputFormat, BufferTarget, CanvasSource, Quality } from 'mediabunny';

const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
const videoSource = new CanvasSource(canvas, { codec: 'avc', bitrate: new Quality('high') });
output.addVideoTrack(videoSource);
await output.start();
// ... feed frames from the GIF decode loop ...
await output.finalize();
const mp4Bytes = output.target.buffer;   // ArrayBuffer
```

If you drive `VideoEncoder` directly instead, the config that matters:

```ts
await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate });
encoder.configure({
  codec: 'avc1.4d002a',        // see table
  width: evenW, height: evenH, // MUST be even for yuv420p
  bitrate: 2_000_000,
  framerate: 30,
  avc: { format: 'avc' },      // 'avc' = length-prefixed + avcC in the container (what MP4 wants).
                               // 'annexb' is for raw/TS. Getting this wrong = unplayable file.
  latencyMode: 'quality',
});
```

**Codec strings:**

| Target | String | Notes |
|---|---|---|
| MP4, ≤ 720×480 | `avc1.42E01E` | Constrained Baseline, Level 3.0. Max ~720×480@30. **Do not use for 1080p** — level too low; some decoders reject it. |
| MP4, ≤ 720p | `avc1.42E01F` | CB Level 3.1 |
| **MP4, general default** | **`avc1.4D402A`** | Main profile, Level 4.2 — covers 1080p60, universally playable in 2026 (Safari/iOS/Chrome/Edge/hardware). **Recommend this as the single default**; GIF-sourced output is small anyway so profile choice costs nothing. |
| MP4, if you must be maximally conservative | `avc1.42E028` | Constrained Baseline, Level 4.0 |
| WebM | `vp09.00.10.08` (VP9 Profile0, L1.0, 8-bit) or `vp8` | **`vp8` is the literal string** — browsers do not parse full `vp08.xx.xx.xx` strings (W3C sample comment). VP9 is safer quality-wise; Safari supports VP9 decode but **Safari cannot *encode* VP9/VP8 via WebCodecs** (unverified for 26.x — probe with `isConfigSupported`). |
| AV1 | `av01.0.04M.08` | Encode support is Chrome-only in practice. Skip for MVP. |

**Always** `await VideoEncoder.isConfigSupported(cfg)` and fall back down the list. Never hardcode one string.

**Dimensions must be even.** H.264 yuv420p chroma subsampling requires even width and height. Round down: `w & ~1`, `h & ~1`. GIFs are frequently odd-sized (e.g. 499×281) — this *will* bite you.

**Silent audio track: NO, do not emit one.** Verified against current platform behaviour:
- GIF has no audio; every major platform already produces silent MP4s from GIF uploads. Twitter/X, Discord, Reddit and Imgur all transcode GIF uploads to **silent** MP4/video server-side.
- A video-only H.264 + yuv420p MP4 plays inline on iOS Safari and iMessage.
- Browser autoplay policy: restrictions do not apply when the audio track is muted **or absent** — so a track-less MP4 autoplays fine with `<video autoplay muted loop playsinline>`.
- The "iOS needs a silent audio track" folklore dates to iOS 6-9 and is obsolete.

**Recommendation:** emit video-only. Do not add a silent AAC track — it adds a codec dependency (AAC encode is not universally available via WebCodecs; mediabunny lists AAC among codecs needing a polyfill extension package) for zero benefit. Do surface the `<video autoplay muted loop playsinline>` snippet in the result UI, since that is what users actually need to replace a GIF embed.

---

# C. Worker + memory

## C10. Transferable-based worker pipeline (no SharedArrayBuffer)

**Transfer semantics — what is actually transferable:**

| Object | Transferable? | Notes |
|---|---|---|
| `ArrayBuffer` | **Yes** | Zero-copy. Source is detached (`byteLength === 0`). |
| `Uint8Array` | No — transfer its `.buffer` | `postMessage(msg, [u8.buffer])`. Careful with views over a larger buffer. |
| `VideoFrame` | **Yes** (MDN: *"VideoFrame is a transferable object"*) | Transferring closes the source frame. Prefer transfer over `clone()`. |
| `ImageBitmap` | **Yes** | Zero-copy, GPU-backed. |
| `OffscreenCanvas` | **Yes**, but once only | Transfer from main → worker at setup; it can never come back. |
| `ImageData` | **No** | Structured-cloned (full copy). Send `data.buffer` as a transfer instead. |
| `Blob` / `File` | No transfer, but clone is cheap | Blobs are refcounted handles, not byte copies. **Send the `File` to the worker and read it there** — do not `arrayBuffer()` on the main thread. |

**Cost of getting this wrong:** `structuredClone` of a 300 MB frame array copies 300 MB and briefly doubles RSS — on iOS that alone exceeds the ~100 MB page budget (§B9). Every large payload crossing a thread boundary must be in the transfer list. Add a code-review rule: *no `postMessage` with a typed array unless the second argument is present.*

**Architecture (2 workers, not 1):**

```
main thread                worker A: decode+frameops        worker B: gifski encode
  File ──────────────────► Input/CanvasSink (mediabunny)
                             or ImageDecoder
                             or modern-gif (Safari)
                           ↓ RGBA Uint8Array per frame
                           accumulate in a plain array
                           ─── postMessage({frames, durations}, frames.map(f=>f.buffer)) ──►
                                                                    gifski encode() [BLOCKS]
  ◄──── postMessage({gif}, [gif.buffer]) ──────────────────────────────────────────────────
                                                                    worker.terminate()
```

Why two workers: `gifski.encode()` is one synchronous WASM call that blocks its thread for the whole encode (§A2), so nothing else — not even a progress `postMessage` — can run on that thread. Isolating it also gives you (a) a hard cancel via `terminate()` and (b) a way to reclaim the WASM heap high-water mark, which never shrinks.

**Mandatory `.close()` discipline.** WebCodecs decoders hold a bounded pool of output frames. If you do not `close()` each `VideoFrame` promptly, the decoder stops producing output and the pipeline stalls silently — no error, no event, just a hang. Rules:

```ts
// 1. Close in a finally, always.
const { image } = await decoder.decode({ frameIndex: i });
try { ctx.drawImage(image, 0, 0, outW, outH); } finally { image.close(); }

// 2. If you transfer a VideoFrame to another worker, the sender's handle is closed for you —
//    but the RECEIVER now owns it and must close it.
// 3. mediabunny VideoSampleSink: `sample.close()` inside the for-await loop (per its docs).
//    CanvasSink with poolSize:1 needs no close — it recycles canvases for you. Prefer CanvasSink.
// 4. Never let a VideoFrame escape into a long-lived array. Convert to RGBA and close immediately.
```

**Backpressure:** gate on `decoder.decodeQueueSize` and the `dequeue` event rather than pushing all chunks:

```ts
async function push(chunk: EncodedVideoChunk) {
  while (decoder.decodeQueueSize > 8) {
    await new Promise(r => decoder.addEventListener('dequeue', r, { once: true }));
  }
  decoder.decode(chunk);
}
// ... then: await decoder.flush(); decoder.close();
```

**Cancellation:** there is no `AbortSignal` anywhere in this stack. `worker.terminate()` is the only reliable kill. Design the UI around that: one worker per job, terminate on cancel, respawn on next job. Terminating also reclaims the gifski WASM heap.

## C11. Concrete memory budgeting

**The governing equation** (from the §A2 source reading — gifski holds *all* frames and copies them once):

```
peak_bytes ≈ 2 × N_frames × out_W × out_H × 4     (+ transient decode pool, ~2-3 frames)
```

Per-frame RGBA cost:

| Output size | Bytes/frame | Frames in 30 MB (iOS budget) | Frames in 500 MB (desktop budget) |
|---|---|---|---|
| 1920×1080 | 8.29 MB | 3 | 30 |
| 1280×720 | 3.69 MB | 8 | 67 |
| 800×450 | 1.44 MB | 20 | 173 |
| **640×360** | **0.92 MB** | **32** | **271** |
| 480×270 | 0.518 MB | 57 | 482 |
| 320×180 | 0.230 MB | 130 | 1086 |

Read as: `frames = budget / (2 × bytes_per_frame)`.

**Verdict on "1080p GIF": it is not achievable client-side and should not be offered.** 150 frames of 1080p RGBA = 1.24 GB → 2.5 GB peak. Desktop Chrome might survive; nothing else will, and the resulting GIF would be 100+ MB and useless anyway. This is fine — real GIFs are 320-640 px wide. **Make the output-width cap a product feature, not a failure mode.**

**Recommended budgets:**

| Tier | Detection | Frame-buffer budget | Default max output width | Hard cap frames |
|---|---|---|---|---|
| Desktop | `!isMobile` | 500 MB | 640 px | 900 |
| Desktop, low RAM | `navigator.deviceMemory <= 4` | 200 MB | 480 px | 400 |
| Android mobile | `navigator.deviceMemory` present, mobile UA | 120 MB | 480 px | 230 |
| **iOS / iPadOS** | `maxTouchPoints > 0 && /Mac|iP/` (deviceMemory is **absent in Safari**) | **30 MB** | **480 px** | **57** |

Sources for the iOS number: measured page-crash thresholds of ~100 MB (iPhone SE 3, iOS 26.2) and ~200 MB (iPad 8, iOS 26.2) from lapcatsoftware.com/articles/2026/1/7.html, minus headroom for the DOM, the ad iframes (which are not free), and the 224–384 MB *canvas* cap that is a separate accounting bucket.

**Streaming/chunking strategy — what you can and cannot stream:**

- ✅ **Decode side streams perfectly.** `CanvasSink` with `poolSize: 1` keeps decoded-frame memory constant regardless of clip length. Downscale to the *final GIF size* inside `CanvasSink` and never materialise a full-res frame.
- ❌ **gifski encode cannot stream.** Its API takes all frames at once. There is no workaround short of forking (see C12).
- **Therefore: enforce the budget as an admission-control check *before* decoding**, not as an OOM catch afterwards.

```ts
function planEncode(durationSec: number, srcW: number, srcH: number, budgetBytes: number) {
  for (const fps of [20, 15, 12, 10, 8]) {
    for (const w of [640, 480, 400, 320, 240]) {
      const h = Math.round(w * srcH / srcW) & ~1;
      const frames = Math.ceil(durationSec * fps);
      if (2 * frames * w * h * 4 <= budgetBytes) return { fps, w, h, frames };
    }
  }
  return null;   // -> "This clip is too long for your device. Trim it, or use PZGIF Pro."
}
```

Show the chosen fps/size in the UI as *editable defaults*, with the budget ceiling enforced on the sliders. This turns a memory constraint into a legible product behaviour and feeds the Pro upsell honestly.

## C12. Real progress out of a pipeline whose encoder has no progress API

**Recommendation, ranked — pick option 1.**

| # | Option | Verdict |
|---|---|---|
| **1** | **Vendor the fork and wire gifski's existing `ProgressReporter` to a JS callback** | **Recommended.** Upstream gifski already has a `ProgressReporter` trait; `gifski-lite`'s `lib.rs` simply passes `&mut progress::NoProgress {}` into `writer.write(&mut buffer, ...)`. Replacing that with a struct holding a `js_sys::Function` and calling it per written frame is a **~20-line Rust change**. You get true 0-100% across the whole pipeline. |
| 2 | Chunk the encode into N GIF segments and concatenate | **Reject.** Each gifski run computes its own global palette and its own temporal dithering state; concatenating segments produces visible palette-shift seams at every boundary and destroys differentiator #1. Also loses cross-segment frame diffing, inflating file size. |
| 3 | Real progress for decode, indeterminate for encode | Acceptable fallback if the Rust change is deferred. |
| 4 | Time-based estimate during encode | Only as a label ("about 8s remaining"), never as a percentage bar. |

**Why option 1 is cheap and low-risk:** you almost certainly have to vendor `gifski-wasm` + `gifski-lite` anyway — the upstream is 18 months stale, pinned to gifski 1.32.0 vs upstream 1.35.0, and has an open unresolved deadlock issue (§A1). Adding a progress callback while you are in there costs an afternoon and a `wasm-pack` build in CI. Under commercial-license option A this creates no license obligation; under AGPL option B you are publishing anyway.

Sketch of the change (in the vendored `gifski-lite`/`gifski-wasm` `lib.rs`):

```rust
struct JsProgress { cb: js_sys::Function, total: usize, done: std::cell::Cell<usize> }
impl gifski_lite::progress::ProgressReporter for JsProgress {
    fn increase(&mut self) -> bool {
        let n = self.done.get() + 1; self.done.set(n);
        let _ = self.cb.call1(&JsValue::NULL, &JsValue::from_f64(n as f64 / self.total as f64));
        true            // return false to ABORT -> this also gives you real cancellation
    }
    fn done(&mut self, _msg: &str) {}
}
// then: writer.write(&mut buffer, &mut JsProgress { .. })   instead of  &mut progress::NoProgress {}
```

Bonus: `increase()` returning `false` is gifski's abort signal — this gives you **cooperative cancellation without `worker.terminate()`**, which is strictly better UX.

**Progress model (whichever option you pick):**

```
overall = 0.05·probe + 0.55·decode + 0.40·encode
```

- **probe (0-5%)** — `input.computeDuration()`, track metadata, plan selection. Effectively instant; just don't sit at 0%.
- **decode (5-60%)** — real and exact. Denominator is known up front: `frames` from `planEncode()`, or `timestamp / totalDuration` from the `CanvasSink` loop. For `ImageDecoder`, `track.frameCount` is the denominator (read it after `await decoder.completed`).
- **encode (60-100%)** — real via option 1; otherwise indeterminate.

**Calibrate the 55/40 split from the Phase-1 benchmark** (§D) rather than guessing, and re-check it per device class. A bar that moves at a wildly wrong rate is only marginally better than a fake one.

**If you ship option 3 (indeterminate encode) as an interim:** do not show a fake percentage. Show a distinct labelled stage — "Encoding GIF (highest quality)…" with an indeterminate indicator and an elapsed timer. That is honest and satisfies the design-guidelines prohibition. Ship option 1 before launch.

---

# D13. Phase-1 benchmark harness — build this FIRST

**Purpose: this spike is a go/no-go gate on the locked architecture, not a perf-tuning exercise.** Three specific claims are unproven and each one can kill the plan: (a) gifski-wasm single-thread is fast enough to be a product, (b) it does not deadlock (open issue #5), (c) the whole thing fits in iOS Safari's ~100 MB. Build the harness so it answers exactly those three, and nothing else. YAGNI.

## Fixture media (check into `test/fixtures/`, keep total < 30 MB via git-lfs or a download script)

| ID | Content | Spec | Tests |
|---|---|---|---|
| `f1-720p-10s.mp4` | Moderate motion (talking head) | H.264, 1280×720, 30 fps, 10 s, ~8 MB | **The headline number.** This is the spec in `tech-stack.md` unresolved-Q #1. |
| `f2-1080p-30s.mp4` | High motion (sports/pan) | H.264, 1920×1080, 30 fps, 30 s, ~40 MB | Upper bound; expect desktop-only |
| `f3-480p-3s.mp4` | Low motion | H.264, 854×480, 24 fps, 3 s | Mobile happy path |
| `f4-hevc-720p-5s.mov` | iPhone-native capture | HEVC/H.265 in MOV, 5 s | Real-world iPhone uploads are HEVC. Tests hardware decode + container coverage. |
| `f5-vp9-720p-5s.webm` | — | VP9/WebM | Exercises the non-MP4 demux path |
| `f6-anim-320.gif` | 60 frames, 320×240 | ~1 MB | GIF-input tools; `ImageDecoder` path |
| `f7-anim-large.gif` | 400 frames, 640×480 | ~12 MB | GIF memory stress + Safari JS-decoder stress |
| `f8-anim.webp` | 60 frames animated WebP | — | `webp→gif` tool, ANMF splitter |
| `f9-odd-dims.mp4` | **499×281** (odd both axes) | — | Regression guard for the even-dimension bug (§B8) |
| `f10-rotated.mp4` | Portrait phone video with rotation matrix | — | Guards the `getRotation()` path; a classic silent-sideways-output bug |

Generate them once with native ffmpeg from public-domain sources and commit; do not generate at test time.

## Measurements (emit one JSON row per run)

```jsonc
{
  "fixture": "f1-720p-10s.mp4", "device": "MBA-M2", "browser": "chrome-141", "run": 3,
  "outW": 640, "outH": 360, "fps": 15, "quality": 80, "frames": 150,
  "t_wasm_fetch_ms": 41,        // gifski .wasm download + instantiate (cold vs warm cache)
  "t_demux_ms": 88,
  "t_decode_ms": 1240,          // decode + downscale to output size
  "t_encode_ms": 4310,          // gifski.encode() wall clock  <-- the number that decides everything
  "t_total_ms": 5679,
  "peak_js_heap_mb": 312,       // performance.memory.usedJSHeapSize (Chromium only)
  "peak_rss_mb": 470,           // CDP Performance.getMetrics / Memory.getAllTimeSamplingProfile
  "out_bytes": 2841002,
  "ssim_vs_reference": 0.972,   // vs native `gifski --quality 80` output on the same frames
  "main_thread_longest_task_ms": 14,   // MUST stay small; proves the worker split works
  "ok": true, "error": null
}
```

**Quality check is not optional.** The entire justification for taking on an AGPL dependency and a stale fork is output quality. Compare the WASM output against **native gifski 1.35** run on the same extracted frames, and against `gifenc` on the same frames. If WASM-gifski is not visibly better than gifenc, the AGPL cost buys nothing and the architecture should change. Measure SSIM/butteraugli plus a 3-person eyeball test on `f1` and `f7`.

## Devices / browsers

| Class | Target | How |
|---|---|---|
| Desktop reference | Chrome latest, M-series Mac or equivalent | Playwright local |
| Desktop Safari | Safari 26+, macOS | Playwright `webkit` (approximate) + **one manual run in real Safari** |
| Desktop Firefox | Firefox latest | Playwright `firefox` |
| Low-end desktop proxy | Chrome + CDP `Emulation.setCPUThrottlingRate: 4` | Chromium only |
| **iOS Safari — mandatory, manual** | **Real iPhone (a 3-4 year-old model, e.g. SE 3 / 12)** | Playwright's WebKit is **not** iOS Safari and will not reproduce the memory ceiling. Deploy the harness to a Vercel preview URL, open it on the device, read results off-screen or POST them to a scratch endpoint. **Do not skip this. The iOS memory ceiling is the single biggest unknown and it cannot be emulated.** |
| Android Chrome | One mid-range device or BrowserStack | Secondary |

## Pass / fail gates for the architecture

| # | Gate | Threshold | If it fails |
|---|---|---|---|
| **G1** | `f1` (720p 10 s) → 640×360 15 fps GIF, desktop Chrome, **total wall clock** | **≤ 8 s** (stretch ≤ 5 s) | Architecture is still viable but all UX copy must promise "seconds", not "instant"; consider defaulting to lower fps |
| **G2** | Same, with CPU throttle ×4 | ≤ 25 s | Reconsider client-side default for desktop-low-end; route to Pro |
| **G3** | **Deadlock gate — 1000 consecutive `encode()` calls** on `f6` (60 frames, 320×240), fresh worker each 50 runs, in Chrome + Firefox + WebKit | **Zero hangs, zero non-`ok` rows.** Per-call watchdog: if a single `encode()` exceeds 10× its median, record a hang and continue. | **This is the hard gate on issue #5.** Any hang at all ⇒ do not ship gifski-wasm as-is. Either fix the fork (you are vendoring it anyway, §C12) or fall back to `gifenc` + `gifsicle-wasm-browser` for optimisation. Run this in CI nightly forever. |
| **G4** | iOS Safari, `f3` (480p 3 s) → 480×270 12 fps | Completes, **no tab crash**, ≤ 20 s | Lower the iOS budget below 30 MB and cap harder |
| **G5** | iOS Safari, `f7` (400-frame GIF) with the JS fallback decoder | Completes or **fails gracefully with a real message** — a white-screen tab kill is a FAIL | Add stricter admission control; the point is that it must never crash silently |
| **G6** | Quality: WASM-gifski vs `gifenc`, same frames, same target size | Visibly better in 3/3 blind comparisons | If not, drop gifski → drop the AGPL problem entirely. Re-run the A1 decision. |
| **G7** | Main-thread longest task during a full job | **< 50 ms** | Worker split is broken; ads/CLS and INP will suffer |
| **G8** | `f4` (HEVC/MOV) and `f5` (VP9/WebM) decode without ffmpeg fallback, on Chrome + Safari | Both succeed | Feeds the §E14 fallback-rate estimate; adjust if HEVC fails |
| **G9** | Cold-load cost of the gifski `.wasm` | ≤ 250 ms on a 4G profile | Should pass easily at 120 KB gzip |

## Playwright automation

```ts
// tests/bench/encode.bench.spec.ts
import { test, expect } from '@playwright/test';
import { readFileSync, appendFileSync } from 'node:fs';

const FIXTURES = ['f1-720p-10s.mp4', 'f3-480p-3s.mp4', 'f6-anim-320.gif'];

for (const fixture of FIXTURES) {
  test(`bench ${fixture}`, async ({ page, browserName }) => {
    await page.goto('/__bench');                       // a dev-only route mounting the real pipeline

    // Feed the fixture through the REAL file input — not a synthetic in-page fetch.
    await page.setInputFiles('input[type=file]', `test/fixtures/${fixture}`);

    // The harness sets window.__benchResult when done; long timeout, this is a benchmark.
    const result = await page.evaluate(() =>
      new Promise<any>((res, rej) => {
        const t = setTimeout(() => rej(new Error('HANG')), 120_000);   // hang detector
        (window as any).__onBenchDone = (r: any) => { clearTimeout(t); res(r); };
      }),
    );

    // REAL output assertions, per tech-stack.md §7 ("not just DOM checks"):
    expect(result.ok).toBe(true);
    expect(result.outBytes).toBeGreaterThan(1000);
    expect(result.gifHeader).toBe('GIF89a');            // magic bytes read in-page
    expect(result.decodedFrameCount).toBe(result.frames); // round-trip: re-decode the GIF we made
    expect(result.mainThreadLongestTaskMs).toBeLessThan(50);

    appendFileSync('bench-results.jsonl', JSON.stringify({ ...result, browserName, fixture }) + '\n');
  });
}

// Deadlock gate — G3. Runs the encode 1000x in-page; separate spec, nightly only.
test('G3 gifski does not deadlock over 1000 encodes', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await page.goto('/__bench?mode=soak&n=1000&fixture=f6-anim-320.gif');
  const soak = await page.evaluate(() => (window as any).__soakDone);
  expect(soak.hangs).toBe(0);
  expect(soak.errors).toBe(0);
});
```

Supporting bits:
- **CPU throttling (Chromium only):** `const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });`
- **Memory (Chromium only):** `await cdp.send('Performance.enable')` then `Performance.getMetrics`, sampled on a timer during the run. On WebKit/Firefox, record only wall clock and rely on the manual iOS runs for memory.
- Run each fixture **5×, report the median**, discard the first (cold cache) run — or report cold and warm separately, since first-visit cost is a real UX number.
- Gate CI on G3 and G7 only (fast, deterministic). G1/G2/G4-G6 are reported as a tracked artifact, not a hard CI failure — machine variance would make them flaky.
- Keep `/__bench` behind `process.env.NODE_ENV !== 'production'` or a query token so it never ships.

**Deliverable of Phase 1:** `bench-results.jsonl` + a one-page summary that either (a) confirms the architecture and supplies the real numbers for UX copy and the §C11 budget table, or (b) fails a gate and triggers a documented architecture change. Do not write a line of tool UI before this exists.

---

# E. ffmpeg.wasm fallback

## E14. What the native path cannot handle, and how often the fallback actually loads

This directly answers `tech-stack.md` unresolved-Q #3.

**Two separate gaps — do not conflate them.** The locked doc frames this as "which containers can WebCodecs+mp4box not handle", but with `mediabunny` the *container* gap nearly closes; the real gap moves to **codecs and browsers**.

**Gap 1 — container/codec coverage.** `mediabunny` reads MP4/MOV/M4V, fragmented MP4/CMAF, MKV, WebM, Ogg, MPEG-TS, HLS, MP3, WAV, ADTS, FLAC; video codecs AVC, HEVC, VP8, VP9, AV1, ProRes. What is left out, weighted by what people actually upload to a GIF site:

| Not covered | Realistic share of uploads | Reasoning |
|---|---|---|
| AVI (DivX/Xvid/MJPEG) | ~1-2% | Legacy; still appears from old camcorders and pirate rips |
| FLV | < 0.5% | Effectively dead post-Flash |
| WMV / ASF | < 0.5% | Old Windows exports |
| MPEG-1/2 PS (`.mpg`, `.vob`) | < 0.5% | DVD rips |
| 3GP with H.263 | < 0.5% | Very old phones |
| MP4/MKV wrapping an exotic codec (Theora, MPEG-4 Part 2/Xvid-in-MP4) | ~1% | Container reads fine, `VideoDecoder` refuses the codec |
| **Container subtotal** | **~3-5%** | |

**Gap 2 — browser codec support (the bigger one).**

| Case | Share of *all* jobs | Note |
|---|---|---|
| **Firefox Android: no `VideoDecoder`/`VideoEncoder` at all** (`firefox_android: NO` in MDN BCD) | ~0.3-0.5% | **Recommend an honest "unsupported browser" message, not a 10 MB ffmpeg download on mobile data.** |
| HEVC/H.265 decode not available in the browser | ~2-4% of *video* jobs | iPhone-captured video is HEVC by default and is a common upload. Safari and recent Chrome-on-hardware handle it; Firefox largely does not. |
| AV1 decode on older hardware | < 1% | Rare as user upload |

**Bottom line estimate — the ffmpeg.wasm fallback should load on roughly 3-6% of video-input jobs, and ~0% of GIF/WebP/image-input jobs** (those go to the JS decoders in §B7/§B7b, never to ffmpeg). Since GIF-input tools are 6 of 9 MVP tools and likely the majority of traffic, **the blended fallback rate across all jobs is plausibly ~1-3%.**

Confidence: **medium.** The container mix is reasoned from general web-upload distributions, not measured on PZGIF traffic (which does not exist yet). **Instrument it:** log `{container, codec, path: 'native'|'fallback'|'unsupported'}` to Sentry/GA4 from day one and revisit after 30 days of real traffic. If the measured rate is < 2%, seriously consider **deleting the ffmpeg fallback entirely** and routing those users to the Pro/server tier — that is the YAGNI-correct outcome and saves you from maintaining a 32 MB dependency for 1 in 50 jobs.

**Also note:** every exotic-format user is a *better* Pro-tier prospect than a typical user. Routing "we can't do this in your browser — try Pro / desktop" is a monetisation path, not just a failure path. Ranked preference for handling the gap:

1. **Route to Pro/server upsell** (Phase 2+) — zero client cost, monetises the edge case.
2. **Lazy-load ffmpeg.wasm** (below) — works today, no server needed, but a 10 MB download.
3. Unsupported message — for Firefox Android only.

Since the server tier is Phase 2+, ship (2) for MVP but keep it strictly behind a dynamic import so it can be deleted in one commit if telemetry says it is unused.

## E15. `@ffmpeg/ffmpeg` + `@ffmpeg/core` single-thread — versions, size, lazy loading

| Package | Version | License | Published | Size |
|---|---|---|---|---|
| `@ffmpeg/ffmpeg` | **0.12.15** | MIT | 2025-01-07 | small JS wrapper |
| `@ffmpeg/core` (**single-thread**) | **0.12.10** | **GPL-2.0-or-later** | 2025-01-07 | **unpacked 64.7 MB** |
| `@ffmpeg/util` | 0.12.2 | MIT | 2025-01-07 | tiny |

**Measured wasm payload** (downloaded and compressed during this research):

| File | Raw | gzip -9 |
|---|---|---|
| `ffmpeg-core.wasm` | **32,232,419 B (32.2 MB)** | **10,184,913 B (10.2 MB)** |
| `ffmpeg-core.js` | 112,059 B | — |

Compare: `gifski_wasm_bg.wasm` single-thread = **292,735 B raw / 120,464 B gzip**. ffmpeg.wasm is **~85× larger over the wire**. This is the whole argument for the WebCodecs-first architecture, now with measured numbers rather than the "25-65 MB" range in the earlier report.

**Licensing note:** `@ffmpeg/core` is **GPL-2.0-or-later** — a second copyleft dependency shipped to the browser, with the same conveyance analysis as §A1. Under AGPL option B this is consistent (AGPL-3.0 and GPL-2.0-*or-later* are compatible via the "or later" clause upgrading to GPLv3). **Under commercial-license option A, the ffmpeg core is still GPL and still conveyed** — the supso.org license covers gifski/pngquant only, not ffmpeg. If you want a fully closed-source client bundle you must **either drop `@ffmpeg/core` entirely (E14 option 1: route to Pro) or accept GPL obligations for the fallback chunk.** This is an additional, independent reason to prefer routing exotic formats to the server tier. Flagging it because it was not in the original question list and it partially undercuts option A.

**Lazy loading so it never touches the main bundle:**

```ts
// src/lib/media/ffmpeg-fallback.ts
// NOTE: no static imports of @ffmpeg/* anywhere in this file's module graph.
let ffmpegPromise: Promise<any> | null = null;

async function getFFmpeg() {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');      // dynamic -> separate chunk
    const { toBlobURL } = await import('@ffmpeg/util');
    const ffmpeg = new FFmpeg();
    // Serve core from YOUR origin (public/ffmpeg/), not a CDN:
    //  - no third-party origin in CSP
    //  - you control cache headers (immutable, 1 year)
    //  - no supply-chain risk from an unpinned CDN
    const base = '/ffmpeg';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      // NO workerURL / no -mt build. Single-thread only. NEVER @ffmpeg/core-mt.
    });
    return ffmpeg;
  })();
  return ffmpegPromise;
}

export async function decodeViaFFmpeg(file: File, onProgress: (p: number) => void) {
  const ffmpeg = await getFFmpeg();
  ffmpeg.on('progress', ({ progress }: { progress: number }) => onProgress(progress)); // real 0-1
  // ... writeFile / exec / readFile ...
}
```

Rules that make the lazy-load actually work:

1. **Only ever `await import()`.** One static `import { FFmpeg } from '@ffmpeg/ffmpeg'` anywhere in a module reachable from a page entry pulls the wrapper into the main bundle. Enforce with an ESLint `no-restricted-imports` rule allowing `@ffmpeg/*` only inside `src/lib/media/ffmpeg-fallback.ts`.
2. **Ban `@ffmpeg/core-mt`** in the same ESLint rule and in code review. It needs SAB → COEP → kills ads.
3. **Do not `npm i @ffmpeg/core` for the browser payload.** It is 64.7 MB unpacked in `node_modules` and will slow every CI install. Instead check the two files into `public/ffmpeg/` (or fetch them in a `prebuild` script) and keep only `@ffmpeg/ffmpeg` + `@ffmpeg/util` as real dependencies.
4. **Gate the download behind explicit user consent.** 10.2 MB is a lot on mobile data. Show: *"This format needs an extra 10 MB decoder. Download and continue?"* — never auto-download. This also gives you a clean telemetry event for E14's real-world rate.
5. Add a bundle-size CI check (`@next/bundle-analyzer` or a size budget) asserting the main client chunk contains no `ffmpeg` string. A silent static import is otherwise invisible until users complain.
6. Cache: `Cache-Control: public, max-age=31536000, immutable` on `/ffmpeg/*`, filenames version-pinned.

**Known ffmpeg.wasm risks** (carried forward from the earlier report, still current at 0.12.x): self-labelled "experimental"; input file is copied twice (page → worker → wasm heap) roughly doubling memory (ffmpegwasm/ffmpeg.wasm#83); **iOS Safari OOM crashes reported on `ffmpeg.load()` alone** (#582, #745). Given §B9's ~100 MB iOS budget, **do not offer the ffmpeg fallback on iOS at all** — go straight to "not supported on this device". A crash is worse than a clear refusal.

---

# Summary of recommended changes to `tech-stack.md`

| § | Current | Change | Why |
|---|---|---|---|
| §1 differentiators | "gifski output quality" | **Add a licensing line item** | AGPL; $950/yr or open-source the client |
| §4 pipeline table | `mp4box.js` (+ WebM demuxer) | **`mediabunny@1.52.3`** | mp4box fine but WebM demuxer candidates are abandoned; mediabunny covers both + MKV/TS/HLS |
| §4 pipeline table | `WebCodecs VideoEncoder + muxer` | **`mediabunny` Output** | `mp4-muxer`/`webm-muxer` formally deprecated by their author |
| §4 pipeline table | `ImageDecoder` for animated GIF | **`ImageDecoder` + `modern-gif@2.1.0` fallback** | Safari has no `ImageDecoder`, ever |
| §4 pipeline table | `@jsquash/*` | **Add: animated WebP needs a custom ANMF splitter** | `@jsquash/webp` is still-image only |
| §4 (new row) | — | **`fflate@0.8.3` for ZIP output** | "split GIF to frames" |
| §4 (new row) | — | **Vendored `gifski-wasm` fork** | Progress callback + cancellation + deadlock fix |
| §4 client limits | Desktop 150 MB/1080p/60 s; mobile 50 MB | **Rewrite as a frame-buffer budget** (§C11) incl. **max output width 640/480** and an **iOS 30 MB** budget | Input file size is not the binding constraint; decoded RGBA is |
| §7 | Vercel | **Add CSP `'wasm-unsafe-eval'`; serve `.wasm` from `public/`** | Turbopack cannot resolve `new URL(..., import.meta.url)` for wasm in workers |
| §9 rejected | — | **Add: `jszip` (stale, buffers all), `mp4-muxer`/`webm-muxer` (deprecated), `@ffmpeg/core` on iOS (OOM)** | |
| §Unresolved #3 | container coverage gap | **Answered: ~3-6% of video jobs, ~1-3% blended. Instrument and revisit.** | §E14 |

---

# Unresolved questions

1. **The gifski licensing decision is yours, not mine.** Option A ($950/yr) vs option B (AGPL the client bundle). Everything downstream — whether you can vendor a fork freely, whether `@ffmpeg/core`'s GPL matters, whether the Phase-2 server tier can share code — depends on it. **Decide before Phase 1 code.** Get legal sign-off if you pick B.
2. **`@ffmpeg/core` is GPL-2.0-or-later and also conveyed to the browser.** The supso.org commercial license does not cover it. Under option A this leaves one copyleft dependency in the client. Not analysed in depth here; may be a reason to drop the ffmpeg fallback entirely.
3. **Does `gifski-wasm`'s single-thread path deadlock?** Issue #5 is about "channels and/or threads", and gifski uses `crossbeam-channel` even without rayon. **Unverified** — gate G3 exists precisely to answer it. Do not assume single-thread is safe.
4. **All timing numbers remain unmeasured.** No benchmark was run in this research; §D exists to produce the first real numbers. Every "≤ 8 s" style threshold in §D is a proposed target, not a prediction.
5. **`require.resolve('gifski-wasm/pkg/gifski_wasm_bg.wasm')` may be blocked** by the package's `exports` map (which lists only `.`, `./multi-thread`, `./cloudflare`, `./node`). **Unverified.** Fall back to a path-join or check the file into `public/`.
6. **Whether Next 16.3.0's Turbopack still breaks worker+wasm URL resolution.** Issue #84782 was auto-closed by a stale bot on 2026-02-05 with repros unresolved; a report from 2025-12-26 says still broken on 16.1.1. **Unverified for 16.3.0.** The `public/` + absolute-URL approach avoids the question entirely, which is why it is the recommendation.
7. **Safari 26.x `VideoEncoder` codec availability for VP8/VP9** — assumed decode-only, encode-unavailable. **Unverified.** Probe with `VideoEncoder.isConfigSupported` at runtime; do not hardcode.
8. **Real-world container/codec mix for PZGIF uploads.** §E14's 3-6% is reasoned, not measured. Instrument from day one.
9. **iOS memory numbers are from one practitioner's measurements** (lapcatsoftware, Jan 2026) on two devices. Device- and iOS-version-dependent. The §C11 iOS budget of 30 MB is deliberately conservative and should be tuned by gate G4 on a real device.
10. **`modern-gif@2.1.0` decode performance is unbenchmarked.** It is the recommended Safari fallback purely on maintenance grounds (only 2026-published option). Verify decode speed and disposal-method correctness against `ImageDecoder` output on fixture `f7` before committing.
11. **Whether shipping a hand-rolled ANMF/RIFF splitter is worth it vs descoping `webp→gif` on Safari.** Depends on projected tool traffic, which does not exist yet. Recommend descoping at MVP and revisiting.
