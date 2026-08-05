# PZGIF — Implementation Research: Discord Presets, Next.js Shell, SEO, Ads, Analytics

Date: 2026-08-04 · All live-source checks performed 2026-08-04 unless noted.
Constrained by (LOCKED): `docs/tech-stack.md`, `docs/design-guidelines.md`.
Contradictions with those docs are flagged **CONFLICT** and not silently accommodated.

**Three findings that change the plan:**

1. **`design-guidelines.md` §10 preset chip values are partly wrong.** Sticker limit is 512 KB not 256 KB; "Banner 680×240" matches **no** Discord surface. See §A.7 verdict.
2. **Ezoic requires 250,000+ monthly active users since 2026-02-19.** PZGIF cannot use Ezoic at launch. `tech-stack.md` §6 ("Ezoic accepts new/small tool sites") is out of date. See §D.
3. **FAQ rich results were fully removed from Google Search on 2026-05-07** and the docs deleted 2026-06-15. `design-guidelines.md` §10 "FAQ accordion (schema.org `FAQPage`)" buys nothing now. Keep the FAQ UI, drop the JSON-LD. See §C13.

---

# A. Discord / Slack asset limits — VERIFIED AGAINST LIVE DOCS

Method: `support.discord.com` blocks normal fetching (403). Retrieved article bodies through the Zendesk Help Center JSON API (`/api/v2/help_center/en-us/articles/{id}.json`), which returns the canonical article body plus its `updated_at`. Developer docs fetched from `docs.discord.com` (note: `discord.com/developers/docs/*` now 301s to `docs.discord.com/developers/*`).

## A.1 Sources and freshness

| Source | URL | Article `updated_at` |
|---|---|---|
| How to Add Custom Emojis on Discord | https://support.discord.com/hc/en-us/articles/360036479811 | 2026-07-30 |
| Tips for Sticker Creators FAQ | https://support.discord.com/hc/en-us/articles/4402687377815 | 2026-07-23 |
| Custom Stickers FAQ | https://support.discord.com/hc/en-us/articles/4403089981975 | 2026-08-04 |
| Server Banners | https://support.discord.com/hc/en-us/articles/360028716472 | 2026-08-04 |
| Server Boosting FAQ (perk table) | https://support.discord.com/hc/en-us/articles/360028038352 | 2026-08-04 |
| Custom Profiles (avatar/banner) | https://support.discord.com/hc/en-us/articles/4403147417623 | 2026-08-03 |
| API: Emoji resource | https://docs.discord.com/developers/resources/emoji | live |
| API: Sticker resource | https://docs.discord.com/developers/resources/sticker | live |
| Discord blog: sticker how-to | https://discord.com/blog/how-to-create-upload-your-own-stickers-on-discord | live |
| Slack: custom emoji | https://slack.com/help/articles/206870177 | live |

Last verified: **2026-08-04**.

## A.2 Custom emoji

| Property | Value | Source |
|---|---|---|
| Max file size | **256 KB** ("Emojis must be under 256KB in size"); API says "256 KiB" | Support 360036479811 + API emoji |
| Upload dimensions | **128×128** — API: the endpoint takes "the 128x128 emoji image". Discord downscales larger uploads; Emoji Studio lets the user crop/zoom | API emoji + Support |
| Accepted formats (UI) | **JPEG, PNG, GIF, WEBP** | Support 360036479811 |
| Accepted formats (API) | JPEG, PNG, GIF, **WebP, AVIF** | API emoji |
| Static slots | 50 per server by default | Support |
| Animated slots | +50 animated (total 100) — support article attributes this to **"Nitro or Nitro Basic"** | Support 360036479811 FAQ |
| Using emoji off-server | Requires the **user** to have Nitro | Support |
| Name rules | ≥2 chars, alphanumeric + underscore only | Support |

**Ambiguity to note (do not assert either way in UI copy):** the Custom Emoji article says extra animated slots come from Nitro/Nitro Basic, while the Server Boosting FAQ perk table lists emoji slots purely by Boost Level (L1 +50 → 100, L2 +50 → 150, L3 +100 → 250) with no static/animated split. Both articles were updated within the last two weeks. **Preset UI must not state a gating rule.** Say only "Discord custom emoji · 128×128 · under 256 KB".

**Practical target for PZGIF:** output 128×128, **≤ 256 KB**, animated GIF. This is a genuinely hard constraint (256 KB for an animated 128×128 GIF) and is exactly where gifski + palette reduction earns its keep. This is differentiator #1 made visible.

## A.3 Custom sticker

| Property | Value | Source |
|---|---|---|
| Max file size | **512 KB** (API: "max 512 KiB") | Support 4402687377815 + API sticker + Discord blog |
| Dimensions | **320×320 exactly** — not "max", exact. Renders at 160×160 dp in chat | Support 4402687377815 |
| Static format | **PNG** | Support |
| Animated formats | **APNG** (support article) — **and GIF**: the API says users may upload "PNG, APNG, GIF, or Lottie JSON"; the Discord blog says "PNG for static stickers, APNG or GIF for animated stickers" | API sticker + Discord blog |
| Lottie | Upload restricted to guilds with the `VERIFIED` and/or `PARTNERED` feature | API sticker |
| Animation length | **max 5 seconds** | API sticker |
| Frame rate | **max 60 FPS** | Support 4402687377815 |
| Slots | 5 free on every server; Boost L1 +10 (15), L2 +15 (30), L3 +30 (60) | Support 4403089981975 + Boosting FAQ |
| Transparency | Recommended; sticker should fill the canvas | Support |

**Source conflict, resolved:** the *Tips for Sticker Creators* support article lists only PNG/APNG. The API reference and Discord's own product blog both list GIF. Two independent Discord-owned sources beat one stale help article — **treat GIF as accepted**, but design the preset to also offer APNG output as a fallback path, and never promise GIF stickers in an H1 (put it in FAQ body text where a correction is cheap).

**This is commercially important.** A "GIF → Discord sticker" tool that emits a valid 320×320, ≤512 KB, ≤5 s, ≤60 FPS animation is a real long-tail keyword with a hard technical constraint — precisely PZGIF's wedge. Note the 5 s and 60 FPS caps are **not** in `design-guidelines.md` and must be added to the preset constraint UI.

## A.4 Server banner and server icon

| Property | Value | Source |
|---|---|---|
| Server banner dimensions | **960×540, 16:9** (recommended). A 1920×1080 upload is auto-resized | Support 360028716472 |
| Server banner formats | image **or GIF** | Support 360028716472 |
| Server banner max size | **unverified** — the article states no byte limit. Widely repeated 10 MB is *not* from a Discord source | — |
| Static server banner gating | Boost **Level 2** (7 boosts), or a Discord **Partner** server | Support + Boosting FAQ |
| Animated server banner gating | Boost **Level 3** (14 boosts) | Support + Boosting FAQ |
| Animated banner behaviour | Animates 5 s on guild load, then pauses; re-animates on re-entering the viewport; animates on hover; does **not** animate under reduced motion | Support 360028716472 |
| Design guidance | Keep the top 48 px clear (server title overlays it); avoid logos/text | Support 360028716472 |
| Animated server **icon** gating | Boost **Level 1** (2 boosts) | Boosting FAQ |
| Server icon dimensions | **unverified** — no Discord-authored figure found. Community consensus 512×512 | — |

**The 5-second animate-then-pause behaviour is a UX fact worth surfacing in the preset copy**: for a server banner, only the first ~5 s of the GIF is ever seen on load. That is a defensible reason to offer a "trim to 5 s" default — real user value, not filler.

## A.5 User avatar and user profile banner

| Property | Value | Source |
|---|---|---|
| Avatar formats | **PNG and GIF** | Support 4403147417623 |
| Animated avatar gating | **Nitro subscribers only** can upload animated GIF avatars | Support 4403147417623 |
| Avatar dimensions | **unverified** — the Custom Profiles article gives none. API renders avatars at 128×128 by default in CDN URLs; community consensus is 128×128 upload | — |
| Avatar max file size | **unverified** — no Discord-authored figure. It is **not** 256 KB; that number belongs to emoji only | — |
| Profile banner (user) | Nitro-gated. **Dimensions not documented by Discord.** Community consensus **600×240** | — |
| Server *profile* banner | The Server Profile article describes the server-profile banner as a **colour tile selection**, not an image upload — do not build a preset for it | Support 30715364399511 |

Discord genuinely does not publish avatar/profile-banner pixel or byte limits. Any number the preset shows is community-derived. Handle this honestly: label the avatar preset **"128×128 (recommended)"** and the profile banner **"600×240 (community standard — Discord does not publish an official size)"**, or drop the profile-banner preset from MVP.

## A.6 Slack custom emoji (future preset — brief)

| Property | Value | Source |
|---|---|---|
| Max file size | **under 128 KB** | slack.com/help/articles/206870177 |
| Formats | JPG, PNG, **GIF** | same |
| Animated GIF frames | **max 50 frames** | same |
| Dimensions | "square images" recommended; **no pixel limit published**. Slack renders at 128×128 | same |
| Per-workspace cap | not documented in that article | — |

The **50-frame** cap is the interesting constraint and is not something competitors surface. A "GIF → Slack emoji" preset that does frame-dropping to ≤50 frames *and* ≤128 KB is a differentiated page. Note Slack's 128 KB budget is half of Discord's — do not share a single "256 KB" constant across presets.

## A.7 VERDICT on `docs/design-guidelines.md` §10 and on `docs/wireframe/discord-preset.html`

§10 currently reads: *"preset chips (Emoji 128×128 / Sticker 320×320 / Banner 680×240 / Avatar 128×128), a live 'target size' readout that must land under 256 KB"*.

The wireframe uses a different set: *Emoji 128×128 ≤256 KB · Sticker 320×320 ≤512 KB · Server icon 512×512 ≤10 MB · Profile banner 680×240 ≤10 MB*.

**Neither set is fully right. The wireframe is closer. Per preset:**

