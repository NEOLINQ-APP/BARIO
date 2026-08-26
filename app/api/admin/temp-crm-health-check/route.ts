import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const orgs = await sql`SELECT count(*)::int AS count FROM bo_organizations`
    const customers = await sql`SELECT count(*)::int AS count FROM bo_customers`
    const notes = await sql`SELECT count(*)::int AS count FROM bo_notes`
    const bills = await sql`SELECT count(*)::int AS count FROM bario_pay_bills`
    const adCampaigns = await sql`SELECT count(*)::int AS count FROM bo_ad_campaigns`
    return NextResponse.json({ ok: true, orgs: orgs[0], customers: customers[0], notes: notes[0], bills: bills[0], adCampaigns: adCampaigns[0] })
  } catch (err: any) {
    return errorResponse(err)
  }
}
