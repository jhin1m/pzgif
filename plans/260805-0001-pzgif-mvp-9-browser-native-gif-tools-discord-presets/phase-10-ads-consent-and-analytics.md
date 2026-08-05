---
phase: 10
title: "Ads Consent and Analytics"
status: pending
priority: P2
effort: "3-4d"
dependencies: [3, 9]
---

# Phase 10: Ads Consent and Analytics

## Overview

Ship the ad **abstraction**, the consent layer, and analytics — with **no ad network active at launch**.

This is the user's ratified decision, and research independently confirms it is also the only workable one: `tech-stack.md` §6's plan to launch on Ezoic is void, because **Ezoic has required 250,000+ monthly active users since 2026-02-19**. A brand-new PZGIF has roughly zero.

The deliverable is therefore a provider interface where the network is one environment variable, plus a layout proven CLS-safe with real reserved boxes.

## Requirements

**Functional**
- `AdSlot` wired to a provider interface with implementations: `none` (launch default), `adsense`, and a stub for a future network
- Consent Mode v2 with the correct, strict load order
- GA4 + Search Console + Sentry, consent-gated appropriately
- `web-vitals` (attribution build) reporting INP/LCP/CLS as GA4 events

**Non-functional**
- CLS exactly 0 with slots reserved and unfilled
- Zero third-party script before consent default is set
- Swapping providers is a config change, never a layout change

## Architecture

### Ad network reality, ranked

| Network | Real 2026 entry bar | Fit |
|---|---|---|
| **`none`** | — | **Launch here.** Reserved boxes render, layout is final, CLS/INP measurable, and ad-script variables are out of the launch-week debugging surface. At zero traffic there is zero revenue either way |
| **Google AdSense** | No traffic minimum, but a manual "low value content" review that thin tool sites classically fail | **Apply first**, once Phase 9's legal pages, About page and 10-20 indexed content pages exist |
| **Journey by Mediavine** | ≥1,000 sessions / 30 days | Reachable at month ~2-4. **Caveat: the Grow plugin is WordPress-oriented and Next.js support is unverified** — ask Mediavine before counting on it |
| **Monumetric** | ~10k pageviews/mo + a setup fee | Month 3-6; the fee is unattractive pre-revenue |
| **Ezoic** | 250k+ MAU | Not an option. Revisit only at scale |
| **Adsterra / popunder networks** | None | **Reject.** Ad quality violates `design-guidelines.md` §8 rule 5 and principle 3, and poisons later AdSense approval |

### The provider interface

`AdSlot` renders the reserved box and the label. A provider owns only the fill. The `none` provider fills nothing — and that is a complete, shippable implementation, not a placeholder.

Two failure modes the interface must structurally prevent:

1. **CLS** — the box must exist in the SSG HTML with explicit `min-height` / `aspect-ratio` / `contain: layout size`. **Never inject the container after hydration**; only the ad script fills it.
2. **Hydration mismatch** — an ad script mutating DOM React owns causes React's client render to disagree with the server HTML, which either warns or wipes the ad. The fix is structural: React renders the outer reserved box and **never** the inner fill target's children. Give React a stable, empty, `suppressHydrationWarning` inner node and let the network own it exclusively.

Slot placement stays exactly as `design-guidelines.md` §8.1 specifies. One rule is now clearly ours rather than the network's: **the mobile anchor ad and the sticky action bar are mutually exclusive.** Control that in our own render logic; never delegate it to a network's auto-placement. That dissolves `design-guidelines.md` Open Question #5.

### Consent Mode v2 — the load order is strict and easy to break

```
1. gtag('consent', 'default', {...all denied...})   inline, in <head>, BEFORE anything else
2. CMP script                                        reads state / shows the banner
3. Google tag / GA4 / ad network script              afterInteractive
4. gtag('consent', 'update', {...})                  fired by the CMP on the user's choice
```

Signals: `ad_storage`, `analytics_storage`, **`ad_user_data`**, **`ad_personalization`** (the last two are mandatory for EEA ad serving), plus `functionality_storage`, `personalization_storage`, `security_storage`. Use `wait_for_update: 500`.

