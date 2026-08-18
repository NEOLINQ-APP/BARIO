import { randomUUID } from 'node:crypto'
import { sendSms } from '@/lib/twilio'

// Aria (app/api/assistant/chat + app/api/assistant/support) files one of
// these whenever a user asks for a refund/credit/policy exception — this
// function does NOT refund anything, it only records the request and pings
// a human. Aria has no tool that can actually approve or process money;
// this is the only refund-adjacent action she can take, on purpose.
export async function fileRefundRequest(
  sql: any,
  opts: {
    userId: string | null
    userName: string | null
    accountEmail: string
    serviceName: string
    reason: string
    attachmentUrl?: string | null
  }
): Promise<{ id: string; smsAlertSent: boolean }> {
  const id = randomUUID()
  await sql`
    INSERT INTO refund_requests (id, user_id, user_name, account_email, service_name, reason, attachment_url)
    VALUES (${id}, ${opts.userId}, ${opts.userName}, ${opts.accountEmail}, ${opts.serviceName}, ${opts.reason}, ${opts.attachmentUrl ?? null})
  `

  const alertNumber = process.env.EXEC_ALERT_PHONE_NUMBER
  let smsAlertSent = false
  if (alertNumber) {
    try {
      const body = `Bario refund request from ${opts.userName || opts.accountEmail} (${opts.accountEmail}) — ${opts.serviceName}: ${opts.reason}`.slice(0, 300)
      await sendSms(alertNumber, body)
      smsAlertSent = true
    } catch (err) {
      // A failed SMS never blocks filing the request — the record in
      // refund_requests is the real durable copy; the text is a
      // best-effort nudge on top of it, not the only place this lives.
      console.error('Failed to send refund-request SMS alert:', err)
    }
  } else {
    console.warn('EXEC_ALERT_PHONE_NUMBER is not set — refund request filed but no SMS alert sent:', id)
  }

  if (smsAlertSent) {
    await sql`UPDATE refund_requests SET sms_alert_sent = true WHERE id = ${id}`
  }

  return { id, smsAlertSent }
}
