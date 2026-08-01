import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { findCrm } from '@/lib/crmOutreach'
import { sendOutreachEmail } from '@/lib/mailSend'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Sends a response to an inbound reply — mode is 'manual' or 'ai' purely
// for record-keeping (what the admin picked in AdminCrmOutreach); the actual
// text sent is always whatever's in `body` (an AI draft the admin approved,
// or something they typed themselves). Never sends without this explicit
// call.
export async function POST(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const { replyId, body, mode } = await req.json()
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
    const smtpUser = process.env[crm.smtpUserEnvVar]
    const smtpPass = process.env[crm.smtpPassEnvVar]
    if (!smtpUser || !smtpPass) return NextResponse.json({ error: `${crm.smtpUserEnvVar}/${crm.smtpPassEnvVar} not configured` }, { status: 500 })

    const subject = reply.subject?.toLowerCase().startsWith('re:') ? reply.subject : `Re: ${reply.subject || 'your message'}`
    const sendResult = await sendOutreachEmail({
      smtpUser,
      smtpPass,
      from: crm.fromAddress,
      to: reply.from_email,
      subject,
      text: body,
    })

    await sql`
      UPDATE crm_outreach_replies SET response_mode = ${mode}, response_body = ${body}, response_sent_at = now() WHERE id = ${replyId}
    `
    await logAdminAction(sql, {
      action: 'crm-outreach-reply-sent',
      params: { crmKey: reply.crm_key, replyId, to: reply.from_email, mode, messageId: sendResult.messageId },
      result: 'ok',
      triggeredBy: 'admin',
    })

    return NextResponse.json({ ok: true, messageId: sendResult.messageId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
