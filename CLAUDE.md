# BARIO — project context for Claude Code

This file loads automatically at the start of every Claude Code session in
this project, on any machine. It exists so a session started fresh (e.g. on
the VPS via code.bario.ca) has the same grounding a session on the main
desktop does — it won't have the prior conversation transcript, but it will
know what's built, why, and what's next.

**Also check `TODO.md`** in this same directory — that's the live, user-editable
cross-session task tracker for BARIO's own engineering work. This file
explains *how things work*; TODO.md tracks *what's currently in progress or
blocked*.

**Also check `SUNBUILT_TODO.md` and `AFC_TODO.md`** — separate per-client task
lists for sunbuiltgroup.com and afclogistics.ca (marketing/leads/ops, not
BARIO engineering). Same live/user-editable convention as TODO.md, with one
extra rule: always get explicit approval before taking any real-world action
from these lists (sending an email, posting to social, anything that spends
money or is visible outside this session) — describe exactly what you're
about to do, wait for a go-ahead, then proceed and check the item off.

## What Bario is

A hosting + AI website-builder SaaS for Canadian businesses (bario.ca).
Next.js 14 App Router, deployed on Vercel, Postgres via Neon
(`@neondatabase/serverless`, raw tagged-SQL — no ORM/Prisma). Auth is
session-cookie based (`lib/session.ts`).

## Core architecture

- **`lib/db.ts`** is the schema-as-code — `ensureSchema()` runs idempotent
  `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` on
  every cold start. There is no separate migration system; add columns/tables
  there.
- **Sites** (`sites` table) have two content modes: `sections` (the Zeus
  AI/manual builder, stored as `sections_json`) or `template` (a single
  `raw_html` blob, imported via `/api/sites/import-html`).
- **Multi-page sites**: additive `site_pages` table (site_id + slug + raw_html
  + is_home). A site with zero rows there renders exactly as it always has —
  `app/site/[domain]/[[...path]]/route.ts` only does per-path lookup when
  `site_pages` rows exist for that site. This was built specifically to keep
  zero regression risk for every pre-existing single-page site.
- **Serving**: `middleware.ts` rewrites any non-bario.ca hostname to
  `/site/${hostname}${path}` (path IS preserved — this used to not be true,
  changed alongside multi-page support). The route handler looks up the site
  by `subdomain` (for `*.bario.ca`) or `custom_domain` + `domain_status =
  'verified'` (for a connected custom domain).
- **Domain verification gotcha**: DNS being correctly pointed at Vercel does
  NOT mean `sites.domain_status` becomes `'verified'` automatically — that
  only happens when `/api/sites/domain/verify` (session-authed) or its admin
  equivalent `/api/admin/users/verify-domain` actually runs. This has bitten
  multiple client migrations (sunbuiltgroup.com, rapturemedia.ca,
  blessandseemusic.com) — DNS was fine, the site just 404'd until someone ran
  the verify check. If a connected custom domain is 404ing and DNS looks
  correct, check `domain_status` in the DB first.
- **X-Drive** (`media_assets` table) is the customer-facing file storage
  product (rebranded from "Media Library"). All file types allowed, no
  restriction. Supports optional **true end-to-end encryption** — see
  `lib/e2eCrypto.ts` for the key model (client-generated MEK, wrapped by a
  passphrase-derived key AND a recovery-code-derived key; server never sees
  plaintext of either). `MediaLibrary.tsx` also has folder-watch auto-upload
  via the File System Access API (Chrome/Edge only, foreground-tab-only —
  there is no way for a website to get real background sync; that needs a
  native app, which is explicitly a separate, unscoped project).
- **Admin tooling** (`app/api/admin/users/*`, `lib/admin.ts`): every route is
  gated by `requireAdmin()`, which accepts either a logged-in admin session OR
  a `Authorization: Bearer <BARIO_ADMIN_API_KEY>` header — the latter is what
  lets Claude (or any script) drive account-level operations (grant a plan,
  import HTML/pages, connect a domain, verify a domain, upload to someone's
  X-Drive, etc.) without a browser session. The pattern established: whenever
  a session-only route blocks something the admin legitimately needs to do on
  a customer's behalf, add a Bearer-gated equivalent rather than working
  around it. All admin actions log to `admin_actions_log` via
  `lib/adminActions.ts`.
- **`resolveSiteId()`** (`lib/siteAccess.ts`): when no explicit `siteId` is
  given, defaults to the account's most-recently-touched site. This means
  importing content onto an account that already has a site, without passing
  an explicit `siteId`, silently overwrites the existing one. Use
  `/api/admin/users/create-site` first, or `/api/admin/users/sites?email=` to
  look up existing site IDs before importing.

## Deploy

Deploys happen via `vercel --prod` run directly from a local checkout — NOT
via git push triggering a Vercel GitHub integration. Committing to git and
deploying are two separate steps; always do both when shipping a real
feature (commit so other machines/sessions have the code, deploy so it's
live). Don't assume a commit is live, or that what's live is committed —
check both independently if unsure.

## Infrastructure this project touches

