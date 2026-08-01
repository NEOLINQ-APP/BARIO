import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { OUTREACH_CRMS } from '@/lib/crmOutreach'
import { errorResponse } from '@/lib/errors'

// Per-business counts for the admin outreach dashboard — how many drafted,
// how many actually sent, how many got a reply, how many replies still need
// a response. Pure read, no CRM calls (everything needed lives in Bario's
// own tracking tables already).
export async function GET(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const results = []
    for (const crm of OUTREACH_CRMS) {
      const [draftedRows, sentRows, repliedRows, unansweredRows] = await Promise.all([
        sql`SELECT COUNT(*)::int AS n FROM crm_leadgen_drafted WHERE crm_key = ${crm.key}`,
        sql`SELECT COUNT(*)::int AS n FROM crm_leadgen_drafted WHERE crm_key = ${crm.key} AND sent_at IS NOT NULL`,
        sql`SELECT COUNT(*)::int AS n FROM crm_outreach_replies WHERE crm_key = ${crm.key}`,
        sql`SELECT COUNT(*)::int AS n FROM crm_outreach_replies WHERE crm_key = ${crm.key} AND response_sent_at IS NULL`,
      ])
      results.push({
        crm: crm.key,
        businessName: crm.businessName,
        drafted: draftedRows[0].n,
        sent: sentRows[0].n,
        replied: repliedRows[0].n,
        unanswered: unansweredRows[0].n,
      })
    }
    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return errorResponse(err)
  }
}
