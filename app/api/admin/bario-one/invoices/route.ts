import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Support-side lookup across ALL organizations' invoices — the customer-
// facing routes (app/api/bario-one/crm/invoices/*) are correctly org-scoped
// to whoever's logged in, so there's no way to find/clean up a specific
// invoice without that org's own session. Mirrors the existing
// admin/bario-one/organizations/[id]/modules override pattern.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  const search = new URL(req.url).searchParams.get('search') ?? ''
  const rows = search
    ? await sql`
        SELECT i.id, i.number, i.status, i.created_at, i.organization_id, o.name AS organization_name, c.company_name, c.contact_name
        FROM bo_invoices i
        JOIN bo_organizations o ON o.id = i.organization_id
        LEFT JOIN bo_customers c ON c.id = i.customer_id
        WHERE c.company_name ILIKE ${'%' + search + '%'} OR c.contact_name ILIKE ${'%' + search + '%'} OR i.number ILIKE ${'%' + search + '%'}
        ORDER BY i.created_at DESC
        LIMIT 50
      `
    : await sql`
        SELECT i.id, i.number, i.status, i.created_at, i.organization_id, o.name AS organization_name, c.company_name, c.contact_name
        FROM bo_invoices i
        JOIN bo_organizations o ON o.id = i.organization_id
        LEFT JOIN bo_customers c ON c.id = i.customer_id
        ORDER BY i.created_at DESC
        LIMIT 50
      `
  return NextResponse.json({ ok: true, invoices: rows })
}
