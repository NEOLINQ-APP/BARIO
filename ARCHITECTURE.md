# Bario One — Business OS Architecture

This documents the Business OS module structure added 2026-08-21 —
nav restructure + shared data model, Phases covered by the two Business
OS planning passes that night. See `TODO.md`/`ADMIN_GUIDE.md` for
general BARIO project context; this file is specific to the Business OS
initiative inside Bario One.

## Scope boundary

"Business OS" is the customer-facing product area at
`/dashboard/bario-one/*` — it does **not** touch the account-wide
sidebar (`components/AccountSidebar.tsx`, covering Websites/Domains/
Hosting/Media) or the separate, older `/dashboard/crm` product. Both
are explicitly out of scope and untouched.

## Nav structure

`lib/barioOneNav.ts` defines a 2-level nav: 12 sections (Dashboard, CRM,
Sales, Marketing, Spott, AI, Website, Appointments, Finance, Analytics,
Automations, Settings), each with leaf items carrying a `status: 'real'
| 'comingSoon'`. Rendered by `components/BarioOneSecondaryNav.tsx`
(accordion, entitlement-aware) inside a new `app/(account)/dashboard/
bario-one/layout.tsx` — scoped to this route segment only.

`comingSoon` leaves render `components/BarioOneComingSoon.tsx` — one
shared, honest "Coming in Phase X" shell. No leaf is ever a placeholder
with fake buttons.

### Real vs. Coming Soon, by section

| Section | Real this pass | Coming Soon |
|---|---|---|
| CRM | Contacts, Leads, Customers, Deals, Pipelines, Tasks | — |
| Sales | Opportunities, Quotes, Products | Services |
| Marketing | Marketing Hub, Email, SEO | Campaigns, SMS, Promotions, Coupons, Referrals, Reviews, QR Codes |
| Spott | — | My Listing, Marketplace, Leads, Promotions, Reviews, Analytics |
| AI | AI Assistant, AI Receptionist | AI Sales Agent, AI Marketing Agent, AI Content |
| Website | Website, Pages, Domains | Landing Pages, Forms |
| Appointments | Booking | Calendar, Services, Staff |
| Finance | Invoices, Payments, Expenses | — |
| Analytics | Business Analytics, Sales Analytics | Marketing Analytics, ROI |
| Automations | Workflows, Runs | Templates |
| Settings | Business, Team, Integrations, Billing | Security |

Most "Real" leaves link to already-existing pages rather than
duplicating them (Contacts/Leads/Customers all share the existing CRM
list page with a `?stage=` filter; Deals/Pipelines/Tasks link directly
to the existing pipeline/tasks pages; Finance/Settings items link to
existing invoicing/payments/company/team pages). Only 6 new "real" page
files were needed: `sales/opportunities`, `sales/quotes`,
`sales/products`, `marketing/seo` (all thin link-out shells) and
`automations/runs` (a real new feature — see below).

## Shared identity model

`bo_customers` is the single identity anchor per organization — there
is no separate Contact/Lead/Customer table. `lifecycle_stage`
(`'contact' | 'lead' | 'customer'`, see `lib/customerLifecycle.ts`) makes
that lifecycle explicit on the same row instead of inferring it from
tags/priority/deal existence. This is what actually prevents "a Spott
customer, a CRM customer, and a marketing customer" from ever being
different people — they're the same `bo_customers` row throughout.

`bo_customers.external_source`/`external_ref_id` are a future
integration anchor (e.g. for Spott) — unused today, no live sync exists.

## Marketing & Spott foundations

Schema-only this pass, per explicit scope: `marketing_campaigns`,
`marketing_events`, `marketing_audiences`, `marketing_assets` and
`spott_categories`, `spott_listings`, `spott_promotions`, `spott_leads`,
`spott_reviews` all exist in the database (see `DATABASE.md`) with real
TypeScript types, but no UI writes to them yet beyond the honest
"Coming in Phase 2" pages. `lib/spottIntegration.ts`'s
`linkOrCreateContactFromSpottLead()` is real, tested-shape, callable
architecture for "every Spott lead can attach to an existing CRM contact
or create a new one" — nothing invokes it automatically since there's no
live Spott sync.

## Attribution

`lead_sources` (built earlier, previously unused — confirmed via grep
before extending it) is the real multi-touch attribution table, not a
new `marketing_attribution` table, per the explicit "do not duplicate
existing attribution" instruction. `lib/leadAttribution.ts`'s
`recordLeadSource()` is the one write path. `bo_customers.source` (the
flat single-value cache from earlier work) is untouched.

## Events

Two existing, narrow mechanisms — extended, not replaced:

- `triggerWebhooks()` (`lib/barioOneWebhooks.ts`) — external, HMAC-signed,
  delivery-logged. `BoWebhookEvent` widened with `lead.created`,
  `lead.updated`, `appointment.booked`, `appointment.completed`,
  `deal.won` (real call sites this pass) plus `spott.lead_created`,
  `spott.offer_claimed`, `review.created`, `referral.converted`,
  `campaign.launched`, `campaign.paused` (type-only — no live trigger yet,
  since nothing creates a real Spott lead or campaign send today).
- `runAutomations()` (`lib/barioOneAutomations.ts`) — internal, pre-defined
  action types only. `BoAutomationTrigger` widened with
  `appointment.booked`/`appointment.completed`.

**Known limitation**: neither mechanism supports cross-module internal
chaining (e.g. "Spott lead converts → auto-create a CRM deal").
Automations only run pre-defined action types against the same org's
data, not arbitrary cross-module writes. Not solved this pass — flagged
as a real gap for whoever builds live Spott sync.

## Permissions

`lib/barioOnePermissions.ts` — `hasPermission(role, permission)`, a pure
function over the *existing* `bo_memberships.role`, not a new table.
Owner/admin get every new permission; employees get `.view`/`.create`
only. No existing role storage or resolution changed. **Honesty note**:
this is defined, correct, and ready — not yet wired into every new page
as an additional check beyond the existing module gate (which already
governs access). Treat it as prepared infrastructure for finer-grained
UI decisions later, not as already-enforced everywhere.

## Dashboard

`app/api/bario-one/dashboard/summary/route.ts` — 8 real aggregate
queries (Revenue, New Leads, Customers, Upcoming Appointments, Open
Deals, Spott Leads, Marketing Leads, Conversion Rate). Genuinely-empty
data (Spott Leads, Marketing Leads today) renders as `0`, never
fabricated.
