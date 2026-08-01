import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { findCrm, deliverOutreach } from '@/lib/crmOutreach'
import { errorResponse } from '@/lib/errors'

// Explicit, human-triggered send for one drafted outreach note — the only
// place an actual email leaves the building (immediately here, or later via
// app/api/cron/crm-outreach-scheduled if scheduledAt is passed). Refuses to
// re-send/re-schedule anything already marked sent_at.
export async function POST(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const { crmKey, personId, subject, body, scheduledAt } = await req.json()
    const crm = findCrm(crmKey)
    if (!crm) return NextResponse.json({ error: 'Unknown crmKey' }, { status: 400 })

    const rows = (await sql`
      SELECT note_id, sent_at FROM crm_leadgen_drafted WHERE crm_key = ${crmKey} AND person_id = ${personId}
    `) as unknown as { note_id: string | null; sent_at: string | null }[]
    const draft = rows[0]
    if (!draft || !draft.note_id) return NextResponse.json({ error: 'No draft found for this contact' }, { status: 404 })
    if (draft.sent_at) return NextResponse.json({ error: 'Already sent' }, { status: 409 })

    if (scheduledAt) {
      const when = new Date(scheduledAt)
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'scheduledAt must be a valid future date/time' }, { status: 400 })
      }
      await sql`
        UPDATE crm_leadgen_drafted
        SET scheduled_at = ${when.toISOString()}, scheduled_subject = ${subject ?? null}, scheduled_body = ${body ?? null}
        WHERE crm_key = ${crmKey} AND person_id = ${personId}
      `
      return NextResponse.json({ ok: true, scheduled: true, scheduledAt: when.toISOString() })
    }

    try {
      const sendResult = await deliverOutreach(sql, crm, personId, draft.note_id, subject, body)
      return NextResponse.json({ ok: true, messageId: sendResult.messageId })
    } catch (deliverErr: any) {
      // deliverOutreach only ever throws expected, user-actionable messages
      // (unfilled placeholder, missing email, etc.) — safe to show directly,
      // unlike an unexpected internal error.
      return NextResponse.json({ error: deliverErr.message }, { status: 400 })
    }
  } catch (err: any) {
    return errorResponse(err)
  }
}
