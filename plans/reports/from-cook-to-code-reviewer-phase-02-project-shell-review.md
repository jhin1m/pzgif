# Phase 02 — Project Shell and Tooling: production-readiness review

Reviewer: code-reviewer · Date: 2026-08-05 · Mode: advisory, no files modified
Scope: entire working tree (zero commits; reviewed as a whole, not a diff)

Verification run locally: `pnpm typecheck` clean · `pnpm lint` clean · `pnpm test` 8/8 ·
`pnpm build` clean (4 routes, all static) · `pnpm check:static` pass · `pnpm check:forbidden` pass ·
production headers probed via `next start` · built CSS inspected · forbidden-guard coverage tested
against a synthetic fixture tree.

---

## Acceptance criteria scorecard

| # | Criterion | Verdict |
|---|---|---|
| 1 | No SAB/COOP/COEP; CI guard fails when added | **Partial** — guard fires on `src/**` (proved), blind to host header config and `vitest.config.mts` (C4) |
| 2 | Every route statically prerenderable; non-static fails build | **Partial** — true today; guard has a real false negative (C5) |
| 3 | Full §2.1+§2.2 token layer, 3-block order, `@theme inline`, `[data-theme]`, no FOUC | **Pass** — verified in built CSS (`--color-bg:var(--bg)`, `.bg-surface-1{background-color:var(--surface-1)}`) |
| 4 | next-intl as-needed / detection off / cookie off / `proxy.ts` / `[locale]` + generateStaticParams | **Pass** |
| 5 | registry.ts structure only, 9 tools + 5 Discord routes | **Pass** |
| 6 | AGPL surface incl. SHA-pinned source link + CI blocking non-public SHA | **Fail** — C3 |
| 7 | Content in `.md`/`.mdx`/`.json`, not `.tsx` | **Pass** (directory + README exist; content itself is Phase 9) |
| 8 | SW caches shell + `/wasm/*`, never ad/analytics | **Fail** — C1 |
| 9 | CSP `'wasm-unsafe-eval'` + `worker-src 'self' blob:`; `/wasm/*` immutable + version segment | **Pass (CSP)** / **Unverified (cache header)** — M11 |
| 10 | CI order forbidden→typecheck→eslint→vitest→build→static→playwright | **Pass** |
| 11 | tech-stack.md dated changelog, all six changes | **Pass**, with two un-updated contradictions left in §1 and §7 (M13) |
| 12 | CLAUDE.md accurate | **Pass**, one stale claim (M14) |
| — | Phase success criterion: hosting tier chosen and named, bandwidth modelled | **Fail** — still "Unresolved" in both docs (M13) |
| — | Phase success criterion: sitemap submitted day 1 | **Fail** — no `robots.ts`/`sitemap.ts` exists (M16) |

---

## Critical

### C1 — The offline promise is false on the only run that matters
`public/sw.js:28-30`

`install` does nothing but `skipWaiting()`. Nothing is precached. Registration is deferred to
`window.load` (`src/components/service-worker-registrar.tsx:30`), so on a first visit the document
and all its subresources are fetched **before** the SW controls the page. Nothing lands in the cache
on that first navigation.

Failure scenario (the exact one the copy invites): user opens `pzgif.com`, turns off wifi, reloads.
The navigation request now reaches the SW → `networkFirst` → `fetch` rejects → `caches.match` misses
→ rethrow → browser network-error page. Plan Goal 2 and the compressor FAQ both say this works.

`e2e/app-shell.spec.ts:88-90` was written around the bug — it inserts an extra **online** reload with
the comment "Give the shell one online navigation to populate the cache." The test therefore proves a
scenario nobody experiences and hides the one everybody does.

Fix: `event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)))` in `install`, where `SHELL` is
at minimum `["/"]`, plus an offline fallback (below, M12). Then delete the extra reload from the test.

### C2 — The 404 page is Next's unstyled default, not the localised one
`src/app/[locale]/not-found.tsx` · verified: `curl /nope` returns `<html>` (no `lang`) and the string
"This page could not be found".

