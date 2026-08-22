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

### Hetzner Cloud (3 servers)
Pulled via `GET /v1/servers` + `GET /v1/pricing` with `HETZNER_API_TOKEN`.

| Server | Type | Monthly | Created | Notes |
|---|---|---|---|---|
| `sandbox-host-us.bario.ca` | cpx31 | $20.49 | 2026-08-01 | Bario Build's code-sandbox host (`SANDBOX_HOST_URL`) |
| `srv-90f87f7776.vps.bario.ca` | cx33 | $9.99 | 2026-08-06 | not yet identified against CLAUDE.md's named VPS list — verify which box this is |
| `srv-e1c44e8a4b.vps.bario.ca` | cx43 | $18.49 | 2026-08-08 | matches CLAUDE.md's "Hetzner replacement VPS", `46.224.28.213`, MinIO/storage.bario.ca |

**Total: $48.97/mo**

⚠️ **Open question, not resolved this pass**: CLAUDE.md separately describes
a "Mail reseller VPS" (`148.230.94.192`, `reseller.bario.ca`, Mailcow) that
doesn't obviously match any of the 3 Hetzner servers above by IP, and isn't
one of the 2 Hostinger KVMs either (those are named "KVM 4"/"KVM 2", not
tied to an IP in the subscription pull). **Next agent: confirm which
provider actually bills the mail VPS** — either it's a 3rd, so-far-uncounted
Hostinger VPS product not surfaced by the subscriptions endpoint, or it's on
a provider not checked this pass.

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

1. Resolve the mail-VPS provider mismatch flagged above.
2. Pull Supabase's actual plan tier for the `tqllzodsdwtsmsdrhwyk` project —
   Management API or dashboard, account `surewinmendoza.ca@gmail.com`.
3. Get a real Vercel usage/invoice number (not just plan config) to see if
   overages are pushing the real Vercel bill above the $20/mo base.
4. Fix the Twilio balance-check 401 (or just check Twilio's console
   directly) to get real current usage costs for the 4 phone lines.
5. Decide whether to let the 8 Hostinger email trials convert or cancel
   before their individual anniversary dates (listed above) — that's
   $169.92/yr of the $1,385.52/yr total, currently costing nothing.
