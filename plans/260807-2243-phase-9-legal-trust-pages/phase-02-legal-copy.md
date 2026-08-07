---
phase: 2
title: "The six content files"
status: complete
---

# Phase 2: The six content files

Six hand-written `src/content/legal/*.json` files. Covered by `LICENSE-CONTENT`,
not the AGPL — that is why they are data and not `.tsx`.

**Voice:** the wireframe's, and the tool pages': plain, specific, second person,
no legalese theatre. A visitor who reads the Privacy Policy should come away
understanding the product better, not worse. Where the law wants a term of art,
use it and then say what it means.

**The hard rule:** every clause describes what the code actually does. The
storage table in `plan.md` is the source of truth. A policy that claims
server-side processing on a site that has no server is worse than no policy — it
is a false statement in the one document a reviewer reads for honesty.

---

## `about.json`

The E-E-A-T page, and the cheapest thing that moves an ad-network approval.

- **Louis Le, solo developer, based in Australia.** Named, not "a small team".
- Why PZGIF exists: every competitor uploads your file to a server to do work a
  browser can now do itself. Say the specific thing — WASM decoders and encoders
  got good enough that the upload step is a habit, not a requirement.
- What "runs in your browser" means concretely, and the one honest limit: your
  device does the work, so a phone will refuse a job a laptop accepts.
- The AGPL position: the frontend is AGPL-3.0 permanently because `gifski-wasm`
  is AGPL and shipping it to a browser is conveyance. Link the source. This is a
  trust asset — "you can read every line that touches your file" — not a footnote.
- No accounts, no upload, no Pro tier gate on the free tools. Ads are the revenue.
  Say that out loud; a reader who understands the model trusts the model.
- Contact: `contact@pzgif.com`.

Target 450-600 words.

## `contact.json`

Short and useful, not a form. There is no backend, so there is no form.

- `contact@pzgif.com`, and what it is genuinely for: a tool that refused your
  file, a bug, a takedown, a privacy request, press.
- **Set the expectation honestly.** One person, best-effort, no SLA.
- What to include when a tool fails — browser + version, OS, roughly how big the
  file was, what the error said. Per Phase 4's error taxonomy this is the
  product's only support channel; a user whose job was refused currently has
  nowhere to go.
- **Do not paste your file into an email.** The whole point is that it never
  leaves your device, and an email would be the first time it did.
- Response addresses for the specific paths: privacy requests and DMCA notices go
  to the same inbox, named here so the other pages can point at one place.

Target 250-350 words.

## `privacy.json`

The longest and the one most likely to be read adversarially.

Structure:

1. **The short version.** Your files are never uploaded. There is no account.
   There is no server that sees your media. Everything below is about the small
   amount of ordinary web data a website unavoidably touches.
2. **Controller.** Louis Le, Australia. `contact@pzgif.com`.
3. **What happens to your files.** Decoded, processed and encoded by code running
   in your tab. Named mechanisms, because vagueness reads as evasion:
   - Cache Storage holds the app shell and the WASM binaries so the site works offline
   - `localStorage` holds one value: light or dark
   - the tool-to-tool handoff is **not stored at all** — `pending-file.ts` is an
     in-memory module singleton, so the file crosses the navigation in the page's
     own memory and is gone on reload. Do not write "IndexedDB" here; the first
     draft did, on the strength of a comment in that file that *rejects* it
   - neither stored item leaves the device, and neither is a cookie
4. **Server logs.** The host (Cloudflare) records the ordinary request metadata
   any web server records — IP, user agent, URL, timestamp. Say the legal basis
   (legitimate interest: serving the site and blocking abuse) and that it is not
   used to build a profile.
5. **Analytics and advertising — not live today.** Written now so the page does
   not need amending on activation day. Describe: a cookieless product beacon
   with no personal data, a consent-gated analytics layer, and a consent-gated ad
   network that may set personalisation cookies. Point at the Cookie Policy.
   Explicitly: **nothing in this paragraph is running yet.**