- **Main VPS** (`2.25.139.207`, also reachable via its Hostinger-assigned
  hostname `srv1709559.hstgr.cloud` — confirmed 2026-08-18 via DNS lookup,
  same box, not a different server. Key `~/.ssh/bario_vps`): client sites
  migrated off it onto Bario (afclogistics.ca, sunbuiltgroup.com), n8n,
  `miko-voice` (Victoria's voice AI backend — see below), and
  `code.bario.ca` (a code-server instance for phone/browser-based Claude
  Code access, set up 2026-07-27 — nginx + certbot in front of it,
  password-protected). **Twenty CRM is fully gone from this platform as of
  2026-08-20** — every stack (the multi-workspace reseller platform, an old
  unrelated `crm.neolinq.pro` instance, and both business-line stacks that
  used to live on the Hetzner box below) was found to hold zero real
  external customer data, backed up to MinIO, and fully removed
  (containers, images, pgdata, and the `crm-provision-agent` PM2 service
  that stood up new ones) — see the Victoria section below for what
  replaced it. **This box still runs genuinely close to its memory limit**
  (8GB RAM) — real OOM/thrashing incident 2026-08-16 from adding 2 CRM
  stacks here (load average 74, swap maxed, every service degraded until
  they were removed) is the reason that ceiling gets taken seriously. **Do
  not add another heavy service here** (a Docker-Compose app, another
  always-on Node service) without checking `free -h`/`uptime` first — put
  new heavy services on the Hetzner replacement box instead (next bullet).
- **Hetzner replacement VPS** (`46.224.28.213`, key `~/.ssh/bario_vps2`,
  8vCPU/16GB, plenty of headroom): the intended eventual replacement for the
  main VPS above (see `TODO.md`/memory for the full Hostinger→Hetzner
  migration plan — most services haven't moved yet). Runs the self-hosted
  MinIO instance (`storage.bario.ca` — X-Drive and all internal backups).
  Unique Group Inc.'s and Bario.ca's dedicated Twenty CRM stacks used to run
  here too; both fully decommissioned 2026-08-20 alongside the rest of
  Twenty CRM (see above).
- **Mail reseller VPS** (`148.230.94.192`, key `~/.ssh/bario_mail_vps`,
  hostname `reseller.bario.ca`): cPanel/WHM installed 2026-07-27. Still needs
  license application, first-time WHM setup wizard, and white-labeling before
  it's a real product — not done yet as of this writing.
- **Cloudflare**: used for per-custom-domain zone creation (`lib/cloudflare.ts`),
  API token has write access (Zone:Edit, Account:Zone:Edit).

## Victoria — the voice AI receptionist/personal-assistant (miko-voice)

Answers 4 real phone lines (AFC Logistics, Sunbuilt Group, Unique Group
Inc., Bario.ca) via Twilio ConversationRelay, and is also Sherwin Mendoza's
own personal AI assistant (`bario.ca/victoria-app`) and his daughters Mya's
and Julianna's (`bario.ca/victoria-family/[member]`).

- **The actual brain, `server.js`, is NOT in this git repo.** It lives at
  `/var/www/miko-voice/server.js` on the **main** VPS (`2.25.139.207`),
  PM2-managed (`pm2 reload miko-voice`, not `restart`), reachable at
  `wss://miko-voice.bario.ca`. A session that only reads this repo will see
  none of Victoria's tool-calling logic, system prompts, or the
  `COMPANY_LINES`/`FULL_ACCESS_PERSON_KEYS` maps — you have to SSH in and
  read/edit that file directly. Safe-edit procedure: `scp` it down, edit
  locally with real tooling (not blind remote `sed`), `node --check` both
  locally and after re-uploading, back up the live file with a timestamp
  suffix first, `pm2 reload` (zero-downtime), then check
  `pm2 logs miko-voice --lines 15` for a clean restart with no new errors.
- **Live-turn model is `claude-haiku-4-5`, not Sonnet** — deliberately, for
  response speed on a real-time call. Any Anthropic-hosted server tool
  (`web_search`) needs `allowed_callers: ['direct']` set explicitly or Haiku
  400s — Sonnet doesn't need this, so don't "fix" this back out if the model
  ever changes again without re-checking.
- **Full personal-assistant access** (remember_note/contact,
  create_appointment, call_contact, send_sms-to-anyone, check_call_log) is
  restricted to exactly Sherwin + his two daughters Mya and Julianna
  (`FULL_ACCESS_PERSON_KEYS` in server.js) — explicitly narrower than the
  wider family/friends circle (`FAMILY_NUMBERS`/`KNOWN_CONTACTS`), which
  only gets a warm greeting + web_search. Each of the three has their own
  private notes/contacts/appointments namespace in `personal.json` — never
  merge them or let one person's data surface on another's call.
- **Cross-call CRM memory, all 4 business lines**: every call gets logged as
  a real `bo_customers`/`bo_notes` contact+note in that business's own
  Bario One CRM organization via `app/api/admin/victoria/log-call` (called
  from server.js at hangup), and a returning caller is briefed from their
  prior notes at call-setup time via
  `app/api/internal/victoria/caller-context`. All 4 businesses (not just
  AFC/Sunbuilt) route through this path now — see
  `lib/barioOneCrmCallLog.ts`'s `BARIO_ONE_CALL_LOG_ORG_IDS`. Twenty CRM
  (what this used to write to) is fully gone as of 2026-08-20 — see the
  main VPS entry above.

## Working conventions specific to this project

- One feature per git commit, descriptive messages explaining *why* not just
  *what*. Check `git log --oneline` for the established style before
  committing.
- Test against the *actual deployed production API* before calling a feature
  done, not just a local build — this project doesn't have a staging
  environment. For anything security-sensitive (like the E2E encryption),
  write a throwaway Node script that drives the real endpoints end-to-end
  (signup a disposable test account, verify its email via the admin route,
  exercise the full flow, clean up) rather than trusting code review alone.
- Never assume "DNS is correct" means "the site is live" — see the domain
  verification gotcha above.
