# Handoff — PZGIF Bootstrap → Planning

From: `/ak:bootstrap --full` (session 2026-08-04)
To: next session, entering at **Step 5 — Planning**
Repo: `/Users/jhin1m/Desktop/ducanh-project/vngif` · git `main` · Next.js not yet scaffolded

---

## Start here

```
/ak:plan --hard Build the PZGIF MVP — 9 browser-native GIF tools + Discord preset pages.
Read docs/tech-stack.md and docs/design-guidelines.md first; both are approved and locked.
```

Read in this order before planning anything:
1. `docs/tech-stack.md` — **approved, locked.** Includes a "rejected alternatives" table; do not reopen those.
2. `docs/design-guidelines.md` — **approved, locked.** Design tokens, component states, ad rules, a11y.
3. `docs/wireframe/*.html` — visual source of truth. **Microcopy in these files is production copy, reuse it.**
4. `plans/reports/research-260804-2230-*.md` — 5 research reports backing every decision.

---

## Product in one paragraph

**PZGIF** (`pzgif.com` — confirmed available 2026-08-04, .net and .io also free, not yet purchased) is an ezgif.com competitor for a global/English audience. The free tier runs **entirely in the browser** — no upload, no account. Money comes from display ads first, a Pro tier and a GIF-specific developer API later. The strategy is long-tail SEO compounding over 12-18 months, not a fast payoff.

## Decisions locked by the user (do not re-litigate)

| Decision | Value |
|---|---|
| Monetization | Hybrid: ads + Pro + API. **Payment integration deferred past MVP** — design the hook points only |
| Market | Global/English first; `next-intl` wired from day 1, English-only content at MVP |
| Processing | Free = client-side. Pro/API = server-side, **Phase 2+, out of MVP scope** |
| Client pipeline | mp4box.js → WebCodecs → OffscreenCanvas/Worker → **gifski-wasm**. `ffmpeg.wasm` single-thread is a lazy-loaded fallback only |
| Stack | Next.js App Router + TypeScript, Tailwind v4, shadcn/ui, pnpm |
| Infra budget | $20-50/mo |
| Content policy | Free tier is unmoderatable by design (client-side). Pro tier requires ToS + TTL auto-delete + moderation |
| MVP scope | 9 tools + Discord preset pages, 2-4 weeks |
| Brand | PZGIF. Logo deferred — ship a text wordmark, do not block on it |
| Timeline expectation | User accepted: Year-1 revenue realistically $300-800/mo |

### The 9 MVP tools (user-ratified)
gif compressor · resize gif · crop gif · gif→mp4 · mp4→gif · reverse gif · gif speed changer · split gif to frames · webp→gif
Plus Discord preset pages: emoji · sticker · banner · avatar.

---

## The one constraint that governs everything

