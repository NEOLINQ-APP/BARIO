# BARIO — Domains, Access & How-To Reference

Companion to `TODO.md`. This is the "where is everything and how do I get in" doc — actual secrets (API keys, passwords) live in Claude's memory (`bario_credentials_reference.md`, sensitive, not duplicated here) so there's one place to keep them current when they rotate. This doc tells you *what exists* and *how to use it*.

---

## Domains

| Domain | What it is | Hosted on | Notes |
|---|---|---|---|
| `bario.ca` | Main BARIO platform (marketing + app) | Vercel | Apex/`www` → Vercel. Nameservers on Cloudflare. |
| `*.bario.ca` | Customer subdomains (e.g. `janes-bakery.bario.ca`) | Vercel | Wildcard CNAME → Vercel. |
| `storage.bario.ca` | Shared admin file manager | Vercel | Same app, `/admin/storage`. |
| `send.bario.ca` | Outbound transactional email domain (Resend) | — | Verified and working since 2026-07-30. |
| `sandbox.bario.ca` / `*.sandbox.bario.ca` | Bario Build's live sandbox previews | Dedicated Hetzner host, Ashburn VA | Separate box from the main VPS — a sandbox escape can't reach CRM/n8n/other services. |
| `reseller.bario.ca` | Mailcow mail server (Bario's own email hosting) | Mail VPS (`148.230.94.192`) | Powers `/dashboard/email` (customer mailboxes) and webmail (SOGo, currently at `reseller.bario.ca/SOGo` — no branded URL yet). |
| `registrar.bario.ca` | Domain-reseller proxy (`registrar-proxy`) | Main VPS (`2.25.139.207`) | Forwards domain search/registration calls to Namecheap's API — exists because Namecheap requires a whitelisted calling IP that Vercel doesn't have. Currently pointed at Namecheap's **sandbox** (fake money) — see the Domains section below. |
| `crm.bario.ca`, `*.crm.bario.ca` | Twenty CRM (client-facing reseller stack, general) | Hostinger VPS | Isolated from your personal CRM (below). |
| `afc.crm.bario.ca` | AFC Logistics' own Twenty CRM instance | Main VPS (`2.25.139.207`), port 3011 | Separate DB/stack from Sunbuilt's — no shared workspace. |
| `sunbuilt.crm.bario.ca` | Sunbuilt Group's own Twenty CRM instance | Main VPS, port 3012 | Same as above. |
| `admin.bario.ca`, `hub.bario.ca` | Internal tools | Hostinger VPS (`2.25.139.207`) | Discovered in DNS records; exact purpose not yet documented — ask if unsure before changing. |
| `blessandseemusic.com` | Jasmine's site — migration to BARIO in progress | Bluehost (DNS not yet on Cloudflare) | See TODO.md. |
| `sunbuiltgroup.com` | Client site, real business | Cloudflare zone active, DNS cutover done | Website on BARIO/Vercel; **email still runs on Hostinger** (MX unchanged) — see the Email section below. |
| `afclogistics.ca` | Client site (logistics dispatch app) — migration planned | Hostinger VPS | Has a real backend (`afc-backend`) — frontend moves to BARIO, backend stays on VPS. Its own full admin/driver/customer portal already exists in its `index.html` — don't rebuild it. |
| `rapturemedia.ca` | Client site — migration planned | Hostinger VPS | Cloudflare zone created, domain connected/verified. |
| `neolinq.pro`, `crm.neolinq.pro` | Your separate personal CRM | Hostinger VPS | Explicitly NOT part of the BARIO/client-reseller CRM stack — don't touch when working on `crm.bario.ca`. |
| `aryanarkcollection.com` | Seen in VPS nginx config | Hostinger VPS | Not yet investigated/documented — ask before assuming what it is. |

---

## Admin access (you)

**Logging in:** go to `bario.ca/login`, sign in with `uniquegroup.org@gmail.com`. Your account is `is_admin`, which auto-grants full builder access, unlimited sites, and every paid feature — no plan/subscription needed on your own account.

**Admin panel** — `bario.ca/admin` (only visible/reachable if logged in as an admin account). Every admin feature is a card on this one page, not a separate sidebar item:

| Page | What it's for |
|---|---|
| `/admin/assistant` | The AI assistant — ask it anything, or describe an account issue and it'll fix low-risk stuff itself (plan/storage comps, email verification, password resets, restoring a broken site). Shows a live feed of recent complaints, signups, and the action audit log. Only works from a real logged-in browser session, never the API key. |
| `/admin/users` | Manually grant a plan or comp storage onto a specific customer's account. |
| `/admin/gift-codes` | Generate redeemable codes for free AI-builder credits. |
| `/admin/templates` | Add/remove the template gallery. |
| `/admin/storage` | Shared file manager (not customer-specific — internal assets like templates). |
| `/admin/marketing` | Review/approve AI-drafted social posts. |
| `/admin/vps` | Order review/approve/reject, force-delete, retry-provision for the VPS reseller product. |
| `/admin/dialer` | Bario Dialer — same softphone the 3 business PWAs use, from one place. |
| `/admin/crm-outreach` | AI-drafted outreach emails + reply-sentiment tracking for AFC/Sunbuilt's CRMs; Call button opens the matching business's dialer with the number pre-filled. |
| `/admin/build` | Bario Build session/sandbox admin views (in progress). |

**Scripted/API access** (what Claude uses to act on your behalf without a browser session): a Bearer API key (`BARIO_ADMIN_API_KEY`, rotates periodically, current value in Claude's memory) authorizes calls to `/api/admin/*` routes directly — templates, storage, granting plans, verifying emails, resetting passwords, connecting domains, restoring a site. The one exception is the admin assistant's chat endpoint itself, which only works from a real logged-in browser session, never the API key — that one takes real actions so it's deliberately harder to reach.

**The main Hostinger VPS** (`2.25.139.207`) — runs the CRM stacks (`afc-crm-stack`, `sunbuilt-crm-stack`), n8n, and the client sites still waiting on migration. SSH in with:
```
ssh -i ~/.ssh/bario_vps root@2.25.139.207
```
`pm2 list` shows running app processes, `ls /etc/nginx/sites-enabled/` shows every site being served from this box, `docker ps` shows the CRM stacks.

**The mail VPS** (`148.230.94.192`, hostname `reseller.bario.ca`) — runs Mailcow (Postfix/Dovecot/SOGo/Rspamd/etc., 18 containers):
```
ssh -i ~/.ssh/bario_mail_vps root@148.230.94.192
```

**Third-party dashboards** (log in with your own accounts — Claude only holds API tokens for these, not your dashboard passwords):
- **Cloudflare** (cloudflare.com) — DNS for all the domains above.
- **Resend** (resend.com) — transactional email sending + domain verification.
- **Vercel** (vercel.com, project `bario` under team `neolinq-apps-projects`) — deployments, environment variables.
- **OpenAI** (platform.openai.com) — powers Sky (the site builder), plus a primary role in Bario Build.
- **Anthropic** (console.anthropic.com) — powers Miko (both the CRM chat assistant and Bario Build's coding agent — same name, two separate systems) and is a fallback model for Bario Build. Also powers Claude Code itself, the assistant you're talking to right now when working on this codebase.
- **Twilio** (twilio.com) — Bario Dialer + WhatsApp templates. This is a **subaccount** (has its own `owner_account_sid`).
- **RunPod** (runpod.io) — GPU compute for Bario Studio's AI video/voiceover generation.
- **Hetzner** (hetzner.com) — VPS reseller product + Bario Build's dedicated sandbox host.

---

## The AI assistants — Sky, Miko (×2), and Claude Code

Three names, four systems — worth keeping straight:

| Name | What it is | Where it runs |
|---|---|---|
| **Sky** | The site-builder AI (formerly internally called "Zeus", then briefly "Bario AI" — renamed again 2026-08-02 to a real given name) | `app/api/builder/generate*` in this repo |
| **Miko** (Build) | Bario Build's coding agent — writes real files, runs real shell commands in a live sandbox | `app/api/build/agent/route.ts` |
| **Miko** (CRM) | The native AI chat assistant inside AFC's and Sunbuilt's Twenty CRM instances | Twenty CRM's own Agent framework, not this repo |
| **Miko** (Voice) | A real AI phone agent — answers calls and talks with Claude in real time | Dedicated number `+18254650880`, TwiML in this repo (`app/api/twilio/miko-voice`), WebSocket server on the main VPS (`miko-voice.bario.ca`, not this repo) |
| **Claude Code** | The assistant used to build and maintain BARIO itself (this doc, the codebase, deployments) | Runs from your machine — the `code.bario.ca` mobile code-server experiment was decommissioned 2026-08-02 (hard to use on a phone; see TODO.md) |

**2026-08-02 — all four got a real capability/knowledge bump, not just a rename:**
- Sky's and Build-Miko's system prompts now explicitly hold them to a professional copywriting/code-quality bar (real vocabulary, no generic filler) instead of leaving tone unspecified.
- Build-Miko's prompt now tells it which real, standard Python libraries to reach for when a generated app needs to produce PDF/Word/Excel/PowerPoint files (`pypdf`/`reportlab`, `python-docx`, `openpyxl`, `python-pptx`) rather than guessing at file formats.
- CRM-Miko's ask (real phone calls, sending email, tracking responses, sourcing leads) is bigger and only partly buildable today — see its own section below.
- Claude Code itself: installed Anthropic's full public example-skills repo (`github.com/anthropics/skills`) into `~/.claude/skills/` — document generation (PDF/DOCX/XLSX/PPTX), MCP server building, visual/algorithmic design, internal-comms writing, and more, all available in any future session.

## Bario Dialer — browser softphone (AFC / Sunbuilt / Unique Group)

Three separate installable PWAs, one per business, each locked to that business's own Twilio number:
- AFC Logistics: `bario.ca/admin/dialer/afc`
- Sunbuilt Group: `bario.ca/admin/dialer/sunbuilt`
- Unique Group Inc.: `bario.ca/admin/dialer/unique`

Install: open the link on the phone that needs it while logged into BARIO admin, tap "Install App" (or Safari's Share → Add to Home Screen on iOS). Each has a real dial pad, Contacts (pulled live from that business's CRM), Recents (real call history), and an **Internal** tab to ring either of the other two apps directly over the internet at no phone-carrier cost. Full details/history in memory (`bario_dialer`).

## Bario Studio — AI video/design editor

`bario.ca/dashboard/studio` — multi-track video editor, AI copilot chat, static design templates (Instagram/Facebook/X), print export (business cards/flyers/yard signs). AI video/voiceover generation runs on RunPod (see credentials). Text overlays don't yet export into the final MP4 (shows fine in the live preview only).

## Bario Build — AI app/website builder (beta)

`bario.ca/build/apps` — chat-driven AI agent that writes real project files and runs them in a live, isolated sandbox (Docker + gVisor on a dedicated Hetzner host, not StackBlitz WebContainers). Model fallback chain: OpenAI (primary) → Anthropic → xAI/Grok → Gemini (currently broken, 403 — see credentials memory).

## Email — Bario-hosted mailboxes + Hostinger clients

`bario.ca/dashboard/email` (new sidebar item, shipped 2026-08-02) — paid-plan customers with a verified custom domain can create real mailboxes (like `you@yourbusiness.com`) on Bario's own Mailcow server. Auto-provisions MX/SPF/DKIM DNS and shows webmail/IMAP/SMTP details on creation.

**For the 6 clients whose email still actually runs on Hostinger** (e.g. `sunbuiltgroup.com`): Hostinger's *webmail* can't be embedded or proxied under Bario's domain (it sends `X-Frame-Options: SAMEORIGIN` and sits behind a Cloudflare bot-challenge) — but Mailcow's own webmail (SOGo) has a native "add an external IMAP account" feature already turned on. Give the client a real Bario mailbox, have them add their Hostinger mailbox (`imap.hostinger.com`, port 993, SSL, their real Hostinger credentials) as an auxiliary account in SOGo's Mail settings — their Hostinger mail then shows up live inside Bario's own webmail login. Not yet confirmed whether replies send correctly as the Hostinger address (needs a real mailbox to test) — see `bario_mailcow` memory for the full writeup.

## CRM (Twenty CRM) — AFC Logistics & Sunbuilt Group

Two fully separate single-tenant Twenty CRM instances (own DB, own login, no shared workspace):
- **AFC Logistics**: `https://afc.crm.bario.ca` — `admin@afclogistics.ca` / `AfcLogistics2026!Secure`
- **Sunbuilt Group**: `https://sunbuilt.crm.bario.ca` — `admin@sunbuiltgroup.com` / `SunbuiltGroup2026!Secure`

Both have a native AI chat assistant named **Miko** built in (Twenty's own Agent framework, not a BARIO bolt-on) — it can discuss CRM data and draft (but not send) outreach/reply emails. If Miko stops responding, check that the `worker` container is running alongside the main app container — that's the most common cause (it processes chat as an async job).

---

## Database backups (self-hosted Postgres) — added 2026-08-20

Nightly `pg_dump`-to-MinIO backup scripts exist on both boxes (`/root/pg-backup.sh` on the main VPS, cron `0 8 * * *`; `/opt/bario-storage/pg-backup.sh` on Hetzner, cron `15 8 * * *`), uploading to the shared private `bario-db-backups` MinIO bucket (30-day expiration lifecycle set on the bucket; local copies pruned after 14 days). **As of 2026-08-20 both scripts have an empty stack list** — every self-hosted Twenty CRM stack that used to populate them (`crm-stack`, `crm-reseller-stack` on the main VPS; `unique-crm-stack`, `bario-crm-stack` on Hetzner) was found to hold zero real customer data (confirmed by reading each instance's actual Postgres tables directly — only Twenty's own default demo-seed contacts anywhere, plus 3 real contacts + 6 notes in `unique-crm-stack` specifically, migrated into Bario One's CRM first) and was fully decommissioned — see CLAUDE.md's Main VPS / Victoria sections for the full writeup. Final pre-deletion snapshots of all 4 stacks are the only copies left, still in the `bario-db-backups` bucket. Both scripts are kept in place (still cron'd) so a future self-hosted stack just needs an entry added to its `STACKS` map, no new backup plumbing required. To restore an old snapshot: `mc cp bariolocal/bario-db-backups/<stack>/<file>.tar.gz .` (alias `bariolocal` on the Hetzner box where MinIO itself runs, `bariomain` on the main VPS).

**Not yet covered — needs the user's help, not just infra access**: BARIO's own main Supabase database (hosts every customer site) and spott.ca's separate Supabase project. Both are plain Postgres underneath (`DATABASE_URL_UNPOOLED` in each project), so the exact same `pg_dump`-to-MinIO approach works — but that connection string is marked Sensitive in Vercel and comes back empty from `vercel env pull`/`.env.local`, so it has to come from the user directly (Supabase dashboard → Settings → Database) rather than being retrievable by Claude on its own.

---

## User-facing how-to (what your customers do)

**Sign up** — `bario.ca/signup`: email + password (min 8 characters). Creates the account immediately; most features need a verified email first (see below).

**Verify email** — after signup, a verification link is emailed (fixed 2026-07-30 — was broken for real inboxes; admin can still manually verify via `/admin/assistant` if ever needed). Until verified, the builder/Media Library are locked (`/dashboard` shows a "please verify your email" prompt with a resend button).

**Log in** — `bario.ca/login`. Forgot password → `bario.ca/forgot-password`.

**Build & publish a site** — `bario.ca/build`: Sky generates a site from a prompt, or start from a template (`bario.ca` template gallery). Once happy with it, publish from the builder — choose a free `yourname.bario.ca` subdomain, or (paid plans only) connect a custom domain from the dashboard's domain settings.

**Custom domain** — paid-plan customers only. They enter their domain, BARIO auto-provisions Cloudflare DNS and a Vercel cert; they either update nameservers to the ones shown or add the A/CNAME records manually at their own registrar. Domain must show `verified` before email (below) or anything domain-dependent will work.

**Email** — paid-plan customers, once their domain is verified: `/dashboard/email` → pick the domain, name the mailbox, set a password. Webmail/IMAP/SMTP details shown immediately.

**Media Library (X-Drive)** — `bario.ca/media`: photo/video/document storage separate from the site plan (its own tier, stackable with any site plan, all file types allowed). Family sharing lets an account owner invite others to share their storage tier at no extra cost (`bario.ca/family`).

**Servers** — `bario.ca/dashboard/servers`: self-managed VPS, ordered and auto-provisioned via Stripe checkout.

**Getting help** — the support chat bubble (bottom-right on `/dashboard` and `/media`) answers how-to questions and can reference their own plan/credits/storage. For anything it can't resolve (bugs, billing disputes), the "Report an issue" button inside that chat sends it straight to `support_messages`, reviewable by you in the admin assistant's feed — refunds/billing changes are always admin-reviewed, 24–72 hour turnaround, communicated to the customer as such.

---

## Open items

- No branded URL for webmail yet (`mail.bario.ca` reverse-proxied to SOGo) — currently only reachable at `reseller.bario.ca/SOGo`.
- **CRM-Miko's bigger ask (2026-08-02)**: real phone calls, sending email (not just drafting), tracking responses, and sourcing leads, plus a general communication-quality bump. Partly overlaps work that already exists (crm-leadgen cron drafts real outreach; `/admin/crm-outreach` tracks reply sentiment; Bario Dialer can place real calls) but CRM-Miko itself doesn't yet have hands on any of it — it can only chat/draft. Needs scoping before building: Twenty CRM does have a real custom-tool extension mechanism (`create-twenty-app`, ships TypeScript "AI skills and agents" to a workspace) that would let Miko actually trigger these rather than just discuss them, but that's a separate dev/deploy pipeline from this repo, not a quick prompt change.

---

*Keep this updated as things change — same expectation as `TODO.md` and the credentials file: if a domain moves, a route changes, or a new admin tool ships, update this doc in the same pass.*
