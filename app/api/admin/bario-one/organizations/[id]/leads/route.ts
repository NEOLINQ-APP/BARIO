import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import type { BoCustomer } from '@/lib/db'

// Full lead/customer list for the admin panel's CRM view -- the existing
// import-crm GET only returns a 5-row sample (it was built for a quick
// post-migration spot-check, not a real list view). No pagination yet;
// fine at the scale a house account's own CRM runs at today.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  const customers = (await sql`
    SELECT c.*, count(n.id) FILTER (WHERE n.kind = 'email')::int AS email_count
    FROM bo_customers c
    LEFT JOIN bo_notes n ON n.customer_id = c.id
    WHERE c.organization_id = ${params.id}
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `) as unknown as (BoCustomer & { email_count: number })[]

  return NextResponse.json({ ok: true, customers })
}
