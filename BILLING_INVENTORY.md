# Billing inventory — every paid service across BARIO + Spott.ca

**Pulled live 2026-08-22.** Everything under "Verified" was fetched directly
from the provider's own API this session (Hostinger, Hetzner, Vercel), not
recalled from memory. Everything under "Known but unverified" is confirmed
to exist (a real API key/env var for it exists in production) but its actual
plan tier / monthly cost was not checked this pass. Re-pull before trusting
any number here as still-current — subscriptions get added, trials convert,
tiers change.

## Verified fixed/recurring costs

### Hostinger (domains, mailboxes, 2 of the VPS boxes)
Pulled via `GET /api/billing/v1/subscriptions` with the token in
[[bario_credentials_reference]] (see that file for how to re-pull).

| Item | Price | Billing | Status | Next billing | Created |
|---|---|---|---|---|---|
| KVM 4 (VPS) | $42.99 USD | monthly | active | 2026-08-25 | 2026-07-25 |
| KVM 2 (VPS) | $24.49 USD | monthly | active | 2026-08-27 | 2026-05-27 |
| Business Web Hosting | $203.88 USD | yearly | active | 2027-07-10 | 2026-04-24 |
| .PRO domain | $32.19 USD | yearly | active | 2027-05-17 | 2026-06-13 |
| .COM domain ×5 | $20.19 USD each | yearly | active | staggered through 2027 | — |
| .CA domain ×3 | $16.99 USD each | yearly | active | staggered through 2027 | — |
| .COM domain (cancelled) | — | — | cancelled | n/a | 2026-07-14 |
| Starter Business Email ×8 | $7.08–$35.40/yr each (post-trial) | yearly | **all still `in_trial`** | staggered, first converts 2027-04-24 | see raw pull |
| Reach 100 (email marketing add-on) | $17.88 USD | yearly | in_trial | 2027-05-22 | 2026-05-27 |
| Horizons Starter | $19.99/mo | monthly | cancelled | n/a | — |
| Agents Starter | $9.99/mo | monthly | cancelled | n/a | — |

**Real totals (active + in-trial, using post-trial renewal price):**
- Monthly-billed items: **$67.48/mo**
- Yearly-billed items (sum ÷ 12): **$47.98/mo equivalent** ($575.79/yr)
- **Combined run-rate once all trials convert: ≈ $115.46/mo ≈ $1,385.52/yr**

The 8 Business Email trials are the only thing that changes this number
significantly if left alone — they convert to real charges on their
individual anniversary dates through 2027 unless cancelled first.

### Hetzner Cloud (3 BARIO-infra servers, excluding real customer VPS orders)
Pulled via `GET /v1/servers` + `GET /v1/pricing` with `HETZNER_API_TOKEN`.

