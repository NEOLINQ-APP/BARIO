# BARIO — Working TODO

Add items anywhere, any time. Claude checks this file and updates it as work gets done — check items off with `[x]` yourself if you handle something outside a session too.

## Blocked — needs something from you
- [ ] `SENTRY_API_TOKEN` — needed so the admin assistant's error feed actually works (currently shows "not connected").
- [ ] Twilio credentials (`TWILIO_ACCOUNT_SID`/auth token/phone number) — needed for SMS notifications on the admin assistant. No Twilio integration exists in the codebase yet.
- [ ] Switch `afclogistics.ca`'s nameservers at Hostinger (its registrar) to `aron.ns.cloudflare.com`/`renan.ns.cloudflare.com` — needed to finish that migration.
- [ ] Switch `rapturemedia.ca`'s nameservers at Bluehost (its registrar) to the same Cloudflare pair — needed to finish that migration.
- [ ] `afc-backend`'s SMTP isn't configured (`.env` has `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` all commented out) — needed for password-reset emails AND for auto-emailing approved drivers their login (currently falls back to showing the admin the password to send manually). Give me real SMTP credentials (Hostinger email for afclogistics.ca, or any provider) whenever you want this turned on.

## In progress
- [ ] `send.bario.ca` Resend verification — all 3 DNS records added (2026-07-27), status is `pending` (normal, just needs propagation time). Once it flips to `verified`, set `EMAIL_FROM` in Vercel prod and redeploy.
- [ ] **New reseller mail VPS** (`148.230.94.192`, key `~/.ssh/bario_mail_vps`) — **status corrected 2026-07-30, this entry was stale.** cPanel install succeeded technically but its license was illegitimate (a "sharedlicense" reseller script — refused to run it, real ToS violation risk); pivoted to Mailcow (open-source, Docker-based, no licensing cost) instead. VPS has since been **reimaged clean to Ubuntu 24.04.4 LTS** — confirmed via direct SSH check, zero cPanel remnants, port 25 outbound still open. **Nothing is installed yet** — not even Docker. Hostname reset to Hostinger's default (`srv1855941`); needs setting back to `reseller.bario.ca` as part of setup. Next real step: install Docker + Mailcow.
- [ ] Migrate `afclogistics.ca` (marketing frontend to BARIO) — CORS + `api.afclogistics.ca` nginx vhost live on the VPS. Frontend content prep/import to BARIO not done yet. Blocked on the nameserver switch above. **Important:** the current `afclogistics.ca` file being migrated is NOT just a marketing page — see the correction below.
- [ ] Finish `rapturemedia.ca` — content imported to its own BARIO site, Cloudflare zone now created and domain connected (2026-07-27, `verified: true` from Vercel). Blocked on the nameserver switch above. Still owe: "backup"/"download" folders in Jasmine's Media Library account, not done yet (unrelated to this domain, just noted here since it was raised in the same request).

