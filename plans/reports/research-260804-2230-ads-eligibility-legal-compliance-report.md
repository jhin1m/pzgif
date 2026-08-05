# Ads Eligibility + Legal/Compliance Research — VNGIF (Solo VN Operator, Global GIF Tool)

## 1. Ad Network Eligibility

### AdSense
- **Policy risk, not just "we never see it."** AdSense bans sites hosting/linking copyrighted or adult content regardless of who uploaded it — publisher liability, not platform excuse. [Copyrights policy](https://support.google.com/adspolicy/answer/6018015), [Program policies](https://support.google.com/adsense/answer/48182). Client-side-only free tier reduces *your* server storage/CSAM exposure but does **not** reduce AdSense policy risk if a user pastes a copyrighted GIF and shares the output publicly on your domain (e.g. hosted result pages, public share links). If free tier truly never persists/exposes files (processed client-side, downloaded directly, nothing hosted/linkable), risk is low. Any server-side share/hosting feature (Pro tier, public GIF links) reintroduces it — geo-block ads from those specific pages or gate them behind moderation.
- **Approval odds for thin utility site: poor, by design of the policy.** "Low value content" is the standard rejection for tool-only sites lacking substantial original text (multiple 2026 sources, e.g. [toolpod.dev](https://toolpod.dev/blog/adsense-rejection-low-value-content), [adsenseaudit.net](https://adsenseaudit.net/adSense-tool-websites)). Google's review is editorial (E-E-A-T), and a bare tool UI gives it nothing to evaluate. **Mitigation**: each tool page needs real explanatory copy (what/why/how, safety, format specs), plus a blog/guides section, About page with real identity, and standard legal pages before applying. Do not apply on day 1 of an empty site — wait for ~10-20 indexed content pages minimum.
- **Required pages**: Privacy Policy (mandatory, must disclose ad personalization/cookies), ToS, and ideally a Content/Acceptable Use policy. Not policy-mandated as a checklist item but reviewers use their absence as a trust signal.

### Alternatives ranked for a new low-content utility site
| Network | Min threshold (2026) | Fit for tool site | Notes |
|---|---|---|---|
| **AdSense** | None formal, but editorial approval gate | Poor initially | Best long-run RPM once approved; revisit after content build-out |
| **Ezoic** | No strict minimum | **Best starting point** | Accepts small/new sites incl. tool sites; auto-optimizes layout; source: [monetag.com comparison](https://monetag.com/blog/ezoic-alternatives/) |
| Adsterra / PropellerAds (tier-2) | No minimum, instant approval | Good bootstrap fallback | Lower RPM, more aggressive ad formats (pop-under); reputational/UX risk on a tool page — use conservative formats only |
| Raptive | 25k monthly pageviews (lowered from 100k in Oct 2026) | Not yet at launch | Reassess post-traction |
| Mediavine (Journey) | 50k sessions/30d + $5k annual ad revenue (Jan 2026) | Not at launch | High RPM, lifestyle/content-site oriented, weak fit for pure utility even later |
| Monumetric | ~10k pageviews/mo (historically) | Possible mid-tier fallback | Not verified in 2026 sources this session — confirm directly |
| AdThrive/Snigel/Playwire | Enterprise-tier, high pageview floors | Not applicable at this stage | — |

**Recommendation**: Launch with Ezoic (or house/affiliate ads) + a tier-2 network for immediate revenue, build 4-8 weeks of genuine tool-explainer/blog content, then apply to AdSense. Treat AdSense as the medium-term goal, not launch-day requirement.

### Ad layout constraints
Coalition for Better Ads standards enforced in ad tech tooling (compliance assessed by CBA program from 14 May 2026) — avoid pop-ups, auto-play-with-sound, prestitial with countdown, flashing ads. [betterads.org](https://www.betterads.org/). For a tool page: **reserve fixed-height ad slot containers via CSS before ad script injects** to avoid CLS (Core Web Vitals threshold: CLS < 0.1) — unreserved ad slots are a leading CLS cause per [Google's own guide](https://developers.google.com/publisher-tag/guides/minimize-layout-shift). Never place ads where they could be mistaken for the "process/download" button (classic Better Ads violation + user-trust/misclick issue for tool sites specifically).

## 2. Technical Conflict: COEP/Cross-Origin Isolation vs Ads — CONFIRMED CONFLICT

Google's own docs confirm it: **"Google Publisher Tag (GPT) currently doesn't support pages using Cross-Origin-Embedder-Policy (COEP)."** [developers.google.com/publisher-tag/guides/cross-origin-embedder-policy](https://developers.google.com/publisher-tag/guides/cross-origin-embedder-policy). `require-corp` will break ad serving because ad creatives/third-party resources lack CORP headers.

**Practical recommendation**: Do not apply `COEP: require-corp` site-wide.
- Use `COEP: credentialless` where possible (strips credentials from no-CORS cross-origin requests instead of blocking them) — better GPT compatibility per MDN/web.dev, though Google's own page doesn't explicitly endorse it for ads (only mentions the reverse Origin Trial for `SharedArrayBuffer`).
- **Best architecture**: isolate WASM processing (needs `SharedArrayBuffer`/cross-origin-isolation for multithreading) on a dedicated route or subdomain (e.g. `tool.vngif.com` or `/process` route) that sets COEP/COOP, while the **marketing/content/landing pages that carry ads stay non-isolated**. If the tool itself must show ads on the same page, load ads in a same-origin-isolated-exempt iframe, or fall back to single-threaded WASM (no SharedArrayBuffer requirement) on the ad-bearing page to skip COEP entirely — likely the simplest KISS choice for most GIF operations (many are not CPU-bound enough to need threaded WASM).
- Reassess: Chrome has been iterating on this gap; re-check GPT COEP support status before build.

## 3. Legal Exposure

### DMCA
- Foreign (non-US) operators **are eligible** to register a DMCA agent via the Copyright Office's online Designated Agent Directory. [copyright.gov/dmca-directory](https://www.copyright.gov/dmca-directory/). Cost: **$6** per designation, re-designation required every 3 years. Cheap, low-effort, do it — required to invoke §512(c) safe harbor for any US-facing service that stores user content (Pro tier server-side uploads qualify you as an OSP).
- Free-tier-only (pure client-side, nothing stored) likely doesn't need it since there's no hosted content to take down — but Pro tier server storage triggers OSP status. Register once Pro tier ships; not urgent for MVP if MVP is free-tier-only.
- Registration requires a US-facing public takedown contact/process page — budget for a DMCA policy page + monitored inbox.

### CSAM / illegal content (server-side storage — Pro tier)
Minimum responsible posture (industry-standard, not exhaustively legally mandated but strongly reduces liability and is table stakes for hosting providers):
- **Auto-delete TTL** on all uploaded/processed files (e.g., 1-24h) — reduces retention window and storage liability.
- **Unguessable, non-enumerable object keys** (UUID/random, no sequential IDs); no public directory listing; no search-engine indexing of any result URLs (`X-Robots-Tag: noindex`, no sitemap inclusion).
- **Abuse-report channel** (email/form) surfaced in footer/ToS.
- **Logging** of upload IP/timestamp sufficient to respond to law enforcement requests, retained per a documented policy.
- **Cloudflare CSAM Scanning Tool**: free, available worldwide, no longer requires NCMEC credentials (barrier removed) — just needs a Cloudflare account + notification email. [Confirmed via search of Cloudflare blog/InHope coverage]. **Recommend enabling if routing Pro-tier uploads through Cloudflare** — low-effort, meaningful risk reduction, no legal mandate to run it but practically advisable for any image-hosting-adjacent service.
- No scanning is strictly *legally required* for a non-US-registered small operator, but if any US infrastructure/CDN is used (Cloudflare, AWS, S3, etc.), those providers' own ToS often require reasonable-effort compliance, and US law (18 U.S.C. §2258A) obligates *providers* (not necessarily you) to report known CSAM to NCMEC if discovered — running the free Cloudflare tool covers this gap cheaply.

### Section 230 / DSA
- Section 230 (US) is largely moot for a VN-registered operator with no US entity but functions as a backstop protection if ever sued in US courts for user-uploaded content you host — irrelevant to whether you have exposure abroad.
- **EU DSA**: applies based on function, not size. A tool that stores user files but does **not publicly disseminate them to other users/an unlimited audience** is classified as a plain "hosting service" (lighter DSA obligations — notice-and-action mechanism, ToS content-policy disclosure, law-enforcement notification duty for serious-crime content) rather than an "online platform" (heavier obligations: complaint-handling, ad transparency, etc.). If free tier is 100% client-side (no EU storage) and Pro tier's server storage is private/non-shared (each user only accesses their own files, no public/shareable links), you likely sit in the lighter "hosting service" tier, not "platform." **If you ever add public GIF-sharing/gallery features, reclassify — that crosses into online-platform territory with materially heavier DSA duties.**

### GDPR / CCPA
- **Client-side-only free tier**: files never transmitted to your servers = you are not a data controller/processor for those file contents (no EU sources found asserting an exception here, but the underlying logic is standard: GDPR governs processing of personal data by the controller — the browser is the user's own device processing, not a transmission to you). Still, if the page loads analytics/ad scripts on that same page, GDPR applies to *those* — separate concern from file content.
- **Server-side Pro tier**: you are a data processor/controller for uploaded files if they contain personal data (a GIF could contain faces = personal data under GDPR). Standard controller obligations apply: lawful basis, retention limits (ties back to the TTL auto-delete above — also serves as your GDPR data-minimization argument), DPA if using sub-processors (S3/Cloudflare), and a real Privacy Policy disclosing this.
- **CMP mandatory for EU ad revenue**: Confirmed — Google requires a **TCF-registered, Google-certified CMP** plus Consent Mode v2 signals to serve *personalized* ads to EEA/UK/Switzerland users since Jan 2024, tightened further after 15 June 2026 (ad_storage signal now sole gatekeeper). [support.google.com/adsense/answer/13554116](https://support.google.com/adsense/answer/13554116). Without a certified CMP, Google restricts to non-personalized ads only (50-70% lower RPM) or blocks EEA ad serving entirely. **Action item**: integrate a Google-certified CMP (e.g., Cookiebot, Osano, CookieYes — verify current certified list) from day one if EU traffic is expected, which it will be for an English-language global tool.

## 4. Required Legal Pages & Operational Setup

**Minimum page set for MVP**: Terms of Service, Privacy Policy, Cookie Policy (can fold into Privacy Policy), Acceptable Use Policy (bans illegal/CSAM/malware uploads explicitly — also your policy basis for account termination), DMCA Policy (once Pro tier/server storage ships), Refund Policy (once payments ship — MoR providers typically require this before go-live).

**Generators**: Termly, iubenda, GetTerms — all support customization for cookie/ad disclosures and DPA references; treat as a first draft, not a final legal document. No single source in this research verified a "best" one — pick based on iubenda's stronger DPA/GDPR tooling reputation if EU traffic-heavy, or a lawyer-reviewed template if budget allows before scaling revenue materially.

**MoR / entity considerations (confirmed this session)**:
- **Polar**: Vietnam **is confirmed** in Polar's supported-payout-countries list (via Stripe Connect Express), per direct fetch of [polar.sh/docs/merchant-of-record/supported-countries](https://polar.sh/docs/merchant-of-record/supported-countries). Polar is MoR — customer pays Polar (US entity), Polar pays out to a VN individual/business via Stripe Connect Express even though Stripe itself doesn't onboard VN merchants directly. This resolves the Stripe-VN blocker cleanly.
- **Paddle**: VN seller support **unconfirmed this session** — the supported-countries page fetched only covers *buyer* countries (229 listed, Vietnam not visible in the truncated first 25), not seller onboarding eligibility. Needs a direct check against Paddle's seller/vendor onboarding requirements before choosing.
- **Tax under MoR**: both Polar and Paddle, as Merchant of Record, assume responsibility for calculating/remitting global sales tax/VAT on the sale to the end customer — this is the core value prop and removes VAT-MOSS/US sales-tax-nexus burden from a solo VN operator. You still owe **Vietnamese personal/corporate income tax** on payouts received — that's a domestic VN tax-filing matter regardless of MoR choice, not something Polar/Paddle handle. Recommend confirming with a VN accountant familiar with foreign-platform income (freelance/business individual income tax registration).

**Recommendation**: Default to **Polar** given confirmed VN payout support and simpler onboarding for solo/indie sellers; keep Paddle as fallback if Polar's fee structure or feature set (e.g., API/usage-based billing for the API tier) proves insufficient — verify Paddle VN seller eligibility directly before ruling it in or out.

## 5. Risk Register

| Risk | Likelihood | Impact | Mitigation | Priority |
|---|---|---|---|---|
| AdSense rejection ("low value content") | High (near-certain on day 1) | Medium (delays highest-RPM revenue) | Build content depth first; launch on Ezoic/tier-2 meanwhile | MVP |
| CSAM uploaded to Pro-tier server storage | Low-Medium (nonzero for any UGC upload tool) | Severe (criminal liability, hosting provider shutdown) | Cloudflare CSAM Scanning Tool (free) + TTL auto-delete + unguessable keys + no indexing | MVP (before Pro tier ships) |
| Copyrighted content processed/displayed publicly | Medium | Medium (AdSense ban, takedown notices) | No public share/gallery in MVP; DMCA agent registration once server storage exists | MVP-adjacent (register DMCA agent when Pro ships) |
| COEP breaks ad serving on WASM tool page | High (if COEP applied naively) | Medium (lost ad revenue on tool pages) | Isolate WASM-threaded routes from ad-bearing routes; prefer single-thread WASM where feasible | MVP (architecture decision) |
| EU ads served without certified CMP | High (default state) | Medium (50-70% RPM loss, potential GDPR fine exposure) | Integrate Google-certified CMP before enabling any ads to EU traffic | MVP |
| DSA reclassification if public sharing added later | Low now, rises if roadmap adds galleries | Medium-High (heavier compliance duties) | Keep Pro-tier storage private/non-shareable in MVP; flag as design constraint | Later (roadmap gate) |
| Paddle VN seller eligibility unresolved | N/A (info gap) | Low (Polar is viable fallback) | Confirm directly with Paddle before deciding MoR, or just default to Polar | Later (pre-payments) |
| VN personal income tax on MoR payouts unhandled | Medium | Medium (tax compliance risk domestically) | Consult VN accountant before first payout | Later (pre-payments) |

## Unresolved Questions
1. Paddle's actual seller (not buyer) onboarding eligibility for Vietnam-based individuals — not confirmed this session; Polar is confirmed and can be the default.
2. Whether `COEP: credentialless` is fully compatible with GPT/AdSense today (Google's own docs only mention the reverse Origin Trial workaround, not credentialless, for ads specifically) — needs a hands-on test before committing to architecture.
3. Monumetric's actual 2026 pageview threshold — not verified with a current source this session.
4. Exact current list of Google-certified CMP vendors for 2026 — verify at time of implementation, list changes.
5. Whether any AdSense-alternative tier-2 network (Adsterra/PropellerAds) ad formats would materially hurt Core Web Vitals/UX enough to matter for later AdSense re-application — worth a follow-up check closer to launch.
