# Business OS — Phases

## Phase 1 (2026-08-21) — done, this document's scope

Nav restructure (12 sections, ~32 new page files, most linking to
already-existing pages rather than duplicating them), shared identity
model (`lifecycle_stage` on the existing `bo_customers` row), Marketing
and Spott database foundations (schema only, no live integration), a
real unified lead-attribution model (extended `lead_sources`), event
coverage for the new domains (extended the existing webhook/automation
type unions, real call sites for the ones with real triggers), a
permissions layer over the existing role system, a real Business OS
dashboard (8 live-queried metrics), and this documentation set.

**Stopped here deliberately** — no automatic continuation into Spott,
Marketing, AI, or ad-platform (Google/Meta) work, per explicit
instruction.

## Phase 2 (not started) — candidates surfaced by Phase 1

Every "Coming in Phase 2" page names what it's waiting on. In rough
priority order based on what Phase 1 found:

1. **Live Spott sync** — the biggest single item. `spott_listings`/
   `spott_leads`/`spott_reviews` tables and
   `linkOrCreateContactFromSpottLead()` are ready to receive real data;
   nothing exists yet to actually connect to Spott.ca (a separate
   product/Supabase project) and pull it in.
2. **Multi-channel campaigns** — `marketing_campaigns` schema exists;
   needs a real send/audience-targeting UI spanning email + SMS +
   promotions, not just today's single-channel email blast.
3. **A real calendar view** for Appointments (today: list-only), plus
   Services and Staff scheduling concepts.
4. **Cross-module event chaining** — the real architectural gap Phase 1
   surfaced and didn't solve: `triggerWebhooks()`/`runAutomations()`
   can't do "X in one module → automatically create Y in another module."
   Needed before Spott-lead-converts-to-CRM-deal-style automation is
   possible without a third mechanism.
5. **AI Sales/Marketing/Content agents surfaced to customers** — the
   backends (ATLAS/CLOSER/SCOUT, campaign personalization) already run
   internally; Phase 2 would build the customer-facing UI on top.
6. Everything else marked "Coming in Phase 2" on its own page: SMS,
   Promotions, Coupons, Referrals, Reviews, QR Codes, Landing Pages,
   Forms, Marketing/Sales-services catalog, ROI reporting, automation
   templates, security settings.

Not designed in detail — each deserves its own gap-check before
starting, same convention this whole initiative has followed.
