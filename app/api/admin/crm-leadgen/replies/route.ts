import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { OUTREACH_CRMS } from '@/lib/crmOutreach'
import { errorResponse } from '@/lib/errors'

// Lists inbound replies that haven't been answered yet, for AdminCrmOutreach
// to render alongside the outbound drafts.
export async function GET(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const results = []
    for (const crm of OUTREACH_CRMS) {
      const rows = await sql`
        SELECT id, person_id, from_email, subject, body, received_at, sentiment
        FROM crm_outreach_replies
        WHERE crm_key = ${crm.key} AND response_sent_at IS NULL
        ORDER BY received_at DESC
      `
      results.push({ crm: crm.key, businessName: crm.businessName, replies: rows })
    }
    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return errorResponse(err)
  }
}