| Preset | design-guidelines §10 | wireframe `discord-preset.html` | Correct (verified 2026-08-04) | Verdict |
|---|---|---|---|---|
| **Emoji** | 128×128, 256 KB | 128×128, ≤256 KB | **128×128, <256 KB** | Both **CORRECT**. Ship as-is. |
| **Sticker** | 320×320, 256 KB | 320×320, ≤512 KB | **320×320 exact, ≤512 KB, ≤5 s, ≤60 FPS** | §10 byte limit is **WRONG** (256→512 KB). Wireframe is **RIGHT** on bytes but **both omit the 5 s and 60 FPS caps**, which are hard rejection criteria. |
| **Banner** | "Banner 680×240", 256 KB | "Profile banner 680×240, ≤10 MB" | Server banner **960×540 16:9**; user profile banner **600×240 (community, undocumented)** | **680×240 matches no Discord surface.** Almost certainly a corruption of the community 600×240 profile-banner figure. §10's 256 KB is also wrong. The wireframe's 10 MB is **unverified** — Discord publishes no byte limit for either banner. |
| **Avatar / server icon** | "Avatar 128×128", 256 KB | "Server icon 512×512, ≤10 MB" | Avatar: 128×128 recommended, **byte limit undocumented**. Server icon: **dimensions undocumented**, community 512×512 | Dimensions are defensible community values; **the 256 KB in §10 is wrong** and the 10 MB in the wireframe is **unverified**. |

**Loud call-outs:**

1. **`680×240` is wrong wherever it appears** — in `design-guidelines.md` §10 and in `docs/wireframe/discord-preset.html`. Replace with `960×540` (server banner) and/or `600×240` (profile banner, labelled unofficial). This is the single most damaging error: a preset that outputs 680×240 produces a file Discord will letterbox or crop on every upload, and the page's whole promise ("Fits Discord ✓") becomes a lie users can verify in ten seconds.
2. **The blanket "must land under 256 KB" in §10 is wrong.** 256 KB is the emoji limit only. Sticker is 512 KB; Slack emoji is 128 KB; banners/avatars have no published byte limit. The size budget must be **per preset**, not a global constant. Implement as a per-preset config object, not a shared `MAX_BYTES`.
3. **Missing constraints that will cause real upload rejections:** sticker **≤5 s** and **≤60 FPS**; Slack emoji **≤50 frames**; server banner animates only ~5 s on load. Add all four to the preset constraint UI.
4. `design-guidelines.md` §10's binary success line — *"Fits Discord's 256 KB limit ✓"* — must become preset-parameterised, e.g. *"Fits Discord's sticker limit: 320×320, 480 KB / 512 KB ✓"*.

**Recommended preset config (single source of truth, replaces the §10 chip list):**

```ts
// lib/presets/discord.ts — every number below traces to a source in §A.1
export const DISCORD_PRESETS = {
  emoji: {
    label: 'Discord emoji',
    width: 128, height: 128, maxBytes: 256_000,
    formats: ['gif', 'png', 'webp'],
    note: 'Animated emoji upload rules vary by server plan.',
  },
  sticker: {
    label: 'Discord sticker',
    width: 320, height: 320, exactDimensions: true, maxBytes: 512_000,
    maxDurationSec: 5, maxFps: 60,
    formats: ['gif', 'apng', 'png'],
    note: 'Dimensions must be exactly 320x320.',
  },
  serverBanner: {
    label: 'Discord server banner',
    width: 960, height: 540, aspect: '16:9', maxBytes: null, // undocumented
    formats: ['gif', 'png', 'jpeg'],
    note: 'Only the first ~5s animates on server load. Keep the top 48px clear.',
  },
  profileBanner: {
    label: 'Discord profile banner',
    width: 600, height: 240, maxBytes: null,       // both undocumented
    formats: ['gif', 'png'],
    note: 'Discord does not publish an official size; 600x240 is the community standard.',
    unofficial: true,
  },
  avatar: {
    label: 'Discord avatar',
    width: 128, height: 128, maxBytes: null,       // undocumented
    formats: ['gif', 'png'],
    note: 'Animated (GIF) avatars require Nitro.',
  },
} as const;

export const SLACK_PRESETS = {
  emoji: {
    label: 'Slack emoji',
    width: 128, height: 128, maxBytes: 128_000, maxFrames: 50,
    formats: ['gif', 'png', 'jpeg'],
  },
} as const;
```

Where `maxBytes: null`, the preset should target a sane default (e.g. 2 MB) and phrase the success criterion as *"Well under Discord's limit"* rather than asserting a number PZGIF cannot verify. **Never render an unverified number as a hard "limit".**

**Editorial rule going forward:** these numbers move. Put the verification date in a code comment next to the config and re-verify the four support articles before each preset-page content refresh — the emoji article changed as recently as 2026-07-30 and the sticker/banner articles on 2026-08-04.

---

# B. Next.js App Router project shell

## B.7 Versions (all read from the npm registry 2026-08-04, not guessed)

| Package | `latest` | Published | Note |
|---|---|---|---|
| `next` | **16.3.0** | 2026-08-03 | canary 16.3.1-canary.1 |
| `react` / `react-dom` | **19.2.8** | 2026-07-21 | Next 16 App Router runs a React canary on top of 19.2 |
| `tailwindcss` | **4.3.3** | 2026-07-16 | + `@tailwindcss/postcss` 4.3.3 |
| `next-intl` | **4.13.5** | 2026-08-04 | released same day as this research |
| `shadcn` (CLI) | **4.16.1** | 2026-07-31 | `npx shadcn@latest` |
| `eslint-config-next` | **16.3.0** | 2026-08-03 | ESLint **flat config** by default in 16 |
| `typescript` | **7.0.2** | 2026-07-08 | see risk note below |