**Deny by default globally, not region-scoped.** No geo-detection to get wrong, no accidental EEA leak. The revenue cost outside the EEA is real but small at launch traffic, and region-scoping can be added later once there is revenue to optimise. KISS now.

**Do not pick a standalone CMP yet.** The network decides it: AdSense ships Google's own CMP free; Mediavine ships its own. Running two CMPs is a bug. A standalone (CookieYes, Cookiebot — both certified) is only needed if ads ever run with no network-supplied CMP. The Google-certified list holds 150+ partners and changes — re-check the live list at integration time; **never copy it into code**. This closes `tech-stack.md` §Unresolved #4.

Since the launch provider is `none`, the CMP banner at launch governs **analytics only**. Build the plumbing so adding an ad network flips it to cover ads without a rewrite.

### Product instrumentation — without it, launch teaches the operator nothing

`web-vitals` and Sentry measure whether the *site* is healthy. Nothing in the plan measures whether the *product* works. Compounding it, consent is deny-by-default globally, so GA4 sees only an opted-in minority — and a biased one.

After launch the operator must be able to answer: which of the 9 tools do people actually use; what fraction of mobile jobs are refused before decode; do people who reach an auto-fit result actually download it. Those questions decide what to build in month two and whether the gifski/AGPL bet paid off.

Add a **consent-free, cookieless, aggregate beacon** — no identifiers, no file names, no file content, nothing personal. A `sendBeacon` to an edge route recording:

```
{ tool, deviceTier, outcome: started|refused|failed|completed|downloaded,
  durationBucket, inputSizeBucket }
```

This sits on the same legitimate-interest footing as Sentry in the table below, and carries strictly less data. It must never receive a filename — that would break the trust line, which is the product's central promise.

### What may fire before consent

| Thing | Before consent? |
|---|---|
| Consent-default gtag call | **Yes** — it must be first |
| Sentry (errors, no PII, no cookies) | Yes — legitimate interest, but scrub any file names or user content from breadcrumbs |
| GA4 | **No** — gated on `analytics_storage` |
| Ad scripts | **No** — gated, and absent at launch anyway |
| `web-vitals` reporting | Only via GA4, so gated with it |
| next-intl locale cookie | Disabled at MVP (`localeCookie: false`) precisely to avoid this question |

### INP — the metric this product is most likely to fail

Budgets: **INP ≤ 200 ms (p75)** including during an active encode, **CLS < 0.1**, **LCP ≤ 2.5 s** on the dropzone.

INP is a field metric at the 75th percentile; lab Lighthouse does not report it meaningfully. Wire `web-vitals` with the **attribution build** so a bad INP names the responsible element and event type — that is what turns "INP is 340 ms" into a fix.

Guardrails, enforced mechanically rather than by vigilance:
- No `gifski` / `@jsquash` / `ffmpeg` import outside worker files — ESLint path-scoped rule (already added in Phase 2)
- Transferables in `postMessage`, never structured clones of frame buffers
- Progress messages throttled to ≤10/s
- Ad script `afterInteractive`, never loaded during an active job
- Tool pages stay Server Components with small `'use client'` islands — a large client bundle inflates input delay on the *first* interaction, which is usually the dropzone click, the conversion action

## Related Code Files

- Create: `src/lib/ads/types.ts`, `config.ts`, `providers/none.ts`, `providers/adsense.ts`
- Modify: `src/components/ads/ad-slot.tsx` — wire the provider
- Create: `src/components/analytics/consent-default.tsx`, `ga4.tsx`, `web-vitals.tsx`
- Create: `src/lib/monitoring/sentry.ts`
- Modify: `next.config.ts` — extend CSP `script-src` / `frame-src` for the future network
- Modify: `docs/tech-stack.md` §6 — record that Ezoic is unreachable and the launch provider is `none`

## Implementation Steps

