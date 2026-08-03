import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { findCrm } from '@/lib/crmOutreach'
import { placeClickToCall } from '@/lib/twilio'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Click-to-call trigger — a human explicitly clicks "Call" next to one
// contact; nothing here dials on its own. Rings the business's own staff
// number first, bridges to the lead once answered (see lib/twilio.ts and
// app/api/twilio/click-to-call-connect). Deliberately human-triggered per
// the user's own explicit choice, given the stricter regulatory exposure
// around automated/autodialed outbound calls vs. a real person calling.
export async function POST(req: Request) {
  const adminOrRes = await requireAdmin(req)
  if (adminOrRes instanceof NextResponse) return adminOrRes

  try {
    const body = await req.json().catch(() => null)
    const crmKey = typeof body?.crmKey === 'string' ? body.crmKey : null
    const leadNumber = typeof body?.leadNumber === 'string' ? body.leadNumber.trim() : null
    if (!crmKey || !leadNumber) {
      return NextResponse.json({ error: 'crmKey and leadNumber are required' }, { status: 400 })
    }

    const crm = findCrm(crmKey)
    if (!crm) return NextResponse.json({ error: 'Unknown crmKey' }, { status: 400 })

    const call = await placeClickToCall({
      businessTwilioNumber: crm.twilioNumber,
      staffNumber: crm.forwardToNumber,
      leadNumber,
    })

    await logAdminAction(adminOrRes.sql, { action: 'click-to-call', targetEmail: `${crm.key}:${leadNumber}`, result: 'ok', triggeredBy: 'admin' })

    return NextResponse.json({ ok: true, callSid: call.sid, status: call.status })
  } catch (err: any) {
    return errorResponse(err)
  }
}
