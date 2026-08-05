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
- [ ] Verify the property in **Google Search Console** and submit a sitemap, even
      a two-URL one. Phase 9 replaces it with the generated sitemap.

## 2. Hosting tier — decide deliberately, not by drift

Unresolved. It needs a decision before the first real deploy.

- **Vercel Hobby is not an option.** It forbids commercial use, and an
  ad-supported site is commercial use.
- **Vercel Pro** is $20/mo before bandwidth, against a stated $20-50/mo infra
  budget. Bandwidth is the metered dimension and this payload is unusually heavy:
  gifski `.wasm` is ~120 KB gzip, plus `modern-gif` and `mediabunny` per session.
- **Cloudflare Pages** is the live alternative. It does *not* collide with
  anything in the current config — `output: "export"` was rejected for proxy
  reasons, and Pages runs the Next runtime rather than requiring a static export.

Whichever is chosen:

- [ ] Model expected monthly bandwidth against the budget before committing
- [ ] Confirm `.wasm` is served **compressed** with a long cache from the CDN edge
      — it dominates the byte cost. The app already sets
      `Cache-Control: public, max-age=31536000, immutable` on `/wasm/<version>/*`
- [ ] Set `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_SOURCE_REPO_URL` in the host's
      environment

## 3. Public repository — an AGPL obligation, not a preference

- [ ] Create the repository and make it **public**
- [ ] Update `NEXT_PUBLIC_SOURCE_REPO_URL` if the slug differs from `pzgif/pzgif`
- [ ] Confirm the CI `source-offer` job passes on `main`
- [ ] **Wire `pnpm check:source-sha` ahead of the deploy step** once a host is
      chosen. Today it gates `main` in CI; there is no deploy step for it to
      block yet, so the guarantee is only as strong as that ordering.

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
- [ ] **Named operator for the About page.** Required before any ad-network
      application, the Contact page, GDPR controller identification, and a DMCA
      agent if one is ever needed. It also has to appear in `LICENSE-CONTENT`,
      which currently says only "the PZGIF operator".
- [ ] **Email Mediavine about Journey** and ask whether it works on Next.js. It is
      the only fallback if AdSense rejects, and the answer takes one email.

## 5. Not needed yet

Sentry, the CMP account and any ad-network application are Phase 10. Nothing in
Phase 2 depends on them.