1. Define `AdProvider` (`init()`, `fill(slot, el)`, `destroy()`) and the slot-name union. Implement `none` fully — it is the launch default.
2. Rewire `AdSlot` to the provider, with the reserved outer box and the `suppressHydrationWarning` inner fill target.
3. Implement the mutual exclusion between the mobile anchor slot and the sticky action bar in our own render logic.
4. Implement `adsense.ts` behind the same interface so activation is later an env-var change plus a CSP line — no layout change, ever.
5. Add the consent-default script `beforeInteractive` in the root layout, with all ad and analytics signals denied.
6. Add GA4 gated on `analytics_storage`, and Sentry with PII and content scrubbed from breadcrumbs.
7. Wire `web-vitals` (attribution build) reporting INP, LCP and CLS to GA4.
8. Add a Playwright long-task assertion: during a fixture encode, **no main-thread task exceeds 200 ms**. This catches an accidental main-thread regression at CI time rather than 28 days later in CrUX.
8b. Implement the aggregate product beacon above, plus a dashboard or query that answers "which tools ran, and what fraction were refused" on day one.
9. Measure CLS on every route with slots reserved and unfilled, **and again with the consent banner present**. The target is exactly 0. Note the banner is itself a CLS event and a layout hazard: every CMP's default mobile treatment is a bottom sheet or overlay taking 30-50% of a 667px viewport, which would break Phase 5's hardest acceptance criterion — *the dropzone must be fully visible at 375×667 without scrolling*. Specify a compact reserved-height bottom bar that never overlays the dropzone, and design it in Phase 3 rather than discovering it here. If the eventual network ships a CMP whose layout cannot be restyled, that is worth knowing before choosing the network.
10. Amend `docs/tech-stack.md` §6 with the Ezoic finding and the `none`-at-launch decision.
11. Verify Search Console ownership and submit the sitemap.

## Success Criteria

- [ ] CLS is exactly 0 on the routes that exist when this phase runs, with slots reserved and unfilled. **Full-site CLS and the during-encode long-task assertion are verified in Phase 11**, once all routes and a working engine exist — they cannot be satisfied from this phase's dependencies alone
- [ ] No hydration warning from any ad slot
- [ ] Switching `NEXT_PUBLIC_AD_PROVIDER` from `none` to `adsense` changes no layout and no component
- [ ] Consent default fires before every other script, verified in the network waterfall
- [ ] No GA4 or ad request fires before consent is granted
- [ ] Anchor slot and sticky action bar are never simultaneously visible on mobile
- [ ] `web-vitals` events arrive in GA4 with attribution data
- [ ] The aggregate product beacon reports per-tool run counts, refusal rate and download rate **without consent and without any personal data** — and an automated test proves it never carries a filename
- [ ] CLS measured **with the consent banner present**; the dropzone is still fully visible at 375×667
- [ ] Playwright asserts no main-thread task over 200 ms during a real encode
- [ ] Search Console verified and sitemap submitted
- [ ] `tech-stack.md` §6 amended

## Risk Assessment

| Risk | Mitigation |
|---|---|
| AdSense rejects the site as low-value content | The mitigations are Phase 9's deliverables and are approval **prerequisites**. Do not apply before they exist. If rejected twice after they do, escalate to Journey rather than iterating blindly |
| Journey/Grow does not support Next.js | Unverified and it is the pivot for the second-best option. Ask Mediavine directly before counting on it |
| A future network's auto-placement overrides the slot map | Prefer networks that honour explicit placements. Our own render logic owns the anchor/action-bar exclusion regardless |
| INP fails in the field despite the worker architecture | The CI long-task assertion catches regressions early; the attribution build names the culprit when the field data disagrees |
| Consent load order breaks silently after a refactor | Add an E2E assertion on script order, not just a code comment |

## Open questions

1. Does Journey by Mediavine work on Next.js? Unverified, and it decides the month-3 monetisation path.
2. Whether any chosen network's dashboard-level auto-placement can be fully disabled — unverified, low priority while the provider is `none`.
3. No CLS or INP measurement exists for the ad-script-live case. It stays open until a network is activated; the `none` build makes everything else measurable now.
