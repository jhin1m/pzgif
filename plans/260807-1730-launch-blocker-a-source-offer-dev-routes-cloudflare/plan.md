# Blocker A — source offer, dev routes, Cloudflare Workers

Status: **code complete, undeployed** · Created 2026-08-07 · Base: `main` @ `561fe9f`

Ships the four things standing between a correct build and a served domain.
Single file rather than phase files: the whole thing is half a day and the
phases share one commit boundary.

Source: `plans/reports/from-ask-to-planner-260807-1708-remaining-scope-to-launch-report.md` §A.

## What changed against that report

Two of its three claims did not survive measurement.

- **`NEXT_PUBLIC_COMMIT_SHA` is already wired.** `next.config.ts` resolves it
  through `env`, so it is inlined at build time from a host-variable chain with a
  `git rev-parse` fallback. The report's "chưa set" is wrong. The **real** gap is
  that the chain names `CF_PAGES_COMMIT_SHA` — the Pages variable — while Workers
  Builds injects `WORKERS_CI_COMMIT_SHA`. On the chosen host the chain misses,
  and because Workers Builds also sets `CI=true`, `check:source-sha` stops being
  a no-op and fails the build outright.
- **`/dev/states` is already `noindex` and already absent from `sitemap.ts`.** The
  SEO half of that item was done in Phase 3. What remains is only that the route
  exists in production, which `page.tsx` argues for deliberately.

## Phases

### 1. One source of truth for the repository URL

`https://github.com/pzgif/pzgif` is hard-coded in two files and is wrong in both.
It has been wrong in both simultaneously since Phase 2, which is the argument
against fixing it twice.

`wasm-version.json` already exists for exactly this shape — a constant that a
build script and the app must agree on — so it sets the precedent.

- Create `source-repo.json` — `{ "url": "https://github.com/jhin1m/pzgif" }`
- `src/lib/site-config.ts` — import it as the default for `SOURCE_REPO_URL`
- `scripts/check-source-sha.mjs` — `JSON.parse` it as the default for `repoUrl`

### 2. The commit SHA on the host that will actually build

- `next.config.ts` `resolveCommitSha()` — add `WORKERS_CI_COMMIT_SHA` to the chain
- `scripts/check-source-sha.mjs` — same addition, same order

Both keep `CF_PAGES_COMMIT_SHA`: it costs one line and Pages stays a live
fallback if Workers Builds disappoints.

### 3. `/dev/states` out of the production build

Same mechanism as `/__bench`: the file is only *recognised as a page* when the
flag is on, so the route and its module graph do not exist in a shipped build.

- `src/app/[locale]/dev/states/page.tsx` → `page.dev.tsx`
- `next.config.ts` — generalise `benchRouteEnabled` to cover
  `PZGIF_ENABLE_DEV_ROUTES=1`; `PZGIF_ENABLE_BENCH=1` keeps working
- `page.dev.tsx` header comment — the paragraph claiming the page is *not*
  excluded from the build is now false. Rewrite it rather than leave it lying.
- `docs/design-guidelines.md` §8 — the `demo` ad-slot note says `/dev/states`
  passes it; add that the route is dev-only

`e2e/component-states.spec.ts` holds two tests that assert **product** surfaces,
not the gallery: the 320px overflow check loops `["/", "/dev/states"]`, and the
footer-inventory test only visits `/`. Those move out and keep running. The rest
skip unless `PZGIF_ENABLE_DEV_ROUTES=1`.

**Accepted debt, stated plainly:** measured under the flag rather than taken from
the report, only **one** of the three known defects is still real — WebKit puts
something ahead of the skip link in the tab order. It stops being exercised by
default CI, and hiding a failing test is not fixing it; Phase 11 owns it and
`PZGIF_ENABLE_DEV_ROUTES=1 pnpm build && PZGIF_ENABLE_DEV_ROUTES=1 pnpm test:e2e component-states`
reproduces it.

The other two are **gone**, and the report's §D is stale on both. The 40px
overflow at 320px was the ad slot's `aspect-ratio` floor transferring a 300px
minimum width onto a 288px viewport; `bd271d6` replaced it with a height
reservation and closed it. The WebKit FAQ-panel height check passes on repeat
runs. So the honest count is 21 pass / 1 fail, not 4 fail.

### 4. Cloudflare Workers

Verified before writing any config: `@opennextjs/cloudflare@1.20.2` declares
`next: ">=15.5.21 <16 || >=16.2.11"`; this repo is on `16.3.0`. The `16.2.11`
floor is where Next's Build Adapters API made `proxy.ts` work off-Vercel, which
is the one feature this app cannot ship without — `localePrefix: "as-needed"`
depends on it.

- `pnpm add -D @opennextjs/cloudflare wrangler`
- `wrangler.jsonc` — `nodejs_compat`, assets binding, `/wasm/*` untouched by the
  worker so the `immutable` header survives
- `open-next.config.ts`
- `package.json` — `preview` and `deploy` scripts, with `check:source-sha`
  **ahead of** the deploy step, closing runbook §3
- `.gitignore` — `.open-next/`, `.wrangler/`

