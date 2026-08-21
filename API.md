# Business OS — New API Routes (2026-08-21)

All new routes follow the existing convention: `requireBoModule('key')`
(session-based, module-gated) for org-scoped routes. No new
authentication or authorization mechanism.

| Method | Route | Gate | Purpose |
|---|---|---|---|
| GET | `/api/bario-one/appointments` | `crm` | List appointments, optional `?status=` filter |
| POST | `/api/bario-one/appointments` | `crm` | Create an appointment; fires `appointment.booked` (webhook + automation) |
| PATCH | `/api/bario-one/appointments/[id]` | `crm` | Update an appointment; fires `appointment.completed` on that specific transition |
| DELETE | `/api/bario-one/appointments/[id]` | `crm` | Delete an appointment |
| GET | `/api/bario-one/automations/runs` | `crm` | Last 100 automation runs for the org (joins `bo_automation_runs` → `bo_automations`) |
| GET | `/api/bario-one/dashboard/summary` | membership only (no module gate — always renders something) | The 8 real Business OS dashboard metrics |

## Changed existing routes

- `GET /api/bario-one/crm/customers` — new optional `?stage=contact\|lead\|customer` filter, additive (absent param = unchanged behavior)
- `POST /api/bario-one/crm/customers` — now also fires `lead.created`; calls `recalculateLifecycleStage()`
- `PATCH /api/bario-one/crm/customers/[id]` — now also fires `lead.updated`; calls `recalculateLifecycleStage()`
- `PATCH /api/bario-one/crm/deals/[id]` — now also fires `deal.won` when a deal's stage transitions to `won`; calls `recalculateLifecycleStage()`

## New/changed library functions (not routes, but the real logic)

- `lib/customerLifecycle.ts` — `recalculateLifecycleStage(sql, orgId, customerId)`
- `lib/leadAttribution.ts` — `recordLeadSource(sql, customerId, touch)`
- `lib/spottIntegration.ts` — `linkOrCreateContactFromSpottLead(sql, orgId, spottLead)` (real, not yet auto-invoked — no live Spott sync)
- `lib/barioOnePermissions.ts` — `hasPermission(role, permission)`