**Next.js 16 hard requirements** (https://nextjs.org/blog/next-16): Node.js **≥20.9.0** (Node 18 dropped), TypeScript **≥5.1**, browsers Chrome/Edge/Firefox **111+**, Safari **16.4+**.

**TypeScript 7 — adoption risk, do not take `latest` blind.** TS 7.0 is the native (Go) compiler port. Next.js 16 documents a *minimum* of 5.1 and says nothing about a tested maximum. The Next.js type plugin, `eslint-config-next`, and much of the shadcn/Radix type surface are validated against the TS 5.x line. **Recommendation: pin `typescript: ~5.9` for MVP** and revisit TS 7 once Next.js documents support explicitly. A solo dev debugging compiler-port edge cases is pure YAGNI cost. Mark this an explicit, revisitable decision — not an oversight.

### Known incompatibilities: App Router + Tailwind v4 + shadcn/ui

**None blocking.** Verified points:

- Turbopack (default bundler in 16) **processes PostCSS configs** in a Node worker pool — explicitly listed as supported, "Useful for Tailwind, Autoprefixer, etc." (https://nextjs.org/docs/app/api-reference/turbopack). Tailwind v4 via `@tailwindcss/postcss` therefore works with zero config on the default bundler.
- Turbopack uses **Lightning CSS**, which supports modern nesting and `oklch()`. The `design-guidelines.md` §2 palette (all `oklch()`, `color-mix(in oklch, …)`) is fine.
- **Two real gotchas inherited from Lightning CSS**, both relevant to the locked design system:
  1. **Decimal precision is 5 digits** (webpack was 10). Affects computed `line-height` / `letter-spacing`. The §3.2 type scale uses explicit values, so impact is nil — but do not expect byte-identical CSS to a webpack build.
  2. Legacy CSS Modules features are unsupported (standalone `:local`/`:global`, `@value`, `composes` from a plain `.css`). Irrelevant — the design system is token/utility-based, not CSS Modules.
- Tailwind v4 **is designed for modern browsers** and uses bleeding-edge CSS. Its floor is roughly Safari 16.4 / Chrome 111 — which is *exactly* Next.js 16's floor. Convenient: one browser support matrix, no conflict.
- shadcn/ui with Tailwind v4 requires the **`@theme inline`** pattern with `:root`/`.dark` moved **outside** `@layer base` (https://ui.shadcn.com/docs/tailwind-v4). `design-guidelines.md` §2.2 already specifies `@theme inline` mapping semantic tokens — this is the correct v4 shape and needs no change.
- **One divergence to decide deliberately:** shadcn's v4 convention is a `.dark` class; `design-guidelines.md` §2.2 locks `[data-theme="dark"]` on `<html>`. The locked doc wins. When adding shadcn components, either add `@custom-variant dark (&:where([data-theme=dark] *));` to `globals.css` so `dark:` utilities resolve against the attribute, or strip `dark:` variants from copied components. **Do this once in `globals.css`; do not patch components one by one** (DRY).

### `tailwind.config.js` — confirmed dropped

Tailwind v4 is **CSS-first**. The official Next.js install guide (https://tailwindcss.com/docs/installation/framework-guides/nextjs) lists only: install packages → create `postcss.config.mjs` → `@import "tailwindcss"` in `globals.css`. **No `tailwind.config.js` step exists.** Theme lives in `@theme` inside CSS. (A JS config can still be loaded via `@config` for migrations — irrelevant for a greenfield project; do not create one.)

### Exact init commands (pnpm)

```bash
pnpm dlx create-next-app@latest pzgif --typescript --eslint --app --use-pnpm
cd pzgif

# Tailwind v4
pnpm add tailwindcss @tailwindcss/postcss postcss

# shadcn/ui (writes components.json, wires aliases + base tokens)
pnpm dlx shadcn@latest init

# i18n
pnpm add next-intl

# pin TS to the 5.x line (see risk note above)
pnpm add -D typescript@~5.9
```

`postcss.config.mjs`:

```js
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
export default config;
```

`app/globals.css` — real v4 shape, wired to the locked token system:

```css
@import "tailwindcss";

/* dark mode is attribute-driven per design-guidelines §2.2, not class-driven */
@custom-variant dark (&:where([data-theme=dark] *));

/* 1. primitives — design-guidelines §2.1 (abridged; copy the full block from the doc) */
@theme {
  --color-primary-700: oklch(53.5% 0.216 265.4);
  --color-primary-800: oklch(47.7% 0.220 266.1);
  --color-accent-500:  oklch(62.5% 0.107 187.5);
  --color-neutral-0:   oklch(100%  0     0);
  --color-neutral-50:  oklch(98.2% 0.003 264.5);
  --color-neutral-900: oklch(21.0% 0.032 264.7);
  /* …full palette per §2.1 */

  --font-display: var(--font-display), ui-sans-serif, system-ui, sans-serif;
  --font-sans:    var(--font-sans),    ui-sans-serif, system-ui, sans-serif;
  --font-mono:    var(--font-mono),    ui-monospace, monospace;

  --radius-ad:      6px;    /* reserved word — ad slots only, §4.2 */
  --radius-control: 8px;
  --radius-card:    16px;
}

/* 2. semantic tokens — design-guidelines §2.2. Plain CSS vars, NOT inside @theme. */
:root {
  --bg:             var(--color-neutral-0);
  --surface-1:      var(--color-neutral-50);
  --surface-ad:     var(--color-neutral-50);
  --text:           var(--color-neutral-900);
  --primary:        var(--color-primary-700);
  --primary-fill:   var(--color-primary-800);
  --accent:         var(--color-accent-500);
  /* …full set per §2.2 */
}

[data-theme="dark"] {
  --bg:           var(--color-canvas-dark);
  --surface-1:    var(--color-surface-dark);
  /* …full set per §2.2 */
}

/* 3. expose semantics as Tailwind utilities. `inline` = resolve at use site,
      so the same utility flips with [data-theme]. */
@theme inline {
  --color-bg:         var(--bg);
  --color-surface-1:  var(--surface-1);
  --color-surface-ad: var(--surface-ad);
  --color-fg:         var(--text);
  --color-brand:      var(--primary);
}

@media (prefers-reduced-motion: reduce) { /* per §6 */
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

The three-block ordering (`@theme` primitives → plain-CSS semantics → `@theme inline` bridge) is the part people get wrong. Without `inline`, Tailwind snapshots the value at build time and dark mode silently stops working.

**Also note for Next.js 16:** `next lint` was **removed**; `next build` no longer runs ESLint. CI must call `eslint` directly. This changes the `tech-stack.md` §7 CI chain (`typecheck → lint → vitest → build → playwright`) — the lint step must now be an explicit `pnpm eslint .`, not a side effect of build.

## B.8 next-intl: prefix-less English now, no rewrite later

**Recommendation: use i18n routing from day 1, with a `[locale]` segment and `localePrefix: 'as-needed'`.** English serves at `/gif-compressor` (no prefix); locale #2 later adds `/de/gif-compressor` and **changes zero existing URLs**.

Ranked against the alternatives:

| Option | English URL | Cost to add locale #2 | SEO risk | Verdict |
|---|---|---|---|---|
| **`[locale]` + `localePrefix: 'as-needed'`** | `/gif-compressor` | Add locale to `routing.locales`, add message file. **No URL changes.** | None | **Recommended** |
| `[locale]` + `localePrefix: 'always'` | `/en/gif-compressor` | None | Extra path segment on every URL forever; `/` must redirect to `/en`, adding a hop to the highest-value entry point | Rejected |
| No i18n routing (next-intl single-locale mode) | `/gif-compressor` | Must introduce `[locale]`, physically restructure `app/`, re-verify every route | Low if done before traffic; rising fast after | Acceptable but strictly worse — same end state, deferred cost |

**Why prefix-less for the default locale is the SEO-correct answer here:**

- Google states no preference between URL structures for internationalisation; hreflang is what communicates the relationship (https://developers.google.com/search/docs/specialty/international/localized-versions). There is no ranking penalty for a prefix-less default.
- The decisive factor is **link equity continuity**. PZGIF's entire strategy is 12–18 months of long-tail accretion. Any scheme that forces a mass URL migration at locale #2 means mass 301s on exactly the pages that have accumulated rankings. `as-needed` makes that migration a no-op.
- Secondary: a prefix-less URL is shorter and matches the competitor shape (`ezgif.com/optimize`), which marginally helps CTR and manual link-sharing.
- `tech-stack.md` §3 already mandates i18n "wired from day 1"; this satisfies it at the lowest cost.

```ts
// src/i18n/routing.ts
import {defineRouting} from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en'],           // add 'de', 'es', … later — nothing else changes
  defaultLocale: 'en',
  localePrefix: 'as-needed', // default locale is prefix-less
});
```

```ts
// next.config.ts
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: no `output: 'export'` — see B.9
};

export default withNextIntl(nextConfig);
```

Routes live at `app/[locale]/gif-compressor/page.tsx`, with:

```ts
export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}
```

Verified config surface (https://next-intl.dev/docs/routing/configuration): `localePrefix` accepts `'always'` (**the default**), `'as-needed'`, `'never'`; `localeCookie` defaults to a **session** cookie for GDPR reasons and can be set to `false`; `localeDetection: false` disables `Accept-Language` negotiation; **`alternateLinks` defaults to on** — next-intl's proxy automatically emits `Link: rel="alternate" hreflang=…` headers including `x-default`. See C14 for why you should still not rely on that alone.

**Two settings to get right at MVP:**
- `localeDetection: false` while there is one locale. Auto-negotiation with a single locale is pure overhead and can produce surprising redirects for bots.
- `localeCookie: false` at MVP. A cookie set before consent is a needless CMP complication (§D18), and with one locale it stores nothing useful. Re-enable with locale #2.

**Next.js 16 note:** `middleware.ts` is renamed **`proxy.ts`** (exported function `proxy`), running on the Node runtime. `middleware.ts` still works but is deprecated and slated for removal. Write `proxy.ts` from the start:

```ts
// proxy.ts
import createMiddleware from 'next-intl/middleware';
import {routing} from './src/i18n/routing';

export default createMiddleware(routing);