## Done
- [x] Admin AI assistant at `/admin/assistant` (2026-07-27) — general-purpose Q&A, autonomous tool-calling for low-risk fixes (grant plan/storage, verify email, reset password, restore/publish a site, connect a domain), full audit log (`admin_actions_log`), prompt-injection guardrails, refund/cancel deliberately NOT wired as tools. Complaints intake built (`/api/support/contact`). File upload added to the customer support assistant for billing disputes. In-panel feed built; email + SMS notification channels still blocked (see above).
- [x] Spot-checked the 10 most recent signups (2026-07-27) — all verified, none stuck by the Resend bug.
- [x] Investigated `aryanarkcollection.com` — real Node.js e-commerce-style app on the VPS, not something you'd asked to migrate, documented only.
- [x] Added `POST /api/admin/users/create-site` after learning the hard way it was needed (see the `rapturemedia.ca`/`sunbuiltgroup.com` mixup, already resolved — `sunbuiltgroup.com`'s content was restored correctly).
- [x] X-Drive repricing + rebrand shipped and verified live (2026-07-27).
- [x] Removed the file-type restriction on X-Drive uploads (2026-07-27).
- [x] **`sunbuiltgroup.com` DNS cutover complete (2026-07-27)** — old VPS A records removed, `A @ → 76.76.21.21` + `CNAME www → cname.vercel-dns.com` live, all Hostinger email records (MX/DKIM/autoconfig/SPF/DMARC) untouched. Vercel's own verification check may take a bit to catch up but the DNS itself is correct and confirmed.
- [x] Got Cloudflare write access (2026-07-27) — token upgraded, unblocking everything above that used to say "blocked on Cloudflare token."
- [x] Dropped the TITANS Agency platform entirely per your instruction (2026-07-27) — not tracked here anymore, don't bring it back up.
- [x] **Correction (2026-07-27): `afclogistics.ca`'s single index.html is a full single-page app, not just marketing.** I only read its `<head>` early in this session and wrongly concluded "no admin/driver/customer UI exists" — built a redundant separate admin panel at `admin.afclogistics.ca` as a result. The real file already has working `page-admin`/`page-driver`/`page-customer`/`page-tracking` sections, all wired to the same real backend (JWT auth, `/api/*`). **My separate admin panel has been decommissioned** (nginx vhost + files removed) — the real one, live at `afclogistics.ca` → Admin (footer link, passcode + staff login gated), is the one that matters. See [[afc_logistics_admin_panel]] memory for the full correction and what's actually real vs. placeholder in that file.
- [x] **Fixed the 4 dead "Quick Actions" buttons (2026-07-27)** — removed 3 that duplicated existing real functionality (Assign Job Manually, Manage Users, View All Invoices), repurposed "Edit Rate Sheets" to open a new modal for setting each driver's standing $/% pay rate.
- [x] **Driver pay $/% + profit added to the REAL admin panel (2026-07-27)** — `users.default_pay_type`/`default_pay_value` (standing rate, editable via the new Rate Sheets modal), `jobs.driver_pay_type`/`driver_pay_value` (per-job, editable in Create Job). Auto-applied when a driver is assigned OR selected at job creation; overridable; recomputes automatically if price changes. Added Driver Pay + Profit columns to the Jobs table, and Driver Pay MTD / Profit MTD stat cards to the dashboard. Verified end-to-end via direct API calls (70% of $100 → $70 auto-applied, flat override, price-change recompute, and auto-apply-at-creation all confirmed with exact expected numbers).
- [x] **Verified the driver portal was already fully built and working (2026-07-27)** — asked to "work on it," but found (after reading the actual `renderDriverPortal()` function, not just placeholder HTML) it already does everything: accept/decline, pickup/in-transit/delivered status progression, POD photo upload, and auto-starting live GPS tracking the moment a driver has an active job. Verified the entire lifecycle end-to-end via direct API calls — nothing needed building.
- [x] **Added "Change My Password" to the real admin panel (2026-07-27)** — self-service password change for whoever's logged in, using the backend's existing (previously unused) `/api/auth/change-password`. Verified via API test.
- [x] **Fixed stale-cache confusion (2026-07-27)** — `afclogistics.ca`'s nginx never sent a `Cache-Control` header, so browsers could silently serve an old cached copy after a deploy. Added `Cache-Control: no-cache` to the HTML response so future updates show up on a normal refresh.
- [x] **Driver application & approval flow built (2026-07-27)** — public "Drive For Us" page (nav + mobile nav + footer links) collecting name/email/phone/vehicle info/license & insurance/experience & availability/notes → `POST /api/driver-applications` (new table, rate-limited, rejects duplicate emails). New admin "Driver Applications" review panel (pending count badge, full applicant details, Approve/Reject). Approving auto-generates a driver login; **emails it if SMTP is configured, otherwise shows the temp password in the admin panel to relay manually** (SMTP isn't set up on this backend yet — same class of gap as BARIO's Resend issue, but a separate system). Verified full cycle end-to-end: submit → duplicate rejected → admin sees it → approve → real driver account created → logs in successfully with the temp password; separately verified reject removes it from the pending list.

- [x] **VPS reselling (Hetzner) shipped and live, all 4 phases (2026-07-29)** — full plan at `C:\Users\surew\.claude\plans\unified-wishing-salamander.md`. Customers can order a self-managed VPS at `/dashboard/servers` → `/dashboard/servers/new` (Small/Medium/Large, monthly/annual/2yr/3yr billing, optional automatic-backups add-on, SSH key or one-time password), fully automated via a Stripe webhook extension (payment → auto-provision on Hetzner, with every account's first order held for manual admin review regardless of risk score; failed payment → suspend after Stripe's retries exhaust; cancellation → deprovision). 6 admin routes (list/approve/reject/retry-provision/force-delete/create) + `vps-reconcile` — this project's first-ever Vercel Cron, every 6h, catching missed webhooks before they silently cost real money. New `/legal/vps-aup` page — **explicitly marked DRAFT, still needs a real lawyer's review before this is legally solid.** Also added monthly/annual billing to the existing site plans (Starter/Business/Agency) while building this. **Still open:** exact VPS/annual pricing is placeholder (~$14.99–$59.99/mo + tiered discounts) pending your sign-off; Hetzner's own ToS re: white-label reselling hasn't been verified yet.

## Not started
- [ ] Wire admin alert emails (new complaint / autonomous action taken) once `EMAIL_FROM` is fixed
- [ ] Decommission old `sunbuiltgroup.com` nginx vhost + cert on the VPS (DNS cutover done — safe to do once you've confirmed the live site looks right)
- [ ] Decommission old `afclogistics.ca` nginx vhost + cert on the VPS (after its migration confirmed stable)
- [ ] Decommission old `rapturemedia.ca` nginx vhost + cert on the VPS (after its migration confirmed stable)

## New requests — need scoping before building

### Admin coupon/discount panel
- Confirmed: `/admin/gift-codes` already exists, but only grants free AI-builder credits via a generic code — no plan upgrades, no $/% discounts, no targeting a specific customer's email, no CRM integration.
- [ ] Extend it (or build alongside it) to: generate a code/discount tied to one specific client's email, admin can upgrade/downgrade or discount any user's plan ($ or %) on demand, pick-and-choose per user rather than a generic redeemable code.

### Mobile-accessible admin dev panel
- You want a bario.ca admin panel where you can edit code with Claude the way we're doing right now, from your phone.
- [ ] Needs scoping: is this "Claude Code accessible from a mobile browser" (a hosting/access problem) or "a simplified in-browser editor + chat built into bario.ca's admin section" (a real feature to build)? Different amounts of work.

### X-Drive — remaining pieces (repricing/rebrand/all-file-types already shipped, see Done above)
- [ ] Build a standalone webapp for clients to retrieve their content — **clarified: a PWA (installable, works on iOS/Android/PC/Mac)**, not necessarily a separate native app. The `/media` page already has a manifest (`media-manifest.json`) and is installable — needs checking whether that already satisfies this, or whether a genuinely separate experience is wanted.
- [ ] **Clarified: client-side / end-to-end encryption for stored files** (not "Signal encryption" literally — that's a messaging protocol, this means E2E file encryption). Significant architecture change — needs a real design conversation (key management, how encrypted files still get thumbnails/previews, whether this applies to all tiers or is a premium feature) before building.

### Auto-download for photos/videos (Amazon Photos / Google Drive / OneDrive style)
- Clarified scope: client opts in to auto-upload — when a new photo/video appears on their device, it automatically uploads/backs up into their X-Drive, same UX as Amazon Photos/Google Photos auto-backup.
- Also: users need full file management once it's in there — delete, copy, move, rename/edit.
- [ ] Not started. Auto-backup-on-device-change implies a companion mobile app or browser extension with device file-system access — needs scoping on what platform(s) first (this may overlap heavily with the X-Drive PWA above).

### Customer-facing "hPanel"-style dashboard
- [ ] You want a polished, Hostinger-hPanel-style dashboard inside customer accounts so they can find their services/products more easily, doubling as an upsell surface. Not started — needs a mockup/scope conversation before building.

### WordPress Migration & DNS Onboarding Workflow (full spec provided 2026-07-27)
Goal: end-to-end pipeline for WordPress users moving to BARIO — automate content ingestion, and make DNS/nameserver handoff painless, replacing the current fully-manual process used for [[jasmine_blessandseemusic_migration]].

**Phase 1 shipped 2026-07-29, but NOT as originally spec'd — pivoted from a WordPress plugin to a URL crawler, deliberately:**
- The original plan (WP plugin reads the DB, serializes posts/pages to JSON, BARIO re-renders them) doesn't actually work in general — a page's real visual output depends on its specific theme/page-builder/shortcodes, which BARIO can't reimplement for arbitrary WP sites. The proven approach (same one used manually for [[jasmine_blessandseemusic_migration]]) is exporting already-rendered HTML, not reconstructing pages from data.
- Built instead: `POST /api/sites/migrate` — user pastes their live site's URL (no WP admin access, no plugin install needed), BARIO crawls same-origin pages (capped at 25), rewrites internal links to BARIO's page-slug convention, re-hosts `<img>` assets to BARIO's own storage (Vercel Blob), and writes the result into `site_pages` (the multi-page raw-HTML hosting built earlier this project — so multi-page WP import already works, the "reality check" blocker noted below is resolved). Auto-assigns a subdomain and publishes immediately.
- Works for ANY platform (WordPress, Wix, Squarespace, hand-built), not just WordPress — much less friction for non-technical users than installing/configuring a plugin, and matches the original ask's own "or even other types of websites" wording.
- Gated to paid-tier accounts (checked before URL validation). SSRF-guarded (rejects private/loopback/cloud-metadata IPs before crawling).
- **Known v1 limitation, surfaced to the user in the result rather than hidden:** stylesheets/scripts are resolved to absolute URLs but not re-hosted, so visual styling still depends on the original site staying online — only images are truly independent so far. A near-term follow-up would extend re-hosting to CSS/JS/fonts for full independence.
- Live-tested end-to-end against a real BARIO client site (blessandseemusic.com, 5 pages, 13 images) — all pages crawled correctly, live within ~7 seconds.
- UI: `MigrateSitePanel` on `/dashboard/websites` — locked/upgrade-prompt card for free tier, working form + live result summary for paid tier.

**Phase 2 — Guided nameserver-delegation onboarding:**
- Interactive wizard shown after a migration payload arrives, or when a Business/Agency-plan site is created.
- WHOIS-based registrar detection → tailored step-by-step visual instructions per registrar (GoDaddy, Namecheap, Cloudflare, etc.).
- Guide user to switch nameservers to BARIO's managed ones (once), rather than manual A/CNAME records.
- Background propagation checker; once propagated, auto-provision SSL and manage all subsequent subdomains/routing — no more touching the old host.
- Note: this is a different DNS model than what's built today (BARIO currently auto-provisions a *Cloudflare* zone per custom domain and asks for A/CNAME records or Cloudflare nameservers specifically — this phase describes BARIO having its *own* managed nameservers customers delegate to directly, a bigger architectural shift).

**Phase 3 — Registrar OAuth (future growth, not near-term):**
- Direct OAuth integrations with major registrars (Cloudflare, GoDaddy, Namecheap) so nameserver delegation is one click ("Connect with GoDaddy") instead of manual copying, no credential sharing.

- [ ] Not started — this is a multi-week feature, not a quick add. Recommend starting a dedicated planning session for Phase 1 alone once the multi-page hosting question above is resolved, rather than scoping all 3 phases at once.

## Deferred / bigger ideas (not scheduled)
- [ ] White-label Hostinger email under BARIO branding (webmail portal, no "Hostinger" visible to clients) — tied to the new reseller mail VPS above, once cPanel is actually installed and running.
- [ ] Unified admin panel to monitor all ecosystem DBs/services (BARIO, CRM, n8n) for errors — failsafe = alert + revert only, never autonomous fixes
- [ ] FLO rebrand of Twenty CRM (paused by you 2026-07-24)

need to know how to access afclogistics and sunbuiltgroup.com CRM login and to make sure they have their own access to their own. I need instruction on how to use it and login and set it up properly so the Ai will be doing their jobs.
