import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'

// Chronological email history for one lead (bo_notes rows with kind =
// 'email') -- both outbound sends (1:1 or campaign) and inbound replies
// synced in by /api/cron/crm-email-sync land in the same table, so this is
// just a filtered read, not a separate thread model.
export async function GET(req: Request, { params }: { params: { id: string; customerId: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  const customerRows = (await sql`
    SELECT id, company_name, contact_name, email FROM bo_customers WHERE id = ${params.customerId} AND organization_id = ${params.id}
  `) as unknown as { id: string; company_name: string | null; contact_name: string; email: string | null }[]
  const customer = customerRows[0]
  if (!customer) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const thread = await sql`
    SELECT id, direction, from_email, body, campaign_id, created_at
    FROM bo_notes
    WHERE customer_id = ${params.customerId} AND kind = 'email'
    ORDER BY created_at ASC
  `

  return NextResponse.json({ ok: true, customer, thread })
}
