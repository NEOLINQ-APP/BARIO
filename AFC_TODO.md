# AFC Logistics — Task List

Tasks specific to **afclogistics.ca** (marketing, leads, ops) — separate from BARIO's own engineering backlog in `TODO.md`.

**How this works:**
- Add items here any time, in plain language — doesn't need to be formatted.
- Claude checks this file each session and can work through it.
- **Before taking any real-world action** (sending an email, posting to social, calling an API that changes something live, spending money, etc.), Claude will ask you first and describe exactly what it's about to do. Once you say go, it proceeds without re-asking for that same approved task.
- Check items off yourself with `[x]` any time you handle something outside a session — Claude will also check things off once it completes an approved task.

## Open
- [ ] Generate real leads and send outreach emails **today**, aiming for responses. *Note: lead-drafting already exists (see [[bario_crm_reseller_architecture]] — 125 real AFC leads in the CRM with AI-drafted outreach), but actual sending is blocked — afclogistics.ca doesn't have a verified sending domain/mailbox wired up yet. That's the first thing to unblock before "send today" is possible.*
- [ ] Switch `afclogistics.ca`'s nameservers at Hostinger (its registrar) to `aron.ns.cloudflare.com` / `renan.ns.cloudflare.com` — needed to finish the BARIO migration.
- [ ] Configure real SMTP credentials for `afc-backend` (`.env` has `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` all commented out) — needed for password-reset emails and auto-emailing approved drivers their login.
- [ ] Decommission the old `afclogistics.ca` nginx vhost + cert on the VPS — after the migration is confirmed stable.

## Done

