import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { OUTREACH_CRMS } from '@/lib/crmOutreach'
import { errorResponse } from '@/lib/errors'

// Everything currently scheduled ("send later") across both outreach and
// reply responses, for the calendar view in AdminCrmOutreach.
export async function GET(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const items: { crm: string; businessName: string; kind: 'outreach' | 'reply'; id: string; scheduledAt: string; label: string }[] = []

    for (const crm of OUTREACH_CRMS) {
      const outreachRows = (await sql`
        SELECT person_id, scheduled_at FROM crm_leadgen_drafted
        WHERE crm_key = ${crm.key} AND scheduled_at IS NOT NULL AND sent_at IS NULL
      `) as unknown as { person_id: string; scheduled_at: string }[]
      for (const row of outreachRows) {
        items.push({ crm: crm.key, businessName: crm.businessName, kind: 'outreach', id: row.person_id, scheduledAt: row.scheduled_at, label: 'Outreach email' })
      }

      const replyRows = (await sql`
        SELECT id, from_email, scheduled_response_at FROM crm_outreach_replies
        WHERE crm_key = ${crm.key} AND scheduled_response_at IS NOT NULL AND response_sent_at IS NULL
      `) as unknown as { id: string; from_email: string; scheduled_response_at: string }[]
      for (const row of replyRows) {
        items.push({ crm: crm.key, businessName: crm.businessName, kind: 'reply', id: row.id, scheduledAt: row.scheduled_response_at, label: `Reply to ${row.from_email}` })
      }
    }

    items.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    return NextResponse.json({ ok: true, items })
  } catch (err: any) {
    return errorResponse(err)
  }
}