There is no root layout and no `src/app/not-found.tsx`. `[locale]/not-found.tsx` only renders when
`notFound()` is thrown *inside* the `[locale]` subtree; every genuinely unmatched URL — the common
case, and the case crawlers hit — falls through to Next's built-in 404.

What breaks: no `lang` attribute (WCAG 3.1.1 failure on a real, indexable response), no stylesheet, no
theme boot script (always white, ignores the user's dark preference), no footer → **no AGPL source
link on that page**, and the `notFound.*` strings in `messages/en.json` are dead.

Fix (next-intl's documented pattern): add `src/app/not-found.tsx` rendering its own `<html>/<body>`,
plus `src/app/[locale]/[...rest]/page.tsx` calling `notFound()`. Note the interaction with C5/#2 —
the catch-all needs `export const dynamicParams = false` or an explicit `generateStaticParams`, or it
will turn dynamic.

---

## High

### H3 — `check-source-sha.mjs` does not prove the commit is public, and cannot fail
`scripts/check-source-sha.mjs:45-52` · `.github/workflows/ci.yml:68-82`

Three independent problems:

1. **Tautology.** The job runs only `if: github.ref == 'refs/heads/main'` with `fetch-depth: 0`, then
   asks `git branch -r --contains $GITHUB_SHA`. `actions/checkout` has just created
   `refs/remotes/origin/main` pointing at that SHA. The answer is always yes. There is no input for
   which this job fails on a push to main.
2. **Remote-tracking ≠ public.** A private repo produces identical refs. The check consults whatever
   `origin` the runner cloned, never `NEXT_PUBLIC_SOURCE_REPO_URL` — yet the error message names that
   URL, so a failure would point at the wrong repository.
3. **No deploy is gated.** There is no deploy step in CI. If hosting is Vercel's git integration
   (tech-stack §7), the deploy fires independently of this workflow and cannot be blocked by it.

Meanwhile `NOTICE:33-34`, `docs/infrastructure-runbook.md:64` and `LICENSE`-adjacent prose all assert
that this script "blocks any deploy whose commit is not pushed and publicly reachable". That is a
legal-facing claim the code does not back.

Fix: replace with an unauthenticated reachability probe against the canonical URL, e.g. in a clean
temp dir with no credentials in the environment:
`git init -q && git fetch -q --depth=1 "$NEXT_PUBLIC_SOURCE_REPO_URL" "$SHA"` — anonymous success is
the actual proof of "public". Then run it in the deploy pipeline, not in a decorative post-merge job.

### H4 — The forbidden-headers guard is blind to where COOP/COEP would actually be added
`scripts/check-forbidden-headers.mjs:20-29`

Empirically confirmed against a fixture tree: a `vercel.json` containing
`{"key":"Cross-Origin-Opener-Policy","value":"same-origin"}` and a `vitest.config.mts` containing
`Cross-Origin-Embedder-Policy` both pass; only the `src/**` `SharedArrayBuffer` was caught.

- Root-level `.json` is never scanned (`SCAN_DIRS` = src/scripts/public only). `vercel.json`,
  `netlify.toml`, Cloudflare Pages `_headers`, `wrangler.toml` — all invisible. These are the most
  likely places a future session adds isolation headers, since `next.config.ts` is guarded.
- `SCAN_FILES` lists `vitest.config.ts`; the file on disk is `vitest.config.mts`. Silently unscanned.
- `.github/workflows/*.yml` is unscanned (`.yml` not in `SCAN_EXTENSIONS`).
- `gifski-wasm/cloudflare` is banned in ESLint (`eslint.config.mjs:30`) but has no rule here.

Fix: scan repo root non-recursively for `*.json|*.toml|*.yml|*.yaml`, add `_headers`/`_redirects` by
exact name, glob `*.config.{ts,mts,cts,js,mjs,cjs}` instead of enumerating, and add the missing rule.

### H5 — `check-static-routes.mjs` will pass on the exact regression it exists to catch
`scripts/check-static-routes.mjs:39-45`

`prerendered` unions `prerender-manifest.dynamicRoutes` keys wholesale. That map holds *parameterised*
routes regardless of `fallback` mode. Confirmed on this build: `dynamicRoutes` = `["/[locale]"]`.

Failure scenario: Phase 9 adds `src/app/[locale]/[tool]/page.tsx` with `generateStaticParams()` over
the 14 registry slugs, and leaves `dynamicParams` at its default `true`. `/[locale]/[tool]` lands in
`dynamicRoutes` with `fallback: null` → the guard reports "all routes statically prerendered", while
every unlisted slug (`/anything-a-crawler-invents`) is server-rendered on demand, uncacheable at the
CDN, and unbounded.

Fix: for entries in `dynamicRoutes`, assert `fallback === false` (i.e. `dynamicParams = false`).
Secondary: the script prints "All 0 app route(s)…" and exits 0 if the manifest is empty or its shape
changes — assert a non-zero minimum. Tertiary: it reads `.next` from cwd, so a stale local build
passes; assert the build is newer than the last source change, or accept it as CI-only.

### H6 — Every copied shadcn component will use the reserved ad radius
Built CSS confirms `--radius-md:.375rem` (6px) survives from Tailwind's defaults.

`design-guidelines.md` §4.2: `--radius-ad` = **6px** = `rounded-md`, "Ad slots only. No product
element may use 6px. Treat 6px as a reserved word." shadcn's Button, Input, Select, Popover et al.
ship `rounded-md` by default. The token bridge in `globals.css:265-291` maps colours only — nothing
remaps radius, and shadcn's own `--radius` / `--radius-sm|md|lg|xl` chain is absent entirely.

So the moment Phase 3 copies a component, the binding ad-quarantine signal is broken, and it will be
broken identically on every subsequent `shadcn add`. Reviewing 20 components for one class name is
not a control.

Fix (pick one, in `globals.css` `@theme`): set `--radius-md: var(--radius-control)` (8px) and expose
the ad radius only as `rounded-ad`; or set `--radius-md: initial` so `rounded-md` stops existing and
copied components fail loudly. Either makes the rule mechanical.

Related, same block: shadcn's `--radius`, `--color-chart-1..5` and `--color-sidebar-*` are unmapped —
fine until a chart/sidebar component is copied, then those render on Tailwind fallbacks.

Also for Phase 3: `pnpm dlx shadcn add …` patches `globals.css` itself (it injects `:root`/`.dark`
variable blocks). With `components.json` at `"cssVariables": true` and `"baseColor": "neutral"`, the
CLI will try to write a competing token layer over the hand-ported one. Review every CLI diff, or add
components by hand.

### H7 — CI can be fully green while dark mode is silently dead
`e2e/app-shell.spec.ts:51-72`

The theme test asserts only that the `data-theme` attribute flips and survives a reload. It never
asserts that a *colour changed*. The single most-warned-about failure mode in this phase — dropping
`inline` from the bridge `@theme`, which makes Tailwind snapshot values at build time (phase file
line 86, `globals.css:16-18`, `CLAUDE.md:89-92`) — produces exactly this: attributes flip, colours
don't, all tests pass.

Fix: assert `getComputedStyle(document.body).backgroundColor` differs before/after the toggle and
matches the expected `--bg` in each theme. One assertion closes the whole class.

Adjacent CI-green-while-broken gaps: nothing asserts the footer source link resolves to a SHA;
nothing asserts the `/wasm/*` immutable header; nothing covers the 404 page (C2); the guard scripts
themselves have no tests despite `vitest.config.mts:12` already globbing `scripts/**/*.test.mjs`.

---

## Medium

### M8 — `messages/**` is licensed all-rights-reserved but the Program cannot run without it
`LICENSE-CONTENT:14,33-34` · `NOTICE:16-24` · `src/i18n/request.ts:13`

`LICENSE-CONTENT` claims "The Program will run without any of it." It will not: `request.ts` imports
`messages/${locale}.json` unconditionally and `getTranslations` throws on missing messages. The file
is not marketing prose — it is UI chrome (`theme.toggle`, `nav.skipToContent`, `footer.source`).

AGPL-3.0 §1 defines Corresponding Source as everything needed to generate, install and run the work.
Withholding the UI string table from AGPL means a recipient exercising their rights cannot produce a
running copy — the precise obligation the whole compliance surface exists to satisfy.

Fix: split `messages/` into `messages/ui/**` (AGPL, chrome strings) and `messages/content/**`
(LICENSE-CONTENT, marketing prose), or grant an explicit licence to use and modify `messages/` as
part of the Program while reserving the marketing copy. Cheap now, expensive after the repo is public.

### M9 — `WASM_VERSION` is duplicated with a "keep in sync" comment
`src/lib/site-config.ts:39` and `scripts/copy-wasm.mjs:22`

Bump one and not the other: `next.config.ts:124` sets `immutable, max-age=31536000` on `/wasm/v2/*`
while `copy-wasm.mjs` still writes to `public/wasm/v1/` → production 404s on the encoder, or (worse
ordering) serves a year-cached stale binary. A comment is not a control.

Fix: single source — a `wasm-version.mjs` (or `.json`) imported by both, or have the `.mjs` parse the
constant out of `site-config.ts`.

### M10 — `copy:wasm` is wired to nothing
`package.json:23` · `.gitignore:60` · `scripts/copy-wasm.mjs:14-16`

`.gitignore` excludes `public/wasm/**/*.wasm`, so binaries never enter the repo, and `copy:wasm` runs
in neither `pnpm build` nor CI. When Phase 4 lands the first encoder, the deployed site 404s on it and
the failure appears only at runtime in a browser. The script's own docstring claims it "keeps the
wiring, the destination directory and **the CI step** in place" — there is no CI step.

Fix: `"build": "node scripts/copy-wasm.mjs && next build"` (it is a no-op today), or add the step to
`ci.yml` before Build. Correct the docstring either way.

### M11 — The `/wasm/*` immutable header is unproven
`next.config.ts:121-131`. There is no file under `public/wasm/v1/` to serve, and a 404 in that path
returns `Cache-Control: private, no-cache, no-store` (verified). So criterion 9's second half is
asserted, not demonstrated — and `headers()` behaviour for `public/` assets differs across hosts
(Cloudflare Pages serves static assets from the edge, potentially bypassing Next's header rules; the
runbook flags this at `docs/infrastructure-runbook.md:49` but nothing verifies it).

Fix: ship a 1-byte `public/wasm/v1/probe.bin` and assert the header in `e2e/app-shell.spec.ts`, so the
contract is locked before a real binary depends on it.

### M12 — Service worker: no offline navigation fallback, unbounded cache, dead privacy list
`public/sw.js:17-26,53-78`

- **No offline fallback.** `networkFirst` rethrows on a cache miss. Offline navigation to any page not
  previously visited (including every client-side nav, which fetches `.rsc`) is a browser error page.
  Add a cached `/offline` shell or fall back to the cached `/`.
- **Unbounded, never versioned.** `CACHE = "pzgif-shell-v1"` is a hand-maintained constant nobody
  bumps on deploy, and `activate` only deletes *other* cache names. Every deploy adds a fresh set of
  hashed `_next/static` chunks that are never evicted. On a media app that also stores blobs, hitting
  the origin quota triggers eviction of the whole origin's storage. Key the cache on
  `NEXT_PUBLIC_COMMIT_SHA`, or prune entries not in the current shell on `activate`.
- **`NEVER_CACHE` is dead code.** Line 70 returns early for every cross-origin request, so
  `googlesyndication`/`doubleclick`/`googletagmanager`/`cookieyes`/… at lines 18-25 can never be
  reached. The privacy guarantee is real (via the origin check) but the list creates false confidence
  and omits the cases that *are* reachable: first-party analytics paths such as
  `/_vercel/insights/*`, `/_vercel/speed-insights/*`, `/cdn-cgi/*`. Turning on Vercel or Cloudflare
  analytics in Phase 10 would have the SW cache the beacon script and its responses — falsifying the
  strongest claim in the copy. Add those paths; keep the third-party fragments only if the origin
  check is ever loosened, and say so.
- Minor, non-blocking: `response.ok` correctly rejects `opaqueredirect` (status 0), so the classic
  "redirected response served by SW" TypeError is avoided. Verified `/en` → `/` is a 307, which is
  filtered.

### M13 — Two documents still contradict their own amendments; hosting tier unresolved
- `docs/tech-stack.md:16` §1 still lists monetization as "Ads (**Ezoic** → AdSense later)" while
  amendment #5 (line 141, 217) declares Ezoic unreachable. A fresh session reading §1 will plan
  against a void premise.
- `docs/tech-stack.md:157` §7 still says "**Vercel** (Hobby → Pro). Static-heavy site fits the free
  tier" while amendment #6 (line 201) and `infrastructure-runbook.md:33-35` say Hobby forbids
  commercial use and the tier is undecided.
- Phase success criterion "Hosting tier chosen and named, with bandwidth modelled against the infra
  budget" is **not met** — both documents leave it open. Step 16 asked for a decision, not a
  restatement of the options.

### M14 — Comments assert things that are no longer (or never were) true
- `src/app/[locale]/layout.tsx:51-52`: "The CSP carries a SHA-256 hash of this exact string" — false
  since the revert. This is the comment a future session will act on to "fix" the CSP.
- `src/lib/theme/theme-init-script.ts:6-10`: same claim, phrased as a MUST ("or the CSP will block
  the script").
- `next.config.ts:24-26`: `THEME_SCRIPT_HASH` is exported "so the CSP test can assert the trap stays
  closed" — nothing imports it; `e2e/app-shell.spec.ts:39` asserts the *absence* of any hash by regex.
  The constant is dead code, and it is the sole reason `next.config.ts` pulls `src/lib/theme/**` into
  the config module graph.
- `CLAUDE.md:73` "`[locale]/layout.tsx` IS the root layout" — accurate today, and directly implicated
  in C2; worth a pointer to the required `app/not-found.tsx`.

### M15 — The forbidden guard has no inline escape, so its first false positive will blunt it
`scripts/check-forbidden-headers.mjs:45-48,113-125` matches raw substrings on every line, comments
included. Phase 4's engine will very plausibly carry
`// single-thread build — no SharedArrayBuffer, so no COEP` in `src/lib/media/*`. CI then fails on
correct code, and the only escape is whole-file `ALLOWLIST` entry — which permanently exempts the one
file most likely to reintroduce the real thing.

Fix: support a line-level `// forbidden-check: allow <reason>` pragma, or skip `//`/`*`-prefixed lines
for the header-name rules while keeping identifier rules strict.

### M16 — Day-one SEO surface missing
No `src/app/robots.ts`, no `sitemap.ts`, no `alternates.canonical` in metadata. Phase 2's day-one
criterion is explicit: "Verify Search Console the same day and submit a sitemap, even a two-URL one."
Two files, ~20 lines, and they are the thing the whole 12-18 month thesis is timed against.
`check-static-routes.mjs:32-37` already exempts both paths, so the guard is ready for them.

### M17 — The AGPL source link degrades silently
`src/lib/site-config.ts:30-32` falls back to the repo root when `NEXT_PUBLIC_COMMIT_SHA` is empty, and
`next.config.ts:84-100` returns `""` on any failure. Nothing asserts a non-empty SHA in a production
build, so a host that injects none ships a non-version-accurate offer with no signal. Also
`https://github.com/pzgif/pzgif` is an unverified placeholder in two files — if the slug differs, the
footer link 404s and the offer is void. Fail the build when `NODE_ENV=production && CI` and the SHA is
empty.

---

## Low

- `/en` → `/` is a **307** (verified), not a 308. For a link-equity play, permanent is the right
  signal; next-intl does not expose this, so plan for `alternates.canonical` in Phase 9.
- Tailwind's default palette and type scale are not reset. `bg-red-500`, `text-2xl`, `rounded-3xl` all
  still resolve and bypass the token system entirely, against §2's "Do not introduce new hues" and
  §3.2's closed scale. `--color-*: initial;` / `--text-*: initial;` at the head of the `@theme` block
  makes the closed scale real. (Zero byte cost either way — v4 only emits used vars.)
- `--shadow-none` (§4.3, "Ad slots — enforced") not ported; Tailwind's `shadow-none` covers it, but the
  enforcement token named in the doc doesn't exist.
- `src/app/fonts.ts` omits `weight` for all three families — see deviation (c) below. Defensible, but
  the file's comment lists "rules carried over from §3.1" without mentioning the one rule it drops.
- Unused message keys: `nav.skipToContent|tools|discord|about`, `footer.allTools`. No skip link exists
  despite §7.2 making it the first tabbable node and the string being ready.
- `pnpm format:check` exists but is not in CI; `.prettierignore` excludes `docs/`, `plans/`,
  `CLAUDE.md`, `README.md`, so the largest prose surface is unformatted by policy.
- `next.config.ts:92-98` shells out to `git rev-parse` on every config load, including `next start` in
  the production container. Guard it on `process.env.NODE_ENV !== "production"`.
- CI does not cache Playwright browsers (~1-2 min/run).

---

## Deviations from the phase file — assessed

**(a) CSP script hash reverted to `'unsafe-inline'` — correct, keep it.**
The reasoning is right and matches CSP Level 3: once a hash or nonce appears in `script-src`,
`'unsafe-inline'` is ignored for everything not hashed/nonced, and Next's per-page
`self.__next_f.push` RSC payload scripts cannot be enumerated in a static global header. Nonces force
per-request rendering, which contradicts criterion 2. There is no option that keeps every route
statically prerendered *and* drops `'unsafe-inline'`.

Two things that would genuinely tighten it at zero rendering cost, neither taken:
- `script-src-attr 'none'` — blocks inline event handlers and `javascript:` URLs, which `'unsafe-inline'`
  currently permits and which Next never emits. This is the majority of what `'unsafe-inline'` costs you.
- `require-trusted-types-for 'script'` + `trusted-types default` — the modern DOM-XSS mitigation that
  composes with `'unsafe-inline'`. Worth scheduling before Phase 4 starts writing DOM code, not after.

Residual risk is genuinely low here: no server-rendered user input, no query-param echo, no database.
Recommend keeping the decision, adding `script-src-attr 'none'`, and fixing the three stale comments
in M14 so the next session does not "restore" the hash.

**(b) `upgrade-insecure-requests` removed, HTTPS pushed to Cloudflare — correct today, revisit at Phase 10.**
The WebKit loopback behaviour is real and the diagnosis was empirical. With `default-src 'self'` there
is no cross-origin subresource to upgrade, so UIR buys nothing *right now* — that is the load-bearing
half of the argument and it is sound. Two gaps worth writing down:
- It stops being true the moment Phase 10 adds ad/CMP origins to `script-src`/`frame-src`/`connect-src`.
  Add "re-evaluate UIR when third-party origins enter the CSP" to Phase 10's checklist.
- Vercel/Cloudflare *preview* deployments are not behind the production Cloudflare zone, so they get
  neither UIR nor HSTS. Acceptable for previews; note it.
The runbook (`:18-26`) documents the edge requirement but does not specify HSTS `max-age`,
`includeSubDomains` or preload — pin those values there so "Turn on HSTS" is not a judgement call.

**(c) `next/font` weights omitted — accept, document it.**
All three families are variable on Google Fonts, so omitting `weight` ships one variable file per
family instead of 2-4 static cuts. For Hanken Grotesk (4 weights specified) that is very likely fewer
bytes, not more; for the other two it is roughly a wash and buys the full range. Real cost: nothing
now prevents an off-scale weight (§3 forbids display below 0.875rem and implies a closed weight set),
and §3.1 is a locked document being silently deviated from. Keep the deviation; state it explicitly in
`src/app/fonts.ts` with the byte rationale, and add the weight rule to Phase 3's component review.

**(d) shadcn partial init — the colour bridge works, the radius bridge does not.**
Verified in the built CSS: `@theme inline` correctly emits `--color-background`, `--color-foreground`,
`--color-primary`, `--color-border`, `--color-input`, `--color-ring`, `--color-accent` etc. as live
`var()` indirections, and `@custom-variant dark (&:where([data-theme="dark"] *))` compiles. A copied
shadcn component *will* inherit the PZGIF palette and dark mode with no per-component patching. The
two deliberate re-points (`accent` → `--primary-subtle`, `input` → `--border-control`) are correct for
shadcn's actual usage.

What does not carry over: radius (H6, blocking for Phase 3), `--color-chart-*` and `--color-sidebar-*`
(unmapped, harmless until used), and the CLI's habit of rewriting `globals.css` on `add` (H6 note).
`src/lib/utils.ts` is the standard `cn`, correct. `components.json` is coherent for Tailwind v4
(`tailwind.config: ""`), and `lucide-react` + `radix-ui` are installed to match.

---

## Things that hold up

Recorded only where it changes risk calibration, not as praise:

- `src/lib/tools/registry.ts` is genuinely structure-only. `name` fields are nav labels, not marketing
  copy; the prose in the file is rationale in comments. 9 + 5 confirmed by `registry.test.ts`, and the
  tests check the things that actually rot (related-slug existence, self-reference, slug shape).
- The three-block CSS order is correct and *verified in output*, not assumed — `.bg-surface-1` emits
  `var(--surface-1)`, `--color-bg: var(--bg)` survives to `:root`. Every §2.1 primitive and every §2.2
  semantic token is present and matches the source values, both themes, including the three deliberate
  §7.1 deviations (`--text-ad-label` at neutral-500, `--accent-700`, the split `--primary-fill-hover`).
  No component reaches for a primitive: `page.tsx`, `site-footer.tsx`, `theme-toggle.tsx` and
  `not-found.tsx` use only bridged semantics (`bg-surface-1`, `text-fg-secondary`, `border-line`,
  `text-brand`, `rounded-card`, `rounded-control`).
- CSP is served correctly on every path including 404s and `/sw.js`; `worker-src 'self' blob:` and
  `'wasm-unsafe-eval'` both present, `'unsafe-eval'` absent.
- `useSyncExternalStore` over a `MutationObserver` on `data-theme` is the right shape for a
  boot-script-owned attribute — no duplicated state, no hydration mismatch, no reintroduced flash.
- `tech-stack.md`'s changelog covers all six amendments accurately with sources cited.

---

## Recommended order of work

1. C1 service worker precache + offline fallback, and delete the compensating reload from the e2e test.
2. C2 root `not-found.tsx` (+ `[locale]/[...rest]`), coordinated with the H5 guard fix.
3. H3 rewrite `check-source-sha.mjs` as an anonymous fetch and gate the actual deploy — or downgrade
   the claims in `NOTICE` and the runbook to match what the code does.
4. H6 remap `--radius-md` before Phase 3 copies its first component.
5. H4 + H5 guard coverage; H7 computed-colour assertion.
6. M8 messages licence split — before the repo goes public.
7. M13 reconcile tech-stack §1/§7 and land an actual hosting decision; M16 robots + sitemap for day one.
8. M14 stale comments — cheap, and they are the ones that will cause a future regression.

## Unresolved questions

1. What is the canonical repo slug? `pzgif/pzgif` is hard-coded as a default in two files and printed
   in a legal-facing error message; if it is wrong the AGPL source offer 404s.
2. Is the deploy trigger CI-driven or host-git-integration? H3's fix differs entirely between the two.
3. Are `messages/**` strings intended as product copy (moat) or UI chrome (Program)? M8's fix depends
   on the answer, and the answer should be recorded in `LICENSE-CONTENT` either way.
4. Phase 10 will add third-party origins to the CSP. Should `upgrade-insecure-requests` come back at
   that point, or is Cloudflare "Always Use HTTPS" considered sufficient for mixed-content risk?