| Server | IP | Type | Monthly | Created | What's on it |
|---|---|---|---|---|---|
| `srv-90f87f7776.vps.bario.ca` | 178.104.58.155 | cx33 | $9.99 | 2026-08-06 | **Identified**: the live WordPress shared-hosting node (Product B) — multi-tenant Docker+Caddy, `wp_hosting_nodes` id `6620cdee-87e1-45d6-89e6-f60945583d32`. See [[bario_wp_shared_hosting]]. It's a real `vps_instances` order (medium tier, owned by the agency account `uniquegroup.org@gmail.com`, `app_type: 'blank'` — the WP-node-agent stack was installed manually on top, not via BARIO's automated WP flow) rather than a manually-provisioned box. **No local SSH key matches it** (its registered public key's comment is `wp-node-1`, not present in `~/.ssh/`) — access it via whatever machine/session originally set it up, or re-add a key through the node-agent if that's lost. |
| `srv-e1c44e8a4b.vps.bario.ca` | 46.224.28.213 | cx43 | $18.49 | 2026-08-08 | Confirmed: the "Hetzner replacement VPS", MinIO/storage.bario.ca (X-Drive + backups). Also a real `vps_instances` order (large tier, same owner). |
| `mail-host-1.bario.ca` | 91.98.116.193 | cx33 | $9.99 | 2026-08-22 | New Mailcow mail server, replaced the Hostinger box — see below. |

**Total: $38.47/mo** (was $48.97/mo before the sandbox host was deleted 2026-08-23 — see below). All 3 are real Hetzner Cloud servers, not billed through Hostinger. (A 4th server, `srv-f7e75b288c.vps.bario.ca`, appeared 2026-08-22 with a real `vps_instances` order id — a genuine paying customer's VPS, not BARIO's own infra, excluded from this table.)

**Sandbox host — DELETED 2026-08-23, full $20.49/mo saved.** Started as a
plan to consolidate `sandbox-host-us.bario.ca`'s workload onto the MinIO
box (`46.224.28.213`) rather than pay for 2 servers. Investigation found
the whole premise was moot: Bario Build (the only thing that ever used this
sandbox) was replaced by Adorable on 2026-08-17 (see TODO.md), and the box
had been sitting completely idle since — `SANDBOX_HOST_URL` has zero
references anywhere in the current codebase, zero Traefik access-log
entries in the 24h before deletion, zero new sandbox sessions in the 48h
before deletion. The 19 running containers on it were stale leftovers, not
real traffic. Deleted outright via the Hetzner API (server id `157898430`)
after confirming this — full $20.49/mo saved, not a partial win.

The isolation work done on the MinIO box while this was still framed as a
consolidation (a separate `sandbox-net` Docker network, `DOCKER-USER`
firewall rules blocking it from reaching MinIO, gVisor installed) is
harmless and was left in place unused, since nothing was ever actually
migrated there. **MinIO's `127.0.0.1`-only port rebind is a real, permanent
security improvement** (closes direct external/container access to
9000-9001, forces all traffic through nginx as intended) and was kept
regardless of the sandbox question.

### New: mail server migration (Hostinger → Hetzner), DONE 2026-08-22
Real production migration, fully executed and verified this session (not
just planned). Replaced the Hostinger-hosted Mailcow VPS (`148.230.94.192`,
"KVM 4", $42.99/mo) with a new Hetzner box (`91.98.116.193`, `cx33` in nbg1,
$9.99/mo) — same server type already used for the WP-hosting node, sized to
the old box's real observed usage (was only using 3.3GB/15GB RAM,
6.9GB/193GB disk).

