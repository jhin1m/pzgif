# Tech Stack — PZGIF

Status: **approved** (2026-08-04), **amended 2026-08-05** — see the changelog at the foot of this file.
Decided in `/ak:bootstrap --full` Step 3. Backed by research reports in `plans/reports/`.

> Six statements in the 2026-08-04 version were proved factually wrong by research. They are corrected inline below and each correction is marked **[Amended 2026-08-05]**. Everything not marked stands unchanged.

---

## 1. Product shape (context for every decision below)

| Dimension | Decision |
|---|---|
| Product | GIF/media tools site, ezgif-class, global/English first |
| Monetization | Ads + Pro subscription + dev API. **[Amended 2026-08-05]** No network at launch — Ezoic is unreachable; see §6 |
| Free tier | 100% in-browser processing, no upload, no account |
| Pro / API tier | Server-side processing (large files, batch, best quality) — **Phase 2+**, not MVP |
| SEO strategy | Long-tail utility clusters + platform presets. **Never** target `gif maker` / `video to gif` head terms |
| Differentiators | (1) gifski output quality (2) Discord/Slack presets (3) cheap GIF-specific API (4) no-upload privacy |

---

## 2. Hard architectural constraint that shapes everything

**`COEP: require-corp` breaks Google ad serving.** Confirmed in Google's own Publisher Tag docs. Multi-threaded `ffmpeg.wasm` requires `SharedArrayBuffer`, which requires cross-origin isolation (`COOP: same-origin` + `COEP`). `COEP: credentialless` is unsupported in Safari with no shipping plan.

**Consequence:** no page may be cross-origin isolated. Therefore the client pipeline must not depend on `SharedArrayBuffer`.

This is why the pipeline below uses **WebCodecs (native) + gifski-wasm (single-threaded)** instead of `ffmpeg.wasm` multi-thread. Ads and processing coexist on every page, no subdomain split, no service-worker header shims.

> **Rule of thumb for reviewers:** if a change introduces `SharedArrayBuffer`, `COOP`, or `COEP` headers, it is breaking the ad revenue model. Reject or isolate deliberately.

---

## 3. Frontend

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | SSG for hundreds of SEO tool pages; Core Web Vitals is a ranking factor here; React ecosystem needed for WASM/Worker orchestration |
| Rendering | **SSG/ISR for all tool + content pages** | Tool pages are static shells; all work happens client-side. No SSR cost, CDN-cacheable, fastest possible LCP |
| Styling | **Tailwind CSS v4** | Utility-first, minimal runtime CSS, easy to keep ad slots layout-stable |
| Components | **shadcn/ui** (Radix primitives) | Accessible by default, copy-in (no vendor lock), matches Tailwind |
| State | React state + Zustand only if needed | YAGNI — most state is per-tool and local |
| i18n | **next-intl**, wired from day 1, English-only content at MVP | Each added language multiplies long-tail keyword surface. Retro-fitting i18n into routing is expensive; wiring it early is cheap |
| Icons | lucide-react | Ships with shadcn |
| Fonts | `next/font` self-hosted | No render-blocking third-party font request; avoids CLS |

---

## 4. Client-side media pipeline (the core of the product)

**[Amended 2026-08-05]** The demuxer, the GIF decode path and the client limits below all changed. The pipeline as built is:

```
File input
  ├─ video → WebCodecs VideoDecoder  (native, hardware-accelerated)
  │            ↑ demuxed by mediabunny (MP4/MOV/WebM)
  ├─ animated GIF → modern-gif (every browser — Safari has no ImageDecoder)
  └─ still images → @jsquash/* codecs

        ↓ frames (VideoFrame / ImageBitmap)

  OffscreenCanvas inside a Web Worker
    → resize / crop / rotate / overlay text / speed / reverse / frame select

        ↓ RGBA frames

  gifski-wasm  → optimized GIF  (pngquant palette + temporal dithering)
  @jsquash/webp → animated WebP
  WebCodecs VideoEncoder + muxer → MP4 / WebM
```