export const config = {
  // never intercept assets, ad/analytics paths, or metadata routes
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
```

## B.9 Static export vs SSG-on-Vercel — **recommend default output, NOT `output: 'export'`**

The site *is* 100% static shells + client WASM, so `output: 'export'` looks like the obvious fit. It is the wrong call, for one decisive reason and several supporting ones.

**Decisive:** `output: 'export'` does **not support Proxy/middleware** (https://nextjs.org/docs/app/guides/static-exports). next-intl's `as-needed` prefix-less routing *requires* the proxy to rewrite `/gif-compressor` → `/en/gif-compressor`. Choosing static export forces `localePrefix: 'always'` (`/en/…` forever) or no i18n routing at all — i.e. it forces exactly the future rewrite B.8 exists to avoid. **Static export and the locked i18n requirement are mutually exclusive.**

Full unsupported list under `output: 'export'`: Dynamic Routes with `dynamicParams: true`, Dynamic Routes without `generateStaticParams()`, Route Handlers that read `Request`, `cookies()`, **Rewrites, Redirects, Headers**, **Proxy**, ISR, `next/image` default loader, Draft Mode, Server Actions, Intercepting Routes.

| Dimension | `output: 'export'` | Default output on Vercel | Winner |
|---|---|---|---|
| next-intl `as-needed` | **Impossible** (no proxy) | Works | Default |
| Static pages | Yes — HTML per route | Yes — prerendered at build, CDN-cached identically | Tie |
| `headers()` in config (CSP, `X-Robots-Tag`) | **Unsupported** — must configure at Cloudflare | Supported in `next.config.ts` | Default |
| Redirects (tool renames, old slugs) | **Unsupported** | Supported | Default |
| `next/image` optimisation | Custom loader required | Built in | Default |
| Host portability | Any static host | Vercel-shaped (or an adapter) | Export |
| Cost | Free anywhere | Free on Hobby for this workload | Tie |

`tech-stack.md` §7 already locks Vercel. Vercel prerenders SSG routes to the edge CDN — the LCP/TTFB profile is indistinguishable from a static export for these pages. Static export would trade away proxy, headers and redirects to buy portability that the locked stack does not want.

**Recommendation: omit `output` entirely.** Keep every page statically prerenderable (no `cookies()`/`headers()` in tool pages) so the build emits static shells. Verify per-route in the build output; treat any tool page that is not statically prerendered as a build failure.

Also leave **`cacheComponents`** off. It is Next 16's new opt-in `"use cache"` / PPR model; a site with zero server data has nothing to cache. Enabling it only adds the `generateMetadata` dynamic-vs-cached rules described in the metadata docs. YAGNI.

## B.10 Web Workers + WASM under Turbopack

**Turbopack is the default bundler in Next.js 16** for both `dev` and `build`. Opt out with `next dev --webpack` / `next build --webpack`. **`next dev --turbopack` is no longer a flag you need** — it is the default, and it does **not** break workers. The premise of the question is now inverted: webpack is the opt-out.

**Worker instantiation — the `new URL` form is explicitly supported.** Per https://nextjs.org/docs/app/api-reference/turbopack, Turbopack recognises `new Worker()` expressions (and magic comments in them, incl. `turbopackIgnore`), the same detection strategy webpack uses. Static `import` statements are *not* treated as worker entry points.

```ts
// components/use-encoder.ts  ('use client')
const worker = new Worker(
  new URL('../workers/encode.worker.ts', import.meta.url),
  { type: 'module' }
);
```

**The WASM part is where it actually breaks — and it was fixed in 16.2.**

| Version | Behaviour |
|---|---|
| ≤16.1 | Workers were bootstrapped via a `blob://` URL ⇒ `location.origin` was empty ⇒ `fetch()`/`importScripts()` inside the worker could not resolve relative URLs. This is exactly the failure mode WASM libraries hit (vercel/next.js#84782, closed). |
| **≥16.2** | Worker bootstrap rewritten: "the `origin` correctly points to your domain name, and relative fetches succeed. This should unblock anyone who had trouble running WASM code inside a Worker in previous versions." (https://nextjs.org/blog/next-16-2-turbopack) |

Since the pinned version is **16.3.0**, this is fixed. **Do not pin below 16.2 under any circumstances** — the entire client pipeline (`gifski-wasm`, `@jsquash/*`, the `@ffmpeg/core` fallback) lives inside a worker and fetches `.wasm`.

**Remaining sharp edge:** Turbopack does not reliably resolve a `.wasm` **asset** referenced as `new URL('x.wasm', import.meta.url).href`. Robust pattern, independent of bundler behaviour:

```ts
// workers/encode.worker.ts
import initGifski from 'gifski-wasm';

// absolute, origin-anchored URL — works in both worker and main-thread contexts
// and survives asset-resolution differences between Turbopack and webpack.
const WASM_URL = new URL('/wasm/gifski_bg.wasm', self.location.origin).href;

await initGifski({ locateFile: () => WASM_URL });
```

Ship the `.wasm` binaries from **`public/wasm/`** (served verbatim, long-cacheable, no bundler involvement) rather than letting the bundler emit them. This is the KISS option and removes a whole class of Turbopack-vs-webpack divergence. Trade-off: no content-hash in the filename, so set an explicit version segment (`/wasm/v1/gifski_bg.wasm`) when you upgrade the library.

**Config knobs worth knowing:**
- `experimental.turbopackWorkerAssetPrefix` — custom asset prefix for Web Worker URLs (entrypoint + module chunks), mirroring webpack's `output.workerPublicPath`. Needed only if assets are served from a different origin than the document. Not needed for the Vercel + Cloudflare setup.
- Turbopack does **not** support webpack **plugins** (loaders are supported). Any WASM tooling that ships a webpack plugin has no Turbopack path — another reason to keep `.wasm` in `public/` and avoid bundler integration entirely.

**Cross-check against the locked architecture:** none of this reintroduces `SharedArrayBuffer`, `COOP` or `COEP`. `tech-stack.md` §2's rule holds — single-threaded `gifski-wasm` in a plain (non-isolated) worker needs no cross-origin isolation, so ad serving is unaffected.

**Verify with a spike before writing the phase files.** `tech-stack.md` §Unresolved #1 already flags that the WebCodecs→gifski path is unbenchmarked. Fold the Turbopack worker+WASM boot into that same spike: one page, one worker, one real encode, on Next 16.3. It de-risks two unknowns for the price of one.

---

# C. SEO machinery

## C11. Metadata for 13 near-identical pages without tripping scaled content abuse

**Google's exact wording** (https://developers.google.com/search/docs/essentials/spam-policies): *"Scaled content abuse is when many pages are generated for the primary purpose of manipulating search rankings and not helping users."* Listed examples: using generative AI "to generate many pages without adding value for users"; scraping/synonymising/translating content "where little value is provided to users".

**Read the policy precisely: the trigger is the pair (many pages) × (no added value).** 13 pages is not "many". Every PZGIF tool page ships a *working tool* — a functional artefact, not text. The realistic exposure is not scaled content abuse at 13 pages; it is **doorway pages** (near-duplicate pages funnelling to the same destination) and plain **thin content**, and it becomes real at 50–200 preset/format permutations, which is exactly where this site is headed by month 12.

So the guardrails matter now, cheaply, before the page count grows.

**What actually differentiates these pages — ranked by weight:**

| Differentiator | Weight | Concrete rule for PZGIF |
|---|---|---|
| **The tool genuinely differs** | Highest | Different controls, different defaults, different output. A "crop GIF" page whose UI is a resize page with the word swapped **is** a doorway. If two presets differ only by a number, they belong on **one** page with a chip selector, not two URLs. |
| **Task-specific body content** | High | The §10 requirement of ≥400 words of H2/H3 explainer per page is right — but it must be *about that task*: real failure modes, real numbers, real format trade-offs. Templated prose with the tool name swapped is the exact thing the policy names. |
| **Unique title + description** | Medium | Hand-written per page. Not `${tool} — PZGIF` from a loop. |
| **Distinct FAQ answers** | Medium | Questions that only make sense for that tool ("Why does my GIF get bigger after resizing?"). |
| **Internal linking that reflects real relationships** | Medium | "Related tools" chosen per page, not a shared footer blob. |
| **Measured evidence** | Underrated | §1 principle 4 (before/after with real byte counts) is a differentiator crawlers can see in the static HTML. Emit the example numbers in the SSG HTML, not only after a run. |

**Hard rule for the 4 Discord preset pages:** each must carry preset-specific constraints that genuinely differ (emoji 256 KB/128×128 vs sticker 512 KB/320×320/5 s/60 FPS vs banner 960×540). Per §A they *do* differ substantially — good. But the moment a fifth preset differs only by pixel dimensions from an existing one, it goes on an existing page as a chip. Write that rule into the content playbook now.

**Metadata implementation** (typed, per-page, no template loop):

```ts
// app/[locale]/gif-compressor/page.tsx
import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Compress GIF — Reduce GIF File Size Online',
  description:
    'Shrink animated GIFs in your browser with gifski-quality output. No upload, no account. See the exact before/after file size.',
  alternates: {canonical: '/gif-compressor'},
};
```

```ts
// app/[locale]/layout.tsx — set once
export const metadata: Metadata = {
  metadataBase: new URL('https://pzgif.com'),
  title: {template: '%s | PZGIF', default: 'PZGIF — Browser-native GIF tools'},
};
```

`metadataBase` is what lets every page use relative `canonical` paths. Without it, a relative URL in a metadata field is a **build error** (verified in the generateMetadata reference). Set it in the root layout, once.

Use the **static `metadata` object**, not `generateMetadata`, for the 13 fixed pages. The docs are explicit: *"If metadata doesn't depend on request information, it should be defined using the static `metadata` object."* Static export also sidesteps the streaming-metadata behaviour entirely (with streaming, late-resolving metadata is appended to `<body>` for JS-executing bots — fine for Googlebot, but there is no reason to invite it here).

## C12. `sitemap.ts` and `robots.ts` — exact shapes

Both are Route Handlers cached by default (verified against the 16.3.0 docs). Both work with prerendering.

```ts
// app/sitemap.ts
import type {MetadataRoute} from 'next';

const BASE = 'https://pzgif.com';

const TOOLS = [
  'gif-compressor', 'resize-gif', 'crop-gif', 'gif-to-mp4', 'mp4-to-gif',
  'reverse-gif', 'gif-speed-changer', 'split-gif-to-frames', 'webp-to-gif',
];

const PRESETS = [
  'discord-emoji-maker', 'discord-sticker-maker',
  'discord-banner-maker', 'discord-avatar-maker',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {url: BASE, lastModified: now, changeFrequency: 'weekly', priority: 1},
    ...TOOLS.map((s) => ({
      url: `${BASE}/${s}`, lastModified: now,
      changeFrequency: 'monthly' as const, priority: 0.8,
    })),
    ...PRESETS.map((s) => ({
      url: `${BASE}/${s}`, lastModified: now,
      changeFrequency: 'monthly' as const, priority: 0.7,
    })),
  ];
}
```

Full type (16.3.0):

```ts
type Sitemap = Array<{
  url: string
  lastModified?: string | Date
  changeFrequency?: 'always'|'hourly'|'daily'|'weekly'|'monthly'|'yearly'|'never'
  priority?: number
  alternates?: { languages?: Languages<string> }
}>
```

**`lastModified: new Date()` at build time is a trap.** Every deploy stamps every URL as "just modified". Google learns the signal is noise and discounts it. Use a real per-page content date:

```ts
// content/tool-meta.ts
export const CONTENT_UPDATED: Record<string, string> = {
  'gif-compressor': '2026-08-04',   // bump only when the page's copy actually changes
};
```

`robots.ts`:

```ts
// app/robots.ts
import type {MetadataRoute} from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {userAgent: '*', allow: '/'},
    sitemap: 'https://pzgif.com/sitemap.xml',
    host: 'https://pzgif.com',
  };
}
```

MVP needs nothing more — there are no private paths, no result URLs (all processing is client-side), no query-parameter surfaces. The `X-Robots-Tag: noindex` rules in `tech-stack.md` §8 apply only once the Phase 2 server tier creates result URLs. **Do not pre-build disallow rules for routes that do not exist** (YAGNI).

`generateSitemaps` (for splitting at Google's 50,000-URL limit) is available but irrelevant at 14 URLs. Note for later: in **v16.0.0 the `id` param became a Promise** (`props.id` must be awaited). New in **v16.3.0**: `robots.ts` gained an `other` field for non-standard per-agent directives.

## C13. schema.org — what to actually emit

**State of play, verified:**

| Type | 2026 status | Emit? |
|---|---|---|
| `FAQPage` | **Dead.** Deprecation notice 2025-05-08; stopped appearing in Google Search **2026-05-07**; docs removed **2026-06-15**; Search Console report + Rich Results Test support withdrawn (API consumers had until Aug 2026) | **No** |
| `HowTo` | **Dead.** Removed from mobile (Aug 2023) then desktop | **No** |
| `SoftwareApplication` | Live, rich-result eligible — **but** requires `name`, `offers.price`, **and** `aggregateRating` *or* `review` | **Yes, without ratings** — see below |
| `BreadcrumbList` | Live, still rendered in results | **Yes** |
| `WebSite` (+ `Organization`) | Used for site-name generation in results (https://developers.google.com/search/docs/appearance/site-names) | **Yes, home page only** |

**Recommendation, in emit order:**

1. **`BreadcrumbList` on every tool/preset page.** The only structured data here that still produces a visible SERP feature. Cheap, zero risk.
2. **`SoftwareApplication` (or its `WebApplication` subtype) on every tool page — with `offers.price: 0` and *no* rating.** `WebApplication` is the more accurate type for a browser tool and inherits everything.
3. **`WebSite` + `Organization` on the home page.** Feeds site-name and entity understanding; supports the E-E-A-T/About-page argument in `tech-stack.md` §8.
4. **Nothing else.**

**On `SoftwareApplication` without a rating — deliberate, and the honest choice.** Google requires `aggregateRating` or `review` for *rich result eligibility*. PZGIF has no reviews at launch. Inventing them is a structured-data spam violation and risks a manual action against a site whose entire model is organic search — catastrophic downside for a cosmetic upside. So: emit the markup, accept no rich result, gain the entity/understanding benefit. **Revisit only if genuine user ratings are ever collected.** Do not let a future audit "fix" this by adding synthetic ratings.

**On `FAQPage`:** `design-guidelines.md` §10 mandates *"FAQ accordion (schema.org `FAQPage`)"`. **CONFLICT — the schema half is now obsolete.** The markup is harmless but returns nothing; per YAGNI, don't ship it. **Keep the FAQ UI and content exactly as specified** — the visible Q&A still earns long-tail impressions, feeds AI/LLM answer surfaces, and §5.12's `hidden="until-found"` requirement (so answers stay crawlable and find-in-page works) remains correct and valuable. Only the JSON-LD goes.

```tsx
// components/seo/tool-jsonld.tsx  (server component; render inside the page)
export function ToolJsonLd({name, description, path}: {
  name: string; description: string; path: string;
}) {
  const base = 'https://pzgif.com';
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${base}${path}#app`,
        name,
        description,
        url: `${base}${path}`,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Any',           // browser-native
        browserRequirements: 'Requires JavaScript and WebAssembly',
        offers: {'@type': 'Offer', price: 0, priceCurrency: 'USD'},
        // no aggregateRating: no real reviews exist. Do not fabricate.
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${base}${path}#breadcrumb`,
        itemListElement: [
          {'@type': 'ListItem', position: 1, name: 'Home', item: base},
          {'@type': 'ListItem', position: 2, name, item: `${base}${path}`},
        ],
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{__html: JSON.stringify(graph)}}
    />
  );
}
```

Note `applicationCategory: 'MultimediaApplication'`. Google's documented examples (`GameApplication`, `BusinessApplication`, …) are illustrative, not an enum; `MultimediaApplication` is a valid schema.org value and the honest one.

## C14. Canonical + hreflang that survives locale #2

**Google's rules** (https://developers.google.com/search/docs/specialty/international/localized-versions):
- Annotations must be **bidirectional and self-referential**: *"If two pages don't both point to each other, the tags will be ignored."*
- `x-default` is the fallback for unmatched language settings — optional but recommended.
- Three delivery methods — **HTML `<link>`, HTTP `Link:` header, XML sitemap** — are *"equivalent from Google's perspective"*. Pick one.
- Single-language sites do not need hreflang at all.

**MVP (one locale): emit a self-referential canonical and nothing else.** No hreflang, no `x-default`. Emitting hreflang for one language is noise.

```ts
alternates: {canonical: '/gif-compressor'}
// → <link rel="canonical" href="https://pzgif.com/gif-compressor" />
```

**The design decision that avoids rework** is to centralise URL construction now, so locale #2 is a one-file change:

```ts
// lib/seo/alternates.ts
import {routing} from '@/src/i18n/routing';

export function alternatesFor(path: string) {
  const languages =
    routing.locales.length > 1
      ? Object.fromEntries(
          routing.locales.map((l) => [
            l,
            l === routing.defaultLocale ? path : `/${l}${path}`,
          ]),
        )
      : undefined;                       // omitted entirely while single-locale

  return {
    canonical: path,                     // prefix-less default locale (B.8)
    ...(languages && {languages: {...languages, 'x-default': path}}),
  };
}
```

Every page calls `alternates: alternatesFor('/gif-compressor')`. Adding `'de'` to `routing.locales` makes hreflang appear on all 14 pages, correctly, with **zero page edits**. Self-referential and bidirectional fall out automatically because both sides are generated from the same function.

**One trap to avoid:** next-intl's proxy emits hreflang **`Link:` HTTP headers** by default (`alternateLinks: true`). Combined with the HTML `<link>` tags above, that is two sources of truth for the same claim — a classic drift bug. **Set `alternateLinks: false` in `defineRouting` and own hreflang in the Metadata API only.** Google treats the methods as equivalent, so there is no cost, and HTML tags are far easier to inspect and test.

Mirror the same data into `sitemap.ts` via `alternates.languages` only if you later prefer the sitemap method — **do not do both**.

## C15. Core Web Vitals: INP is the real risk

**INP thresholds** (https://web.dev/articles/inp), measured at the **75th percentile** of page loads:

| Rating | INP |
|---|---|
| Good | **≤ 200 ms** |
| Needs improvement | 201–500 ms |
| Poor | > 500 ms |

INP decomposes into **input delay** (before handlers run) → **processing duration** (handlers) → **presentation delay** (until the next frame paints).

**The specific risk for PZGIF, stated plainly:** any WASM work on the main thread blocks it for hundreds of ms to seconds. A single main-thread `gifski` encode would put INP deep into "poor" for every interaction during the job. On a site whose whole strategy is organic search, and where CWV is a ranking input, that is self-inflicted.

`tech-stack.md` §4 already mandates OffscreenCanvas + Web Workers ("Mandatory — never block the main thread"). **This is the load-bearing decision for INP, not a performance nicety.** The guardrails below exist to keep it true under pressure.

**Guardrails — enforce in code review:**

| Risk | Guardrail |
|---|---|
| Decode/encode creeping onto the main thread | **No** `gifski`/`@jsquash`/`ffmpeg` import outside `workers/`. Enforce with an ESLint `no-restricted-imports` rule scoped by path — mechanical, not vigilance. |
| Transferring frame data by copy | Use **transferables** (`ArrayBuffer`, `ImageBitmap`, `OffscreenCanvas`) in `postMessage`. A structured clone of a 1080p frame buffer *is* a long task on the main thread. |
| Worker → UI message storms | Progress messages **throttled to ≤10/s**. §5.7 forbids transitions on the progress fill, so each message is a synchronous style+layout write; hundreds per second inflate presentation delay. This also satisfies §7.5's live-region throttle. |
| Long tasks during file load | `createImageBitmap()` and `File.arrayBuffer()` off the main thread where possible; never `FileReader.readAsDataURL` on a 150 MB input. |
| Ad script contention | Third-party ad JS is a top INP contributor. See D19 — load it `afterInteractive` and never during an active job. |
| Hydration cost | Keep tool pages Server Components with small `'use client'` islands. A large client bundle inflates input delay on the *first* interaction, which is often the dropzone click — the conversion action. |

**What to measure (do this from day 1, it is nearly free):**

1. **Field data is the only thing that counts.** INP is a 75th-percentile *field* metric; lab Lighthouse does not report it meaningfully. Wire the `web-vitals` library (`attribution` build) and send INP/LCP/CLS to GA4 as events. The attribution build names the *element* and *event type* responsible — that is what turns "INP is 340 ms" into a fix.
2. **CrUX via Search Console's Core Web Vitals report**, once traffic exists. Authoritative, but lagging ~28 days.
3. **A Playwright assertion on real encode work** — `tech-stack.md` §7 already requires real encode assertions in E2E. Add a long-task assertion: during a fixture encode, **no main-thread task > 200 ms**. This catches an accidental main-thread regression at CI time rather than 28 days later in CrUX.

Budgets to adopt: **INP ≤ 200 ms (p75)** including during an active encode; **CLS < 0.1** (already locked in `design-guidelines.md` §1 principle 5 and §8.2); **LCP ≤ 2.5 s** on the dropzone.

**Open risk, flagged:** `design-guidelines.md` §Open Question 4 notes no real CLS measurement exists for the ad + dropzone layout. Add INP-during-encode to that same measurement task — both need the ad script live, and both are currently unmeasured assumptions.

---

# D. Ads + consent

**Framing change (accepted):** the ad network is undecided, and per D17 Ezoic is unreachable at launch regardless. So the deliverable here is **an abstraction that makes the network a config swap**, plus an honest ranking of who will actually take a brand-new tool site in 2026.

**CONFLICT with `tech-stack.md` §6.** It locks *"Ads at launch: **Ezoic** (accepts new/small tool sites)"*. That premise is false as of 2026-02-19. §6 needs amending. Nothing else in the locked stack depends on the choice of network — which is precisely why the abstraction below is worth building.

## D16. The network-agnostic AdSlot interface

**Design goal:** `design-guidelines.md` §5.10 + §8 specify the *visual and placement law* for ad slots. None of that is network-specific. Only three things are network-specific: (1) which script loads, (2) what the container element must look like for the script to find it, (3) how a fill is requested. Isolate exactly those three.

**The invariant that makes this work:** every network in D17 fills a **pre-existing `<div>` identified by `id` or `data-*`**. None of them require a specific React component. So the reserved container is ours, and the provider only supplies the id-shape and the fill call.

```ts
// lib/ads/types.ts
export type SlotName =
  | 'result-rect'      // 300x250, below result panel
  | 'content-inline'   // 336x280, in the SEO explainer
  | 'rail'             // 300x600, >=1280px only
  | 'anchor'           // 320x50, mobile, conditional
  | 'below-grid';      // 336x280, homepage

export type SlotSize = {w: number; h: number};

export interface AdProvider {
  /** Stable id for debugging / analytics. */
  readonly id: 'none' | 'ezoic' | 'adsense' | 'mediavine' | 'gam';
  /** <head>/<body> scripts. Rendered by the root layout. */
  Scripts(): React.ReactNode;
  /** The DOM id the network's script expects on the reserved container. */
  containerId(slot: SlotName): string;
  /** Extra attributes the network requires on the container (AdSense needs several). */
  containerAttrs?(slot: SlotName, size: SlotSize): Record<string, string>;
  /** Ask the network to fill an already-rendered container. Client-side only. */
  fill(slot: SlotName, size: SlotSize): void;
  /** Release/cleanup on unmount or route change. Optional. */
  release?(slot: SlotName): void;
}
```

```ts
// lib/ads/config.ts — the swap point. One env var.
import {noneProvider} from './providers/none';
import {ezoicProvider} from './providers/ezoic';
import {adsenseProvider} from './providers/adsense';

const PROVIDERS = {
  none: noneProvider,
  ezoic: ezoicProvider,
  adsense: adsenseProvider,
} as const;

export const adProvider =
  PROVIDERS[(process.env.NEXT_PUBLIC_AD_PROVIDER ?? 'none') as keyof typeof PROVIDERS];
```

**What is network-agnostic (ours, never duplicated per provider):**

| Concern | Owner | Source of truth |
|---|---|---|
| Reserved box dimensions, `contain: layout size` | `<AdSlot>` | design-guidelines §5.10 |
| 6px radius, flat fill, 1px border, no shadow | `.ad-slot` CSS | §4.2, §5.10 |
| "Advertisement" label + its contrast | `.ad-slot::before` | §5.10, §7.1 |
| 24px clearance from primary actions | `margin-block` | §8 rule 3 |
| Which slots exist on which page type, at which breakpoint | slot map | §8.1 |
| Mobile anchor ⟷ sticky action bar mutual exclusion | `<AdSlot>` render logic | §9 |
| Consent gating (no fill before consent in EEA/UK) | `<AdSlot>` + CMP | §D18 |
| Never fill before a result exists (`result-rect`) | `<AdSlot>` prop | §8.1 |
| Tab order: ad iframes last in their region | DOM order | §7.2 |

**What is network-specific (the only code that changes on a swap):** the `<script>` tags, the container `id` convention, and the `fill()` call. That is ~20 lines per provider.

**Provider: `none` (MVP default).** Renders the reserved box with the label and nothing else. This is not a stub — it is how the layout ships and how CLS gets measured *before* any network is chosen, closing `design-guidelines.md` §Open Question 4 without a contract.

```ts
export const noneProvider: AdProvider = {
  id: 'none',
  Scripts: () => null,
  containerId: (slot) => `ad-${slot}`,
  fill: () => {},
};
```

**Provider: Ezoic** (kept, as one implementation — verified mechanics, even though D17 says it is unreachable now).

Ezoic's JS "standalone" integration (https://docs.ezoic.com/docs/ezoicads/integration/, https://docs.ezoic.com/docs/ezoicadsadvanced/advanced/):
- Container convention: `<div id="ezoic-pub-ad-placeholder-101"></div>`, where the number is a placement ID created in the Ezoic dashboard.
- Fill: `ezstandalone.cmd.push(function () { ezstandalone.showAds(101); });`
- Advanced form takes objects: `ezstandalone.showAds([{id: 103, required: true, sizes: ['336x280']}, …])`, with `mobile_sizes` / `tablet_sizes` / `desktop_sizes` variants and a `refreshAds()` for dynamic content.
- **`required` controls density behaviour**: per Ezoic's docs, *"id-less ads default to `required: true`, meaning the ad serves even past the page's automatic ad-density cap."* Setting `required: false` lets Ezoic skip a slot when its density limit is hit.
- **Ads never stack: one `showAds` call per spot.**

**Answer to `design-guidelines.md` Open Question #1 ("Ezoic's Ad Tester may override manual placements"):** Ezoic's docs show the mechanism for constraining it, and it is a two-part answer.

1. **Never call `ezstandalone.showAds()` with no arguments.** Ezoic's docs state that calling it bare *"will call the function for every placeholder that exists on that page."* Always pass explicit ids: `showAds(101)` or the object array. This is the code-side control and it is fully within our hands.
2. **The dashboard side is the part manual code cannot enforce.** Ezoic's automatic placeholder insertion is a dashboard-level feature; I could **not verify the exact toggle name or that it can be fully disabled** from the public docs. Treat "Ezoic will respect only our declared placeholders" as **unverified**.

Consequence for the slot map: `design-guidelines.md` §8.1 assumes manual control holds. With explicit `showAds(ids)` the *declared* slots behave. Whether Ezoic injects *additional* ones is a dashboard question to settle with Ezoic support **before** signing — and it is now a lower-priority question, since Ezoic is not the launch network.

```ts
// lib/ads/providers/ezoic.ts
const SLOT_IDS: Record<SlotName, number> = {
  'result-rect': 101, 'content-inline': 102, rail: 103,
  anchor: 104, 'below-grid': 105,
};

export const ezoicProvider: AdProvider = {
  id: 'ezoic',
  Scripts: () => (
    <>
      <Script src="https://cmp.gatekeeperconsent.com/min.js" strategy="afterInteractive" />
      <Script src="https://the.gatekeeperconsent.com/cmp.min.js" strategy="afterInteractive" />
      <Script src="//www.ezojs.com/ezoic/sa.min.js" strategy="afterInteractive" />
    </>
  ),
  containerId: (slot) => `ezoic-pub-ad-placeholder-${SLOT_IDS[slot]}`,
  fill: (slot) => {
    window.ezstandalone = window.ezstandalone || {};
    window.ezstandalone.cmd = window.ezstandalone.cmd || [];
    // explicit id — never bare showAds()
    window.ezstandalone.cmd.push(() => window.ezstandalone.showAds(SLOT_IDS[slot]));
  },
};
```

**Ezoic integration modes, for the record:** Ezoic supports a **Cloudflare/nameserver** integration (edge-level optimisation via the Cloudflare app) and a **JavaScript** integration. Ezoic's own guidance is that **JavaScript is the recommended method** for connecting the ad environment — "the most stable and compatible ad delivery" — with Cloudflare integration positioned as an additional performance layer, not a requirement. Given `tech-stack.md` §7 already puts Cloudflare in front of Vercel, **JS-only is the right mode**: it avoids handing DNS/edge behaviour to a third party and keeps the ad layer a pure client concern. Ads.txt is handled by Ezoic's **Ads.txt Manager** (default account ID `19390`, or your own from adstxtmanager.com), typically wired as a redirect/managed file — an ads.txt entry *is* required for reseller compliance with any network.

**Provider: AdSense** — the realistic launch target (D17). Container needs attributes, not just an id:

```ts
export const adsenseProvider: AdProvider = {
  id: 'adsense',
  Scripts: () => (
    <Script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  ),
  containerId: (slot) => `ad-${slot}`,
  containerAttrs: (slot) => ({
    class: 'adsbygoogle',
    'data-ad-client': CLIENT,
    'data-ad-slot': ADSENSE_SLOT_IDS[slot],
    // fixed size, NOT data-full-width-responsive — we control the box (§5.10)
  }),
  fill: () => {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  },
};
```

Note AdSense requires its class/attributes on the *filled* element. Render them into the **inner** element, keeping the outer reserved box ours — see D19.

**Rule to write into the code standards:** no file outside `lib/ads/providers/` may reference `ezstandalone`, `adsbygoogle`, or any network global. Enforce with `no-restricted-globals` / `no-restricted-imports`. Without it, the abstraction rots on the first "quick fix" and the swap becomes a rewrite.

## D17. Who will actually take a brand-new tool site in 2026

**Ezoic — verified, and it rules Ezoic out.** Per Ezoic's own requirements page (https://support.ezoic.com/kb/article/getting-started-ezoics-requirements): *"To join Ezoic, sites are generally required to have **250,000+ monthly active users**."* Publishers who were monetising **before 2026-02-19** are grandfathered regardless of size, but *"if a grandfathered site (with under 250k users) removes Ezoic integration for more than 7 days, the grandfathered status is void."* Sites below the threshold *"may be eligible for the **Ezoic Incubator Program**"* — reported as accepting ~20 publishers/month. Other stated requirements: compliance with Google's policies, an AdSense-supported language, and the ability to include JavaScript. AdSense approval itself is **not** required for most sites.

**A brand-new PZGIF has ~0 monthly users. Ezoic is not an option at launch and is unlikely to be one within 12 months.**

| Network | Real 2026 entry bar | Timeline | Fit for PZGIF | Rank |
|---|---|---|---|---|
| **Google AdSense** | No traffic minimum. Requires original content, the legal pages in `tech-stack.md` §8, and passing a manual "low value content" review — historically the exact failure mode for thin tool sites | Days–weeks; re-application allowed | **Best available at launch**, but approval is the risk, not the traffic | **1** |
| **Journey by Mediavine** | **≥1,000 sessions / 30 days** (verified: https://journeymv.zendesk.com/hc/en-us/articles/24633185741723, updated 2026-03-11). Also: install the Grow plugin, original brand-safe content, engaged audience, frequently updated content, verified human traffic. Auto-upgrades to full Mediavine at $5,000 trailing-12-month ad revenue | Weeks once at 1k sessions | Very reachable. **Caveat:** Grow is WordPress-oriented; Next.js support **unverified** | **2** |
| **Google Ad Manager (GAM) + AdSense backfill** | Same as AdSense | Same | Only worth it once there are multiple demand sources. Over-engineering for MVP | 3 |
| **Monumetric** | ~10k pageviews/mo, plus a setup fee at the lowest tier | Weeks | Reachable at month ~3–6; the fee is unattractive pre-revenue | 4 |
| **Mediavine (full) / Raptive** | Mediavine full is now revenue-based (~$5,000 trailing 12mo); Raptive ~100k pageviews/mo | Months–years | Aspirational, not a launch option | 5 |
| **Adsterra / Monetag / popunder networks** | Effectively none | Days | **Reject.** Ad quality violates `design-guidelines.md` §8 rule 5 and principle 3, and poisons later AdSense approval | — |
| **None (launch with `none` provider)** | — | — | Ship the reserved boxes, measure CLS/INP, apply to AdSense once ~10–20 real content pages are indexed | **Viable and underrated** | 

**Recommended sequence:**

1. **Launch with `NEXT_PUBLIC_AD_PROVIDER=none`.** Reserved boxes render, layout is final, CLS/INP measurable. Zero revenue — but at 0 traffic there is zero revenue anyway, and this removes ad-script variables from the launch-week debugging surface.
2. **Apply to AdSense** once the legal pages (§8) and 10–20 genuine content pages are live and indexed. This is what `tech-stack.md` §6 already said to do *later*; the change is that it is now the *first* step, not the second.
3. **Apply to Journey by Mediavine in parallel at ~1k sessions/30d.** Verify Grow works on Next.js before committing. If it does, Journey's 70% revenue share and lower bar likely beat AdSense RPM.
4. **Revisit Ezoic only at 250k MAU**, or apply to the Incubator opportunistically.

**Honest note on AdSense approval risk:** a 13-page tool site with thin copy is the classic "low value content" rejection. The mitigations are already in the locked docs and should be treated as **approval prerequisites, not nice-to-haves**: §10's ≥400-word explainers, the §8 legal pages, and a real About page with a named operator (E-E-A-T). Do not apply before those exist — a rejection costs weeks.

## D18. Consent: Google-certified CMP + Consent Mode v2

**The requirement** (https://support.google.com/admanager/answer/13554116): *"As of 16 January 2024, a certified CMP integrated with the TCF is required when serving personalized ads to users in the EEA and UK."* Switzerland from 2024-07-31. Non-certified CMP traffic is limited to **non-personalized or limited ads** — the 50–70% RPM loss `tech-stack.md` §6 already flags.

**This closes `tech-stack.md` §Unresolved #4** ("current Google-certified CMP vendor list"). The list is published by Google and holds **150+ certified partners**, including OneTrust/CookiePro, Usercentrics, **Cookiebot** (Usercentrics-owned), Sourcepoint, Didomi, Commanders Act, consentmanager, **iubenda**, Axeptio, Admiral, AppConsent by SFBX, Ketch, InMobi Choice, and **Google's own CMP**. **CookieYes** is separately confirmed as a certified partner. The list changes — **re-check the live page at integration time; do not copy this list into code.**

| Option | Cost | Certified | Verdict |
|---|---|---|---|
| **Google's own CMP** (via AdSense/Ad Manager) | Free | Yes (Google LLC on its own list) | **Rank 1 if the network is AdSense/GAM.** Zero integration surface, guaranteed signal compatibility, no vendor to re-verify. |
| **Network-bundled CMP** (Ezoic ships Gatekeeper; Mediavine ships its own) | Free | Yes | **Rank 1 if using that network.** Do not run two CMPs. |
| **CookieYes** | Free tier, then low $ | Yes (TCF v2.2) | Rank 2 — good standalone fallback |
| **Cookiebot** | Free under a small-page threshold | Yes | Rank 3 — strong, pricier past the free tier |
| **iubenda / Didomi / Usercentrics** | $–$$$ | Yes | Overkill for a solo-dev MVP |

**Recommendation: do not choose a standalone CMP yet.** The network decides it. AdSense → Google's CMP; Journey → Mediavine's. A standalone CMP is only needed if PZGIF runs ads with no network-supplied CMP. Deferring costs nothing and avoids paying for a tool the network gives away. (`tech-stack.md` §6 names CookieYes/Cookiebot — still fine as fallbacks, but the bundled option should be preferred.)

**Consent Mode v2 signals** (https://developers.google.com/tag-platform/security/guides/consent): `ad_storage`, `analytics_storage`, **`ad_user_data`**, **`ad_personalization`** (the last two mandatory for EEA ad serving), plus `functionality_storage`, `personalization_storage`, `security_storage`.

**Load order is the part that gets broken. It is strict:**

```
1. gtag('consent', 'default', {...all denied...})   ← inline, in <head>, BEFORE anything
2. CMP script                                        ← reads/【shows banner
3. Google tag / GA4 / ad network script              ← afterInteractive
4. gtag('consent', 'update', {...})                  ← fired by the CMP on user choice
```

Google's requirement is explicit: the default call must run *"on every page before commands like `config` or `event`"*, and *"consent updates [must be] tracked on the page where they occur, before any page transition."*

```tsx
// app/[locale]/layout.tsx — step 1 MUST be beforeInteractive/inline
<Script id="consent-default" strategy="beforeInteractive">{`
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500
  });
`}</Script>
```

Deny-by-default globally (rather than region-scoping) is the simpler and safer choice for a solo dev: no geo-detection to get wrong, no accidental EEA leak. The revenue cost outside the EEA is real but small, and it can be region-scoped later once revenue justifies the complexity. **KISS now, optimise when there is something to optimise.**

**Interaction with B.8:** this is why `localeCookie: false` at MVP matters — a locale cookie written before consent is a needless disclosure item.

## D19. CLS-safe reserved slot with no hydration mismatch

**The two failure modes, named:**
1. **CLS** — the box is not reserved in the SSG HTML, so the fill pushes content down. `design-guidelines.md` §1 principle 5 and §8 rule 2 already forbid this.
2. **Hydration mismatch** — the ad script mutates DOM that React owns, so React's client render disagrees with the server HTML and either warns or wipes the ad.

**The fix for (2) is structural:** React renders the outer reserved box and **never** the inner fill target's children. Give React a stable, empty, `suppressHydrationWarning` inner node and let the network own it exclusively.

```tsx
// components/ads/ad-slot.tsx
'use client';

import {useEffect, useRef} from 'react';
import {adProvider} from '@/lib/ads/config';
import type {SlotName} from '@/lib/ads/types';

const SIZES = {
  'result-rect':    {w: 300, h: 250, cls: 'ad-slot--rect'},
  'content-inline': {w: 336, h: 280, cls: 'ad-slot--inline'},
  rail:             {w: 300, h: 600, cls: 'ad-slot--rail'},
  anchor:           {w: 320, h:  50, cls: 'ad-slot--anchor'},
  'below-grid':     {w: 336, h: 280, cls: 'ad-slot--inline'},
} as const;

export function AdSlot({slot, enabled = true}: {slot: SlotName; enabled?: boolean}) {
  const filled = useRef(false);
  const size = SIZES[slot];

  useEffect(() => {
    if (!enabled || filled.current) return;
    filled.current = true;                       // never fill twice
    adProvider.fill(slot, {w: size.w, h: size.h});
    return () => adProvider.release?.(slot);
  }, [enabled, slot, size.w, size.h]);

  return (
    <div className={`ad-slot ${size.cls}`} role="complementary" aria-label="Advertisement">
      {/* React renders this node once and never touches its children again. */}
      <div
        id={adProvider.containerId(slot)}
        {...(adProvider.containerAttrs?.(slot, size) ?? {})}
        suppressHydrationWarning
      />
    </div>
  );
}
```

**Why this is hydration-safe:** the inner div is rendered identically on server and client (same id, same attrs, no children). The ad script injects an iframe *inside* it after mount. React never re-renders that subtree because it has no children in the React tree. `suppressHydrationWarning` covers the case where a network's script runs before hydration completes.

**Why this is CLS-safe** — the CSS from `design-guidelines.md` §5.10, unchanged, plus one addition:

```css
.ad-slot{
  position: relative;                    /* required for the ::before label */
  background: var(--surface-ad);
  border: 1px solid var(--border-ad);
  border-radius: 6px;
  box-shadow: none;
  contain: layout size;                  /* a late fill cannot reflow the page */
  margin-block: 24px;
  display: grid; place-items: center;
  overflow: hidden;
}
.ad-slot--rect   { min-height: 250px; aspect-ratio: 300/250; max-width: 300px; }
.ad-slot--inline { min-height: 280px; aspect-ratio: 336/280; max-width: 336px; }
.ad-slot--rail   { min-height: 600px; width: 300px; }
.ad-slot--anchor { min-height:  50px; width: 320px; }
```

`contain: layout size` is the load-bearing property: the box's size is fixed by CSS regardless of content, so an oversized creative cannot expand it. Combined with `min-height` in the **initial SSG HTML**, this yields structurally zero CLS.

**Rules this component enforces automatically** (all from `design-guidelines.md` §8):
- The container is in the SSG HTML — `<AdSlot>` is rendered by the page, never injected post-hydration.
- `enabled={false}` covers §8.1's conditional cases: `result-rect` fills only once a result exists; `anchor` renders only when the sticky action bar is absent.
- `role="complementary"` + `aria-label` keeps it announced as non-content; DOM placement keeps ad iframes last in their region (§7.2).
- The `rail` grid column is declared at ≥1280px in CSS whether or not it fills — no late injection.

**The `enabled` prop answers `design-guidelines.md` §Open Question 5** (whether the network can respect anchor/action-bar mutual exclusion): **do not delegate it to the network.** Control it in our own render logic — never render the anchor `<AdSlot>` while the action bar is visible. Then no network configuration is required and no network can violate it. This turns an open question into a non-question.

**INP interaction (see C15):** load ad scripts `afterInteractive`, never `beforeInteractive` (the consent default snippet is the sole exception, and it is ~10 lines inline). Consider gating `fill()` on an active-job flag so no ad request competes with worker startup during an encode.

## D20. Better Ads Standards — what actually changed in 2026

**Verified** (https://www.betterads.org/standards/ and the Coalition's press release):

| Platform | Ad experiences below the acceptability threshold |
|---|---|
| **Mobile web** | Pop-up ads · Prestitial ads · **Ad density > 30%** · Flashing animated ads · Auto-playing video with sound · Postitial with countdown · Full-screen scrollover · **Large sticky ads** · *(new)* **Sticky pop-out video ads (dismissible and non-dismissible)** · *(new)* **Sticky video ad with large inline ad** |
| **Desktop web** | Pop-up ads · Auto-playing video with sound · Prestitial with countdown · Large sticky ads · *(new)* **Ad density > 50%** · *(new)* **Ad density > 30% when combined with a sticky video ad** |

**The 30% mobile ad-density threshold is confirmed — but it is NOT new.** It has been in the mobile standard since the original research. The 2026 update added **four** experiences, all sticky-video-related, based on research with 55,000+ consumers across the US, UK, Germany, Brazil, Japan and India.

**Dates:** announced **2026-01-14**; industry adjustment period of ≥4 months; not considered "live" until **2026-05-15** at the earliest; implementation entities assess compliance **no earlier than 2026-05-14**. So the update is **already in force** as of today.

**CONFLICT (minor, worth fixing) with `design-guidelines.md` §8.4.** It reads *"Mobile ad density < 30% of the visible viewport (Better Ads 2026 update, effective 2026-05-15)"*. The threshold and the date are right; the **attribution is wrong** — 30% mobile density predates the 2026 update. The genuinely new 2026 items are the sticky-video combinations, which §8 does not mention.

**Impact on the §8.1 slot map: none of the new items are violated, and the map is already conservative.**

| §8.1 element | 2026 status |
|---|---|
| Mobile `anchor` 320×50, dismissible, height-capped | Compliant. A "large sticky ad" is one occupying a large share of screen; 320×50 (~7% of a 667px viewport) is not. |
| Sticky bottom action bar (64px) | Not an ad — outside the standard entirely. |
| No sticky video anywhere | **All four new 2026 experiences are sticky-video-related. PZGIF has no video ads. Fully unaffected.** |
| Desktop `rail` 300×600 + in-content | Nowhere near 50% desktop density. |
| §8 rule 5 prohibitions (pop-ups, prestitials, auto-play with sound, full-screen scrollover, large stickies) | Already stricter than the standard. |

**Add one binding rule to §8.5, since it is now cheap insurance:** *no sticky or pop-out video ad units on any breakpoint.* Two of the four new mobile/desktop violations require them. Some networks (notably auto-optimising ones) enable sticky video by default — this must be explicitly disabled in whichever network's dashboard is chosen, and it is a question to ask **during** network evaluation, not after.

**Mobile density math to hold the line on:** at 375×667, 30% = ~200px of ad per viewport-height. One 320×50 anchor plus one in-content 336×280 will exceed that if both are visible simultaneously. §8.1's "prefer in-content over anchor on tool pages" is therefore not a stylistic preference — it is what keeps the page compliant. Keep it.

---

# E. Analytics / monitoring (brief)

## E21. What must be consent-gated, and what may always fire

| Tool | Consent-gated? | Rule |
|---|---|---|
| **Google Search Console** | **No gating needed** | Zero client-side code. Verify via a DNS TXT record (Cloudflare already hosts DNS) or the `verification.google` metadata field. No cookies, no personal data, nothing loaded in the browser. Set up on day 1 — non-negotiable per `tech-stack.md` §6. |
| **GA4** | **Yes** | Governed by `analytics_storage`. With Consent Mode v2 the tag may *load* pre-consent and send cookieless pings; it must not write cookies until `analytics_storage: 'granted'`. Simplest correct setup: deny-by-default (§D18) and let Consent Mode handle it — do **not** conditionally omit the script, which breaks modelled conversions. |
| **Ad network script** | **Yes** | `ad_storage` / `ad_user_data` / `ad_personalization`. Must load *after* the consent default call. |
| **Sentry** | **Nuanced — see below** | |
| **`web-vitals` → GA4** | Follows GA4 | Same gate as GA4; it is a GA4 event. |

**Sentry — the one that needs a decision, not a default.**

Error monitoring is generally defensible as legitimate interest (service integrity), and `tech-stack.md` §7 is right that client-side WASM failures are otherwise invisible. But Sentry's *defaults* are not consent-neutral. Configure it as:

| Sentry feature | MVP setting | Why |
|---|---|---|
| Error capture | **On, ungated** | Legitimate interest; needed to see WASM failures at all |
| `sendDefaultPii` | **`false`** | Explicitly off. Do not send IP/user identifiers |
| **Session Replay** | **Off** | Records the session. This is the feature that genuinely requires consent. Off entirely at MVP — it is also the heaviest client bundle Sentry ships, which C15 makes a bad trade |
| Performance tracing | **Very low sample rate or off** | Adds client cost for little value at 0 traffic |
| `beforeSend` scrubbing | **On** | Strip filenames and any user-supplied media metadata from breadcrumbs — file names are user content |

The privacy claim in `design-guidelines.md` §11 ("Files never leave your device") must stay literally true. **Never let an error report carry file *contents*; file *names* should also be scrubbed.** Send only the shape of the failure: format, byte size, dimensions, codec, error code. That is both more privacy-respecting and more useful for debugging.

**Load order, consolidated with §D18:**

```
1. inline gtag('consent','default', …all denied…)   beforeInteractive
2. CMP script                                        afterInteractive
3. GA4 / gtag                                        afterInteractive
4. ad network script                                 afterInteractive
5. Sentry (errors only, no replay)                   afterInteractive / lazy
   — Search Console needs no script at all
```

**Privacy-policy consequence:** `tech-stack.md` §8 requires a Privacy Policy disclosing ad personalisation and cookies before ads go live. Add Sentry (error monitoring, no replay) and GA4 to that disclosure. Cheap to write now, awkward to retrofit after an audit.

---

# Summary of conflicts with the locked docs

| # | Locked doc | Says | Reality (verified 2026-08-04) | Severity |
|---|---|---|---|---|
| 1 | `design-guidelines.md` §10 | Preset "Banner 680×240" | Matches **no** Discord surface. Server banner 960×540; profile banner ~600×240 (unofficial) | **Critical** — breaks the preset promise |
| 2 | `design-guidelines.md` §10 | "target size … under 256 KB" for all presets | 256 KB is emoji-only. Sticker 512 KB; Slack emoji 128 KB; banners/avatars undocumented | **Critical** |
| 3 | `design-guidelines.md` §10 | (omits) | Sticker also caps at **5 s** and **60 FPS**; Slack emoji at **50 frames** | **High** — silent upload rejections |
| 4 | `tech-stack.md` §6 | "Ads at launch: Ezoic (accepts new/small tool sites)" | Ezoic requires **250,000+ monthly active users** since 2026-02-19 | **Critical** — launch monetisation plan is void |
| 5 | `design-guidelines.md` §10 | "FAQ accordion (schema.org `FAQPage`)" | FAQ rich results removed from Search 2026-05-07; docs deleted 2026-06-15 | **Medium** — drop the JSON-LD, keep the UI |
| 6 | `design-guidelines.md` §8.4 | "Mobile ad density < 30% (Better Ads 2026 update)" | Threshold and date correct; **attribution wrong** — 30% predates the update. The new 2026 items are sticky-video combinations | **Low** — fix the citation, add a no-sticky-video rule |
| 7 | `tech-stack.md` §7 | CI: `typecheck → lint → vitest → build → playwright` | Next 16 **removed `next lint`**; `next build` no longer lints. CI must call `eslint` directly | **Low** |
| 8 | `design-guidelines.md` §2.2 | `[data-theme="dark"]` | Correct, but diverges from shadcn's `.dark` convention — needs one `@custom-variant` line | **Low** |

Resolved from the locked docs' own open-question lists:

- `tech-stack.md` §Unresolved **#4** (current Google-certified CMP vendor list) — **resolved**, §D18.
- `design-guidelines.md` §Open Question **#1** (Ezoic Ad Tester overriding manual placements) — **partially resolved**, §D16: explicit `showAds(ids)` is the code-side control; the dashboard-side toggle remains unverified, and is now low-priority since Ezoic is unreachable.
- `design-guidelines.md` §Open Question **#5** (whether Ezoic respects anchor/action-bar exclusion) — **dissolved**, §D19: control it in our own render logic, do not delegate it to any network.

---

# Recommended build order (what the planner can turn into phases)

1. **Shell** — `create-next-app` (Next 16.3, TS pinned `~5.9`), Tailwind v4 CSS-first `globals.css` per B.7, shadcn init + `@custom-variant dark`, next-intl `[locale]` + `as-needed` + `proxy.ts`, **no `output: 'export'`**, `cacheComponents` off.
2. **Worker/WASM spike** — one page, one worker, one real `gifski` encode on Next 16.3 with `.wasm` served from `public/wasm/`. Closes `tech-stack.md` §Unresolved #1 *and* the Turbopack question together. **Do this before writing tool-page phases.**
3. **Preset config** — `lib/presets/discord.ts` per §A.7, with corrected numbers. Fix `design-guidelines.md` §10 and `docs/wireframe/discord-preset.html` in the same change.
4. **SEO machinery** — `metadataBase`, per-page static `metadata`, `alternatesFor()`, `sitemap.ts` with real content dates, `robots.ts`, `BreadcrumbList` + `WebApplication` JSON-LD. No `FAQPage`, no `HowTo`.
5. **Ad abstraction with `provider = none`** — `<AdSlot>` + `.ad-slot` CSS. Measure CLS and INP with real boxes and no network. Closes §Open Question 4.
6. **Legal pages + About** — AdSense approval prerequisites, not a later chore.
7. **Then** apply to AdSense; Journey by Mediavine in parallel at ~1k sessions/30d.

---

# Unresolved questions

1. **Discord avatar / server-icon / profile-banner byte and pixel limits are genuinely undocumented.** Community values (avatar 128×128, icon 512×512, profile banner 600×240, 10 MB) have no Discord-authored source. Either label them "recommended / community standard" in the UI, or drop those presets from MVP. **Do not print an unverified number as a hard limit.**
2. **Discord animated-emoji gating is self-contradictory across two Discord articles**, both updated within the last two weeks (Nitro-based in the emoji article, Boost-level-based in the Boosting FAQ). Preset copy must avoid stating a gating rule until this is resolved.
3. **GIF stickers:** API docs and Discord's product blog say GIF is uploadable; the sticker help article says APNG only. Two Discord-owned sources beat one, but **test an actual GIF sticker upload** before an H1 promises it.
4. **Server-banner max file size** — no Discord-published figure found.
5. **Ezoic's dashboard-level automatic placement** — whether auto-inserted placeholders can be fully disabled is unverified. Low priority while Ezoic is unreachable.
6. **Journey by Mediavine on Next.js** — the Grow plugin is WordPress-oriented; whether a non-WP JS integration is supported is **unverified** and is the single most important question for the #2 monetisation option. Ask Mediavine directly before counting on it.
7. **TypeScript 7 compatibility with Next 16.3 / shadcn / Radix** — untested here; recommendation to pin `~5.9` is a risk-avoidance call, not a documented incompatibility. Re-evaluate when Next.js states a tested TS 7 range.
8. **Turbopack `.wasm` asset resolution** — the `public/wasm/` workaround sidesteps it, but the underlying behaviour was not tested against `gifski-wasm`/`@jsquash` specifically. Covered by the spike in build-order step 2.
9. **AdSense approval odds for a 13-page tool site** are unknowable in advance. If rejected twice after the content/legal prerequisites are met, escalate to Journey rather than iterating blindly.
10. **No CLS or INP measurement exists yet** for the ad + dropzone layout (`design-guidelines.md` §Open Question 4). The `provider = none` build makes this measurable before any network commitment — but it is still an assumption today.
11. **`next-intl` 4.13.5 was published on the day of this research** (2026-08-04). Its Next.js 16 `proxy.ts` integration is documented but the specific version was not exercised. Pin exactly and smoke-test routing early.

---

*Research performed 2026-08-04. Primary sources: Discord Help Center (Zendesk API) + `docs.discord.com`, Slack Help Center, npm registry, nextjs.org docs (v16.3.0) and blog, tailwindcss.com, next-intl.dev, ui.shadcn.com, developers.google.com/search, web.dev, support.google.com/admanager, betterads.org, support.ezoic.com + docs.ezoic.com, journeymv.zendesk.com. Version numbers read from the npm registry, not inferred.*
