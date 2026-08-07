# Infrastructure runbook

Status: **open** (created 2026-08-05, Phase 2)

Everything in this file is outside the repository — it needs an account, a DNS
record or a payment method, so it cannot be done from a code change. The
application code for Phase 2 is complete and waiting on these.

The clock argument, restated because it is the reason for the ordering: this is a
12-18 month SEO compounding play and the binding resource is **indexed age, not
code**. A registered-but-parked domain earns none. Every day `pzgif.com` does not
serve is a day off the front of that curve.

---

## 1. Day one — get the domain serving

- [ ] Point `pzgif.com` nameservers at Cloudflare
- [ ] Confirm TLS is live (Full (strict) once the origin has a certificate)
- [ ] Turn on **Always Use HTTPS** and **HSTS**

      The app deliberately does not send `upgrade-insecure-requests` or
      `Strict-Transport-Security`. Both misbehave on loopback and plain-HTTP
      staging origins — `upgrade-insecure-requests` breaks WebKit E2E outright,
      and app-level HSTS would pin `localhost` to HTTPS on every developer
      machine. Transport enforcement belongs at the edge.

- [ ] Deploy the app. The homepage shell serves as the holding page; it renders
      with no engine and no ads.
- [ ] Verify the property in **Google Search Console** and submit the sitemap —
      the step-by-step is §2c, and the sitemap is already generated from the
      registry rather than the two-URL placeholder this line used to assume.

## 2. Hosting tier — **decided 2026-08-07: Cloudflare Workers**

Verified before committing to it, not after:

- `@opennextjs/cloudflare@1.20.2` declares `next: ">=15.5.21 <16 || >=16.2.11"`;
  this repo is on 16.3.0.
- A workerd preview serves all six routes, keeps the CSP intact, sets no COOP or
  COEP, and 404s `/dev/states` and `/__bench`.
- Bandwidth is free, which is the metered dimension this payload is worst on.

Two things it cost, both recorded where they will be found:

1. **`src/proxy.ts` had to become `src/middleware.ts`.** The adapter rejects a
   Node.js proxy at build time and Next 16's `proxy.ts` is Node-only. The
   deprecated name still works and runs on the Edge runtime. Rename it forward
   when the adapter supports Node proxies; the file says so.
2. **`public/_headers` now exists.** Workers Assets answers static-file requests
   without invoking the Worker, so `headers()` in `next.config.ts` cannot reach
   `/wasm/*` or `/_next/static/*` — both were coming back
   `max-age=0, must-revalidate` in preview. Keep the two in sync.

Vercel Pro ($20/mo before bandwidth) stays the costed fallback if Next removes
`middleware.ts` before the adapter catches up.

<details>
<summary>The original comparison, kept for the reasoning</summary>


- **Vercel Hobby is not an option.** It forbids commercial use, and an
  ad-supported site is commercial use.
- **Vercel Pro** is $20/mo before bandwidth, against a stated $20-50/mo infra
  budget. Bandwidth is the metered dimension and this payload is unusually heavy:
  gifski `.wasm` is ~120 KB gzip, plus `modern-gif` and `mediabunny` per session.
- **Cloudflare Pages** is the live alternative. It does *not* collide with
  anything in the current config — `output: "export"` was rejected for proxy
  reasons, and Pages runs the Next runtime rather than requiring a static export.

</details>

Still open on the chosen host:

- [ ] Model expected monthly bandwidth against the budget before committing
- [x] Confirm `.wasm` is served **compressed** with a long cache from the CDN edge
      — it dominates the byte cost. `public/_headers` sets
      `Cache-Control: public, max-age=31536000, immutable` on `/wasm/*`, verified
      in a workerd preview
- [ ] Set `NEXT_PUBLIC_SITE_URL` in the host's environment.
      `NEXT_PUBLIC_SOURCE_REPO_URL` is **not** needed — `source-repo.json` now
      carries the correct default, and the variable is only an override

## 2b. Deploying — the operator sequence

Everything above this line is a decision. This is the sequence.

```bash
pnpm preview          # workerd, locally. Do this before every first-of-day deploy.
wrangler login        # once per machine
pnpm deploy           # check:source-sha → build → ship
```

`pnpm deploy` runs `check:source-sha` **first**, everywhere — it resolves the
commit the same way the build does, falling back to `git rev-parse HEAD`, and
fetches it anonymously from the public repo. A deploy of an unpushed commit fails
before it builds. It used to exit 0 outside CI, which made a hand-run deploy the
one ungated path; that is fixed.

Attach the custom domain in **Workers → pzgif → Settings → Domains & Routes**.
`workers_dev` is off in `wrangler.jsonc`, so until a domain is attached the Worker
serves nothing — that is deliberate, and better than a crawlable
`*.workers.dev` duplicate of the whole site.

If you wire **Workers Builds** (deploy on push to `main`) rather than deploying
from your machine, set:

| Field | Value |
|---|---|
| Build command | `pnpm cf:build` |
| Deploy command | `pnpm check:source-sha && npx wrangler deploy` |

The gate belongs in the *deploy* command, not the build command — Workers Builds
runs the build first, and a bundle that is built but blocked from shipping is the
outcome this ordering wants.

Set in the Cloudflare dashboard, **build environment** (these are inlined at
build time, not read at runtime — each change needs a redeploy):

| Variable | Value | Why |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://pzgif.com` | canonical URLs, sitemap, robots |
| `NEXT_PUBLIC_ADS_ENABLED` | *unset* | Phase 10 sets it to `1`; see §5 |

`WORKERS_CI_COMMIT_SHA` and `CI` are injected by Workers Builds — do not set them.

## 2c. Search Console — after the first deploy, not before

Index age is the binding resource for this product, so this is the same-day task.

- [ ] Add `pzgif.com` as a **Domain property** in Google Search Console. Domain,
      not URL-prefix: it covers `www`, apex, http and https in one, so it does not
      have to be redone when any of those change.
- [ ] Verify by DNS TXT record. The nameservers are already at Cloudflare from §1,
      so this is one record in the same dashboard.
- [ ] Submit `https://pzgif.com/sitemap.xml`.
- [ ] Confirm the sitemap lists exactly the six live URLs — homepage plus the five
      GIF→GIF tools. It is generated from `liveRoutes()` in the registry, so a
      seventh appearing means a tool was marked live before its page shipped.
- [ ] Request indexing for the homepage. Do not bulk-request the rest; the sitemap
      is the mechanism and manual requests are rate-limited.
- [ ] Check Coverage after ~48h. `/dev/states` and `/__bench` must not appear —
      they 404 in production now, which is stronger than the `noindex` that used
      to be the only defence.

## 3. Public repository — an AGPL obligation, not a preference

- [x] Create the repository and make it **public** — `github.com/jhin1m/pzgif`
- [x] Correct the repository URL. It was `pzgif/pzgif` in two hard-coded places
      and wrong in both, so the footer's Source link 404'd — an actual AGPL-3.0
      §6 violation from the first user who loaded `gifski-wasm`, not a cosmetic
      bug. The value now lives once, in `source-repo.json`.
- [x] Confirm the CI `source-offer` job passes on `main`
- [x] **Wire `pnpm check:source-sha` ahead of the deploy step** — `pnpm deploy`
      runs it first and refuses to continue if it fails. Note the caveat in §2b:
      the gate skips itself outside CI.

The footer "Source" link resolves to the exact commit the running bundle was
built from, because AGPL-3.0 §6 requires the Corresponding Source for the version
conveyed — a link to `main` breaks on any hotfix, promoted preview or rollback.
`scripts/check-source-sha.mjs` proves the commit is fetchable *anonymously* from
the public URL, which is the only version of the question that matters — a
private repo and a credentialled CI checkout both answer "yes" to the easy one.

Never commit a `.env`, key or credential. This applies always, but the window
between "repo created" and "repo audited" is where it actually goes wrong.

## 4. Blockers that belong to other phases but must start now

- [ ] **Real devices for Phase 1 gates G3/G4.** The whole memory model rests on an
      iPhone SE 3-class floor. Without that hardware the frame-buffer budgets are
      unvalidated fiction. This is a procurement blocker for Phase 1, not a
      Phase 11 question.
- [x] **Named operator for the About page.** Resolved 2026-08-07: **Louis Le**,
      an individual in **Australia**. Recorded in `src/lib/site-config.ts` as
      `OPERATOR_NAME` / `OPERATOR_LOCATION`, and carried through `NOTICE`,
      `LICENSE-CONTENT`, the About page, the Privacy Policy's controller section
      and the DMCA page. Governing law for the Terms is Australia; the venue
      clause is state-neutral until a state is chosen.
- [ ] **Email routing for `contact@pzgif.com`.** **Required before deploy, not
      before merge.** The Contact, Privacy, Terms and DMCA pages all publish this
      address, and it is the product's only support channel — a live site
      advertising an address that bounces is worse than one with no Contact page.
      Cloudflare Email Routing, free tier: add the MX records for `pzgif.com`,
      create the `contact@` rule, forward to the operator's inbox, then send a
      test message and confirm it arrives.
- [ ] **Email Mediavine about Journey** and ask whether it works on Next.js. It is
      the only fallback if AdSense rejects, and the answer takes one email.

## 5. Not needed yet

Sentry, the CMP account and any ad-network application are Phase 10. Nothing in
Phase 2 depends on them.

Until then `NEXT_PUBLIC_ADS_ENABLED` stays unset, and no ad slot renders at all —
see design-guidelines §8, amended 2026-08-07. Set it to `1` **in the build
environment** (it is inlined at build time, not read at runtime) in the same
deploy that adds the provider script; a redeploy is required either way.