| Job | Library | Why this one |
|---|---|---|
| Video demux / mux | **`mediabunny@1.52.3`** (MPL-2.0) **[Amended 2026-08-05]** | Replaces `mp4box.js` + `mp4-muxer` + `webm-muxer`: both muxers are deprecated by their own author and `webm-demuxer` does not exist on npm. `CanvasSink` also bounds decode memory for free |
| Video decode | **WebCodecs `VideoDecoder`** | Native, hardware-accelerated, zero WASM download, Safari 26+ shipped |
| Animated GIF decode | **`modern-gif@2.1.0`** (MIT), on every browser **[Amended 2026-08-05]** | Safari has no `ImageDecoder` in any version (confirmed absent from WebKit source) and Firefox only from 133, while 6 of 9 tools take GIF input. One decode path beats a Safari special case. Chosen on maintenance grounds and **unbenchmarked** — Phase 1 measures it |
| ZIP output | **hand-written STORE writer** (`src/lib/media/encode/png-zip.ts`) **[Amended 2026-08-05, Phase 4]** | `fflate` was chosen for one property — `ZipPassThrough` stores without re-deflating, because PNG is already compressed. With compression off, ZIP is a header format; ~100 lines replace the dependency and its bundle cost. Verified against Python `zipfile` in `png-zip.test.ts` |
| Frame ops | **OffscreenCanvas + Web Workers** | Mandatory — never block the main thread |
| GIF encode | **`gifski-wasm`** (AGPL-3.0-or-later, vendored fork) | Best-in-class quality/size. This is differentiator #1 — most WASM competitors use `gif.js`/`gifenc` and look visibly worse. **[Amended 2026-08-05]** Its licence is why the PZGIF client bundle is published under the AGPL; see "Licensing" below. The fork adds progress and cancellation and is deferred past launch |
| Quick preview encode | `gifenc` | Tiny, fast, low-quality — for live preview only, never final export |
| Still-image decode | **`createImageBitmap`** **[Amended 2026-08-05, Phase 4]** | `@jsquash/*` is not adopted. No MVP tool takes a still image as *input*; the engine only needs to identify one so the refusal can name it, and every supported browser decodes PNG/JPEG/WebP natively inside a worker. A WASM codec would be a megabyte of download to learn an image's size |
| Animated WebP decode | **`ImageDecoder`**, where present **[Added 2026-08-05, Phase 4]** | Absent in Safari at every version and Firefox below 133, so `webp-to-gif` reports `browser-unsupported` there rather than failing mid-job. The hand-rolled RIFF/ANMF splitter is Phase 7's decision |
| Exotic format fallback | `@ffmpeg/core` **single-thread**, runtime-loaded from `public/ffmpeg/` **[Amended 2026-08-05, Phase 4]** | Only when WebCodecs cannot handle the container. Single-thread = no SAB = no COEP. Not an npm dependency: `ffmpeg-fallback.ts` imports it from a URL assembled at call time so no bundler can follow it, and `pnpm check:heavy` fails the build if it ever reaches a client chunk. The binaries are **not vendored yet**, so `isFfmpegAvailable()` is false and the recovery is not offered |
| Heavy multi-step image pipelines (later) | `wasm-vips` | Only if static-image tools get added; not MVP |

**Explicitly rejected:** `@ffmpeg/core-mt` (multi-thread) — kills ad revenue via COEP. `wasm-imagemagick` — slower and heavier than jsquash/vips for equivalent ops.

### Client-tier limits — frame-buffer budget **[Amended 2026-08-05]**

The "~150 MB desktop / ~50 MB mobile, up to 60 s" figures are **wrong** and must not be advertised. Input file size is not the binding constraint; decoded RGBA is. gifski holds **2× all frames** resident and cannot stream, so the ceiling is

```
frames × width × height × 4 bytes × 2
```

On an iPhone SE 3-class device that is roughly **57 frames at 480×270 — about 3.8 seconds of GIF**, not 60. A 50 MB limit derived from file size would accept jobs that OOM and reject jobs that would have worked.

Therefore: **device-class frame-buffer budgeting with admission control before decode.** A job that does not fit is refused up front with concrete alternative settings — never an OOM mid-job. Phase 4 owns the budget table; Phase 1 gates G3/G4 validate it on real hardware. Copy quotes the computed limit, never a file size.