6. **Australian position.** The Privacy Act 1988 (Cth) small-business exemption
   likely applies to a solo operator under the AU$3M turnover threshold. Say that,
   then say PZGIF **commits to the Australian Privacy Principles anyway** and to
   the Notifiable Data Breaches scheme. Claiming an obligation you do not have is
   fine; hiding an exemption you rely on is not.
7. **GDPR, for EU/UK visitors.** Rights under Arts. 15-21 and how to exercise them
   (one email). **Art. 27 EU representative: assessed, exemption relied on** —
   processing is occasional, involves no special-category data and poses low risk
   to rights and freedoms, so Art. 27(2)(a) applies. State the intent to revisit
   if analytics volume or ad personalisation changes that assessment. The parent
   phase doc is explicit that an omission here is worse than either answer.
8. **Children.** Not directed at under-13s; no knowing collection.
9. **Changes.** Dated at the top; material changes get a note.

Target 900-1200 words.

## `cookies.json`

- **Open with the true state: PZGIF sets no cookies.** Not "we use only essential
  cookies" — none. Verified by the Phase 3 guard, so the claim cannot rot.
- Distinguish cookies from the local storage the site *does* use — the same two
  named mechanisms as the Privacy Policy, and no more. Reason: a reader who opens
  DevTools should find exactly what this page said they would. Listing an entry
  they will not find is the same defect as omitting one they will.
- What will change when advertising ships: the consent bar, the categories
  (necessary / analytics / advertising), that non-necessary categories are
  **off until you accept**, and that the choice is revisitable.
- Link Privacy and Contact.

Target 350-500 words.

## `terms.json`

- **Plain-language summary first**, then the clauses. The summary is not the
  legally operative text and says so.
- Licence to use the tools: free, as-is, no account.
- Acceptable use, minimal — Acceptable Use is a later page, so this carries only
  the floor: do not use the site to process material you have no right to
  process, and do not try to break it for other people.
- **Your content stays yours.** No licence is granted to PZGIF over anything you
  process, because PZGIF never receives it. This clause is unusual and worth
  stating loudly; every competitor's terms take a broad licence here.
- Site copy and brand assets are `LICENSE-CONTENT`, all rights reserved. The code
  is AGPL-3.0 and here is the repository. Two licences, disjoint file sets.
- **Disclaimer and liability, with the Australian Consumer Law carve-out.** The
  guarantees under the ACL cannot be excluded; where they apply, liability is
  limited to resupply of the service. Any disclaimer written without this carve-out
  is void in Australia and reads as copy-pasted US boilerplate.
- Third-party services: the host, and advertising when it ships.
- Changes, and **governing law: Australia** (venue clause left state-neutral —
  see the plan's open question).

Target 700-900 words.

## `dmca.json`

Honest framing, which is what makes it a trust signal rather than filler.

- **PZGIF hosts no user content.** Nothing is uploaded, so there is nothing on a
  server to take down. Say it in the first paragraph; a boilerplate DMCA page
  claiming a hosting relationship that does not exist is a tell.
- What *is* takedown-able: the site's own pages, copy, sample media and brand assets.
- How to send a notice: the six elements of a valid 17 U.S.C. §512(c)(3) notice,
  listed, sent to `contact@pzgif.com`.
- Counter-notice path.
- Repeat-infringer statement, scoped honestly to what exists.
- Note the operator is in Australia and the equivalent scheme is the Copyright Act
  1968 safe-harbour regime; DMCA-form notices are accepted regardless.
- Misrepresentation warning — §512(f) penalties.

Target 450-600 words.

---

## Acceptance

- Six files, each validating against `legalContent()`
- **No paragraph appears in two files.** Cross-references are links, not repeats
- `Louis Le`, `Australia` and `contact@pzgif.com` are spelled identically everywhere
- No sentence describes behaviour the codebase does not have
- Read all six side by side before finishing — templated drift is only visible in
  comparison, per the parent phase's risk table
