import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { findCrm, deliverOutreach, deliverReplyResponse } from '@/lib/crmOutreach'
import { logAdminAction } from '@/lib/adminActions'

// Delivers anything scheduled ("send later") whose time has arrived — the
// other half of the scheduling feature in app/api/admin/crm-leadgen/send
// and send-reply, which only ever write scheduled_at/scheduled_response_at,
// never send directly when a schedule is requested. Runs every 5 minutes
// (see vercel.json) so scheduled sends go out reasonably close to their
// requested time.
export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sql = await db()
  const sentOutreach: string[] = []
  const sentReplies: string[] = []
  const errors: string[] = []

  const dueOutreach = (await sql`
    SELECT crm_key, person_id, note_id, scheduled_subject, scheduled_body
    FROM crm_leadgen_drafted
    WHERE scheduled_at IS NOT NULL AND scheduled_at <= now() AND sent_at IS NULL
  `) as unknown as { crm_key: string; person_id: string; note_id: string; scheduled_subject: string | null; scheduled_body: string | null }[]
  for (const row of dueOutreach) {
    const crm = findCrm(row.crm_key)
    if (!crm) continue
    try {
      await deliverOutreach(sql, crm, row.person_id, row.note_id, row.scheduled_subject, row.scheduled_body)
      sentOutreach.push(`${row.crm_key}:${row.person_id}`)
    } catch (err: any) {
      errors.push(`outreach ${row.crm_key}:${row.person_id}: ${err.message}`)
    }
  }

  const dueReplies = (await sql`
    SELECT id, crm_key, from_email, subject, scheduled_response_body, scheduled_response_mode
    FROM crm_outreach_replies
    WHERE scheduled_response_at IS NOT NULL AND scheduled_response_at <= now() AND response_sent_at IS NULL
  `) as unknown as { id: string; crm_key: string; from_email: string; subject: string; scheduled_response_body: string; scheduled_response_mode: 'manual' | 'ai' }[]
  for (const row of dueReplies) {
    const crm = findCrm(row.crm_key)
    if (!crm) continue
    try {
      await deliverReplyResponse(sql, crm, row.id, row.from_email, row.subject, row.scheduled_response_body, row.scheduled_response_mode)
      sentReplies.push(row.id)
    } catch (err: any) {
      errors.push(`reply ${row.id}: ${err.message}`)
    }
  }

  if (sentOutreach.length || sentReplies.length || errors.length) {
    await logAdminAction(sql, {
      action: 'crm-outreach-scheduled-run',
      params: { sentOutreach, sentReplies, errors },
      result: errors.length && !sentOutreach.length && !sentReplies.length ? 'error' : 'ok',
      triggeredBy: 'ai_autonomous',
    })
  }

  return NextResponse.json({ ok: true, sentOutreach, sentReplies, errors })
}