**No page may be cross-origin isolated.** `COEP: require-corp` breaks Google ad serving (confirmed in Google's own Publisher Tag docs), and `COEP: credentialless` is unsupported in Safari with no shipping plan. Multi-threaded `ffmpeg.wasm` needs `SharedArrayBuffer`, which needs isolation — so it is out.

The chosen pipeline (WebCodecs + single-threaded gifski-wasm) needs no `SharedArrayBuffer` and therefore no COEP. Ads and processing coexist on every page.

> If any proposal introduces `SharedArrayBuffer`, `COOP`, or `COEP`, it is breaking the ad revenue model. Reject it.

---

## SEO strategy — this is the business, not a side quest

**Target** (winnable by a new domain in 6-12 months): `gif to mp4`, `resize gif`, `gif compressor`, `crop gif`, `reverse gif`, `gif speed changer`, `split gif`, `webp to gif`, `gif for discord`.

**Never target**: `gif maker`, `video to gif` — ezgif/Adobe/Canva own these, and chasing them wastes the whole content budget.

Every tool page must ship a working tool **plus** genuine explainer copy. Google's 2025 scaled-content-abuse enforcement punished template-only pages, and the penalty is site-wide, not per-page. Launch programmatic pages in batches of 20-50 and watch Search Console before scaling.

**Differentiators, in order of sharpness:**
1. **gifski output quality** — competitors use naive JS encoders (`gif.js`/`gifenc`); the difference is visible. The before/after slider exists to prove it. This is differentiator #1 and the reason gifski-wasm is non-negotiable.
2. **Discord/Slack presets** — underserved keyword cluster, real user pain (the 256 KB limit with no useful error message). The "size budget bar + auto-fit search" UI in `discord-preset.html` has no competitor equivalent.
3. **Developer API** (Phase 3) — no cheap GIF-specialized API exists; Cloudinary/Transloadit are overkill and expensive.
4. Privacy/no-upload — good marketing, but ~5 new 2026 competitors already claim it. Not a moat.

---

## Must-do before writing any product code

1. **Benchmark spike — highest priority.** Measure the real WebCodecs → gifski-wasm path: 10s 720p MP4 → GIF, on desktop Chrome, desktop Safari, and a mid-range Android. Every timing estimate so far is extrapolated from fps figures, never measured. This gates: the free-tier size/duration limits, the FAQ speed claim, and whether the architecture holds at all.
2. **Container coverage check.** Determine which containers WebCodecs + mp4box cannot demux — that number decides how often the heavy `ffmpeg.wasm` fallback actually loads.
3. **Verify Discord's current limits** (emoji 256 KB, sticker 512 KB, banner 680×240, avatar) against Discord's live docs. The preset page's entire promise rests on these numbers and they change.

## Known copy risk

`tool-compressor.html` FAQ contains "under ten seconds on a current laptop". **Unverified.** Cut it or confirm it with item 1 above before any page ships.

---

## Deferred to later phases (do not build in MVP)

Server tier (Cloud Run + R2 + pg-boss/Neon + Turnstile) · user accounts (Better Auth) · payments (Polar — Vietnam payout confirmed supported, resolves the Stripe-VN blocker) · the public API · additional languages · logo.

**Permanent design constraint:** no public sharing, gallery, or hosted-result links — ever, without a deliberate re-decision. Keeping stored files private keeps the service in the EU DSA's lighter "hosting service" class rather than the far heavier "online platform" class, and avoids DMCA and AdSense copyright exposure.

## Compliance work that must land before ads go live

Terms of Service · Privacy Policy (disclosing ad personalization + cookies) · Cookie Policy · Acceptable Use Policy · About page with real identity (an E-E-A-T trust signal AdSense reviewers look for) · a **Google-certified CMP** with Consent Mode v2 (without it, EEA/UK ads are non-personalized or blocked — a 50-70% RPM loss).

Launch on **Ezoic**, not AdSense. AdSense near-certainly rejects a day-1 thin tool site as "low value content"; apply after 10-20 genuine content pages are indexed.

---

## Repo state at handoff

```
docs/tech-stack.md                approved, locked
docs/design-guidelines.md         approved, locked (613 lines)
docs/wireframe/                   5 HTML pages + wireframe.css — visual source of truth
docs/wireframes/                  8 PNG screenshots (desktop + mobile)
plans/reports/                    5 research reports
.gitignore                        Next.js-ready
```

Nothing is committed yet. No `package.json`, no Next.js scaffold — planning comes first.

## Suggested next-session sequence

`/ak:plan --hard` → benchmark spike as Phase 1 → `/ak:cook` → `/ak:test` → `/ak:code-review`

Consider writing a project-level `CLAUDE.md` early: the global `~/.claude/CLAUDE.md` describes an unrelated Laravel manga project and will actively mislead a fresh session working in this repo.

---

## Unresolved

1. WebCodecs → gifski real-device performance — unmeasured, gates everything (see must-do 1).
2. Which video containers force the `ffmpeg.wasm` fallback — unknown.
3. Discord's current size limits — unverified.
4. Ezoic's auto-placement may override manual ad slots; the reserved-slot CLS technique is implemented but unproven until a real ad script runs.
5. `pzgif.com` not yet purchased.
6. Live Cloud Run pricing — search-derived, verify before committing the Phase-2 budget.