### Licensing consequence **[Added 2026-08-05]**

`gifski-wasm` is AGPL-3.0-or-later and client-side delivery is *conveyance*, so shipping it inside a closed-source ad-supported bundle would violate the licence. The $950/yr commercial licence was rejected; **the PZGIF client bundle is published under AGPL-3.0** instead. This also resolves `@ffmpeg/core`'s GPL-2.0-or-later obligation if the fallback ships.

**The PZGIF frontend is AGPL permanently.** A future Pro/API tier will inevitably share the tool registry, the design system, the components and the copy — all AGPL by then. Pro/API monetises the hosted service and the API, not code secrecy. Any closed component must be server-only and must invoke unmodified gifski out-of-process (the standard mere-aggregation position). The $950/yr licence remains purchasable and would let *newly written* first-party code be closed, but it un-publishes nothing already released and does not cover `@ffmpeg/core`.

Site prose and brand assets are **not** part of the Program and are covered separately by `LICENSE-CONTENT`; the boundary is stated in `NOTICE`.

---

## 5. Server tier (Phase 2+ — Pro & API only, NOT in MVP)

| Layer | Choice | Reason |
|---|---|---|
| Compute | **Google Cloud Run** (container: ffmpeg + gifski + gifsicle) | Scale-to-zero; free tier ≈ 18k jobs/mo; 60-min timeout; **runs on gVisor by default** = meaningful sandboxing for untrusted media, free |
| Compute (scale-out) | **Hetzner CPX21/31 VPS** flat $22-37/mo | Switch steady-state load here past ~15-20k jobs/mo; queue abstraction makes it transparent |
| Object storage | **Cloudflare R2** | Zero egress fee — decisive for a media site. $0.015/GB-mo |
| Uploads | Presigned direct-to-R2 PUT | Never proxy file bytes through the app server |
| Queue | **pg-boss** on the app's Postgres | No extra Redis to operate. Move to BullMQ only if it becomes a real bottleneck |
| Database | **Neon** (serverless Postgres, free tier) | Also hosts pg-boss; scales to zero |
| Bot / abuse | Cloudflare Turnstile (free) + Cloudflare rate limiting + Upstash per-key limits | Only server endpoints need it — client-side tools cost us nothing so they need no gate |

### Server encoder recipes (locked)
- Video→GIF fast: ffmpeg two-pass `palettegen`/`paletteuse`
- Video→GIF best (Pro): ffmpeg frame pipe → `gifski --quality 90`
- Any GIF output: final pass through `gifsicle -O3 --lossy=<n>`
- GIF→MP4/WebM/WebP: ffmpeg

### ffmpeg-on-untrusted-input hardening (mandatory before Pro ships)
1. `-protocol_whitelist file,pipe` — kills SSRF/local-file-read via `http:`/`concat:`/`subfile:`
2. Container with CPU/mem/pids limits, read-only rootfs, no network egress from the ffmpeg process
3. seccomp profile, drop all capabilities
4. Wall-clock kill at 60-120s
5. Pinned ffmpeg version, tracked against CVE feeds

---

## 6. Monetization & compliance stack

| Concern | Choice | Note |
|---|---|---|
| Ads at launch | **None.** Slots, CMP and legal pages ship; no network is activated **[Amended 2026-08-05]** | **Ezoic is unreachable**: it has required **250,000+ monthly active users since 2026-02-19**. The launch-monetisation premise recorded on 2026-08-04 is void. The ad layer ships as a swappable provider interface launching with `provider = none`, so switching a network on later is a config change, not a layout rewrite. See Phase 10 |
| Ads later | AdSense, after 10-20 genuine content pages are indexed | Higher RPM, medium-term goal |
| EU consent | **Google-certified CMP** (CookieYes / Cookiebot) + Consent Mode v2 | Without it, EEA/UK ads are non-personalized or blocked → 50-70% RPM loss |
| Ad layout | Fixed-height reserved slot containers, CSS-declared before script injection | Unreserved ad slots are the #1 CLS cause; CLS < 0.1 is a ranking input |
| Payments (Phase 3) | **Polar** (Merchant of Record) | Vietnam confirmed as a supported payout country via Stripe Connect Express — resolves the Stripe-VN blocker. Handles global VAT |
| Auth (Phase 3) | **Better Auth** | Only needed when Pro accounts ship |
| Analytics | GA4 + Google Search Console | Search Console is non-negotiable for an SEO-led product |