### 5. Runbook

`docs/infrastructure-runbook.md` §2 says "Unresolved". Resolve it, and write the
operator sequence with the exact variable names, because that sequence is the
part no code change can perform.

## What phase 4 actually cost

Two things the compatibility check could not have predicted, both found by
running the thing rather than reading about it.

**`proxy.ts` is rejected outright.** The adapter errors with "Node.js middleware
is not currently supported", and Next 16's `proxy.ts` is Node-only by design.
There is no flag and no newer release. Renaming to the deprecated
`src/middleware.ts` — which Next still accepts, on the Edge runtime — is the only
path, and it reverses an instruction written in that very file. Put to the user,
who chose it over the $20/mo Vercel fallback. The file now says why, and names
the condition for renaming forward.

**An empty `open-next.config.ts` 404s every page.** The first version declared no
`incrementalCache`, reasoning that an app with no ISR needs no cache. Wrong, and
expensively so: under OpenNext the incremental cache is not an optimisation over
prerendered pages, it is *where they live*. Only `robots.txt` and `sitemap.xml`
answered. `staticAssetsIncrementalCache` — read-only, build-time, straight off
the ASSETS binding, no R2 — is the correct store for this shape.

**And one the plan did not anticipate at all:** Workers Assets answers static
files without invoking the Worker, so `headers()` in `next.config.ts` never
reaches them. `/wasm/*` and `/_next/static/*` were both being served
`max-age=0, must-revalidate` — the immutable cache the whole versioned-path
scheme exists for, silently gone. `public/_headers` restores both, verified.

## Acceptance criteria

- [x] `pnpm build` — footer link is `github.com/jhin1m/pzgif/tree/561fe9fa…`, and
      `check:source-sha` fetches that exact commit anonymously
- [x] `/dev/states` 404s in a default build, both on `next start` and on workerd
- [x] `typecheck`, `lint`, `test` (245), `check:forbidden`, `check:static`,
      `check:landing`, `check:heavy` — all clean
- [x] `pnpm test:e2e` — 101 pass, 0 fail (was 4 fail)
- [x] `PZGIF_ENABLE_DEV_ROUTES=1` build restores the gallery: 21 pass, 1 fail,
      that one being the tracked WebKit skip-link defect
- [x] `pnpm preview` — all six routes 200 on workerd; CSP intact; `/wasm/*` and
      `/_next/static/*` `immutable`; `/sw.js` `no-cache`; `_headers` not served
- [x] No `SharedArrayBuffer`, COOP or COEP in the Cloudflare config, and none in
      the preview's response headers

Not yet done, because they are not code:

- [ ] `wrangler login`, first `pnpm deploy`, DNS at Cloudflare
- [ ] `NEXT_PUBLIC_SITE_URL` in the Workers build environment
- [ ] Search Console domain property, DNS TXT verification, sitemap submitted

## Review findings, and what was done about them

A review pass found three blocking-grade gaps, all of the same shape: the change
had moved enforcement out of the places CI looks.

- **`pnpm check:forbidden` never opened `wrangler.jsonc`.** `.jsonc` was missing
  from `SCAN_EXTENSIONS`, so the file configuring the host runtime — compatibility
  flags and all — was exempt from the guard that mechanically enforces the
  project's first rule. Fixed, and proved by injecting a COEP line and watching
  the guard fail.
- **The gallery suite would have been skipped in CI forever.** Worse, this file's
  own comment claimed CI set the flag. It did not. Rather than soften the claim,
  CI now has a `component-gallery` job that builds with the flag and runs the
  suite — restoring the a11y and computed-style coverage, and the compile-time
  check on `page.dev.tsx`. The one open WebKit defect is `test.fail()`, not
  `test.skip()`, so a fix announces itself instead of passing unnoticed.
- **`pnpm deploy` shipped with its own gate no-oping.** `check:source-sha` exited
  0 outside CI, so a hand-run deploy was the one ungated path — precisely where
  an unpushed commit is likeliest. It now resolves the commit exactly as the
  build does and verifies it wherever it runs.

Also taken: `||` instead of `??` in both SHA chains (a set-but-empty host
variable used to short-circuit them), SHA-shape validation in `next.config.ts`,
`workers_dev: false` so the site has no crawlable `*.workers.dev` twin, an exact
wrangler pin, `nosniff` on assets that never reach the Worker, and a CI step
running `cf:build`.

**Left undone, deliberately:** nothing asserts `public/_headers` automatically.
The E2E suite drives `next start`, not workerd, so the immutable-cache guarantee
rests on a manual preview. Closing it means a second Playwright config pointed at
`opennextjs-cloudflare preview` — worth doing, too large for this change.

## Out of scope

Defect #4 — `site-header.tsx` overflows 22px at 375px with a 32px root font, on
every route, WCAG 1.4.4. It is the only known defect on a product surface and it
is **not** fixed here. It is not a deploy blocker; it is the first thing after.

Phases 7-11. The `/dev/states` overflow and WebKit defects. Search Console
verification and sitemap submission — operator actions, documented not executed.
