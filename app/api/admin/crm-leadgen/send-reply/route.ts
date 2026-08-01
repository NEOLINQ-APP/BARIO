import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { findCrm, deliverReplyResponse } from '@/lib/crmOutreach'
import { errorResponse } from '@/lib/errors'

// Sends (or schedules) a response to an inbound reply. mode is 'manual' or
// 'ai' purely for record-keeping; the text sent is always whatever's in
// `body`, reviewed by the admin either way.
export async function POST(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const { replyId, body, mode, scheduledAt } = await req.json()
    if (!body?.trim()) return NextResponse.json({ error: 'Response body is required' }, { status: 400 })
    if (mode !== 'manual' && mode !== 'ai') return NextResponse.json({ error: 'mode must be "manual" or "ai"' }, { status: 400 })

    const rows = (await sql`
      SELECT crm_key, from_email, subject, response_sent_at FROM crm_outreach_replies WHERE id = ${replyId}
    `) as unknown as { crm_key: string; from_email: string; subject: string; response_sent_at: string | null }[]
    const reply = rows[0]
    if (!reply) return NextResponse.json({ error: 'Reply not found' }, { status: 404 })
    if (reply.response_sent_at) return NextResponse.json({ error: 'Already responded' }, { status: 409 })

    const crm = findCrm(reply.crm_key)
    if (!crm) return NextResponse.json({ error: 'Unknown crmKey' }, { status: 400 })

    if (scheduledAt) {
      const when = new Date(scheduledAt)
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'scheduledAt must be a valid future date/time' }, { status: 400 })
      }
      await sql`
        UPDATE crm_outreach_replies
        SET scheduled_response_at = ${when.toISOString()}, scheduled_response_body = ${body}, scheduled_response_mode = ${mode}
        WHERE id = ${replyId}
      `
      return NextResponse.json({ ok: true, scheduled: true, scheduledAt: when.toISOString() })
    }

    const sendResult = await deliverReplyResponse(sql, crm, replyId, reply.from_email, reply.subject, body, mode)
    return NextResponse.json({ ok: true, messageId: sendResult.messageId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
