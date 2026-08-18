import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const requests = await sql`
      SELECT id, user_id, user_name, account_email, service_name, reason, attachment_url, status, sms_alert_sent, created_at
      FROM refund_requests ORDER BY created_at DESC LIMIT 100
    `
    return NextResponse.json({ requests })
  } catch (err: any) {
    return errorResponse(err)
  }
}