**Ad placement rule:** never place an ad where it can be mistaken for the Process/Download button. Violates Better Ads Standards, destroys trust, and jeopardizes later AdSense approval.

---

## 7. Hosting & tooling

| Layer | Choice |
|---|---|
| App hosting | **Undecided. [Amended 2026-08-05]** Vercel Hobby is *not* available — it forbids commercial use and an ad-supported site is commercial use, so Vercel Pro ($20/mo before bandwidth) is the floor. Cloudflare Pages is the live alternative. Bandwidth is the metered dimension and this payload is heavy. Decide before the first real deploy; see Unresolved #6 and `docs/infrastructure-runbook.md` |
| DNS / CDN / WAF | **Cloudflare** (also fronts R2, Turnstile, rate limiting) |
| Package manager | **pnpm** |
| Lint / format | ESLint (next config) + Prettier |
| Unit tests | **Vitest** |
| E2E tests | **Playwright** — must include real encode assertions on fixture media, not just DOM checks |
| CI | GitHub Actions: forbidden-headers guard → typecheck → **explicit `eslint .`** → vitest → build → static-route guard → playwright. **[Amended 2026-08-05]** Next 16 removed `next lint` and `next build` no longer lints, so without an explicit step nothing runs ESLint at all |
| Error tracking | Sentry (free tier) — client-side WASM failures are invisible otherwise |

---

## 8. Legal pages required before ads go live

Terms of Service · Privacy Policy (must disclose ad personalization + cookies) · Cookie Policy · Acceptable Use Policy · About (real identity — an E-E-A-T trust signal for AdSense review).

Deferred until the server tier ships: DMCA Policy + registered DMCA agent ($6 / 3 years, open to non-US operators), Refund Policy (Polar requires it), Cloudflare CSAM Scanning enabled on R2-bound uploads, TTL auto-delete, unguessable object keys, `X-Robots-Tag: noindex` on all result URLs.

**Design constraint to preserve:** no public sharing / gallery features. Keeping stored files private (each user sees only their own) keeps the service in the EU DSA's lighter "hosting service" class instead of the much heavier "online platform" class.

---

## 9. Rejected alternatives (and why)

| Rejected | Why |
|---|---|
| Laravel + Livewire | Core pipeline is browser-native JS/WASM; SSG SEO story is weaker; needs a VPS |
| `ffmpeg.wasm` multi-thread as primary | Requires COEP → breaks ad serving. Non-negotiable |
| `ffmpeg.wasm` single-thread as primary | 25-65 MB bundle, ~2x slower than the WebCodecs path, worse GIF quality, iOS OOM reports. Kept only as a lazy-loaded fallback |
| Isolated `tools.` subdomain running threaded WASM | Sacrifices ads on the highest-traffic pages and doubles infra complexity for a ~2x speed gain |
| AWS Lambda for the worker | Container packaging + cold starts + 15-min cap — disproportionate complexity for a solo dev |
| Cloudflare Containers | GA only April 2026; too thin a production track record to bet an MVP on. Revisit in 6-12 months |
| Stripe direct | Does not onboard Vietnam-registered sellers |
| S3 / Backblaze B2 | Egress fees dominate cost for a media site; R2's zero egress wins |
| Public GIF gallery / share links | Triggers DSA "online platform" duties, DMCA exposure, and AdSense copyright risk |

---

## Unresolved (verify before the relevant phase)