**What was actually verified, not assumed**: Mailcow installed at the exact
same git commit as the source (avoids version-mismatch restore issues); a
raw filesystem tar-copy of the live MySQL data was tried first and
**silently produced an empty database** (0 rows) despite the restore script
reporting success — a real InnoDB-consistency gotcha with hot-copying a
live database's on-disk files. Fixed by using a proper `mysqldump
--single-transaction` instead, which restored all 8 real mailboxes across
7 domains correctly (verified via direct row counts and `doveadm mailbox
status` matching the source's real message counts exactly, not just "the
process exited 0"). DNS (`reseller.bario.ca` A record in Cloudflare) was
cut over only after that data was independently confirmed correct. Post
cutover: DNS resolves to the new IP, the new box has its own real
Let's Encrypt cert for `reseller.bario.ca` (confirmed via a live TLS
handshake, not just "acme container is running"), and IMAPS is reachable.

**Real savings once the old box is decommissioned: $33.00/mo ($42.99 → $9.99).**

**Known issue, unresolved**: SSH to the new mail box
(`91.98.116.193`, key `~/.ssh/bario_mail_vps2`) stopped working shortly
after the migration — same key that worked throughout setup now gets
`Permission denied (publickey,password)`. Investigate before relying on SSH
access to this box again.

**Do NOT cancel the old Hostinger "KVM 4" subscription yet** — wait until
the new box has been stable for a few days and the SSH issue above is
resolved (you may need Hostinger's own console/VNC access to the old box if
you ever need to get back into it once SSH there is also distrusted).

**Resolved**: the "Mail reseller VPS" (`148.230.94.192`, `reseller.bario.ca`,
Mailcow) is confirmed NOT one of these 3 Hetzner servers — it predates all of
them (provisioned 2026-07-27, before the earliest Hetzner box existed
2026-08-01) and isn't in this Hetzner account's server list at all. It's
provisioned through a different channel not itself checked this pass (a
separate Hetzner/other-provider account, or a manual one-off) — worth a
follow-up if its own billing needs auditing.

### Vercel (covers both bario.ca and spott.ca — one shared team)
Pulled via `GET /v2/teams/{teamId}` with `VERCEL_API_TOKEN`.

- **Plan: Pro**, 1 seat, base **$20/mo**, active since 2026-05-17.
- Plus **usage-based overages** on top of the included allowance — functions,
  bandwidth, Blob storage, sandboxes, image optimization, etc. Real historical
  overage amount not pulled this pass (would need the actual invoice/usage
  API, not just the plan config) — if the account has been running near or
  over its included allowance, the real monthly bill could be meaningfully
  above $20. Check the Vercel dashboard's Usage tab for the actual number.
- `analyticsSpendLimitInDollars: 500` — a spend cap is configured, so
  overages can't run away silently past $500/mo on analytics specifically.

## Known but unverified this pass (real API key exists in production; plan/cost not checked)

These are confirmed *in use* (found as real env vars on BARIO's and/or
Spott's Vercel projects) but nobody checked their actual billing dashboard
this session:

| Service | Where used | Likely cost model |
|---|---|---|
| **Supabase** (project `tqllzodsdwtsmsdrhwyk`) | Spott.ca's entire database/auth/storage | Free tier or Pro ($25/mo) — not confirmed which |
| **Anthropic API** | BARIO (Zeus/agent tooling) | Usage-based, no fixed fee |
| **OpenAI API** (2 separate keys, BARIO + Spott) | Luna/gpt-5.6-luna across Sparq, Victoria, listing AI, etc. | Usage-based, no fixed fee |
| **Google Gemini API** | Fallback provider, both apps | Usage-based, has a free tier |
| **xAI / Grok** | Bario Build model fallback | Usage-based |
| **Google Maps / Places API** | Spott.ca (VIN lookups aside — this is maps/places, business photo backfill) | Usage-based, has a free tier |
| **Twilio** | Bario Dialer, Victoria (4 phone lines) | Number rental (~$1-2/mo/number) + per-minute/SMS usage. **Balance check failed this pass** (401/permissions on the Account SID/Auth Token combo used) — re-check via Twilio console directly |
| **RunPod** | Bario Studio voiceover/video generation | Usage-based (pay-per-second GPU) |
| **Resend** (2 accounts: Bario's own + a dedicated Spott one) | Transactional email | Free tier likely (low volume) |
| **Brevo** | Spott.ca campaign email | Confirmed free plan (300 sends/day) as of 2026-08-05 |
| **Cloudflare** | DNS/zone management for client custom domains | Free tier likely, no paid add-on evidence found |
| **ResellerClub** | Domain reseller platform | Pass-through per-domain cost when a customer buys through Bario, not a flat Bario subscription |
| **Stripe** | Payment processing, both apps | Transaction fees on revenue, not an expense subscription — excluded from the totals above |
| **GitHub** | Both repos | Not checked — likely free/Team, unconfirmed |
| **Sentry** | BARIO error tracking | Not checked — likely free tier |

## What this doesn't include

- Google Workspace / any email service beyond Hostinger's Business Email (if
  one exists, wasn't found in this pass).
- Any personal (non-BARIO-ecosystem) subscriptions.
- Domain/service costs for `neolinq.pro`, `cointecha.com`, `muviis.com`,
  `aryanarkcollection.com`, `ayoshermo.com` beyond what's already folded into
  the Hostinger domain-renewal rows above (all 5 are on the same Hostinger
  account, already counted).

## For the next agent

1. Pull Supabase's actual plan tier for the `tqllzodsdwtsmsdrhwyk` project —
   Management API or dashboard, account `surewinmendoza.ca@gmail.com`.
3. Get a real Vercel usage/invoice number (not just plan config) to see if
   overages are pushing the real Vercel bill above the $20/mo base.
4. Fix the Twilio balance-check 401 (or just check Twilio's console
   directly) to get real current usage costs for the 4 phone lines.
5. Decide whether to let the 8 Hostinger email trials convert or cancel
   before their individual anniversary dates (listed above) — that's
   $169.92/yr of the $1,385.52/yr total, currently costing nothing.
