# Business OS — Database Changes (2026-08-21)

Additive only, `IF NOT EXISTS` throughout, matching `lib/db.ts`'s
established schema-as-code convention. Not a full schema dump — see
`BARIO_CHECKPOINTS/schema-snapshot-2026-08-21.ts.txt` for the pre-change
baseline, and `lib/db.ts`'s `ensureSchema()` for the live source of
truth. `CURRENT_SCHEMA_VERSION` bumped twice this session
(`v8-2026-08-21-business-os` for the nav/lifecycle pass,
`v9-2026-08-21-business-os-steps3-15` for everything below) — this is
the mechanism that actually runs these migrations; forgetting to bump it
was a real bug caught and fixed earlier the same night.

## `bo_customers` — new columns

| Column | Type | Purpose |
|---|---|---|
| `lifecycle_stage` | TEXT, nullable | `'contact' \| 'lead' \| 'customer'` — the same identity row's stage, not a separate table. Written by `lib/customerLifecycle.ts`. |
| `external_source` | TEXT, nullable | Future integration anchor (e.g. `'spott'`). Unused today. |
| `external_ref_id` | TEXT, nullable | Paired with `external_source`, unique per org when both set. |

## `bo_notes` — new column

| Column | Type | Purpose |
|---|---|---|
| `metadata_json` | TEXT, default `'{}'` | Structured fields for the 5 new `kind` values below that a plain `body` string doesn't fit (rating/URL, page/referrer, session id). |

`kind` widened (free-text column, no CHECK constraint — matches this
schema's existing convention) to add: `spott_activity`, `referral`,
`review`, `website_visit`, `ai_conversation`.

## `bo_appointments` — new table

New (nothing modeled appointments before this). Sibling shape to
`bo_tasks` plus a real time range and location:
`id, organization_id, customer_id, deal_id, assigned_to_user_id, title,
location, starts_at, ends_at, status, notes, created_by_user_id,
created_at, updated_at`. `status`: `scheduled | completed | canceled |
no_show`.

## `lead_sources` — new columns

Extended, not duplicated (was built earlier, confirmed unused via grep
before extending):

| Column | Type |
|---|---|
| `creative` | TEXT, nullable |
| `landing_page` | TEXT, nullable |
| `referrer` | TEXT, nullable |

`source` vocabulary (app-level, `LEAD_SOURCE_VALUES` in `lib/db.ts`):
`spott, website, landing_page, email, sms, referral, qr_code, organic,
google, facebook, instagram, direct, manual, ai`.

## Marketing foundation — 4 new tables

All carry `organization_id` (tenant scoping). Schema only this pass — no
UI writes to these yet.

- **`marketing_campaigns`**: `id, organization_id, name, channel, status,
  audience_filter_json, created_by_user_id, created_at, updated_at`
- **`marketing_events`**: `id, organization_id, campaign_id, customer_id,
  event_type, payload_json, occurred_at`
- **`marketing_audiences`**: `id, organization_id, name, filter_json,
  created_at`
- **`marketing_assets`**: `id, organization_id, asset_type, url, name,
  created_at`

## Spott foundation — 5 new tables

- **`spott_categories`**: `id, name, created_at` — deliberately **not**
  tenant-scoped (shared taxonomy).
- **`spott_listings`**: `id, organization_id, category_id,
  external_spott_id, name, status, created_at, updated_at`
- **`spott_promotions`**: `id, organization_id, listing_id, title,
  status, created_at`
- **`spott_leads`**: `id, organization_id, listing_id, customer_id,
  contact_name, phone, email, message, created_at` — `customer_id` is
  the real point: every Spott lead can attach to an existing
  `bo_customers` row or create one (`lib/spottIntegration.ts`).
- **`spott_reviews`**: `id, organization_id, listing_id, customer_id,
  rating, body, created_at`

## Event type unions widened (`lib/db.ts`)

- `BoWebhookEvent`: `+ lead.created, lead.updated, appointment.booked,
  appointment.completed, deal.won, spott.lead_created,
  spott.offer_claimed, review.created, referral.converted,
  campaign.launched, campaign.paused`
- `BoAutomationTrigger`: `+ appointment.booked, appointment.completed`
