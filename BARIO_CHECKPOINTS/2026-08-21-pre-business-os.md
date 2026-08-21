# Pre-Business-OS checkpoint — 2026-08-21

Recorded before starting the Business OS navigation restructure + shared
data model work. If anything about that work needs to be diffed against
or rolled back to, this is the baseline.

## Git

- Checkpoint branch: `checkpoint-pre-business-os-2026-08-21`, pointing at
  `main`'s tip as of this checkpoint: `d4e4c41` — "Give Victoria's app a
  generate_leads tool for Bario's house CRMs"
- `main` was healthy at this commit: `npx tsc --noEmit` clean, `npx next
  build` succeeded, all live checks below passed.

## Tests

**No automated test suite exists in this project** — `package.json` has no
`test` script (`dev`/`build`/`start`/`lint` only). Matches this repo's
documented convention (CLAUDE.md: "this project doesn't have a staging
environment") — verification has always meant real production checks
against the actual deployed API, not a test runner. Not something this
checkpoint can run; noted honestly rather than skipped silently.

## Database schema

- Full schema-as-code snapshotted to `schema-snapshot-2026-08-21.ts`
  (copy of `lib/db.ts` at checkpoint time — this file, not a separate
  migration system, is the source of truth in this codebase).
- Table inventory: `table-list-2026-08-21.txt` — **108 tables**.

## Routes

- `api-routes-2026-08-21.txt` — **394** API route files (`app/api/**/route.ts`).
- `pages-2026-08-21.txt` — **117** page files (`app/**/page.tsx`).

## Environment variables

- `env-var-names-2026-08-21.txt` — **140** production env var names (Vercel,
  `neolinq-apps-projects/bario`). Names only, no values — several
  (`BARIO_ADMIN_API_KEY`, `DATABASE_URL`/`POSTGRES_URL`, etc.) are marked
  Sensitive and cannot be read back via CLI, by design.

## Live confirmation (production, bario.ca)

| Check | Result |
|---|---|
| `/login` | 200 |
| `/signup` | 200 |
| `/` (homepage) | 200 |
| `/api/bario-one/organization` (tenants) | 401 (correctly gated, not crashed) |
| `/api/bario-one/crm/customers` (CRM) | 401 (correctly gated, not crashed) |
| `/api/bario-one/crm/reports/summary` | 401 (correctly gated, not crashed) |
| `/api/bario-one/v1/invoices` (billing) | 401 (correctly gated, not crashed) |
| `afclogistics.ca` (hosted client site) | 200 |
| `sunbuiltgroup.com` (hosted client site) | 200 |

Login, tenants, CRM, and billing all confirmed live and correctly
gated — no 500s, no regressions, at checkpoint time.