1. Real-device benchmark of the WebCodecs→gifski path (10s 720p MP4→GIF). All timing estimates are extrapolated. **Run a spike before writing any UX copy that promises speed.**
2. Live Cloud Run per-second pricing — figures were search-derived, not fetched from the pricing page.
3. Container coverage gap: which video containers WebCodecs+mp4box cannot handle, i.e. how often the ffmpeg.wasm fallback actually loads.
4. Current Google-certified CMP vendor list (changes over time).
5. Whether `COEP: credentialless` is truly GPT-compatible — untested. Irrelevant while we avoid COEP entirely, but relevant if the decision is ever revisited.
6. **[Added 2026-08-05]** Hosting tier is unresolved. Vercel Hobby forbids commercial use and an ad-supported site is commercial use, so Vercel Pro at $20/mo before bandwidth is the floor against a stated $20-50/mo budget. Bandwidth is the metered dimension and the per-session payload is heavy. Cloudflare Pages is the live alternative. See `docs/infrastructure-runbook.md`.

---

## Changelog

### 2026-08-05 — three library corrections from building the engine (Phase 4)

Source: `plans/reports/from-cook-to-project-manager-phase-04-media-engine-report.md`.

| # | Section | Was | Now |
|---|---|---|---|
| 1 | §4 | `fflate@0.8.3` for ZIP output | **A ~100-line STORE-only writer.** The dependency was chosen for `ZipPassThrough`, i.e. for *not* compressing; with compression off the container is header assembly plus a CRC32. Verified against an independent unzip implementation rather than trusted |
| 2 | §4 | `@jsquash/*` for image codecs | **Dropped.** No MVP tool takes a still image as input. `createImageBitmap` identifies one natively so the refusal can name it |
| 3 | §4 | `@ffmpeg/core` lazy-loaded as a dependency | **Runtime-loaded from `public/ffmpeg/`, not an npm dependency.** Keeps 10 MB out of the module graph by construction; `pnpm check:heavy` asserts it. Binaries not vendored yet, so the path reports unavailable rather than advertising a fallback it cannot deliver |

Also settled in Phase 4: the GIF encoder is chosen at runtime by
`NEXT_PUBLIC_GIF_ENCODER`, by the job, or by rendering engine — **Firefox
defaults to `gifenc`**, because gifski's WASM measured 12-14× slower under
SpiderMonkey (51.8 s against a 30 s viability floor) while `gifenc` ran at
parity on all three engines.

### 2026-08-05 — six research-driven corrections (Phase 2)

Sources: `plans/reports/research-260804-2343-client-pipeline-integration-apis-report.md`, `plans/reports/research-260804-2230-ads-eligibility-legal-compliance-report.md`, `plans/reports/research-260804-2343-nextjs-seo-discord-ads-shell-report.md`.

| # | Section | Was | Now |
|---|---|---|---|
| 1 | §4 | `mp4box.js` + WebM demuxer + `mp4-muxer` / `webm-muxer` | **`mediabunny@1.52.3`** — both muxers are deprecated by their author; `webm-demuxer` does not exist on npm |
| 2 | §4 | Animated GIF decode via WebCodecs `ImageDecoder` | **`modern-gif@2.1.0` on every browser** — Safari has no `ImageDecoder` in any version; Firefox only from 133 |
| 3 | §4 | (absent) | Added **`fflate@0.8.3`** for ZIP output, and recorded the vendored `gifski-wasm` fork (progress + cancellation) |
| 4 | §4 | "Desktop ~150 MB / mobile ~50 MB, up to 60 s" | **Frame-buffer budget model.** The binding constraint is decoded RGBA held 2× by gifski, not input file size. ~3.8 s of 480×270 GIF on an iPhone SE 3-class floor |
| 5 | §6 | "Ezoic (accepts new/small tool sites)" | **Ezoic is unreachable** — 250,000+ MAU required since 2026-02-19. MVP launches with ad slots reserved and `provider = none` |
| 6 | §7 | CI `typecheck → lint → …` relying on `next build` | **Explicit `eslint .` step required** — Next 16 removed `next lint` and `next build` no longer lints |

Also added in the same pass: the AGPL-3.0 decision and its permanence (§4, "Licensing consequence"), and the hosting-tier open question (#6 above).

Everything else in this document is unchanged from the 2026-08-04 approved version.
