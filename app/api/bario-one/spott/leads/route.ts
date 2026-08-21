import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'
import type { SpottLead } from '@/lib/db'

// Reads BARIO's own spott_leads cache (populated by the webhook receiver)
// rather than calling Spott live — this is what makes the CRM contact
// timeline/lead list fast and independent of Spott's uptime. See
// GET /api/public/crm/leads on Spott's side for the reconciliation pull
// that keeps this cache honest if a webhook was ever missed.
export async function GET() {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`
      SELECT l.*, c.contact_name AS customer_contact_name
      FROM spott_leads l
      LEFT JOIN bo_customers c ON c.id = l.customer_id
      WHERE l.organization_id = ${org.id}
      ORDER BY l.created_at DESC
      LIMIT 200
    `) as unknown as (SpottLead & { customer_contact_name: string | null })[]

    return NextResponse.json({ leads: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}
